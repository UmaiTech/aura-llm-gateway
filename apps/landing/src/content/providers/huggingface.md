---
title: "HuggingFace Provider"
description: "HuggingFace Text Generation Inference endpoints through Aura Gateway"
---

# HuggingFace Provider

Aura routes to [HuggingFace Inference Endpoints](https://huggingface.co/inference-endpoints) running [Text Generation Inference (TGI)](https://github.com/huggingface/text-generation-inference). TGI exposes an OpenAI-compatible API, so streaming and tool calling work the same as for OpenAI/Mistral.

## Scope

This provider supports **TGI endpoints only** — deployments you've spun up on Inference Endpoints, or self-hosted TGI on your own infrastructure. The classic per-model Inference API (`api-inference.huggingface.co`) is tracked in [#74](https://github.com/UmaiTech/aura-llm-gateway/issues/74) and not yet supported.

## Model

Each TGI deployment serves a single model — the one you selected when you created the endpoint. You configure the model name at provider construction; Aura forwards it to the endpoint on every request.

Popular models for TGI:

- **meta-llama/Llama-3.3-70B-Instruct**
- **meta-llama/Llama-3.1-70B-Instruct**
- **mistralai/Mixtral-8x22B-Instruct-v0.1**
- **Qwen/Qwen2.5-72B-Instruct**
- **deepseek-ai/DeepSeek-R1**
- **NousResearch/Hermes-3-Llama-3.1-70B**

Any model deployable on TGI will work.

## Capabilities

| Feature | Status |
|---|---|
| Text generation | ✅ |
| Tool / function calling | ⚠️ Model-dependent — Llama 3.x and Hermes support it; many fine-tunes don't |
| Streaming | ✅ |
| Vision | ⚠️ Requires a vision-capable TGI deployment (Llava, Pixtral) |
| JSON mode | ✅ via grammar constraints |

## Pricing

HuggingFace Inference Endpoints bills **per compute hour**, not per token — so Aura's cost calculation is a rough estimate based on placeholder per-token rates (input $0.50/M, output $1.50/M). For accurate cost attribution, use HuggingFace's billing dashboard.

Self-hosted TGI is free (you pay the GPU bill directly).

## Configuration

```bash
export HUGGINGFACE_API_KEY=hf_...
export HUGGINGFACE_ENDPOINT_URL=https://<your-endpoint>.endpoints.huggingface.cloud
export HUGGINGFACE_MODEL=meta-llama/Llama-3.3-70B-Instruct
```

Or in `.env`:

```env
HUGGINGFACE_API_KEY=hf_...
HUGGINGFACE_ENDPOINT_URL=https://<your-endpoint>.endpoints.huggingface.cloud
HUGGINGFACE_MODEL=meta-llama/Llama-3.3-70B-Instruct
```

Get a token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens). The endpoint URL comes from your Inference Endpoints dashboard after you deploy a model.

## Example Usage

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta-llama/Llama-3.3-70B-Instruct",
    "input": [
      {"type": "message", "role": "user", "content": "What is TGI?"}
    ],
    "stream": true
  }'
```

## Best Practices

1. **Pick the right autoscaling mode** — Inference Endpoints can scale to zero, which means cold starts. For latency-sensitive workloads, keep at least one replica warm.
2. **Use protected endpoints** for production. Public endpoints have no authentication beyond the HF token.
3. **Aura's cost figures are estimates** — reconcile against HF's billing dashboard at month-end.
4. **For self-hosted TGI**, point `HUGGINGFACE_ENDPOINT_URL` at your internal URL. The provider doesn't require the endpoint to be hosted by HuggingFace.
