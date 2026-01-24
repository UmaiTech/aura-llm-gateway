"""
Aura SDK Exceptions

Custom exception classes for the Aura SDK, following the Open Responses API error format.
"""

from typing import Optional


class AuraError(Exception):
    """Base exception for all Aura SDK errors."""

    def __init__(
        self,
        message: str,
        *,
        code: Optional[str] = None,
        param: Optional[str] = None,
        status_code: Optional[int] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.param = param
        self.status_code = status_code

    def __str__(self) -> str:
        if self.code:
            return f"[{self.code}] {self.message}"
        return self.message

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"message={self.message!r}, "
            f"code={self.code!r}, "
            f"param={self.param!r}, "
            f"status_code={self.status_code!r})"
        )


class APIError(AuraError):
    """Error returned by the Aura API."""
    pass


class AuthenticationError(APIError):
    """Authentication failed - invalid or missing API key."""

    def __init__(self, message: str = "Invalid or missing API key") -> None:
        super().__init__(
            message,
            code="authentication_error",
            status_code=401,
        )


class BadRequestError(APIError):
    """The request was malformed or invalid."""

    def __init__(
        self,
        message: str,
        *,
        param: Optional[str] = None,
    ) -> None:
        super().__init__(
            message,
            code="invalid_request",
            param=param,
            status_code=400,
        )


class RateLimitError(APIError):
    """Rate limit exceeded."""

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        *,
        retry_after: Optional[int] = None,
    ) -> None:
        super().__init__(
            message,
            code="rate_limit_exceeded",
            status_code=429,
        )
        self.retry_after = retry_after


class NotFoundError(APIError):
    """Resource not found (e.g., invalid model)."""

    def __init__(self, message: str) -> None:
        super().__init__(
            message,
            code="not_found",
            status_code=404,
        )


class APIConnectionError(AuraError):
    """Failed to connect to the Aura API."""

    def __init__(self, message: str = "Failed to connect to Aura API") -> None:
        super().__init__(message, code="connection_error")


class APITimeoutError(AuraError):
    """Request to the Aura API timed out."""

    def __init__(self, message: str = "Request timed out") -> None:
        super().__init__(message, code="timeout")
