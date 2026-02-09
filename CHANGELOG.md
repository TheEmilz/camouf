# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.1] - 2026-02-09

### Changed
- Add npm downloads badge to README
- Update ASCII banner version to v0.7.0

## [0.7.0] - 2026-02-09

### Fixed
- **Dramatically reduced false positives in `function-signature-matching`** — The rule was confusing field access on callback parameters (`node.data` from ReactFlow, `event.metaKey` from DOM, `item.dataKey` from Recharts, etc.) with internal API type field mismatches

### Added
- **Library-Aware Auto-Detection** — File imports are analyzed to detect which external libraries are in use (ReactFlow, Recharts, Express, Redux, Mongoose, Next.js, etc.) and automatically suppress their known object/field patterns
  - 15+ libraries with curated ignore patterns out of the box
  - New `LIBRARY_IGNORE_PATTERNS` registry inside the rule
- **`ignorePatterns` config option** — Simplified configuration to exclude false positives:
  ```json
  {
    "ignorePatterns": {
      "variables": ["node", "event", "item", "payload"],
      "properties": ["dataKey", "metaKey", "payload"]
    }
  }
  ```
- **Massively expanded built-in allowlists** — 150+ common object variable names (callback params like `item`, `entry`, `elem`, `val`, `acc`; framework objects like `store`, `dispatch`, `chart`, `canvas`) and 150+ common field names (DOM events, React props, chart properties, HTTP fields)

### Changed
- `isBuiltinObjectAccess` now uses `Set` instead of arrays for O(1) lookups (performance improvement on large codebases)
- External import detection now also tracks library names for context-aware analysis

## [0.6.2] - 2026-02-09

### Fixed
- **Dramatically reduced false positives in `function-signature-matching` type field checks** - The rule was incorrectly flagging field access on external library objects (ReactFlow `node.data`, DOM `event.metaKey`, Recharts `payload.payload`, etc.) as type mismatches against internal API schemas

### Added
- **External import auto-detection** (`ignoreExternalImports`, default: `true`) — Automatically parses `import`/`require` statements and skips field access checks on variables imported from `node_modules` packages
- **Ignore field patterns** (`ignoreFieldPatterns`) — User-configurable patterns to exclude from type field checks, with wildcard support:
  - Exact: `"node.data"` 
  - Object wildcard: `"event.*"` (any field on event)
  - Field wildcard: `"*.metaKey"` (metaKey on any object)
- **External library objects list** (`externalLibraryObjects`) — User-configurable list of additional variable names to always skip (e.g. `"node"` from ReactFlow)
- **Expanded built-in allowlist** — Added 80+ common objects and fields from DOM, React, Express, Node.js, and test frameworks to the skip list

### Example config
```json
{
  "rules": {
    "builtin": {
      "function-signature-matching": {
        "level": "error",
        "options": {
          "ignoreFieldPatterns": ["node.*", "event.*", "payload.payload"],
          "externalLibraryObjects": ["graph", "chart"],
          "ignoreExternalImports": true
        }
      }
    }
  }
}
```

## [0.6.1] - 2026-02-09

### Added
- **Scan Progress Reporting** - Real-time progress feedback during project scanning for large codebases
  - Spinner now shows file-by-file progress: `Scanning [127/1843] (6%) src/core/rules/...`
  - Three-phase feedback: discovering files → parsing (with counter) → building dependency graph
  - Long file paths automatically truncated for clean terminal output
  - CI mode emits progress via debug logs (no ANSI escape codes)
  - Applied to `validate`, `analyze`, and `watch` commands

## [0.6.0] - 2026-02-09

### Added
- **Redesigned CLI Help** - Rich interactive help with ASCII banner, grouped commands, inline options, examples, available rules list, and docs links
- **CLI Reference in README** - Full CLI output shown in README for instant engagement
- **Test Fixtures: client/server/shared structure** - Realistic cross-boundary test files for `function-signature-matching` rule
  - `shared/user.types.ts` and `shared/payment.types.ts` with canonical APIs
  - `client/user-service.ts` and `client/payment-handler.ts` with AI-drifted function calls
  - `server/user-controller.ts` with mismatched server implementations

### Fixed
- **`fix-signatures` now works correctly** - Was returning "No mismatches found" because test-fixtures had empty `client`/`server` directories in config
- **Unknown command handling** - Shows helpful error message instead of crash
- **`--help` and no-args behavior** - Shows custom help instead of default Commander output

### Changed
- Updated `test-fixtures/camouf.config.json` with proper layer definitions and 10 enabled rules
- Removed duplicated Commands section from README (replaced with CLI Reference link)

## [0.5.0] - 2025-02-07

### Added
- **5 New AI-Specific Rules** - Purpose-built to catch AI coding assistant mistakes:
  - `ai-hallucinated-imports` - Detects imports of non-existent files/modules (AI "hallucinates" paths)
  - `context-drift-patterns` - Finds when the same concept gets different names across files (User vs Customer vs Account)
  - `phantom-type-references` - Catches references to types that don't exist or were renamed
  - `inconsistent-casing` - Detects mixing of camelCase/snake_case in the same codebase
  - `orphaned-functions` - Finds functions that are declared but never called anywhere

- **MCP Server Integration** - AI agents can now call Camouf directly:
  - `camouf mcp` command starts the Model Context Protocol server
  - Tools: `camouf_validate`, `camouf_analyze`, `camouf_suggest_fix`
  - Compatible with Claude Desktop, Cursor, and other MCP-enabled agents
  - See README for configuration examples

- **Official Plugin: camouf-plugin-react** - Published to npm:
  - 4 React-specific rules for AI-generated code
  - `missing-dependency-array` - useEffect/useMemo/useCallback dependency issues
  - `inconsistent-component-naming` - PascalCase enforcement for components
  - `prop-drilling-detection` - Excessive prop passing through component trees
  - `stale-closure-patterns` - Stale closures in hooks

- **Test Fixtures** - Example files in `test-fixtures/ai-errors/` demonstrating all AI rules

### Changed
- README completely rewritten with AI-first narrative
- Camouf now positioned as "Architecture Guardrails for AI-Generated Code"
- Total built-in rules: 18 (13 architecture + 5 AI-specific)

## [0.4.1] - 2025-02-06

### Changed
- README diagrams are now clickable for full-size view

## [0.4.0] - 2026-02-06

### Added
- **Function Signature Matching Rule**: New `function-signature-matching` rule that detects AI-generated code mismatches
  - Semantic similarity matching (Levenshtein distance, synonyms, prefixes/suffixes)
  - Detects function name, parameter name, and type field mismatches
  - Works with `camouf watch` for real-time detection
- **Fix Commands**: `camouf fix` and `camouf fix-signatures` for auto-fixing violations
  - `--dry-run` to preview changes
  - `--interactive` for confirmation prompts
  - `--all` to fix all mismatches at once
- **Signature Mismatch HTML Report**: Dedicated `signature-mismatches.html` with quick-fix commands
- **Beautiful Mermaid Diagrams**: Architecture diagrams using beautiful-mermaid library
- **AI Agent Challenges Documentation**: Comprehensive guide at `docs/ai-agent-challenges.md`

### Changed
- Default exclude patterns no longer exclude test files (`*.test.*`, `*.spec.*`)
- README updated with SVG diagrams generated by beautiful-mermaid

### Fixed
- Validation exit code now correctly returns 1 when violations are found
- Report command properly passes file contents for signature analysis

## [0.3.2] - 2026-02-06

### Added
- `camouf.js` entry point shim so `node camouf.js` works as fallback when agents guess the entry point

### Fixed
- Agent templates (CLAUDE.md, AGENTS.md, slash commands) now explicitly instruct to use `npx camouf` and warn against `node camouf.js` or bare `camouf`
- Prevents agents from guessing wrong invocation method

## [0.3.1] - 2026-02-06

### Fixed
- `camouf init --agent <type>` now implies `--yes` (non-interactive mode) so AI agents don't hang on interactive prompts
- Previously required `--yes` flag in addition to `--agent`, which broke agent workflows

## [0.3.0] - 2026-02-04

### Added
- **AI Agent Integration** — Native support for CLI coding agents
  - `camouf init --agent claude` — Generates `CLAUDE.md`, `.claude/commands/camouf-validate.md`, `.claude/commands/camouf-fix.md`, and `.claude/rules/camouf.md`
  - `camouf init --agent codex` — Generates `AGENTS.md` for OpenAI Codex CLI
  - `camouf init --agent all` — Generates integration files for all supported agents
  - Claude Code slash commands: `/camouf-validate` and `/camouf-fix`
  - Architecture rules automatically loaded into Claude sessions via `.claude/rules/camouf.md`
- **`--ci` flag** for `validate` and `watch` commands
  - Suppresses spinners, colors, and interactive prompts
  - Automatically enabled when using `--format json`, `--format sarif`, or `--format vscode`
  - Also triggered by `CI=1` or `CAMOUF_CI=1` environment variables
  - Designed for non-interactive environments (CI pipelines, AI agents, scripts)
- New `src/core/agents/agent-integrations.ts` module for agent template generation

### Changed
- Version bumped to 0.3.0 (minor version bump for new feature)
- Updated `package.json` keywords with `claude-code`, `codex`, `ai-agent`, `CLAUDE.md`, `AGENTS.md`
- Updated `src/cli/version.ts` with correct metadata (homepage, author, license)
- Updated SARIF reporter with correct version and URL

## [0.2.6] - 2026-02-04

### Changed
- README updated with Epixiom link

## [0.2.4] - 2026-02-04

### Added
- **VS Code Problems panel integration**
  - `camouf init` now creates `.vscode/tasks.json` with pre-configured tasks
  - New `--format vscode` option for `validate` and `watch` commands
  - Output format compatible with VS Code problem matchers
  - Violations appear directly in Problems panel with clickable file links

### Changed
- `camouf init` now also creates `.vscode/settings.json` with optimal settings
- `hardcoded-secrets` rule: **Removed exclusions for test/mock/fixture files**
  - AI agents often hide real secrets in files named "test", "mock", "example"
  - All files are now scanned regardless of naming patterns
- Added more secret detection patterns:
  - Anthropic API keys (`sk-ant-*`)
  - OpenAI project keys (`sk-proj-*`)
  - Hugging Face tokens (`hf_*`)
  - Discord bot tokens
  - Firebase configuration
  - Vercel/Netlify tokens
  - Railway tokens

## [0.2.3] - 2026-02-04

### Improved
- Smart directory detection during `camouf init`
  - Analyzes actual file content to detect frontend vs backend code
  - Detects React, Vue, Angular, Svelte patterns for client directories
  - Detects Express, NestJS, Fastify, database patterns for server directories
  - Detects shared types, utilities, and common code patterns
  - Falls back to intelligent heuristics when content analysis is inconclusive

## [0.2.2] - 2026-02-04

### Fixed
- Fixed `camouf init` command failing with "Configuration already exists" error even when no config file exists
  - The `configExists()` method was using async `fs.access` without await, causing false positives

## [0.2.1] - 2026-02-04

### Added
- New `contract-mismatch` rule for API contract validation
  - Validates client API calls against OpenAPI/Swagger specifications
  - Supports GraphQL schema validation
  - Detects calls to undefined endpoints
  - Warns on deprecated API usage
  - Validates required parameters
  - Auto-detects schema files (openapi.json, swagger.yaml, schema.graphql)
  - Supports fetch(), axios, Angular HttpClient, and GraphQL queries

### Changed
- Total built-in rules increased from 11 to 12

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
