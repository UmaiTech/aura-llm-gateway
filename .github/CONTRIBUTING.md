# Contributing to Aura LLM Gateway

Thank you for your interest in contributing to Aura LLM Gateway! This document provides guidelines and instructions for contributing.

## Development Setup

1. **Install Rust** (1.70+):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **Clone the repository**:
   ```bash
   git clone https://github.com/UmaiTech/aura-llm-gateway.git
   cd aura-llm-gateway
   ```

3. **Install development tools**:
   ```bash
   make install
   ```

4. **Build the project** (this automatically installs git hooks):
   ```bash
   cargo build
   ```

5. **Verify setup**:
   ```bash
   make ci
   ```

### Git Hooks

The project uses `cargo-husky` for automatic git hooks. On your first `cargo build`, hooks are installed automatically:

- **Pre-commit hook**: Runs `cargo fmt --check` and `cargo clippy`
- **Pre-push hook**: Runs `cargo test --workspace`

To bypass hooks temporarily (not recommended):
```bash
git commit --no-verify
git push --no-verify
```

## Development Workflow

### Making Changes

1. **Create a branch**:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make your changes** following the code style guidelines

3. **Run checks locally**:
   ```bash
   make check     # Format, lint, and test
   make ci        # Full CI checks
   ```

4. **Commit your changes** using [Conventional Commits](#commit-message-format)

5. **Push and create a PR**

### Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/) for automated changelog generation and semantic versioning.

#### Format
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes

#### Examples
```bash
feat(provider): add OpenAI adapter
fix(auth): resolve API key validation issue
docs: update installation instructions
refactor(core): simplify request routing logic
perf(cache): optimize Redis connection pooling
```

#### Breaking Changes
For breaking changes, add `!` after the type or include `BREAKING CHANGE:` in the footer:

```bash
feat(api)!: change response format to Open Responses API

BREAKING CHANGE: All endpoints now return Open Responses format
```

## Code Style

### Rust Guidelines

- Follow the [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- Run `cargo fmt` before committing (automatic with `make fmt`)
- Ensure `cargo clippy` has no warnings (checked by `make lint`)
- Write tests for new functionality
- Add documentation comments (`///`) for public APIs

### Project Conventions

See [CLAUDE.md](../CLAUDE.md) for detailed project conventions including:
- Error handling patterns
- Logging guidelines
- Async patterns
- Testing strategies

## Testing

```bash
# Run all tests
make test

# Run specific crate tests
cargo test -p aura-core

# Run with coverage
make test-coverage

# Run doc tests
make test-doc
```

## Pull Request Process

1. **Ensure all checks pass**:
   - CI workflow passes
   - No clippy warnings
   - All tests pass
   - Code is formatted

2. **Update documentation**:
   - Update README if needed
   - Add/update code comments
   - Update CLAUDE.md for conventions

3. **Fill out PR template** with:
   - Clear description of changes
   - Related issue number
   - Testing steps
   - Screenshots (if UI changes)

4. **Request review** from @UmaiTech/ai-core

5. **Address review feedback**

6. **Merge**:
   - Squash commits if multiple small commits
   - Use conventional commit format for PR title
   - Delete branch after merge

## Release Process

Releases are automated via `release-plz`:

1. **On merge to `main`**:
   - `release-plz` analyzes commits since last release
   - Determines version bump (major/minor/patch) based on conventional commits
   - Creates a PR with version updates and changelog

2. **Review and merge the release PR**:
   - Verify changelog is correct
   - Check version bumps are appropriate
   - Merge the PR

3. **Automated release**:
   - GitHub release is created with changelog
   - Git tag is created (v0.x.x)
   - Build Release workflow creates binaries
   - Docker images are published

## Getting Help

- **Questions**: Open a [Discussion](https://github.com/UmaiTech/aura-llm-gateway/discussions)
- **Bugs**: Open an [Issue](https://github.com/UmaiTech/aura-llm-gateway/issues/new?template=bug_report.md)
- **Features**: Open an [Issue](https://github.com/UmaiTech/aura-llm-gateway/issues/new?template=feature_request.md)

## Code of Conduct

Be respectful, inclusive, and collaborative. We're all here to build great software together.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
