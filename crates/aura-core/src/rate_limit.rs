//! Rate limiting implementation using token bucket algorithm with Redis
//!
//! Provides per-API key rate limiting with configurable requests per minute (RPM).
//! Uses Redis for distributed state to work across multiple gateway instances.

use crate::redis::RedisPool;
use redis::AsyncCommands;
use thiserror::Error;
use tracing::{debug, warn};

/// Errors that can occur during rate limiting operations
#[derive(Debug, Error)]
pub enum RateLimitError {
    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error(
        "Rate limit exceeded: {remaining} requests remaining, resets in {reset_after_secs} seconds"
    )]
    Exceeded {
        limit: u32,
        remaining: u32,
        reset_after_secs: u64,
    },
}

/// Result of a rate limit check
#[derive(Debug, Clone)]
pub struct RateLimitResult {
    /// Whether the request is allowed
    pub allowed: bool,
    /// Maximum requests per window
    pub limit: u32,
    /// Remaining requests in current window
    pub remaining: u32,
    /// Seconds until the rate limit resets
    pub reset_after_secs: u64,
    /// Unix timestamp when the limit resets
    pub reset_at: u64,
}

impl RateLimitResult {
    /// Returns rate limit headers for HTTP response
    pub fn headers(&self) -> Vec<(&'static str, String)> {
        vec![
            ("X-RateLimit-Limit", self.limit.to_string()),
            ("X-RateLimit-Remaining", self.remaining.to_string()),
            ("X-RateLimit-Reset", self.reset_at.to_string()),
        ]
    }
}

/// Rate limiter using sliding window token bucket algorithm
///
/// Uses Redis for distributed state, allowing the gateway to scale
/// horizontally while maintaining accurate rate limits.
#[derive(Clone)]
pub struct RateLimiter {
    redis: RedisPool,
    /// Key prefix for Redis keys
    key_prefix: String,
}

impl RateLimiter {
    /// Creates a new rate limiter with the given Redis pool
    ///
    /// # Arguments
    ///
    /// * `redis` - Redis connection pool
    ///
    /// # Example
    ///
    /// ```no_run
    /// use aura_core::rate_limit::RateLimiter;
    /// use aura_core::redis::RedisPool;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let pool = RedisPool::new("redis://localhost:6379").await?;
    /// let limiter = RateLimiter::new(pool);
    /// # Ok(())
    /// # }
    /// ```
    pub fn new(redis: RedisPool) -> Self {
        Self {
            redis,
            key_prefix: "aura:ratelimit".to_string(),
        }
    }

    /// Creates a new rate limiter with a custom key prefix
    pub fn with_prefix(redis: RedisPool, prefix: impl Into<String>) -> Self {
        Self {
            redis,
            key_prefix: prefix.into(),
        }
    }

    /// Check and consume a rate limit token for the given key
    ///
    /// Uses a sliding window algorithm stored in Redis.
    ///
    /// # Arguments
    ///
    /// * `key` - Unique identifier for the rate limit (e.g., API key ID)
    /// * `limit_rpm` - Maximum requests per minute allowed
    ///
    /// # Returns
    ///
    /// Returns `Ok(RateLimitResult)` with the current state.
    /// The `allowed` field indicates whether the request should proceed.
    ///
    /// # Example
    ///
    /// ```no_run
    /// use aura_core::rate_limit::RateLimiter;
    /// use aura_core::redis::RedisPool;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let pool = RedisPool::new("redis://localhost:6379").await?;
    /// let limiter = RateLimiter::new(pool);
    ///
    /// let result = limiter.check("api_key_123", 60).await?;
    /// if result.allowed {
    ///     // Process request
    /// } else {
    ///     // Return 429 Too Many Requests
    /// }
    /// # Ok(())
    /// # }
    /// ```
    pub async fn check(
        &self,
        key: &str,
        limit_rpm: u32,
    ) -> Result<RateLimitResult, RateLimitError> {
        let redis_key = format!("{}:{}", self.key_prefix, key);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("Time went backwards")
            .as_secs();

        // Window size: 60 seconds
        let window_size: u64 = 60;

        let mut conn = self.redis.connection();

        // Use Redis MULTI/EXEC for atomic operations
        // Lua script for atomic increment and TTL check
        let script = redis::Script::new(
            r#"
            local key = KEYS[1]
            local limit = tonumber(ARGV[1])
            local window_size = tonumber(ARGV[2])
            local now = tonumber(ARGV[3])

            -- Get current count
            local current = redis.call('GET', key)
            current = current and tonumber(current) or 0

            if current >= limit then
                -- Rate limit exceeded
                local ttl = redis.call('TTL', key)
                if ttl < 0 then ttl = window_size end
                return {0, current, ttl}
            end

            -- Increment counter
            local new_count = redis.call('INCR', key)

            -- Set TTL on first request in window
            if new_count == 1 then
                redis.call('EXPIRE', key, window_size)
            end

            local ttl = redis.call('TTL', key)
            if ttl < 0 then ttl = window_size end

            return {1, new_count, ttl}
            "#,
        );

        let result: (i32, i32, i64) = script
            .key(&redis_key)
            .arg(limit_rpm)
            .arg(window_size)
            .arg(now)
            .invoke_async(&mut conn)
            .await?;

        let (allowed, count, ttl) = result;
        let remaining = limit_rpm.saturating_sub(count as u32);

        let result = RateLimitResult {
            allowed: allowed == 1,
            limit: limit_rpm,
            remaining,
            reset_after_secs: ttl as u64,
            reset_at: now + ttl as u64,
        };

        debug!(
            key = %key,
            limit = %limit_rpm,
            remaining = %result.remaining,
            allowed = %result.allowed,
            "Rate limit check"
        );

        Ok(result)
    }

    /// Check rate limit without consuming a token (peek)
    ///
    /// Useful for checking current state without affecting the counter.
    pub async fn peek(&self, key: &str, limit_rpm: u32) -> Result<RateLimitResult, RateLimitError> {
        let redis_key = format!("{}:{}", self.key_prefix, key);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("Time went backwards")
            .as_secs();

        let window_size: u64 = 60;

        let mut conn = self.redis.connection();

        // Get current count without incrementing
        let count: Option<u32> = conn.get(&redis_key).await?;
        let count = count.unwrap_or(0);

        let ttl: i64 = conn.ttl(&redis_key).await.unwrap_or(window_size as i64);
        let ttl = if ttl < 0 { window_size as i64 } else { ttl };

        let remaining = limit_rpm.saturating_sub(count);

        Ok(RateLimitResult {
            allowed: count < limit_rpm,
            limit: limit_rpm,
            remaining,
            reset_after_secs: ttl as u64,
            reset_at: now + ttl as u64,
        })
    }

    /// Reset rate limit for a specific key
    ///
    /// Useful for administrative purposes or testing.
    pub async fn reset(&self, key: &str) -> Result<(), RateLimitError> {
        let redis_key = format!("{}:{}", self.key_prefix, key);
        let mut conn = self.redis.connection();

        conn.del::<_, ()>(&redis_key).await?;

        debug!(key = %key, "Rate limit reset");

        Ok(())
    }

    /// Check monthly token budget
    ///
    /// This is a separate limit from RPM, tracking total token usage per month.
    ///
    /// # Arguments
    ///
    /// * `key` - Unique identifier (e.g., API key ID or team ID)
    /// * `limit` - Maximum tokens allowed per month
    /// * `tokens_used` - Tokens to consume with this request
    ///
    /// # Returns
    ///
    /// Returns `true` if within budget, `false` if budget exceeded.
    pub async fn check_token_budget(
        &self,
        key: &str,
        limit: i64,
        tokens_to_add: i64,
    ) -> Result<bool, RateLimitError> {
        let redis_key = format!("{}:tokens:{}", self.key_prefix, key);
        let now = chrono::Utc::now();
        let month_key = format!("{}:{}", redis_key, now.format("%Y-%m"));

        let mut conn = self.redis.connection();

        // Get current usage
        let current: i64 = conn.get(&month_key).await.unwrap_or(0);

        if current + tokens_to_add > limit {
            warn!(
                key = %key,
                current = %current,
                limit = %limit,
                tokens_to_add = %tokens_to_add,
                "Monthly token budget exceeded"
            );
            return Ok(false);
        }

        // Increment usage
        conn.incr::<_, _, i64>(&month_key, tokens_to_add).await?;

        // Set TTL to expire after this month (max 31 days + buffer)
        let ttl: i64 = conn.ttl(&month_key).await.unwrap_or(-1);
        if ttl < 0 {
            // 35 days to be safe
            conn.expire::<_, ()>(&month_key, 35 * 24 * 60 * 60).await?;
        }

        debug!(
            key = %key,
            current = %(current + tokens_to_add),
            limit = %limit,
            "Token budget check passed"
        );

        Ok(true)
    }

    /// Check + atomically increment the per-UTC-day message counter for
    /// the given key. Returns Ok((allowed, used, seconds_until_reset)):
    ///
    ///   - `allowed = true` and counter incremented → request OK
    ///   - `allowed = false` → daily cap reached, counter NOT incremented
    ///   - Redis errors propagate as RateLimitError; the caller should
    ///     fail-open to avoid taking the gateway down with the limiter.
    ///
    /// Counter key: `<prefix>:daily_msgs:<api_key_id>:YYYY-MM-DD`. TTL is
    /// set once on the first increment to expire ~25h later (a bit past
    /// midnight UTC), so the next day's key starts fresh.
    ///
    /// We use a Lua script to make the GET / INCR / EXPIRE sequence
    /// atomic — otherwise two concurrent calls at the exact boundary
    /// could both see "current = limit - 1" and both increment, allowing
    /// limit+1 messages through. With ~5-req/min anti-burst already
    /// gating the request, this race is theoretical but cheap to close.
    pub async fn check_daily_messages(
        &self,
        key: &str,
        limit: u32,
    ) -> Result<DailyMessageResult, RateLimitError> {
        let now = chrono::Utc::now();
        let day = now.format("%Y-%m-%d").to_string();
        let redis_key = format!("{}:daily_msgs:{}:{}", self.key_prefix, key, day);

        // Seconds until 00:00 UTC the next day. We set this as the TTL
        // on a fresh counter so it rolls over exactly at midnight.
        let tomorrow = (now + chrono::Duration::days(1))
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .map(|naive| naive.and_utc())
            .unwrap_or(now + chrono::Duration::hours(24));
        let ttl_seconds = (tomorrow - now).num_seconds().max(60);

        // KEYS[1] = redis_key, ARGV[1] = limit, ARGV[2] = ttl
        // Returns: { allowed (1|0), used_after_call, reset_in_seconds }
        let script = redis::Script::new(
            r#"
            local current = tonumber(redis.call('GET', KEYS[1]) or '0')
            local limit = tonumber(ARGV[1])
            if current >= limit then
                local ttl = redis.call('TTL', KEYS[1])
                if ttl < 0 then ttl = tonumber(ARGV[2]) end
                return { 0, current, ttl }
            end
            local new_val = redis.call('INCR', KEYS[1])
            if new_val == 1 then
                redis.call('EXPIRE', KEYS[1], ARGV[2])
            end
            local ttl = redis.call('TTL', KEYS[1])
            if ttl < 0 then ttl = tonumber(ARGV[2]) end
            return { 1, new_val, ttl }
            "#,
        );

        let mut conn = self.redis.connection();
        let result: Vec<i64> = script
            .key(&redis_key)
            .arg(limit as i64)
            .arg(ttl_seconds)
            .invoke_async(&mut conn)
            .await?;

        let allowed = result.first().copied().unwrap_or(0) == 1;
        let used = result.get(1).copied().unwrap_or(0) as u32;
        let reset_after_secs = result.get(2).copied().unwrap_or(ttl_seconds) as u64;

        if !allowed {
            warn!(
                key = %key,
                used = %used,
                limit = %limit,
                "Daily message limit reached"
            );
        } else {
            debug!(
                key = %key,
                used = %used,
                limit = %limit,
                "Daily message check passed"
            );
        }

        Ok(DailyMessageResult {
            allowed,
            limit,
            used,
            reset_after_secs,
        })
    }
}

/// Outcome of a daily-message limit check, mirroring `RateLimitResult`
/// in shape so headers + error responses are easy to assemble.
#[derive(Debug, Clone)]
pub struct DailyMessageResult {
    pub allowed: bool,
    pub limit: u32,
    pub used: u32,
    pub reset_after_secs: u64,
}

impl DailyMessageResult {
    /// Headers to attach so the chat client can show a "X messages
    /// remaining today" indicator if it wants to.
    pub fn headers(&self) -> Vec<(&'static str, String)> {
        let remaining = self.limit.saturating_sub(self.used);
        vec![
            ("X-Daily-Limit", self.limit.to_string()),
            ("X-Daily-Remaining", remaining.to_string()),
            ("X-Daily-Reset", self.reset_after_secs.to_string()),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limit_result_headers() {
        let result = RateLimitResult {
            allowed: true,
            limit: 100,
            remaining: 50,
            reset_after_secs: 30,
            reset_at: 1700000000,
        };

        let headers = result.headers();
        assert_eq!(headers.len(), 3);
        assert!(headers
            .iter()
            .any(|(k, v)| *k == "X-RateLimit-Limit" && v == "100"));
        assert!(headers
            .iter()
            .any(|(k, v)| *k == "X-RateLimit-Remaining" && v == "50"));
    }
}
