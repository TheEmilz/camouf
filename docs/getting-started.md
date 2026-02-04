# Getting Started with Camouf

This guide will walk you through installing and using Camouf for real-time architecture monitoring.

## Prerequisites

- Node.js 18 or higher
- npm or yarn

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

A `camouf.config.json` file will be created.

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
