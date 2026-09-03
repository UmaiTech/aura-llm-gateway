#!/usr/bin/env python3
"""Re-score captured traffic through the auto router and report what it
would have done.

Reads request bodies either from a JSON Lines file (one CreateResponseRequest
per line) or straight from the gateway's request_logs table (rows captured
with AURA_PAYLOAD_CAPTURE=on), posts each one to POST /admin/routing/score
(a dry run: nothing is dispatched or recorded), and prints the tier
distribution, the models auto would have picked, and the projected cost
against what the request actually cost.

Examples:

    # From the database (last 7 days of captured requests)
    DATABASE_URL=postgres://... AURA_ADMIN_KEY=... \
        python3 scripts/router/replay.py --gateway http://localhost:8080 --days 7

    # From a file
    python3 scripts/router/replay.py --gateway http://localhost:8080 \
        --input requests.jsonl --admin-key $AURA_ADMIN_KEY

    # Emit per-request rows for training (features + decision), JSONL
    python3 scripts/router/replay.py ... --out scored.jsonl

Only the Python standard library is required for --input; reading from the
database needs psycopg (pip install "psycopg[binary]").
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from collections import Counter, defaultdict


def score(gateway: str, admin_key: str, body: dict) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{gateway.rstrip('/')}/admin/routing/score",
        data=data,
        method="POST",
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {admin_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def rows_from_file(path: str):
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            body = obj.get("request_body", obj)
            yield {
                "response_id": obj.get("response_id"),
                "model_id": obj.get("model_id") or body.get("model"),
                "input_tokens": obj.get("input_tokens"),
                "output_tokens": obj.get("output_tokens"),
                "cost_usd": obj.get("cost_usd"),
                "request_body": body,
            }


def rows_from_db(database_url: str, days: int, limit: int):
    try:
        import psycopg  # type: ignore
    except ImportError:  # pragma: no cover
        sys.exit("reading from the database needs psycopg: pip install 'psycopg[binary]'")
    sql = """
        SELECT response_id, model_id, input_tokens, output_tokens, cost_usd::float8, request_body
        FROM request_logs
        WHERE request_body IS NOT NULL
          AND request_body ? 'input'
          AND created_at >= NOW() - (%s * INTERVAL '1 day')
        ORDER BY created_at DESC
        LIMIT %s
    """
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (days, limit))
            for response_id, model_id, itok, otok, cost, body in cur:
                yield {
                    "response_id": response_id,
                    "model_id": model_id,
                    "input_tokens": itok,
                    "output_tokens": otok,
                    "cost_usd": cost,
                    "request_body": body,
                }


def blended_price(decision: dict, model: str) -> float | None:
    for c in decision.get("candidates", []):
        if c.get("model") == model and c.get("cost_per_million") is not None:
            return float(c["cost_per_million"])
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gateway", default=os.environ.get("AURA_GATEWAY", "http://localhost:8080"))
    ap.add_argument("--admin-key", default=os.environ.get("AURA_ADMIN_KEY", ""))
    ap.add_argument("--input", help="JSONL file of request bodies (or request_logs rows)")
    ap.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--limit", type=int, default=5000)
    ap.add_argument("--mode", choices=["cost", "balanced", "quality"], help="force a mode")
    ap.add_argument("--out", help="write per-request scored rows as JSONL")
    args = ap.parse_args()

    if args.input:
        rows = rows_from_file(args.input)
    elif args.database_url:
        rows = rows_from_db(args.database_url, args.days, args.limit)
    else:
        ap.error("give --input or --database-url (or DATABASE_URL)")

    out = open(args.out, "w", encoding="utf-8") if args.out else None
    tiers: Counter[str] = Counter()
    selected: Counter[str] = Counter()
    per_tier_models: dict[str, Counter[str]] = defaultdict(Counter)
    actual_cost = 0.0
    projected_cost = 0.0
    costed = 0
    total = 0
    errors = 0

    for row in rows:
        body = dict(row["request_body"])
        body["model"] = f"auto:{args.mode}" if args.mode else "auto"
        body["stream"] = False
        try:
            decision = score(args.gateway, args.admin_key, body)
        except urllib.error.HTTPError as e:
            errors += 1
            if errors <= 3:
                print(f"score failed ({e.code}) for {row.get('response_id')}: {e.read()[:200]!r}", file=sys.stderr)
            continue
        except Exception as e:  # noqa: BLE001
            errors += 1
            if errors <= 3:
                print(f"score failed for {row.get('response_id')}: {e}", file=sys.stderr)
            continue

        total += 1
        tier = decision.get("tier", "?")
        model = decision.get("selected", "?")
        tiers[tier] += 1
        selected[model] += 1
        per_tier_models[tier][model] += 1

        itok = row.get("input_tokens") or 0
        otok = row.get("output_tokens") or 0
        if row.get("cost_usd") is not None and (itok or otok):
            price = blended_price(decision, model)
            if price is not None:
                actual_cost += float(row["cost_usd"])
                projected_cost += (itok + otok) * price / 1_000_000
                costed += 1

        if out:
            out.write(
                json.dumps(
                    {
                        "response_id": row.get("response_id"),
                        "actual_model": row.get("model_id"),
                        "actual_cost_usd": row.get("cost_usd"),
                        "input_tokens": itok,
                        "output_tokens": otok,
                        "tier": tier,
                        "classified_tier": decision.get("classified_tier"),
                        "score": decision.get("score"),
                        "raw_score": decision.get("raw_score"),
                        "selected": model,
                        "features": decision.get("features"),
                        "signals": decision.get("signals"),
                        "hard_filters": decision.get("hard_filters"),
                    }
                )
                + "\n"
            )

    if out:
        out.close()

    if total == 0:
        print("no requests scored", file=sys.stderr)
        return 1

    print(f"scored {total} requests ({errors} failed)\n")
    print("tier distribution")
    for tier in ("simple", "medium", "complex", "reasoning"):
        n = tiers.get(tier, 0)
        print(f"  {tier:<10} {n:>7}  {100.0 * n / total:5.1f}%")
    print("\nselected models")
    for model, n in selected.most_common(15):
        print(f"  {model:<48} {n:>7}  {100.0 * n / total:5.1f}%")
    if costed:
        delta = actual_cost - projected_cost
        pct = 100.0 * delta / actual_cost if actual_cost else 0.0
        print(f"\ncost over {costed} requests with known prices")
        print(f"  actual     ${actual_cost:,.4f}")
        print(f"  projected  ${projected_cost:,.4f}")
        print(f"  saving     ${delta:,.4f}  ({pct:+.1f}%)")
        print("  (projected = same token counts at the auto-selected model's blended price)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
