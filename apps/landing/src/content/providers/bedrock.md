---
title: "AWS Bedrock Provider"
description: "Anthropic Claude on AWS Bedrock through Aura Gateway"
---

# AWS Bedrock Provider

Aura routes to [Amazon Bedrock](https://aws.amazon.com/bedrock/) for AWS-native LLM inference. Useful when you need data residency in a specific AWS region, when your org has Bedrock committed-use discounts, or when you need IAM-based auth instead of provider API keys.

## Scope

This provider currently supports the **Claude model family on Bedrock** — request shape matches Anthropic's Messages API, so most of the existing Anthropic integration is reused. Llama, Mistral, and Titan model families on Bedrock are tracked in [#73](https://github.com/UmaiTech/aura-llm-gateway/issues/73) and return `Unsupported` for now.

## Supported Models

### Claude on Bedrock
- **anthropic.claude-opus-4-5-20251001-v1:0** — Most capable Claude on Bedrock
- **anthropic.claude-sonnet-4-5-20250929-v1:0** — Balanced flagship
- **anthropic.claude-haiku-4-5-20251001-v1:0** — Fast, low-cost
- **anthropic.claude-3-7-sonnet-20250219-v1:0** — Previous-gen, still widely deployed

### Listed but Not Yet Implemented
- meta.llama3-3-70b-instruct-v1:0
- meta.llama3-2-90b-instruct-v1:0
- mistral.mistral-large-2407-v1:0
- amazon.titan-text-premier-v1:0

These appear in the model list for discovery but return `Unsupported` on invocation. See [#73](https://github.com/UmaiTech/aura-llm-gateway/issues/73).

## Capabilities (Claude on Bedrock)

| Feature | Status |
|---|---|
| Text generation | ✅ |
| Tool / function calling | ✅ (same shape as Anthropic native) |
| Streaming | ✅ (via `invoke_model_with_response_stream`) |
| Vision | ✅ |
| Prompt caching | ⚠️ Bedrock-specific availability — check per region |
| Context window | 200K |

## Pricing

*Per 1M tokens (USD), Bedrock list price as of 2026 — matches Anthropic direct pricing within rounding error.*

| Model | Input | Output |
|---|---|---|
| claude-opus-4-5 | $15.00 | $75.00 |
| claude-sonnet-4-5 | $3.00 | $15.00 |
| claude-haiku-4-5 | $0.80 | $4.00 |
| claude-3-7-sonnet | $3.00 | $15.00 |

Bedrock applies small regional and committed-use discounts; Aura's cost figures are list-price estimates. Reconcile against AWS Cost Explorer for production accounting.

## Configuration

Bedrock auth uses the **AWS credential chain** — Aura does not take an API key directly. Configure credentials through any of the standard methods:

### Environment variables (simplest for dev)

```bash
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1
```

### AWS profile

```bash
export AWS_PROFILE=my-bedrock-profile
export AWS_REGION=us-east-1
```

### IAM role (production)

When running on EC2/ECS/EKS, attach an IAM role with `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` permissions to the task/instance. No env vars needed.

### Aura config

Aura only needs the region explicitly:

```bash
export AWS_REGION=us-east-1
```

## Example Usage

```bash
curl -X POST https://api.aura-llm.dev/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic.claude-sonnet-4-5-20250929-v1:0",
    "input": [
      {"type": "message", "role": "user", "content": "Summarize the AWS shared responsibility model."}
    ]
  }'
```

### Tool Calling

Identical shape to Anthropic native — `tools`, `tool_choice`, and `tool_use`/`tool_result` items all work the same way.

## IAM Policy

Minimum policy for the principal Aura runs as:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-*"
      ]
    }
  ]
}
```

Narrow the `Resource` ARN to specific model IDs if your security posture requires it.

## Best Practices

1. **Enable model access** — Bedrock requires you to explicitly request access to each model family in the AWS console before invocations succeed. First-time setup error mode is a `AccessDeniedException`.
2. **Pick the closest region** — Bedrock latency varies by region. `us-east-1` and `us-west-2` typically have the broadest model availability.
3. **Use IAM roles in production**, not long-lived access keys.
4. **Monitor via CloudWatch** — Bedrock emits invocation metrics natively; Aura's metrics complement but don't replace them.
