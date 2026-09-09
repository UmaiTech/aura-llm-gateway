# Auto-router tooling

Scripts that work with the complexity-based auto router
(`docs/api/auto-routing.md`).

| Script | What it does |
|--------|--------------|
| `replay.py` | Re-scores captured traffic through `POST /admin/routing/score` (dry run) and reports tier distribution, selected models and projected vs. actual cost. Can emit per-request feature rows as JSONL for training. |
| `train_cost.py` | Trains the cost model: one closed-form ridge regression per model of `log1p(output_tokens)` on the feature vector (numpy optional) (plus a global fallback and training-time price snapshots) from `routing_decisions` ⨝ `request_logs`; exports the `cost_lr` weights JSON and can push + activate it. Powers `within_tier: predicted_cost` and `routing.max_cost_usd`. |
| `synth.py` | Synthetic training traces: `profile` fetches the live feature profile, `generate` writes cheap-model requests from calibrated specs (shape-verified, deduplicated), `label` runs the tier ladder and the gateway judge, `ingest` upserts the rows as `source = synthetic` gold, `report` summarises a labelled file. Every call carries `x-aura-synthetic` so nothing pollutes live stats. |
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

## Synthetic traces

Live gold pairs never cover tool loops, multi-turn requests or the middle
tiers. `synth.py` fills those gaps; the design is in
`docs/internal/auto-router-synthetic-traces-plan.md`.

```bash
export AURA_GATEWAY=https://gateway AURA_SYNTH_KEY=aura_live_...   # key of a dedicated synthetic org
# that org needs settings.routing.auto.allow_synthetic: true, or the gateway
# ignores the x-aura-synthetic header and the run pollutes live stats
export AURA_ADMIN_KEY=...
python3 synth.py profile --out profile.json                       # no text leaves the gateway
python3 synth.py generate --n 500 --profile profile.json --out requests.jsonl --budget-usd 3
python3 synth.py label --input requests.jsonl --out labelled.jsonl --cost-rows cost_rows.jsonl --budget-usd 40
python3 synth.py report --input labelled.jsonl
python3 synth.py ingest --input labelled.jsonl --batch-id 2026-09-08a
python3 train.py --days 90 --holdout-real --min-live-accuracy 0.70 --out router-weights.json
python3 train_cost.py --input cost_rows.jsonl --out cost-weights.json
```

Generation defaults to `gpt-5.6-luna` (70 %) and `claude-haiku-4-5` (30 %);
change it with `--generators model:weight,...`. Both `generate` and `label`
stop at `--budget-usd`, at `--max-calls`, and (for `generate`) after
`--max-idle-batches` batches that produced nothing, so a misconfigured run
cannot spend unbounded money. `label` picks the cheapest listed model of
each tier from `GET /v1/models` and the first model of `--reference-tier`
(default `reasoning`) as the reference; A/B order is randomised per judge
call and verdicts below `--confidence-floor` count as ties. Rows whose
ladder label disagrees with the intended level keep `--disagreement-weight`
(0.5). Re-ingesting a batch is idempotent (upsert by prompt hash).
