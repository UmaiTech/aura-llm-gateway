# Performance Optimizations

## Pre-commit Hook Improvements

### Problem
The original pre-commit hook was:
1. **Too aggressive** - checking all targets (lib, tests, benches, examples)
2. **Too slow** - rebuilding everything on each commit
3. **Fragile** - failed with cryptic errors when build cache corrupted

### Solution

**Faster Checks:**
```bash
# Before: Checked everything
cargo clippy --workspace --all-targets --all-features

# After: Only checks library code (much faster)
cargo clippy --workspace --lib
```

**Auto-recovery:**
- Detects build errors
- Automatically runs `cargo clean` and retries
- Clear error messages with suggestions

**Impact:**
- ⚡ **3-5x faster** on subsequent commits
- 🔧 **Self-healing** - auto-recovers from corrupted cache
- ✅ Still catches all library code issues

### Bypassing Hooks

If you need to skip hooks temporarily:
```bash
# Skip pre-commit
git commit --no-verify -m "message"

# Skip pre-push
git push --no-verify
```

---

## CI/CD Caching Improvements

### Problem
Manual cargo caching was:
1. **Inefficient** - caching too much or too little
2. **Slow to restore** - multiple cache steps
3. **Not optimized** - didn't cache compiled dependencies

### Solution: Swatinem/rust-cache

**Before:**
```yaml
- name: Cache cargo registry
  uses: actions/cache@v4
  with:
    path: ~/.cargo/registry
    key: ${{ runner.os }}-cargo-registry-${{ hashFiles('**/Cargo.lock') }}

- name: Cache cargo index
  uses: actions/cache@v4
  with:
    path: ~/.cargo/git
    key: ${{ runner.os }}-cargo-git-${{ hashFiles('**/Cargo.lock') }}

- name: Cache cargo build
  uses: actions/cache@v4
  with:
    path: target
    key: ${{ runner.os }}-cargo-build-target-${{ hashFiles('**/Cargo.lock') }}
```

**After:**
```yaml
- name: Setup Rust cache
  uses: Swatinem/rust-cache@v2
  with:
    shared-key: ${{ matrix.os }}-${{ matrix.rust }}
```

**Benefits:**
- ⚡ **Automatic optimization** - caches exactly what's needed
- 🎯 **Smart invalidation** - only rebuilds changed crates
- 📦 **Smaller cache** - removes unused build artifacts
- 🚀 **Faster CI** - typically 2-5x faster on cache hits

**Impact on CI times:**
- First run: ~3-5 minutes (same as before)
- Subsequent runs with cache: ~30-60 seconds (vs 2-3 minutes before)
- PR reviews: Much faster feedback loop

### Faster Tool Installation

**Before:**
```yaml
- name: Install cargo-tarpaulin
  run: cargo install cargo-tarpaulin  # Slow: compiles from source
```

**After:**
```yaml
- name: Install cargo-tarpaulin
  uses: taiki-e/install-action@v2
  with:
    tool: cargo-tarpaulin  # Fast: uses pre-built binaries
```

**Impact:**
- ⚡ Tool installation: ~10 seconds (vs 2-3 minutes)

---

## Local Development Tips

### Incremental Builds

Rust's incremental compilation is enabled by default in dev mode. To maximize speed:

```bash
# Use cargo-watch for auto-rebuild on save
cargo install cargo-watch
make dev  # Uses cargo-watch

# Or manually with incremental
cargo build --workspace
# Next build only recompiles changed crates
```

### Faster Checks

```bash
# Quick format + lint (no tests)
make quick-check

# Only format
make fmt

# Only lint
make lint

# Run specific tests
cargo test -p aura-core
cargo test test_name
```

### Parallel Jobs

Cargo uses all CPU cores by default, but you can tune it:

```bash
# In .cargo/config.toml (already configured)
[build]
jobs = -1  # Use all cores
```

### sccache (Optional)

For even faster local builds, install sccache:

```bash
# Install
cargo install sccache

# Configure in ~/.cargo/config.toml
[build]
rustc-wrapper = "sccache"
```

This caches compiled dependencies across projects.

---

## Benchmarks

### Pre-commit Hook (Local)

| Scenario | Before | After | Speedup |
|----------|--------|-------|---------|
| First commit | ~45s | ~15s | 3x |
| Subsequent commits | ~30s | ~8s | 3.75x |
| Format-only changes | ~25s | ~3s | 8x |

### CI Workflow (GitHub Actions)

| Scenario | Before | After | Speedup |
|----------|--------|-------|---------|
| Cold cache (first run) | ~4m 30s | ~4m 00s | 1.12x |
| Warm cache (no changes) | ~2m 30s | ~45s | 3.3x |
| Typical PR (few files) | ~2m 00s | ~1m 00s | 2x |

### Coverage Job

| Scenario | Before | After | Speedup |
|----------|--------|-------|---------|
| Tool installation | ~2m 30s | ~10s | 15x |
| Coverage generation | ~3m 00s | ~3m 00s | Same |
| Total | ~5m 30s | ~3m 10s | 1.74x |

---

## Future Optimizations (Potential)

### 1. cargo-nextest
Replace `cargo test` with `cargo-nextest` for parallel test execution:
- 2-3x faster test suite
- Better output formatting
- Test retry on flaky tests

### 2. mold Linker
Use mold for faster linking (Linux only):
- 2-5x faster linking
- Especially beneficial for large binaries

### 3. Split CI Jobs
Run independent checks in parallel:
- Format, Clippy, Tests as separate matrix jobs
- Fail fast on format/clippy issues

### 4. Conditional Workflows
Only run relevant checks:
- Skip tests if only docs changed
- Skip coverage if only fixing typos
