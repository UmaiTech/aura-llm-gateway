# Synthetic traces for the auto router (PR 11 plan)

**Status:** proposal, September 2026. Stacks on [#226](https://github.com/UmaiTech/aura-llm-gateway/pull/226).
**Companion:** [auto-router-plan.md](./auto-router-plan.md) (the series this extends).

Use cheap models to generate realistic requests at controlled difficulty, label
them with the gateway's own judge, and feed them to the classifier (and the
cost model) alongside live data, without letting them pollute anything that
reflects real traffic.

## 1. Why

The learned classifier (PR 7) trains on two sources, and both are thin in the
places that matter:

| Source | What it labels | Gaps |
|---|---|---|
| Gold pairs (`routing_gold_pairs`) | A sampled prompt answered by the cheapest model of the **lowest** and **highest** populated tier, graded by a judge | Sample rate ~1 %. Self-contained single-turn text only: `is_gold_eligible` rejects tools, images, audio, continuations. Effectively a **binary** label (lowest vs highest tier): `medium` and `complex` never get a gold label. |
| Outcomes (`routing_outcomes`) | The dispatched tier when reward ≥ 0.5, one tier up when reward ≤ −0.5 | Noisy (move-on is a weak signal), applied decisions only, follows whatever the current router already does. |

Consequences: the middle tiers are learned only from noisy outcomes, tool loops
and multi-turn requests are never labelled, the `reasoning` tier is rare in
real traffic so its examples are few, and a fresh deployment has zero rows
until it has served weeks of traffic. Synthetic traces fix exactly these
holes: they can be stratified by tier, family and shape, and labelled with a
richer procedure than live sampling can afford.

## 2. What we reuse

| Piece | Where | Role in this plan |
|---|---|---|
| 24-number feature vector, `featurize` | `crates/aura-core/src/router/auto/{features,learned}.rs`, `scripts/router/train.py` | Synthetic rows are stored as features + label, exactly like live rows. No text is needed to train. |
| `POST /admin/routing/score` | `crates/aura-proxy/src/routes/admin.rs` | Turns any request body into its feature vector and a dry-run decision. Used to verify each generated request has the shape we asked for. |
| Judge prompt and parser, gold judge model | `crates/aura-core/src/router/auto/llm.rs`, `routing.auto.gold_judge_model` | The same grader labels synthetic rows, so synthetic and live labels share one definition of "cheap sufficed". |
| `routing_gold_pairs` + admin gold summary | migration 032, `routing_gold.rs`, admin Routing page | Synthetic rows land in the same table with a `source` column, so existing readers keep working. |
| `train.py` (`--input` JSONL with `source`), `train_cost.py`, `replay.py` | `scripts/router/` | Training, cost-model training and before/after evaluation. |
| Tier catalog and eligibility | `tiers.rs`, `GatewayEligibility` | Tells the labeller which model is the cheapest eligible one in each tier. |

## 3. Design

### 3.1 Taxonomy: what "realistic" means

Every synthetic request is generated from a **spec** with three axes.

**Family** (what the user is doing): general Q&A · writing / rewrite /
translate · coding (snippet, debug, refactor across files) · data and analysis
· math / logic / proofs · agentic tool use (search, calculator, CRUD-style
APIs) · extraction / classification with structured output · long-document
summarisation · chit-chat · planning and multi-step instructions.

**Level** (how hard, aligned to tiers, with a written rubric the generator and
the judge both see):

| Level | Tier | Rubric |
|---|---|---|
| L1 | `simple` | One fact, one rewrite, one short answer; no reasoning chain; a small model answers it correctly. |
| L2 | `medium` | Everyday assistant work; light code; a tool call with obvious arguments; a couple of steps. |
| L3 | `complex` | Multi-step engineering or analysis, debugging with context, long inputs, several constraints to satisfy at once. |
| L4 | `reasoning` | Proofs, derivations, tricky logic, ambiguous specs needing careful decomposition; explicit "think hard". |

**Shape** (what the request body looks like, which is what the features see):
single-turn · multi-turn (2 to 6 user messages) · tools declared (with
`tool_choice` auto / required) · tool-loop continuation (`function_call_output`
items plus `previous_response_id`) · long context (2k to 30k tokens of
generated documents) · non-English (share matched to traffic) · explicit
intent hints ("quick answer", "think step by step") · `max_output_tokens` set.
Images are out of scope for a text generator; a small fixed set of
public-domain images can synthesise `has_images` rows later if wanted.

### 3.2 Calibrating to real traffic without reading it

Realism is measured in feature space, because that is what the classifier
sees. A new admin endpoint, `GET /admin/routing/feature-profile?period=30d`,
returns per-tier quantiles of the 24 numeric features plus shape shares
(continuation %, tool %, multi-turn %, non-ASCII %). No text, so it is safe
to export from production.

`synth.py` samples target feature vectors from that profile, stratified by
tier with the tails oversampled, and turns each into a spec the generator can
follow ("about 350 input tokens, three tools declared, one tool result being
fed back, code-heavy, in Portuguese"). Optionally, `--seeds captured.jsonl`
takes captured payloads (org opt-in payload capture) as style anchors; the
generator is asked to write a *new* request in the same style, never to copy,
and every output is deduplicated by prompt hash and MinHash similarity
against live gold texts and against the batch.

### 3.3 Generation with a cheap model

`scripts/router/synth.py generate` calls a cheap model (default
`gpt-5.4-nano`, alternatives `gemini-3.1-flash-lite`, `claude-haiku-4-5`)
through the gateway itself with a pinned model and a dedicated synthetic API
key. Structured JSON output: a complete Open Responses request body (`input`
items, `instructions`, `tools`, `tool_choice`, `max_output_tokens`, hints)
plus the intended level and family. Five specs per call to cut cost, high
temperature for diversity.

Two cheap checks follow. **Self-rating**: the generator re-rates the
difficulty of each request it wrote; rows where intended and rated levels
differ by more than one are discarded. **Shape verification**: each body is
sent to `POST /admin/routing/score`; the realised feature vector must land in
the spec's bands (token range, tool count, continuation flags), otherwise the
row is regenerated. This keeps the feature distribution honest, which matters
more than prose quality.

For tool-loop rows the first turn is really sent (one cheap call) so that
`previous_response_id` refers to a stored response and `is_continuation` /
`is_tool_loop_turn` are true for the right reasons.

### 3.4 Labelling: a ladder, not a pair

Live gold compares only the lowest and highest tier. Synthetic rows can afford
a **ladder**: answer the request with the cheapest eligible model of each tier
in ascending order, and once with the strongest model as reference. The judge
grades each tier's answer against the reference; the label is the lowest tier
whose answer ties or beats it, else `reasoning`. Early stop once a tier ties,
so the average row costs about two answers plus the reference. For
tool-loop rows the judge grades the function call (name and arguments)
instead of prose, which is cheaper and stricter.

Three signals are stored per row: the generator's intended level (prior), the
ladder verdict (label), and optionally the LLM classifier's opinion via the
score endpoint with `routing.classifier = llm`. Rows where prior and label
disagree are kept, flagged, and down-weighted by default (they are the
informative ones). Judge-bias mitigations: A/B order swapped per call, a tie
when judge confidence is below 0.6, the same judge model as live gold so the
two label sets agree on what "sufficed" means, and the judge model excluded
from the ladder to avoid self-preference.

### 3.5 Storage, training and isolation

- **Migration `20260708_036`**: `routing_gold_pairs` gains `source`
  (`live | synthetic`, default `live`), `batch_id`, `split` (`train |
  holdout`), `intended_tier`, `label_tier`, `family`, `shape`, `weight`.
  `tier_a / tier_b / verdict` stay populated (best cheap tier vs reference) so
  the admin gold summary and `train.py` keep working unchanged.
  `routing_decisions` gains `synthetic BOOLEAN DEFAULT FALSE`.
- **Ingest**: `POST /admin/routing/gold/synthetic` upserts a batch by prompt
  hash, so the script only needs the admin key. `--database-url` stays as the
  direct path.
- **Isolation**: requests from the synthetic key carry
  `x-aura-synthetic: 1`; the gateway stamps `routing_decisions.synthetic` and
  every reader that reflects real traffic (`/admin/stats/routing/auto`,
  outcome rollup, Thompson arm stats, savings, live gold sampling) adds
  `AND NOT synthetic`. This is the one guardrail that must land with the first
  synthetic run.
- **`train.py`**: prefer `label_tier` when present; `--synthetic-weight 0.5`
  (default), `--no-synthetic`, `--holdout-real` (holdout drawn from live rows
  only); metrics reported for live and synthetic separately and per family;
  `--min-live-accuracy` refuses to push when accuracy on the live holdout drops
  below the currently active model's recorded metric.
- **Cost model**: every ladder answer is a real completion with real token
  counts, written to a JSONL that `train_cost.py --input` consumes, tagged
  synthetic and weighted the same way.

### 3.6 Evaluation

- `synth.py report`: label distribution per family / shape / tier, agreement
  rates (intent vs ladder vs LLM classifier), judge confidence histogram,
  dedupe stats, spend.
- Classifier A/B on every batch: train live-only versus live + synthetic and
  compare on (i) the live holdout gold, (ii) the synthetic holdout, (iii) a
  `replay.py` run over captured traffic (strong-model share and per-tier
  shift). Accept when live-holdout accuracy is within one point of the
  baseline and recall on `medium` and `complex` improves.
- Admin Routing page: gold section shows the live / synthetic split and the
  agreement rate.

### 3.7 Cost

Rough figures per 1,000 rows at September 2026 list prices, before early stop
savings.

| Step | Model class | Approx. USD |
|---|---|---|
| Generation, 5 specs per call, self-rating | nano / flash-lite | 1 |
| Shape verification via score endpoint | none | 0 |
| Ladder answers, about 2.3 per row | mixed tiers | 5 to 8 |
| Reference answer | strongest tier | 8 to 15 |
| Judge, about 2.3 calls per row | sonnet-class | 5 to 8 |
| **Total** | | **20 to 30** |

A 5,000-row batch is therefore in the 100 to 150 USD range. The reference
answer dominates; a `--reference-tier complex` option halves it for L1 to L3
specs at the cost of a slightly weaker ceiling. `--budget-usd` is a hard stop.

## 4. Risks and guards

| Risk | Guard |
|---|---|
| Distribution shift, model collapse (classifier learns the generator's style) | Feature-profile calibration; synthetic share capped at 50 % of rows and weighted 0.5; live-holdout accuracy gate on push. |
| Judge bias (verbosity, self-preference) | Order swap, confidence floor, judge excluded from the ladder, function-call grading for tool rows. |
| Leakage between train and holdout | Split by spec cluster (family × level × seed), not per row; MinHash dedupe. |
| Cost runaway | Dry-run estimate, `--budget-usd`, batch caps, early stop. |
| Privacy | Seeds only from opted-in payload capture and never stored verbatim; synthetic texts truncated like live gold (`gold_max_text_chars`). |
| Polluting live stats, arms, savings | `synthetic` flag on decisions and `AND NOT synthetic` in every real-traffic reader, covered by tests. |
| Generator refusals or malformed JSON | Retry with a second cheap model; rows failing shape verification are regenerated, never patched by hand. |

## 5. Scope of PR 11

Rust (gateway):
1. Migration 036: gold columns, `routing_decisions.synthetic`, indexes.
2. `x-aura-synthetic` header → decision flag; `AND NOT synthetic` in stats,
   rollup, arms, gold sampling; tests for each reader.
3. `GET /admin/routing/feature-profile` (numeric quantiles and shape shares).
4. `POST /admin/routing/gold/synthetic` batch ingest with validation against
   the feature vector.
5. Admin gold summary: source split and agreement.

Python (`scripts/router/`):
6. `synth.py` with `generate`, `label`, `ingest`, `report` subcommands,
   taxonomy and rubrics as data files, MinHash dedupe, budget accounting.
7. `train.py`: `label_tier`, synthetic weight and share cap, real-only
   holdout, live-accuracy gate. `train_cost.py`: synthetic tag and weight.

Docs and UI:
8. `docs/api/auto-routing.md` and `scripts/router/README.md` sections;
   admin Routing page gold section.

Roughly 1,500 lines. Could split as 11a (Rust: items 1 to 5) and 11b (Python
and docs: items 6 to 8) if reviewing in one go is too much.

## 6. Decisions needed

1. **Generator model**: default `gpt-5.4-nano`; alternatives flash-lite or
   haiku. Recommendation: nano, with flash-lite as the retry model.
2. **Judge**: keep `gold_judge_model` (`claude-sonnet-4-6`) for label
   consistency with live gold. Recommendation: yes.
3. **Labelling**: ladder (recommended) or the live pair procedure.
4. **Weight and share**: synthetic weight 0.5, share cap 50 %. Recommendation:
   these defaults, tunable per run.
5. **Seeds from captured payloads**: off by default; on only for orgs that
   opted into payload capture. Recommendation: off for the first batches.
6. **Isolation**: header flag plus a dedicated synthetic org and key
   (recommended) or org-only.
7. **Images**: out of scope for PR 11 (recommended).
8. **Batch budget**: default hard stop 50 USD per run.
