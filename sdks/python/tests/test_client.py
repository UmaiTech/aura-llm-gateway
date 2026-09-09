"""Tests for Aura SDK client."""

import json
from unittest.mock import patch

import pytest

from aura import AuraClient, FeedbackSignal
from aura.exceptions import (
    APIError,
    AuthenticationError,
    BadRequestError,
    NotFoundError,
    RateLimitError,
)


class TestAuraClient:
    """Tests for AuraClient."""

    def test_client_initialization(self):
        """Test client initializes with defaults."""
        client = AuraClient()

        assert client.base_url == "http://localhost:8080"
        assert client.timeout == 60.0
        assert client.api_key is None

    def test_client_with_api_key(self):
        """Test client with API key."""
        client = AuraClient(api_key="test-key")

        assert client.api_key == "test-key"
        assert "Authorization" in client._headers
        assert client._headers["Authorization"] == "Bearer test-key"

    def test_client_with_custom_base_url(self):
        """Test client with custom base URL."""
        client = AuraClient(base_url="https://api.example.com")

        assert client.base_url == "https://api.example.com"

    def test_client_strips_trailing_slash(self):
        """Test client strips trailing slash from base URL."""
        client = AuraClient(base_url="http://localhost:8080/")

        assert client.base_url == "http://localhost:8080"

    def test_client_context_manager(self):
        """Test client can be used as context manager."""
        with AuraClient() as client:
            assert client is not None

    @patch.dict("os.environ", {"AURA_API_KEY": "env-key"})
    def test_client_uses_env_api_key(self):
        """Test client uses environment variable for API key."""
        client = AuraClient()

        assert client.api_key == "env-key"

    @patch.dict("os.environ", {"AURA_BASE_URL": "https://env.example.com"})
    def test_client_uses_env_base_url(self):
        """Test client uses environment variable for base URL."""
        client = AuraClient()

        assert client.base_url == "https://env.example.com"


class TestResponses:
    """Tests for Responses resource."""

    def test_build_payload_string_input(self):
        """Test payload building with string input."""
        client = AuraClient()
        payload = client.responses._build_payload(
            model="gpt-4o",
            input="Hello",
        )

        assert payload["model"] == "gpt-4o"
        assert payload["input"] == [{"role": "user", "content": "Hello"}]
        assert payload["stream"] is False

    def test_build_payload_with_options(self):
        """Test payload building with all options."""
        client = AuraClient()
        payload = client.responses._build_payload(
            model="gpt-4o",
            input="Hello",
            instructions="Be helpful",
            temperature=0.7,
            max_tokens=100,
            top_p=0.9,
            stream=True,
            previous_response_id="resp_123",
        )

        assert payload["model"] == "gpt-4o"
        assert payload["instructions"] == "Be helpful"
        assert payload["temperature"] == 0.7
        assert payload["max_tokens"] == 100
        assert payload["top_p"] == 0.9
        assert payload["stream"] is True
        assert payload["previous_response_id"] == "resp_123"


class TestErrorHandling:
    """Tests for error handling."""

    def test_handle_401_error(self):
        """Test 401 raises AuthenticationError."""
        client = AuraClient()

        class MockResponse:
            status_code = 401
            is_success = False
            text = "Unauthorized"

            def json(self):
                return {
                    "error": {
                        "code": "authentication_error",
                        "message": "Invalid API key",
                    }
                }

        with pytest.raises(AuthenticationError) as exc_info:
            client._handle_response(MockResponse())

        assert "Invalid API key" in str(exc_info.value)

    def test_handle_400_error(self):
        """Test 400 raises BadRequestError."""
        client = AuraClient()

        class MockResponse:
            status_code = 400
            is_success = False
            text = "Bad Request"

            def json(self):
                return {
                    "error": {
                        "code": "invalid_request",
                        "message": "Invalid model",
                        "param": "model",
                    }
                }

        with pytest.raises(BadRequestError) as exc_info:
            client._handle_response(MockResponse())

        assert exc_info.value.param == "model"

    def test_handle_429_error(self):
        """Test 429 raises RateLimitError."""
        client = AuraClient()

        class MockResponse:
            status_code = 429
            is_success = False
            text = "Too Many Requests"
            headers = {"Retry-After": "60"}

            def json(self):
                return {
                    "error": {
                        "code": "rate_limit_exceeded",
                        "message": "Rate limit exceeded",
                    }
                }

        with pytest.raises(RateLimitError) as exc_info:
            client._handle_response(MockResponse())

        assert exc_info.value.retry_after == 60

    def test_handle_404_error(self):
        """Test 404 raises NotFoundError."""
        client = AuraClient()

        class MockResponse:
            status_code = 404
            is_success = False
            text = "Not Found"

            def json(self):
                return {
                    "error": {
                        "code": "not_found",
                        "message": "Model not found",
                    }
                }

        with pytest.raises(NotFoundError):
            client._handle_response(MockResponse())

    def test_handle_500_error(self):
        """Test 500 raises APIError."""
        client = AuraClient()

        class MockResponse:
            status_code = 500
            is_success = False
            text = "Internal Server Error"

            def json(self):
                return {
                    "error": {
                        "code": "internal_error",
                        "message": "Something went wrong",
                    }
                }

        with pytest.raises(APIError) as exc_info:
            client._handle_response(MockResponse())

        assert exc_info.value.status_code == 500


class TestSSEParsing:
    """Tests for SSE event parsing."""

    def test_parse_text_delta_event(self):
        """Test parsing a text delta event."""
        client = AuraClient()

        event_str = """event: response.output_text.delta
data: {"type": "response.output_text.delta", "delta": "Hello", "output_index": 0, "content_index": 0}"""

        event = client._parse_sse_event(event_str)

        assert event is not None
        assert event.type == "response.output_text.delta"
        assert event.delta == "Hello"

    def test_parse_done_marker(self):
        """Test parsing [DONE] returns None."""
        client = AuraClient()

        event_str = "data: [DONE]"
        event = client._parse_sse_event(event_str)

        assert event is None

    def test_parse_comment_line(self):
        """Test comment lines are ignored."""
        client = AuraClient()

        event_str = """: this is a comment
data: {"type": "response.output_text.delta", "delta": "Hi", "output_index": 0, "content_index": 0}"""

        event = client._parse_sse_event(event_str)

        assert event is not None
        assert event.delta == "Hi"

    def test_parse_response_completed_event(self):
        """Test parsing a response.completed event."""
        client = AuraClient()

        response_data = {
            "id": "resp_123",
            "object": "response",
            "created_at": 1706140800,
            "status": "completed",
            "model": "gpt-4o",
            "output": [],
        }

        event_str = f"""event: response.completed
data: {{"type": "response.completed", "response": {json.dumps(response_data)}}}"""

        event = client._parse_sse_event(event_str)

        assert event is not None
        assert event.type == "response.completed"
        assert event.response.id == "resp_123"
        assert event.response.status.value == "completed"


class TestFeedback:
    """Tests for the Feedback resource."""

    def test_submit_builds_payload(self):
        """Test submit() posts the right body to /v1/feedback."""
        client = AuraClient()
        captured = {}

        def fake_request(method, path, **kwargs):
            captured["method"] = method
            captured["path"] = path
            captured["json"] = kwargs.get("json")
            return {"id": "fb_1", "recorded": True, "message": "feedback recorded"}

        client._request = fake_request

        result = client.feedback.submit(
            response_id="resp_1",
            signal=FeedbackSignal.THUMBS_UP,
            reason="good",
            tags=["math"],
        )

        assert result["recorded"] is True
        assert captured["method"] == "POST"
        assert captured["path"] == "/v1/feedback"
        assert captured["json"]["response_id"] == "resp_1"
        assert captured["json"]["signal"] == "ThumbsUp"
        assert captured["json"]["reason"] == "good"
        assert captured["json"]["tags"] == ["math"]

    def test_submit_accepts_plain_string_signal(self):
        """Test submit() accepts a raw string signal (gateway format)."""
        client = AuraClient()
        captured = {}

        def fake_request(method, path, **kwargs):
            captured["json"] = kwargs.get("json")
            return {"id": "fb_2", "recorded": True}

        client._request = fake_request

        client.feedback.submit(response_id="resp_2", signal="ThumbsDown")
        assert captured["json"]["signal"] == "ThumbsDown"

    def test_submit_minimal_payload(self):
        """Test submit() omits optional fields when not provided."""
        client = AuraClient()
        captured = {}

        def fake_request(method, path, **kwargs):
            captured["json"] = kwargs.get("json")
            return {"id": "fb_3", "recorded": True}

        client._request = fake_request

        client.feedback.submit(response_id="resp_3", signal=FeedbackSignal.THUMBS_UP)
        assert "reason" not in captured["json"]
        assert "tags" not in captured["json"]

    def test_list_passes_limit(self):
        """Test list() passes limit as a query param."""
        client = AuraClient()
        captured = {}

        def fake_request(method, path, **kwargs):
            captured["path"] = path
            captured["params"] = kwargs.get("params")
            return {"samples": [], "total": 0}

        client._request = fake_request

        client.feedback.list(limit=5)
        assert captured["path"] == "/v1/feedback"
        assert captured["params"] == {"limit": 5}

    def test_stats_hits_stats_endpoint(self):
        """Test stats() hits /v1/feedback/stats."""
        client = AuraClient()
        captured = {}

        def fake_request(method, path, **kwargs):
            captured["path"] = path
            return {"total": 1, "approved": 1}

        client._request = fake_request

        client.feedback.stats()
        assert captured["path"] == "/v1/feedback/stats"
