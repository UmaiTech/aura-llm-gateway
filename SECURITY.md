# Security Policy

We take the security of Aura LLM Gateway seriously. Thank you for helping
keep the project and its users safe.

## Supported Versions

Security fixes are applied to the latest release on the `main` branch. Older
releases are not maintained. Please upgrade to the most recent version before
reporting an issue.

| Version | Supported          |
| ------- | ------------------ |
| Latest `0.x` release | ✅ |
| Older `0.x` releases | ❌ |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security reports.**

To report a vulnerability, use one of the following private channels:

1. **GitHub Security Advisories** (preferred): open a draft advisory at
   https://github.com/UmaiTech/aura-llm-gateway/security/advisories/new
2. **Email**: send details to **security@umai.tech**

Please include as much of the following information as possible to help us
triage the report:

- A description of the issue and the impact you believe it has
- Steps to reproduce, including any proof-of-concept code or requests
- The affected version, commit, or deployment configuration
- Any suggested mitigation, if you have one

## Disclosure Process

After receiving a report we will:

1. Acknowledge receipt within **3 business days**.
2. Investigate and confirm the issue, and keep you informed of progress.
3. Prepare a fix and a coordinated release on a timeline appropriate to the
   severity (typically within 30 days for high-severity issues).
4. Publish a GitHub Security Advisory crediting the reporter, unless you
   prefer to remain anonymous.

We ask that you give us a reasonable opportunity to address the issue before
any public disclosure.

## Scope

This policy applies to:

- The Rust crates in `crates/` (`aura-types`, `aura-core`, `aura-db`, `aura-proxy`)
- The Python SDK in `sdks/python/`
- The Docker images and Helm/deployment manifests published from this repo
- The example apps in `apps/` only insofar as they ship as released artifacts

Out of scope:

- Self-hosted deployments that have been modified from the upstream code
- Third-party integrations and providers (please report those upstream)
- Issues caused by misconfiguration that is documented as insecure (for
  example, running with `AURA_MASTER_KEY` left at a default value)

## Past Advisories

A log of past internal security audits and fixes is maintained in
[`.github/SECURITY_FIXES.md`](.github/SECURITY_FIXES.md). Public advisories
are published under the
[Security Advisories](https://github.com/UmaiTech/aura-llm-gateway/security/advisories)
tab.

## Hardening Recommendations

Operators running Aura LLM Gateway in production should review:

- [docs/architecture.md](docs/architecture.md) for the threat model
- [docs/api/authentication.md](docs/api/authentication.md) for API key handling
- The "Production" section of `README.md` for CORS and TLS guidance
- Provider credential storage — Aura uses AES-256-GCM envelope encryption,
  but the master key (`AURA_MASTER_KEY`) must be stored securely (KMS,
  Vault, or equivalent)
