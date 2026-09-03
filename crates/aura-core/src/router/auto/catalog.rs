//! Model catalog: what the gateway knows about each servable model.
//!
//! Combines three sources, in order of trust:
//!
//! 1. The provider registry (which models are servable, by whom).
//! 2. `model_pricing` rows from the database: prices, context window, and
//!    the scraped `capabilities` tags / `good_at` summary.
//! 3. Static name-based hints from `capabilities.rs` for anything the
//!    database doesn't know.
//!
//! The auto router's eligibility oracle asks the catalog about vision,
//! tools and context window; `/v1/models` lists it; and when the
//! configured tiers are empty, `TierModels::from_catalog` derives them
//! from prices and tags.

use super::capabilities::{model_supports_tools, model_supports_vision};
use super::config::TierModels;
use aura_types::Tier;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// One row of catalog input, typically built from a `model_pricing` row.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CatalogSource {
    /// Model id as stored by the pricing table (API slug or scraped slug).
    pub model_id: String,
    /// Provider name (`openai`, `anthropic`, …).
    pub provider: String,
    /// Scraped capability tags (`vision`, `tool-calling`, `reasoning`, …).
    pub capabilities: Vec<String>,
    /// One-line summary of what the model is good at.
    pub good_at: Option<String>,
    /// Context window in tokens, when known.
    pub context_window: Option<u32>,
    /// Maximum output tokens, when known.
    pub max_output_tokens: Option<u32>,
    /// USD per million input tokens.
    pub input_per_million: Option<f64>,
    /// USD per million output tokens.
    pub output_per_million: Option<f64>,
}

/// Catalog entry for a servable model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CatalogEntry {
    /// API model id.
    pub model: String,
    /// Provider that serves it.
    pub provider: String,
    /// Capability tags (from the database, possibly empty).
    pub capabilities: Vec<String>,
    /// Summary from the database, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub good_at: Option<String>,
    /// Context window, if known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u32>,
    /// Max output tokens, if known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u32>,
    /// USD per million input tokens, if known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_per_million: Option<f64>,
    /// USD per million output tokens, if known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_per_million: Option<f64>,
    /// Whether the entry was enriched from the database.
    pub from_database: bool,
}

impl CatalogEntry {
    /// Blended price (70% input, 30% output), if both prices are known.
    pub fn blended_per_million(&self) -> Option<f64> {
        Some(0.7 * self.input_per_million? + 0.3 * self.output_per_million?)
    }

    fn has_tag(&self, tag: &str) -> bool {
        self.capabilities
            .iter()
            .any(|c| c.eq_ignore_ascii_case(tag))
    }

    /// Vision support: database tags first, static hints otherwise.
    pub fn supports_vision(&self) -> bool {
        if !self.capabilities.is_empty() && (self.has_tag("vision") || self.has_tag("multimodal")) {
            return true;
        }
        model_supports_vision(&self.model)
    }

    /// Tool support: a database `tool-calling` / `agentic` tag is
    /// authoritative; otherwise fall back to the static hint.
    pub fn supports_tools(&self) -> bool {
        if self.has_tag("tool-calling") || self.has_tag("agentic") {
            return true;
        }
        model_supports_tools(&self.model)
    }

    /// Whether the database tagged the model as a reasoning model.
    pub fn is_reasoning(&self) -> bool {
        self.has_tag("reasoning")
    }
}

/// Canonical form used to match scraped slugs to API ids: lowercase, every
/// run of non-alphanumerics collapsed to one `-` (mirrors the scraper's
/// `canonicalModelId`).
pub fn canonical_slug(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut pending_dash = false;
    for c in raw.trim().chars() {
        if c.is_ascii_alphanumeric() {
            if pending_dash && !out.is_empty() {
                out.push('-');
            }
            pending_dash = false;
            out.push(c.to_ascii_lowercase());
        } else {
            pending_dash = true;
        }
    }
    out
}

/// The model catalog.
#[derive(Debug, Clone, Default)]
pub struct ModelCatalog {
    entries: HashMap<String, CatalogEntry>,
}

impl ModelCatalog {
    /// Build a catalog for `servable` models (API id → provider), enriched
    /// with database rows where a row's id matches an API id exactly, via
    /// the curated scraped-slug map, or by canonical slug.
    pub fn build(
        servable: &[(String, String)],
        sources: &[CatalogSource],
        api_slug_for_scraped: impl Fn(&str, &str) -> Option<&'static str>,
    ) -> Self {
        // Index sources by exact id, by mapped API slug, and by canonical slug.
        let mut by_id: HashMap<String, &CatalogSource> = HashMap::new();
        let mut by_canonical: HashMap<(String, String), &CatalogSource> = HashMap::new();
        for src in sources {
            by_id.entry(src.model_id.clone()).or_insert(src);
            if let Some(api) = api_slug_for_scraped(&src.provider, &src.model_id) {
                by_id.entry(api.to_string()).or_insert(src);
            }
            by_canonical
                .entry((
                    src.provider.to_ascii_lowercase(),
                    canonical_slug(&src.model_id),
                ))
                .or_insert(src);
        }

        let mut entries = HashMap::new();
        for (model, provider) in servable {
            let src = by_id.get(model.as_str()).copied().or_else(|| {
                by_canonical
                    .get(&(provider.to_ascii_lowercase(), canonical_slug(model)))
                    .copied()
            });
            let entry = match src {
                Some(s) => CatalogEntry {
                    model: model.clone(),
                    provider: provider.clone(),
                    capabilities: s.capabilities.clone(),
                    good_at: s.good_at.clone(),
                    context_window: s.context_window,
                    max_output_tokens: s.max_output_tokens,
                    input_per_million: s.input_per_million,
                    output_per_million: s.output_per_million,
                    from_database: true,
                },
                None => CatalogEntry {
                    model: model.clone(),
                    provider: provider.clone(),
                    capabilities: Vec::new(),
                    good_at: None,
                    context_window: None,
                    max_output_tokens: None,
                    input_per_million: None,
                    output_per_million: None,
                    from_database: false,
                },
            };
            entries.insert(model.clone(), entry);
        }
        Self { entries }
    }

    /// Look up a model.
    pub fn get(&self, model: &str) -> Option<&CatalogEntry> {
        self.entries.get(model)
    }

    /// All entries, sorted by provider then model id.
    pub fn entries(&self) -> Vec<&CatalogEntry> {
        let mut v: Vec<&CatalogEntry> = self.entries.values().collect();
        v.sort_by(|a, b| a.provider.cmp(&b.provider).then(a.model.cmp(&b.model)));
        v
    }

    /// Number of entries.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// True when empty.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Fill in prices from a fallback lookup (the seeded cost calculator)
    /// for entries the database didn't price.
    pub fn fill_prices(&mut self, price_of: impl Fn(&str) -> Option<(f64, f64)>) {
        for entry in self.entries.values_mut() {
            if entry.input_per_million.is_none() || entry.output_per_million.is_none() {
                if let Some((i, o)) = price_of(&entry.model) {
                    entry.input_per_million = Some(i);
                    entry.output_per_million = Some(o);
                }
            }
        }
    }
}

impl TierModels {
    /// Derive tier lists from a catalog when none are configured.
    ///
    /// Rules, applied to models with a known blended price:
    /// - `reasoning`: models tagged `reasoning`, most expensive first
    ///   (falls back to the three most expensive models when nothing is
    ///   tagged);
    /// - the remaining models are sorted by blended price and split into
    ///   thirds: `simple` (cheapest), `medium`, `complex`.
    ///
    /// At most `per_tier` models per tier. Each tier prefers models with
    /// tool support so the tools floor has candidates.
    pub fn from_catalog(catalog: &ModelCatalog, per_tier: usize) -> TierModels {
        let mut priced: Vec<(&CatalogEntry, f64)> = catalog
            .entries()
            .into_iter()
            .filter_map(|e| e.blended_per_million().map(|p| (e, p)))
            .collect();
        priced.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

        let mut reasoning: Vec<&CatalogEntry> = priced
            .iter()
            .filter(|(e, _)| e.is_reasoning())
            .map(|(e, _)| *e)
            .collect();
        reasoning.reverse();
        if reasoning.is_empty() {
            reasoning = priced.iter().rev().take(3).map(|(e, _)| *e).collect();
        }

        let rest: Vec<&CatalogEntry> = priced
            .iter()
            .filter(|(e, _)| !reasoning.iter().any(|r| r.model == e.model))
            .map(|(e, _)| *e)
            .collect();
        let n = rest.len();
        let third = n.div_ceil(3).max(1);
        let take = |slice: &[&CatalogEntry]| -> Vec<String> {
            let mut v: Vec<&CatalogEntry> = slice.to_vec();
            // Tool-capable first, then price order (stable sort).
            v.sort_by_key(|e| !e.supports_tools());
            v.into_iter()
                .take(per_tier)
                .map(|e| e.model.clone())
                .collect()
        };
        let simple = take(&rest[..third.min(n)]);
        let medium = take(&rest[third.min(n)..(2 * third).min(n)]);
        let complex = take(&rest[(2 * third).min(n)..]);

        TierModels {
            simple,
            medium,
            complex,
            reasoning: reasoning
                .into_iter()
                .take(per_tier)
                .map(|e| e.model.clone())
                .collect(),
        }
    }
}

/// Which tier a catalog entry would fall into under `tiers`, for `/v1/models`.
pub fn tier_of(tiers: &TierModels, model: &str) -> Option<Tier> {
    tiers.tier_of(model)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn src(id: &str, provider: &str, caps: &[&str], input: f64, output: f64) -> CatalogSource {
        CatalogSource {
            model_id: id.into(),
            provider: provider.into(),
            capabilities: caps.iter().map(|s| s.to_string()).collect(),
            good_at: None,
            context_window: Some(128_000),
            max_output_tokens: Some(16_384),
            input_per_million: Some(input),
            output_per_million: Some(output),
        }
    }

    fn servable() -> Vec<(String, String)> {
        vec![
            ("gpt-5.4-nano".into(), "openai".into()),
            ("gpt-5.4-mini".into(), "openai".into()),
            ("gpt-5.5".into(), "openai".into()),
            ("o3-mini".into(), "openai".into()),
            ("claude-haiku-4-5".into(), "anthropic".into()),
            ("claude-opus-4-7".into(), "anthropic".into()),
            (
                "accounts/fireworks/models/glm-5p2".into(),
                "fireworks".into(),
            ),
        ]
    }

    fn slug_map(provider: &str, scraped: &str) -> Option<&'static str> {
        match (provider, scraped) {
            ("fireworks", "glm-5-2") => Some("accounts/fireworks/models/glm-5p2"),
            _ => None,
        }
    }

    #[test]
    fn canonical_slug_matches_scraper() {
        assert_eq!(canonical_slug("Claude Opus 4.7"), "claude-opus-4-7");
        assert_eq!(canonical_slug("gpt-5.4-mini"), "gpt-5-4-mini");
        assert_eq!(canonical_slug("  o3_mini  "), "o3-mini");
    }

    #[test]
    fn build_matches_exact_mapped_and_canonical_ids() {
        let sources = vec![
            src(
                "gpt-5.4-nano",
                "openai",
                &["fast", "cost-efficient"],
                0.1,
                0.4,
            ),
            // scraped display slug for gpt-5.4-mini
            src("gpt-5-4-mini", "openai", &["tool-calling"], 0.75, 4.5),
            src("glm-5-2", "fireworks", &["coding"], 0.6, 2.2),
            src(
                "claude-opus-4-7",
                "anthropic",
                &["reasoning", "vision"],
                15.0,
                75.0,
            ),
        ];
        let cat = ModelCatalog::build(&servable(), &sources, slug_map);
        assert_eq!(cat.len(), 7);
        assert!(cat.get("gpt-5.4-nano").unwrap().from_database);
        assert!(cat.get("gpt-5.4-mini").unwrap().from_database);
        assert!(
            cat.get("accounts/fireworks/models/glm-5p2")
                .unwrap()
                .from_database
        );
        assert!(!cat.get("gpt-5.5").unwrap().from_database);
        assert!(cat.get("claude-opus-4-7").unwrap().is_reasoning());
        assert!(cat.get("claude-opus-4-7").unwrap().supports_vision());
        // Static hint still applies to unenriched entries.
        assert!(cat.get("gpt-5.5").unwrap().supports_vision());
        assert!(!cat.get("o3-mini").unwrap().supports_vision());
    }

    #[test]
    fn fill_prices_only_touches_unpriced_entries() {
        let sources = vec![src("gpt-5.4-nano", "openai", &[], 0.1, 0.4)];
        let mut cat = ModelCatalog::build(&servable(), &sources, slug_map);
        cat.fill_prices(|m| {
            if m == "gpt-5.5" {
                Some((5.0, 30.0))
            } else {
                Some((99.0, 99.0))
            }
        });
        assert_eq!(
            cat.get("gpt-5.4-nano").unwrap().input_per_million,
            Some(0.1)
        );
        assert_eq!(cat.get("gpt-5.5").unwrap().input_per_million, Some(5.0));
        assert_eq!(cat.get("o3-mini").unwrap().input_per_million, Some(99.0));
    }

    #[test]
    fn tiers_from_catalog_split_by_price_and_reasoning_tag() {
        let sources = vec![
            src("gpt-5.4-nano", "openai", &["tool-calling"], 0.1, 0.4),
            src("claude-haiku-4-5", "anthropic", &["tool-calling"], 1.0, 5.0),
            src("gpt-5.4-mini", "openai", &["tool-calling"], 0.75, 4.5),
            src("glm-5-2", "fireworks", &["coding"], 0.6, 2.2),
            src("gpt-5.5", "openai", &["tool-calling"], 5.0, 30.0),
            src("o3-mini", "openai", &["reasoning"], 1.1, 4.4),
            src(
                "claude-opus-4-7",
                "anthropic",
                &["reasoning", "tool-calling"],
                15.0,
                75.0,
            ),
        ];
        let cat = ModelCatalog::build(&servable(), &sources, slug_map);
        let tiers = TierModels::from_catalog(&cat, 3);
        assert_eq!(
            tiers.reasoning,
            vec!["claude-opus-4-7".to_string(), "o3-mini".to_string()]
        );
        // Five non-reasoning models split into thirds of two: simple gets the
        // two cheapest, complex the most expensive.
        assert_eq!(tiers.simple.len(), 2);
        assert!(tiers.simple.contains(&"gpt-5.4-nano".to_string()));
        assert!(tiers.complex.contains(&"gpt-5.5".to_string()));
        assert!(!tiers.medium.is_empty());
        // Nothing appears in two non-reasoning tiers.
        for m in &tiers.simple {
            assert!(!tiers.medium.contains(m) && !tiers.complex.contains(m));
        }
    }

    #[test]
    fn tiers_from_empty_catalog_are_empty() {
        let cat = ModelCatalog::default();
        let tiers = TierModels::from_catalog(&cat, 3);
        assert!(tiers.simple.is_empty() && tiers.reasoning.is_empty());
    }
}
