"""Tests for Aura SDK types."""

from aura.types import (
    MessageItem,
    ReasoningItem,
    Response,
    ResponseStatus,
    Role,
    TextContent,
    Tool,
    Usage,
    ValidationStrategy,
    assistant_message,
    system_message,
    user_message,
)


class TestResponse:
    """Tests for Response model."""

    def test_parse_simple_response(self):
        """Test parsing a simple response."""
        data = {
            "id": "resp_123",
            "object": "response",
            "created_at": 1706140800,
            "status": "completed",
            "model": "gpt-4o",
            "output": [
                {
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "text", "text": "Hello, world!"}],
                }
            ],
            "usage": {
                "input_tokens": 10,
                "output_tokens": 5,
                "total_tokens": 15,
            },
        }

        response = Response.model_validate(data)

        assert response.id == "resp_123"
        assert response.status == ResponseStatus.COMPLETED
        assert response.model == "gpt-4o"
        assert response.output_text == "Hello, world!"
        assert response.is_complete
        assert not response.is_failed
        assert response.usage is not None
        assert response.usage.total_tokens == 15

    def test_response_with_tool_calls(self):
        """Test parsing a response with tool calls."""
        data = {
            "id": "resp_456",
            "object": "response",
            "created_at": 1706140800,
            "status": "completed",
            "model": "gpt-4o",
            "output": [
                {
                    "type": "function_call",
                    "call_id": "call_abc",
                    "name": "get_weather",
                    "arguments": '{"location": "Tokyo"}',
                }
            ],
        }

        response = Response.model_validate(data)

        assert response.has_tool_calls
        assert len(response.tool_calls) == 1
        assert response.tool_calls[0].name == "get_weather"
        assert response.tool_calls[0].call_id == "call_abc"

    def test_response_with_cost(self):
        """Test parsing a response with cost information."""
        data = {
            "id": "resp_789",
            "object": "response",
            "created_at": 1706140800,
            "status": "completed",
            "model": "gpt-4o",
            "output": [],
            "usage": {
                "input_tokens": 100,
                "output_tokens": 50,
                "total_tokens": 150,
                "cost_usd": 0.0025,
            },
        }

        response = Response.model_validate(data)

        assert response.usage is not None
        assert response.usage.cost_usd == 0.0025

    def test_failed_response(self):
        """Test parsing a failed response."""
        data = {
            "id": "resp_err",
            "object": "response",
            "created_at": 1706140800,
            "status": "failed",
            "model": "gpt-4o",
            "output": [],
            "error": {
                "code": "rate_limit_exceeded",
                "message": "Too many requests",
            },
        }

        response = Response.model_validate(data)

        assert response.is_failed
        assert not response.is_complete
        assert response.error is not None
        assert response.error.code == "rate_limit_exceeded"


class TestMessageItem:
    """Tests for MessageItem model."""

    def test_text_property(self):
        """Test the text property concatenates content."""
        item = MessageItem(
            role=Role.ASSISTANT,
            content=[
                TextContent(text="Hello, "),
                TextContent(text="world!"),
            ],
        )

        assert item.text == "Hello, world!"

    def test_empty_content(self):
        """Test message with empty content."""
        item = MessageItem(
            role=Role.USER,
            content=[],
        )

        assert item.text == ""


class TestReasoningItem:
    """Tests for ReasoningItem model."""

    def test_reasoning_text(self):
        """Test reasoning item text extraction."""
        item = ReasoningItem(
            content=[
                TextContent(text="Let me think about this..."),
                TextContent(text=" The answer is 42."),
            ],
        )

        assert "Let me think" in item.text
        assert "42" in item.text


class TestTool:
    """Tests for Tool model."""

    def test_function_tool_creation(self):
        """Test creating a function tool."""
        tool = Tool.function_tool(
            name="get_weather",
            description="Get weather for a location",
            parameters={
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "City name",
                    }
                },
                "required": ["location"],
            },
        )

        assert tool.type == "function"
        assert tool.function.name == "get_weather"
        assert tool.function.description == "Get weather for a location"
        assert tool.function.parameters is not None

    def test_simple_tool(self):
        """Test creating a simple tool without parameters."""
        tool = Tool.function_tool(
            name="get_time",
            description="Get current time",
        )

        assert tool.function.name == "get_time"
        assert tool.function.parameters is None


class TestInputMessage:
    """Tests for input message helpers."""

    def test_user_message(self):
        """Test user_message helper."""
        msg = user_message("Hello")
        assert msg.role == Role.USER
        assert msg.content == "Hello"

    def test_assistant_message(self):
        """Test assistant_message helper."""
        msg = assistant_message("Hi there")
        assert msg.role == Role.ASSISTANT

    def test_system_message(self):
        """Test system_message helper."""
        msg = system_message("You are helpful")
        assert msg.role == Role.SYSTEM


class TestUsage:
    """Tests for Usage model."""

    def test_usage_with_details(self):
        """Test usage with token details."""
        usage = Usage(
            input_tokens=100,
            output_tokens=50,
            total_tokens=150,
            input_tokens_details={"cached": 20},
            output_tokens_details={"reasoning": 10},
            cost_usd=0.005,
        )

        assert usage.input_tokens == 100
        assert usage.output_tokens == 50
        assert usage.cost_usd == 0.005
        assert usage.input_tokens_details is not None
        assert usage.input_tokens_details["cached"] == 20


class TestValidationMetadata:
    """Tests for Response.validation parsing (gateway validation extension)."""

    def test_parse_best_of_n(self):
        """Test parsing best_of_n validation metadata."""
        data = {
            "id": "resp_v1",
            "object": "response",
            "created_at": 1706140800,
            "status": "completed",
            "model": "gpt-5.4-mini",
            "output": [
                {
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "text", "text": "9"}],
                }
            ],
            "validation": {
                "strategy": "best_of_n",
                "confidence": 0.92,
                "candidates_generated": 3,
                "selected_index": 1,
            },
        }
        response = Response.model_validate(data)
        assert response.validation is not None
        assert response.validation.strategy == ValidationStrategy.BEST_OF_N
        assert response.validation.strategy.value == "best_of_n"
        assert response.validation.confidence == 0.92
        assert response.validation.candidates_generated == 3
        assert response.validation.selected_index == 1
        assert response.validation.min_confidence is None

    def test_parse_self_consistency(self):
        """Test parsing self_consistency validation metadata."""
        data = {
            "id": "resp_v2",
            "object": "response",
            "created_at": 1706140800,
            "status": "completed",
            "model": "gpt-5.4-mini",
            "output": [],
            "validation": {
                "strategy": "self_consistency",
                "confidence": 0.85,
                "candidates_generated": 3,
                "min_confidence": 0.7,
            },
        }
        response = Response.model_validate(data)
        assert response.validation is not None
        assert response.validation.strategy == ValidationStrategy.SELF_CONSISTENCY
        assert response.validation.min_confidence == 0.7

    def test_response_without_validation(self):
        """Test that a response without validation parses with validation=None."""
        data = {
            "id": "resp_v3",
            "object": "response",
            "created_at": 1706140800,
            "status": "completed",
            "model": "gpt-5.4-mini",
            "output": [],
        }
        response = Response.model_validate(data)
        assert response.validation is None

    def test_feedback_signal_values(self):
        """Test FeedbackSignal serializes to the gateway's PascalCase values."""
        from aura.types import FeedbackSignal

        assert FeedbackSignal.THUMBS_UP.value == "ThumbsUp"
        assert FeedbackSignal.THUMBS_DOWN.value == "ThumbsDown"
