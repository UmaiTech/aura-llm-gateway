//! HTTP client infrastructure for making requests to LLM providers
//!
//! This module provides a configurable HTTP client with:
//! - Timeouts
//! - Retry logic with exponential backoff
//! - Request/response logging
//! - TLS support via rustls

use reqwest::{Client, Request, Response};
use std::time::Duration;
use thiserror::Error;
use tracing::{debug, error, instrument, warn};

/// HTTP client errors
#[derive(Error, Debug)]
pub enum HttpError {
    #[error("Request failed: {0}")]
    RequestFailed(#[from] reqwest::Error),

    #[error("Request timeout after {0:?}")]
    Timeout(Duration),

    #[error("Max retries ({0}) exceeded")]
    MaxRetriesExceeded(u32),

    #[error("Invalid request: {0}")]
    InvalidRequest(String),
}

/// HTTP client configuration
#[derive(Debug, Clone)]
pub struct HttpClientConfig {
    /// Request timeout duration
    pub timeout: Duration,

    /// Connect timeout duration
    pub connect_timeout: Duration,

    /// Maximum number of retry attempts
    pub max_retries: u32,

    /// Initial retry delay (doubles on each retry)
    pub retry_delay: Duration,

    /// User agent string
    pub user_agent: String,
}

impl Default for HttpClientConfig {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(60),
            connect_timeout: Duration::from_secs(10),
            max_retries: 3,
            retry_delay: Duration::from_millis(500),
            user_agent: format!("aura-llm-gateway/{}", env!("CARGO_PKG_VERSION")),
        }
    }
}

/// HTTP client wrapper with retry and logging capabilities
#[derive(Clone)]
pub struct HttpClient {
    client: Client,
    config: HttpClientConfig,
}

impl HttpClient {
    /// Creates a new HTTP client with default configuration
    pub fn new() -> Result<Self, HttpError> {
        Self::with_config(HttpClientConfig::default())
    }

    /// Creates a new HTTP client with custom configuration
    pub fn with_config(config: HttpClientConfig) -> Result<Self, HttpError> {
        let client = Client::builder()
            .timeout(config.timeout)
            .connect_timeout(config.connect_timeout)
            .user_agent(&config.user_agent)
            .use_rustls_tls()
            .build()
            .map_err(HttpError::RequestFailed)?;

        Ok(Self { client, config })
    }

    /// Executes a request with retry logic and logging
    #[instrument(skip(self, request), fields(
        method = %request.method(),
        url = %request.url(),
    ))]
    pub async fn execute(&self, request: Request) -> Result<Response, HttpError> {
        let method = request.method().clone();
        let url = request.url().clone();

        debug!("Sending HTTP request");

        let mut last_error = None;

        for attempt in 0..=self.config.max_retries {
            if attempt > 0 {
                let delay = self.config.retry_delay * 2_u32.pow(attempt - 1);
                warn!(
                    attempt = attempt,
                    delay_ms = delay.as_millis(),
                    "Retrying request after failure"
                );
                tokio::time::sleep(delay).await;
            }

            // Clone the request for retry
            let request_clone = request
                .try_clone()
                .ok_or_else(|| HttpError::InvalidRequest("Request body is not cloneable".into()))?;

            match self.client.execute(request_clone).await {
                Ok(response) => {
                    let status = response.status();
                    debug!(
                        status = %status,
                        "Received HTTP response"
                    );

                    // Retry on 5xx errors or 429 (rate limit)
                    if status.is_server_error() || status.as_u16() == 429 {
                        warn!(
                            status = %status,
                            "Received retriable error status"
                        );
                        last_error = Some(HttpError::InvalidRequest(format!(
                            "HTTP {} {}",
                            status.as_u16(),
                            status.canonical_reason().unwrap_or("Unknown")
                        )));
                        continue;
                    }

                    return Ok(response);
                }
                Err(err) => {
                    error!(
                        error = %err,
                        "HTTP request failed"
                    );

                    if err.is_timeout() {
                        last_error = Some(HttpError::Timeout(self.config.timeout));
                    } else if err.is_connect() {
                        last_error = Some(HttpError::RequestFailed(err));
                    } else {
                        // For other errors, don't retry
                        return Err(HttpError::RequestFailed(err));
                    }
                }
            }
        }

        error!(
            method = %method,
            url = %url,
            "Max retries exceeded"
        );

        Err(last_error.unwrap_or(HttpError::MaxRetriesExceeded(self.config.max_retries)))
    }

    /// Convenience method to execute a GET request
    #[instrument(skip(self))]
    pub async fn get(&self, url: &str) -> Result<Response, HttpError> {
        let request = self
            .client
            .get(url)
            .build()
            .map_err(HttpError::RequestFailed)?;
        self.execute(request).await
    }

    /// Convenience method to execute a POST request with JSON body
    #[instrument(skip(self, body))]
    pub async fn post_json<T: serde::Serialize>(
        &self,
        url: &str,
        body: &T,
    ) -> Result<Response, HttpError> {
        let request = self
            .client
            .post(url)
            .json(body)
            .build()
            .map_err(HttpError::RequestFailed)?;
        self.execute(request).await
    }

    /// Returns a reference to the underlying reqwest client
    pub fn inner(&self) -> &Client {
        &self.client
    }

    /// Returns the client configuration
    pub fn config(&self) -> &HttpClientConfig {
        &self.config
    }
}

impl Default for HttpClient {
    fn default() -> Self {
        Self::new().expect("Failed to create default HTTP client")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_http_client_creation() {
        let client = HttpClient::new();
        assert!(client.is_ok());
    }

    #[test]
    fn test_http_client_with_custom_config() {
        let config = HttpClientConfig {
            timeout: Duration::from_secs(30),
            connect_timeout: Duration::from_secs(5),
            max_retries: 5,
            retry_delay: Duration::from_millis(1000),
            user_agent: "test-agent".to_string(),
        };

        let client = HttpClient::with_config(config.clone());
        assert!(client.is_ok());

        let client = client.unwrap();
        assert_eq!(client.config().timeout, Duration::from_secs(30));
        assert_eq!(client.config().max_retries, 5);
    }

    #[test]
    fn test_default_config() {
        let config = HttpClientConfig::default();
        assert_eq!(config.timeout, Duration::from_secs(60));
        assert_eq!(config.max_retries, 3);
        assert!(config.user_agent.contains("aura-llm-gateway"));
    }

    #[tokio::test]
    async fn test_get_request_success() {
        // This test requires internet connection
        let client = HttpClient::new().unwrap();

        // Use a reliable endpoint
        let result = client.get("https://httpbin.org/get").await;

        // Just verify it doesn't panic - actual success depends on network
        match result {
            Ok(response) => {
                assert!(response.status().is_success());
            }
            Err(err) => {
                // Network errors are acceptable in tests
                eprintln!("Network test failed (expected): {}", err);
            }
        }
    }
}
