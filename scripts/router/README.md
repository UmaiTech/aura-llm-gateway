# Auto-router tooling

Scripts that work with the complexity-based auto router
(`docs/api/auto-routing.md`).

| Script | What it does |
|--------|--------------|
| `replay.py` | Re-scores captured traffic through `POST /admin/routing/score` (dry run) and reports tier distribution, selected models and projected vs. actual cost. Can emit per-request feature rows as JSONL for training. |
| `train.py` | Trains the learned classifier (multinomial logistic regression, pure standard library) from gold pairs and outcomes in the database or a labelled JSONL file, calibrates tier boundaries to a target strong-model share, writes the weights JSON the gateway loads, and can push + activate it through `POST /admin/routing/models`. |

`replay.py` needs only the standard library when reading from a JSONL file;
reading from `request_logs` needs `pip install "psycopg[binary]"` and
`DATABASE_URL`. Payload capture (`AURA_PAYLOAD_CAPTURE=on` plus the org
setting) must have been on for rows to have a `request_body`.

## Training loop

1. Let shadow scoring and the outcome rollup run, and set `gold_sample_rate`
   to a small value (e.g. `0.01`) for a while.
2. `train.py --days 60 --strong-pct 30 --out router-weights.json` prints
   per-tier precision / recall on a holdout split and the calibrated
   boundaries.
3. `train.py ... --push http://gateway --admin-key ... --activate` stores the
   model in `router_models` and loads it. Send `routing.classifier: learned`
   on a request, or set `default_classifier: learned` on one organization to
   A/B it against the heuristic; decisions record `classifier: learned@<version>`.
4. `POST /admin/routing/models/deactivate` rolls back to the heuristic.

Feature names and order are shared with `crates/aura-core/src/router/auto/learned.rs`;
the gateway rejects a model whose feature list differs.
