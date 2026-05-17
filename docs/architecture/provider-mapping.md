# Provider Mapping Reference

This document describes how each LLM provider's native API maps to the Open Responses API types defined in `aura-types`.

## Overview

The Aura LLM Gateway translates between provider-specific formats and the Open Responses API. This mapping enables consistent behavior across providers while preserving provider-specific features.

## Type Mapping Summary

| Open Responses Type | OpenAI | Anthropic | Google (Gemini) | Mistral | Ollama | AWS Bedrock |
|---------------------|--------|-----------|-----------------|---------|--------|-------------|
| `Role::User` | `user` | `user` | `user` | `user` | `user` | `user` |
| `Role::Assistant` | `assistant` | `assistant` | `model` | `assistant` | `assistant` | `assistant` |
| `Role::System` | `system` | Top-level field | `system_instruction` | `system` | `system` | Model-specific |
| `Role::Tool` | `tool` | `tool_result` | `function_response` | `tool` | `tool` | `tool` |
| `Item::Message` | `message` | `text` block | `text` part | `message` | `message` | `text` |
| `Item::FunctionCall` | `tool_calls` | `tool_use` | `function_call` | `tool_calls` | `tool_calls` | `tool_use` |
| `Item::FunctionCallOutput` | `tool` msg | `tool_result` | `function_response` | `tool` msg | `tool` msg | `tool_result` |
| `Item::Reasoning` | N/A | `thinking` | N/A | N/A | N/A | N/A |

---

## OpenAI Mapping

### Request Transformation

```
CreateResponseRequest → OpenAI Chat Completion Request
─────────────────────────────────────────────────────

Open Responses                    OpenAI
──────────────                    ──────
model                          → model
input                          → messages (transformed)
instructions                   → system message (prepended)
max_output_tokens              → max_tokens
temperature                    → temperature
top_p                          → top_p
stream                         → stream
tools                          → tools (format preserved)
tool_choice                    → tool_choice
previous_response_id           → (context restored from storage)
```

### Input Item Transformation

```rust
// Open Responses InputItem → OpenAI Message
InputItem::Message { role, content }
    → { "role": role, "content": content }

// For system instructions
instructions: "Be helpful"
    → { "role": "system", "content": "Be helpful" }

// Function call output
InputItem::FunctionCallOutput { call_id, output }
    → { "role": "tool", "tool_call_id": call_id, "content": output }
```

### Response Transformation

```
OpenAI Chat Completion Response → Response
────────────────────────────────────────────

OpenAI                           Open Responses
──────                           ──────────────
id                            → id (prefixed with "resp_")
model                         → model
created                       → created_at
choices[0].message.content    → output[0] as Item::Message
choices[0].message.tool_calls → output[n] as Item::FunctionCall
choices[0].finish_reason      → status
  - "stop"                    → ResponseStatus::Completed
  - "length"                  → ResponseStatus::Incomplete (MaxTokens)
  - "tool_calls"              → ResponseStatus::Completed
  - "content_filter"          → ResponseStatus::Incomplete (ContentFilter)
usage.prompt_tokens           → usage.input_tokens
usage.completion_tokens       → usage.output_tokens
```

### Streaming Events Transformation

```
OpenAI SSE                       Open Responses SSE
──────────                       ──────────────────
(initial)                     → response.created
                              → response.in_progress
                              → response.output_item.added
delta.content                 → response.output_text.delta
delta.tool_calls[].function   → response.function_call_arguments.delta
choices[].finish_reason       → response.completed / response.incomplete
[DONE]                        → (end of stream)
```

---

## Anthropic (Claude) Mapping

### Request Transformation

```
CreateResponseRequest → Anthropic Messages Request
─────────────────────────────────────────────────

Open Responses                    Anthropic
──────────────                    ─────────
model                          → model
input                          → messages (transformed, system extracted)
instructions                   → system (top-level field)
max_output_tokens              → max_tokens (required)
temperature                    → temperature
top_p                          → top_p
stream                         → stream
tools                          → tools (format transformed)
tool_choice                    → tool_choice
```

### Message Format Differences

Claude uses a different structure for messages:

```rust
// Open Responses → Anthropic
InputItem::Message { role: User, content: "Hello" }
    → { "role": "user", "content": "Hello" }

// System message handling (Claude requires system at top level)
instructions: "Be helpful"
    → { "system": "Be helpful", "messages": [...] }

// Multi-part content
ContentPart::Text { text }
    → { "type": "text", "text": text }

ContentPart::Image { data, media_type }
    → { "type": "image", "source": { "type": "base64", "media_type": media_type, "data": data } }

// Tool use (Claude calls it tool_use)
InputItem::FunctionCallOutput { call_id, output }
    → { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": call_id, "content": output }] }
```

### Response Transformation

```
Anthropic Messages Response → Response
──────────────────────────────────────

Anthropic                        Open Responses
─────────                        ──────────────
id                            → id (prefixed with "resp_")
model                         → model
content[].type == "text"      → output[n] as Item::Message
content[].type == "tool_use"  → output[n] as Item::FunctionCall
content[].type == "thinking"  → output[n] as Item::Reasoning
stop_reason                   → status
  - "end_turn"                → ResponseStatus::Completed
  - "max_tokens"              → ResponseStatus::Incomplete (MaxTokens)
  - "tool_use"                → ResponseStatus::Completed
usage.input_tokens            → usage.input_tokens
usage.output_tokens           → usage.output_tokens
```

### Tool Definition Transformation

```rust
// Open Responses Tool → Anthropic Tool
Tool::Function { function: FunctionDefinition { name, description, parameters } }
    → { "name": name, "description": description, "input_schema": parameters }
```

### Streaming Events Transformation

```
Anthropic SSE                    Open Responses SSE
─────────────                    ──────────────────
message_start                 → response.created, response.in_progress
content_block_start           → response.output_item.added / content_part.added
content_block_delta (text)    → response.output_text.delta
content_block_delta (tool)    → response.function_call_arguments.delta
content_block_delta (think)   → response.reasoning.delta
content_block_stop            → response.output_text.done / content_part.done
message_stop                  → response.completed
error                         → response.failed
```

---

## Google (Gemini) Mapping

### Request Transformation

```
CreateResponseRequest → Gemini GenerateContent Request
──────────────────────────────────────────────────────

Open Responses                    Gemini
──────────────                    ──────
model                          → model (in URL path)
input                          → contents (transformed)
instructions                   → system_instruction
max_output_tokens              → generationConfig.maxOutputTokens
temperature                    → generationConfig.temperature
top_p                          → generationConfig.topP
stream                         → (different endpoint: streamGenerateContent)
tools                          → tools (format transformed)
tool_choice                    → toolConfig
```

### Role Mapping

Gemini uses `user` and `model` roles:

```rust
// Open Responses → Gemini
Role::User      → "user"
Role::Assistant → "model"
Role::System    → system_instruction (separate field)
Role::Tool      → "user" with functionResponse part
```

### Content Format

```rust
// Open Responses → Gemini
InputItem::Message { role: User, content: "Hello" }
    → { "role": "user", "parts": [{ "text": "Hello" }] }

// Multi-modal content
ContentPart::Image { data, media_type }
    → { "inlineData": { "mimeType": media_type, "data": data } }

// Function response
InputItem::FunctionCallOutput { call_id, output }
    → { "role": "user", "parts": [{ "functionResponse": { "name": call_id, "response": output } }] }
```

### Response Transformation

```
Gemini GenerateContent Response → Response
──────────────────────────────────────────

Gemini                           Open Responses
──────                           ──────────────
(generated ID)                → id
model                         → model
candidates[0].content.parts   → output (transformed)
  - text part                 → Item::Message
  - functionCall part         → Item::FunctionCall
candidates[0].finishReason    → status
  - "STOP"                    → ResponseStatus::Completed
  - "MAX_TOKENS"              → ResponseStatus::Incomplete (MaxTokens)
  - "SAFETY"                  → ResponseStatus::Incomplete (ContentFilter)
usageMetadata.promptTokenCount → usage.input_tokens
usageMetadata.candidatesTokenCount → usage.output_tokens
```

### Tool Definition Transformation

```rust
// Open Responses Tool → Gemini Tool
Tool::Function { function: FunctionDefinition { name, description, parameters } }
    → { "functionDeclarations": [{ "name": name, "description": description, "parameters": parameters }] }
```

### Streaming Events Transformation

```
Gemini SSE                       Open Responses SSE
──────────                       ──────────────────
(first chunk)                 → response.created, response.in_progress
candidates[0].content.parts   → response.output_item.added
text delta                    → response.output_text.delta
functionCall                  → response.function_call_arguments.delta
finishReason present          → response.completed / response.incomplete
```

---

## Mistral Mapping

### Request Transformation

```
CreateResponseRequest → Mistral Chat Completion Request
───────────────────────────────────────────────────────

Open Responses                    Mistral
──────────────                    ───────
model                          → model
input                          → messages (transformed)
instructions                   → system message (prepended)
max_output_tokens              → max_tokens
temperature                    → temperature
top_p                          → top_p
stream                         → stream
tools                          → tools (OpenAI-compatible format)
tool_choice                    → tool_choice
```

### Message Format

Mistral uses OpenAI-compatible message format:

```rust
// Open Responses → Mistral
InputItem::Message { role: User, content: "Hello" }
    → { "role": "user", "content": "Hello" }

// System message handling
instructions: "Be helpful"
    → { "role": "system", "content": "Be helpful" }

// Tool response
InputItem::FunctionCallOutput { call_id, output }
    → { "role": "tool", "tool_call_id": call_id, "content": output }
```

### Response Transformation

```
Mistral Chat Completion Response → Response
───────────────────────────────────────────

Mistral                          Open Responses
───────                          ──────────────
id                            → id (prefixed with "resp_mis_")
model                         → model
choices[0].message.content    → output[0] as Item::Message
choices[0].message.tool_calls → output[n] as Item::FunctionCall
choices[0].finish_reason      → status
  - "stop"                    → ResponseStatus::Completed
  - "length"                  → ResponseStatus::Incomplete (MaxTokens)
  - "tool_calls"              → ResponseStatus::Completed
usage.prompt_tokens           → usage.input_tokens
usage.completion_tokens       → usage.output_tokens
```

### Streaming Events

```
Mistral SSE                      Open Responses SSE
───────────                      ──────────────────
(initial)                     → response.created, response.in_progress
delta.content                 → response.output_text.delta
delta.tool_calls              → response.function_call_arguments.delta
finish_reason                 → response.completed
[DONE]                        → (end of stream)
```

---

## Ollama Mapping (Local Models)

### Request Transformation

```
CreateResponseRequest → Ollama Chat Request
───────────────────────────────────────────

Open Responses                    Ollama
──────────────                    ──────
model                          → model
input                          → messages (transformed)
instructions                   → system message (prepended)
max_output_tokens              → options.num_predict
temperature                    → options.temperature
top_p                          → options.top_p
stream                         → stream
tools                          → tools (OpenAI-compatible, Ollama 0.3+)
```

### Message Format

Ollama uses OpenAI-compatible message format:

```rust
// Open Responses → Ollama
InputItem::Message { role: User, content: "Hello" }
    → { "role": "user", "content": "Hello" }

// System message
instructions: "Be helpful"
    → { "role": "system", "content": "Be helpful" }

// Multi-modal (images)
ContentPart::Image { data, media_type }
    → { "role": "user", "images": [base64_data] }
```

### Response Transformation

```
Ollama Chat Response → Response
──────────────────────────────

Ollama                           Open Responses
──────                           ──────────────
(generated ID)                → id (prefixed with "resp_oll_")
model                         → model
message.content               → output[0] as Item::Message
message.tool_calls            → output[n] as Item::FunctionCall (Ollama 0.3+)
done_reason                   → status
  - "stop"                    → ResponseStatus::Completed
  - "length"                  → ResponseStatus::Incomplete (MaxTokens)
prompt_eval_count             → usage.input_tokens
eval_count                    → usage.output_tokens
```

### Streaming Events

```
Ollama SSE (NDJSON)              Open Responses SSE
───────────────────              ──────────────────
(first chunk)                 → response.created, response.in_progress
message.content               → response.output_text.delta
done: true                    → response.completed
```

### Model Discovery

Ollama provides model discovery via `/api/tags`:

```json
GET /api/tags
{
  "models": [
    { "name": "llama3.2:latest", "size": 2048000000 },
    { "name": "mistral:latest", "size": 4100000000 }
  ]
}
```

---

## AWS Bedrock Mapping

### Request Transformation

```
CreateResponseRequest → Bedrock InvokeModel Request
───────────────────────────────────────────────────

Open Responses                    Bedrock
──────────────                    ───────
model                          → modelId (in URL path)
input                          → body (model-specific format)
instructions                   → system (for Claude) or prepended message
max_output_tokens              → max_tokens / maxTokenCount
temperature                    → temperature
top_p                          → top_p / topP
stream                         → (use InvokeModelWithResponseStream)
```

### Authentication

AWS Bedrock uses AWS SigV4 authentication:

```rust
// Required credentials
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION (default: us-east-1)

// Optional
AWS_SESSION_TOKEN (for temporary credentials)
```

### Model-Specific Body Formats

#### Anthropic Claude on Bedrock

```json
{
  "anthropic_version": "bedrock-2023-05-31",
  "max_tokens": 1024,
  "system": "You are helpful",
  "messages": [
    { "role": "user", "content": "Hello" }
  ]
}
```

#### Meta Llama on Bedrock

```json
{
  "prompt": "<s>[INST] <<SYS>>\nYou are helpful\n<</SYS>>\n\nHello [/INST]",
  "max_gen_len": 1024,
  "temperature": 0.7
}
```

#### Amazon Titan on Bedrock

```json
{
  "inputText": "User: Hello\n\nBot:",
  "textGenerationConfig": {
    "maxTokenCount": 1024,
    "temperature": 0.7
  }
}
```

### Response Transformation

```
Bedrock InvokeModel Response → Response
──────────────────────────────────────

Bedrock (Claude)                 Open Responses
────────────────                 ──────────────
id                            → id (prefixed with "resp_bed_")
content[0].text               → output[0] as Item::Message
content[].tool_use            → output[n] as Item::FunctionCall
stop_reason                   → status
usage.input_tokens            → usage.input_tokens
usage.output_tokens           → usage.output_tokens
```

### Streaming Events

Bedrock uses binary event stream format:

```
Bedrock Event Stream             Open Responses SSE
────────────────────             ──────────────────
:message-type event           → response.created
content_block_delta           → response.output_text.delta
message_stop                  → response.completed
```

---

## HuggingFace Mapping

### Request Transformation

```
CreateResponseRequest → HuggingFace Inference Request
─────────────────────────────────────────────────────

Open Responses                    HuggingFace
──────────────                    ──────────
model                          → model (in URL path)
input                          → inputs (as formatted prompt)
instructions                   → Prepended to prompt
max_output_tokens              → parameters.max_new_tokens
temperature                    → parameters.temperature
top_p                          → parameters.top_p
stream                         → stream (for TGI endpoints)
```

### Inference API vs Inference Endpoints

**Inference API (Serverless):**
```
POST https://api-inference.huggingface.co/models/{model}
Authorization: Bearer {HF_TOKEN}
```

**Inference Endpoints (Dedicated):**
```
POST https://{endpoint_url}
Authorization: Bearer {HF_TOKEN}
```

### Text Generation Inference (TGI) Format

For TGI endpoints, use chat completion format:

```json
{
  "model": "meta-llama/Meta-Llama-3-70B-Instruct",
  "messages": [
    { "role": "system", "content": "You are helpful" },
    { "role": "user", "content": "Hello" }
  ],
  "max_tokens": 1024,
  "stream": true
}
```

### Response Transformation

```
HuggingFace Response → Response
──────────────────────────────

HuggingFace                      Open Responses
───────────                      ──────────────
(generated ID)                → id (prefixed with "resp_hf_")
generated_text                → output[0] as Item::Message
  (or choices[0].message)
details.tokens                → usage approximation
```

### Streaming Events (TGI)

```
TGI SSE                          Open Responses SSE
───────                          ──────────────────
(initial)                     → response.created
token.text                    → response.output_text.delta
finish_reason                 → response.completed
```

---

## Error Mapping

| Open Responses Error | OpenAI | Anthropic | Gemini | Mistral | Ollama | Bedrock |
|---------------------|--------|-----------|--------|---------|--------|---------|
| `invalid_request` | 400 | 400 invalid_request_error | 400 INVALID_ARGUMENT | 400 | 400 | ValidationException |
| `authentication` | 401 | 401 authentication_error | 401 UNAUTHENTICATED | 401 | N/A | AccessDeniedException |
| `rate_limit` | 429 | 429 rate_limit_error | 429 RESOURCE_EXHAUSTED | 429 | N/A | ThrottlingException |
| `server_error` | 500 | 500 api_error | 500 INTERNAL | 500 | 500 | InternalServerException |
| `provider_error` | 502/503 | 529 overloaded | 503 UNAVAILABLE | 503 | Connection refused | ServiceUnavailable |

---

## Feature Support Matrix

| Feature | OpenAI | Anthropic | Gemini | Mistral | Ollama | Bedrock | HuggingFace |
|---------|--------|-----------|--------|---------|--------|---------|-------------|
| Text Messages | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| System Prompt | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Image Input | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (Claude) | ✅ (some) |
| Audio Input | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Function Calling | ✅ | ✅ | ✅ | ✅ | ✅ (0.3+) | ✅ (Claude) | ❌ |
| Parallel Tool Calls | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ (Claude) | ❌ |
| Streaming | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (TGI) |
| Reasoning/Thinking | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| JSON Mode | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Structured Output | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Local/Self-Hosted | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Model Discovery | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |

---

## Implementation Notes

### 1. ID Prefixing
All provider IDs are prefixed to ensure uniqueness across providers:
- OpenAI: `resp_oai_<original_id>`
- Anthropic: `resp_ant_<original_id>`
- Gemini: `resp_gem_<generated_uuid>`
- Mistral: `resp_mis_<original_id>`
- Ollama: `resp_oll_<generated_uuid>`
- Bedrock: `resp_bed_<generated_uuid>`
- HuggingFace: `resp_hf_<generated_uuid>`

### 2. System Message Handling
- **OpenAI**: System message as first message in array
- **Anthropic**: Separate `system` field at request level
- **Gemini**: Separate `system_instruction` field

### 3. Tool/Function Naming
- **OpenAI**: Uses `tools` with `type: "function"`
- **Anthropic**: Uses `tools` with direct function definition
- **Gemini**: Uses `tools.functionDeclarations`

### 4. Streaming Buffering
- Provider stream events are buffered and transformed
- Text deltas are accumulated for `output_text.done` events
- Function arguments are validated as complete JSON before `done` events

### 5. Context Window Tracking
- Each provider has different context limits
- Gateway tracks token usage to warn before limits
- Automatic truncation strategies available per provider

---

## Adding a New Provider

To add support for a new provider:

1. Create adapter in `crates/aura-core/src/provider/<name>.rs`
2. Implement the `Provider` trait
3. Add request/response transformers following this mapping guide
4. Add streaming event transformers
5. Update feature support matrix in this document
6. Add provider to registry

See `docs/internal/implementation-plan.md` for the full PR workflow.
