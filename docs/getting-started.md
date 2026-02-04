# Getting Started with Camouf

This guide will walk you through installing and using Camouf for real-time architecture monitoring.

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- VS Code (recommended for best experience)

## Installation

### Global Installation (Recommended)

```bash
npm install -g camouf
```

### Local Installation

```bash
npm install --save-dev camouf
```

## Quick Start

### 1. Initialize Configuration

Navigate to your project root and run:

```bash
camouf init
```

This interactive wizard will:
- Detect your project type and languages
- Set up default layer configurations
- Enable recommended rules
- **Create VS Code tasks for Problems panel integration**

A `camouf.config.json` file and `.vscode/tasks.json` will be created.

### 2. Run Your First Validation

```bash
camouf validate
```

This scans your project and reports any architecture violations.

### 3. Start Watch Mode

For real-time monitoring during development:

```bash
camouf watch
```

Camouf will now monitor file changes and report violations instantly.

### 4. VS Code Integration (Recommended)

After running `camouf init`, use VS Code's Problems panel:

1. **Press `Ctrl+Shift+B`** (or `Cmd+Shift+B` on Mac)
2. Select **"camouf: Validate"** for one-time scan
3. Or select **"camouf: Watch"** for continuous monitoring
4. **Open Problems panel**: `Ctrl+Shift+M` (or `Cmd+Shift+M`)

Violations appear with:
- ⛔ Error/Warning/Info severity
- Clickable file location
- Rule ID and descriptive message
- Suggestion for fix

## Example Output

```
camouf validate

  src/controllers/UserController.ts
    12:5  error  Invalid layer dependency: presentation -> infrastructure
                 Layer 'presentation' can only depend on: application, domain

  src/services/OrderService.ts
    45:3  warning  Potential N+1 query pattern detected
                   Consider using batch queries, eager loading, or data loaders

  src/config/database.ts
    8:1   error  MongoDB connection string with credentials detected: mong****@cluster
                 Move sensitive values to environment variables or a secrets manager

✖ 3 problems (2 errors, 1 warning)
```

## Understanding the Configuration

Here's a minimal `camouf.config.json`:

```json
{
  "name": "my-project",
  "root": ".",
  "languages": ["typescript", "javascript"],
  
  "layers": [
    {
      "name": "presentation",
      "type": "presentation",
      "directories": ["src/controllers", "src/handlers"],
      "allowedDependencies": ["application", "domain"]
    },
    {
      "name": "application",
      "type": "application",
      "directories": ["src/services", "src/usecases"],
      "allowedDependencies": ["domain", "infrastructure"]
    },
    {
      "name": "domain",
      "type": "domain",
      "directories": ["src/entities", "src/models"],
      "allowedDependencies": []
    },
    {
      "name": "infrastructure",
      "type": "infrastructure",
      "directories": ["src/repositories", "src/adapters"],
      "allowedDependencies": ["domain"]
    }
  ],
  
  "rules": {
    "builtin": {
      "layer-dependencies": "error",
      "circular-dependencies": "error",
      "hardcoded-secrets": "error",
      "performance-antipatterns": "warn"
    }
  },
  
  "patterns": {
    "include": ["src/**/*.ts", "src/**/*.js"],
    "exclude": ["node_modules", "dist", "**/*.test.ts"]
  }
}
```

## Next Steps

- [Configuring Rules](./configuring-rules.md)
- [Understanding Layer Architecture](./layer-architecture.md)
- [Creating Custom Rules](./custom-rules.md)
- [CI/CD Integration](./ci-cd-integration.md)

## Troubleshooting

### Problems panel not showing violations

Make sure you're using the `--format vscode` flag:

```bash
npx camouf validate --format vscode
```

Or use the pre-configured tasks created by `camouf init`.

### Tasks not appearing in VS Code

1. Reload VS Code window: `Ctrl+Shift+P` → "Reload Window"
2. Or run `camouf init --force` to regenerate `.vscode/tasks.json`

### Watch mode not detecting file changes

On Windows, file watching may require polling. If you experience issues:

```bash
# In camouf.config.json, ensure polling is enabled (default)
npx camouf watch --format vscode
```
