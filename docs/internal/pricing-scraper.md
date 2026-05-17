# Pricing Scraper Design

## Overview

The pricing scraper is a scheduled job that automatically fetches and updates LLM model pricing from provider websites. This ensures the gateway always has accurate, up-to-date pricing information for cost calculations.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Cron Scheduler │───>│ Pricing Scraper │───>│    Database     │
│    (tokio)      │    │    Service      │    │  model_pricing  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              v
                    ┌─────────────────┐
                    │ Provider APIs   │
                    │ - OpenAI        │
                    │ - Anthropic     │
                    │ - Google        │
                    └─────────────────┘
```

## Data Sources

### OpenAI
- **Primary**: `https://openai.com/api/pricing/` (HTML scraping)
- **Fallback**: OpenAI API model list endpoint
- **Frequency**: Daily

### Anthropic
- **Primary**: `https://www.anthropic.com/pricing` (HTML scraping)
- **Fallback**: Manual configuration
- **Frequency**: Daily

### Google
- **Primary**: `https://ai.google.dev/gemini-api/docs/pricing` (HTML scraping)
- **Fallback**: Google Cloud pricing API
- **Frequency**: Daily

## Database Schema

Uses existing `model_pricing` table with `effective_from` / `effective_until` for price history:

```sql
-- New pricing becomes effective immediately, old pricing gets end date
UPDATE model_pricing
SET effective_until = NOW()
WHERE model_id = $1 AND effective_until IS NULL;

INSERT INTO model_pricing (
    provider_id, model_id, model_name,
    input_per_million, output_per_million,
    cached_input_per_million, reasoning_per_million,
    context_window, max_output_tokens,
    effective_from
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW());
```

## Implementation Plan

### Phase 1: Core Infrastructure

```rust
// crates/aura-core/src/pricing/mod.rs
pub mod scraper;
pub mod scheduler;

// Trait for provider-specific scrapers
#[async_trait]
pub trait PricingScraper: Send + Sync {
    fn provider_name(&self) -> &str;
    async fn fetch_pricing(&self) -> Result<Vec<ModelPricing>, ScraperError>;
}

// Scheduler configuration
pub struct ScraperConfig {
    pub enabled: bool,
    pub schedule: String,  // cron expression, e.g., "0 0 * * *" (daily at midnight)
    pub providers: Vec<String>,
}
```

### Phase 2: Provider Scrapers

```rust
// OpenAI scraper
pub struct OpenAIPricingScraper {
    http_client: reqwest::Client,
}

impl PricingScraper for OpenAIPricingScraper {
    async fn fetch_pricing(&self) -> Result<Vec<ModelPricing>, ScraperError> {
        // 1. Fetch pricing page HTML
        // 2. Parse pricing tables using scraper crate
        // 3. Extract model names and prices
        // 4. Return structured pricing data
    }
}
```

### Phase 3: Scheduler Integration

```rust
// Using tokio-cron-scheduler
use tokio_cron_scheduler::{Job, JobScheduler};

async fn start_pricing_scheduler(
    config: ScraperConfig,
    db_pool: DbPool,
) -> Result<(), SchedulerError> {
    let scheduler = JobScheduler::new().await?;

    let job = Job::new_async(&config.schedule, move |_uuid, _lock| {
        let pool = db_pool.clone();
        Box::pin(async move {
            run_all_scrapers(&pool).await;
        })
    })?;

    scheduler.add(job).await?;
    scheduler.start().await?;

    Ok(())
}
```

## Configuration

```yaml
# aura.yaml
pricing:
  scraper:
    enabled: true
    schedule: "0 0 * * *"  # Daily at midnight UTC
    providers:
      - openai
      - anthropic
      - google
    retry:
      max_attempts: 3
      delay_seconds: 60
```

## Error Handling

1. **Scraping Failures**: Log warning, keep existing pricing, retry next schedule
2. **Parse Errors**: Log error with raw content for debugging
3. **Network Timeouts**: Implement exponential backoff retries
4. **Price Anomalies**: Detect >50% price changes, require manual approval

## Monitoring

```rust
// Metrics to track
- pricing_scraper_runs_total{provider, status}
- pricing_scraper_duration_seconds{provider}
- pricing_scraper_models_updated{provider}
- pricing_scraper_errors_total{provider, error_type}
```

## Security Considerations

1. **Rate Limiting**: Respect provider rate limits, use appropriate delays
2. **User Agent**: Use identifiable user agent string
3. **IP Rotation**: Consider proxy rotation for reliability
4. **Validation**: Sanitize all scraped data before database insertion

## Alternative Approaches

### Manual API Integration

Some providers offer pricing APIs:

```rust
// OpenAI models endpoint (partial pricing info)
GET https://api.openai.com/v1/models

// Google Cloud Pricing API
GET https://cloudbilling.googleapis.com/v1/services/{serviceId}/skus
```

### Webhook Updates

Register for provider pricing change notifications (when available).

## Timeline

1. **Week 1**: Core scraper infrastructure, OpenAI scraper
2. **Week 2**: Anthropic and Google scrapers
3. **Week 3**: Scheduler integration, monitoring
4. **Week 4**: Testing, documentation, rollout

## Dependencies

```toml
[dependencies]
tokio-cron-scheduler = "0.10"
scraper = "0.18"
selectors = "0.25"
```
