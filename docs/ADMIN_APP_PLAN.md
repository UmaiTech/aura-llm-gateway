# Aura Admin App - Implementation Plan

A unified admin dashboard for managing the Aura LLM Gateway, including an integrated chat playground.

## Overview

The admin app consolidates all management and testing functionality into a single React application:

- **Dashboard** - Usage overview, costs, health status
- **Playground** - Chat interface for testing the gateway (evolved from `apps/chat/`)
- **API Keys** - Create, manage, and revoke API keys
- **Logs** - Request history with filtering and search
- **Providers** - Configure and monitor LLM providers
- **Settings** - System configuration

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS + shadcn/ui components
- **Routing**: React Router v6
- **State Management**: Zustand (lightweight, TypeScript-friendly)
- **Data Fetching**: TanStack Query (React Query)
- **Charts**: Recharts
- **Icons**: Lucide React

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
│   │   └── logs/
│   │       ├── LogsTable.tsx
│   │       ├── LogFilters.tsx
│   │       └── LogDetail.tsx
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

View and search request history.

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

### 5. Providers (`/providers`)

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

### 6. Settings (`/settings`)

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
│  Dashboard   │                                              │
│  Playground  │           [Page Content]                     │
│  API Keys    │                                              │
│  Logs        │                                              │
│  Providers   │                                              │
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
- [ ] Create AppLayout with sidebar navigation
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
- [ ] Add usage chart component
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

### Phase 5: Request Logs
- [ ] Create logs table with pagination
- [ ] Add filter components
- [ ] Add search functionality
- [ ] Add log detail expansion
- [ ] Add CSV export

### Phase 6: Providers & Settings
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
    .route("/admin/stats/overview", get(stats_overview))
    .route("/admin/stats/usage", get(stats_usage))
    .route("/admin/stats/costs", get(stats_costs))
    .route("/admin/keys", get(list_keys).post(create_key))
    .route("/admin/keys/:id", delete(delete_key))
    .route("/admin/keys/:id/usage", get(key_usage))
    .route("/admin/logs", get(list_logs))
    .route("/admin/logs/:id", get(get_log))
    .route("/admin/providers", get(list_providers).post(create_provider))
    .route("/admin/providers/:id", put(update_provider).delete(delete_provider))
    .route("/admin/providers/:id/test", post(test_provider))
    .layer(AdminAuthLayer::new())
```

## Success Criteria

- [ ] Single deployable admin app
- [ ] All CRUD operations for keys work
- [ ] Chat playground functional with agents
- [ ] Dashboard shows real-time stats
- [ ] Logs searchable and filterable
- [ ] Mobile-responsive layout
- [ ] Dark mode support
- [ ] < 500KB initial bundle size
