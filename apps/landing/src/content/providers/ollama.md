---
title: "Ollama Provider"
description: "Local LLM inference via Ollama through Aura Gateway"
---

# Ollama Provider

Aura routes to a local [Ollama](https://ollama.com) server for self-hosted inference. Useful for development, air-gapped deployments, and privacy-sensitive workloads where requests must never leave the network.

Cost tracking reports **$0.00** for every Ollama request — compute is on your hardware, not metered.

## Supported Models

Ollama runs whatever models you've pulled locally. Aura ships with a hardcoded shortlist of common ones for model→provider routing, but any model name the local server accepts will work:

- **llama3.3**, **llama3.2**, **llama3.1**
- **qwen2.5**
- **mistral**, **mixtral**
- **phi3**
- **gemma2**
- **codellama**
- **deepseek-r1**

Pull a model first:

```bash
ollama pull llama3.3
```

To use a model not in the shortlist, send the request anyway — Aura's Ollama provider is permissive and will forward any model name to the local server.

## Capabilities

| Feature | Status |
|---|---|
| Text generation | ✅ |
| Tool / function calling | ⚠️ Model-dependent — Llama 3.x and Qwen 2.5 work well; others vary |
| Streaming | ✅ |
| Vision | ⚠️ Limited to multimodal models (llava, etc.) |
| JSON mode | ✅ |

## Configuration

By default, Aura assumes Ollama is listening at `http://localhost:11434`. Override with:

```bash
export OLLAMA_BASE_URL=http://ollama.internal:11434
```

No API key is required — Ollama doesn't authenticate by default. If you've put it behind a reverse proxy with auth, configure that at the proxy layer.

## Example Usage

### Basic Completion

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.3",
    "input": [
      {"type": "message", "role": "user", "content": "Explain Rust ownership briefly."}
    ]
  }'
```

### Streaming

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5",
    "input": [
      {"type": "message", "role": "user", "content": "Tell me a story."}
    ],
    "stream": true
  }'
```

## Health Check

The Ollama provider's health check hits `GET /api/tags` on the configured base URL — useful for verifying connectivity before sending real requests. Surfaced via Aura's `/health` endpoint when the provider is registered.

## Best Practices

1. **Right-size the model** — running 70B params on a laptop is a bad idea. Match the model to your hardware (Llama 3.2 3B for laptops, Llama 3.3 70B for a workstation with a 4090+).
2. **Cold starts hurt** — Ollama loads the model on first request and keeps it warm. Issue a warmup request after `ollama pull` so the first user request isn't 30s long.
3. **Tool calling is best-effort** — for production tool-using agents, prefer hosted models (Claude, GPT, Mistral Large). Use Ollama for content generation, summarization, and embeddings where reliability beats determinism.
4. **Don't expose Ollama to the public internet** — there's no auth. Use Aura's API key layer to authenticate, and keep Ollama on a private network.
