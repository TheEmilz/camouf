
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
- **11 Built-in Rules**: Comprehensive rule set for modern architectures
- **Security Scanning**: Detects hardcoded secrets, API keys, and credentials
- **Multiple Report Formats**: HTML, JSON, Markdown, SARIF
- **IDE Integration**: SARIF export for VS Code and other editors
- **Highly Configurable**: JSON, YAML, or JavaScript configuration

## Documentation

- [Getting Started](docs/getting-started.md)
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

This creates a `camouf.config.json` file with sensible defaults.

### 2. Run Analysis

```bash
camouf analyze
```

### 3. Watch Mode

```bash
camouf watch
```

## Commands

### `camouf init`

Initialize Camouf configuration in your project.

```bash
camouf init [options]

Options:
  -f, --force     Overwrite existing configuration
  -t, --template  Use a predefined template (clean-architecture, microservices, monolith)
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
```

### `camouf validate`

Validate architecture against configured rules (CI/CD friendly).

```bash
camouf validate [options]

Options:
  -c, --config <path>   Path to configuration file
  --strict              Fail on warnings
  --bail                Exit on first error
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
| `ddd-boundaries` | Validates DDD principles and bounded contexts | `warn` |

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

## CI/CD Integration

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
- [Issue Tracker](https://github.com/TheEmilz/camouf/issues)
