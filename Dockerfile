# syntax=docker/dockerfile:1
# Aura LLM Gateway Dockerfile
# Multi-stage build using cargo-chef for efficient layer caching

# ============================================================================
# Stage 1: Chef - Prepare the recipe (dependency manifest)
# ============================================================================
FROM rust:1.91-slim-bookworm AS chef

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN cargo install cargo-chef --locked

WORKDIR /app

# ============================================================================
# Stage 2: Planner - Analyze dependencies
# ============================================================================
FROM chef AS planner

COPY . .
RUN cargo chef prepare --recipe-path recipe.json

# ============================================================================
# Stage 3: Builder - Build the application
# ============================================================================
FROM chef AS builder

# Copy the recipe and build dependencies first (this layer is cached)
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json

# Copy source code and build the application
COPY . .
RUN cargo build --release -p aura-proxy

# Strip the binary to reduce size
RUN strip /app/target/release/aura-proxy

# ============================================================================
# Stage 4: Runtime - Minimal final image
# ============================================================================
FROM debian:bookworm-slim AS runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -s /bin/false aura

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/target/release/aura-proxy /app/aura-proxy

# Copy example config (if exists)
COPY --chown=aura:aura config.example.yaml /app/config.example.yaml

# Set ownership
RUN chown -R aura:aura /app

# Switch to non-root user
USER aura

# Expose default port
EXPOSE 8080

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Set default environment variables
ENV AURA_HOST=0.0.0.0 \
    AURA_PORT=8080 \
    RUST_LOG=info

# Run the binary
ENTRYPOINT ["/app/aura-proxy"]
