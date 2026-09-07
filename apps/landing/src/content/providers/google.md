---
title: "Google Provider"
description: "Gemini models and capabilities through Aura Gateway"
---

# Google Provider

Aura provides full support for Google's Gemini models, offering industry-leading multimodal capabilities with massive context windows and competitive pricing. Catalog last refreshed 2026-09-07; ids match what Google's `models.list` endpoint serves (the bare `gemini-3-pro` / `gemini-3-flash` ids do not exist upstream).

## Supported Models

### Gemini 3.x Flash (Latest)
- **gemini-3.7-flash** - Google's most intelligent workhorse model for coding and agents (GA 2026-08-13)
- **gemini-3.6-flash** - Previous Flash generation (GA 2026-07-21)
- **gemini-3.5-flash** - Earlier Flash generation
- **gemini-3.5-flash-lite** - Lowest-cost 3.x option (GA 2026-07-21)
- **gemini-3.1-flash-lite**, **gemini-3.1-flash-lite-preview**

### Gemini 3.x Pro (preview)
- **gemini-3.1-pro-preview** - Current Pro tier (Gemini 3.5 Pro has not shipped yet)
- **gemini-3-pro-preview**, **gemini-3-flash-preview** - Original Gemini 3 previews

### Gemini 2.5 Series (GA)
- **gemini-2.5-pro**, **gemini-2.5-flash**, **gemini-2.5-flash-lite**

### Gemini 2.0 Series
- **gemini-2.0-flash**, **gemini-2.0-flash-lite** (and their `-001` pins)

### Floating aliases
- **gemini-pro-latest**, **gemini-flash-latest**, **gemini-flash-lite-latest** - always resolve to Google's current pick

Gemini 1.5 models have been retired by Google and are no longer routable.

## Model Capabilities

| Feature | 3.7 Flash | 3.6 Flash | 3.5 Flash-Lite | 3.1 Pro (preview) | 2.5 Pro | 2.0 Flash |
|---------|-----------|-----------|----------------|-------------------|---------|-----------|
| **Text Generation** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Tool/Function Calling** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Streaming** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Vision/Multimodal** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Audio Input** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Video Input** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **JSON Mode** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Context Window** | 1M | 1M | 1M | 1M | 1M | 1M |
| **Max Output** | 64K | 64K | 64K | 64K | 64K | 8K |

## Pricing

*Prices per 1M tokens (USD), as published 2026-09-07. Gemini 3.6 / 3.7 Flash are Google's introductory rate through 2026-12-31; the standard rate from 2027-01-01 is $1.50 / $7.50.*

| Model | Input | Output | Cached Input |
|-------|-------|--------|--------------|
| **gemini-3.7-flash** | $0.75 | $3.75 | $0.075 |
| **gemini-3.6-flash** | $0.75 | $3.75 | $0.075 |
| **gemini-3.5-flash** | $0.20 | $0.80 | $0.05 |
| **gemini-3.5-flash-lite** | $0.30 | $2.50 | $0.03 |
| **gemini-3.1-pro-preview** | $2.50 | $10.00 | $0.625 |
| **gemini-3-pro-preview** | $2.50 | $10.00 | $0.625 |
| **gemini-3-flash-preview** | $0.15 | $0.60 | $0.0375 |
| **gemini-2.5-pro** | $1.25 | $10.00 | $0.3125 |
| **gemini-2.5-flash** | $0.30 | $2.50 | $0.075 |
| **gemini-2.0-flash** | $0.10 | $0.40 | $0.025 |

## Configuration

Set your Google API key in the environment:

```bash
export GOOGLE_API_KEY=AIza...
```

Or in `.env`:

```env
GOOGLE_API_KEY=AIza...
```

## Example Usage

### Basic Completion

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.7-flash",
    "input": [
      {"type": "message", "role": "user", "content": "Hello Gemini!"}
    ]
  }'
```

### With System Instructions

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-pro-preview",
    "instructions": "You are a helpful assistant specializing in science.",
    "input": [
      {"type": "message", "role": "user", "content": "Explain photosynthesis"}
    ]
  }'
```

### Vision Input (Image Analysis)

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-pro-preview",
    "input": [
      {
        "type": "message",
        "role": "user",
        "content": [
          {"type": "text", "text": "What is in this image?"},
          {
            "type": "image_url",
            "image_url": {"url": "https://example.com/photo.jpg"}
          }
        ]
      }
    ]
  }'
```

### Audio Input

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-pro-preview",
    "input": [
      {
        "type": "message",
        "role": "user",
        "content": [
          {"type": "text", "text": "Transcribe and summarize this audio"},
          {
            "type": "audio_url",
            "audio_url": {"url": "https://example.com/audio.mp3"}
          }
        ]
      }
    ]
  }'
```

### Video Input

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-pro",
    "input": [
      {
        "type": "message",
        "role": "user",
        "content": [
          {"type": "text", "text": "Describe what happens in this video"},
          {
            "type": "video_url",
            "video_url": {"url": "https://example.com/video.mp4"}
          }
        ]
      }
    ]
  }'
```

### With Function Calling

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.7-flash",
    "input": [
      {"type": "message", "role": "user", "content": "What is the weather in Tokyo?"}
    ],
    "tools": [
      {
        "type": "function",
        "name": "get_weather",
        "description": "Get weather for a city",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {"type": "string"}
          },
          "required": ["city"]
        }
      }
    ]
  }'
```

## Special Features

### Context Caching

Gemini supports automatic context caching for repeated prefixes. Cached tokens are automatically tracked:

```json
{
  "usage": {
    "input_tokens": 100000,
    "cached_tokens": 95000,
    "output_tokens": 500,
    "cost_usd": 0.0625
  }
}
```

Cached input is billed at 75% lower rates.

### Massive Context Windows

Gemini models support up to 2 million tokens of context, enabling:
- Processing entire codebases
- Analyzing long documents
- Multi-hour conversation threads
- Large-scale data analysis

### Multimodal Capabilities

Gemini excels at multimodal tasks:
- **Images**: Charts, diagrams, photos, screenshots
- **Audio**: Speech, music, environmental sounds
- **Video**: Motion analysis, scene understanding
- **PDFs**: Document extraction and analysis

### JSON Mode

Force structured JSON output:

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.7-flash",
    "input": [
      {"type": "message", "role": "user", "content": "Extract all names from: Alice met Bob"}
    ],
    "response_format": {"type": "json_object"}
  }'
```

## Rate Limits

Google enforces rate limits based on API quota:

Default limits (may vary by project):
- **Free tier**: 60 RPM, 1M TPM
- **Pay-as-you-go**: 360 RPM, 10M TPM

Limits can be increased by contacting Google Cloud support.

## Error Handling

Google-specific errors are normalized to the Open Responses API format:

```json
{
  "error": {
    "code": "invalid_argument",
    "message": "Invalid model parameter",
    "param": "model"
  }
}
```

Common error codes:
- `invalid_argument` - Malformed request
- `unauthenticated` - Invalid or missing API key
- `permission_denied` - Insufficient quota
- `resource_exhausted` - Rate limit exceeded
- `unavailable` - Service temporarily down

## Best Practices

1. **Use Flash variants** for speed-critical applications
2. **Leverage context caching** for repeated long prompts
3. **Use multimodal inputs** - Gemini excels at image/video analysis
4. **Set max_output_tokens** to control costs
5. **Monitor cached_tokens** - Track caching effectiveness
6. **Batch multimodal requests** - Maximize cache utilization
7. **Use JSON mode** for structured outputs

## Unique Advantages

- **Largest context window** (2M tokens) of any major provider
- **Best multimodal capabilities** (image, audio, video)
- **Most cost-effective** for high-volume workloads
- **Strong at code understanding** (entire repositories fit in context)
- **Excellent multilingual support** (100+ languages)
