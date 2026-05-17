# Feedback API

Submit and manage feedback on LLM responses for adaptive few-shot learning.

## Overview

The Feedback API allows users to submit quality signals (thumbs up/down) on LLM responses. This feedback is stored and can be used to improve future responses through adaptive few-shot learning - automatically including high-quality examples in prompts.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/feedback` | Submit feedback on a response |
| GET | `/v1/feedback` | List feedback samples |
| GET | `/v1/feedback/stats` | Get feedback statistics |
| GET | `/v1/feedback/{id}` | Get a single feedback sample |
| DELETE | `/v1/feedback/{id}` | Delete a feedback sample |

## Submit Feedback

Submit a quality signal for a specific response.

```
POST /v1/feedback
```

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `response_id` | string | Yes | ID of the response to provide feedback on |
| `signal` | string | Yes | Feedback signal: `thumbs_up` or `thumbs_down` |
| `reason` | string | No | Optional reason for the feedback |
| `tags` | array | No | Tags for categorization (e.g., `["helpful", "accurate"]`) |
| `category` | string | No | Category for the feedback (e.g., `"coding"`, `"writing"`) |

### Example Request

```bash
curl -X POST http://localhost:8080/v1/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "response_id": "resp_oai_chatcmpl-abc123",
    "signal": "thumbs_up",
    "reason": "Clear and accurate explanation",
    "tags": ["helpful", "detailed"],
    "category": "coding"
  }'
```

### Example Response

```json
{
  "id": "fb_xyz789",
  "recorded": true,
  "message": "Feedback recorded successfully"
}
```

## List Feedback

Retrieve feedback samples with optional filtering.

```
GET /v1/feedback
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | string | Filter by category |
| `tags` | array | Filter by tags (any match) |
| `feedback` | string | Filter by feedback type (`approved` or `rejected`) |
| `search` | string | Full-text search query |
| `limit` | integer | Maximum results (default: 50) |
| `offset` | integer | Offset for pagination |

### Example Request

```bash
# Get approved samples in the "coding" category
curl "http://localhost:8080/v1/feedback?category=coding&feedback=approved&limit=10"

# Full-text search
curl "http://localhost:8080/v1/feedback?search=python+function"
```

### Example Response

```json
{
  "samples": [
    {
      "id": "fb_abc123",
      "input": "How do I read a file in Python?",
      "output": "You can use the built-in open() function...",
      "model_id": "gpt-5.4-mini",
      "feedback": "approved",
      "reason": "Clear explanation with example",
      "tags": ["helpful", "coding"],
      "category": "coding",
      "use_count": 5,
      "created_at": "2025-01-31T10:00:00Z"
    }
  ],
  "total": 1
}
```

## Get Feedback Stats

Get aggregate statistics about feedback samples.

```
GET /v1/feedback/stats
```

### Example Response

```json
{
  "total": 150,
  "approved": 120,
  "rejected": 30,
  "total_uses": 450
}
```

## Get Single Feedback

Retrieve a specific feedback sample by ID.

```
GET /v1/feedback/{id}
```

### Example Response

```json
{
  "id": "fb_abc123",
  "input": "How do I read a file in Python?",
  "output": "You can use the built-in open() function...",
  "model_id": "gpt-5.4-mini",
  "feedback": "approved",
  "reason": "Clear explanation with example",
  "tags": ["helpful", "coding"],
  "category": "coding",
  "use_count": 5,
  "created_at": "2025-01-31T10:00:00Z"
}
```

## Delete Feedback

Remove a feedback sample from the database.

```
DELETE /v1/feedback/{id}
```

Returns `204 No Content` on success.

## Adaptive Few-Shot Learning

Feedback samples are used to improve future responses through adaptive few-shot learning. When enabled, the gateway automatically:

1. **Retrieves relevant examples** - Uses full-text search or tag matching to find similar approved examples
2. **Augments prompts** - Injects high-quality examples into the system prompt
3. **Tracks usage** - Increments use count when examples are included

### Configuration

Enable adaptive few-shot in your response request:

```json
{
  "model": "gpt-5.4-mini",
  "input": [...],
  "consistency": {
    "strategy": "adaptive_few_shot",
    "adaptive_few_shot": {
      "max_examples": 3,
      "category": "coding",
      "approved_only": true
    }
  }
}
```

### Adaptive Few-Shot Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `max_examples` | integer | 3 | Maximum examples to include |
| `category` | string | null | Filter examples by category |
| `tags` | array | null | Filter examples by tags |
| `approved_only` | boolean | true | Only use approved samples |
| `use_selector_model` | boolean | false | Use a smaller model to select relevant examples |
| `selector_model` | string | null | Model to use for selection (e.g., `gpt-5.4-nano`) |

## Use Cases

### Quality Improvement
Collect user feedback to build a library of high-quality examples that improve response quality over time.

### Domain Adaptation
Use category and tag filters to create domain-specific example pools (e.g., coding, writing, analysis).

### A/B Testing
Track which examples lead to better outcomes by monitoring use counts and subsequent feedback.

### Compliance
Build an approved response library that ensures outputs meet organizational standards.
