# Aura LLM Gateway Architecture

## System Overview

Aura is a high-performance LLM gateway built in Rust that provides a unified API for multiple LLM providers. It implements the [Open Responses API](https://openresponses.org) specification for agentic workflows.

```mermaid
flowchart TB
    subgraph Clients
        A[Chat UI]
        B[Agents]
        C[Applications]
    end

    subgraph Gateway["Aura Gateway"]
        D[Axum Router]
        E[Middleware Stack]
        F[Provider Registry]
        G[Cost Calculator]
        H[Request Logger]
    end

    subgraph Providers["LLM Providers"]
        I[OpenAI API]
        J[Anthropic API]
        K[Google Gemini API]
    end

    subgraph Storage["Storage (Optional)"]
        L[(PostgreSQL)]
    end

    A & B & C -->|Open Responses API| D
    D --> E
    E --> F
    F --> G
    F --> I & J & K
    G --> H
    H -->|Async| L
```

## Crate Architecture

```mermaid
flowchart TD
    subgraph Workspace["Aura Workspace"]
        A["aura-proxy<br/>(Binary)"]
        B["aura-core<br/>(Library)"]
        C["aura-types<br/>(Library)"]
        D["aura-db<br/>(Library)"]
    end

    A -->|depends on| B
    A -->|depends on| D
    B -->|depends on| C
    B -->|depends on| D
    D -->|depends on| C

    A -.- A1["Main server entry point<br/>Axum routes & handlers<br/>Middleware stack"]
    B -.- B1["Provider implementations<br/>Cost calculation<br/>HTTP client utilities"]
    C -.- C1["Open Responses API types<br/>Request/Response structures<br/>Stream events"]
    D -.- D1["SQLx/PostgreSQL<br/>Connection pooling<br/>Request logging"]
```

## Request Flow

### Non-Streaming Request

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Router as Axum Router
    participant Registry as Provider Registry
    participant Provider as LLM Provider
    participant Cost as Cost Calculator
    participant DB as Database

    Client->>Router: POST /v1/responses
    Router->>Registry: get_provider(model)
    Registry-->>Router: Arc<Provider>

    Router->>Provider: complete(request)
    Provider->>Provider: Transform to provider format
    Provider-->>Router: Response

    Router->>Cost: calculate_cost(model, tokens)
    Cost-->>Router: cost_usd

    Router->>Router: enrich_response()

    Router-)DB: log_request() [async]

    Router-->>Client: JSON Response<br/>+ cost + metadata
```

### Streaming Request

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Router as Axum Router
    participant Provider as LLM Provider
    participant LLM as LLM API

    Client->>Router: POST /v1/responses<br/>stream: true
    Router->>Provider: complete_stream(request)
    Provider->>LLM: SSE Connection

    LLM-->>Client: response.in_progress
    LLM-->>Client: response.output_item.added

    loop Text Generation
        LLM-->>Client: response.output_text.delta
    end

    LLM-->>Client: response.completed<br/>(enriched with cost + metadata)
```

## Component Details

### Authentication & Multi-Tenancy

Aura supports a hierarchical organization model with API key authentication:

```mermaid
flowchart TB
    subgraph Auth["Authentication Flow"]
        A[API Request]
        B[Extract Bearer Token]
        C[Validate API Key]
        D[Load AuthContext]
    end

    subgraph Hierarchy["Organization Hierarchy"]
        E[Organization]
        F[Teams]
        G[Projects]
        H[API Keys]
        I[End Users]
    end

    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
    G --> H
    E --> I
```

**Key Components:**

- **Organizations**: Top-level billing entities with owner and members
- **Teams**: Departments or product groups within an organization
- **Projects**: Specific initiatives under teams
- **API Keys**: Scoped to org, team, project, or user level
- **End Users**: Consumer/client users for cost allocation

### Credential Encryption

Provider credentials are stored using AES-256-GCM envelope encryption:

```mermaid
flowchart LR
    A[Provider API Key] --> B[DEK]
    B --> C[Encrypted Credential]
    D[Master Key] --> E[Wrapped DEK]
    C --> F[(Database)]
    E --> F
```

- **DEK (Data Encryption Key)**: Randomly generated for each credential
- **MEK (Master Encryption Key)**: Environment variable for key wrapping
- **Nonce**: Unique per encryption operation

### Provider System

```mermaid
classDiagram
    class Provider {
        <<trait>>
        +name() str
        +models() [str]
        +supports_model(model) bool
        +complete(request) Response
        +complete_stream(request) EventStream
    }

    class OpenAIProvider {
        -api_key: String
        -http_client: Client
        +new(api_key) Self
    }

    class AnthropicProvider {
        -api_key: String
        -http_client: Client
        +new(api_key) Self
    }

    class GoogleProvider {
        -api_key: String
        -http_client: Client
        +new(api_key) Self
    }

    Provider <|.. OpenAIProvider
    Provider <|.. AnthropicProvider
    Provider <|.. GoogleProvider
```

### Response Enrichment

Every response is enriched with Aura-specific metadata:

```json
{
  "id": "resp_abc123",
  "model": "gpt-4o",
  "status": "completed",
  "output": [...],
  "usage": {
    "input_tokens": 100,
    "output_tokens": 50,
    "cost_usd": 0.00075
  },
  "metadata": {
    "aura": {
      "request_id": "aura_550e8400-e29b-41d4-a716-446655440000",
      "model": "gpt-4o",
      "provider": "openai",
      "gateway_version": "0.1.7",
      "latency_ms": 523,
      "agentic": {
        "output_items_count": 2,
        "has_tool_calls": true,
        "tool_calls_count": 1,
        "tools_used": ["web_search"],
        "requires_action": false
      }
    }
  }
}
```

### Database Schema

```mermaid
erDiagram
    providers ||--o{ model_pricing : has
    providers {
        uuid id PK
        string name UK
        string display_name
        string api_base_url
        boolean is_enabled
        timestamp created_at
        timestamp updated_at
    }

    model_pricing {
        uuid id PK
        uuid provider_id FK
        string model_id
        string model_name
        decimal input_per_million
        decimal output_per_million
        decimal cached_input_per_million
        decimal reasoning_per_million
        int context_window
        int max_output_tokens
        boolean is_enabled
        timestamp effective_from
        timestamp effective_until
    }

    organizations ||--o{ teams : contains
    organizations ||--o{ api_keys : issues
    organizations ||--o{ provider_credentials : stores
    organizations ||--o{ end_users : tracks
    organizations {
        uuid id PK
        string name
        string slug UK
        string owner_id
        jsonb settings
        timestamp created_at
    }

    teams ||--o{ projects : contains
    teams ||--o{ api_keys : issues
    teams {
        uuid id PK
        uuid organization_id FK
        string name
        string slug
        bigint monthly_token_limit
        bigint current_month_tokens
    }

    projects ||--o{ api_keys : issues
    projects {
        uuid id PK
        uuid team_id FK
        string name
        string slug
        string status
        bigint monthly_token_limit
    }

    api_keys ||--o{ api_key_usage : logs
    api_keys {
        uuid id PK
        string key_id UK
        string key_hash
        string name
        string scope_type
        uuid scope_id
        jsonb scopes
        int rate_limit_rpm
        bigint monthly_token_limit
        string status
    }

    api_key_usage {
        uuid id PK
        uuid api_key_id FK
        uuid end_user_id FK
        string request_id
        string model_id
        int input_tokens
        int output_tokens
        decimal cost_usd
    }

    end_users {
        uuid id PK
        uuid organization_id FK
        string external_id
        string name
        bigint total_input_tokens
        bigint total_output_tokens
        decimal total_cost_usd
        boolean is_blocked
    }

    provider_credentials {
        uuid id PK
        uuid organization_id FK
        string provider_name
        bytea encrypted_api_key
        bytea wrapped_dek
        boolean is_active
    }

    conversations ||--o{ messages : contains
    conversations ||--o{ request_logs : generates
    conversations {
        uuid id PK
        string user_id
        string title
        string model_id
        jsonb metadata
    }

    messages {
        uuid id PK
        uuid conversation_id FK
        string role
        text content
    }

    request_logs {
        uuid id PK
        string response_id UK
        uuid conversation_id FK
        string provider_name
        string model_id
        int input_tokens
        int output_tokens
        decimal cost_usd
        int latency_ms
        string status
    }
```

## Data Flow Summary

```mermaid
flowchart TD
    A[Client Request] --> B[1. Route Matching]
    B --> C[2. Provider Resolution]
    C --> D[3. Request Transformation]
    D --> E[4. Provider API Call]
    E --> F[5. Response Transformation]
    F --> G[6. Response Enrichment]
    G --> H[7. Request Logging]
    H --> I[Client Response]

    B -.- B1["Axum extracts request body"]
    C -.- C1["model → provider mapping<br/>gpt-4o → OpenAIProvider"]
    D -.- D1["Open Responses → Provider format<br/>Add auth headers, format messages"]
    E -.- E1["HTTP request to OpenAI/Anthropic/etc"]
    F -.- F1["Provider format → Open Responses"]
    G -.- G1["Add: cost_usd, request_id, provider<br/>Add: latency_ms, agentic metadata"]
    H -.- H1["Background task → PostgreSQL"]
```

## State Management

```mermaid
flowchart LR
    subgraph AppState
        A[Config]
        B[Providers Map]
        C[Model Map]
        D[Cost Calculator]
        E[DB Pool]
        F[Master Key]
    end

    A --> |Arc| A1[Server config<br/>Provider keys]
    B --> |Arc HashMap| B1[provider_name → Provider]
    C --> |Arc HashMap| C1[model_id → provider_name]
    D --> |Arc| D1[Pricing data]
    E --> |Option| E1[PostgreSQL Pool]
    F --> |Option| F1[AES-256 Master Key<br/>for credential decryption]
```

## End-User Tracking

The gateway tracks end-user costs via the `user` field in API requests:

```mermaid
sequenceDiagram
    participant App
    participant Gateway
    participant DB

    App->>Gateway: POST /v1/responses<br/>user: "customer_123"
    Gateway->>DB: Upsert end_user
    DB-->>Gateway: end_user_id
    Gateway->>Gateway: Process request
    Gateway->>DB: Record usage + end_user_id
    Gateway-->>App: Response + cost
```

This enables:
- Per-customer billing and cost allocation
- Per-user rate limiting
- Usage reporting by customer
- Blocking abusive users

## Configuration

```yaml
# aura.yaml
server:
  host: "0.0.0.0"
  port: 8080

providers:
  openai:
    api_key: ${OPENAI_API_KEY}
  anthropic:
    api_key: ${ANTHROPIC_API_KEY}
  google:
    api_key: ${GOOGLE_API_KEY}

database:
  url: ${DATABASE_URL}  # Optional
  max_connections: 10
```

## Future Architecture (Planned)

```mermaid
flowchart TB
    subgraph Current["Current Features"]
        A[Multi-Provider Support]
        B[Cost Tracking]
        C[Request Logging]
        D[Streaming SSE]
        E[API Key Auth]
        F[Organization Model]
        G[End-User Tracking]
        H[Credential Encryption]
    end

    subgraph Planned["Planned Features"]
        I[Rate Limiter<br/>Redis]
        J[Response Cache<br/>Redis]
        K[Load Balancer<br/>Multi-node]
        L[Pricing Scraper<br/>Cron Job]
        M[Webhooks<br/>Callbacks]
        N[Admin Dashboard<br/>React UI]
    end

    Current --> Planned
```

## Error Handling Flow

```mermaid
flowchart TD
    A[Request] --> B{Provider Available?}
    B -->|No| C[404 Model Not Found]
    B -->|Yes| D{API Call Success?}
    D -->|No| E{Error Type?}
    E -->|Auth| F[401 Unauthorized]
    E -->|Rate Limit| G[429 Too Many Requests]
    E -->|Invalid| H[400 Bad Request]
    E -->|Server| I[500 Internal Error]
    D -->|Yes| J{Stream?}
    J -->|Yes| K[SSE Events]
    J -->|No| L[JSON Response]

    F & G & H & I --> M[Log Error]
    K & L --> N[Log Success]
```
