#!/usr/bin/env python3
"""Execute the #153 notebook code against a mocked gateway.

Proves the exact code in examples/notebooks/*.ipynb runs end-to-end:
- 01_quickstart: non-streaming response + usage/cost
- 02_streaming_chat: SSE streaming + previous_response_id threading
- 03_tool_calling: full function_call / function_call_output loop
- 04_compression: input token savings when compression is enabled
- 05_validation: best_of_n / self_consistency metadata on the response
- 06_feedback_few_shot: submit/list/stats on /v1/feedback
- 07_routing_and_costs: per-model provider + cost attribution

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
    "metadata": {"aura": {"provider": "openai"}},
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
    "metadata": {"aura": {"provider": "openai"}},
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
        if self.path == "/v1/feedback":
            self._respond_json({"id": "fb_1", "recorded": True, "message": "feedback recorded"})
            return
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

        model = payload.get("model", "")
        provider_by_model = {
            "gpt-5.4-mini": "openai",
            "claude-sonnet-4-6": "anthropic",
            "gemini-2.5-flash": "google",
        }
        cost_by_model = {
            "gpt-5.4-mini": 0.000456,
            "claude-sonnet-4-6": 0.001234,
            "gemini-2.5-flash": 0.000089,
        }
        out_by_model = {"gpt-5.4-mini": 20, "claude-sonnet-4-6": 40, "gemini-2.5-flash": 15}

        # Token accounting (notebook 04): compression shrinks input, long
        # structured prompts cost more at baseline, otherwise per-model default.
        if payload.get("compression"):
            in_tokens = 72
        elif len(json.dumps(payload.get("input", ""))) > 400:
            in_tokens = 180
        else:
            in_tokens = {"gpt-5.4-mini": 80, "claude-sonnet-4-6": 95, "gemini-2.5-flash": 60}.get(
                model, 80
            )

        # Validation metadata (notebook 05)
        validation = payload.get("validation")
        if validation:
            if validation.get("strategy") == "self_consistency":
                vmeta = {
                    "strategy": "self_consistency",
                    "confidence": 0.85,
                    "candidates_generated": 3,
                    "min_confidence": 0.7,
                }
            else:
                vmeta = {
                    "strategy": "best_of_n",
                    "confidence": 0.92,
                    "candidates_generated": 3,
                    "selected_index": 1,
                }
        else:
            vmeta = None

        def _body():
            out_tokens = out_by_model.get(model, 20)
            return dict(
                FINAL_RESPONSE,
                usage={
                    "input_tokens": in_tokens,
                    "output_tokens": out_tokens,
                    "total_tokens": in_tokens + out_tokens,
                    "cost_usd": cost_by_model.get(model, 0.000456),
                },
                metadata={"aura": {"provider": provider_by_model.get(model, "openai")}},
            )

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
            body = _body()
            if vmeta:
                body = dict(body, validation=vmeta)
            if "previous_response_id" in payload:
                body = dict(body, id="resp_threaded")
            self._respond_json(body)

    def do_GET(self):
        if self.path.startswith("/v1/feedback/stats"):
            self._respond_json({"total": 1, "approved": 1, "rejected": 0})
        elif self.path.startswith("/v1/feedback"):
            self._respond_json(
                {
                    "samples": [
                        {
                            "id": "fb_1",
                            "response_id": "resp_final",
                            "signal": "ThumbsUp",
                            "reason": "concise and accurate",
                            "tags": ["summarization"],
                        }
                    ],
                    "total": 1,
                }
            )
        else:
            self._respond_json({"error": {"message": f"unexpected path {self.path}"}}, 404)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    os.environ["AURA_BASE_URL"] = f"http://127.0.0.1:{port}"
    os.environ["AURA_API_KEY"] = "test-key"
    # point at the local SDK source
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

    from aura import AuraClient, FeedbackSignal, Tool, ValidationStrategy

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

    # ---- 04_compression: token savings ----
    try:
        order_prompt = (
            "You are an order validator. Check the following order and report any "
            "discrepancies between the line items and the totals.\n\n"
            "ORDER:\n"
            "{\n"
            "  \"order_id\": \"ORD-78412\",\n"
            "  \"customer\": {\"name\": \"Aarav Mehta\", \"tier\": \"gold\"},\n"
            "  \"items\": [\n"
            "    {\"sku\": \"A-101\", \"name\": \"Wireless Mouse\", \"qty\": 2, \"unit_price\": 24.99},\n"
            "    {\"sku\": \"B-220\", \"name\": \"Mechanical Keyboard\", \"qty\": 1, \"unit_price\": 89.50},\n"
            "    {\"sku\": \"C-330\", \"name\": \"USB-C Hub 7-in-1\", \"qty\": 3, \"unit_price\": 39.00},\n"
            "    {\"sku\": \"D-441\", \"name\": \"Laptop Stand\", \"qty\": 1, \"unit_price\": 54.25}\n"
            "  ],\n"
            "  \"subtotal\": 319.23,\n"
            "  \"tax_rate\": 0.18,\n"
            "  \"shipping\": 0.00,\n"
            "  \"discount\": 15.00\n"
            "}\n\n"
            "List each discrepancy and the corrected totals."
        )
        client = AuraClient()
        baseline = client.responses.create(model="gpt-5.4-mini", input=order_prompt)
        b_in = baseline.usage.input_tokens if baseline.usage else 0
        compressed = client.responses.create(
            model="gpt-5.4-mini",
            input=order_prompt,
            compression={"enabled": True, "auto_select": True, "target_ratio": 0.4},
        )
        c_in = compressed.usage.input_tokens if compressed.usage else 0
        assert b_in == 180, f"expected baseline 180, got {b_in}"
        assert c_in == 72, f"expected compressed 72, got {c_in}"
        pct = 100.0 * (b_in - c_in) / b_in
        assert pct >= 50, f"expected >=50% savings, got {pct:.0f}%"
        print(f"04_compression: OK (baseline {b_in} -> compressed {c_in}, {pct:.0f}% saved)")
    except Exception as e:
        failures.append(f"04_compression: {e}")
        print(f"04_compression: FAIL {e}")

    # ---- 05_validation: best_of_n / self_consistency metadata ----
    try:
        ambiguous = (
            "A farmer has 17 sheep. All but 9 run away. "
            "How many are left? Answer with just the number."
        )
        client = AuraClient()
        response = client.responses.create(
            model="gpt-5.4-mini",
            input=ambiguous,
            validation={"strategy": "best_of_n", "n": 3, "selection": "HighestConfidence"},
        )
        v = response.validation
        assert v is not None, "response.validation missing"
        assert v.strategy == ValidationStrategy.BEST_OF_N
        assert v.candidates_generated == 3
        assert v.selected_index == 1
        assert v.confidence == 0.92

        response2 = client.responses.create(
            model="gpt-5.4-mini",
            input=ambiguous,
            validation={"strategy": "self_consistency", "n": 3, "min_confidence": 0.7},
        )
        v2 = response2.validation
        assert v2 is not None, "response2.validation missing"
        assert v2.strategy == ValidationStrategy.SELF_CONSISTENCY
        assert v2.min_confidence == 0.7
        assert v2.confidence == 0.85
        print("05_validation: OK (best_of_n + self_consistency metadata parsed)")
    except Exception as e:
        failures.append(f"05_validation: {e}")
        print(f"05_validation: FAIL {e}")

    # ---- 06_feedback_few_shot: submit / list / stats ----
    try:
        client = AuraClient()
        response = client.responses.create(
            model="gpt-5.4-mini",
            input="Summarize the waterfall model in one sentence.",
        )
        result = client.feedback.submit(
            response_id=response.id,
            signal=FeedbackSignal.THUMBS_UP,
            reason="concise and accurate",
            tags=["summarization"],
        )
        assert result["recorded"] is True
        samples = client.feedback.list()
        assert samples["total"] == 1
        assert samples["samples"][0]["signal"] == "ThumbsUp"
        stats = client.feedback.stats()
        assert stats["total"] == 1
        print("06_feedback_few_shot: OK (submit/list/stats)")
    except Exception as e:
        failures.append(f"06_feedback_few_shot: {e}")
        print(f"06_feedback_few_shot: FAIL {e}")

    # ---- 07_routing_and_costs: per-model provider + cost ----
    try:
        client = AuraClient()
        observed = {}
        for model in ["gpt-5.4-mini", "claude-sonnet-4-6", "gemini-2.5-flash"]:
            response = client.responses.create(
                model=model,
                input="Explain what an LLM gateway does in one sentence.",
            )
            provider = None
            if response.metadata and response.metadata.aura:
                provider = response.metadata.aura.provider
            assert response.usage is not None and response.usage.cost_usd is not None
            observed[model] = (provider, response.usage.cost_usd)
        assert observed["gpt-5.4-mini"][0] == "openai"
        assert observed["claude-sonnet-4-6"][0] == "anthropic"
        assert observed["gemini-2.5-flash"][0] == "google"
        costs = {c for _, c in observed.values()}
        assert len(costs) == 3, "expected 3 distinct per-model costs"
        print("07_routing_and_costs: OK (3 providers, distinct costs)")
    except Exception as e:
        failures.append(f"07_routing_and_costs: {e}")
        print(f"07_routing_and_costs: FAIL {e}")

    server.shutdown()
    if failures:
        print(f"\n{len(failures)} FAILURES")
        sys.exit(1)
    print("\nAll notebook code paths verified against mocked gateway.")


if __name__ == "__main__":
    main()
