.PHONY: help build test lint fmt clean run dev install check audit release \
	docker-build docker-run docker-compose-up docker-compose-down docker-compose-down-v \
	docker-compose-logs docker-compose-ps docker-deps \
	chat chat-build chat-install landing landing-build landing-install \
	admin admin-build admin-install admin-preview \
	apps apps-install apps-build dev-all \
	cron-dev scrape-pricing-dry scrape-pricing

# Default target
.DEFAULT_GOAL := help

# Variables
CARGO := cargo
CARGO_FLAGS :=
RUST_LOG ?= info,aura_proxy=debug
DATABASE_URL ?= postgres://aura:aura@localhost:5432/aura
REDIS_URL ?= redis://localhost:6379

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Development
dev: ## Run the server in development mode with auto-reload
	$(CARGO) watch -x 'run -p aura-proxy'

run: ## Run the aura-proxy server
	RUST_LOG=$(RUST_LOG) $(CARGO) run -p aura-proxy

run-release: ## Run the aura-proxy server in release mode
	RUST_LOG=$(RUST_LOG) $(CARGO) run -p aura-proxy --release

# Build
build: ## Build all crates in debug mode
	$(CARGO) build --workspace $(CARGO_FLAGS)

build-release: ## Build all crates in release mode
	$(CARGO) build --workspace --release $(CARGO_FLAGS)

build-types: ## Build only aura-types
	$(CARGO) build -p aura-types

build-db: ## Build only aura-db
	$(CARGO) build -p aura-db

build-core: ## Build only aura-core
	$(CARGO) build -p aura-core

build-proxy: ## Build only aura-proxy
	$(CARGO) build -p aura-proxy

# Testing
test: ## Run all tests
	$(CARGO) test --workspace $(CARGO_FLAGS)

test-unit: ## Run unit tests only
	$(CARGO) test --workspace --lib $(CARGO_FLAGS)

test-integration: ## Run integration tests only
	$(CARGO) test --workspace --test '*' $(CARGO_FLAGS)

test-doc: ## Run documentation tests
	$(CARGO) test --workspace --doc $(CARGO_FLAGS)

test-coverage: ## Generate test coverage report
	$(CARGO) tarpaulin --workspace --all-features --timeout 300 --out Html --out Xml

# Code Quality
lint: ## Run clippy linter
	$(CARGO) clippy --workspace --all-features --all-targets -- -D warnings

lint-fix: ## Auto-fix clippy warnings
	$(CARGO) clippy --workspace --all-features --all-targets --fix -- -D warnings

fmt: ## Format code with rustfmt
	$(CARGO) fmt --all

fmt-check: ## Check code formatting
	$(CARGO) fmt --all -- --check

# Security & Audit
audit: ## Run security audit
	$(CARGO) audit

deny: ## Run cargo-deny checks
	$(CARGO) deny check

outdated: ## Check for outdated dependencies
	$(CARGO) outdated --workspace

# Comprehensive checks (like CI)
check: fmt-check lint test ## Run all checks (fmt, lint, test)

ci: fmt-check lint test build-release ## Run all CI checks locally

# Database
db-migrate: ## Run database migrations
	sqlx migrate run

db-migrate-revert: ## Revert last database migration
	sqlx migrate revert

db-create: ## Create the database
	sqlx database create

db-drop: ## Drop the database
	sqlx database drop

db-reset: db-drop db-create db-migrate ## Reset database (drop, create, migrate)

db-setup: ## Set up database (create and migrate)
	sqlx database create || true
	sqlx migrate run

# Installation
install: ## Install required tools
	@echo "Installing development tools..."
	$(CARGO) install cargo-watch
	$(CARGO) install cargo-tarpaulin
	$(CARGO) install cargo-audit
	$(CARGO) install cargo-deny
	$(CARGO) install cargo-outdated
	$(CARGO) install sqlx-cli --no-default-features --features postgres
	@echo "✓ All tools installed"

install-sqlx: ## Install SQLx CLI
	$(CARGO) install sqlx-cli --no-default-features --features postgres

# Docker
docker-build: ## Build Docker image
	docker build -t aura-llm-gateway:latest .

docker-run: ## Run Docker container
	docker run -p 8080:8080 --env-file .env aura-llm-gateway:latest

docker-compose-up: ## Start all services (app + deps)
	docker compose up -d

docker-compose-down: ## Stop all services
	docker compose down

docker-compose-down-v: ## Stop all services and remove volumes
	docker compose down -v

docker-compose-logs: ## Follow docker-compose logs
	docker compose logs -f

docker-compose-ps: ## Show running containers
	docker compose ps

docker-deps: ## Start only dependencies (PostgreSQL, Redis) for local dev
	docker compose up postgres redis -d

# Cleanup
clean: ## Clean build artifacts
	$(CARGO) clean
	rm -rf target/
	rm -f Cargo.lock

clean-cache: ## Clean cargo cache
	rm -rf ~/.cargo/registry
	rm -rf ~/.cargo/git

# Documentation
doc: ## Generate and open documentation
	$(CARGO) doc --workspace --no-deps --open

doc-build: ## Build documentation
	$(CARGO) doc --workspace --no-deps

# Benchmarking
bench: ## Run benchmarks
	$(CARGO) bench --workspace

# Release
release: ## Build optimized release binary
	$(CARGO) build --release -p aura-proxy
	@echo "✓ Release binary: ./target/release/aura-proxy"

release-strip: release ## Build and strip release binary
	strip target/release/aura-proxy
	@echo "✓ Stripped binary: ./target/release/aura-proxy"
	@ls -lh target/release/aura-proxy

# Version management
version: ## Show current version
	@grep '^version = ' Cargo.toml | head -n1 | sed 's/version = "\(.*\)"/\1/'

# Quick commands for development
quick-test: ## Run tests without rebuilding everything
	$(CARGO) test --workspace --no-fail-fast

quick-check: ## Quick check (fmt + clippy)
	@$(MAKE) fmt-check
	@$(MAKE) lint

# Workspace info
info: ## Display workspace information
	@echo "Workspace Crates:"
	@$(CARGO) tree --depth 1
	@echo ""
	@echo "Rust Version:"
	@rustc --version
	@echo ""
	@echo "Cargo Version:"
	@$(CARGO) --version

# Pre-commit hook
pre-commit: fmt lint test ## Run pre-commit checks

# Pre-push hook
pre-push: check build-release ## Run pre-push checks

# =============================================================================
# Vercel Functions — Pricing Scraper (api/cron/scrape-pricing.ts, issue #123)
# =============================================================================
# These targets source .env so FIRECRAWL_API_KEY, DATABASE_URL, and
# CRON_SECRET reach `vercel dev` and the curl calls. The scraper's Postgres
# is the docker-compose one (postgres:postgres @ 127.0.0.1:5433) — start it
# with `make docker-deps` first, not the stale :5432 default above.

CRON_PORT ?= 3000
CRON_URL  := http://localhost:$(CRON_PORT)/api/cron/scrape-pricing
# firecrawl-js + root package.json require Node 22.x; pin it via nvm so the
# recipe doesn't run under whatever the shell default happens to be.
# Use 22.22.0 specifically — that's the version with the `vercel` CLI
# installed (22.22.3 has none, so a bare `nvm use 22` breaks `vercel`).
NODE_VERSION ?= 22.22.0
NVM_SH := $${NVM_DIR:-$$HOME/.nvm}/nvm.sh

cron-dev: ## Run Vercel functions locally (pricing scraper) on CRON_PORT
	# Raise the fd limit: vercel dev file-watches this whole monorepo and
	# crashes with EMFILE (too many open files) at the default macOS 256.
	ulimit -n 10240; \
	. $(NVM_SH); nvm use $(NODE_VERSION); \
	set -a; . ./.env; set +a; vercel dev --listen $(CRON_PORT)

scrape-pricing-dry: ## Trigger the pricing scraper in dry-run mode (no DB writes)
	@set -a; . ./.env; set +a; \
	curl -s "$(CRON_URL)?dry_run=1" -H "Authorization: Bearer $$CRON_SECRET" | jq .

scrape-pricing: ## Trigger the pricing scraper for real (writes to model_pricing)
	@set -a; . ./.env; set +a; \
	curl -s "$(CRON_URL)" -H "Authorization: Bearer $$CRON_SECRET" | jq .

# =============================================================================
# Frontend Apps
# =============================================================================

# Chat App (port 3000)
chat: ## Run the chat app in development mode
	cd apps/chat && npm run dev

chat-build: ## Build the chat app for production
	cd apps/chat && npm run build

chat-install: ## Install chat app dependencies
	cd apps/chat && npm install

chat-preview: ## Preview the chat app production build
	cd apps/chat && npm run preview

# Landing Page / Docs (port 3001)
landing: ## Run the landing page in development mode
	cd apps/landing && npm run dev

landing-build: ## Build the landing page for production
	cd apps/landing && npm run build

landing-install: ## Install landing page dependencies
	cd apps/landing && npm install

landing-preview: ## Preview the landing page production build
	cd apps/landing && npm run preview

# Admin Dashboard (port 5173)
admin: ## Run the admin dashboard in development mode
	cd apps/admin && npm run dev

admin-build: ## Build the admin dashboard for production
	cd apps/admin && npm run build

admin-install: ## Install admin dashboard dependencies
	cd apps/admin && npm install

admin-preview: ## Preview the admin dashboard production build
	cd apps/admin && npm run preview

admin-lint: ## Lint the admin dashboard
	cd apps/admin && npm run lint

# All Apps
apps-install: chat-install landing-install admin-install ## Install all app dependencies

apps-build: chat-build landing-build admin-build ## Build all apps for production

apps: ## Run all frontend apps (in background)
	@echo "Starting Chat app on http://localhost:3000..."
	@cd apps/chat && npm run dev &
	@echo "Starting Landing page on http://localhost:3001..."
	@cd apps/landing && npm run dev &
	@echo "Starting Admin dashboard on http://localhost:5173..."
	@cd apps/admin && npm run dev &
	@echo "✓ Apps started. Use 'make apps-stop' to stop them."

apps-stop: ## Stop all frontend apps
	@pkill -f "vite.*apps/chat" || true
	@pkill -f "vite.*apps/landing" || true
	@pkill -f "vite.*apps/admin" || true
	@echo "✓ Apps stopped"

# Full Development Stack
dev-all: ## Run gateway + all frontend apps
	@echo "Starting Aura Gateway on http://localhost:8080..."
	@RUST_LOG=$(RUST_LOG) $(CARGO) run -p aura-proxy &
	@sleep 2
	@echo "Starting Chat app on http://localhost:3000..."
	@cd apps/chat && npm run dev &
	@echo "Starting Landing page on http://localhost:3001..."
	@cd apps/landing && npm run dev &
	@echo "Starting Admin dashboard on http://localhost:5173..."
	@cd apps/admin && npm run dev &
	@echo ""
	@echo "✓ Full stack started:"
	@echo "  - Gateway:  http://localhost:8080"
	@echo "  - Chat:     http://localhost:3000"
	@echo "  - Landing:  http://localhost:3001"
	@echo "  - Admin:    http://localhost:5173"
	@echo ""
	@echo "Use 'make dev-stop' to stop all services."

dev-stop: ## Stop all development services
	@pkill -f "aura-proxy" || true
	@pkill -f "vite.*apps/chat" || true
	@pkill -f "vite.*apps/landing" || true
	@pkill -f "vite.*apps/admin" || true
	@echo "✓ All services stopped"
