#!/usr/bin/env python3
"""Train the auto router's learned classifier and export it for the gateway.

Multinomial logistic regression over the gateway's numeric feature vector
(the 24 names in FEATURE_NAMES, kept in lock-step with
crates/aura-core/src/router/auto/learned.rs). Pure standard library: no
numpy, no scikit-learn, so it runs anywhere the gateway does.

Labels come from the decision log:

* gold pairs (routing_gold_pairs): the cheap tier when the judge said the
  cheap answer sufficed (verdict a / tie), the strong tier otherwise;
* applied decisions with outcomes (routing_outcomes): the dispatched tier
  when reward >= +0.5 (the user moved on / approved), one tier up when the
  reward was <= -0.5 (correction / escalation / rejected / failed);
* a JSONL file with `features` and `label` (or `tier`) per line, for
  example the output of replay.py --out enriched with labels.

The exported JSON carries standardisation stats, weights, intercepts, a
metrics block, and tier boundaries calibrated so that a target share of
the training traffic lands on the complex + reasoning tiers
(--strong-pct, RouteLLM-style).

Examples:

    DATABASE_URL=postgres://... python3 scripts/router/train.py --days 60 \
        --out router-weights.json --strong-pct 30

    python3 scripts/router/train.py --input labelled.jsonl --out weights.json

    # store + activate on a gateway
    python3 scripts/router/train.py --input labelled.jsonl --out weights.json \
        --push http://localhost:8080 --admin-key $AURA_ADMIN_KEY --activate
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import urllib.request
from collections import Counter

TIERS = ["simple", "medium", "complex", "reasoning"]

FEATURE_NAMES = [
    "log_input_tokens",
    "log_last_user_tokens",
    "input_items",
    "user_messages",
    "function_call_outputs",
    "is_continuation",
    "is_tool_loop_turn",
    "tool_count",
    "tool_required",
    "has_images",
    "log_max_output_tokens",
    "code",
    "code_matches",
    "reasoning",
    "reasoning_matches",
    "technical",
    "technical_matches",
    "simple",
    "simple_matches",
    "multi_step",
    "question_marks",
    "intent_quick",
    "intent_deep",
    "non_ascii_ratio",
]


def featurize(f: dict) -> list[float]:
    """Mirror of `featurize` in learned.rs over a RequestFeatures JSON object."""

    def ln1p(x):
        return math.log((x or 0) + 1.0)

    def cap(x):
        return float(min(x or 0, 50))

    def b(x):
        return 1.0 if x else 0.0

    intent = f.get("explicit_intent")
    return [
        ln1p(f.get("est_input_tokens")),
        ln1p(f.get("est_last_user_tokens")),
        cap(f.get("input_items")),
        cap(f.get("user_messages")),
        cap(f.get("function_call_outputs")),
        b(f.get("is_continuation")),
        b(f.get("is_tool_loop_turn")),
        cap(f.get("tool_count")),
        b(f.get("tool_required")),
        b(f.get("has_images")),
        ln1p(f.get("max_output_tokens")),
        float(f.get("code") or 0.0),
        cap(f.get("code_matches")),
        float(f.get("reasoning") or 0.0),
        cap(f.get("reasoning_matches")),
        float(f.get("technical") or 0.0),
        cap(f.get("technical_matches")),
        float(f.get("simple") or 0.0),
        cap(f.get("simple_matches")),
        float(f.get("multi_step") or 0.0),
        cap(f.get("question_marks")),
        b(intent == "quick"),
        b(intent == "deep"),
        float(f.get("non_ascii_ratio") or 0.0),
    ]


# --------------------------------------------------------------------------
# data sources
# --------------------------------------------------------------------------


def rows_from_file(path: str):
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            label = obj.get("label") or obj.get("label_tier") or obj.get("tier")
            feats = obj.get("features")
            if label in TIERS and isinstance(feats, dict):
                yield feats, label, obj.get("source", "file"), float(obj.get("weight", 1.0)), obj.get("split", "train")


def rows_from_db(database_url: str, days: int):
    try:
        import psycopg  # type: ignore
    except ImportError:  # pragma: no cover
        sys.exit("reading from the database needs psycopg: pip install 'psycopg[binary]'")
    gold_sql = """
        SELECT features, tier_a, tier_b, verdict, source, label_tier, split, weight
        FROM routing_gold_pairs
        WHERE (verdict IS NOT NULL OR label_tier IS NOT NULL)
          AND created_at >= NOW() - (%s * INTERVAL '1 day')
    """
    outcome_sql = """
        SELECT d.features, d.tier, o.reward
        FROM routing_outcomes o
        JOIN routing_decisions d ON d.response_id = o.response_id
        WHERE NOT o.shadow
          AND o.decided_at >= NOW() - (%s * INTERVAL '1 day')
    """
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(gold_sql, (days,))
            for feats, tier_a, tier_b, verdict, source, label_tier, split, weight in cur:
                if label_tier in TIERS:
                    label = label_tier
                elif verdict is not None:
                    label = tier_a if verdict in ("a", "tie") else tier_b
                else:
                    continue
                if label in TIERS:
                    src = "synthetic" if source == "synthetic" else "gold"
                    yield feats, label, src, float(weight or 1.0), split or "train"
            cur.execute(outcome_sql, (days,))
            for feats, tier, reward in cur:
                if tier not in TIERS:
                    continue
                idx = TIERS.index(tier)
                if reward >= 0.5:
                    yield feats, tier, "outcome", 1.0, "train"
                elif reward <= -0.5:
                    yield feats, TIERS[min(idx + 1, 3)], "outcome", 1.0, "train"


# --------------------------------------------------------------------------
# model
# --------------------------------------------------------------------------


def standardise(X: list[list[float]]):
    n = len(X)
    d = len(X[0])
    mean = [sum(row[j] for row in X) / n for j in range(d)]
    var = [sum((row[j] - mean[j]) ** 2 for row in X) / n for j in range(d)]
    scale = [math.sqrt(v) if v > 1e-12 else 1.0 for v in var]
    Z = [[(row[j] - mean[j]) / scale[j] for j in range(d)] for row in X]
    return Z, mean, scale


def softmax(z: list[float]) -> list[float]:
    m = max(z)
    e = [math.exp(v - m) for v in z]
    s = sum(e)
    return [v / s for v in e]


def predict_probs(W, b, x):
    return softmax([b[c] + sum(W[c][j] * x[j] for j in range(len(x))) for c in range(4)])


def train_softmax(Z, y, epochs=300, lr=0.1, l2=1e-3, class_weight=None, seed=7, sample_weight=None):
    """Full-batch gradient descent with L2; small data sizes make this fine.

    `sample_weight` scales each row's gradient (synthetic rows are
    down-weighted through it)."""
    rng = random.Random(seed)
    n = len(Z)
    d = len(Z[0])
    W = [[rng.uniform(-0.01, 0.01) for _ in range(d)] for _ in range(4)]
    b = [0.0] * 4
    cw = class_weight or {c: 1.0 for c in range(4)}
    sw = sample_weight or [1.0] * n
    for _ in range(epochs):
        gW = [[0.0] * d for _ in range(4)]
        gb = [0.0] * 4
        for x, yi, swi in zip(Z, y, sw):
            p = predict_probs(W, b, x)
            w = cw[yi] * swi
            for c in range(4):
                err = (p[c] - (1.0 if c == yi else 0.0)) * w
                gb[c] += err
                for j in range(d):
                    gW[c][j] += err * x[j]
        for c in range(4):
            b[c] -= lr * gb[c] / n
            for j in range(d):
                W[c][j] -= lr * (gW[c][j] / n + l2 * W[c][j])
    return W, b


def expected_score(p: list[float]) -> float:
    return sum(p[i] * i / 3.0 for i in range(4))


def calibrate_boundaries(scores: list[float], strong_pct: float | None, defaults):
    """Pick boundaries so that `strong_pct` percent of the training scores
    land on complex + reasoning; simple/medium and complex/reasoning splits
    keep the defaults' relative spacing."""
    if not strong_pct or not scores:
        return defaults
    s = sorted(scores)
    q = max(0.0, min(1.0, 1.0 - strong_pct / 100.0))
    idx = min(len(s) - 1, int(q * len(s)))
    medium_complex = s[idx]
    ratio_low = defaults["simple_medium"] / defaults["medium_complex"]
    ratio_high = defaults["complex_reasoning"] / defaults["medium_complex"]
    return {
        "simple_medium": round(medium_complex * ratio_low, 4),
        "medium_complex": round(medium_complex, 4),
        "complex_reasoning": round(min(0.99, medium_complex * ratio_high), 4),
    }


def evaluate(W, b, Z, y):
    conf = [[0] * 4 for _ in range(4)]
    for x, yi in zip(Z, y):
        pred = max(range(4), key=lambda c: predict_probs(W, b, x)[c])
        conf[yi][pred] += 1
    per_class = {}
    for c in range(4):
        tp = conf[c][c]
        fp = sum(conf[r][c] for r in range(4)) - tp
        fn = sum(conf[c]) - tp
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        per_class[TIERS[c]] = {"precision": round(prec, 3), "recall": round(rec, 3), "support": sum(conf[c])}
    acc = sum(conf[c][c] for c in range(4)) / max(1, len(y))
    return {"accuracy": round(acc, 3), "per_class": per_class, "confusion": conf}


# --------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", help="JSONL with features + label per line")
    ap.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    ap.add_argument("--days", type=int, default=60)
    ap.add_argument("--out", default="router-weights.json")
    ap.add_argument("--name", default="learned-lr")
    ap.add_argument("--version", default=None, help="defaults to a timestamp")
    ap.add_argument("--strong-pct", type=float, default=None, help="target share of complex+reasoning decisions")
    ap.add_argument("--epochs", type=int, default=300)
    ap.add_argument("--lr", type=float, default=0.1)
    ap.add_argument("--l2", type=float, default=1e-3)
    ap.add_argument("--holdout", type=float, default=0.2)
    ap.add_argument("--min-rows", type=int, default=50)
    ap.add_argument("--push", help="gateway base URL to POST the model to /admin/routing/models")
    ap.add_argument("--admin-key", default=os.environ.get("AURA_ADMIN_KEY", ""))
    ap.add_argument("--activate", action="store_true", help="activate on push")
    ap.add_argument("--synthetic-weight", type=float, default=0.5, help="multiplier on synthetic rows' weight")
    ap.add_argument("--max-synthetic-share", type=float, default=0.5, help="cap on synthetic rows as a share of training rows (subsampled above it)")
    ap.add_argument("--no-synthetic", action="store_true", help="ignore synthetic rows entirely")
    ap.add_argument("--holdout-real", action="store_true", help="draw the holdout from live rows only; synthetic holdout rows are reported separately")
    ap.add_argument("--min-live-accuracy", type=float, default=None, help="refuse to write/push when live-holdout accuracy is below this")
    args = ap.parse_args()

    if args.input:
        rows = list(rows_from_file(args.input))
    elif args.database_url:
        rows = list(rows_from_db(args.database_url, args.days))
    else:
        ap.error("give --input or --database-url (or DATABASE_URL)")

    if args.no_synthetic:
        rows = [r for r in rows if r[2] != "synthetic"]

    # Synthetic rows marked holdout at ingest are never trained on; they
    # form their own evaluation set.
    synthetic_holdout = [r for r in rows if r[2] == "synthetic" and r[4] == "holdout"]
    rows = [r for r in rows if not (r[2] == "synthetic" and r[4] == "holdout")]

    rng = random.Random(11)
    rng.shuffle(rows)
    live = [r for r in rows if r[2] != "synthetic"]
    synth = [r for r in rows if r[2] == "synthetic"]
    if synth and args.max_synthetic_share < 1.0 and live:
        cap = int(len(live) * args.max_synthetic_share / (1.0 - args.max_synthetic_share))
        if len(synth) > cap:
            print(f"subsampling synthetic rows {len(synth)} -> {cap} (--max-synthetic-share {args.max_synthetic_share})", file=sys.stderr)
            synth = synth[:cap]
    rows = live + synth
    rng.shuffle(rows)

    if len(rows) < args.min_rows:
        print(f"only {len(rows)} labelled rows (need {args.min_rows}); collect more gold pairs / outcomes", file=sys.stderr)
        return 1

    sources = Counter(src for _, _, src, _, _ in rows)
    labels = Counter(lbl for _, lbl, _, _, _ in rows)
    print(f"rows: {len(rows)}  sources: {dict(sources)}  labels: {dict(labels)}  synthetic holdout: {len(synthetic_holdout)}")

    # Holdout: a slice of all rows, or of live rows only (--holdout-real).
    n_hold = int(len(rows) * args.holdout) if args.holdout > 0 else 0
    if args.holdout_real and n_hold:
        n_hold = min(n_hold, len(live))
        ho_rows = [r for r in rows if r[2] != "synthetic"][:n_hold]
        ho_ids = set(id(r) for r in ho_rows)
        tr_rows = [r for r in rows if id(r) not in ho_ids]
    else:
        ho_rows, tr_rows = rows[:n_hold], rows[n_hold:]

    def vec(rs):
        return [featurize(f) for f, _, _, _, _ in rs], [TIERS.index(lbl) for _, lbl, _, _, _ in rs]

    if not tr_rows:
        print("no training rows left after the holdout split; lower --holdout", file=sys.stderr)
        return 1
    X_all, _ = vec(rows)
    _, mean, scale = standardise(X_all)

    def std(X):
        return [[(x[j] - mean[j]) / scale[j] for j in range(len(mean))] for x in X]

    X_tr, y_tr = vec(tr_rows)
    X_ho, y_ho = vec(ho_rows)
    Z_tr, Z_ho = std(X_tr), std(X_ho)
    Z = std(X_all)
    sample_weight = [w * (args.synthetic_weight if src == "synthetic" else 1.0) for _, _, src, w, _ in tr_rows]

    counts = Counter(y_tr)
    total = len(y_tr)
    class_weight = {c: (total / (4 * counts[c])) if counts.get(c) else 1.0 for c in range(4)}

    W, b = train_softmax(Z_tr, y_tr, epochs=args.epochs, lr=args.lr, l2=args.l2, class_weight=class_weight, sample_weight=sample_weight)
    metrics = {"train": evaluate(W, b, Z_tr, y_tr), "rows": len(rows), "sources": dict(sources), "labels": dict(labels),
               "synthetic_weight": args.synthetic_weight}
    if Z_ho:
        metrics["holdout"] = evaluate(W, b, Z_ho, y_ho)
        live_ho = [(z, yy) for z, yy, r in zip(Z_ho, y_ho, ho_rows) if r[2] != "synthetic"]
        if live_ho:
            metrics["holdout_live"] = evaluate(W, b, [z for z, _ in live_ho], [yy for _, yy in live_ho])
        synth_ho = [(z, yy) for z, yy, r in zip(Z_ho, y_ho, ho_rows) if r[2] == "synthetic"]
        if synth_ho:
            metrics["holdout_synthetic_slice"] = evaluate(W, b, [z for z, _ in synth_ho], [yy for _, yy in synth_ho])
    if synthetic_holdout:
        X_sh, y_sh = vec(synthetic_holdout)
        metrics["holdout_synthetic"] = evaluate(W, b, std(X_sh), y_sh)
    print(json.dumps({k: v for k, v in metrics.items() if k.startswith(("train", "holdout"))}, indent=2))

    live_acc = (metrics.get("holdout_live") or {}).get("accuracy")
    if args.min_live_accuracy is not None:
        if live_acc is None:
            print("--min-live-accuracy needs live rows in the holdout (use --holdout-real and a non-zero --holdout); none found, not writing", file=sys.stderr)
            return 3
        if live_acc < args.min_live_accuracy:
            print(f"live-holdout accuracy {live_acc:.3f} is below --min-live-accuracy {args.min_live_accuracy}; not writing", file=sys.stderr)
            return 3

    defaults = {"simple_medium": 0.15, "medium_complex": 0.35, "complex_reasoning": 0.60}
    scores = [expected_score(predict_probs(W, b, x)) for x in Z]
    boundaries = calibrate_boundaries(scores, args.strong_pct, defaults)
    metrics["boundaries"] = boundaries
    if args.strong_pct:
        strong = sum(1 for s in scores if s >= boundaries["medium_complex"]) / len(scores)
        metrics["strong_share"] = round(strong, 3)
        print(f"calibrated boundaries {boundaries} -> strong share {strong:.1%}")

    import datetime as _dt

    version = args.version or _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    model = {
        "name": args.name,
        "version": version,
        "feature_names": FEATURE_NAMES,
        "mean": [round(v, 6) for v in mean],
        "scale": [round(v, 6) for v in scale],
        "classes": TIERS,
        "coef": [[round(v, 6) for v in row] for row in W],
        "intercept": [round(v, 6) for v in b],
        "boundaries": boundaries,
        "metrics": metrics,
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(model, fh, indent=2)
    print(f"wrote {args.out} ({args.name}@{version})")

    if args.push:
        body = json.dumps({"weights": model, "activate": args.activate}).encode()
        req = urllib.request.Request(
            f"{args.push.rstrip('/')}/admin/routing/models",
            data=body,
            method="POST",
            headers={"content-type": "application/json", "authorization": f"Bearer {args.admin_key}"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            print("pushed:", json.load(resp))
    return 0


if __name__ == "__main__":
    sys.exit(main())
