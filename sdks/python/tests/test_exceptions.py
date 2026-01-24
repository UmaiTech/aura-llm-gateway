"""Tests for Aura SDK exceptions."""

from aura.exceptions import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AuraError,
    AuthenticationError,
    BadRequestError,
    NotFoundError,
    RateLimitError,
)


class TestAuraError:
    """Tests for base AuraError."""

    def test_basic_error(self):
        """Test basic error creation."""
        error = AuraError("Something went wrong")

        assert str(error) == "Something went wrong"
        assert error.message == "Something went wrong"
        assert error.code is None

    def test_error_with_code(self):
        """Test error with code."""
        error = AuraError("Bad request", code="invalid_request")

        assert str(error) == "[invalid_request] Bad request"
        assert error.code == "invalid_request"

    def test_error_repr(self):
        """Test error repr."""
        error = AuraError(
            "Test error",
            code="test_code",
            param="test_param",
            status_code=400,
        )

        repr_str = repr(error)
        assert "AuraError" in repr_str
        assert "test_code" in repr_str
        assert "test_param" in repr_str
        assert "400" in repr_str


class TestAuthenticationError:
    """Tests for AuthenticationError."""

    def test_default_message(self):
        """Test default error message."""
        error = AuthenticationError()

        assert "Invalid or missing API key" in str(error)
        assert error.code == "authentication_error"
        assert error.status_code == 401

    def test_custom_message(self):
        """Test custom error message."""
        error = AuthenticationError("Token expired")

        assert "Token expired" in str(error)


class TestBadRequestError:
    """Tests for BadRequestError."""

    def test_with_param(self):
        """Test error with parameter."""
        error = BadRequestError("Invalid value", param="temperature")

        assert error.param == "temperature"
        assert error.code == "invalid_request"
        assert error.status_code == 400

    def test_without_param(self):
        """Test error without parameter."""
        error = BadRequestError("Malformed JSON")

        assert error.param is None


class TestRateLimitError:
    """Tests for RateLimitError."""

    def test_with_retry_after(self):
        """Test error with retry_after."""
        error = RateLimitError("Too many requests", retry_after=60)

        assert error.retry_after == 60
        assert error.code == "rate_limit_exceeded"
        assert error.status_code == 429

    def test_default_message(self):
        """Test default message."""
        error = RateLimitError()

        assert "Rate limit exceeded" in str(error)


class TestNotFoundError:
    """Tests for NotFoundError."""

    def test_not_found(self):
        """Test not found error."""
        error = NotFoundError("Model gpt-5 not found")

        assert error.code == "not_found"
        assert error.status_code == 404


class TestConnectionErrors:
    """Tests for connection errors."""

    def test_api_connection_error(self):
        """Test API connection error."""
        error = APIConnectionError("Connection refused")

        assert error.code == "connection_error"
        assert "Connection refused" in str(error)

    def test_api_timeout_error(self):
        """Test API timeout error."""
        error = APITimeoutError()

        assert error.code == "timeout"
        assert "timed out" in str(error)


class TestExceptionHierarchy:
    """Tests for exception hierarchy."""

    def test_api_error_is_aura_error(self):
        """Test APIError inherits from AuraError."""
        error = APIError("Test", code="test", status_code=500)

        assert isinstance(error, AuraError)

    def test_auth_error_is_api_error(self):
        """Test AuthenticationError inherits from APIError."""
        error = AuthenticationError()

        assert isinstance(error, APIError)
        assert isinstance(error, AuraError)

    def test_catch_all_with_aura_error(self):
        """Test catching all errors with AuraError."""
        errors = [
            AuthenticationError(),
            BadRequestError("test"),
            RateLimitError(),
            NotFoundError("test"),
            APIConnectionError(),
            APITimeoutError(),
        ]

        for error in errors:
            assert isinstance(error, AuraError)
