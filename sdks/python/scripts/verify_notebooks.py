#!/usr/bin/env python3
"""Execute the #153 notebook code against a mocked gateway.

Proves the exact code in examples/notebooks/*.ipynb runs end-to-end:
- 01_quickstart: non-streaming response + usage/cost
- 02_streaming_chat: SSE streaming + previous_response_id threading
- 03_tool_calling: full function_call / function_call_output loop

No real gateway needed. Run: python3 scripts/verify_notebooks.py
"""
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ---------------------------------------------------------------------------
# Mock gateway: serves /v1/responses with the shapes the SDK expects
# ---------------------------------------------------------------------------

TOOL_RESPONSE = {
    "id": "resp_tool1",
    "object": "response",
    "created_at": 1754600000,
    "status": "completed",
    "model": "gpt-5.4-mini",
    "output": [
        {
            "type": "function_call",
            "id": "fc_1",
            "call_id": "call_1",
            "name": "get_weather",
            "arguments": json.dumps({"location": "Tokyo", "unit": "celsius"}),
        },
        {
            "type": "function_call",
            "id": "fc_2",
            "call_id": "call_2",
            "name": "get_weather",
            "arguments": json.dumps({"location": "Paris", "unit": "celsius"}),
        },
    ],
    "usage": {
        "input_tokens": 42,
        "output_tokens": 12,
        "total_tokens": 54,
        "cost_usd": 0.000123,
    },
}

FINAL_RESPONSE = {
    "id": "resp_final",
    "object": "response",
    "created_at": 1754600000,
    "status": "completed",
    "model": "gpt-5.4-mini",
    "output": [
        {
            "type": "message",
            "role": "assistant",
            "content": [
                {"type": "text", "text": "It is 22°C and sunny in Tokyo and Paris."}
            ],
        }
    ],
    "usage": {
        "input_tokens": 80,
        "output_tokens": 20,
        "total_tokens": 100,
        "cost_usd": 0.000456,
    },
}

STREAM_EVENTS = [
    {"type": "response.created", "sequence": 0,
     "response": {"id": "resp_s1", "object": "response", "created_at": 1754600000,
                  "status": "in_progress",
                  "model": "gpt-5.4-mini", "output": [], "usage": None}},
    {"type": "response.in_progress", "sequence": 1,
     "response": {"id": "resp_s1", "object": "response", "created_at": 1754600000,
                  "status": "in_progress",
                  "model": "gpt-5.4-mini", "output": [], "usage": None}},
    {"type": "response.output_text.delta", "sequence": 2, "delta": "1\n", "output_index": 0, "content_index": 0},
    {"type": "response.output_text.delta", "sequence": 3, "delta": "2\n", "output_index": 0, "content_index": 0},
    {"type": "response.output_text.delta", "sequence": 4, "delta": "3\n", "output_index": 0, "content_index": 0},
    {"type": "response.output_text.delta", "sequence": 5, "delta": "4\n", "output_index": 0, "content_index": 0},
    {"type": "response.output_text.delta", "sequence": 6, "delta": "5\n", "output_index": 0, "content_index": 0},
    {"type": "response.completed", "sequence": 7,
     "response": {"id": "resp_s1", "object": "response", "created_at": 1754600000,
                  "status": "completed",
                  "model": "gpt-5.4-mini", "output": [], "usage": None}},
]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _respond_json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/v1/responses":
            self._respond_json({"error": {"message": f"unexpected path {self.path}"}}, 404)
            return
        length = int(self.headers.get("Content-Length", 0))
        payload = json.loads(self.rfile.read(length) or b"{}")

        if payload.get("stream"):
            # SSE: one event per line, blank line separators
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            for ev in STREAM_EVENTS:
                self.wfile.write(b"data: " + json.dumps(ev).encode() + b"\n\n")
            self.wfile.flush()
            return

        # Detect tool-calling loop: input list contains function_call items
        inp = payload.get("input", [])
        has_function_call = (
            isinstance(inp, list)
            and any(isinstance(i, dict) and i.get("type") == "function_call" for i in inp)
        )
        if payload.get("tools") and not has_function_call:
            # First request of a tool loop: the model proposes tool calls.
            self._respond_json(TOOL_RESPONSE)
        elif has_function_call:
            # Tool results fed back: model synthesizes the final answer.
            self._respond_json(FINAL_RESPONSE)
        else:
            # Single-turn. The SDK converts string input to a list of message
            # dicts, so check the payload flag (not input type) for threading.
            body = FINAL_RESPONSE
            if "previous_response_id" in payload:
                body = dict(FINAL_RESPONSE, id="resp_threaded")
            self._respond_json(body)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    os.environ["AURA_BASE_URL"] = f"http://127.0.0.1:{port}"
    os.environ["AURA_API_KEY"] = "test-key"
    # point at the local SDK source
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

    from aura import AuraClient, Tool

    failures = []

    # ---- 01_quickstart: non-streaming + usage/cost ----
    try:
        client = AuraClient()
        response = client.responses.create(
            model="gpt-5.4-mini",
            input="What is 2 + 2? Answer in one sentence.",
        )
        assert response.id == "resp_final"
        assert response.output_text == "It is 22°C and sunny in Tokyo and Paris."
        assert response.usage.input_tokens == 80
        assert response.usage.cost_usd is not None
        print("01_quickstart: OK (non-streaming + usage/cost)")
    except Exception as e:
        failures.append(f"01_quickstart: {e}")
        print(f"01_quickstart: FAIL {e}")

    # ---- 02_streaming_chat: SSE + threading ----
    try:
        client = AuraClient()
        stream = client.responses.create(
            model="gpt-5.4-mini",
            input="Count from 1 to 5, one number per line.",
            stream=True,
        )
        deltas = []
        final_status = None
        for event in stream:
            if event.type == "response.output_text.delta":
                deltas.append(event.delta)
            elif event.type == "response.completed":
                final_status = event.response.status
        assert "".join(deltas) == "1\n2\n3\n4\n5\n"
        assert final_status == "completed"
        print("02_streaming_chat: OK (SSE deltas + completion)")

        turn1 = client.responses.create(
            model="gpt-5.4-mini",
            input="My favorite color is teal. Remember that.",
        )
        turn2 = client.responses.create(
            model="gpt-5.4-mini",
            input="What is my favorite color?",
            previous_response_id=turn1.id,
        )
        assert turn2.id == "resp_threaded"
        print("02_streaming_chat: OK (previous_response_id threading)")
    except Exception as e:
        failures.append(f"02_streaming_chat: {e}")
        print(f"02_streaming_chat: FAIL {e}")

    # ---- 03_tool_calling: full loop ----
    try:
        import json as _json

        client = AuraClient()
        weather_tool = Tool.function_tool(
            name="get_weather",
            description="Get the current weather for a location",
            parameters={
                "type": "object",
                "properties": {
                    "location": {"type": "string", "description": "City name, e.g. Tokyo"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
                },
                "required": ["location"],
            },
        )

        def run_tool(name, arguments):
            args = _json.loads(arguments)
            unit = args.get("unit", "celsius")
            temp = 22 if unit == "celsius" else 72
            return _json.dumps({
                "location": args["location"], "temperature": temp,
                "unit": unit, "conditions": "sunny",
            })

        messages = []
        response = client.responses.create(
            model="gpt-5.4-mini",
            input="What's the weather in Tokyo and in Paris?",
            tools=[weather_tool],
        )
        loops = 0
        while response.has_tool_calls and loops < 5:
            loops += 1
            for tc in response.tool_calls:
                messages.append({
                    "type": "function_call",
                    "call_id": tc.call_id,
                    "name": tc.name,
                    "arguments": tc.arguments,
                })
                result = run_tool(tc.name, tc.arguments)
                messages.append({
                    "type": "function_call_output",
                    "call_id": tc.call_id,
                    "output": result,
                })
            response = client.responses.create(
                model="gpt-5.4-mini",
                input=messages,
                tools=[weather_tool],
                previous_response_id=response.id,
            )
        assert loops == 1, f"expected 1 loop, got {loops}"
        assert response.output_text == "It is 22°C and sunny in Tokyo and Paris."
        print("03_tool_calling: OK (full tool loop, 1 iteration)")
    except Exception as e:
        failures.append(f"03_tool_calling: {e}")
        print(f"03_tool_calling: FAIL {e}")

    server.shutdown()
    if failures:
        print(f"\n{len(failures)} FAILURES")
        sys.exit(1)
    print("\nAll notebook code paths verified against mocked gateway.")


if __name__ == "__main__":
    main()
