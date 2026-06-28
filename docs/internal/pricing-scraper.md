# Pricing Scraper — Runbook

> Implements issue #123. Supersedes the earlier Rust/tokio design sketch:
> the scraper ships as a **Vercel Cron** function, not an in-process job,
> because the pricing tables live behind the same Postgres the rest of
> `api/` already talks to and Vercel Cron is already in the deploy surface.

## What it does

Every **Monday 06:00 UTC** (`vercel.json` → `crons`), `api/cron/scrape-pricing.ts`
scrapes the **pricing page each provider publishes** for all 8 providers the
gateway routes to, normalizes the result, and versions it into the existing
`model_pricing` table using `effective_from` / `effective_until`. Existing
Rust readers (`ModelPricingRepo::get_all_current`, which filters
`effective_until IS NULL`) pick up the new rows with **no Rust changes**.

The read side, `api/pricing/index.ts` (`GET /api/pricing`), serves the
current rows publicly. It backs three surfaces:

- the public pricing webapp at **`aura-llm.dev/pricing`**
  (`apps/landing/src/pages/PricingPage.tsx`),
- the docs **`ModelTable`** MDX component
  (`apps/landing/src/components/mdx/ModelTable.tsx`), and
- the **chat playground** cost calculator
  (`apps/chat/src/lib/pricing.ts`).

All three previously hardcoded their prices; they now read `/api/pricing`
and keep their old hardcoded values only as an offline fallback.

```
Vercel Cron (Mon 06:00 UTC)
   └─> POST /api/cron/scrape-pricing        (Bearer CRON_SECRET)
         ├─ per provider (concurrent, isolated):
         │     Firecrawl extract on the provider's own pricing page
         │       → normalize → conservative gate → version into model_pricing
         │     └─ append outcome to pricing_scrape_log
         └─ JSON summary { providers_scraped, models_upserted, ... }

GET /api/pricing  ──>  /pricing webapp · ModelTable docs · chat cost calc
```

## Design stance: bad data is worse than stale data

Every scraped row carries a `status` (`success | needs_review | failed`).
**Only `success` rows are ever written.** A row is downgraded the moment
anything is ambiguous — missing input/output price, non-numeric price, no
visible model id, or a provider page yielding zero models. The downgrade is
recorded in `pricing_scrape_log` so a human can review, but it never touches
`model_pricing`. This is the conservative writer contract raised on the issue.

## Source: scrape each provider's own website

We scrape the **provider's own published pricing page** directly via
Firecrawl `extract` (URL + prompt + Zod schema → structured JSON). No
third-party aggregator. The page the provider publishes is the authoritative
source of truth, and scraping it keeps us honest to exactly what they charge.

On the "does this provider have a pricing API?" question — researched:

| Provider | First-party pricing API? | What their API *does* give | How we scrape |
|---|---|---|---|
| OpenAI | ❌ No | `GET /v1/models` → ids only | firecrawl: platform.openai.com/docs/pricing |
| Anthropic | ❌ No | `GET /v1/models` → ids only | firecrawl: anthropic.com/pricing |
| Google (Gemini) | ❌ No | `models.list` → token limits, no price | firecrawl: ai.google.dev/gemini-api/docs/pricing |
| Mistral | ❌ No | `GET /v1/models` → ids only | firecrawl: mistral.ai/pricing |
| Together AI (OSS host) | ❌ No | `GET /v1/models` → ids only | firecrawl: together.ai/pricing |
| AWS Bedrock | ✅ **Yes** | AWS Price List Query API (`AmazonBedrock`) | firecrawl: aws.amazon.com/bedrock/pricing (API documented below) |
| Hugging Face | ❌ No (per-endpoint, varies) | model metadata, no unified price | firecrawl: huggingface.co/docs/inference-providers/pricing |
| Ollama | n/a (local inference) | — | `static` 0.0 row |

**No first-party LLM provider exposes a pricing API** — their `/models`
endpoints return ids and sometimes token limits, never prices. So scraping
the HTML pricing page is the only universal option.

### The one real API — AWS Bedrock (future swap)

Bedrock pricing *is* queryable programmatically via the generic AWS Price
List Query API. If we move Bedrock off HTML scraping onto the first-party API:

```bash
aws pricing get-products \
  --region us-east-1 \
  --service-code AmazonBedrock \
  --filters 'Type=TERM_MATCH,Field=regionCode,Value=us-east-1' \
  --query 'PriceList' --output text | jq .
```

Prices come back per-1K-tokens in nested `terms.OnDemand.*.priceDimensions`;
multiply to per-1M and map `model` / `inferenceType`. Attribute names vary
slightly by region/account, so it's not zero-cost — which is why we scrape
the same page as everyone else for now.

## Files

| Path | Role |
|---|---|
| `api/cron/scrape-pricing.ts` | Cron entry point; auth, orchestration, summary |
| `api/cron/_providers.ts` | 8-provider registry: pricing-page URLs + Firecrawl prompts/schema |
| `api/cron/_sources.ts` | Firecrawl extract dispatch (+ static Ollama) |
| `api/cron/_normalize.ts` | Raw → `ScrapedPrice` mappers + conservative trust gate |
| `api/cron/_db.ts` | pg writer with `effective_until` versioning + scrape log |
| `api/cron/_types.ts` | Shared types (`ScrapedPrice`, `ProviderResult`, status) |
| `api/pricing/index.ts` | Public read endpoint backing the webapp + ModelTable + chat |
| `apps/landing/src/pages/PricingPage.tsx` | Public pricing webapp (`/pricing`) |
| `apps/landing/src/components/mdx/ModelTable.tsx` | Docs table — reads `/api/pricing`, hardcoded fallback |
| `apps/chat/src/lib/pricing.ts` | Chat cost calc — `loadLivePricing()` overlays `/api/pricing` |
| `migrations/20260627_025_pricing_scrape_log.sql` | Log table + seed missing providers (incl. Together) |

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `CRON_SECRET` | yes | Bearer guarding the cron endpoint (Vercel auto-sets on cron) |
| `FIRECRAWL_API_KEY` | **yes** | Scrapes every cloud provider's pricing page |
| `DATABASE_URL` | yes (already set) | Postgres connection (public schema) |
| `PRICING_SCRAPE_ALERT_URL` | optional | Webhook on hard failure |

Without `FIRECRAWL_API_KEY` every cloud provider fails cleanly and isolated
(`status: failed`, error logged); Ollama's static row still writes.

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

1. Run the dry-run curl. The broken provider shows `status: "failed"` (zero
   models / extract error) or `needs_review` (rows with missing prices),
   captured in `pricing_scrape_log`.
2. Open the provider's `url` in `api/cron/_providers.ts` in a browser. If the
   page moved, update the URL. If the layout changed, tighten the
   `firecrawlPrompt` (e.g. "use the paid tier, not the free tier") and/or the
   shared `ZFirecrawlExtract` schema.
3. Re-run dry-run until the diff is sane, then run live (or wait for Monday).
4. Never hand-edit `model_pricing` to "fix" a scrape — seed a migration
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

- Per-token Bedrock pricing via the first-party AWS Price List API (documented
  above; HTML scrape used for now).
- Capability flags (streaming / tools / vision) in `ModelTable` are still a
  static lookup — pricing pages don't carry them.
- Slack/Discord alerting wiring (env var reserved: `PRICING_SCRAPE_ALERT_URL`).
