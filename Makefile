.PHONY: help build test lint fmt clean run dev install check audit release docker-build docker-run

# Default target
.DEFAULT_GOAL := help

# Variables
CARGO := cargo
CARGO_FLAGS :=
RUST_LOG ?= info,aura_proxy=debug
DATABASE_URL ?= postgres://postgres:postgres@localhost:5432/aura
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

docker-compose-up: ## Start all services with docker-compose
	docker-compose up -d

docker-compose-down: ## Stop all services
	docker-compose down

docker-compose-logs: ## Follow docker-compose logs
	docker-compose logs -f

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
