# Aura Admin App - Implementation Plan

A unified admin dashboard for managing the Aura LLM Gateway, including an integrated chat playground.

## Overview

The admin app consolidates all management and testing functionality into a single React application:

- **Dashboard** - Usage overview, costs, health status
- **Playground** - Chat interface for testing the gateway (evolved from `apps/chat/`)
- **API Keys** - Create, manage, and revoke API keys
- **Dev Logs** - Raw request/response data with full payload inspection
- **Insights & Analytics** - Agent behavior analytics, token/cost charts, tool usage patterns
- **Agentic Harness** - Fine-tune agent behavior, test prompts, debug agent loops
- **Providers** - Configure and monitor LLM providers
- **Settings** - System configuration

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS + shadcn/ui components
- **Routing**: React Router v6
- **State Management**: Zustand (lightweight, TypeScript-friendly)
- **Data Fetching**: TanStack Query (React Query)
- **Charts**: Recharts (simple), visx/D3 (advanced analytics)
- **Icons**: Lucide React
- **Tables**: TanStack Table (virtualized, sortable, filterable)

## Architecture

```
apps/admin/
├── public/
│   └── aura-icon.svg
├── src/
│   ├── main.tsx                 # Entry point
│   ├── App.tsx                  # Root component with router
│   ├── api/                     # API client layer
│   │   ├── client.ts            # Axios/fetch wrapper
│   │   ├── endpoints/
│   │   │   ├── auth.ts
│   │   │   ├── keys.ts
│   │   │   ├── logs.ts
│   │   │   ├── providers.ts
│   │   │   ├── responses.ts     # Chat/playground API
│   │   │   └── usage.ts
│   │   └── types.ts
│   ├── components/
│   │   ├── ui/                  # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── table.tsx
│   │   │   └── ...
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx    # Main layout with sidebar
│   │   │   ├── Sidebar.tsx      # Navigation sidebar
│   │   │   ├── Header.tsx       # Top header with user menu
│   │   │   └── PageHeader.tsx   # Page title + actions
│   │   ├── chat/                # Playground components (from apps/chat)
│   │   │   ├── ChatContainer.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ConversationList.tsx
│   │   │   ├── ModelSelector.tsx
│   │   │   └── AgentConfig.tsx  # Agent/tool configuration
│   │   ├── dashboard/
│   │   │   ├── UsageChart.tsx
│   │   │   ├── CostBreakdown.tsx
│   │   │   ├── ProviderHealth.tsx
│   │   │   └── RecentRequests.tsx
│   │   ├── keys/
│   │   │   ├── KeysTable.tsx
│   │   │   ├── CreateKeyDialog.tsx
│   │   │   └── KeyUsageCard.tsx
│   │   ├── logs/
│   │   │   ├── LogsTable.tsx
│   │   │   ├── LogFilters.tsx
│   │   │   └── LogDetail.tsx
│   │   ├── dev-logs/
│   │   │   ├── RawLogsTable.tsx    # Virtualized table for large datasets
│   │   │   ├── PayloadViewer.tsx   # JSON viewer with syntax highlighting
│   │   │   ├── LogDiff.tsx         # Compare request/response
│   │   │   └── ExportPanel.tsx
│   │   ├── insights/
│   │   │   ├── OverviewMetrics.tsx
│   │   │   ├── TokenChart.tsx      # D3-based token usage over time
│   │   │   ├── CostChart.tsx       # Cost breakdown with drill-down
│   │   │   ├── ToolUsageChart.tsx  # Which tools agents call most
│   │   │   ├── ModelComparison.tsx # Compare model performance
│   │   │   ├── AgentBehavior.tsx   # Agent loop patterns
│   │   │   └── Heatmap.tsx         # Usage heatmap by hour/day
│   │   └── harness/
│   │       ├── AgentTraceViewer.tsx    # Visualize agent execution tree
│   │       ├── PromptLibrary.tsx       # System prompt templates
│   │       ├── ToolRegistry.tsx        # Custom tool definitions
│   │       ├── ReplayDebugger.tsx      # Replay and debug agent sessions
│   │       ├── GuardrailsConfig.tsx    # Set agent limits
│   │       ├── TestRunner.tsx          # Run agent test suites
│   │       └── ContextAnalyzer.tsx     # Context window visualization
│   ├── hooks/
│   │   ├── useAuth.ts           # Authentication state
│   │   ├── useChat.ts           # Chat/playground state
│   │   ├── useConversations.ts  # Conversation management
│   │   └── useLocalStorage.ts   # localStorage helper
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── PlaygroundPage.tsx   # Chat interface
│   │   ├── KeysPage.tsx
│   │   ├── LogsPage.tsx
│   │   ├── DevLogsPage.tsx      # Raw request/response logs
│   │   ├── InsightsPage.tsx     # Analytics & insights
│   │   ├── HarnessPage.tsx      # Agentic harness tuning
│   │   ├── ProvidersPage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── LoginPage.tsx
│   ├── stores/
│   │   ├── authStore.ts
│   │   ├── chatStore.ts         # Chat state with persistence
│   │   └── settingsStore.ts
│   ├── lib/
│   │   ├── utils.ts
│   │   ├── constants.ts
│   │   └── storage.ts           # localStorage utilities
│   └── styles/
│       └── globals.css
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## Pages & Features

### 1. Dashboard (`/`)

Overview of gateway health and usage.

**Components:**
- Usage chart (requests over time)
- Cost breakdown by provider/model
- Provider health status cards
- Recent requests feed
- Quick stats: total requests, total cost, active keys

**API Endpoints:**
```
GET /admin/stats/overview
GET /admin/stats/usage?period=7d
GET /admin/stats/costs?period=7d
GET /admin/providers/health
```

### 2. Playground (`/playground`)

Interactive chat interface for testing the gateway with agent capabilities.

**Features:**
- Multi-conversation support with sidebar
- Model selection dropdown
- System prompt configuration
- Agent mode with tool configuration
- Streaming responses with typing indicator
- Message history with localStorage persistence
- Export conversation as JSON/Markdown
- Token count display
- Response timing/latency

**Agent Tools (Built-in):**
- `get_current_time` - Returns current date/time
- `calculate` - Basic math calculations
- `web_search` - Search the web (simulated or real)
- `get_weather` - Weather information (simulated)
- Custom tool definition UI

**Storage:**
- Conversations stored in localStorage
- Optional: Sync to database when authenticated

### 3. API Keys (`/keys`)

Manage API keys for gateway access.

**Features:**
- List all API keys with usage stats
- Create new key with name, rate limits, permissions
- Copy key to clipboard (shown once)
- Revoke/delete keys
- Per-key usage breakdown

**API Endpoints:**
```
GET    /admin/keys
POST   /admin/keys
DELETE /admin/keys/:id
GET    /admin/keys/:id/usage
```

### 4. Request Logs (`/logs`)

View and search request history (summary view).

**Features:**
- Paginated table of requests
- Filters: provider, model, status, date range
- Search by request ID or content
- Expand row for full request/response
- Export logs as CSV

**API Endpoints:**
```
GET /admin/logs?page=1&limit=50&provider=openai&status=success
GET /admin/logs/:id
```

---

### 5. Dev Logs (`/dev-logs`)

Raw request/response data for debugging and development. This is the power-user view with full payload inspection.

**Features:**
- **Virtualized Table**: Handle 100k+ rows with smooth scrolling (TanStack Virtual)
- **Full Payload View**: Expandable JSON viewer with syntax highlighting
- **Request/Response Diff**: Side-by-side comparison of request vs response
- **Real-time Streaming**: Live tail of incoming requests (WebSocket)
- **Advanced Filters**:
  - By aura_request_id
  - By provider, model, status
  - By latency threshold (slow requests)
  - By cost threshold (expensive requests)
  - By tool calls (requests with function calls)
  - By error type
- **SQL Query Mode**: Power users can write raw SQL queries
- **Export Options**: JSON, CSV, NDJSON for large exports

**Table Columns:**
| Column | Description |
|--------|-------------|
| Timestamp | Request time with ms precision |
| Request ID | `aura_` prefixed UUID |
| Provider | openai, anthropic, google |
| Model | Model ID (gpt-4o, claude-3, etc.) |
| Status | completed, failed, incomplete |
| Input Tokens | Number of input tokens |
| Output Tokens | Number of output tokens |
| Cost | USD cost of request |
| Latency | Response time in ms |
| Tools | Tool calls count (if any) |
| Error | Error code (if failed) |

**Payload Viewer Features:**
```
┌─────────────────────────────────────────────────────────────┐
│  Request ID: aura_550e8400-e29b-41d4-a716-446655440000      │
├──────────────────────────┬──────────────────────────────────┤
│  REQUEST                 │  RESPONSE                        │
│  ───────────────────     │  ────────────────────            │
│  {                       │  {                               │
│    "model": "gpt-4o",    │    "id": "resp_abc123",          │
│    "input": [            │    "status": "completed",        │
│      {                   │    "output": [                   │
│        "role": "user",   │      {                           │
│        "content": "..."  │        "type": "message",        │
│      }                   │        "content": [...]          │
│    ],                    │      }                           │
│    "tools": [...]        │    ],                            │
│  }                       │    "usage": {...}                │
│                          │  }                               │
└──────────────────────────┴──────────────────────────────────┘
```

**API Endpoints:**
```
GET  /admin/dev-logs?page=1&limit=100&sort=timestamp:desc
GET  /admin/dev-logs/:id/full          # Full request + response payload
GET  /admin/dev-logs/stream            # WebSocket for live tail
POST /admin/dev-logs/query             # Execute custom SQL query
POST /admin/dev-logs/export            # Async export job
```

---

### 6. Insights & Analytics (`/insights`)

Visual analytics dashboard showing agent behavior, usage patterns, and cost optimization opportunities.

**Sections:**

#### 6.1 Overview Metrics
Quick stats cards showing:
- Total requests (24h / 7d / 30d)
- Total cost with trend indicator
- Average latency with p95/p99
- Error rate percentage
- Active models count
- Tool calls count

#### 6.2 Token Usage Charts (D3/visx)
```
┌─────────────────────────────────────────────────────────────┐
│  Token Usage Over Time                         [7d ▼] [📊] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ████                                                       │
│  ████ ███                                                   │
│  ████ ███ ████                    ███                       │
│  ████ ███ ████ ███           ███  ███  ████                 │
│  ████ ███ ████ ███ ████ ███  ███  ███  ████ ███            │
│  ──────────────────────────────────────────────────────────│
│  Mon  Tue  Wed  Thu  Fri  Sat  Sun                         │
│                                                             │
│  ■ Input Tokens  ■ Output Tokens  ■ Cached Tokens          │
└─────────────────────────────────────────────────────────────┘
```

**Chart Types:**
- Stacked area chart (tokens over time)
- Line chart with multiple series
- Drill-down by model or provider

#### 6.3 Cost Analytics (D3/visx)
```
┌─────────────────────────────────────────────────────────────┐
│  Cost Breakdown                               [This Month] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  By Provider          │  By Model                          │
│  ───────────────      │  ───────────                       │
│  OpenAI    ████ 65%   │  gpt-4o      ████████ $234.50     │
│  Anthropic ██   25%   │  claude-3    ████     $89.20      │
│  Google    █    10%   │  gpt-4o-mini ███      $45.10      │
│                       │  gemini-pro  ██       $23.40      │
│                                                             │
│  Daily Cost Trend                                          │
│  $50 ┼                            ▲                        │
│      │                     ╱─────╱                         │
│  $25 ┼              ╱─────╱                                │
│      │       ╱─────╱                                       │
│   $0 ┼──────╱                                              │
│      Mon  Tue  Wed  Thu  Fri  Sat  Sun                    │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Treemap of cost by model/provider
- Daily/weekly/monthly trends
- Cost forecasting (simple linear projection)
- Budget alerts threshold setting
- Cost per successful request vs failed

#### 6.4 Tool Usage Analytics
```
┌─────────────────────────────────────────────────────────────┐
│  Agent Tool Usage                                   [30d]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Most Used Tools                 │  Tool Success Rate      │
│  ────────────────                │  ──────────────────     │
│  1. web_search     ████████ 45%  │  web_search     98.2%   │
│  2. calculate      ████     22%  │  calculate      99.9%   │
│  3. get_weather    ███      15%  │  get_weather    95.1%   │
│  4. code_execute   ██       10%  │  code_execute   87.3%   │
│  5. file_read      █         8%  │  file_read      92.0%   │
│                                                             │
│  Tool Calls Over Time                                      │
│  40 ┼    ╱╲                                                │
│     │   ╱  ╲    ╱╲                                         │
│  20 ┼  ╱    ╲──╱  ╲                                        │
│     │ ╱            ╲╱                                      │
│   0 ┼╱                                                     │
│     Mon  Tue  Wed  Thu  Fri  Sat  Sun                     │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Tool call frequency ranking
- Success/failure rates per tool
- Average latency per tool
- Tool chain analysis (which tools are called together)
- Tool error patterns

#### 6.5 Agent Behavior Insights
```
┌─────────────────────────────────────────────────────────────┐
│  Agent Loop Analysis                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Average Tool Calls Per Request: 2.4                       │
│  Max Tool Calls in Single Request: 12                      │
│  Requests with Reasoning: 34%                              │
│  Requests Requiring Action: 8%                             │
│                                                             │
│  Agent Iteration Distribution                              │
│  ─────────────────────────────                             │
│  1 call  ████████████████████████████████ 65%             │
│  2 calls ███████████████                   30%             │
│  3+ calls ██                                5%             │
│                                                             │
│  ⚠️  Potential Issues Detected                             │
│  ────────────────────────────                              │
│  • 3 requests exceeded 10 tool calls (possible loops)      │
│  • web_search timeout rate increased 15% this week         │
│  • 12 requests hit max_tokens limit                        │
└─────────────────────────────────────────────────────────────┘
```

#### 6.6 Usage Heatmap
```
┌─────────────────────────────────────────────────────────────┐
│  Request Volume Heatmap                    [Last 4 Weeks]  │
├─────────────────────────────────────────────────────────────┤
│        Mon  Tue  Wed  Thu  Fri  Sat  Sun                   │
│  00:00  ░    ░    ░    ░    ░    ░    ░                    │
│  04:00  ░    ░    ░    ░    ░    ░    ░                    │
│  08:00  ▒    ▓    ▓    ▓    ▓    ░    ░                    │
│  12:00  ▓    █    █    █    ▓    ░    ░                    │
│  16:00  █    █    █    █    █    ▒    ░                    │
│  20:00  ▓    ▓    ▓    ▓    ▒    ░    ░                    │
│                                                             │
│  Legend: ░ Low  ▒ Medium  ▓ High  █ Peak                   │
└─────────────────────────────────────────────────────────────┘
```

**API Endpoints:**
```
GET /admin/insights/overview?period=7d
GET /admin/insights/tokens?period=7d&group_by=day
GET /admin/insights/costs?period=30d&group_by=model
GET /admin/insights/tools?period=30d
GET /admin/insights/agent-behavior?period=7d
GET /admin/insights/heatmap?weeks=4
GET /admin/insights/anomalies           # Detected issues
```

---

### 7. Agentic Harness (`/harness`)

**The differentiating feature** - A comprehensive toolkit for tuning, testing, and debugging agentic workflows. This is what makes Aura unique for teams building AI agents.

#### 7.1 Agent Trace Viewer

Visualize the complete execution tree of an agent session, including all tool calls, reasoning steps, and outputs.

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Trace: aura_550e8400...                    [Export] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ User Message ──────────────────────────────────────┐   │
│  │ "What's the weather in Tokyo and convert to Celsius"│   │
│  └─────────────────────────────────────────────────────┘   │
│           │                                                 │
│           ▼                                                 │
│  ┌─ Reasoning ─────────────────────────────────────────┐   │
│  │ I need to: 1) Get weather in Tokyo 2) Convert temp │   │
│  │ Latency: 234ms  Tokens: 45                         │   │
│  └─────────────────────────────────────────────────────┘   │
│           │                                                 │
│           ▼                                                 │
│  ┌─ Tool Call: get_weather ────────────────────────────┐   │
│  │ Input: {"location": "Tokyo, Japan"}                 │   │
│  │ Output: {"temp": 72, "unit": "fahrenheit", ...}     │   │
│  │ Latency: 156ms  ✓ Success                          │   │
│  └─────────────────────────────────────────────────────┘   │
│           │                                                 │
│           ▼                                                 │
│  ┌─ Tool Call: calculate ──────────────────────────────┐   │
│  │ Input: {"expr": "(72 - 32) * 5/9"}                  │   │
│  │ Output: {"result": 22.22}                           │   │
│  │ Latency: 12ms  ✓ Success                           │   │
│  └─────────────────────────────────────────────────────┘   │
│           │                                                 │
│           ▼                                                 │
│  ┌─ Assistant Response ────────────────────────────────┐   │
│  │ "The current temperature in Tokyo is 22°C (72°F)"  │   │
│  │ Total Latency: 523ms  Total Cost: $0.0012          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Expandable tree view of agent execution
- Click any node to see full payload
- Highlight slow operations (> p95 latency)
- Show token counts at each step
- Export trace as JSON for sharing

#### 7.2 Prompt Library

Store, version, and A/B test system prompts for your agents.

```
┌─────────────────────────────────────────────────────────────┐
│  Prompt Library                              [+ New Prompt] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔍 Search prompts...                                       │
│                                                             │
│  ┌─ Customer Support Agent v2.3 ─────────────── [Active] ─┐│
│  │ You are a helpful customer support agent for Acme Co.  ││
│  │ Always be polite and professional. If you don't know   ││
│  │ the answer, offer to escalate to a human agent.        ││
│  │                                                         ││
│  │ Tags: support, production                               ││
│  │ Used by: 1,234 requests  |  Last edited: 2 days ago    ││
│  │                                                         ││
│  │ [Edit] [Duplicate] [A/B Test] [View History]           ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ Code Assistant v1.1 ───────────────────── [Testing] ──┐│
│  │ You are an expert programmer. Write clean, well-       ││
│  │ documented code. Explain your reasoning step by step.  ││
│  │ ...                                                     ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Version history with diff view
- A/B testing with traffic splitting
- Performance metrics per prompt version
- Template variables ({{company_name}}, {{user_context}})
- Import/export prompts as YAML

#### 7.3 Tool Registry

Define, test, and manage custom tools for your agents.

```
┌─────────────────────────────────────────────────────────────┐
│  Tool Registry                                 [+ New Tool] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Built-in Tools                                             │
│  ───────────────                                            │
│  ✓ web_search      Search the web for information          │
│  ✓ calculate       Perform mathematical calculations        │
│  ✓ get_weather     Get current weather for a location       │
│  ✗ code_execute    Execute code (disabled)                  │
│                                                             │
│  Custom Tools                                               │
│  ─────────────                                              │
│  ┌─ lookup_customer ──────────────────────────────────────┐│
│  │ Description: Look up customer by email or ID           ││
│  │ Endpoint: POST https://api.acme.com/customers/lookup   ││
│  │ Parameters:                                             ││
│  │   - email (string, optional)                            ││
│  │   - customer_id (string, optional)                      ││
│  │                                                         ││
│  │ Test Results: ✓ 23/23 passed  |  Avg latency: 89ms     ││
│  │                                                         ││
│  │ [Edit] [Test] [Mock Response] [Disable]                ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Visual tool definition editor
- JSON Schema validation for parameters
- Test tool with sample inputs
- Mock response mode for development
- Usage analytics per tool
- Rate limiting per tool

#### 7.4 Replay Debugger

Replay failed or interesting agent sessions step-by-step, modify inputs, and re-run.

```
┌─────────────────────────────────────────────────────────────┐
│  Replay Debugger                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Session: aura_550e8400...  │  Status: Failed              │
│  Model: gpt-4o              │  Duration: 12.3s             │
│  Error: Tool timeout        │  Cost: $0.045                │
│                                                             │
│  ┌─ Step 1: User Message ─────────────── [✓ Completed] ───┐│
│  │ "Find me the best restaurants in SF and book a table"  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ Step 2: Tool Call ────────────────── [✓ Completed] ───┐│
│  │ web_search("best restaurants San Francisco 2024")      ││
│  │ Duration: 1.2s  ✓ Success                              ││
│  │ [View Response] [Edit & Replay]                        ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ Step 3: Tool Call ────────────────── [✗ Failed] ──────┐│
│  │ book_restaurant({"name": "Atelier Crenn", "time":...}) ││
│  │ Duration: 30.0s  ✗ Timeout                             ││
│  │                                                         ││
│  │ [Edit Input] [Mock Response] [Skip Step] [Retry]       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  [◀ Previous] [▶ Next] [⟳ Replay All] [📝 Edit & Re-run]  │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Step-by-step execution replay
- Modify any step's input/output
- Mock tool responses
- Skip steps to test different paths
- Fork session to create test cases
- Compare original vs modified execution

#### 7.5 Guardrails Configuration

Set limits and safety controls for agent execution.

```
┌─────────────────────────────────────────────────────────────┐
│  Guardrails Configuration                          [Save]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Execution Limits                                          │
│  ─────────────────                                         │
│  Max tool calls per request:      [10    ] ▼               │
│  Max sequential tool calls:       [5     ] ▼               │
│  Max execution time (seconds):    [60    ] ▼               │
│  Max tokens per request:          [8000  ] ▼               │
│                                                             │
│  Cost Controls                                             │
│  ─────────────                                             │
│  Max cost per request (USD):      [$1.00 ] ▼               │
│  Daily budget limit (USD):        [$100  ] ▼               │
│  ☑ Alert when 80% of daily budget reached                  │
│  ☐ Hard stop at budget limit                               │
│                                                             │
│  Tool Permissions                                          │
│  ────────────────                                          │
│  ☑ web_search      - Allowed                               │
│  ☑ calculate       - Allowed                               │
│  ☐ code_execute    - Disabled (requires approval)          │
│  ☑ file_read       - Allowed (read-only)                   │
│  ☐ file_write      - Disabled                              │
│                                                             │
│  Loop Detection                                            │
│  ──────────────                                            │
│  ☑ Detect repeated tool calls with same parameters         │
│  ☑ Auto-terminate after 3 identical calls                  │
│  ☑ Log suspected infinite loops                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 7.6 Automated Test Runner

Define and run test suites for your agents.

```
┌─────────────────────────────────────────────────────────────┐
│  Test Suites                                  [+ New Suite] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ Customer Support Tests ───── Last run: 2h ago ────────┐│
│  │                                                         ││
│  │  ✓ 12 passed  ✗ 1 failed  ⏭ 2 skipped                  ││
│  │                                                         ││
│  │  Test Cases:                                            ││
│  │  ✓ Should greet user politely                          ││
│  │  ✓ Should look up order status                         ││
│  │  ✓ Should escalate billing issues                      ││
│  │  ✗ Should handle refund requests                       ││
│  │    Expected: offer refund options                       ││
│  │    Actual: suggested contacting support                 ││
│  │  ...                                                    ││
│  │                                                         ││
│  │  [Run Suite] [Edit] [View History] [Export]            ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  CI/CD Integration                                         │
│  ─────────────────                                         │
│  Webhook URL: https://aura.example.com/api/test/webhook    │
│  API Token: aura_test_****************************         │
│                                                             │
│  ```bash                                                   │
│  curl -X POST $WEBHOOK_URL \                               │
│    -H "Authorization: Bearer $API_TOKEN" \                 │
│    -d '{"suite": "customer-support"}'                      │
│  ```                                                       │
└─────────────────────────────────────────────────────────────┘
```

**Test Definition Format:**
```yaml
# customer-support-tests.yaml
name: Customer Support Tests
model: gpt-4o
system_prompt: "@prompts/customer-support-v2.3"

tests:
  - name: Should greet user politely
    input: "Hello"
    assertions:
      - type: contains
        value: "Hello"
      - type: sentiment
        value: positive

  - name: Should look up order status
    input: "Where is my order #12345?"
    assertions:
      - type: tool_called
        tool: lookup_order
        params:
          order_id: "12345"
      - type: contains
        value: "order"
```

#### 7.7 Context Window Analyzer

Visualize how the context window is being utilized and identify optimization opportunities.

```
┌─────────────────────────────────────────────────────────────┐
│  Context Window Analysis: aura_550e8400...                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Model: gpt-4o  │  Context: 128k tokens  │  Used: 45,230   │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░││
│  │ 35% used                                                ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Token Distribution                                        │
│  ──────────────────                                        │
│  System Prompt:     ████                    8,500 (19%)    │
│  Conversation:      ████████████            24,300 (54%)   │
│  Tool Results:      █████                   10,200 (23%)   │
│  Available:         ██                       2,230 (5%)    │
│                                                             │
│  ⚠️  Recommendations                                        │
│  ───────────────────                                        │
│  • Tool results taking 23% of context - consider summarizing│
│  • Conversation has 45 messages - consider truncation       │
│  • System prompt is 8.5k tokens - can be optimized         │
│                                                             │
│  Truncation Preview                                        │
│  ──────────────────                                        │
│  Strategy: [Keep recent + summarize old ▼]                 │
│  Tokens after: 28,400 (save 37%)                           │
│                                                             │
│  [Apply Truncation] [Save Strategy] [View Full Context]    │
└─────────────────────────────────────────────────────────────┘
```

**API Endpoints (Harness):**
```
GET  /admin/harness/traces?session_id=...
GET  /admin/harness/traces/:id

GET  /admin/harness/prompts
POST /admin/harness/prompts
PUT  /admin/harness/prompts/:id
GET  /admin/harness/prompts/:id/history
POST /admin/harness/prompts/:id/ab-test

GET  /admin/harness/tools
POST /admin/harness/tools
PUT  /admin/harness/tools/:id
POST /admin/harness/tools/:id/test
POST /admin/harness/tools/:id/mock

POST /admin/harness/replay
POST /admin/harness/replay/:id/step/:step/modify

GET  /admin/harness/guardrails
PUT  /admin/harness/guardrails

GET  /admin/harness/tests
POST /admin/harness/tests
POST /admin/harness/tests/:id/run
GET  /admin/harness/tests/:id/results

POST /admin/harness/context/analyze
POST /admin/harness/context/truncate
```

---

### 8. Providers (`/providers`)

Configure and monitor LLM providers.

**Features:**
- List configured providers with status
- Add/edit provider configuration
- API key management per provider
- Model availability per provider
- Health check status
- Pricing information

**API Endpoints:**
```
GET    /admin/providers
POST   /admin/providers
PUT    /admin/providers/:id
DELETE /admin/providers/:id
POST   /admin/providers/:id/test
```

---

### 9. Settings (`/settings`)

System-wide configuration.

**Tabs:**
- **General**: Gateway name, default model, timeout settings
- **Rate Limiting**: Global rate limits, burst settings
- **Caching**: Cache TTL, cache bypass rules
- **Security**: CORS, allowed origins, admin credentials

## Navigation Structure

```
┌─────────────────────────────────────────────────────────────┐
│  [Aura Logo]  Aura Gateway                    [User] [Theme]│
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  OVERVIEW    │                                              │
│  Dashboard   │                                              │
│  Insights    │           [Page Content]                     │
│              │                                              │
│  DEVELOP     │                                              │
│  Playground  │                                              │
│  Dev Logs    │                                              │
│  Harness     │                                              │
│              │                                              │
│  MANAGE      │                                              │
│  API Keys    │                                              │
│  Providers   │                                              │
│  Logs        │                                              │
│  Settings    │                                              │
│              │                                              │
│  ─────────── │                                              │
│  Docs ↗      │                                              │
│  GitHub ↗    │                                              │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

## Authentication

### Phase 1: Simple Admin Key
- Single admin key from environment variable
- Stored in localStorage after login
- All admin endpoints require `X-Admin-Key` header

### Phase 2: User Accounts (Future)
- JWT-based authentication
- User roles (admin, viewer)
- Session management

## Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  React App  │────▶│  Zustand    │────▶│ localStorage│
│  (UI)       │     │  (State)    │     │ (Persist)   │
└─────────────┘     └─────────────┘     └─────────────┘
       │
       │ API Calls
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  TanStack   │────▶│  API Client │────▶│  Aura       │
│  Query      │     │  (Axios)    │     │  Gateway    │
└─────────────┘     └─────────────┘     └─────────────┘
```

## Implementation Phases

### Phase 1: Foundation (PR #25 equivalent)
- [ ] Initialize `apps/admin/` with Vite + React + TypeScript
- [ ] Set up Tailwind CSS with Aura brand theme
- [ ] Install and configure shadcn/ui
- [ ] Create AppLayout with sidebar navigation (grouped sections)
- [ ] Add React Router with all routes
- [ ] Set up Zustand stores
- [ ] Implement simple admin key auth

### Phase 2: Playground (Migrate from apps/chat)
- [ ] Move chat components to `components/chat/`
- [ ] Add conversation persistence with localStorage
- [ ] Implement ConversationList sidebar
- [ ] Add agent mode with tool configuration
- [ ] Add model selector with available models
- [ ] Add system prompt editor

### Phase 3: Dashboard
- [ ] Create dashboard page layout
- [ ] Add usage chart component (Recharts)
- [ ] Add cost breakdown component
- [ ] Add provider health cards
- [ ] Add recent requests feed
- [ ] Connect to admin API endpoints

### Phase 4: API Keys Management
- [ ] Create keys table component
- [ ] Add create key dialog
- [ ] Implement key copy functionality
- [ ] Add delete confirmation
- [ ] Add per-key usage display

### Phase 5: Request Logs (Basic)
- [ ] Create logs table with pagination
- [ ] Add filter components
- [ ] Add search functionality
- [ ] Add log detail expansion
- [ ] Add CSV export

### Phase 6: Dev Logs (Advanced)
- [ ] Install TanStack Table + Virtual
- [ ] Create virtualized logs table (100k+ rows)
- [ ] Add JSON payload viewer with syntax highlighting
- [ ] Implement request/response diff view
- [ ] Add WebSocket for live tail
- [ ] Add SQL query mode (with validation)
- [ ] Add export to JSON/NDJSON

### Phase 7: Insights & Analytics
- [ ] Install visx/D3 for advanced charts
- [ ] Create overview metrics cards
- [ ] Build token usage stacked area chart
- [ ] Build cost breakdown treemap + line chart
- [ ] Build tool usage analytics
- [ ] Build agent behavior insights panel
- [ ] Build usage heatmap
- [ ] Add anomaly detection alerts

### Phase 8: Agentic Harness - Core
- [ ] Create agent trace viewer component
- [ ] Build trace tree visualization
- [ ] Implement prompt library with CRUD
- [ ] Add prompt versioning + diff view
- [ ] Create tool registry UI
- [ ] Implement tool testing interface

### Phase 9: Agentic Harness - Advanced
- [ ] Build replay debugger
- [ ] Implement step-by-step replay
- [ ] Add input modification + re-run
- [ ] Create guardrails configuration UI
- [ ] Build automated test runner
- [ ] Implement CI/CD webhook integration
- [ ] Build context window analyzer

### Phase 10: Providers & Settings
- [ ] Create providers list page
- [ ] Add provider configuration forms
- [ ] Create settings page with tabs
- [ ] Add configuration forms

## Migration Path from apps/chat

The current `apps/chat/` code will be migrated into the admin app:

1. **Keep apps/chat/** as standalone demo (optional)
2. **Copy components** to `apps/admin/src/components/chat/`
3. **Enhance with**:
   - Conversation persistence
   - Agent/tool configuration
   - Model switching
   - Better error handling
4. **Share Tailwind config** and theme tokens

## Styling Guidelines

### Colors (from brand assets)
```css
--aura-violet-400: #a78bfa;
--aura-indigo-400: #818cf8;
--aura-indigo-500: #6366f1;
--aura-indigo-600: #4f46e5;
```

### Component Library
Use shadcn/ui components for consistency:
- Buttons, inputs, selects
- Cards, dialogs, sheets
- Tables, data display
- Navigation components

### Dark Mode
- CSS variables for theme colors
- `dark` class on html element
- Persist preference in localStorage

## API Contract

### Admin Endpoints (to be implemented in aura-proxy)

```rust
// routes/admin/mod.rs
Router::new()
    // Dashboard & Stats
    .route("/admin/stats/overview", get(stats_overview))
    .route("/admin/stats/usage", get(stats_usage))
    .route("/admin/stats/costs", get(stats_costs))

    // API Keys
    .route("/admin/keys", get(list_keys).post(create_key))
    .route("/admin/keys/:id", delete(delete_key))
    .route("/admin/keys/:id/usage", get(key_usage))

    // Request Logs (summary)
    .route("/admin/logs", get(list_logs))
    .route("/admin/logs/:id", get(get_log))

    // Dev Logs (raw data)
    .route("/admin/dev-logs", get(list_dev_logs))
    .route("/admin/dev-logs/:id/full", get(get_full_log))
    .route("/admin/dev-logs/stream", get(stream_logs_ws))
    .route("/admin/dev-logs/query", post(query_logs))
    .route("/admin/dev-logs/export", post(export_logs))

    // Insights & Analytics
    .route("/admin/insights/overview", get(insights_overview))
    .route("/admin/insights/tokens", get(insights_tokens))
    .route("/admin/insights/costs", get(insights_costs))
    .route("/admin/insights/tools", get(insights_tools))
    .route("/admin/insights/agent-behavior", get(insights_agent_behavior))
    .route("/admin/insights/heatmap", get(insights_heatmap))
    .route("/admin/insights/anomalies", get(insights_anomalies))

    // Agentic Harness - Traces
    .route("/admin/harness/traces", get(list_traces))
    .route("/admin/harness/traces/:id", get(get_trace))

    // Agentic Harness - Prompts
    .route("/admin/harness/prompts", get(list_prompts).post(create_prompt))
    .route("/admin/harness/prompts/:id", get(get_prompt).put(update_prompt).delete(delete_prompt))
    .route("/admin/harness/prompts/:id/history", get(prompt_history))
    .route("/admin/harness/prompts/:id/ab-test", post(create_ab_test))

    // Agentic Harness - Tools
    .route("/admin/harness/tools", get(list_tools).post(create_tool))
    .route("/admin/harness/tools/:id", get(get_tool).put(update_tool).delete(delete_tool))
    .route("/admin/harness/tools/:id/test", post(test_tool))
    .route("/admin/harness/tools/:id/mock", post(set_tool_mock))

    // Agentic Harness - Replay
    .route("/admin/harness/replay", post(start_replay))
    .route("/admin/harness/replay/:id/step/:step/modify", post(modify_step))

    // Agentic Harness - Guardrails
    .route("/admin/harness/guardrails", get(get_guardrails).put(update_guardrails))

    // Agentic Harness - Tests
    .route("/admin/harness/tests", get(list_tests).post(create_test))
    .route("/admin/harness/tests/:id", get(get_test).put(update_test).delete(delete_test))
    .route("/admin/harness/tests/:id/run", post(run_test))
    .route("/admin/harness/tests/:id/results", get(test_results))

    // Agentic Harness - Context
    .route("/admin/harness/context/analyze", post(analyze_context))
    .route("/admin/harness/context/truncate", post(truncate_context))

    // Providers
    .route("/admin/providers", get(list_providers).post(create_provider))
    .route("/admin/providers/:id", put(update_provider).delete(delete_provider))
    .route("/admin/providers/:id/test", post(test_provider))

    .layer(AdminAuthLayer::new())
```

## Success Criteria

### Core Features
- [ ] Single deployable admin app
- [ ] All CRUD operations for keys work
- [ ] Chat playground functional with agents
- [ ] Dashboard shows real-time stats
- [ ] Mobile-responsive layout
- [ ] Dark mode support
- [ ] < 500KB initial bundle size (core)

### Dev Logs
- [ ] Handle 100k+ rows without performance degradation
- [ ] Full payload inspection with syntax highlighting
- [ ] Live tail streaming via WebSocket
- [ ] Export to JSON/CSV/NDJSON

### Insights & Analytics
- [ ] Token/cost charts render smoothly with D3/visx
- [ ] Drill-down from overview to specific models/providers
- [ ] Tool usage analytics with success rates
- [ ] Agent behavior patterns visualized
- [ ] Anomaly detection alerts working

### Agentic Harness (Differentiating Features)
- [ ] Agent traces visualized as execution trees
- [ ] Prompt library with versioning and A/B testing
- [ ] Custom tools definable via UI
- [ ] Failed sessions replayable step-by-step
- [ ] Guardrails enforceable (max tokens, tool limits, costs)
- [ ] Automated tests runnable via CI/CD webhook
- [ ] Context window analyzer provides actionable recommendations

## Competitive Advantage

The **Agentic Harness** is what differentiates Aura from other LLM gateways:

| Feature | LiteLLM | Portkey | OpenRouter | **Aura** |
|---------|---------|---------|------------|----------|
| Multi-provider | ✓ | ✓ | ✓ | ✓ |
| Cost tracking | ✓ | ✓ | ✓ | ✓ |
| Prompt management | ✗ | ✓ | ✗ | ✓ |
| Agent tracing | ✗ | ✗ | ✗ | **✓** |
| Replay debugger | ✗ | ✗ | ✗ | **✓** |
| Tool testing | ✗ | ✗ | ✗ | **✓** |
| Automated agent tests | ✗ | ✗ | ✗ | **✓** |
| Context analyzer | ✗ | ✗ | ✗ | **✓** |
| Guardrails config | ✗ | Partial | ✗ | **✓** |

**Target users**: Teams building production AI agents who need to debug, test, and optimize agentic workflows.
