# Aura Python SDK — Examples & Notebooks

Runnable code for onboarding against the [Open Responses API](https://www.openresponses.org/specification)
through the Aura gateway. Start with the notebooks; the scripts are the same
patterns in plain `.py` form for pasting into your own project.

## Notebooks

| Notebook | What you'll learn |
|---|---|
| [`01_quickstart.ipynb`](./notebooks/01_quickstart.ipynb) | 5-minute hello world: create a client, send a completion, read usage + cost attribution |
| [`02_streaming_chat.ipynb`](./notebooks/02_streaming_chat.ipynb) | Consume SSE token-by-token and keep context across turns with `previous_response_id` |
| [`03_tool_calling.ipynb`](./notebooks/03_tool_calling.ipynb) | The full agentic loop: model proposes → you execute → model synthesizes |
| [`04_compression.ipynb`](./notebooks/04_compression.ipynb) | Cut input tokens on structured prompts with `compression` (TOON/YAML/AISP/JSON) and read the savings |
| [`05_validation.ipynb`](./notebooks/05_validation.ipynb) | best-of-N and self-consistency on an ambiguous question; read `response.validation` metadata |
| [`06_feedback_few_shot.ipynb`](./notebooks/06_feedback_few_shot.ipynb) | Thumbs-up/down → adaptive few-shot via the feedback API (`client.feedback`) |
| [`07_routing_and_costs.ipynb`](./notebooks/07_routing_and_costs.ipynb) | Hit multiple providers through one endpoint; see `metadata.aura.provider` + per-request cost |

To run a notebook in Colab: open the file, hit the Colab badge / *Upload to
Colab*, and run cells top to bottom. Requires a running gateway
(`docker-compose up -d` + at least one provider key) reachable at
`http://localhost:8080`, or point `AURA_BASE_URL` / `AURA_API_KEY` at your
deployment.

> Notebooks are generated from [`../scripts/gen_notebooks.py`](../scripts/gen_notebooks.py).
> To regenerate after SDK changes: `python scripts/gen_notebooks.py`.

## Scripts

| Script | What it shows |
|---|---|
| [`basic_usage.py`](./basic_usage.py) | Simple completion, streaming, conversation threading, system instructions |
| [`async_usage.py`](./async_usage.py) | The async client (`AsyncAuraClient`) with `await` |
| [`tools_usage.py`](./tools_usage.py) | Tool calling API shape (single call) |
| [`langchain_usage.py`](./langchain_usage.py) | Wiring Aura into LangChain with an LCEL chain |
| [`openai_sdk_compat.py`](./openai_sdk_compat.py) | Drop-in `base_url` swap with the official OpenAI SDK |

## Setup

```bash
pip install aura-llm        # or: cd sdks/python && pip install -e .

# the SDK reads these when not passed explicitly
export AURA_BASE_URL=http://localhost:8080   # optional, default
export AURA_API_KEY=...                      # optional, if the gateway requires auth

python examples/basic_usage.py
```

Any model your gateway is configured for works — `gpt-5.4-mini`,
`claude-sonnet-4-6`, or a Together slug. See the gateway docs for provider setup.
