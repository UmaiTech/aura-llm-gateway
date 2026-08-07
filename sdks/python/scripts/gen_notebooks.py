#!/usr/bin/env python3
"""Generate the three evaluator-onboarding notebooks for aura-llm-gateway (#153).

Quickstart + streaming chat + tool-calling loop — the trio the maintainer
scoped as covering ~80% of evaluator questions. Pure nbformat-4 JSON.
"""
import json
import os
import uuid

OUT = os.path.join(os.path.dirname(__file__), "..", "examples", "notebooks")

# Pin the SDK version so notebooks don't rot silently (issue #153 criterion).
SDK_VERSION = "0.16.1"


def md(source):
    return {"cell_type": "markdown", "metadata": {}, "id": f"md-{uuid.uuid4().hex[:12]}", "source": source}


def code(source, outputs=None):
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "id": f"code-{uuid.uuid4().hex[:12]}",
        "outputs": outputs or [],
        "source": source,
    }


def nb(cells):
    return {
        "cells": cells,
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3",
            },
            "language_info": {
                "name": "python",
                "version": "3.10",
            },
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


NOTEBOOKS = []

# ---------------------------------------------------------------------------
# 01 — Quickstart
# ---------------------------------------------------------------------------
NOTEBOOKS.append(
    (
        "01_quickstart.ipynb",
        nb(
            [
                md(
                    "# Aura LLM Gateway — Quickstart\n"
                    "\n"
                    "A 5-minute *hello world* against the [Open Responses API](https://www.openresponses.org/specification) "
                    "through the Aura gateway.\n"
                    "\n"
                    "## Prerequisites\n"
                    "\n"
                    "1. A running gateway (default `http://localhost:8080`).\n"
                    "2. An API key, either passed to `AuraClient(api_key=...)` or set as `AURA_API_KEY`.\n"
                    "3. The SDK: `pip install aura-llm==0.16.1` (or run from `sdks/python` with `pip install -e .`).\n"
                    "\n"
                    "> Aura proxies multiple providers behind one endpoint, so `model` can be any model your "
                    "gateway is configured for — e.g. `gpt-5.4-mini`, `claude-sonnet-4-6`, or a Together slug."
                ),
                code(
                    "# 1. Install (skip if already installed)\n"
                    "!pip install -q aura-llm==0.16.1\n"
                ),
                code(
                    "# 2. Client\n"
                    "from aura import AuraClient\n"
                    "\n"
                    "# Uses AURA_BASE_URL / AURA_API_KEY env vars when not passed.\n"
                    "client = AuraClient()\n"
                    "print(f\"gateway: {client.base_url}\")"
                ),
                code(
                    "# 3. First completion\n"
                    "response = client.responses.create(\n"
                    "    model=\"gpt-5.4-mini\",\n"
                    "    input=\"What is 2 + 2? Answer in one sentence.\",\n"
                    ")\n"
                    "\n"
                    "print(f\"id:     {response.id}\")\n"
                    "print(f\"model:  {response.model}\")\n"
                    "print(f\"status: {response.status}\")\n"
                    "print(f\"answer: {response.output_text}\")"
                ),
                code(
                    "# 4. See usage + cost attribution\n"
                    "if response.usage:\n"
                    "    u = response.usage\n"
                    "    print(f\"tokens: {u.input_tokens} in / {u.output_tokens} out\")\n"
                    "    if u.cost_usd is not None:\n"
                    "        print(f\"cost:   ${u.cost_usd:.6f}\")"
                ),
                md(
                    "That's it. Next: [02 — streaming chat & conversation threading](02_streaming_chat.ipynb), "
                    "or [03 — tool calling](03_tool_calling.ipynb)."
                ),
            ]
        ),
    )
)

# ---------------------------------------------------------------------------
# 02 — Streaming chat + conversation threading
# ---------------------------------------------------------------------------
NOTEBOOKS.append(
    (
        "02_streaming_chat.ipynb",
        nb(
            [
                md(
                    "# Streaming chat + conversation threading\n"
                    "\n"
                    "Two things every chat UI needs:\n"
                    "\n"
                    "1. **Streaming** — consume Server-Sent Events (SSE) token-by-token instead of waiting for the whole answer.\n"
                    "2. **Threading** — keep context across turns with `previous_response_id`.\n"
                    "\n"
                    "Aura implements the Open Responses API, so streaming is a sequence of typed events "
                    "(`response.output_text.delta`, `response.completed`, ...) rather than raw token deltas."
                ),
                code(
                    "from aura import AuraClient\n"
                    "client = AuraClient()"
                ),
                code(
                    "# 1. Stream a response and print text deltas as they arrive\n"
                    "stream = client.responses.create(\n"
                    "    model=\"gpt-5.4-mini\",\n"
                    "    input=\"Count from 1 to 5, one number per line.\",\n"
                    "    stream=True,\n"
                    ")\n"
                    "\n"
                    "for event in stream:\n"
                    "    if event.type == \"response.output_text.delta\":\n"
                    "        print(event.delta, end=\"\", flush=True)\n"
                    "    elif event.type == \"response.completed\":\n"
                    "        print(f\"\\n\\n[completed] status={event.response.status}\")"
                ),
                code(
                    "# 2. Conversation threading with previous_response_id\n"
                    "turn1 = client.responses.create(\n"
                    "    model=\"gpt-5.4-mini\",\n"
                    "    input=\"My favorite color is teal. Remember that.\",\n"
                    ")\n"
                    "print(f\"turn 1: {turn1.output_text}\")\n"
                    "\n"
                    "turn2 = client.responses.create(\n"
                    "    model=\"gpt-5.4-mini\",\n"
                    "    input=\"What is my favorite color?\",\n"
                    "    previous_response_id=turn1.id,\n"
                    ")\n"
                    "print(f\"turn 2: {turn2.output_text}\")"
                ),
                code(
                    "# 3. Streaming + threading together (stateful streamed chat)\n"
                    "history_id = None\n"
                    "for question in [\"What's 3 * 7?\", \"And what was the first question I asked?\"]:\n"
                    "    print(f\"\\n> {question}\")\n"
                    "    events = client.responses.create(\n"
                    "        model=\"gpt-5.4-mini\",\n"
                    "        input=question,\n"
                    "        previous_response_id=history_id,\n"
                    "        stream=True,\n"
                    "    )\n"
                    "    for event in events:\n"
                    "        if event.type == \"response.output_text.delta\":\n"
                    "            print(event.delta, end=\"\", flush=True)\n"
                    "        elif event.type == \"response.completed\":\n"
                    "            history_id = event.response.id\n"
                    "            print()"
                ),
            ]
        ),
    )
)

# ---------------------------------------------------------------------------
# 03 — Tool calling (full loop)
# ---------------------------------------------------------------------------
NOTEBOOKS.append(
    (
        "03_tool_calling.ipynb",
        nb(
            [
                md(
                    "# Tool calling — end-to-end loop\n"
                    "\n"
                    "A complete agentic loop with the Open Responses API:\n"
                    "\n"
                    "1. Define tools with JSON-schema parameters.\n"
                    "2. Ask something that requires a tool.\n"
                    "3. The model returns `function_call` items (not the final answer).\n"
                    "4. **You** execute the tool and feed the result back as a `function_call_output` item.\n"
                    "5. The model produces the final answer with the tool result in context.\n"
                    "\n"
                    "This is the pattern behind every agent: *model proposes → code executes → model synthesizes*."
                ),
                code(
                    "import json\n"
                    "from aura import AuraClient, Tool\n"
                    "\n"
                    "client = AuraClient()"
                ),
                code(
                    "# 1. Define a toy weather tool (JSON-schema parameters)\n"
                    "weather_tool = Tool.function_tool(\n"
                    "    name=\"get_weather\",\n"
                    "    description=\"Get the current weather for a location\",\n"
                    "    parameters={\n"
                    "        \"type\": \"object\",\n"
                    "        \"properties\": {\n"
                    "            \"location\": {\n"
                    "                \"type\": \"string\",\n"
                    "                \"description\": \"City name, e.g. Tokyo\",\n"
                    "            },\n"
                    "            \"unit\": {\n"
                    "                \"type\": \"string\",\n"
                    "                \"enum\": [\"celsius\", \"fahrenheit\"],\n"
                    "            },\n"
                    "        },\n"
                    "        \"required\": [\"location\"],\n"
                    "    },\n"
                    ")"
                ),
                code(
                    "# 2. Simulated tool executor (swap for a real API call)\n"
                    "def run_tool(name: str, arguments: str) -> str:\n"
                    "    args = json.loads(arguments)\n"
                    "    if name == \"get_weather\":\n"
                    "        unit = args.get(\"unit\", \"celsius\")\n"
                    "        temp = 22 if unit == \"celsius\" else 72\n"
                    "        return json.dumps({\n"
                    "            \"location\": args[\"location\"],\n"
                    "            \"temperature\": temp,\n"
                    "            \"unit\": unit,\n"
                    "            \"conditions\": \"sunny\",\n"
                    "        })\n"
                    "    return json.dumps({\"error\": f\"unknown tool {name}\"})"
                ),
                code(
                    "# 3. Ask something that needs the tool\n"
                    "response = client.responses.create(\n"
                    "    model=\"gpt-5.4-mini\",\n"
                    "    input=\"What's the weather in Tokyo? Reply with the temperature and conditions.\",\n"
                    "    tools=[weather_tool],\n"
                    ")\n"
                    "\n"
                    "print(f\"status: {response.status}\")\n"
                    "print(f\"tool calls: {len(response.tool_calls)}\")\n"
                    "for tc in response.tool_calls:\n"
                    "    print(f\"  -> {tc.name}({tc.arguments})\")"
                ),
                code(
                    "# 4. Execute + feed results back (the complete loop)\n"
                    "\n"
                    "# The Responses API expects function_call / function_call_output\n"
                    "# items as plain dicts on the wire (see the Open Responses spec).\n"
                    "messages = []\n"
                    "response = client.responses.create(\n"
                    "    model=\"gpt-5.4-mini\",\n"
                    "    input=\"What's the weather in Tokyo and in Paris?\",\n"
                    "    tools=[weather_tool],\n"
                    ")\n"
                    "\n"
                    "while response.has_tool_calls:\n"
                    "    # append the model's function_call items so the next turn sees them\n"
                    "    for tc in response.tool_calls:\n"
                    "        messages.append({\n"
                    "            \"type\": \"function_call\",\n"
                    "            \"call_id\": tc.call_id,\n"
                    "            \"name\": tc.name,\n"
                    "            \"arguments\": tc.arguments,\n"
                    "        })\n"
                    "        result = run_tool(tc.name, tc.arguments)\n"
                    "        print(f\"tool {tc.name} -> {result}\")\n"
                    "        messages.append({\n"
                    "            \"type\": \"function_call_output\",\n"
                    "            \"call_id\": tc.call_id,\n"
                    "            \"output\": result,\n"
                    "        })\n"
                    "\n"
                    "    response = client.responses.create(\n"
                    "        model=\"gpt-5.4-mini\",\n"
                    "        input=messages,\n"
                    "        tools=[weather_tool],\n"
                    "        previous_response_id=response.id,\n"
                    "    )\n"
                    "\n"
                    "print(f\"\\nfinal: {response.output_text}\")"
                ),
                md(
                    "The `while` loop keeps running as long as the model emits tool calls — that's how "
                    "multi-step agents chain several tool invocations in one conversation."
                ),
            ]
        ),
    )
)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, notebook in NOTEBOOKS:
        path = os.path.join(OUT, name)
        with open(path, "w") as f:
            json.dump(notebook, f, indent=1)
        # sanity: re-parse
        with open(path) as f:
            json.load(f)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
