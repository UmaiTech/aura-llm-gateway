"""
Aura SDK Types

Pydantic models for the Open Responses API types.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

# ============================================================================
# Enums
# ============================================================================


class ResponseStatus(str, Enum):
    """Status of a response."""

    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    INCOMPLETE = "incomplete"
    CANCELLED = "cancelled"


class ItemType(str, Enum):
    """Type of an item in a response."""

    MESSAGE = "message"
    FUNCTION_CALL = "function_call"
    FUNCTION_CALL_OUTPUT = "function_call_output"
    REASONING = "reasoning"


class Role(str, Enum):
    """Role of a message."""

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


# ============================================================================
# Content Types
# ============================================================================


class TextContent(BaseModel):
    """Text content within a message."""

    type: Literal["text"] = "text"
    text: str


class ImageContent(BaseModel):
    """Image content within a message."""

    type: Literal["image"] = "image"
    url: str | None = None
    base64: str | None = None
    media_type: str | None = None


Content = TextContent | ImageContent


# ============================================================================
# Items
# ============================================================================


class MessageItem(BaseModel):
    """A message item in the conversation."""

    type: Literal["message"] = "message"
    id: str | None = None
    role: Role
    content: list[Content]
    status: str | None = None

    @property
    def text(self) -> str:
        """Get the text content of the message."""
        return "".join(c.text for c in self.content if isinstance(c, TextContent))


class FunctionCallItem(BaseModel):
    """A function call item."""

    type: Literal["function_call"] = "function_call"
    id: str | None = None
    call_id: str
    name: str
    arguments: str
    status: str | None = None


class FunctionCallOutputItem(BaseModel):
    """Output from a function call."""

    type: Literal["function_call_output"] = "function_call_output"
    id: str | None = None
    call_id: str
    output: str


class ReasoningItem(BaseModel):
    """A reasoning/thinking item."""

    type: Literal["reasoning"] = "reasoning"
    id: str | None = None
    content: list[TextContent]
    status: str | None = None

    @property
    def text(self) -> str:
        """Get the text content of the reasoning."""
        return "".join(c.text for c in self.content)


Item = MessageItem | FunctionCallItem | FunctionCallOutputItem | ReasoningItem


# ============================================================================
# Tools
# ============================================================================


class FunctionParameter(BaseModel):
    """A parameter for a function."""

    type: str
    description: str | None = None
    enum: list[str] | None = None


class FunctionParameters(BaseModel):
    """Parameters schema for a function."""

    type: Literal["object"] = "object"
    properties: dict[str, FunctionParameter] = Field(default_factory=dict)
    required: list[str] = Field(default_factory=list)


class FunctionDefinition(BaseModel):
    """Definition of a function tool."""

    name: str
    description: str | None = None
    parameters: FunctionParameters | None = None


class Tool(BaseModel):
    """A tool that can be used by the model."""

    type: Literal["function"] = "function"
    function: FunctionDefinition

    @classmethod
    def function_tool(
        cls,
        name: str,
        description: str | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> Tool:
        """Create a function tool."""
        params = None
        if parameters:
            props = {}
            required = []
            for param_name, param_def in parameters.get("properties", {}).items():
                props[param_name] = FunctionParameter(**param_def)
            required = parameters.get("required", [])
            params = FunctionParameters(properties=props, required=required)

        return cls(
            function=FunctionDefinition(
                name=name,
                description=description,
                parameters=params,
            )
        )


# ============================================================================
# Usage
# ============================================================================


class Usage(BaseModel):
    """Token usage information."""

    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    input_tokens_details: dict[str, int] | None = None
    output_tokens_details: dict[str, int] | None = None
    cost_usd: float | None = None


# ============================================================================
# Response
# ============================================================================


class ResponseError(BaseModel):
    """Error information in a response."""

    code: str
    message: str
    param: str | None = None


class AuraMetadata(BaseModel):
    """Aura gateway metadata."""

    request_id: str | None = None
    model: str | None = None
    provider: str | None = None
    gateway_version: str | None = None
    latency_ms: int | None = None
    agentic: dict[str, Any] | None = None


class ResponseMetadata(BaseModel):
    """Metadata attached to a response."""

    aura: AuraMetadata | None = None


class Response(BaseModel):
    """A response from the Aura API."""

    id: str
    object: Literal["response"] = "response"
    created_at: int
    status: ResponseStatus
    model: str
    output: list[Item] = Field(default_factory=list)
    usage: Usage | None = None
    error: ResponseError | None = None
    metadata: ResponseMetadata | None = None
    previous_response_id: str | None = None
    conversation_id: str | None = None

    @property
    def output_text(self) -> str:
        """Get the text content from the first message output item."""
        for item in self.output:
            if isinstance(item, MessageItem) and item.role == Role.ASSISTANT:
                return item.text
        return ""

    @property
    def tool_calls(self) -> list[FunctionCallItem]:
        """Get all function call items from the output."""
        return [item for item in self.output if isinstance(item, FunctionCallItem)]

    @property
    def has_tool_calls(self) -> bool:
        """Check if the response contains tool calls."""
        return len(self.tool_calls) > 0

    @property
    def is_complete(self) -> bool:
        """Check if the response is complete."""
        return self.status == ResponseStatus.COMPLETED

    @property
    def is_failed(self) -> bool:
        """Check if the response failed."""
        return self.status == ResponseStatus.FAILED


# ============================================================================
# Stream Events
# ============================================================================


class StreamEventBase(BaseModel):
    """Base class for stream events."""

    type: str
    sequence: int | None = None


class ResponseCreatedEvent(StreamEventBase):
    """Event when a response is created."""

    type: Literal["response.created"] = "response.created"
    response: Response


class ResponseInProgressEvent(StreamEventBase):
    """Event when a response is in progress."""

    type: Literal["response.in_progress"] = "response.in_progress"
    response: Response


class ResponseCompletedEvent(StreamEventBase):
    """Event when a response is completed."""

    type: Literal["response.completed"] = "response.completed"
    response: Response


class ResponseFailedEvent(StreamEventBase):
    """Event when a response fails."""

    type: Literal["response.failed"] = "response.failed"
    response: Response


class OutputItemAddedEvent(StreamEventBase):
    """Event when an output item is added."""

    type: Literal["response.output_item.added"] = "response.output_item.added"
    item: Item
    output_index: int


class OutputItemDoneEvent(StreamEventBase):
    """Event when an output item is complete."""

    type: Literal["response.output_item.done"] = "response.output_item.done"
    item: Item
    output_index: int


class TextDeltaEvent(StreamEventBase):
    """Event for text content delta."""

    type: Literal["response.output_text.delta"] = "response.output_text.delta"
    delta: str
    output_index: int
    content_index: int


class TextDoneEvent(StreamEventBase):
    """Event when text content is complete."""

    type: Literal["response.output_text.done"] = "response.output_text.done"
    text: str
    output_index: int
    content_index: int


class FunctionCallDeltaEvent(StreamEventBase):
    """Event for function call arguments delta."""

    type: Literal["response.function_call.delta"] = "response.function_call.delta"
    delta: str
    output_index: int
    call_id: str


class FunctionCallDoneEvent(StreamEventBase):
    """Event when function call is complete."""

    type: Literal["response.function_call.done"] = "response.function_call.done"
    item: FunctionCallItem
    output_index: int


class ErrorEvent(StreamEventBase):
    """Event for errors."""

    type: Literal["error"] = "error"
    error: ResponseError


StreamEvent = (
    ResponseCreatedEvent
    | ResponseInProgressEvent
    | ResponseCompletedEvent
    | ResponseFailedEvent
    | OutputItemAddedEvent
    | OutputItemDoneEvent
    | TextDeltaEvent
    | TextDoneEvent
    | FunctionCallDeltaEvent
    | FunctionCallDoneEvent
    | ErrorEvent
)


# ============================================================================
# Input Types (for creating requests)
# ============================================================================


class InputMessage(BaseModel):
    """A message to send as input."""

    role: Role
    content: str | list[Content]

    def model_dump(self, **kwargs: Any) -> dict[str, Any]:
        """Convert to dict, handling string content."""
        data = super().model_dump(**kwargs)
        if isinstance(self.content, str):
            data["content"] = self.content
        return data


def user_message(content: str) -> InputMessage:
    """Create a user message."""
    return InputMessage(role=Role.USER, content=content)


def assistant_message(content: str) -> InputMessage:
    """Create an assistant message."""
    return InputMessage(role=Role.ASSISTANT, content=content)


def system_message(content: str) -> InputMessage:
    """Create a system message."""
    return InputMessage(role=Role.SYSTEM, content=content)
