# Aura Gateway Benchmark Harness

Apples-to-apples load test of Aura against the major LLM gateways. Produces
the JSON that drives the `LoadTestChart` component on
[umai-tech.com/blog/building-aura-an-agentic-llm-gateway-in-rust](https://umai-tech.com/blog/building-aura-an-agentic-llm-gateway-in-rust).

## What this measures

**The variable is the gateway, not the LLM.** Six gateways, one provider
(Anthropic Claude Haiku 4.5 — `claude-haiku-4-5-20251001`), one prompt, one
model, run from the same VM, in the same region, within the same one-hour
window. Haiku 4.5 is picked over Sonnet/Opus to keep the ~105k-request full
run cheap; the *gateway overhead* we're measuring doesn't depend on model
tier anyway.

Per scenario (1, 2, 3, 4, 5 tool calls per request × 1,000 requests):

- `overhead_ms` — gateway-added latency at p50 (provider time subtracted)
- `p50_total_ms` — median end-to-end latency
- `p99_total_ms` — tail latency
- `sustained_rps` — successful requests per second

`overhead_ms` is the headline. Everything else is the provider being itself.

## What this is NOT

- Not a streaming benchmark (v1 is non-streaming only)
- Not a cost comparison (gateways charge differently for the same call)
- Not a multi-region test (single region, on purpose)
- Not a real tool-execution test — tool calls return canned data so we
  measure routing, not your tool implementation

## Gateways covered

| Name | Endpoint | Self-host? |
|---|---|---|
| Aura (self-hosted) | `http://aura:8080/v1/responses` | Yes |
| Aura (hosted) | `https://api.aura-llm.dev/v1/responses` | No |
| Bifrost | `http://bifrost:8080/v1/chat/completions` | Yes |
| Helicone | via Helicone proxy URL | Yes/cloud |
| LiteLLM | `http://litellm:4000/v1/chat/completions` | Yes |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | No |
| Portkey | `https://api.portkey.ai/v1/chat/completions` | No |

## Hardware

- **Harness:** one `c7a.xlarge` in `eu-north-1`, runs `harness.py`
- **Self-hosted gateways:** one *separate* `c7a.xlarge` in the same VPC,
  containers via `docker-compose`
- **Hosted gateways:** hit over public internet from the harness box

Never run the harness on the same VM as a self-hosted gateway. CPU contention
will pollute every number.

## One-time setup

```bash
cd scripts/bench
uv sync                                 # creates .venv and installs deps

# Each gateway needs an API key — fill these in:
cp .env.example .env
$EDITOR .env

# Anthropic key (the ONLY provider — every gateway routes to it)
# ANTHROPIC_API_KEY=sk-ant-...

# Per-gateway keys
# AURA_KEY=...
# AURA_HOSTED_KEY=...
# BIFROST_KEY=...
# HELICONE_KEY=...
# LITELLM_KEY=...
# OPENROUTER_KEY=...
# PORTKEY_KEY=...
```

For the self-hosted gateways, spin them up first:

```bash
docker compose -f docker-compose.bench.yml up -d
# Wait ~30s for everything to be healthy
docker compose -f docker-compose.bench.yml ps
```

## Smoke test

Send 5 requests to each gateway, 1 tool call each, sanity-check the
response shape:

```bash
uv run python harness.py --smoke
```

You should see one line per gateway: `Aura ✓  p50=312ms  overhead=4ms`.
If any gateway prints `✗`, fix it before running the full benchmark.

## Full run

```bash
# Default: 1,000 requests × 5 scenarios × 7 gateways × 3 runs ≈ 105k calls
uv run python harness.py --full --runs 3

# Faster smoke benchmark: 200 requests × 5 scenarios × 7 gateways × 1 run
uv run python harness.py --full --requests 200 --runs 1

# Subset: only run a few gateways (case-insensitive, comma-separated)
uv run python harness.py --smoke --gateways aura,litellm,bifrost
uv run python harness.py --full --gateways aura,"aura (hosted)" --runs 1
```

Output lands at `results/<gateway>__tc<N>__run<R>.jsonl` (one line per
request) and aggregated at `results/results.json` (the file you paste into
`LoadTestChart.astro`).

## Statistical hygiene

Default config runs **3 separate executions on 3 different days at the
same hour of day**. Provider load varies hourly; running back-to-back
under-counts noise.

`results.json` reports the **median** of the 3 runs for each metric and
the standard deviation across them. If `stdev / mean > 0.15` on
`overhead_ms` for any gateway, the result is noise — re-run with a longer
warm-up (`--warmup 200`) or lower concurrency (`--concurrency 25`).

## Known footguns

1. **Anthropic rate limits.** 7 gateways × 5 scenarios × 1k × 3 runs ≈
   105k calls all hitting the same Anthropic account. Spread the runs
   across the day; don't run gateways in parallel. Get a higher rate tier
   if available.
2. **OpenRouter and Portkey cost money.** Budget ~$30 across the full
   benchmark for their fees on top of the Anthropic spend.
3. **Bifrost and LiteLLM aren't Open Responses native.** Their request
   shape differs. The `gateway_adapters/` module handles translation;
   verify the prompts are identical after translation with
   `--print-payload` on the smoke test.
4. **Portkey's free tier rate-limits.** Use a paid throwaway account
   for the benchmark window.
5. **Don't trust the first 100 requests.** JIT, connection-pool warm-up,
   DNS resolution — all of it skews p50 downward. The harness discards
   warm-ups by default.
6. **Missing gateway API keys are silently skipped, not failed.** If
   `OPENROUTER_KEY` is empty in `.env`, OpenRouter just doesn't appear in
   the output — no error. Use `--gateways aura,litellm,bifrost` to be
   explicit about which gateways you intend to compare on partial runs.

## Publishing the numbers

When the run is clean:

1. Copy `results/results.json` into the post repo
2. Edit `src/components/LoadTestChart.astro` — replace the `scenarios`
   array with the contents of `results.json`'s `scenarios`
3. Remove the amber placeholder banner
4. Update the per-scenario caption with the real metadata from
   `results.json.metadata` (ran_at, region, harness_version)
5. Commit `results.json` to the gateway repo at `scripts/bench/results.json`
   so the numbers are reproducible
