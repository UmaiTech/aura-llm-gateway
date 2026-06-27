# Pricing Scraper — Runbook

> Implements issue #123. Supersedes the earlier Rust/tokio design sketch:
> the scraper ships as a **Vercel Cron** function, not an in-process job,
> because the pricing tables live behind the same Postgres the rest of
> `api/` already talks to and Vercel Cron is already in the deploy surface.

## What it does

Every **Monday 06:00 UTC** (`vercel.json` → `crons`), `api/cron/scrape-pricing.ts`
pulls current pricing for all 7 providers, normalizes it, and versions it
into the existing `model_pricing` table using `effective_from` /
`effective_until`. Existing Rust readers (`ModelPricingRepo::get_all_current`,
which filters `effective_until IS NULL`) pick up the new rows with **no Rust
changes**.

The read side, `api/pricing/index.ts` (`GET /api/pricing`), serves the
current rows publicly; the webapp at **`aura-llm.dev/pricing`**
(`apps/landing/src/pages/PricingPage.tsx`) renders them.

```
Vercel Cron (Mon 06:00 UTC)
   └─> POST /api/cron/scrape-pricing        (Bearer CRON_SECRET)
         ├─ fetch LiteLLM feed once
         ├─ per provider (concurrent, isolated):
         │     scrape → normalize → conservative gate → version into model_pricing
         │     └─ append outcome to pricing_scrape_log
         └─ JSON summary { providers_scraped, models_upserted, ... }

GET /api/pricing  ──>  apps/landing /pricing  (public webapp)
```

## Design stance: bad data is worse than stale data

Every scraped row carries a `status` (`success | needs_review | failed`).
**Only `success` rows are ever written.** A row is downgraded the moment
anything is ambiguous — missing input/output price, non-USD currency, a
provider returning zero models, or an inferred (not visible) model id. The
downgrade is recorded in `pricing_scrape_log` so a human can review, but it
never touches `model_pricing`. This is the conservative writer contract
raised on the issue.

## Does each provider have a pricing API? (the actual research)

Short answer: **no first-party LLM provider exposes a pricing API.** Their
`/models`-style endpoints return *model ids and sometimes token limits, but
never prices*. AWS Bedrock is the lone exception via the generic AWS Price
List Query API. So we treat a **community-maintained structured feed**
(BerriAI/litellm's `model_prices_and_context_window.json`) as the primary
source, and keep Firecrawl HTML scraping as the fallback.

| Provider | First-party pricing API? | What their API *does* give | Source we use |
|---|---|---|---|
| OpenAI | ❌ No | `GET /v1/models` → ids only | `litellm` (firecrawl fallback) |
| Anthropic | ❌ No | `GET /v1/models` → ids only | `litellm` (firecrawl fallback) |
| Google (Gemini) | ❌ No | `models.list` → token limits, no price | `litellm` (firecrawl fallback) |
| Mistral | ❌ No | `GET /v1/models` → ids only | `litellm` (firecrawl fallback) |
| AWS Bedrock | ✅ **Yes** | AWS Price List Query API (`AmazonBedrock`) | `litellm` (AWS API documented below) |
| Hugging Face | ❌ No (per-endpoint, varies) | model metadata, no unified price | `litellm` (firecrawl fallback) |
| Ollama | n/a (local inference) | — | `static` 0.0 row |

### The one real API — AWS Bedrock

Bedrock pricing *is* queryable programmatically. If/when we move Bedrock off
the LiteLLM feed onto the first-party API:

```bash
aws pricing get-products \
  --region us-east-1 \
  --service-code AmazonBedrock \
  --filters 'Type=TERM_MATCH,Field=regionCode,Value=us-east-1' \
  --query 'PriceList' --output text | jq .
```

Prices come back per-1K-tokens in nested `terms.OnDemand.*.priceDimensions`;
multiply to per-1M and map `model` / `inferenceType`. Attribute names vary
slightly by region/account (`model` vs `modelName`), so it's not zero-cost —
which is why the LiteLLM feed remains the default for uniformity.

### Why the LiteLLM feed over per-page scraping

`https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json`
is a flat map keyed by model name with `input_cost_per_token`,
`output_cost_per_token`, `cache_read_input_token_cost`, `max_input_tokens`,
`max_output_tokens`, `litellm_provider`, `mode`. It is updated continuously
by a large community, is plain JSON (no API key, no HTML parsing), and covers
all six paid providers. Reading JSON is far more robust than maintaining a
CSS selector per pricing page. Firecrawl stays wired as the per-page HTML
fallback for when the feed lags a day-0 launch.

## Files

| Path | Role |
|---|---|
| `api/cron/scrape-pricing.ts` | Cron entry point; auth, orchestration, summary |
| `api/cron/_providers.ts` | 7-provider registry: source kind, URLs, Firecrawl prompts/schema |
| `api/cron/_sources.ts` | Fetchers: LiteLLM feed + Firecrawl extract dispatch |
| `api/cron/_normalize.ts` | Raw → `ScrapedPrice` mappers + conservative trust gate |
| `api/cron/_db.ts` | pg writer with `effective_until` versioning + scrape log |
| `api/cron/_types.ts` | Shared types (`ScrapedPrice`, `ProviderResult`, status) |
| `api/pricing/index.ts` | Public read endpoint for the webapp |
| `apps/landing/src/pages/PricingPage.tsx` | Public pricing webapp (`/pricing`) |
| `migrations/20260627_025_pricing_scrape_log.sql` | Log table + seed missing providers |

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `CRON_SECRET` | yes | Bearer guarding the cron endpoint (Vercel auto-sets on cron) |
| `DATABASE_URL` | yes (already set) | Postgres connection (public schema) |
| `FIRECRAWL_API_KEY` | only for `firecrawl` source | HTML fallback extraction |
| `PRICING_SCRAPE_ALERT_URL` | optional | Webhook on hard failure |

## Manual operation

```bash
# Dry run — scrape + diff, NO writes. Safe to run anytime.
curl -s -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://aura-llm.dev/api/cron/scrape-pricing?dry_run=1" | jq .

# Live run — versions changed prices into model_pricing.
curl -s -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://aura-llm.dev/api/cron/scrape-pricing" | jq .
```

The response payload: `{ ok, run_id, dry_run, providers_scraped,
models_upserted, models_unchanged, models_flagged, errors[], providers[] }`.
Each `providers[]` entry carries the `changes[]` diff (insert / version /
unchanged / flagged).

## When a provider page changes shape

1. Run the dry-run curl. The broken provider shows `status: "failed"` (or
   `needs_review`) with an `error` / flagged rows in `pricing_scrape_log`.
2. If `source: 'litellm'`: the model-key prefix probably changed. Check the
   provider's entries in the LiteLLM feed and update `litellmPrefixes` in
   `api/cron/_providers.ts`. The `litellm_provider` field match usually
   already covers it.
3. If `source: 'firecrawl'`: re-check the pricing page URL and tighten the
   `firecrawlPrompt` / `ZFirecrawlExtract` schema in `_providers.ts`.
4. Re-run dry-run until the diff is sane, then run live (or wait for Monday).
5. Never hand-edit `model_pricing` to "fix" a scrape — seed a migration
   instead, so the source of truth stays reproducible.

## Querying the audit log

```sql
-- Providers that broke or needed review on the most recent run
SELECT provider, status, models_upserted, models_flagged, error
FROM pricing_scrape_log
WHERE run_id = (
  SELECT run_id FROM pricing_scrape_log
  WHERE dry_run = false
  GROUP BY run_id ORDER BY MAX(created_at) DESC LIMIT 1
)
ORDER BY provider;
```

## Out of scope (follow-ups)

- Auto-syncing the docs `ModelTable.tsx` from the scraped truth.
- Per-token Bedrock pricing via the first-party AWS Price List API (documented
  above; LiteLLM feed used for now).
- Slack/Discord alerting wiring (env var reserved: `PRICING_SCRAPE_ALERT_URL`).
