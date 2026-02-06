
[![npm version](https://img.shields.io/npm/v/camouf.svg)](https://www.npmjs.com/package/camouf)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/TheEmilz/camouf/actions/workflows/ci.yml/badge.svg)](https://github.com/TheEmilz/camouf/actions/workflows/ci.yml)

# Camouf

**Real-time Architecture Monitoring CLI Tool**

Camouf is a powerful, multi-language CLI tool for monitoring and enforcing software architecture in real-time. It detects architectural violations, anti-patterns, and provides actionable suggestions to maintain code quality.

## Features

- **Real-time Monitoring**: Watch mode for continuous architecture validation
- **Multi-language Support**: TypeScript, JavaScript, Python, Java, Go, Rust
- **Advanced Analysis**: Circular dependency detection, coupling metrics, hotspot identification
- **13 Built-in Rules**: Comprehensive rule set for modern architectures
- **AI Agent Safety**: Detects function/field name mismatches from AI context loss
- **Security Scanning**: Detects hardcoded secrets, API keys, and credentials
- **Multiple Report Formats**: HTML, JSON, Markdown, SARIF
- **VS Code Integration**: Real-time Problems panel integration with custom tasks
- **Highly Configurable**: JSON, YAML, or JavaScript configuration

<p align="center">
  <a href="https://raw.githubusercontent.com/TheEmilz/camouf/master/docs/images/architecture-overview.svg" target="_blank">
    <img src="docs/images/architecture-overview.svg" alt="Camouf Architecture Overview" width="100%" />
  </a>
</p>

---

## Function Signature Matching: Catch AI Agent Errors

AI coding agents like Claude Code and GitHub Copilot work with limited context windows.
When generating frontend code without full visibility into backend contracts, they often
use **similar but incorrect names** for functions and type fields.

These errors compile successfully but cause runtime failures.

### The Problem

<p align="center">
  <a href="https://raw.githubusercontent.com/TheEmilz/camouf/master/docs/images/problem-flow.svg" target="_blank">
    <img src="docs/images/problem-flow.svg" alt="AI Context Loss Problem" width="100%" />
  </a>
</p>

### How Camouf Solves It

Camouf's `function-signature-matching` rule scans your shared contracts and uses
fuzzy matching to detect when code uses names that are *close but not exact*:

<p align="center">
  <a href="https://raw.githubusercontent.com/TheEmilz/camouf/master/docs/images/camouf-workflow.svg" target="_blank">
    <img src="docs/images/camouf-workflow.svg" alt="Camouf Workflow" width="100%" />
  </a>
</p>

### Example Detection

```
Defined in shared/api.ts:15      Used in frontend/user.ts:42
         getUserById(id)    ◄──────────    getUser(userId)
                                  └── 75% similar, likely a typo
```

### Quick Fix Commands

```bash
# Interactive mode: confirm each fix
npx camouf fix-signatures --interactive

# Fix all mismatches automatically
npx camouf fix-signatures --all

# Fix a specific mismatch by ID
npx camouf fix --id sig-001

# Preview what would be fixed
npx camouf fix-signatures --all --dry-run
```

### Interactive HTML Report

Run validation to generate a report with clickable quick-fix commands:

```bash
npx camouf report --format html --output camouf-report/
```

The report shows:

| Status | Type | Expected | Found | Quick Fix |
|--------|------|----------|-------|-----------|
| Error | Function | `getUserById` | `getUser` | `npx camouf fix --id sig-001` |
| Error | Field | `email` | `userEmail` | `npx camouf fix --id sig-002` |

See [AI Agent Challenges](docs/ai-agent-challenges.md) for a comprehensive guide on this feature.

---

## Documentation

- [Getting Started](docs/getting-started.md)
- [AI Agent Challenges](docs/ai-agent-challenges.md) — How Camouf catches AI-generated code errors
- [Configuring Rules](docs/configuring-rules.md)
- [CI/CD Integration](docs/ci-cd-integration.md)
- [Changelog](CHANGELOG.md)

## Installation

### Global Installation (Recommended)

```bash
npm install -g camouf
```

### Local Installation

```bash
npm install --save-dev camouf
```

### Using npx

```bash
npx camouf analyze
```

## Quick Start

### 1. Initialize Configuration

```bash
camouf init
```

This creates a `camouf.config.json` file with sensible defaults and sets up VS Code integration.

### 2. Run Analysis

```bash
camouf analyze
```

### 3. Watch Mode

```bash
camouf watch
```

### 4. VS Code Integration (Recommended)

After running `camouf init`, you get automatic VS Code integration:

1. Press `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac)
2. Select **"camouf: Validate"** for one-time scan
3. Select **"camouf: Watch"** for continuous monitoring
4. Open the **Problems panel** (`Ctrl+Shift+M`) to see violations

Violations will appear directly in VS Code with clickable file links!

## Commands

### `camouf init`

Initialize Camouf configuration in your project.

```bash
camouf init [options]

Options:
  -f, --force           Overwrite existing configuration
  -t, --template        Use a predefined template (clean-architecture, microservices, monolith)
  --agent <type>        Generate agent integration files (claude, codex, all)
```

### `camouf analyze`

Analyze project architecture and generate reports.

```bash
camouf analyze [options]

Options:
  -c, --config <path>   Path to configuration file
  -o, --output <path>   Output directory for reports
  -f, --format <type>   Report format (text, json, html, sarif)
  --visualize           Generate architecture visualization
  --rules <rules>       Comma-separated list of rules to run
```

### `camouf watch`

Start real-time architecture monitoring.

```bash
camouf watch [options]

Options:
  -c, --config <path>   Path to configuration file
  --debounce <ms>       Debounce time in milliseconds (default: 300)
  --format <format>     Output format: text (default), vscode
  --ci                  CI/agent mode: no spinners, no colors
```

### `camouf validate`

Validate architecture against configured rules (CI/CD friendly).

```bash
camouf validate [options]

Options:
  -c, --config <path>   Path to configuration file
  --format <format>     Output format: text (default), json, sarif, vscode
  --strict              Fail on warnings
  --bail                Exit on first error
  --ci                  CI/agent mode: no spinners, no colors
```

### `camouf report`

Generate architecture report from existing analysis.

```bash
camouf report [options]

Options:
  -i, --input <path>    Path to analysis JSON
  -o, --output <path>   Output path for report
  -f, --format <type>   Report format (html, json, markdown)
```

### `camouf fix`

Apply a single quick-fix by ID.

```bash
camouf fix [options]

Options:
  --id <id>            Quick-fix ID (e.g., sig-001)
  -c, --config <path>  Path to configuration file
  --dry-run            Preview changes without applying
```

### `camouf fix-signatures`

Fix all function/field signature mismatches.

```bash
camouf fix-signatures [options]

Options:
  --all                 Fix all mismatches automatically
  --interactive         Confirm each fix interactively
  --file <path>         Fix only mismatches in specific file
  --type <type>         Fix only function or field mismatches
  -c, --config <path>   Path to configuration file
  --dry-run             Preview changes without applying
  --ci                  CI/agent mode: no prompts, use --all for auto-fix
```

## Configuration

### Configuration File

Camouf supports multiple configuration formats:
- `camouf.config.json`
- `camouf.config.yaml`
- `camouf.config.js`
- `.camoufrc`

### Example Configuration

```json
{
  "name": "my-project",
  "rootDir": "./src",
  "exclude": ["**/node_modules/**", "**/*.test.ts"],
  "layers": [
    {
      "name": "presentation",
      "directories": ["./src/controllers", "./src/routes"],
      "allowedDependencies": ["application", "domain"]
    },
    {
      "name": "application",
      "directories": ["./src/services", "./src/usecases"],
      "allowedDependencies": ["domain"]
    },
    {
      "name": "domain",
      "directories": ["./src/domain", "./src/entities"],
      "allowedDependencies": []
    },
    {
      "name": "infrastructure",
      "directories": ["./src/infrastructure", "./src/repositories"],
      "allowedDependencies": ["domain"]
    }
  ],
  "rules": {
    "builtin": {
      "layer-dependencies": "error",
      "circular-dependencies": "error",
      "function-signature-matching": "error",
      "performance-antipatterns": "warn",
      "type-safety": "warn",
      "data-flow-integrity": "error",
      "distributed-transactions": "warn",
      "api-versioning": "info",
      "security-context": "error",
      "resilience-patterns": "warn",
      "ddd-boundaries": "info"
    }
  },
  "output": {
    "format": "text",
    "colors": true,
    "verbose": false
  }
}
```

## Built-in Rules

### Architecture Rules

| Rule | Description | Default |
|------|-------------|---------|
| `layer-dependencies` | Validates layer boundary compliance | `error` |
| `circular-dependencies` | Detects circular dependency cycles | `error` |
| `contract-mismatch` | Validates API contracts (OpenAPI/GraphQL) | `error` |
| `ddd-boundaries` | Validates DDD principles and bounded contexts | `warn` |
| `function-signature-matching` | Detects mismatched function/field names between contracts and usage | `error` |

### Security Rules

| Rule | Description | Default |
|------|-------------|---------|
| `hardcoded-secrets` | Detects hardcoded API keys, passwords, and tokens | `error` |
| `data-flow-integrity` | Validates data flow and input sanitization | `error` |
| `security-context` | Validates authentication and authorization | `error` |

### Reliability Rules

| Rule | Description | Default |
|------|-------------|---------|
| `distributed-transactions` | Validates distributed transaction patterns | `warn` |
| `resilience-patterns` | Validates circuit breakers, retries, timeouts | `warn` |

### Quality Rules

| Rule | Description | Default |
|------|-------------|---------|
| `performance-antipatterns` | Detects N+1 queries, memory leaks | `warn` |
| `type-safety` | Detects unsafe type usage | `warn` |
| `api-versioning` | Validates API versioning practices | `info` |

## Report Formats

### Text (Console)
Real-time colored output with violation details.

### JSON
Machine-readable format for CI/CD integration.

### HTML
Interactive visualization with dependency graphs.

### SARIF
Static Analysis Results Interchange Format for IDE integration.

### Markdown
Documentation-friendly format for pull requests.

## VS Code Integration

Camouf integrates seamlessly with VS Code's Problems panel for real-time violation feedback.

### Setup

When you run `camouf init`, it automatically creates:
- `.vscode/tasks.json` - Build tasks with problem matchers
- `.vscode/settings.json` - Optimal settings for Camouf

### Using Camouf in VS Code

#### Option 1: Run Tasks (Recommended)

1. Press `Ctrl+Shift+B` (Windows/Linux) or `Cmd+Shift+B` (Mac)
2. Select one of the tasks:
   - **camouf: Validate** - One-time scan, results in Problems panel
   - **camouf: Watch** - Continuous monitoring (background task)

3. Open the Problems panel: `Ctrl+Shift+M`

#### Option 2: Terminal Commands

```bash
# One-time validation with VS Code output format
npx camouf validate --format vscode

# Watch mode with VS Code output format  
npx camouf watch --format vscode
```

### Output Example

Violations appear in the Problems panel with:
- Severity icon (error/warning/info)
- File location (clickable link)
- Rule ID and message
- Suggestion for fix

```
test.ts(10,1): error hardcoded-secrets: AWS Access Key ID detected
src/api.ts(45,1): warning performance-antipatterns: N+1 query pattern detected
```

### Manual Tasks Setup

If you didn't run `camouf init` or need to add tasks manually, create `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "camouf: Validate",
      "type": "shell",
      "command": "npx camouf validate --format vscode",
      "problemMatcher": {
        "owner": "camouf",
        "fileLocation": ["relative", "${workspaceFolder}"],
        "pattern": {
          "regexp": "^(.+)\\((\\d+),(\\d+)\\):\\s+(error|warning|info)\\s+([^:]+):\\s+(.*)$",
          "file": 1,
          "line": 2,
          "column": 3,
          "severity": 4,
          "code": 5,
          "message": 6
        }
      }
    }
  ]
}
```

## AI Agent Integration

Camouf integrates natively with AI coding agents. Use `camouf init --agent` to generate the appropriate configuration files.

### Claude Code

```bash
camouf init --agent claude
```

This creates:
- **`CLAUDE.md`** — Project instructions teaching Claude how to use Camouf
- **`.claude/commands/camouf-validate.md`** — `/camouf-validate` slash command for architecture-aware validation
- **`.claude/commands/camouf-fix.md`** — `/camouf-fix` slash command to automatically fix violations
- **`.claude/rules/camouf.md`** — Architecture rules loaded into every Claude session

Claude Code will automatically read these files and enforce architecture rules when writing code.

### OpenAI Codex

```bash
camouf init --agent codex
```

This creates:
- **`AGENTS.md`** — Agent instructions with Camouf commands, output format, and workflow

Codex reads `AGENTS.md` and knows how to validate architecture before committing.

### All Agents

```bash
camouf init --agent all
```

Generates integration files for all supported agents (Claude Code + Codex).

### Machine-Readable Output

For agent consumption, use JSON output with CI mode:

```bash
npx camouf validate --format json --ci
```

Output:

```json
{
  "summary": { "total": 2, "errors": 1, "warnings": 1, "info": 0 },
  "violations": [
    {
      "ruleId": "hardcoded-secrets",
      "severity": "error",
      "message": "Potential hardcoded API key found",
      "file": "src/config.ts",
      "line": 15,
      "suggestion": "Move to environment variable"
    }
  ]
}
```

## CI/CD Integration

### Non-Interactive Mode

Use `--ci` flag or `CAMOUF_CI=1` environment variable for agent/CI environments:

```bash
# Suppress spinners, colors, interactive prompts
npx camouf validate --ci

# JSON output automatically enables CI mode
npx camouf validate --format json

# Environment variable alternative
CAMOUF_CI=1 npx camouf validate
```

### Exit Codes

- `0` — No violations found
- `1` — Violations found (or error)

### GitHub Actions

```yaml
name: Architecture Check
on: [push, pull_request]

jobs:
  architecture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx camouf validate --strict
```

### GitLab CI

```yaml
architecture:
  stage: test
  image: node:18
  script:
    - npm ci
    - npx camouf validate --strict
```

## Multi-language Support

| Language | Parser | Features |
|----------|--------|----------|
| TypeScript | ts-morph | Full AST analysis, type resolution |
| JavaScript | ts-morph | ES6+ module support |
| Python | tree-sitter | Import/export detection |
| Java | tree-sitter | Package and class analysis |
| Go | tree-sitter | Module and import analysis |
| Rust | tree-sitter | Crate and module analysis |

## Architecture Visualization

Generate interactive HTML visualizations:

```bash
camouf analyze --visualize -o ./reports
```

Export to GraphViz DOT format:

```bash
camouf analyze --visualize -f dot -o ./reports
```

## Extending Camouf

### Custom Rules

Create custom rules by implementing the `IRule` interface:

```typescript
import { IRule, RuleContext, RuleViolation } from 'camouf';

export class MyCustomRule implements IRule {
  readonly id = 'my-custom-rule';
  readonly name = 'My Custom Rule';
  readonly description = 'Description of what the rule checks';
  readonly severity = 'warning';
  readonly tags = ['custom'];

  validate(context: RuleContext): RuleViolation[] {
    // Your rule logic here
    return [];
  }
}
```

Register custom rules in configuration:

```json
{
  "rules": {
    "custom": [
      "./rules/my-custom-rule.js"
    ]
  }
}
```

## Docker

```bash
docker run -v $(pwd):/app ghcr.io/camouf/camouf analyze
```

## License

Apache 2.0 - See [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome. Please read the contributing guidelines before submitting pull requests.

## Links

- [npm Package](https://www.npmjs.com/package/camouf)
- [GitHub Repository](https://github.com/TheEmilz/camouf)
- [Epixiom Web & Marketing](https://epixiom.io)
