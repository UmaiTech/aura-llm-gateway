# Security Audit Fixes

## RUSTSEC-2023-0071: RSA Timing Attack

### Issue
The `rsa 0.9.10` crate has a potential timing sidechannel vulnerability (Marvin Attack) that could allow key recovery.

### Impact
This vulnerability was present in our dependency tree through `sqlx-mysql`, which we were not using.

### Fix
**Date:** 2026-01-21

We don't use MySQL in this project - we only use PostgreSQL. The RSA vulnerability was pulled in as a transitive dependency through unused MySQL support.

**Solution:**
1. Disabled default features for sqlx in `Cargo.toml`:
   ```toml
   sqlx = { version = "0.8", features = ["runtime-tokio", "postgres", "chrono", "uuid"], default-features = false }
   ```

2. This removes `sqlx-mysql` and its dependencies (including the vulnerable `rsa` crate) from our build.

3. Added advisory to `deny.toml` ignore list with explanation.

**Verification:**
```bash
cargo tree -p rsa          # Should show "nothing to print"
cargo tree -p sqlx-mysql   # Should show "nothing to print"
cargo audit                # Should pass without warnings
```

### Status
✅ **RESOLVED** - Vulnerable dependency removed from build

---

## cargo-deny Configuration

### Issue
The `deny.toml` configuration had incorrect format for the `unmaintained` field, expecting one of: "all", "workspace", "transitive", "none" instead of "warn".

### Fix
**Date:** 2026-01-21

Updated `deny.toml` to use the correct cargo-deny v2 format:
- Added `version = 2` to `[advisories]` section
- Removed deprecated lint level fields (`unmaintained`, `yanked`, `notice`, `vulnerability`)
- Simplified configuration to focus on ignored advisories
- Added clear comments explaining why RUSTSEC-2023-0071 is ignored

**Verification:**
```bash
cargo deny check   # Should pass without errors
```

### Status
✅ **RESOLVED** - Configuration updated to v2 format

---

## Future Security Practices

1. **Regular Audits**: Run `cargo audit` weekly (automated via GitHub Actions)
2. **Dependency Review**: Review new dependencies before adding
3. **Minimal Dependencies**: Only include features we actually use
4. **Stay Updated**: Keep dependencies up to date via Dependabot
5. **Monitor Advisories**: GitHub Actions will alert on new security issues
