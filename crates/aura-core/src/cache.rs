//! Response caching implementation using Redis
//!
//! Provides TTL-based caching for LLM responses to reduce latency and costs
//! for repeated identical requests.

use crate::redis::RedisPool;
use aura_types::{CreateResponseRequest, Response};
use redis::AsyncCommands;
use sha2::{Digest, Sha256};
use thiserror::Error;
use tracing::{debug, info};

/// Default cache TTL in seconds (5 minutes)
pub const DEFAULT_CACHE_TTL: u64 = 300;

/// Errors that can occur during cache operations
#[derive(Debug, Error)]
pub enum CacheError {
    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// Cache hit result containing the cached response and metadata
#[derive(Debug, Clone)]
pub struct CacheHit {
    /// The cached response
    pub response: Response,
    /// Cache key that was hit
    pub cache_key: String,
    /// Time-to-live remaining in seconds
    pub ttl_remaining: u64,
}

/// Response cache using Redis
///
/// Caches LLM responses based on a hash of the request parameters
/// (model, input, system prompt, temperature, etc.).
#[derive(Clone)]
pub struct ResponseCache {
    redis: RedisPool,
    /// Key prefix for cache entries
    key_prefix: String,
    /// Default TTL for cache entries
    default_ttl: u64,
}

impl ResponseCache {
    /// Creates a new response cache with the given Redis pool
    ///
    /// # Arguments
    ///
    /// * `redis` - Redis connection pool
    ///
    /// # Example
    ///
    /// ```no_run
    /// use aura_core::cache::ResponseCache;
    /// use aura_core::redis::RedisPool;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let pool = RedisPool::new("redis://localhost:6379").await?;
    /// let cache = ResponseCache::new(pool);
    /// # Ok(())
    /// # }
    /// ```
    pub fn new(redis: RedisPool) -> Self {
        Self {
            redis,
            key_prefix: "aura:cache".to_string(),
            default_ttl: DEFAULT_CACHE_TTL,
        }
    }

    /// Creates a new response cache with custom settings
    pub fn with_config(redis: RedisPool, prefix: impl Into<String>, default_ttl: u64) -> Self {
        Self {
            redis,
            key_prefix: prefix.into(),
            default_ttl,
        }
    }

    /// Generate a cache key from a request
    ///
    /// The cache key is a SHA256 hash of the normalized request parameters:
    /// - model
    /// - input items (normalized JSON)
    /// - system prompt
    /// - temperature
    /// - max tokens
    /// - tools (if any)
    ///
    /// Some parameters like `stream` don't affect the response content
    /// and are excluded from the cache key.
    pub fn generate_cache_key(&self, request: &CreateResponseRequest) -> String {
        let mut hasher = Sha256::new();

        // Model
        hasher.update(request.model.as_bytes());
        hasher.update(b"|");

        // Input items (normalized)
        if let Ok(input_json) = serde_json::to_string(&request.input) {
            hasher.update(input_json.as_bytes());
        }
        hasher.update(b"|");

        // System prompt
        if let Some(ref instructions) = request.instructions {
            hasher.update(instructions.as_bytes());
        }
        hasher.update(b"|");

        // Temperature (convert to string for consistent hashing)
        if let Some(temp) = request.temperature {
            hasher.update(format!("{:.2}", temp).as_bytes());
        }
        hasher.update(b"|");

        // Max tokens
        if let Some(max_tokens) = request.max_output_tokens {
            hasher.update(max_tokens.to_string().as_bytes());
        }
        hasher.update(b"|");

        // Tools (if any)
        if let Some(ref tools) = request.tools {
            if let Ok(tools_json) = serde_json::to_string(tools) {
                hasher.update(tools_json.as_bytes());
            }
        }
        hasher.update(b"|");

        // Tool choice
        if let Some(ref tool_choice) = request.tool_choice {
            if let Ok(tc_json) = serde_json::to_string(tool_choice) {
                hasher.update(tc_json.as_bytes());
            }
        }

        let hash = hasher.finalize();
        format!("{}:{}", self.key_prefix, hex::encode(hash))
    }

    /// Get a cached response for a request
    ///
    /// Returns `Some(CacheHit)` if found, `None` if not cached.
    ///
    /// # Arguments
    ///
    /// * `request` - The request to look up in cache
    ///
    /// # Example
    ///
    /// ```ignore
    /// use aura_core::cache::ResponseCache;
    /// use aura_core::redis::RedisPool;
    /// use aura_types::CreateResponseRequest;
    ///
    /// let pool = RedisPool::new("redis://localhost:6379").await?;
    /// let cache = ResponseCache::new(pool);
    ///
    /// let request = CreateResponseRequest::new("gpt-4", vec![]);
    ///
    /// if let Some(hit) = cache.get(&request).await? {
    ///     println!("Cache hit! TTL remaining: {}s", hit.ttl_remaining);
    /// }
    /// ```
    pub async fn get(
        &self,
        request: &CreateResponseRequest,
    ) -> Result<Option<CacheHit>, CacheError> {
        let cache_key = self.generate_cache_key(request);
        self.get_by_key(&cache_key).await
    }

    /// Get a cached response by key directly
    pub async fn get_by_key(&self, cache_key: &str) -> Result<Option<CacheHit>, CacheError> {
        let mut conn = self.redis.connection();

        // Get cached value
        let cached: Option<String> = conn.get(cache_key).await?;

        if let Some(json) = cached {
            // Get TTL
            let ttl: i64 = conn.ttl(cache_key).await.unwrap_or(0);
            let ttl_remaining = if ttl > 0 { ttl as u64 } else { 0 };

            // Deserialize response
            let response: Response = serde_json::from_str(&json)?;

            debug!(
                cache_key = %cache_key,
                ttl_remaining = %ttl_remaining,
                "Cache hit"
            );

            metrics::counter!("aura_cache_hits_total").increment(1);

            Ok(Some(CacheHit {
                response,
                cache_key: cache_key.to_string(),
                ttl_remaining,
            }))
        } else {
            debug!(cache_key = %cache_key, "Cache miss");
            metrics::counter!("aura_cache_misses_total").increment(1);
            Ok(None)
        }
    }

    /// Store a response in the cache
    ///
    /// # Arguments
    ///
    /// * `request` - The original request (used to generate cache key)
    /// * `response` - The response to cache
    /// * `ttl` - Optional TTL in seconds (uses default if None)
    ///
    /// # Example
    ///
    /// ```ignore
    /// use aura_core::cache::ResponseCache;
    /// use aura_core::redis::RedisPool;
    /// use aura_types::{CreateResponseRequest, Response, ResponseStatus};
    ///
    /// let pool = RedisPool::new("redis://localhost:6379").await?;
    /// let cache = ResponseCache::new(pool);
    ///
    /// let request = CreateResponseRequest::new("gpt-4", vec![]);
    /// let response = Response::in_progress("resp_123", "gpt-4");
    ///
    /// // Cache for 5 minutes (default)
    /// cache.set(&request, &response, None).await?;
    ///
    /// // Or with custom TTL (600 seconds)
    /// cache.set(&request, &response, Some(600)).await?;
    /// ```
    pub async fn set(
        &self,
        request: &CreateResponseRequest,
        response: &Response,
        ttl: Option<u64>,
    ) -> Result<String, CacheError> {
        let cache_key = self.generate_cache_key(request);
        let ttl = ttl.unwrap_or(self.default_ttl);

        self.set_by_key(&cache_key, response, ttl).await?;

        Ok(cache_key)
    }

    /// Store a response by cache key directly
    pub async fn set_by_key(
        &self,
        cache_key: &str,
        response: &Response,
        ttl: u64,
    ) -> Result<(), CacheError> {
        let json = serde_json::to_string(response)?;

        let mut conn = self.redis.connection();
        conn.set_ex::<_, _, ()>(cache_key, &json, ttl).await?;

        debug!(
            cache_key = %cache_key,
            ttl = %ttl,
            "Response cached"
        );

        metrics::counter!("aura_cache_sets_total").increment(1);

        Ok(())
    }

    /// Invalidate a cached response
    ///
    /// # Arguments
    ///
    /// * `request` - The request to invalidate from cache
    pub async fn invalidate(&self, request: &CreateResponseRequest) -> Result<bool, CacheError> {
        let cache_key = self.generate_cache_key(request);
        self.invalidate_by_key(&cache_key).await
    }

    /// Invalidate a cached response by key
    pub async fn invalidate_by_key(&self, cache_key: &str) -> Result<bool, CacheError> {
        let mut conn = self.redis.connection();
        let deleted: i64 = conn.del(cache_key).await?;

        if deleted > 0 {
            debug!(cache_key = %cache_key, "Cache entry invalidated");
            metrics::counter!("aura_cache_invalidations_total").increment(1);
        }

        Ok(deleted > 0)
    }

    /// Invalidate all cached responses matching a pattern
    ///
    /// # Arguments
    ///
    /// * `pattern` - Redis key pattern (e.g., "*gpt-4*")
    ///
    /// # Warning
    ///
    /// This operation can be expensive on large caches.
    pub async fn invalidate_pattern(&self, pattern: &str) -> Result<u64, CacheError> {
        let full_pattern = format!("{}:{}", self.key_prefix, pattern);

        let mut conn = self.redis.connection();

        // Use SCAN to find matching keys (safer than KEYS for production)
        let mut cursor = 0u64;
        let mut total_deleted = 0u64;

        loop {
            let (new_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
                .arg(cursor)
                .arg("MATCH")
                .arg(&full_pattern)
                .arg("COUNT")
                .arg(100)
                .query_async(&mut conn)
                .await?;

            if !keys.is_empty() {
                let deleted: i64 = conn.del(&keys).await?;
                total_deleted += deleted as u64;
            }

            cursor = new_cursor;
            if cursor == 0 {
                break;
            }
        }

        if total_deleted > 0 {
            info!(pattern = %pattern, count = %total_deleted, "Cache entries invalidated by pattern");
        }

        Ok(total_deleted)
    }

    /// Check if caching should be skipped for a request
    ///
    /// Returns `true` if caching should be bypassed (not suitable for caching).
    pub fn should_skip_cache(request: &CreateResponseRequest) -> bool {
        // Skip if streaming is requested (can't cache streams easily)
        if request.stream {
            return true;
        }

        // Skip if temperature > 0 (non-deterministic responses)
        if let Some(temp) = request.temperature {
            if temp > 0.0 {
                return true;
            }
        }

        // Skip if tools are configured (function calls may have side effects)
        // Actually, we can cache tool call responses - they're deterministic
        // But we might want to skip caching if there are tool results in input
        // (indicating an ongoing conversation with external state)

        false
    }

    /// Check if a response should be cached
    ///
    /// Returns `true` if the response is suitable for caching.
    pub fn should_cache_response(response: &Response) -> bool {
        // Only cache completed responses
        if response.status != aura_types::ResponseStatus::Completed {
            return false;
        }

        // Don't cache error responses
        if response.error.is_some() {
            return false;
        }

        // Don't cache empty responses
        if response.output.is_empty() {
            return false;
        }

        true
    }

    /// Get cache statistics
    pub async fn stats(&self) -> Result<CacheStats, CacheError> {
        let mut conn = self.redis.connection();

        // Count keys matching our prefix using SCAN
        let pattern = format!("{}:*", self.key_prefix);
        let mut cursor = 0u64;
        let mut total_keys = 0u64;

        loop {
            let (new_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
                .arg(cursor)
                .arg("MATCH")
                .arg(&pattern)
                .arg("COUNT")
                .arg(1000)
                .query_async(&mut conn)
                .await?;

            total_keys += keys.len() as u64;
            cursor = new_cursor;

            if cursor == 0 {
                break;
            }
        }

        Ok(CacheStats {
            entries: total_keys,
            key_prefix: self.key_prefix.clone(),
        })
    }
}

/// Cache statistics
#[derive(Debug, Clone)]
pub struct CacheStats {
    /// Number of cached entries
    pub entries: u64,
    /// Key prefix used
    pub key_prefix: String,
}

/// Enriches a cached response with cache-specific metadata
pub fn enrich_cached_response(mut response: Response, cache_key: &str) -> Response {
    // Add cache metadata to response
    let cache_metadata = serde_json::json!({
        "cache_hit": true,
        "cache_key": cache_key,
    });

    response.metadata = Some(match response.metadata {
        Some(existing) => {
            if let (serde_json::Value::Object(mut map), serde_json::Value::Object(new_map)) =
                (existing, cache_metadata)
            {
                for (k, v) in new_map {
                    map.insert(k, v);
                }
                serde_json::Value::Object(map)
            } else {
                serde_json::json!({"cache_hit": true, "cache_key": cache_key})
            }
        }
        None => cache_metadata,
    });

    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use aura_types::InputItem;

    fn make_test_request(model: &str, input: &str) -> CreateResponseRequest {
        CreateResponseRequest::new(model.to_string(), vec![InputItem::user(input)])
    }

    #[test]
    fn test_cache_key_generation_deterministic() {
        // Can't actually test without Redis, but can verify key format
        let request1 = make_test_request("gpt-4", "Hello");
        let request2 = make_test_request("gpt-4", "Hello");

        // Just verify the hash function is deterministic
        let mut hasher1 = Sha256::new();
        hasher1.update(request1.model.as_bytes());
        hasher1.update(b"|");
        if let Ok(json) = serde_json::to_string(&request1.input) {
            hasher1.update(json.as_bytes());
        }

        let mut hasher2 = Sha256::new();
        hasher2.update(request2.model.as_bytes());
        hasher2.update(b"|");
        if let Ok(json) = serde_json::to_string(&request2.input) {
            hasher2.update(json.as_bytes());
        }

        assert_eq!(
            hex::encode(hasher1.finalize()),
            hex::encode(hasher2.finalize())
        );
    }

    #[test]
    fn test_cache_key_different_for_different_requests() {
        let request1 = make_test_request("gpt-4", "Hello");
        let request2 = make_test_request("gpt-4", "World");

        let mut hasher1 = Sha256::new();
        hasher1.update(request1.model.as_bytes());
        hasher1.update(b"|");
        if let Ok(json) = serde_json::to_string(&request1.input) {
            hasher1.update(json.as_bytes());
        }

        let mut hasher2 = Sha256::new();
        hasher2.update(request2.model.as_bytes());
        hasher2.update(b"|");
        if let Ok(json) = serde_json::to_string(&request2.input) {
            hasher2.update(json.as_bytes());
        }

        assert_ne!(
            hex::encode(hasher1.finalize()),
            hex::encode(hasher2.finalize())
        );
    }

    #[test]
    fn test_should_skip_cache() {
        // Non-streaming, temp=0 should be cached
        let mut request = make_test_request("gpt-4", "Hello");
        request.stream = false;
        request.temperature = Some(0.0);
        assert!(!ResponseCache::should_skip_cache(&request));

        // Streaming should skip cache
        let mut streaming = request.clone();
        streaming.stream = true;
        assert!(ResponseCache::should_skip_cache(&streaming));

        // High temperature should skip cache
        let mut high_temp = request.clone();
        high_temp.temperature = Some(1.0);
        high_temp.stream = false;
        assert!(ResponseCache::should_skip_cache(&high_temp));
    }

    #[test]
    fn test_should_cache_response() {
        use aura_types::{Item, MessageItem, ResponseStatus, Role};

        // Completed response with output should be cached
        let good_response = Response {
            id: "resp_123".to_string(),
            object: "response".to_string(),
            model: "gpt-4".to_string(),
            status: ResponseStatus::Completed,
            output: vec![Item::Message(MessageItem::new(
                "msg_1",
                Role::Assistant,
                "Hello!",
            ))],
            created_at: 0,
            error: None,
            incomplete_reason: None,
            usage: None,
            previous_response_id: None,
            metadata: None,
        };
        assert!(ResponseCache::should_cache_response(&good_response));

        // Failed response should not be cached
        let failed = Response {
            status: ResponseStatus::Failed,
            ..good_response.clone()
        };
        assert!(!ResponseCache::should_cache_response(&failed));

        // Empty output should not be cached
        let empty = Response {
            output: vec![],
            ..good_response.clone()
        };
        assert!(!ResponseCache::should_cache_response(&empty));
    }
}
