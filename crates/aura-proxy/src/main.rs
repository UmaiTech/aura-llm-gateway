//! Aura LLM Gateway - Main server binary
//!
//! This is the main entry point for the Aura LLM Gateway proxy server.
//! It sets up the Axum web server with routes, middleware, and observability.

fn main() {
    println!("Aura LLM Gateway");
    println!("Version: {}", env!("CARGO_PKG_VERSION"));
    println!("Types: {}", aura_types::version());
    println!("DB: {}", aura_db::version());
    println!("Core: {}", aura_core::version());
}
