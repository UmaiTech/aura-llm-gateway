#!/usr/bin/env python3
"""Generate the three evaluator-onboarding notebooks for aura-llm-gateway (#153).

Quickstart + streaming chat + tool-calling loop — the trio the maintainer
scoped as covering ~80% of evaluator questions. Pure nbformat-4 JSON.
"""
import json
import os
import uuid

OUT = os.path.join(os.path.dirname(__file__), "..", "examples", "notebooks")

# Pin the SDK version so notebooks don't rot silently (issue #153 criterion).
# Bumped with the SDK: 0.17.0 adds Response.validation parsing + the Feedback
# resource that notebooks 05/06 rely on.
SDK_VERSION = "0.17.0"


def md(source):
    return {"cell_type": "markdown", "metadata": {}, "id": f"md-{uuid.uuid4().hex[:12]}", "source": source}


def code(source, outputs=None):
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "id": f"code-{uuid.uuid4().hex[:12]}",
        "outputs": outputs or [],
        "source": source,
    }


def nb(cells):
    return {
        "cells": cells,
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3",
            },
            "language_info": {
                "name": "python",
                "version": "3.10",
            },
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


NOTEBOOKS = []

# ---------------------------------------------------------------------------
# 01 — Quickstart
# ---------------------------------------------------------------------------
NOTEBOOKS.append(
    (
        "01_quickstart.ipynb",
        nb(
            [
                md(
                    "# Aura LLM Gateway — Quickstart\n"
                    "\n"
                    "A 5-minute *hello world* against the [Open Responses API](https://www.openresponses.org/specification) "
                    "through the Aura gateway.\n"
                    "\n"
                    "## Prerequisites\n"
                    "\n"
                    "1. A running gateway (default `http://localhost:8080`).\n"
                    "2. An API key, either passed to `AuraClient(api_key=...)` or set as `AURA_API_KEY`.\n"
                    "3. The SDK: `pip install aura-llm==" + SDK_VERSION + "` (or run from `sdks/python` with `pip install -e .`).\n"
                    "\n"
                    "> Aura proxies multiple providers behind one endpoint, so `model` can be any model your "
                    "gateway is configured for — e.g. `gpt-5.4-mini`, `claude-sonnet-4-6`, or a Together slug."
                ),
                code(
                    "# 1. Install (skip if already installed)\n"
                    "!pip install -q aura-llm==" + SDK_VERSION + "\n"
                ),
                code(
                    "# 2. Client\n"
                    "from aura import AuraClient\n"
                    "\n"
                    "# Uses AURA_BASE_URL / AURA_API_KEY env vars when not passed.\n"
                    "client = AuraClient()\n"
                    "print(f\"gateway: {client.base_url}\")"
                ),
                code(
                    "# 3. First completion\n"
                    "response = client.responses.create(\n"
                    "    model=\"gpt-5.4-mini\",\n"
                    "    input=\"What is 2 + 2? Answer in one sentence.\",\n"
                    ")\n"
                    "\n"
                    "print(f\"id:     {response.id}\")\n"
                    "print(f\"model:  {response.model}\")\n"
                    "print(f\"status: {response.status}\")\n"
                    "print(f\"answer: {response.output_text}\")"
                ),
                code(
                    "# 4. See usage + cost attribution\n"
                    "if response.usage:\n"
                    "    u = response.usage\n"
                    "    print(f\"tokens: {u.input_tokens} in / {u.output_tokens} out\")\n"
                    "    if u.cost_usd is not None:\n"
                    "        print(f\"cost:   ${u.cost_usd:.6f}\")"
                ),
                md(
                    "That's it. Next: [02 — streaming chat & conversation threading](02_streaming_chat.ipynb), "
                    "or [03 — tool calling](03_tool_calling.ipynb)."
                ),
            ]
        ),
    )
)

# ---------------------------------------------------------------------------
# 02 — Streaming chat + conversation threading
# ---------------------------------------------------------------------------
NOTEBOOKS.append(
    (
        "02_streaming_chat.ipynb",
        nb(
            [
                md(
                    "# Streaming chat + conversation threading\n"
                    "\n"
                    "Two things every chat UI needs:\n"
                    "\n"
                    "1. **Streaming** — consume Server-Sent Events (SSE) token-by-token instead of waiting for the whole answer.\n"
                    "2. **Threading** — keep context across turns with `previous_response_id`.\n"
                    "\n"
                    "Aura implements the Open Responses API, so streaming is a sequence of typed events "
                    "(`response.output_text.delta`, `response.completed`, ...) rather than raw token deltas."
                ),
                code(
                    "from aura import AuraClient\n"
                    "client = AuraClient()"
                ),
                code(
                    "# 1. Stream a response and print text deltas as they arrive\n"
                    "stream = client.responses.create(\n"
                    "    model=\"gpt-5.4-mini\",\n"
                    "    input=\"Count from 1 to 5, one number per line.\",\n"
                    "    stream=True,\n"
                    ")\n"
                    "\n"
                    "for event in stream:\n"
                    "    if event.type == \"response.output_text.delta\":\n"
                    "        print(event.delta, end=\"\", flush=True)\n"
                    "    elif event.type == \"response.completed\":\n"
                    "        print(f\"\\n\\n[completed] status={event.response.status}\")"
                ),
                code(
                    "# 2. Conversation threading with previous_response_id\n"
                    "turn1 = client.responses.create(\n"
                    "    model=\"gpt-5.4-mini\",\n"
                    "    input=\"My favorite color is teal. Remember that.\",\n"
                    ")\n"
                    "print(f\"turn 1: {turn1.output_text}\")\n"
                    "\n"
                    "turn2 = client.responses.create(\n"
                    "    model=\"gpt-5.4-mini\",\n"
                    "    input=\"What is my favorite color?\",\n"
                    "    previous_response_id=turn1.id,\n"
                    ")\n"
                    "print(f\"turn 2: {turn2.output_text}\")"
                ),
                code(
                    "# 3. Streaming + threading together (stateful streamed chat)\n"
                    "history_id = None\n"
                    "for question in [\"What's 3 * 7?\", \"And what was the first question I asked?\"]:\n"
                    "    print(f\"\\n> {question}\")\n"
                    "    events = client.responses.create(\n"
                    "        model=\"gpt-5.4-mini\",\n"
                    "        input=question,\n"
                    "        previous_response_id=history_id,\n"
                    "        stream=True,\n"
                    "    )\n"
                    "    for event in events:\n"
                    "        if event.type == \"response.output_text.delta\":\n"
                    "            print(event.delta, end=\"\", flush=True)\n"
                    "        elif event.type == \"response.completed\":\n"
                    "            history_id = event.response.id\n"
                    "            print()"
                ),
            ]
        ),
    )
)

# ---------------------------------------------------------------------------
# 03 — Tool calling (full loop)
# ---------------------------------------------------------------------------
NOTEBOOKS.append(
    (
        "03_tool_calling.ipynb",
        nb(
            [
                md(
                    "# Tool calling — end-to-end loop\n"
                    "\n"
                    "A complete agentic loop with the Open Responses API:\n"
                    "\n"
                    "1. Define tools with JSON-schema parameters.\n"
                    "2. Ask something that requires a tool.\n"
                    "3. The model returns `function_call` items (not the final answer).\n"
                    "4. **You** execute the tool and feed the result back as a `function_call_output` item.\n"
                    "5. The model produces the final answer with the tool result in context.\n"
                    "\n"
                    "This is the pattern behind every agent: *model proposes → code executes → model synthesizes*."
                ),
                code(
                    "import json\n"
                    "from aura import AuraClient, Tool\n"
                    "\n"
                    "client = AuraClient()"
                ),
                code(
                    "# 1. Define a toy weather tool (JSON-schema parameters)\n"
                    "weather_tool = Tool.function_tool(\n"
                    "    name=\"get_weather\",\n"
                    "    description=\"Get the current weather for a location\",\n"
                    "    parameters={\n"
                    "        \"type\": \"object\",\n"
                    "        \"properties\": {\n"
                    "            \"location\": {\n"
                    "                \"type\": \"string\",\n"
                    "                \"description\": \"City name, e.g. Tokyo\",\n"
                    "            },\n"
                    "            \"unit\": {\n"
                    "                \"type\": \"string\",\n"
                    "                \"enum\": [\"celsius\", \"fahrenheit\"],\n"
                    "            },\n"
                    "        },\n"
                    "        \"required\": [\"location\"],\n"
                    "    },\n"
                    ")"
                ),
                code(
                    "# 2. Simulated tool executor (swap for a real API call)\n"
                    "def run_tool(name: str, arguments: str) -> str:\n"
                    "    args = json.loads(arguments)\n"
                    "    if name == \"get_weather\":\n"
                    "        unit = args.get(\"unit\", \"celsius\")\n"
                    "        temp = 22 if unit == \"celsius\" else 72\n"
                    "        return json.dumps({\n"
                    "            \"location\": args[\"location\"],\n"
                    "            \"temperature\": temp,\n"
                    "            \"unit\": unit,\n"
                    "            \"conditions\": \"sunny\",\n"
                    "        })\n"
                    "    return json.dumps({\"error\": f\"unknown tool {name}\"})"
                ),
                code(
                    "# 3. Ask something that needs the tool\n"
                    "response = client.responses.create(\n"
                    "    model=\"gpt-5.4-mini\",\n"
                    "    input=\"What's the weather in Tokyo? Reply with the temperature and conditions.\",\n"
                    "    tools=[weather_tool],\n"
                    ")\n"
                    "\n"
                    "print(f\"status: {response.status}\")\n"
                    "print(f\"tool calls: {len(response.tool_calls)}\")\n"
                    "for tc in response.tool_calls:\n"
                    "    print(f\"  -> {tc.name}({tc.arguments})\")"
                ),
                code(
                    "# 4. Execute + feed results back (the complete loop)\n"
                    "\n"
                    "# The Responses API expects function_call / function_call_output\n"
                    "# items as plain dicts on the wire (see the Open Responses spec).\n"
                    "messages = []\n"
                    "response = client.responses.create(\n"
                    "    model=\"gpt-5.4-mini\",\n"
                    "    input=\"What's the weather in Tokyo and in Paris?\",\n"
                    "    tools=[weather_tool],\n"
                    ")\n"
                    "\n"
                    "while response.has_tool_calls:\n"
                    "    # append the model's function_call items so the next turn sees them\n"
                    "    for tc in response.tool_calls:\n"
                    "        messages.append({\n"
                    "            \"type\": \"function_call\",\n"
                    "            \"call_id\": tc.call_id,\n"
                    "            \"name\": tc.name,\n"
                    "            \"arguments\": tc.arguments,\n"
                    "        })\n"
                    "        result = run_tool(tc.name, tc.arguments)\n"
                    "        print(f\"tool {tc.name} -> {result}\")\n"
                    "        messages.append({\n"
                    "            \"type\": \"function_call_output\",\n"
                    "            \"call_id\": tc.call_id,\n"
                    "            \"output\": result,\n"
                    "        })\n"
                    "\n"
                    "    response = client.responses.create(\n"
                    "        model=\"gpt-5.4-mini\",\n"
                    "        input=messages,\n"
                    "        tools=[weather_tool],\n"
                    "        previous_response_id=response.id,\n"
                    "    )\n"
                    "\n"
                    "print(f\"\\nfinal: {response.output_text}\")"
                ),
                md(
                    "The `while` loop keeps running as long as the model emits tool calls — that's how "
                    "multi-step agents chain several tool invocations in one conversation."
                ),
            ]
        ),
    )
)


# ---------------------------------------------------------------------------
# 04 — Compression
# ---------------------------------------------------------------------------
NOTEBOOKS.append(
    (
        "04_compression.ipynb",
        nb(
            [
                md(
                    "# Prompt compression — cut token usage on structured prompts\n"
                    "\n"
                    "Aura can compress the *input* side of a request before it hits the model:\n"
                    "\n"
                    "- **TOON** — Token-Oriented Object Notation, best for JSON arrays / uniform data\n"
                    "- **YAML** — fewer delimiters for nested objects\n"
                    "- **AISP** — symbolic notation for math-heavy content\n"
                    "- **JSON minify** — whitespace removal + key shortening\n"
                    "\n"
                    "`auto_select` picks the best strategy per content type, and `target_ratio` asks for a target\n"
                    "compression factor (0.4 ≈ 60% fewer tokens).\n"
                    "\n"
                    "This notebook sends one long structured prompt twice — plain and compressed — and compares\n"
                    "the billed input tokens."
                ),
                code(
                    "from aura import AuraClient\n"
                    "\n"
                    "client = AuraClient()"
                ),
                code(
                    "# A realistic structured payload: an order with a line-item array.\n"
                    "order_prompt = (\n"
                    "    \"You are an order validator. Check the following order and report any \"\n"
                    "    \"discrepancies between the line items and the totals.\\n\\n\"\n"
                    "    \"ORDER:\\n\"\n"
                    "    \"{\\n\"\n"
                    "    \"  \\\"order_id\\\": \\\"ORD-78412\\\",\\n\"\n"
                    "    \"  \\\"customer\\\": {\\\"name\\\": \\\"Aarav Mehta\\\", \\\"tier\\\": \\\"gold\\\"},\\n\"\n"
                    "    \"  \\\"items\\\": [\\n\"\n"
                    "    \"    {\\\"sku\\\": \\\"A-101\\\", \\\"name\\\": \\\"Wireless Mouse\\\", \\\"qty\\\": 2, \\\"unit_price\\\": 24.99},\\n\"\n"
                    "    \"    {\\\"sku\\\": \\\"B-220\\\", \\\"name\\\": \\\"Mechanical Keyboard\\\", \\\"qty\\\": 1, \\\"unit_price\\\": 89.50},\\n\"\n"
                    "    \"    {\\\"sku\\\": \\\"C-330\\\", \\\"name\\\": \\\"USB-C Hub 7-in-1\\\", \\\"qty\\\": 3, \\\"unit_price\\\": 39.00},\\n\"\n"
                    "    \"    {\\\"sku\\\": \\\"D-441\\\", \\\"name\\\": \\\"Laptop Stand\\\", \\\"qty\\\": 1, \\\"unit_price\\\": 54.25}\\n\"\n"
                    "    \"  ],\\n\"\n"
                    "    \"  \\\"subtotal\\\": 319.23,\\n\"\n"
                    "    \"  \\\"tax_rate\\\": 0.18,\\n\"\n"
                    "    \"  \\\"shipping\\\": 0.00,\\n\"\n"
                    "    \"  \\\"discount\\\": 15.00\\n\"\n"
                    "    \"}\\n\\n\"\n"
                    "    \"List each discrepancy and the corrected totals.\"\n"
                    ")"
                ),
                code(
                    "# 1. Baseline: same prompt, no compression\n"
                    "baseline = client.responses.create(model=\"gpt-5.4-mini\", input=order_prompt)\n"
                    "b_in = baseline.usage.input_tokens if baseline.usage else 0\n"
                    "print(f\"baseline input tokens: {b_in}\")"
                ),
                code(
                    "# 2. Same prompt, compression enabled (auto-select strategy)\n"
                    "compressed = client.responses.create(\n"
                    "    model=\"gpt-5.4-mini\",\n"
                    "    input=order_prompt,\n"
                    "    compression={\n"
                    "        \"enabled\": True,\n"
                    "        \"auto_select\": True,\n"
                    "        \"target_ratio\": 0.4,  # aim for ~60% fewer input tokens\n"
                    "    },\n"
                    ")\n"
                    "c_in = compressed.usage.input_tokens if compressed.usage else 0\n"
                    "print(f\"compressed input tokens: {c_in}\")"
                ),
                code(
                    "# 3. Savings table\n"
                    "if b_in and c_in:\n"
                    "    pct = 100.0 * (b_in - c_in) / b_in\n"
                    "    print(f\"{'':28} {'tokens':>8} {'saved':>8}\")\n"
                    "    print(f\"{'baseline':28} {b_in:>8} {'—':>8}\")\n"
                    "    print(f\"{'compressed (auto_select)':28} {c_in:>8} {f'{pct:.0f}%':>8}\")\n"
                    "else:\n"
                    "    print(\"usage metadata missing — check that your gateway returns usage.\")"
                ),
                md(
                    "`compression` is an Aura extension on top of the Open Responses API — it rides in the\n"
                    "request body via extra kwargs. `auto_select` + `target_ratio` is the zero-config way to\n"
                    "start; power users can pin `data_format` (e.g. `\"toon\"`) or set `token_budget` instead.\n"
                    "\n"
                    "Next: [05 — validation](05_validation.ipynb) for best-of-N / self-consistency."
                ),
            ]
        ),
    )
)

# ---------------------------------------------------------------------------
# 05 — Validation (best-of-N / self-consistency)
# ---------------------------------------------------------------------------
NOTEBOOKS.append(
    (
        "05_validation.ipynb",
        nb(
            [
                md(
                    "# Validation — best-of-N and self-consistency\n"
                    "\n"
                    "On ambiguous questions a single pass can confidently give the *wrong* answer. Aura's\n"
                    "validation extension generates N candidates and picks the best:\n"
                    "\n"
                    "- **best_of_n** — generate N responses, select by criteria (`HighestConfidence`, `Longest`, `MostRelevant`, `Shortest`)\n"
                    "- **self_consistency** — generate N responses, require agreement above `min_confidence`\n"
                    "- **confidence_threshold** — reject low-confidence responses\n"
                    "\n"
                    "The response carries a `validation` block describing what happened (strategy, candidates\n"
                    "generated, selected index, confidence)."
                ),
                code(
                    "from aura import AuraClient\n"
                    "\n"
                    "client = AuraClient()"
                ),
                code(
                    "# A question where naive sampling disagrees:\n"
                    "# \"All but 9 run away\" means 9 remain.\n"
                    "ambiguous = (\n"
                    "    \"A farmer has 17 sheep. All but 9 run away. \"\n"
                    "    \"How many are left? Answer with just the number.\"\n"
                    ")\n"
                    "\n"
                    "response = client.responses.create(\n"
                    "    model=\"gpt-5.4-mini\",\n"
                    "    input=ambiguous,\n"
                    "    validation={\n"
                    "        \"strategy\": \"best_of_n\",\n"
                    "        \"n\": 3,\n"
                    "        \"selection\": \"HighestConfidence\",\n"
                    "    },\n"
                    ")\n"
                    "\n"
                    "print(f\"answer:            {response.output_text}\")\n"
                    "v = response.validation\n"
                    "if v:\n"
                    "    print(f\"strategy:          {v.strategy.value if v.strategy else '—'}\")\n"
                    "    print(f\"candidates:        {v.candidates_generated}\")\n"
                    "    print(f\"selected index:    {v.selected_index}\")\n"
                    "    print(f\"confidence:        {v.confidence}\")\n"
                    "else:\n"
                    "    print(\"no validation metadata returned\")"
                ),
                code(
                    "# self_consistency: 3 candidates must agree at >= 0.7 confidence\n"
                    "response2 = client.responses.create(\n"
                    "    model=\"gpt-5.4-mini\",\n"
                    "    input=ambiguous,\n"
                    "    validation={\n"
                    "        \"strategy\": \"self_consistency\",\n"
                    "        \"n\": 3,\n"
                    "        \"min_confidence\": 0.7,\n"
                    "    },\n"
                    ")\n"
                    "\n"
                    "print(f\"answer:            {response2.output_text}\")\n"
                    "v2 = response2.validation\n"
                    "if v2:\n"
                    "    print(f\"strategy:          {v2.strategy.value if v2.strategy else '—'}\")\n"
                    "    print(f\"candidates:        {v2.candidates_generated}\")\n"
                    "    print(f\"confidence:        {v2.confidence}\")\n"
                    "    print(f\"min_confidence:    {v2.min_confidence}\")\n"
                    "else:\n"
                    "    print(\"no validation metadata returned\")"
                ),
                md(
                    "Both strategies burn N generations per call — that's the token cost of confidence.\n"
                    "Use them where a wrong answer is expensive (classification, extraction, grading) and skip\n"
                    "them for casual chat.\n"
                    "\n"
                    "Next: [06 — feedback few-shot](06_feedback_few_shot.ipynb)."
                ),
            ]
        ),
    )
)

# ---------------------------------------------------------------------------
# 06 — Feedback / adaptive few-shot
# ---------------------------------------------------------------------------
NOTEBOOKS.append(
    (
        "06_feedback_few_shot.ipynb",
        nb(
            [
                md(
                    "# Feedback → adaptive few-shot learning\n"
                    "\n"
                    "The gateway stores thumbs-up/down feedback per response. Approved samples become\n"
                    "candidates for few-shot injection into later contexts, so the gateway gets better at\n"
                    "*your* task over time.\n"
                    "\n"
                    "- `POST /v1/feedback` — record a rating\n"
                    "- `GET /v1/feedback` — list samples (for few-shot injection)\n"
                    "- `GET /v1/feedback/stats` — aggregate counts"
                ),
                code(
                    "from aura import AuraClient, FeedbackSignal\n"
                    "\n"
                    "client = AuraClient()"
                ),
                code(
                    "# 1. Create a response you want to rate\n"
                    "response = client.responses.create(\n"
                    "    model=\"gpt-5.4-mini\",\n"
                    "    input=\"Summarize the waterfall model in one sentence.\",\n"
                    ")\n"
                    "print(f\"rated response: {response.id}\")\n"
                    "print(f\"answer:         {response.output_text}\")"
                ),
                code(
                    "# 2. Submit a thumbs-up with a reason + tags\n"
                    "result = client.feedback.submit(\n"
                    "    response_id=response.id,\n"
                    "    signal=FeedbackSignal.THUMBS_UP,\n"
                    "    reason=\"concise and accurate\",\n"
                    "    tags=[\"summarization\"],\n"
                    ")\n"
                    "print(result)"
                ),
                code(
                    "# 3. List samples (what the gateway can few-shot from)\n"
                    "samples = client.feedback.list()\n"
                    "print(f\"total samples: {samples.get('total')}\")\n"
                    "for sample in samples.get(\"samples\", []):\n"
                    "    print(sample)"
                ),
                code(
                    "# 4. Aggregate stats\n"
                    "print(client.feedback.stats())"
                ),
                md(
                    "Approved samples are sampled into later request contexts automatically when the gateway\n"
                    "is configured for adaptive few-shot (see the feedback docs in `crates/aura-core`).\n"
                    "`DELETE /v1/feedback/{id}` lets you remove a bad sample.\n"
                    "\n"
                    "Next: [07 — routing & costs](07_routing_and_costs.ipynb)."
                ),
            ]
        ),
    )
)

# ---------------------------------------------------------------------------
# 07 — Routing & cost attribution
# ---------------------------------------------------------------------------
NOTEBOOKS.append(
    (
        "07_routing_and_costs.ipynb",
        nb(
            [
                md(
                    "# Routing & cost attribution across providers\n"
                    "\n"
                    "Aura fronts many providers behind one endpoint. Each response reports usage and cost\n"
                    "(`usage.cost_usd`), and `metadata.aura.provider` tells you which provider actually served\n"
                    "the request — handy for verifying fallback/routing rules and feeding cost dashboards\n"
                    "(the admin UI and `/metrics` expose the same data)."
                ),
                code(
                    "from aura import AuraClient\n"
                    "\n"
                    "client = AuraClient()"
                ),
                code(
                    "# Hit three providers through one gateway endpoint\n"
                    "models = [\"gpt-5.4-mini\", \"claude-sonnet-4-6\", \"gemini-2.5-flash\"]\n"
                    "\n"
                    "for model in models:\n"
                    "    response = client.responses.create(\n"
                    "        model=model,\n"
                    "        input=\"Explain what an LLM gateway does in one sentence.\",\n"
                    "    )\n"
                    "    provider = None\n"
                    "    if response.metadata and response.metadata.aura:\n"
                    "        provider = response.metadata.aura.provider\n"
                    "    u = response.usage\n"
                    "    tokens = f\"{u.input_tokens} in / {u.output_tokens} out\" if u else \"n/a\"\n"
                    "    cost = f\"${u.cost_usd:.6f}\" if (u and u.cost_usd is not None) else \"n/a\"\n"
                    "    print(f\"{model:22} provider={provider or 'unknown':10} {tokens:18} cost={cost}\")"
                ),
                code(
                    "# The same numbers power the admin dashboard and /metrics:\n"
                    "#   curl -s localhost:8080/metrics | grep aura_cost\n"
                    "print(\"See the admin dashboard and /metrics for aggregated cost.\")"
                ),
                md(
                    "Cost attribution is per-request; routing rules decide which provider handles which\n"
                    "model. If `provider` comes back `unknown`, your gateway build predates the\n"
                    "`metadata.aura` block — upgrade and it appears automatically.\n"
                    "\n"
                    "That's the full evaluator tour: quickstart → streaming → tools → compression → validation\n"
                    "→ feedback → routing/costs."
                ),
            ]
        ),
    )
)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, notebook in NOTEBOOKS:
        path = os.path.join(OUT, name)
        with open(path, "w") as f:
            json.dump(notebook, f, indent=1)
        # sanity: re-parse
        with open(path) as f:
            json.load(f)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
