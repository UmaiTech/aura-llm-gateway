//! Provider error types
//!
//! Custom error types for LLM provider operations.

use thiserror::Error;

/// Errors that can occur when interacting with LLM providers
#[derive(Debug, Error)]
pub enum ProviderError {
    /// The request was invalid or malformed
    #[error("Invalid request: {message}")]
    InvalidRequest {
        /// Error message describing the issue
        message: String,
        /// Optional parameter that caused the error
        param: Option<String>,
    },

    /// Authentication failed (invalid API key, etc.)
    #[error("Authentication failed: {message}")]
    Authentication {
        /// Error message
        message: String,
    },

    /// Rate limit exceeded
    #[error("Rate limit exceeded: {message}")]
    RateLimit {
        /// Error message
        message: String,
        /// Retry after duration in seconds (if provided by the API)
        retry_after: Option<u64>,
    },

    /// The requested model is not available
    #[error("Model not found: {model}")]
    ModelNotFound {
        /// The requested model
        model: String,
    },

    /// Content was filtered by safety systems
    #[error("Content filtered: {message}")]
    ContentFilter {
        /// Reason for filtering
        message: String,
    },

    /// The provider's service is unavailable
    #[error("Provider unavailable: {message}")]
    ServiceUnavailable {
        /// Error message
        message: String,
    },

    /// Request timeout
    #[error("Request timeout after {timeout_ms}ms")]
    Timeout {
        /// Timeout duration in milliseconds
        timeout_ms: u64,
    },

    /// Network or connection error
    #[error("Network error: {message}")]
    Network {
        /// Error message
        message: String,
    },

    /// Error parsing the provider's response
    #[error("Failed to parse response: {message}")]
    ParseError {
        /// Error message
        message: String,
    },

    /// Streaming error
    #[error("Streaming error: {message}")]
    StreamError {
        /// Error message
        message: String,
    },

    /// Provider returned an unexpected error
    #[error("Provider error ({status_code}): {message}")]
    ProviderError {
        /// HTTP status code
        status_code: u16,
        /// Error message from the provider
        message: String,
        /// Error type/code from the provider
        error_type: Option<String>,
    },

    /// Internal error
    #[error("Internal error: {message}")]
    Internal {
        /// Error message
        message: String,
    },
}

impl ProviderError {
    /// Create an invalid request error
    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::InvalidRequest {
            message: message.into(),
            param: None,
        }
    }

    /// Create an invalid request error with a parameter
    pub fn invalid_request_with_param(
        message: impl Into<String>,
        param: impl Into<String>,
    ) -> Self {
        Self::InvalidRequest {
            message: message.into(),
            param: Some(param.into()),
        }
    }

    /// Create an authentication error
    pub fn authentication(message: impl Into<String>) -> Self {
        Self::Authentication {
            message: message.into(),
        }
    }

    /// Create a rate limit error
    pub fn rate_limit(message: impl Into<String>) -> Self {
        Self::RateLimit {
            message: message.into(),
            retry_after: None,
        }
    }

    /// Create a rate limit error with retry-after
    pub fn rate_limit_with_retry(message: impl Into<String>, retry_after: u64) -> Self {
        Self::RateLimit {
            message: message.into(),
            retry_after: Some(retry_after),
        }
    }

    /// Create a model not found error
    pub fn model_not_found(model: impl Into<String>) -> Self {
        Self::ModelNotFound {
            model: model.into(),
        }
    }

    /// Create a content filter error
    pub fn content_filter(message: impl Into<String>) -> Self {
        Self::ContentFilter {
            message: message.into(),
        }
    }

    /// Create a service unavailable error
    pub fn service_unavailable(message: impl Into<String>) -> Self {
        Self::ServiceUnavailable {
            message: message.into(),
        }
    }

    /// Create a timeout error
    pub fn timeout(timeout_ms: u64) -> Self {
        Self::Timeout { timeout_ms }
    }

    /// Create a network error
    pub fn network(message: impl Into<String>) -> Self {
        Self::Network {
            message: message.into(),
        }
    }

    /// Create a parse error
    pub fn parse_error(message: impl Into<String>) -> Self {
        Self::ParseError {
            message: message.into(),
        }
    }

    /// Create a stream error
    pub fn stream_error(message: impl Into<String>) -> Self {
        Self::StreamError {
            message: message.into(),
        }
    }

    /// Create a provider error
    pub fn from_provider(status_code: u16, message: impl Into<String>) -> Self {
        Self::ProviderError {
            status_code,
            message: message.into(),
            error_type: None,
        }
    }

    /// Create an internal error
    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal {
            message: message.into(),
        }
    }

    /// Check if this error is retryable
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            Self::RateLimit { .. }
                | Self::ServiceUnavailable { .. }
                | Self::Timeout { .. }
                | Self::Network { .. }
        )
    }

    /// Get the error code for the Open Responses API
    pub fn error_code(&self) -> &'static str {
        match self {
            Self::InvalidRequest { .. } => "invalid_request",
            Self::Authentication { .. } => "authentication_error",
            Self::RateLimit { .. } => "rate_limit_exceeded",
            Self::ModelNotFound { .. } => "model_not_found",
            Self::ContentFilter { .. } => "content_filter",
            Self::ServiceUnavailable { .. } => "service_unavailable",
            Self::Timeout { .. } => "timeout",
            Self::Network { .. } => "network_error",
            Self::ParseError { .. } => "parse_error",
            Self::StreamError { .. } => "stream_error",
            Self::ProviderError { .. } => "provider_error",
            Self::Internal { .. } => "internal_error",
        }
    }

    /// Get the HTTP status code for this error
    pub fn status_code(&self) -> u16 {
        match self {
            Self::InvalidRequest { .. } => 400,
            Self::Authentication { .. } => 401,
            Self::RateLimit { .. } => 429,
            Self::ModelNotFound { .. } => 404,
            Self::ContentFilter { .. } => 400,
            Self::ServiceUnavailable { .. } => 503,
            Self::Timeout { .. } => 504,
            Self::Network { .. } => 502,
            Self::ParseError { .. } => 502,
            Self::StreamError { .. } => 500,
            Self::ProviderError { status_code, .. } => *status_code,
            Self::Internal { .. } => 500,
        }
    }
}

/// Convert from reqwest errors
impl From<reqwest::Error> for ProviderError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            Self::Timeout { timeout_ms: 0 }
        } else if err.is_connect() {
            Self::Network {
                message: format!("Connection failed: {}", err),
            }
        } else if err.is_request() {
            Self::InvalidRequest {
                message: format!("Request error: {}", err),
                param: None,
            }
        } else {
            Self::Network {
                message: err.to_string(),
            }
        }
    }
}

/// Convert from serde_json errors
impl From<serde_json::Error> for ProviderError {
    fn from(err: serde_json::Error) -> Self {
        Self::ParseError {
            message: err.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_creation() {
        let err = ProviderError::invalid_request("Bad input");
        assert!(matches!(err, ProviderError::InvalidRequest { .. }));
        assert_eq!(err.error_code(), "invalid_request");
        assert_eq!(err.status_code(), 400);
    }

    #[test]
    fn test_retryable_errors() {
        assert!(ProviderError::rate_limit("Too many requests").is_retryable());
        assert!(ProviderError::service_unavailable("Down").is_retryable());
        assert!(ProviderError::timeout(5000).is_retryable());
        assert!(ProviderError::network("Connection refused").is_retryable());
        assert!(!ProviderError::authentication("Invalid key").is_retryable());
        assert!(!ProviderError::invalid_request("Bad").is_retryable());
    }

    #[test]
    fn test_error_display() {
        let err = ProviderError::authentication("Invalid API key");
        assert_eq!(err.to_string(), "Authentication failed: Invalid API key");
    }

    #[test]
    fn test_rate_limit_with_retry() {
        let err = ProviderError::rate_limit_with_retry("Too many requests", 60);
        if let ProviderError::RateLimit { retry_after, .. } = err {
            assert_eq!(retry_after, Some(60));
        } else {
            panic!("Expected RateLimit error");
        }
    }
}
