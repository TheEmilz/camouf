# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-02-04

### Added
- New `hardcoded-secrets` rule for detecting sensitive values in source code
  - Detects API keys (AWS, OpenAI, Stripe, GitHub, Google, Slack, etc.)
  - Finds database connection strings with embedded credentials
  - Identifies JWT tokens, private keys, and Bearer tokens
  - Catches hardcoded passwords and secret keys
  - Supports custom patterns via configuration
  - Automatically masks detected secrets in output
- Created comprehensive documentation in `docs/` folder
- Added `CHANGELOG.md` for tracking all changes

### Changed
- Total built-in rules increased from 10 to 11

## [0.1.4] - 2026-02-04

### Changed
- Updated dependencies to latest major versions:
  - commander: 12.1.0 → 14.0.3
  - chokidar: 3.6.0 → 5.0.0
  - boxen: 7.1.1 → 8.0.1
  - ora: 8.2.0 → 9.2.0
  - log-symbols: 6.0.0 → 7.0.1
  - inquirer: 9.3.8 → 13.2.2
  - ts-morph: 22.0.0 → 27.0.2
  - @types/node: 20.19.31 → 25.2.0

### Fixed
- ESLint errors with unnecessary regex escapes

## [0.1.3] - 2026-02-04

### Changed
- Updated package.json with correct GitHub repository URLs
- Repository now linked to https://github.com/TheEmilz/camouf

## [0.1.2] - 2026-02-04

### Changed
- Made README more professional (removed emojis)
- Improved documentation clarity

## [0.1.1] - 2026-02-04

### Changed
- Changed license from MIT to Apache 2.0 for better patent protection
- Added NOTICE file for Apache 2.0 compliance

## [0.1.0] - 2026-02-04

### Added
- Initial release of Camouf
- **CLI Commands**:
  - `camouf init` - Interactive configuration setup
  - `camouf watch` - Real-time architecture monitoring
  - `camouf validate` - One-shot validation
  - `camouf analyze` - Deep dependency analysis
  - `camouf report` - Generate JSON/HTML reports

- **Multi-Language Support**:
  - TypeScript/JavaScript (via ts-morph)
  - Python (via tree-sitter)
  - Java (via tree-sitter)
  - Go (via tree-sitter)
  - Rust (via tree-sitter)

- **Built-in Architecture Rules**:
  - `layer-dependencies` - Validates architectural layer dependencies
  - `circular-dependencies` - Detects dependency cycles
  - `security-context` - Checks authentication/authorization on routes
  - `performance-antipatterns` - Finds N+1 queries, deep loops, memory leaks
  - `ddd-boundaries` - Validates Domain-Driven Design patterns
  - `type-safety` - Checks for unsafe type usage
  - `api-versioning` - Validates API version patterns
  - `data-flow-integrity` - Checks input validation and sanitization
  - `distributed-transactions` - Validates transaction patterns
  - `resilience-patterns` - Checks for timeout/retry/circuit breaker

- **Core Features**:
  - Dependency graph construction with graphlib
  - Incremental file watching with chokidar
  - Configurable via `camouf.config.json`
  - Multiple output formats (stylish, JSON, compact)
  - Auto-fix support (planned)

---

[Unreleased]: https://github.com/TheEmilz/camouf/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/TheEmilz/camouf/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/TheEmilz/camouf/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/TheEmilz/camouf/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/TheEmilz/camouf/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/TheEmilz/camouf/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/TheEmilz/camouf/releases/tag/v0.1.0
