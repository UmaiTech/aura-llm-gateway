#!/usr/bin/env python3
"""Synthetic training traces for the auto router.

Generates realistic requests at controlled difficulty with cheap models,
verifies their shape against the gateway's own feature extractor, labels
them with a tier ladder graded by the gateway's judge, and ingests the
result as `source = synthetic` gold rows that `train.py` and
`train_cost.py` can use. Design: docs/internal/auto-router-synthetic-traces-plan.md.

Every model call goes through the gateway with the `x-aura-synthetic`
header, so the runs are metered like any tenant but excluded from stats,
rewards, arm statistics and live gold sampling. Pure standard library.

Subcommands (run in this order):

    profile   fetch GET /admin/routing/feature-profile to calibrate specs
    generate  write request bodies (+ features) to a JSONL file
    label     run the ladder and the judge, write labelled rows (+ cost rows)
    ingest    POST labelled rows to /admin/routing/gold/synthetic
    report    summarise a labelled file

Examples:

    export AURA_GATEWAY=http://localhost:8080 AURA_SYNTH_KEY=aura_... AURA_ADMIN_KEY=...
    python3 synth.py profile --out profile.json
    python3 synth.py generate --n 300 --profile profile.json --out requests.jsonl --budget-usd 2
    python3 synth.py label --input requests.jsonl --out labelled.jsonl --cost-rows cost_rows.jsonl --budget-usd 20
    python3 synth.py ingest --input labelled.jsonl --batch-id 2026-09-08a
    python3 synth.py report --input labelled.jsonl
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict

TIERS = ["simple", "medium", "complex", "reasoning"]
SYNTHETIC_HEADER = "x-aura-synthetic"
DEFAULT_GENERATORS = "gpt-5.6-luna:0.7,claude-haiku-4-5:0.3"

# --------------------------------------------------------------------------
# taxonomy
# --------------------------------------------------------------------------

LEVEL_RUBRIC = {
    1: "L1 / simple: one fact, one short rewrite or translation, a greeting, a yes/no; no reasoning chain; a small model answers it correctly.",
    2: "L2 / medium: everyday assistant work; light code (a function, a regex, a SQL query); a tool call with obvious arguments; two or three steps.",
    3: "L3 / complex: multi-step engineering or analysis; debugging with a stack trace and code; long inputs to reconcile; several constraints to satisfy at once.",
    4: "L4 / reasoning: proofs, derivations, tricky logic puzzles, ambiguous specs that need careful decomposition, explicit requests to think hard.",
}

FAMILIES = {
    "qa": "general question answering (facts, explanations, how-to)",
    "writing": "writing, rewriting, editing, translating or summarising short text",
    "coding": "programming: write, fix, refactor or explain code (include real code in the request)",
    "data": "data and analysis: tables, CSV snippets, numbers to interpret, spreadsheet logic",
    "math": "mathematics and logic: arithmetic, algebra, probability, proofs, puzzles",
    "agentic": "agentic tool use: the user wants something done with tools (search, calculator, calendar, CRUD API)",
    "extraction": "extraction or classification into a strict JSON schema from messy text",
    "longdoc": "summarising or answering questions about a long document pasted into the request",
    "chitchat": "casual conversation, opinions, small talk, recommendations",
    "planning": "planning and multi-step instructions: itineraries, project plans, checklists",
}

# Weight, and whether the generator must include tools / prior turns.
SHAPES = {
    "single_turn": {"weight": 0.45},
    "multi_turn": {"weight": 0.20, "hint": "include 2 to 5 earlier user/assistant turns before the final user message"},
    "tools_declared": {"weight": 0.12, "hint": "declare 1 to 4 function tools relevant to the task (JSON schema parameters); the final user message should plausibly need one"},
    "tool_loop": {"weight": 0.08, "hint": "declare 1 to 3 function tools; the request is the SECOND turn of a tool loop, so the input must contain the assistant's function_call item and a function_call_output item with a realistic tool result, then no further user text"},
    "long_context": {"weight": 0.10, "hint": "paste a realistic document of the requested length (a spec, a log, a contract, a transcript) into the request"},
    "intent_hint": {"weight": 0.05, "hint": "the user states how much effort they want: either 'quick answer, no explanation' style or 'think step by step / be thorough' style"},
}

TOOL_LIBRARY = [
    {"name": "web_search", "description": "Search the web", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}},
    {"name": "calculate", "description": "Evaluate an arithmetic expression", "parameters": {"type": "object", "properties": {"expression": {"type": "string"}}, "required": ["expression"]}},
    {"name": "get_weather", "description": "Current weather for a city", "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}},
    {"name": "create_calendar_event", "description": "Create a calendar event", "parameters": {"type": "object", "properties": {"title": {"type": "string"}, "start": {"type": "string"}, "end": {"type": "string"}}, "required": ["title", "start"]}},
    {"name": "lookup_order", "description": "Fetch an order by id", "parameters": {"type": "object", "properties": {"order_id": {"type": "string"}}, "required": ["order_id"]}},
    {"name": "run_sql", "description": "Run a read-only SQL query", "parameters": {"type": "object", "properties": {"sql": {"type": "string"}}, "required": ["sql"]}},
]

LANGUAGES = ["English", "English", "English", "English", "Spanish", "German", "French", "Portuguese", "Japanese", "Swedish"]

# Target input tokens per level when no profile is given: (low, high).
DEFAULT_TOKEN_BANDS = {1: (8, 80), 2: (40, 400), 3: (200, 2500), 4: (60, 1500)}


# --------------------------------------------------------------------------
# gateway client
# --------------------------------------------------------------------------

class Gateway:
    def __init__(self, base: str, api_key: str, admin_key: str, timeout: int = 120):
        self.base = base.rstrip("/")
        self.api_key = api_key
        self.admin_key = admin_key
        self.timeout = timeout
        self.spent_usd = 0.0
        self.calls = 0
        self._models = None

    def _request(self, path: str, body=None, method="POST", admin=False, headers=None):
        hdrs = {"content-type": "application/json", SYNTHETIC_HEADER: "1"}
        hdrs["authorization"] = f"Bearer {self.admin_key if admin else self.api_key}"
        if headers:
            hdrs.update(headers)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=hdrs)
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    self.calls += 1
                    return json.load(resp)
            except urllib.error.HTTPError as e:
                text = e.read().decode(errors="replace")[:500]
                if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                    time.sleep(2 ** attempt)
                    continue
                raise RuntimeError(f"{method} {path} -> {e.code}: {text}") from None
            except (urllib.error.URLError, TimeoutError) as e:
                if attempt < 3:
                    time.sleep(2 ** attempt)
                    continue
                raise RuntimeError(f"{method} {path} failed: {e}") from None

    # ---- catalog ----
    def models(self):
        if self._models is None:
            self._models = self._request("/v1/models", method="GET")
        return self._models

    def prices(self):
        out = {}
        for m in self.models().get("data", []):
            a = m.get("aura", {})
            if a.get("input_per_million") is not None and a.get("output_per_million") is not None:
                out[m["id"]] = (a["input_per_million"], a["output_per_million"])
        return out

    def tiers(self):
        auto = self.models().get("auto") or {}
        return {t: list((auto.get("tiers") or {}).get(t, [])) for t in TIERS}

    def cheapest(self, tier: str):
        prices = self.prices()
        cands = self.tiers().get(tier, [])
        if not cands:
            return None
        def blended(m):
            p = prices.get(m)
            return (p[0] + p[1]) / 2 if p else float("inf")
        return min(cands, key=blended)

    # ---- completions ----
    def respond(self, model: str, input_items, instructions=None, tools=None, tool_choice=None,
                max_output_tokens=None, previous_response_id=None, temperature=None):
        body = {"model": model, "input": input_items, "stream": False}
        if instructions:
            body["instructions"] = instructions
        if tools:
            body["tools"] = tools
        if tool_choice:
            body["tool_choice"] = tool_choice
        if max_output_tokens:
            body["max_output_tokens"] = max_output_tokens
        if previous_response_id:
            body["previous_response_id"] = previous_response_id
        if temperature is not None:
            body["temperature"] = temperature
        resp = self._request("/v1/responses", body)
        usage = resp.get("usage") or {}
        cost = usage.get("cost_usd")
        if cost is None:
            p = self.prices().get(resp.get("model", model)) or self.prices().get(model)
            if p:
                cost = (usage.get("input_tokens", 0) * p[0] + usage.get("output_tokens", 0) * p[1]) / 1e6
        cost = cost or 0.0
        self.spent_usd += cost
        return resp, cost

    def send_body(self, body: dict):
        """Send an arbitrary request body (used for the ladder)."""
        b = dict(body)
        b["stream"] = False
        b.pop("routing", None)
        resp = self._request("/v1/responses", b)
        usage = resp.get("usage") or {}
        cost = usage.get("cost_usd")
        if cost is None:
            p = self.prices().get(resp.get("model", b.get("model")))
            if p:
                cost = (usage.get("input_tokens", 0) * p[0] + usage.get("output_tokens", 0) * p[1]) / 1e6
        cost = cost or 0.0
        self.spent_usd += cost
        return resp, cost

    # ---- admin ----
    def score(self, body: dict):
        b = dict(body)
        b.pop("stream", None)
        return self._request("/admin/routing/score", b, admin=True)

    def judge(self, user_text: str, a: str, b: str, judge_model=None):
        body = {"user_text": user_text, "answer_a": a, "answer_b": b}
        if judge_model:
            body["judge_model"] = judge_model
        out = self._request("/admin/routing/judge", body, admin=True)
        self.spent_usd += out.get("cost_usd") or 0.0
        return out

    def feature_profile(self, days=30):
        return self._request(f"/admin/routing/feature-profile?days={days}", method="GET", admin=True)

    def ingest(self, batch_id: str, rows):
        return self._request("/admin/routing/gold/synthetic", {"batch_id": batch_id, "rows": rows}, admin=True)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def response_text(resp: dict) -> str:
    parts = []
    for item in resp.get("output", []) or []:
        if item.get("type") == "message":
            for c in item.get("content", []) or []:
                if c.get("type") in ("output_text", "text") and c.get("text"):
                    parts.append(c["text"])
    return "\n".join(parts).strip()


def response_calls(resp: dict):
    return [
        {"name": i.get("name"), "arguments": i.get("arguments")}
        for i in resp.get("output", []) or []
        if i.get("type") == "function_call"
    ]


def answer_for_judge(resp: dict) -> str:
    """What the judge sees: prose, or the tool call(s) for tool rows."""
    calls = response_calls(resp)
    text = response_text(resp)
    if calls:
        return "TOOL CALLS: " + json.dumps(calls, sort_keys=True) + ("\n" + text if text else "")
    return text


def extract_json(text: str):
    """Pull the first JSON value out of a model reply."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S)
    for opener, closer in (("[", "]"), ("{", "}")):
        i = text.find(opener)
        j = text.rfind(closer)
        if i != -1 and j > i:
            try:
                return json.loads(text[i : j + 1])
            except json.JSONDecodeError:
                continue
    raise ValueError("no JSON in reply")


def last_user_text(body: dict) -> str:
    text = ""
    for item in body.get("input", []) or []:
        if item.get("type", "message") == "message" and item.get("role") == "user":
            c = item.get("content")
            if isinstance(c, str):
                text = c
            elif isinstance(c, list):
                text = " ".join(p.get("text", "") for p in c if isinstance(p, dict))
    return text


def prompt_hash(text: str) -> str:
    return hashlib.sha256(text.strip().lower().encode()).hexdigest()


class MinHash:
    """64-permutation MinHash over 3-word shingles for near-duplicate detection."""

    def __init__(self, k: int = 64, seed: int = 7):
        rng = random.Random(seed)
        self.p = (1 << 61) - 1
        self.params = [(rng.randrange(1, self.p), rng.randrange(0, self.p)) for _ in range(k)]
        self.seen = []

    def signature(self, text: str):
        words = re.findall(r"\w+", text.lower())
        shingles = {" ".join(words[i : i + 3]) for i in range(max(1, len(words) - 2))}
        hashes = [int(hashlib.md5(s.encode()).hexdigest(), 16) & 0xFFFFFFFFFFFF for s in shingles]
        return [min(((a * h + b) % self.p) for h in hashes) for a, b in self.params]

    def near_duplicate(self, text: str, threshold: float = 0.7) -> bool:
        sig = self.signature(text)
        for other in self.seen:
            same = sum(1 for x, y in zip(sig, other) if x == y) / len(sig)
            if same >= threshold:
                return True
        self.seen.append(sig)
        return False


def weighted_choice(rng: random.Random, items):
    total = sum(w for _, w in items)
    r = rng.uniform(0, total)
    for item, w in items:
        r -= w
        if r <= 0:
            return item
    return items[-1][0]


# --------------------------------------------------------------------------
# specs
# --------------------------------------------------------------------------

def sample_spec(rng: random.Random, profile: dict | None, index: int) -> dict:
    """One generation spec: level, family, shape, language, token target."""
    # Tier: half from the live distribution, half uniform so every level
    # gets examples even when traffic is mostly simple.
    if profile and profile.get("tier_shares") and rng.random() < 0.5:
        shares = [(t, max(profile["tier_shares"].get(t, 0.0), 0.02)) for t in TIERS]
        tier = weighted_choice(rng, shares)
    else:
        tier = rng.choice(TIERS)
    level = TIERS.index(tier) + 1

    family = rng.choice(list(FAMILIES))
    if family == "agentic":
        shape = rng.choice(["tools_declared", "tool_loop", "tools_declared"])
    elif family == "longdoc":
        shape = "long_context"
    else:
        shape_weights = {k: v["weight"] for k, v in SHAPES.items()}
        if profile and profile.get("overall", {}).get("shapes"):
            sh = profile["overall"]["shapes"]
            # Nudge toward live shape shares (never below a floor).
            shape_weights["tool_loop"] = max(0.03, sh.get("tool_loop_turn", 0))
            shape_weights["tools_declared"] = max(0.05, sh.get("tools_declared", 0) - sh.get("tool_loop_turn", 0))
            shape_weights["multi_turn"] = max(0.08, sh.get("multi_turn", 0))
            shape_weights["long_context"] = max(0.05, sh.get("long_input", 0))
            shape_weights["intent_hint"] = max(0.03, sh.get("explicit_intent", 0))
        shape = weighted_choice(rng, list(shape_weights.items()))

    # Token target from the live per-tier distribution of log_input_tokens.
    lo, hi = DEFAULT_TOKEN_BANDS[level]
    if profile:
        q = ((profile.get("per_tier") or {}).get(tier) or {}).get("features", {}).get("log_input_tokens")
        if q and q.get("p25") is not None:
            lo = max(8, int(math.expm1(q["p25"])))
            hi = max(lo + 20, int(math.expm1(q["p90"])))
    if shape == "long_context":
        lo, hi = max(lo, 1500), max(hi, 6000)
    target_tokens = int(math.exp(rng.uniform(math.log(lo), math.log(hi))))

    non_ascii = 0.15
    if profile and profile.get("overall", {}).get("shapes"):
        non_ascii = max(0.05, profile["overall"]["shapes"].get("non_ascii", 0.15))
    language = rng.choice([l for l in LANGUAGES if l != "English"]) if rng.random() < non_ascii else "English"

    tools = rng.sample(TOOL_LIBRARY, k=rng.randint(1, 3)) if shape in ("tools_declared", "tool_loop") else []
    return {
        "index": index,
        "tier": tier,
        "level": level,
        "family": family,
        "shape": shape,
        "language": language,
        "target_tokens": target_tokens,
        "tools": tools,
        "max_output_tokens": rng.choice([None, None, None, 256, 1024]),
    }


GENERATION_INSTRUCTIONS = """You write realistic requests that real users send to an AI assistant API, for training a request-difficulty classifier. Output ONLY a JSON array with one object per spec, in order. Each object:

{"index": <spec index>, "self_rating": <1-4 difficulty per the rubric>, "request": {
   "instructions": <optional system prompt string or null>,
   "input": [<Open Responses input items>],
   "tools": [<function tools as {"type":"function","function":{"name","description","parameters"}}>] or omit,
   "tool_choice": "auto" | "required" | omit,
   "max_output_tokens": <int> or omit
}}

Input items: {"type":"message","role":"user"|"assistant","content":"..."}; for a tool loop second turn also {"type":"function_call","call_id":"call_1","name":...,"arguments":"<json string>"} followed by {"type":"function_call_output","call_id":"call_1","output":"<realistic tool result>"}.

Rules: write like different real people (developers, analysts, students, customers), with concrete details, real-looking data, code or documents when the family calls for them; never placeholders like <insert>, lorem ipsum, or "example.com" filler; match the requested language for all user text; match the requested approximate input length; the difficulty must honestly match the requested level rubric, do not inflate or deflate it. No commentary outside the JSON.

Difficulty rubric:
""" + "\n".join(LEVEL_RUBRIC.values())


def spec_text(spec: dict) -> str:
    lines = [
        f"- index {spec['index']}: level L{spec['level']} ({spec['tier']}), family: {FAMILIES[spec['family']]}, shape: {spec['shape']}"
        + (f" ({SHAPES[spec['shape']]['hint']})" if SHAPES[spec['shape']].get("hint") else ""),
        f"  language: {spec['language']}; approximate total input length: {spec['target_tokens']} tokens",
    ]
    if spec["tools"]:
        lines.append("  tools to declare: " + json.dumps(spec["tools"]))
    if spec["max_output_tokens"]:
        lines.append(f"  set max_output_tokens: {spec['max_output_tokens']}")
    return "\n".join(lines)


RATING_INSTRUCTIONS = """Rate how hard each request is for an AI assistant to answer well, using this rubric. Output ONLY a JSON array of objects {"index": <index>, "level": <1-4>}.

""" + "\n".join(LEVEL_RUBRIC.values())


def normalise_request(req: dict, spec: dict) -> dict | None:
    """Coerce a generated request into a valid body; None when hopeless."""
    if not isinstance(req, dict) or not isinstance(req.get("input"), list) or not req["input"]:
        return None
    body = {"input": []}
    for item in req["input"]:
        if not isinstance(item, dict):
            continue
        t = item.get("type", "message")
        if t == "message" and item.get("role") in ("user", "assistant", "system") and isinstance(item.get("content"), str):
            body["input"].append({"type": "message", "role": item["role"], "content": item["content"]})
        elif t == "function_call" and item.get("name"):
            args = item.get("arguments", "{}")
            body["input"].append({"type": "function_call", "call_id": item.get("call_id", "call_1"), "name": item["name"], "arguments": args if isinstance(args, str) else json.dumps(args)})
        elif t == "function_call_output":
            out = item.get("output", "")
            body["input"].append({"type": "function_call_output", "call_id": item.get("call_id", "call_1"), "output": out if isinstance(out, str) else json.dumps(out)})
    if not any(i.get("type") == "message" and i.get("role") == "user" for i in body["input"]) and spec["shape"] != "tool_loop":
        return None
    if isinstance(req.get("instructions"), str) and req["instructions"].strip():
        body["instructions"] = req["instructions"]
    tools = req.get("tools") or ([{"type": "function", "function": t} for t in spec["tools"]] if spec["tools"] else None)
    if tools:
        fixed = []
        for t in tools:
            if isinstance(t, dict) and t.get("type") == "function" and isinstance(t.get("function"), dict) and t["function"].get("name"):
                fixed.append(t)
            elif isinstance(t, dict) and t.get("name"):
                fixed.append({"type": "function", "function": t})
        if fixed:
            body["tools"] = fixed
    if req.get("tool_choice") in ("auto", "required", "none"):
        body["tool_choice"] = req["tool_choice"]
    if isinstance(req.get("max_output_tokens"), int) and req["max_output_tokens"] > 0:
        body["max_output_tokens"] = req["max_output_tokens"]
    elif spec["max_output_tokens"]:
        body["max_output_tokens"] = spec["max_output_tokens"]
    return body


def shape_ok(features: dict, spec: dict) -> str | None:
    """Return a reason when the realised features miss the spec's bands."""
    tokens = features.get("est_input_tokens", 0)
    target = spec["target_tokens"]
    if tokens < target / 3 or tokens > target * 3:
        return f"tokens {tokens} outside band around {target}"
    if spec["shape"] in ("tools_declared", "tool_loop") and features.get("tool_count", 0) == 0:
        return "no tools declared"
    if spec["shape"] == "tool_loop" and not features.get("is_tool_loop_turn"):
        return "not a tool-loop turn"
    if spec["shape"] == "multi_turn" and features.get("user_messages", 0) < 2:
        return "not multi-turn"
    if spec["shape"] == "long_context" and tokens < 1000:
        return "long_context too short"
    return None


# --------------------------------------------------------------------------
# generate
# --------------------------------------------------------------------------

def cmd_generate(args) -> int:
    gw = Gateway(args.gateway, args.api_key, args.admin_key)
    rng = random.Random(args.seed)
    profile = json.load(open(args.profile)) if args.profile else None
    generators = []
    for part in args.generators.split(","):
        name, _, w = part.partition(":")
        generators.append((name.strip(), float(w or 1)))
    minhash = MinHash()
    known = set()
    if args.known_hashes and os.path.exists(args.known_hashes):
        known = {l.strip() for l in open(args.known_hashes) if l.strip()}

    out = open(args.out, "a" if args.append else "w", encoding="utf-8")
    written = 0
    rejected = Counter()
    index = 0
    idle_batches = 0
    while written < args.n:
        if gw.spent_usd >= args.budget_usd:
            print(f"budget {args.budget_usd} USD reached after {written} rows", file=sys.stderr)
            break
        if idle_batches >= args.max_idle_batches:
            print(f"{idle_batches} batches in a row produced nothing; stopping (see rejected counts)", file=sys.stderr)
            break
        if gw.calls >= args.max_calls:
            print(f"--max-calls {args.max_calls} reached", file=sys.stderr)
            break
        before = written
        specs = [sample_spec(rng, profile, index + i) for i in range(args.batch)]
        index += args.batch
        generator = weighted_choice(rng, generators)
        prompt = "Specs:\n" + "\n".join(spec_text(s) for s in specs)
        try:
            resp, _ = gw.respond(generator, [{"type": "message", "role": "user", "content": prompt}],
                                 instructions=GENERATION_INSTRUCTIONS, temperature=1.0, max_output_tokens=16000)
            items = extract_json(response_text(resp))
        except Exception as e:  # noqa: BLE001
            rejected["generation_failed"] += 1
            print(f"generation failed on {generator}: {e}", file=sys.stderr)
            if args.retry_generator:
                generator = args.retry_generator
                try:
                    resp, _ = gw.respond(generator, [{"type": "message", "role": "user", "content": prompt}],
                                         instructions=GENERATION_INSTRUCTIONS, temperature=1.0, max_output_tokens=16000)
                    items = extract_json(response_text(resp))
                except Exception as e2:  # noqa: BLE001
                    print(f"retry failed: {e2}", file=sys.stderr)
                    idle_batches += 1
                    continue
            else:
                idle_batches += 1
                continue
        by_index = {s["index"]: s for s in specs}
        bodies = []
        for it in items if isinstance(items, list) else []:
            spec = by_index.get(it.get("index")) if isinstance(it, dict) else None
            if not spec:
                rejected["bad_index"] += 1
                continue
            body = normalise_request(it.get("request"), spec)
            if body is None:
                rejected["malformed"] += 1
                continue
            self_rating = it.get("self_rating")
            bodies.append((spec, body, self_rating))

        # Independent self-rating pass (cheap, catches inflated levels).
        ratings = {}
        if bodies and not args.skip_rating:
            listing = "\n\n".join(f"index {s['index']}:\n{json.dumps(b, ensure_ascii=False)[:4000]}" for s, b, _ in bodies)
            try:
                r, _ = gw.respond(generator, [{"type": "message", "role": "user", "content": listing}],
                                  instructions=RATING_INSTRUCTIONS, temperature=0.0, max_output_tokens=2000)
                for it in extract_json(response_text(r)):
                    if isinstance(it, dict) and isinstance(it.get("level"), int):
                        ratings[it.get("index")] = it["level"]
            except Exception as e:  # noqa: BLE001
                print(f"rating failed: {e}", file=sys.stderr)

        for spec, body, self_rating in bodies:
            rated = ratings.get(spec["index"], self_rating)
            if isinstance(rated, int) and abs(rated - spec["level"]) > 1:
                rejected["level_mismatch"] += 1
                continue
            # Make tool-loop rows real: send turn 1, then continue.
            if spec["shape"] == "tool_loop":
                body, ok = realise_tool_loop(gw, body, spec, args.turn_model or gw.cheapest("medium") or gw.cheapest("simple"))
                if not ok:
                    rejected["tool_loop_not_realised"] += 1
                    continue
            user_text = last_user_text(body) or json.dumps(body["input"][-1], ensure_ascii=False)
            h = prompt_hash(user_text)
            if h in known or minhash.near_duplicate(user_text):
                rejected["duplicate"] += 1
                continue
            try:
                decision = gw.score({"model": "auto", **body})
            except Exception as e:  # noqa: BLE001
                rejected["score_failed"] += 1
                print(f"score failed: {e}", file=sys.stderr)
                continue
            features = decision.get("features", {})
            reason = shape_ok(features, spec)
            if reason:
                rejected["shape:" + reason.split(" ")[0]] += 1
                continue
            known.add(h)
            row = {
                "id": f"{args.seed}-{spec['index']}",
                "spec": spec,
                "request": body,
                "features": features,
                "heuristic_tier": decision.get("classified_tier"),
                "heuristic_score": decision.get("raw_score"),
                "intended_tier": spec["tier"],
                "family": spec["family"],
                "shape": spec["shape"],
                "language": spec["language"],
                "generator_model": generator,
                "rated_level": rated,
                "user_text": user_text,
                "prompt_hash": h,
            }
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
            out.flush()
            written += 1
            if written >= args.n:
                break
        idle_batches = idle_batches + 1 if written == before else 0
        print(f"written {written}/{args.n}  spent ${gw.spent_usd:.3f}  rejected {dict(rejected)}", file=sys.stderr)
    out.close()
    print(json.dumps({"written": written, "spent_usd": round(gw.spent_usd, 4), "calls": gw.calls, "rejected": dict(rejected)}, indent=2))
    return 0


def realise_tool_loop(gw: Gateway, body: dict, spec: dict, model: str | None):
    """Send the first turn for real so previous_response_id exists, then
    build the second turn from the generator's tool result."""
    if not model:
        return body, False
    first = [i for i in body["input"] if not (i.get("type") in ("function_call", "function_call_output"))]
    outputs = [i for i in body["input"] if i.get("type") == "function_call_output"]
    if not first or not outputs:
        return body, False
    try:
        resp, _ = gw.respond(model, first, instructions=body.get("instructions"), tools=body.get("tools"),
                             tool_choice="required", max_output_tokens=400)
    except Exception:  # noqa: BLE001
        return body, False
    calls = [i for i in resp.get("output", []) if i.get("type") == "function_call"]
    if not calls or not resp.get("id"):
        return body, False
    call = calls[0]
    turn2 = {
        "previous_response_id": resp["id"],
        "input": [{"type": "function_call_output", "call_id": call.get("call_id") or call.get("id"), "output": outputs[0]["output"]}],
    }
    if body.get("tools"):
        turn2["tools"] = body["tools"]
    if body.get("instructions"):
        turn2["instructions"] = body["instructions"]
    turn2["_first_turn_user_text"] = last_user_text({"input": first})
    return turn2, True


# --------------------------------------------------------------------------
# label
# --------------------------------------------------------------------------

def cmd_label(args) -> int:
    gw = Gateway(args.gateway, args.api_key, args.admin_key)
    rng = random.Random(args.seed)
    tiers = gw.tiers()
    ladder_models = {t: gw.cheapest(t) for t in TIERS}
    reference_tier = args.reference_tier
    reference_model = args.reference_model or (tiers.get(reference_tier) or [None])[0]
    if not reference_model:
        print(f"no model in reference tier {reference_tier}", file=sys.stderr)
        return 1
    print(f"ladder: {ladder_models}  reference: {reference_model} ({reference_tier})", file=sys.stderr)

    rows = [json.loads(l) for l in open(args.input, encoding="utf-8") if l.strip()]
    done = set()
    if args.append and os.path.exists(args.out):
        done = {json.loads(l)["prompt_hash"] for l in open(args.out, encoding="utf-8") if l.strip()}
    out = open(args.out, "a" if args.append else "w", encoding="utf-8")
    cost_out = open(args.cost_rows, "a" if args.append else "w", encoding="utf-8") if args.cost_rows else None
    labelled = 0
    failures = Counter()
    for row in rows:
        if row["prompt_hash"] in done:
            continue
        if gw.spent_usd >= args.budget_usd:
            print(f"budget {args.budget_usd} USD reached after {labelled} rows", file=sys.stderr)
            break
        if gw.calls >= args.max_calls:
            print(f"--max-calls {args.max_calls} reached", file=sys.stderr)
            break
        body = {k: v for k, v in row["request"].items() if not k.startswith("_")}
        judge_text = row.get("user_text") or row["request"].get("_first_turn_user_text") or ""
        if body.get("previous_response_id"):
            judge_text = "Continue the tool loop for this request: " + (row["request"].get("_first_turn_user_text") or judge_text)

        # Reference answer.
        try:
            ref_resp, ref_cost = gw.send_body({**body, "model": reference_model})
        except Exception as e:  # noqa: BLE001
            failures["reference_failed"] += 1
            print(f"reference failed: {e}", file=sys.stderr)
            continue
        ref_answer = answer_for_judge(ref_resp)
        if not ref_answer:
            failures["reference_empty"] += 1
            continue
        emit_cost_row(cost_out, row, ref_resp, reference_model, ref_cost)

        ladder = []
        label = None
        best = None
        for tier in TIERS:
            if TIERS.index(tier) >= TIERS.index(reference_tier):
                break
            model = ladder_models.get(tier)
            if not model:
                continue
            try:
                resp, cost = gw.send_body({**body, "model": model})
            except Exception as e:  # noqa: BLE001
                ladder.append({"tier": tier, "model": model, "error": str(e)[:200]})
                continue
            emit_cost_row(cost_out, row, resp, model, cost)
            answer = answer_for_judge(resp)
            if not answer:
                ladder.append({"tier": tier, "model": model, "error": "empty answer", "cost_usd": cost})
                continue
            # Swap A/B at random to cancel position bias; map back.
            swapped = rng.random() < 0.5
            a, b = (ref_answer, answer) if swapped else (answer, ref_answer)
            try:
                j = gw.judge(judge_text, a, b, args.judge_model)
            except Exception as e:  # noqa: BLE001
                ladder.append({"tier": tier, "model": model, "error": f"judge: {e}"[:200], "cost_usd": cost})
                continue
            verdict = j.get("verdict")
            if verdict in ("a", "b") and swapped:
                verdict = "b" if verdict == "a" else "a"
            confidence = j.get("confidence")
            if verdict in ("a", "b") and confidence is not None and confidence < args.confidence_floor:
                verdict = "tie"
            usage = resp.get("usage") or {}
            ladder.append({
                "tier": tier, "model": model, "verdict": verdict, "confidence": confidence,
                "cost_usd": cost, "latency_ms": (resp.get("metadata", {}).get("aura", {}) or {}).get("latency_ms"),
                "output_tokens": usage.get("output_tokens"), "error": j.get("error"),
            })
            # verdict a = cheap answer at least as good; tie = sufficed.
            if verdict in ("a", "tie"):
                label = tier
                best = (tier, model, answer, cost, resp, j, verdict)
                break
        if label is None:
            label = reference_tier
        if best is None:
            # Strong-better everywhere: record the top rung as the pair.
            last = next((l for l in reversed(ladder) if l.get("verdict")), None)
            pair_a = {"tier": last["tier"], "model": last["model"], "cost": last.get("cost_usd"), "text": None,
                      "verdict": "b", "confidence": last.get("confidence"), "latency": last.get("latency_ms")} if last else None
        else:
            tier, model, answer, cost, resp, j, verdict = best
            pair_a = {"tier": tier, "model": model, "cost": cost, "text": answer, "verdict": verdict,
                      "confidence": j.get("confidence"), "latency": (resp.get("metadata", {}).get("aura", {}) or {}).get("latency_ms")}
        if pair_a is None:
            failures["ladder_failed"] += 1
            continue
        cluster = f"{row['family']}|{row['intended_tier']}|{row['id'].split('-')[0]}"
        split = "holdout" if (int(hashlib.md5(cluster.encode()).hexdigest(), 16) % 1000) < args.holdout * 1000 else "train"
        labelled_row = {
            "prompt_hash": row["prompt_hash"],
            "features": row["features"],
            "user_text": judge_text,
            "intended_tier": row["intended_tier"],
            "label_tier": label,
            "family": row["family"],
            "shape": row["shape"],
            "split": split,
            "weight": 1.0 if label == row["intended_tier"] else args.disagreement_weight,
            "generator_model": row.get("generator_model"),
            "ladder": ladder,
            "decided_tier": row.get("heuristic_tier"),
            "heuristic_score": row.get("heuristic_score"),
            "tier_a": pair_a["tier"], "model_a": pair_a["model"], "text_a": pair_a["text"], "cost_a": pair_a["cost"], "latency_a_ms": pair_a["latency"],
            "tier_b": reference_tier, "model_b": reference_model, "text_b": ref_answer, "cost_b": ref_cost,
            "latency_b_ms": (ref_resp.get("metadata", {}).get("aura", {}) or {}).get("latency_ms"),
            "judge_model": args.judge_model or "",
            "verdict": pair_a["verdict"], "judge_confidence": pair_a["confidence"],
            "language": row.get("language"),
            "rated_level": row.get("rated_level"),
        }
        out.write(json.dumps(labelled_row, ensure_ascii=False) + "\n")
        out.flush()
        labelled += 1
        print(f"[{labelled}] {row['family']}/{row['shape']} intended {row['intended_tier']} -> label {label}  spent ${gw.spent_usd:.3f}", file=sys.stderr)
    out.close()
    if cost_out:
        cost_out.close()
    print(json.dumps({"labelled": labelled, "spent_usd": round(gw.spent_usd, 4), "calls": gw.calls, "failures": dict(failures)}, indent=2))
    return 0


def emit_cost_row(fh, row, resp, model, cost):
    if not fh:
        return
    usage = resp.get("usage") or {}
    if usage.get("output_tokens") is None:
        return
    fh.write(json.dumps({
        "features": row["features"], "model": resp.get("model") or model,
        "output_tokens": usage.get("output_tokens"), "input_tokens": usage.get("input_tokens"),
        "cost_usd": cost, "source": "synthetic",
    }) + "\n")


# --------------------------------------------------------------------------
# ingest / report / profile
# --------------------------------------------------------------------------

INGEST_FIELDS = {
    "prompt_hash", "features", "user_text", "intended_tier", "label_tier", "family", "shape", "split", "weight",
    "generator_model", "ladder", "decided_tier", "heuristic_score", "tier_a", "model_a", "text_a", "cost_a",
    "latency_a_ms", "tier_b", "model_b", "text_b", "cost_b", "latency_b_ms", "judge_model", "verdict",
    "judge_confidence", "judge_rationale", "error",
}


def cmd_ingest(args) -> int:
    gw = Gateway(args.gateway, args.api_key, args.admin_key)
    rows = [json.loads(l) for l in open(args.input, encoding="utf-8") if l.strip()]
    if args.judge_model:
        for r in rows:
            r["judge_model"] = r.get("judge_model") or args.judge_model
    totals = Counter()
    rejected = []
    for i in range(0, len(rows), args.chunk):
        chunk = [{k: v for k, v in r.items() if k in INGEST_FIELDS} for r in rows[i : i + args.chunk]]
        for r in chunk:
            r.setdefault("judge_model", "unknown")
        res = gw.ingest(args.batch_id, chunk)
        totals["inserted"] += res.get("inserted", 0)
        totals["updated"] += res.get("updated", 0)
        rejected.extend(res.get("rejected", []))
    print(json.dumps({"batch_id": args.batch_id, **totals, "rejected": rejected[:20], "rejected_total": len(rejected)}, indent=2))
    return 0 if not rejected else 2


def cmd_report(args) -> int:
    rows = [json.loads(l) for l in open(args.input, encoding="utf-8") if l.strip()]
    if not rows:
        print("no rows")
        return 1
    by = lambda key: Counter(r.get(key) for r in rows)  # noqa: E731
    agree = sum(1 for r in rows if r.get("intended_tier") == r.get("label_tier"))
    conf = defaultdict(Counter)
    for r in rows:
        conf[r.get("intended_tier")][r.get("label_tier")] += 1
    spend = sum((r.get("cost_b") or 0) + sum((l.get("cost_usd") or 0) for l in r.get("ladder", [])) for r in rows)
    print(json.dumps({
        "rows": len(rows),
        "labels": dict(by("label_tier")),
        "intended": dict(by("intended_tier")),
        "agreement": round(agree / len(rows), 3),
        "confusion_intended_x_label": {k: dict(v) for k, v in conf.items()},
        "families": dict(by("family")),
        "shapes": dict(by("shape")),
        "split": dict(by("split")),
        "generators": dict(by("generator_model")),
        "judge_confidence_p50": sorted(r.get("judge_confidence") or 0 for r in rows)[len(rows) // 2],
        "answer_spend_usd": round(spend, 4),
    }, indent=2))
    return 0


def cmd_profile(args) -> int:
    gw = Gateway(args.gateway, args.api_key, args.admin_key)
    profile = gw.feature_profile(args.days)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(profile, fh, indent=2)
    print(f"wrote {args.out}: {profile.get('rows')} rows, tier shares {profile.get('tier_shares')}")
    return 0


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gateway", default=os.environ.get("AURA_GATEWAY", "http://localhost:8080"))
    ap.add_argument("--api-key", default=os.environ.get("AURA_SYNTH_KEY", ""), help="API key of the synthetic org")
    ap.add_argument("--admin-key", default=os.environ.get("AURA_ADMIN_KEY", ""))
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("profile", help="fetch the live feature profile")
    p.add_argument("--days", type=int, default=30)
    p.add_argument("--out", default="profile.json")
    p.set_defaults(fn=cmd_profile)

    g = sub.add_parser("generate", help="generate request bodies")
    g.add_argument("--n", type=int, default=100)
    g.add_argument("--batch", type=int, default=5, help="specs per generator call")
    g.add_argument("--profile", help="profile.json from the profile subcommand")
    g.add_argument("--generators", default=DEFAULT_GENERATORS, help="model:weight,... (default luna 0.7 / haiku 0.3)")
    g.add_argument("--retry-generator", default="claude-haiku-4-5")
    g.add_argument("--turn-model", help="model used to answer turn 1 of tool-loop rows (default cheapest medium)")
    g.add_argument("--known-hashes", help="file of prompt hashes to skip (one per line)")
    g.add_argument("--skip-rating", action="store_true")
    g.add_argument("--budget-usd", type=float, default=5.0)
    g.add_argument("--max-calls", type=int, default=2000, help="hard stop on gateway calls")
    g.add_argument("--max-idle-batches", type=int, default=8, help="stop after this many consecutive batches with no accepted row")
    g.add_argument("--seed", type=int, default=1)
    g.add_argument("--append", action="store_true")
    g.add_argument("--out", default="requests.jsonl")
    g.set_defaults(fn=cmd_generate)

    l = sub.add_parser("label", help="ladder + judge")
    l.add_argument("--input", default="requests.jsonl")
    l.add_argument("--out", default="labelled.jsonl")
    l.add_argument("--cost-rows", help="also write rows for train_cost.py --input")
    l.add_argument("--reference-tier", default="reasoning", choices=TIERS)
    l.add_argument("--reference-model")
    l.add_argument("--judge-model", help="defaults to the gateway's gold_judge_model")
    l.add_argument("--confidence-floor", type=float, default=0.6)
    l.add_argument("--disagreement-weight", type=float, default=0.5)
    l.add_argument("--holdout", type=float, default=0.2)
    l.add_argument("--budget-usd", type=float, default=50.0)
    l.add_argument("--max-calls", type=int, default=20000, help="hard stop on gateway calls")
    l.add_argument("--seed", type=int, default=1)
    l.add_argument("--append", action="store_true")
    l.set_defaults(fn=cmd_label)

    i = sub.add_parser("ingest", help="upload labelled rows")
    i.add_argument("--input", default="labelled.jsonl")
    i.add_argument("--batch-id", required=True)
    i.add_argument("--judge-model", help="fill judge_model when the labelled file lacks it")
    i.add_argument("--chunk", type=int, default=500)
    i.set_defaults(fn=cmd_ingest)

    r = sub.add_parser("report", help="summarise a labelled file")
    r.add_argument("--input", default="labelled.jsonl")
    r.set_defaults(fn=cmd_report)

    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
