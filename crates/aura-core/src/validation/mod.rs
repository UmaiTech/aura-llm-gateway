//! Validation strategies for response quality
//!
//! Implements the gateway-side machinery for `best_of_n` and
//! `self_consistency` validation strategies. Both fire N concurrent
//! provider calls and pick the winning candidate by a configurable
//! selector (highest mean logprob, or most-frequent normalized output).
//!
//! See `crates/aura-types/src/validation.rs` for the request schema
//! and `crates/aura-proxy/src/routes/responses.rs` for the dispatch
//! point that decides when to engage the fanout vs hand off to the
//! provider directly.

mod fanout;

pub use fanout::{run_fanout, FanoutError, FanoutSelector};
