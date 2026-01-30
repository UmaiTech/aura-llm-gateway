//! Health tracking for provider endpoints
//!
//! Implements a circuit breaker pattern to handle unhealthy endpoints:
//! - Tracks success/failure rates
//! - Opens circuit when failure threshold is exceeded
//! - Half-opens circuit after recovery timeout to test health
//! - Closes circuit when endpoint recovers

use crate::provider::ProviderError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::RwLock;
use std::time::{Duration, Instant};
use tracing::{debug, info, warn};

/// Health state of an endpoint (circuit breaker states)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthState {
    /// Endpoint is healthy and accepting requests
    Healthy,
    /// Endpoint is unhealthy, requests are blocked
    Unhealthy,
    /// Endpoint is being tested after recovery timeout
    HalfOpen,
}

impl std::fmt::Display for HealthState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HealthState::Healthy => write!(f, "healthy"),
            HealthState::Unhealthy => write!(f, "unhealthy"),
            HealthState::HalfOpen => write!(f, "half_open"),
        }
    }
}

/// Health statistics for an endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointHealth {
    /// Current health state
    pub state: HealthState,
    /// Total successful requests
    pub success_count: u64,
    /// Total failed requests
    pub failure_count: u64,
    /// Consecutive failures (reset on success)
    pub consecutive_failures: u32,
    /// Last failure time (Unix timestamp ms)
    pub last_failure_ms: Option<u64>,
    /// Last success time (Unix timestamp ms)
    pub last_success_ms: Option<u64>,
    /// Last error message
    pub last_error: Option<String>,
    /// Time when circuit was opened (Unix timestamp ms)
    pub circuit_opened_ms: Option<u64>,
}

impl Default for EndpointHealth {
    fn default() -> Self {
        Self {
            state: HealthState::Healthy,
            success_count: 0,
            failure_count: 0,
            consecutive_failures: 0,
            last_failure_ms: None,
            last_success_ms: None,
            last_error: None,
            circuit_opened_ms: None,
        }
    }
}

impl EndpointHealth {
    /// Calculate success rate (0.0 - 1.0)
    pub fn success_rate(&self) -> f64 {
        let total = self.success_count + self.failure_count;
        if total == 0 {
            1.0 // No requests yet, assume healthy
        } else {
            self.success_count as f64 / total as f64
        }
    }

    /// Check if endpoint is available for requests
    pub fn is_available(&self) -> bool {
        matches!(self.state, HealthState::Healthy | HealthState::HalfOpen)
    }
}

/// Internal mutable health state
struct HealthEntry {
    state: HealthState,
    success_count: AtomicU64,
    failure_count: AtomicU64,
    consecutive_failures: AtomicU64,
    last_failure: RwLock<Option<Instant>>,
    last_success: RwLock<Option<Instant>>,
    last_error: RwLock<Option<String>>,
    circuit_opened: RwLock<Option<Instant>>,
}

impl Default for HealthEntry {
    fn default() -> Self {
        Self {
            state: HealthState::Healthy,
            success_count: AtomicU64::new(0),
            failure_count: AtomicU64::new(0),
            consecutive_failures: AtomicU64::new(0),
            last_failure: RwLock::new(None),
            last_success: RwLock::new(None),
            last_error: RwLock::new(None),
            circuit_opened: RwLock::new(None),
        }
    }
}

/// Configuration for health tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthConfig {
    /// Number of consecutive failures to open circuit
    pub failure_threshold: u32,
    /// Duration to wait before trying a half-open request
    pub recovery_timeout: Duration,
    /// Number of successes in half-open state to close circuit
    pub success_threshold: u32,
    /// Whether to consider rate limit errors as failures
    pub rate_limit_is_failure: bool,
}

impl Default for HealthConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            recovery_timeout: Duration::from_secs(30),
            success_threshold: 2,
            rate_limit_is_failure: false, // Rate limits are expected, not failures
        }
    }
}

/// Tracks health of provider endpoints
pub struct HealthTracker {
    /// Health state per endpoint
    entries: RwLock<HashMap<String, HealthEntry>>,
    /// Configuration
    config: HealthConfig,
}

impl HealthTracker {
    /// Create a new health tracker with the given configuration
    pub fn new(config: HealthConfig) -> Self {
        Self {
            entries: RwLock::new(HashMap::new()),
            config,
        }
    }

    /// Create a health tracker with default configuration
    pub fn with_defaults() -> Self {
        Self::new(HealthConfig::default())
    }

    /// Register an endpoint for tracking
    pub fn register_endpoint(&self, endpoint_id: &str) {
        let mut entries = self.entries.write().unwrap();
        entries.entry(endpoint_id.to_string()).or_default();
    }

    /// Check if an endpoint is healthy (available for requests)
    pub fn is_healthy(&self, endpoint_id: &str) -> bool {
        let entries = self.entries.read().unwrap();
        if let Some(entry) = entries.get(endpoint_id) {
            match entry.state {
                HealthState::Healthy => true,
                HealthState::Unhealthy => {
                    // Check if recovery timeout has passed
                    if let Some(opened) = *entry.circuit_opened.read().unwrap() {
                        opened.elapsed() >= self.config.recovery_timeout
                    } else {
                        false
                    }
                }
                HealthState::HalfOpen => true,
            }
        } else {
            true // Unknown endpoints are assumed healthy
        }
    }

    /// Record a successful request
    pub fn record_success(&self, endpoint_id: &str) {
        let mut entries = self.entries.write().unwrap();
        let entry = entries.entry(endpoint_id.to_string()).or_default();

        entry.success_count.fetch_add(1, Ordering::Relaxed);
        entry.consecutive_failures.store(0, Ordering::Relaxed);
        *entry.last_success.write().unwrap() = Some(Instant::now());

        // Handle state transitions
        match entry.state {
            HealthState::HalfOpen => {
                // Successful request in half-open state, close the circuit
                entry.state = HealthState::Healthy;
                *entry.circuit_opened.write().unwrap() = None;
                info!(endpoint_id = %endpoint_id, "Circuit closed - endpoint recovered");
            }
            HealthState::Unhealthy => {
                // This shouldn't happen often, but handle gracefully
                entry.state = HealthState::Healthy;
                *entry.circuit_opened.write().unwrap() = None;
            }
            HealthState::Healthy => {}
        }
    }

    /// Record a failed request
    pub fn record_failure(&self, endpoint_id: &str, error: &ProviderError) {
        // Skip rate limit errors if configured
        if !self.config.rate_limit_is_failure && matches!(error, ProviderError::RateLimit { .. }) {
            debug!(
                endpoint_id = %endpoint_id,
                "Rate limit error not counted as failure"
            );
            return;
        }

        let mut entries = self.entries.write().unwrap();
        let entry = entries.entry(endpoint_id.to_string()).or_default();

        entry.failure_count.fetch_add(1, Ordering::Relaxed);
        let consecutive = entry.consecutive_failures.fetch_add(1, Ordering::Relaxed) + 1;
        *entry.last_failure.write().unwrap() = Some(Instant::now());
        *entry.last_error.write().unwrap() = Some(error.to_string());

        // Handle state transitions
        match entry.state {
            HealthState::Healthy => {
                if consecutive >= self.config.failure_threshold as u64 {
                    entry.state = HealthState::Unhealthy;
                    *entry.circuit_opened.write().unwrap() = Some(Instant::now());
                    warn!(
                        endpoint_id = %endpoint_id,
                        consecutive_failures = %consecutive,
                        threshold = %self.config.failure_threshold,
                        "Circuit opened - endpoint marked unhealthy"
                    );
                }
            }
            HealthState::HalfOpen => {
                // Failed during half-open test, reopen circuit
                entry.state = HealthState::Unhealthy;
                *entry.circuit_opened.write().unwrap() = Some(Instant::now());
                warn!(
                    endpoint_id = %endpoint_id,
                    "Circuit reopened - half-open test failed"
                );
            }
            HealthState::Unhealthy => {
                // Already unhealthy, just update timestamp
                *entry.circuit_opened.write().unwrap() = Some(Instant::now());
            }
        }
    }

    /// Get health status for an endpoint
    pub fn get_health(&self, endpoint_id: &str) -> Option<EndpointHealth> {
        let entries = self.entries.read().unwrap();
        entries.get(endpoint_id).map(|entry| {
            let now_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;

            EndpointHealth {
                state: entry.state,
                success_count: entry.success_count.load(Ordering::Relaxed),
                failure_count: entry.failure_count.load(Ordering::Relaxed),
                consecutive_failures: entry.consecutive_failures.load(Ordering::Relaxed) as u32,
                last_failure_ms: entry
                    .last_failure
                    .read()
                    .unwrap()
                    .map(|i| now_ms.saturating_sub(i.elapsed().as_millis() as u64)),
                last_success_ms: entry
                    .last_success
                    .read()
                    .unwrap()
                    .map(|i| now_ms.saturating_sub(i.elapsed().as_millis() as u64)),
                last_error: entry.last_error.read().unwrap().clone(),
                circuit_opened_ms: entry
                    .circuit_opened
                    .read()
                    .unwrap()
                    .map(|i| now_ms.saturating_sub(i.elapsed().as_millis() as u64)),
            }
        })
    }

    /// Get health status for all endpoints
    pub fn all_health(&self) -> HashMap<String, EndpointHealth> {
        let entries = self.entries.read().unwrap();
        entries
            .keys()
            .filter_map(|id| self.get_health(id).map(|h| (id.clone(), h)))
            .collect()
    }

    /// Manually mark an endpoint as healthy
    pub fn mark_healthy(&self, endpoint_id: &str) {
        let mut entries = self.entries.write().unwrap();
        if let Some(entry) = entries.get_mut(endpoint_id) {
            entry.state = HealthState::Healthy;
            entry.consecutive_failures.store(0, Ordering::Relaxed);
            *entry.circuit_opened.write().unwrap() = None;
            info!(endpoint_id = %endpoint_id, "Endpoint manually marked healthy");
        }
    }

    /// Manually mark an endpoint as unhealthy
    pub fn mark_unhealthy(&self, endpoint_id: &str) {
        let mut entries = self.entries.write().unwrap();
        if let Some(entry) = entries.get_mut(endpoint_id) {
            entry.state = HealthState::Unhealthy;
            *entry.circuit_opened.write().unwrap() = Some(Instant::now());
            warn!(endpoint_id = %endpoint_id, "Endpoint manually marked unhealthy");
        }
    }

    /// Reset health statistics for an endpoint
    pub fn reset(&self, endpoint_id: &str) {
        let mut entries = self.entries.write().unwrap();
        if let Some(entry) = entries.get_mut(endpoint_id) {
            entry.state = HealthState::Healthy;
            entry.success_count.store(0, Ordering::Relaxed);
            entry.failure_count.store(0, Ordering::Relaxed);
            entry.consecutive_failures.store(0, Ordering::Relaxed);
            *entry.last_failure.write().unwrap() = None;
            *entry.last_success.write().unwrap() = None;
            *entry.last_error.write().unwrap() = None;
            *entry.circuit_opened.write().unwrap() = None;
            info!(endpoint_id = %endpoint_id, "Endpoint health statistics reset");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_health_state_display() {
        assert_eq!(HealthState::Healthy.to_string(), "healthy");
        assert_eq!(HealthState::Unhealthy.to_string(), "unhealthy");
        assert_eq!(HealthState::HalfOpen.to_string(), "half_open");
    }

    #[test]
    fn test_endpoint_health_success_rate() {
        let mut health = EndpointHealth::default();
        assert_eq!(health.success_rate(), 1.0); // No requests yet

        health.success_count = 8;
        health.failure_count = 2;
        assert!((health.success_rate() - 0.8).abs() < 0.001);
    }

    #[test]
    fn test_health_tracker_registration() {
        let tracker = HealthTracker::with_defaults();
        tracker.register_endpoint("ep-1");

        assert!(tracker.is_healthy("ep-1"));
        assert!(tracker.get_health("ep-1").is_some());
    }

    #[test]
    fn test_health_tracker_success_recording() {
        let tracker = HealthTracker::with_defaults();
        tracker.register_endpoint("ep-1");

        tracker.record_success("ep-1");
        tracker.record_success("ep-1");

        let health = tracker.get_health("ep-1").unwrap();
        assert_eq!(health.success_count, 2);
        assert_eq!(health.failure_count, 0);
        assert_eq!(health.state, HealthState::Healthy);
    }

    #[test]
    fn test_health_tracker_failure_opens_circuit() {
        let config = HealthConfig {
            failure_threshold: 3,
            ..Default::default()
        };
        let tracker = HealthTracker::new(config);
        tracker.register_endpoint("ep-1");

        let error = ProviderError::internal("Test error");

        // First two failures don't open circuit
        tracker.record_failure("ep-1", &error);
        tracker.record_failure("ep-1", &error);
        assert!(tracker.is_healthy("ep-1"));

        // Third failure opens circuit
        tracker.record_failure("ep-1", &error);
        assert!(!tracker.is_healthy("ep-1"));

        let health = tracker.get_health("ep-1").unwrap();
        assert_eq!(health.state, HealthState::Unhealthy);
        assert_eq!(health.consecutive_failures, 3);
    }

    #[test]
    fn test_health_tracker_success_resets_consecutive_failures() {
        let config = HealthConfig {
            failure_threshold: 3,
            ..Default::default()
        };
        let tracker = HealthTracker::new(config);
        tracker.register_endpoint("ep-1");

        let error = ProviderError::internal("Test error");

        tracker.record_failure("ep-1", &error);
        tracker.record_failure("ep-1", &error);
        tracker.record_success("ep-1"); // Reset consecutive failures
        tracker.record_failure("ep-1", &error);
        tracker.record_failure("ep-1", &error);

        // Should still be healthy because consecutive failures were reset
        assert!(tracker.is_healthy("ep-1"));

        let health = tracker.get_health("ep-1").unwrap();
        assert_eq!(health.consecutive_failures, 2);
    }

    #[test]
    fn test_health_tracker_rate_limit_not_counted() {
        let config = HealthConfig {
            failure_threshold: 1,
            rate_limit_is_failure: false,
            ..Default::default()
        };
        let tracker = HealthTracker::new(config);
        tracker.register_endpoint("ep-1");

        let error = ProviderError::rate_limit("Rate limit exceeded");
        tracker.record_failure("ep-1", &error);

        // Should still be healthy because rate limits aren't counted
        assert!(tracker.is_healthy("ep-1"));
    }

    #[test]
    fn test_health_tracker_manual_marking() {
        let tracker = HealthTracker::with_defaults();
        tracker.register_endpoint("ep-1");

        tracker.mark_unhealthy("ep-1");
        assert!(!tracker.is_healthy("ep-1"));

        tracker.mark_healthy("ep-1");
        assert!(tracker.is_healthy("ep-1"));
    }
}
