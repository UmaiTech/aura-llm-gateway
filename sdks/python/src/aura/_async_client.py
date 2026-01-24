"""
Aura SDK Async Client

Async client class for interacting with the Aura LLM Gateway.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from typing import Any, cast

import httpx

from aura.exceptions import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    NotFoundError,
    RateLimitError,
)
from aura.types import (
    ErrorEvent,
    FunctionCallDeltaEvent,
    FunctionCallDoneEvent,
    InputMessage,
    OutputItemAddedEvent,
    OutputItemDoneEvent,
    Response,
    ResponseCompletedEvent,
    ResponseCreatedEvent,
    ResponseFailedEvent,
    ResponseInProgressEvent,
    StreamEvent,
    TextDeltaEvent,
    TextDoneEvent,
    Tool,
)

DEFAULT_BASE_URL = "http://localhost:8080"
DEFAULT_TIMEOUT = 60.0


class AsyncResponses:
    """
    Async Responses API resource.

    Handles creating responses (completions) from the Aura gateway.
    """

    def __init__(self, client: AsyncAuraClient) -> None:
        self._client = client

    async def create(
        self,
        *,
        model: str,
        input: str | list[InputMessage] | list[dict[str, Any]],
        instructions: str | None = None,
        tools: list[Tool] | None = None,
        tool_choice: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        top_p: float | None = None,
        stream: bool = False,
        previous_response_id: str | None = None,
        **kwargs: Any,
    ) -> Response | AsyncIterator[StreamEvent]:
        """
        Create a response from the model.

        Args:
            model: The model to use (e.g., "gpt-4o", "claude-3-sonnet")
            input: The input to the model
            instructions: System instructions for the model
            tools: List of tools the model can use
            tool_choice: How the model should choose tools
            temperature: Sampling temperature (0.0 to 2.0)
            max_tokens: Maximum tokens to generate
            top_p: Top-p sampling parameter
            stream: Whether to stream the response
            previous_response_id: ID of a previous response for conversation threading
            **kwargs: Additional parameters to pass to the API

        Returns:
            If stream=False: A Response object
            If stream=True: An async iterator of StreamEvent objects

        Example:
            # Simple completion
            response = await client.responses.create(
                model="gpt-4o",
                input="What is 2+2?"
            )
            print(response.output_text)

            # Streaming
            async for event in await client.responses.create(
                model="gpt-4o",
                input="Tell me a story",
                stream=True
            ):
                if event.type == "response.output_text.delta":
                    print(event.delta, end="")
        """
        # Build the request payload
        payload = self._build_payload(
            model=model,
            input=input,
            instructions=instructions,
            tools=tools,
            tool_choice=tool_choice,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
            stream=stream,
            previous_response_id=previous_response_id,
            **kwargs,
        )

        if stream:
            return self._create_stream(payload)
        else:
            return await self._create_async(payload)

    def _build_payload(
        self,
        *,
        model: str,
        input: str | list[InputMessage] | list[dict[str, Any]],
        instructions: str | None = None,
        tools: list[Tool] | None = None,
        tool_choice: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        top_p: float | None = None,
        stream: bool = False,
        previous_response_id: str | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Build the request payload."""
        # Convert string input to message format
        if isinstance(input, str):
            input_items = [{"role": "user", "content": input}]
        elif isinstance(input, list):
            input_items = []
            for item in input:
                if isinstance(item, InputMessage):
                    input_items.append(item.model_dump())
                else:
                    input_items.append(item)
        else:
            input_items = input

        payload: dict[str, Any] = {
            "model": model,
            "input": input_items,
            "stream": stream,
        }

        if instructions is not None:
            payload["instructions"] = instructions
        if tools is not None:
            payload["tools"] = [t.model_dump() for t in tools]
        if tool_choice is not None:
            payload["tool_choice"] = tool_choice
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        if top_p is not None:
            payload["top_p"] = top_p
        if previous_response_id is not None:
            payload["previous_response_id"] = previous_response_id

        # Add any additional kwargs
        payload.update(kwargs)

        return payload

    async def _create_async(self, payload: dict[str, Any]) -> Response:
        """Create a non-streaming response."""
        response = await self._client._request("POST", "/v1/responses", json=payload)
        return Response.model_validate(response)

    async def _create_stream(self, payload: dict[str, Any]) -> AsyncIterator[StreamEvent]:
        """Create a streaming response."""
        async for event in self._client._stream("POST", "/v1/responses", json=payload):
            yield event


class AsyncAuraClient:
    """
    Async client for the Aura LLM Gateway.

    Example:
        async with AsyncAuraClient(api_key="your-key") as client:
            response = await client.responses.create(
                model="gpt-4o",
                input="Hello, world!"
            )
            print(response.output_text)
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
        headers: dict[str, str] | None = None,
    ) -> None:
        """
        Initialize the async Aura client.

        Args:
            api_key: API key for authentication. If not provided, uses AURA_API_KEY env var.
            base_url: Base URL for the Aura gateway.
            timeout: Request timeout in seconds.
            headers: Additional headers to include in requests.
        """
        self.api_key = api_key or os.environ.get("AURA_API_KEY")
        self.base_url = (base_url or os.environ.get("AURA_BASE_URL") or DEFAULT_BASE_URL).rstrip(
            "/"
        )
        self.timeout = timeout

        # Build default headers
        self._headers = {
            "Content-Type": "application/json",
            "User-Agent": "aura-python/0.1.0",
        }
        if self.api_key:
            self._headers["Authorization"] = f"Bearer {self.api_key}"
        if headers:
            self._headers.update(headers)

        # Initialize HTTP client
        self._http = httpx.AsyncClient(
            base_url=self.base_url,
            headers=self._headers,
            timeout=httpx.Timeout(timeout),
        )

        # Initialize resources
        self.responses = AsyncResponses(self)

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._http.aclose()

    async def __aenter__(self) -> AsyncAuraClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    async def _request(
        self,
        method: str,
        path: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Make an HTTP request and return the JSON response."""
        try:
            response = await self._http.request(method, path, **kwargs)
            return self._handle_response(response)
        except httpx.ConnectError as e:
            raise APIConnectionError(f"Failed to connect: {e}") from e
        except httpx.TimeoutException as e:
            raise APITimeoutError(f"Request timed out: {e}") from e

    def _handle_response(self, response: httpx.Response) -> dict[str, Any]:
        """Handle the HTTP response, raising appropriate errors."""
        if response.is_success:
            return cast(dict[str, Any], response.json())

        # Try to parse error response
        try:
            error_data = response.json()
            error = error_data.get("error", {})
            code = error.get("code", "unknown_error")
            message = error.get("message", response.text)
            param = error.get("param")
        except Exception:
            code = "unknown_error"
            message = response.text
            param = None

        # Raise appropriate exception based on status code
        status_code = response.status_code

        if status_code == 401:
            raise AuthenticationError(message)
        elif status_code == 400:
            raise BadRequestError(message, param=param)
        elif status_code == 404:
            raise NotFoundError(message)
        elif status_code == 429:
            retry_after = response.headers.get("Retry-After")
            raise RateLimitError(
                message,
                retry_after=int(retry_after) if retry_after else None,
            )
        else:
            raise APIError(
                message,
                code=code,
                param=param,
                status_code=status_code,
            )

    async def _stream(
        self,
        method: str,
        path: str,
        **kwargs: Any,
    ) -> AsyncIterator[StreamEvent]:
        """Make a streaming HTTP request and yield events."""
        try:
            async with self._http.stream(method, path, **kwargs) as response:
                if not response.is_success:
                    await response.aread()
                    self._handle_response(response)

                async for event in self._parse_sse_stream(response):
                    yield event

        except httpx.ConnectError as e:
            raise APIConnectionError(f"Failed to connect: {e}") from e
        except httpx.TimeoutException as e:
            raise APITimeoutError(f"Request timed out: {e}") from e

    async def _parse_sse_stream(self, response: httpx.Response) -> AsyncIterator[StreamEvent]:
        """Parse Server-Sent Events from the response stream."""
        buffer = ""

        async for chunk in response.aiter_text():
            buffer += chunk

            while "\n\n" in buffer:
                event_str, buffer = buffer.split("\n\n", 1)
                event = self._parse_sse_event(event_str)
                if event is not None:
                    yield event

    def _parse_sse_event(self, event_str: str) -> StreamEvent | None:
        """Parse a single SSE event."""
        event_type = None
        data_lines = []

        for line in event_str.split("\n"):
            if line.startswith("event:"):
                event_type = line[6:].strip()
            elif line.startswith("data:"):
                data_lines.append(line[5:].strip())
            elif line.startswith(":"):
                continue

        if not data_lines:
            return None

        data_str = "\n".join(data_lines)
        if data_str == "[DONE]":
            return None

        try:
            import json

            data = json.loads(data_str)
        except json.JSONDecodeError:
            return None

        return self._parse_event_data(event_type or data.get("type"), data)

    def _parse_event_data(self, event_type: str | None, data: dict[str, Any]) -> StreamEvent | None:
        """Parse event data into the appropriate StreamEvent type."""
        if not event_type:
            return None

        event_map = {
            "response.created": ResponseCreatedEvent,
            "response.in_progress": ResponseInProgressEvent,
            "response.completed": ResponseCompletedEvent,
            "response.failed": ResponseFailedEvent,
            "response.output_item.added": OutputItemAddedEvent,
            "response.output_item.done": OutputItemDoneEvent,
            "response.output_text.delta": TextDeltaEvent,
            "response.output_text.done": TextDoneEvent,
            "response.function_call.delta": FunctionCallDeltaEvent,
            "response.function_call.done": FunctionCallDoneEvent,
            "error": ErrorEvent,
        }

        event_class = event_map.get(event_type)
        if event_class:
            try:
                # All event classes are Pydantic models with model_validate
                return cast(
                    StreamEvent,
                    event_class.model_validate(data),  # type: ignore[attr-defined]
                )
            except Exception:
                return None

        return None
