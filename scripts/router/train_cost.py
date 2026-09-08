#!/usr/bin/env python3
"""Train the auto router's cost model and export it for the gateway.

For every model the gateway has answered with, fits a ridge regression of
log1p(output_tokens) on the same 24-number feature vector the tier
classifier uses (FEATURE_NAMES, kept in lock-step with
crates/aura-core/src/router/auto/learned.rs), plus a global head for
models with too few rows. The gateway multiplies the predicted output
length by each candidate's prices to get a per-request cost, which the
`within_tier: predicted_cost` strategy ranks on and `routing.max_cost_usd`
budgets against. Pure standard library; uses numpy for the solve when it
is installed.

Rows come from routing_decisions (features) joined with request_logs
(model that answered, input/output tokens, cost) for both applied and
shadow decisions, so pinned-model traffic trains the model too; or from a
JSONL file with `features`, `model`, `output_tokens` (and optionally
`input_tokens`, `cost_usd`) per line.

Examples:

    DATABASE_URL=postgres://... python3 scripts/router/train_cost.py --days 60 --out cost-weights.json

    python3 scripts/router/train_cost.py --input rows.jsonl --out cost-weights.json \
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
from collections import defaultdict

from train import FEATURE_NAMES, featurize, standardise  # noqa: E402

MIN_ROWS_PER_MODEL = 30


def rows_from_file(path: str):
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            feats = obj.get("features")
            model = obj.get("model") or obj.get("actual_model")
            out = obj.get("output_tokens")
            if isinstance(feats, dict) and model and out is not None:
                yield feats, model, int(out), obj.get("input_tokens"), obj.get("cost_usd"), obj.get("source", "file")


def rows_from_db(database_url: str, days: int):
    try:
        import psycopg  # type: ignore
    except ImportError:  # pragma: no cover
        sys.exit("reading from the database needs psycopg: pip install 'psycopg[binary]'")
    sql = """
        SELECT d.features, rl.model_id, rl.output_tokens, rl.input_tokens, rl.cost_usd::float8
        FROM routing_decisions d
        JOIN request_logs rl ON rl.response_id = d.response_id
        WHERE rl.status = 'completed'
          AND rl.output_tokens IS NOT NULL
          AND d.created_at >= NOW() - (%s * INTERVAL '1 day')
    """
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (days,))
            for feats, model, out, inp, cost in cur:
                yield feats, model, int(out), inp, cost, "db"


def _solve(A: list[list[float]], b: list[float]) -> list[float]:
    """Solve A x = b by Gaussian elimination with partial pivoting."""
    n = len(A)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(M[r][col]))
        if abs(M[pivot][col]) < 1e-12:
            raise ValueError("singular system; raise --l2")
        M[col], M[pivot] = M[pivot], M[col]
        inv = 1.0 / M[col][col]
        for r in range(n):
            if r == col:
                continue
            f = M[r][col] * inv
            if f == 0.0:
                continue
            row_c = M[col]
            row_r = M[r]
            for c in range(col, n + 1):
                row_r[c] -= f * row_c[c]
    return [M[i][n] / M[i][i] for i in range(n)]


def ridge_fit(Z: list[list[float]], y: list[float], l2: float, w: list[float] | None = None):
    """Closed-form ridge regression; returns (coef, intercept).

    Minimises (1/2n) sum (b + w.z - y)^2 + (l2/2) |w|^2 with the intercept
    unpenalised, i.e. the normal equations

        [Z'Z/n + l2 I   Z'1/n] [w]   [Z'y/n]
        [1'Z/n          1    ] [b] = [mean y]

    solved directly (numpy when available, else a pure-Python solve). The
    system is (d+1) x (d+1) with d = 24, so this is instant regardless of
    row count.
    """
    n = len(Z)
    d = len(Z[0])
    w = w or [1.0] * n
    try:
        import numpy as np  # type: ignore

        Za = np.asarray(Z, dtype=float)
        ya = np.asarray(y, dtype=float)
        wa = np.asarray(w, dtype=float)
        X = np.hstack([Za, np.ones((n, 1))])
        A = (X * wa[:, None]).T @ X / n
        A[:d, :d] += l2 * np.eye(d)
        sol = np.linalg.solve(A, (X * wa[:, None]).T @ ya / n)
        return [float(v) for v in sol[:d]], float(sol[d])
    except ImportError:
        pass

    # Weighted Gram matrix of [Z | 1] scaled by 1/n, plus ridge on the
    # weight block (weights scale each row's contribution).
    A = [[0.0] * (d + 1) for _ in range(d + 1)]
    rhs = [0.0] * (d + 1)
    for z, yi, wi in zip(Z, y, w):
        for i in range(d):
            zi = z[i] * wi
            if zi == 0.0:
                continue
            row = A[i]
            for j in range(d):
                row[j] += zi * z[j]
            row[d] += zi
            rhs[i] += zi * yi
        rhs[d] += yi * wi
    for i in range(d):
        A[d][i] = A[i][d]
    A[d][d] = float(sum(w))
    for i in range(d + 1):
        for j in range(d + 1):
            A[i][j] /= n
        rhs[i] /= n
        if i < d:
            A[i][i] += l2
    sol = _solve(A, rhs)
    return sol[:d], sol[d]


def evaluate(w, b, Z, y):
    if not Z:
        return {}
    errs = [abs(math.expm1(b + sum(w[j] * x[j] for j in range(len(x)))) - math.expm1(yi)) for x, yi in zip(Z, y)]
    logerr = [abs(b + sum(w[j] * x[j] for j in range(len(x))) - yi) for x, yi in zip(Z, y)]
    errs.sort()
    return {
        "rows": len(Z),
        "median_abs_error_tokens": round(errs[len(errs) // 2], 1),
        "mean_abs_log_error": round(sum(logerr) / len(logerr), 3),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", help="JSONL with features, model, output_tokens per line")
    ap.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    ap.add_argument("--days", type=int, default=60)
    ap.add_argument("--out", default="cost-weights.json")
    ap.add_argument("--name", default="cost-lr")
    ap.add_argument("--version", default=None)
    ap.add_argument("--l2", type=float, default=1e-2)
    ap.add_argument("--holdout", type=float, default=0.2)
    ap.add_argument("--min-rows", type=int, default=50)
    ap.add_argument("--push", help="gateway base URL to POST the model to /admin/routing/models")
    ap.add_argument("--admin-key", default=os.environ.get("AURA_ADMIN_KEY", ""))
    ap.add_argument("--activate", action="store_true")
    ap.add_argument("--synthetic-weight", type=float, default=0.5, help="weight of rows with source=synthetic")
    ap.add_argument("--no-synthetic", action="store_true", help="ignore rows with source=synthetic")
    args = ap.parse_args()

    if args.input:
        rows = list(rows_from_file(args.input))
    elif args.database_url:
        rows = list(rows_from_db(args.database_url, args.days))
    else:
        ap.error("give --input or --database-url (or DATABASE_URL)")

    if args.no_synthetic:
        rows = [r for r in rows if r[5] != "synthetic"]
    if len(rows) < args.min_rows:
        print(f"only {len(rows)} rows (need {args.min_rows})", file=sys.stderr)
        return 1

    random.Random(5).shuffle(rows)
    X = [featurize(f) for f, _, _, _, _, _ in rows]
    y = [math.log1p(max(0, out)) for _, _, out, _, _, _ in rows]
    wts = [args.synthetic_weight if src == "synthetic" else 1.0 for _, _, _, _, _, src in rows]
    Z, mean, scale = standardise(X)
    n_hold = int(len(Z) * args.holdout) if args.holdout > 0 else 0
    sources = {}
    for r in rows:
        sources[r[5]] = sources.get(r[5], 0) + 1

    # Global head.
    gw, gb = ridge_fit(Z[n_hold:], y[n_hold:], args.l2, wts[n_hold:])
    metrics = {"global": {"train": evaluate(gw, gb, Z[n_hold:], y[n_hold:]), "holdout": evaluate(gw, gb, Z[:n_hold], y[:n_hold])}}

    # Per-model heads.
    by_model: dict[str, list[int]] = defaultdict(list)
    for i, (_, model, _, _, _, _) in enumerate(rows):
        by_model[model].append(i)
    heads = {}
    per_model_metrics = {}
    for model, idxs in sorted(by_model.items()):
        if len(idxs) < MIN_ROWS_PER_MODEL:
            per_model_metrics[model] = {"rows": len(idxs), "skipped": "too few rows"}
            continue
        tr = [i for i in idxs if i >= n_hold]
        ho = [i for i in idxs if i < n_hold]
        if len(tr) < MIN_ROWS_PER_MODEL // 2:
            tr, ho = idxs, []
        w, b = ridge_fit([Z[i] for i in tr], [y[i] for i in tr], args.l2, [wts[i] for i in tr])
        heads[model] = {"coef": [round(v, 6) for v in w], "intercept": round(b, 6), "rows": len(tr)}
        per_model_metrics[model] = {
            "train": evaluate(w, b, [Z[i] for i in tr], [y[i] for i in tr]),
            "holdout": evaluate(w, b, [Z[i] for i in ho], [y[i] for i in ho]),
        }
    metrics["per_model"] = per_model_metrics
    metrics["sources"] = sources
    metrics["synthetic_weight"] = args.synthetic_weight

    # Implied prices from rows that carry cost: cost = (in*pi + out*po)/1e6.
    # Two-parameter least squares per model; falls back to nothing when the
    # gateway's catalog will price the model anyway.
    prices = {}
    for model, idxs in by_model.items():
        pts = [(rows[i][3] or 0, rows[i][2], rows[i][4]) for i in idxs if rows[i][4] is not None and (rows[i][3] or 0) + rows[i][2] > 0]
        if len(pts) < 5:
            continue
        # Solve normal equations for [pi, po] in units of USD per token.
        s_ii = sum(a * a for a, _, _ in pts)
        s_io = sum(a * b for a, b, _ in pts)
        s_oo = sum(b * b for _, b, _ in pts)
        s_ic = sum(a * c for a, _, c in pts)
        s_oc = sum(b * c for _, b, c in pts)
        det = s_ii * s_oo - s_io * s_io
        if det <= 1e-18:
            continue
        pi = (s_ic * s_oo - s_oc * s_io) / det
        po = (s_oc * s_ii - s_ic * s_io) / det
        if pi >= 0 and po >= 0:
            prices[model] = {"input_per_million": round(pi * 1e6, 6), "output_per_million": round(po * 1e6, 6)}

    import datetime as _dt

    version = args.version or _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    model_json = {
        "kind": "cost_lr",
        "name": args.name,
        "version": version,
        "feature_names": FEATURE_NAMES,
        "mean": [round(v, 6) for v in mean],
        "scale": [round(v, 6) for v in scale],
        "heads": heads,
        "global": {"coef": [round(v, 6) for v in gw], "intercept": round(gb, 6), "rows": len(Z) - n_hold},
        "prices": prices,
        "metrics": metrics,
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(model_json, fh, indent=2)
    print(json.dumps({"rows": len(rows), "heads": sorted(heads), "global": metrics["global"]}, indent=2))
    print(f"wrote {args.out} ({args.name}@{version})")

    if args.push:
        body = json.dumps({"weights": model_json, "activate": args.activate}).encode()
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
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    sys.exit(main())
