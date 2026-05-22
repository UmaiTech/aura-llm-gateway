---
title: "Together AI Provider"
description: "Open-weight models on Together AI through Aura Gateway"
---

# Together AI Provider

Aura supports [Together AI](https://together.ai), which hosts a large catalogue of open-weight models including Meta Llama 3.x, DeepSeek V4, Qwen 3.x, OpenAI's gpt-oss family, Moonshot Kimi, ZAI GLM, and Google Gemma. Together exposes an OpenAI-compatible chat-completions API, so streaming and tool calling work transparently.

## Supported Models

The provider's `SUPPORTED_MODELS` list mirrors Together's curated serverless catalogue. A few highlights:

### Large open-weight models
- **meta-llama/Llama-3.3-70B-Instruct-Turbo** — Meta's 70B Llama 3.3 with serving-side acceleration
- **deepseek-ai/DeepSeek-V4-Pro** — DeepSeek's flagship reasoning model
- **Qwen/Qwen3.5-397B-A17B** — Alibaba's MoE model, 397B total / 17B active
- **moonshotai/Kimi-K2.6** — Moonshot's long-context model
- **zai-org/GLM-5.1** — Z.AI's GLM-5.1 with strong tool-calling

### Coder-tuned
- **Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8** — Largest open coding model on the catalogue
- **openai/gpt-oss-120b** / **openai/gpt-oss-20b** — OpenAI's open-weight series

### Lightweight & on-device
- **meta-llama/Meta-Llama-3-8B-Instruct-Lite** — 8B Llama for cheap high-volume work
- **google/gemma-3n-E4B-it** — Edge-optimized Gemma
- **LiquidAI/LFM2-24B-A2B** — Liquid's compact MoE

See the full list in `crates/aura-core/src/provider/together.rs` (`SUPPORTED_MODELS`). Together updates its serverless catalogue often; check [docs.together.ai/docs/serverless/models](https://docs.together.ai/docs/serverless/models) for the authoritative list.

## Model Capabilities

| Feature | Llama 3.3 70B | DeepSeek V4 | Qwen 3.5 | Kimi K2.6 | GLM-5.1 | gpt-oss-120b |
|---|---|---|---|---|---|---|
| Text generation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tool / function calling | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Streaming (SSE) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON mode | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vision | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Context window | 128K | 128K | 128K | 200K | 128K | 128K |

Tool support varies by underlying model. Together's docs flag which models advertise tool calling; Aura forwards the request regardless and surfaces any provider-side rejection.

## Pricing

Together publishes per-million-token pricing per model on [together.ai/pricing](https://www.together.ai/pricing). Aura's `crates/aura-core/src/cost.rs` carries an internal table that matches what Together returns on the `usage` field of each response.

`cost_usd` is computed by the gateway and attached to every response — no per-request lookup needed in your code.

## Configuration

Set the API key as an environment variable on the gateway:

```bash
export TOGETHER_API_KEY=tgp_v1_xxxxxxxxxxxxxxxxxxxx
```

Or in your `aura.yaml`:

```yaml
providers:
  together:
    enabled: true
    api_key_env: TOGETHER_API_KEY
```

Get a key at [api.together.ai/settings/api-keys](https://api.together.ai/settings/api-keys).

## Example Request

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Authorization: Bearer $AURA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    "input": [
      { "type": "message", "role": "user", "content": "What is dark matter?" }
    ],
    "stream": true
  }'
```

The model id passes through to Together verbatim — Aura does not rewrite or translate model names for this provider.

## Tool Calling

Together's chat-completions endpoint follows OpenAI's tool-calling schema. Parallel tool calls are batched correctly across roundtrips — see the [tool-roundtrip context replay](/docs/api/tool-roundtrips) page for how Aura reconstructs prior assistant context.

## Limitations

- No vision / image input on the current serverless catalogue.
- No audio.
- Some models (`-tput` suffix, the older Lite variants) have lower rate limits — check Together's per-model docs.
- Together rotates and deprecates model ids quickly. If you hit "model not found", run `GET https://api.aura-llm.dev/v1/models` to see what the gateway currently advertises.
