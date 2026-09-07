# Auto-router tooling

Scripts that work with the complexity-based auto router
(`docs/api/auto-routing.md`).

| Script | What it does |
|--------|--------------|
| `replay.py` | Re-scores captured traffic through `POST /admin/routing/score` (dry run) and reports tier distribution, selected models and projected vs. actual cost. Can emit per-request feature rows as JSONL for training. |
| `train_cost.py` | Trains the cost model: one closed-form ridge regression per model of `log1p(output_tokens)` on the feature vector (numpy optional) (plus a global fallback and training-time price snapshots) from `routing_decisions` ⨝ `request_logs`; exports the `cost_lr` weights JSON and can push + activate it. Powers `within_tier: predicted_cost` and `routing.max_cost_usd`. |
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

## Cost model

`train_cost.py` needs only completed requests with token counts, so it can
be trained as soon as shadow scoring has run for a while (pinned-model
traffic counts). Activate it with `--push ... --activate`, then set
`within_tier: predicted_cost` in `routing.auto` to rank candidates by the
predicted cost of *this* request instead of list price, and send
`routing.max_cost_usd` on a request (or set it on an organization) to keep
a request within budget. `POST /admin/routing/models/deactivate?kind=cost_lr`
rolls back.
