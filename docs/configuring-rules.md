# Configuring Rules

Camouf comes with 11 built-in rules. This guide explains how to configure each one.

## Rule Levels

Each rule can be set to one of three levels:

| Level | Description |
|-------|-------------|
| `"off"` | Disable the rule |
| `"warn"` | Report as warning (yellow) |
| `"error"` | Report as error (red), fails CI |

You can also use an object for advanced configuration:

```json
{
  "rules": {
    "builtin": {
      "circular-dependencies": {
        "level": "error",
        "options": {
          "maxCycleLength": 5
        }
      }
    }
  }
}
```

## Built-in Rules Reference

### layer-dependencies

**Purpose**: Validates that architectural layers only depend on allowed layers.

```json
"layer-dependencies": {
  "level": "error",
  "options": {
    "strictMode": true
  }
}
```

**Example Violation**:
```
Controller importing Repository directly (should go through Service)
presentation -> infrastructure ❌
presentation -> application -> infrastructure ✓
```

---

### circular-dependencies

**Purpose**: Detects circular import cycles (A → B → C → A).

```json
"circular-dependencies": {
  "level": "error",
  "options": {
    "maxCycleLength": 10,
    "ignoredPaths": ["test", "mock"]
  }
}
```

**Example Violation**:
```
Circular dependency detected: 
  user.service.ts -> order.service.ts -> user.service.ts
```

---

### hardcoded-secrets

**Purpose**: Detects hardcoded sensitive values like API keys, passwords, and tokens.

```json
"hardcoded-secrets": {
  "level": "error",
  "options": {
    "ignorePaths": ["test", "mock", "fixture"],
    "minSecretLength": 8,
    "customPatterns": [
      {
        "name": "Internal API Key",
        "pattern": "MYAPP_[A-Z0-9]{32}",
        "description": "Internal API key detected"
      }
    ]
  }
}
```

**Detected Patterns**:
- AWS Access Keys (`AKIA...`)
- OpenAI, Stripe, GitHub, Google API keys
- Database connection strings with credentials
- JWT tokens
- Private keys (RSA, SSH)
- Hardcoded passwords

**Example Violation**:
```
MongoDB connection string with credentials detected: mong****@cluster
Move sensitive values to environment variables or a secrets manager
```

---

### security-context

**Purpose**: Ensures routes have proper authentication and authorization.

```json
"security-context": {
  "level": "error",
  "options": {
    "requireAuthentication": true,
    "requireAuthorization": true,
    "sensitiveRoutes": ["/admin", "/api/users"],
    "publicRoutes": ["/health", "/auth/login"]
  }
}
```

**Example Violation**:
```
Route '/admin/users' without authentication guard
Add authentication middleware or guard
```

---

### performance-antipatterns

**Purpose**: Detects common performance issues.

```json
"performance-antipatterns": {
  "level": "warn",
  "options": {
    "checkN1Queries": true,
    "checkUnboundedLoops": true,
    "checkMemoryLeaks": true,
    "maxLoopDepth": 3
  }
}
```

**Detected Patterns**:
- N+1 query pattern (queries inside loops)
- Deep nested loops (> 3 levels)
- setInterval without clearInterval
- addEventListener without cleanup
- Synchronous file operations (readFileSync)

---

### ddd-boundaries

**Purpose**: Validates Domain-Driven Design patterns.

```json
"ddd-boundaries": {
  "level": "warn",
  "options": {
    "domains": ["user", "order", "payment"],
    "allowedCrossings": [
      { "from": "order", "to": "user" }
    ],
    "enforceAggregateRoots": true
  }
}
```

**Detected Patterns**:
- Cross-bounded context dependencies
- Entities with direct repository access
- Aggregate roots without invariant validation
- Business logic in repositories

---

### type-safety

**Purpose**: Checks for unsafe type usage in TypeScript.

```json
"type-safety": {
  "level": "warn",
  "options": {
    "checkAnyUsage": true,
    "checkNonNullAssertions": true,
    "checkTypeAssertions": true
  }
}
```

**Detected Patterns**:
- Non-null assertions (`!`)
- Type assertions (`as`)
- `any` type usage
- Missing return types on public functions

---

### api-versioning

**Purpose**: Validates API versioning patterns.

```json
"api-versioning": {
  "level": "warn",
  "options": {
    "requireVersion": true,
    "versionPattern": "/api/v[0-9]+/"
  }
}
```

---

### data-flow-integrity

**Purpose**: Checks input validation and sanitization.

```json
"data-flow-integrity": {
  "level": "warn"
}
```

**Detected Patterns**:
- Missing input validation
- Direct user input in queries (injection risk)
- Missing output sanitization

---

### distributed-transactions

**Purpose**: Validates transaction patterns in distributed systems.

```json
"distributed-transactions": {
  "level": "warn"
}
```

**Detected Patterns**:
- Multiple service calls without saga pattern
- Missing rollback logic
- Cross-database transactions

---

### resilience-patterns

**Purpose**: Ensures resilience patterns for external calls.

```json
"resilience-patterns": {
  "level": "warn"
}
```

**Detected Patterns**:
- HTTP calls without timeout
- Missing retry logic
- No circuit breaker
- Missing fallback handlers

---

## Disabling Rules for Specific Files

You can use inline comments to disable rules:

```typescript
// camouf-disable-next-line hardcoded-secrets
const testApiKey = 'sk-test-12345'; // This is a test key

// camouf-disable hardcoded-secrets
// All secrets in this file are ignored
```

## Global Rule Settings

```json
{
  "rules": {
    "settings": {
      "ignorePatterns": ["**/*.test.ts", "**/*.spec.ts"],
      "maxWarnings": 50
    }
  }
}
```
