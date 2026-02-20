# Detecting Async Discrepancies in AI-Generated Code

When AI coding assistants generate asynchronous code, they frequently introduce subtle bugs
that compile without errors but produce incorrect runtime behavior. This guide explains why
these discrepancies occur, how Camouf detects them, and how to combine Camouf with
complementary tools for comprehensive async safety.

## Table of Contents

- [The Problem: Async Context Loss](#the-problem-async-context-loss)
- [Why Traditional Tools Miss This](#why-traditional-tools-miss-this)
- [What Camouf Detects](#what-camouf-detects)
- [Configuration](#configuration)
- [Real-World Scenarios](#real-world-scenarios)
- [Using Camouf with Complementary Tools](#using-camouf-with-complementary-tools)
- [CI/CD Integration](#cicd-integration)
- [Best Practices](#best-practices)

---

## The Problem: Async Context Loss

AI coding agents operate within limited context windows. When an agent generates code that
interacts with asynchronous functions defined elsewhere in the codebase, it often loses
track of whether a function is synchronous or asynchronous. The result is a category of
bugs that are uniquely difficult to detect:

1. **The code compiles.** TypeScript and JavaScript do not require `await` on async calls.
2. **The code may even appear to work.** A missing `await` returns a `Promise` object,
   which is truthy, so conditional checks pass silently.
3. **The failure is intermittent.** Race conditions from unawaited promises surface
   unpredictably under load, making them expensive to diagnose in production.

Consider a typical scenario in a multi-file project:

```typescript
// services/user-service.ts (existing code)
export async function validateUser(data: UserInput): Promise<boolean> {
  const rules = await fetchValidationRules();
  return rules.every(rule => rule.check(data));
}
```

```typescript
// controllers/user-controller.ts (AI-generated code)
import { validateUser } from '../services/user-service';

export async function createUser(req: Request) {
  const isValid = validateUser(req.body);  // Missing await
  if (!isValid) {                          // Always truthy (Promise object)
    throw new Error('Invalid user');       // Never executes
  }
  // Proceeds with invalid data...
}
```

The AI agent remembered that `validateUser` exists and returns a boolean, but forgot
that it is asynchronous. TypeScript does not flag this. ESLint's default ruleset does
not flag this. The incorrect code enters production.

---

## Why Traditional Tools Miss This

| Tool | What It Catches | What It Misses |
|------|----------------|----------------|
| **TypeScript compiler** | Type errors, syntax errors | Missing `await` (not a type error in JS/TS) |
| **ESLint (default)** | Style issues, unused variables | Cross-file async contract violations |
| **Prettier** | Formatting | Nothing semantic |
| **Unit tests** | Tested code paths | Async race conditions in untested paths |

The `@typescript-eslint/no-floating-promises` rule does exist, but it requires full
type-checking (`parserOptions.project`), significantly increases lint time, and
operates on a single file without cross-referencing function declarations across the
codebase. It also does not detect the inverse problem: unnecessary `async` keywords
on functions that never `await`.

Camouf addresses this gap by performing cross-file analysis specifically designed for
the patterns AI agents introduce.

---

## What Camouf Detects

The `async-discrepancies` rule performs five categories of detection:

### 1. Unnecessary Async Functions

Functions marked `async` that never use `await`. This wraps return values in an
unnecessary `Promise`, misleads callers about the function's nature, and indicates
that the AI agent may have confused this function with a genuinely asynchronous one.

```typescript
// Violation: async has no effect here
async function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// Correct
function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
```

### 2. Floating Promises

Async function calls without `await`, `.then()`, `.catch()`, or explicit `void`. Errors
from these calls are silently swallowed, and execution order becomes unpredictable.

```typescript
async function processOrder(orderId: string) {
  const order = await getOrderById(orderId);

  saveAuditLog('order_processed', orderId);     // Floating promise
  sendNotification(order.userId, 'Processed');   // Floating promise

  await updateOrderStatus(orderId, 'complete');  // Correct
}
```

### 3. Await on Non-Promise Values

`await` applied to literal values or expressions that are clearly not Promises. This
pattern typically occurs when an AI agent rewrites a previously asynchronous call to
use a synchronous implementation but leaves the `await` in place.

```typescript
// Violation
const greeting = await "hello";
const count = await 42;
const flag = await true;
```

### 4. Mixed Async Patterns (await + .then)

Functions that mix `await` with `.then()` chains. While syntactically valid, this
combination creates confusing control flow and often indicates that an AI agent
partially converted callback-based code to async/await but did not complete the
transformation.

```typescript
// Violation: mixing styles
async function fetchData(url: string) {
  const response = await fetch(url);
  response.json().then(data => {   // Should be: const data = await response.json()
    processData(data);
  });
}
```

### 5. Mixed Async Patterns (await + Callbacks)

Functions that combine `await` with error-first callback patterns. This frequently
occurs when an AI agent generates new code in async/await style but integrates it
with older callback-based APIs without performing proper promisification.

```typescript
// Violation: callback in async function
async function readAndUpload(filePath: string) {
  const content = await readFile(filePath);
  uploadToS3(content, function(err, result) {   // Should use await + promisified API
    if (err) console.error(err);
  });
}
```

---

## Configuration

Enable the rule in `camouf.config.json`:

```json
{
  "rules": {
    "builtin": {
      "async-discrepancies": "warn"
    }
  }
}
```

For stricter enforcement (recommended in CI):

```json
{
  "rules": {
    "builtin": {
      "async-discrepancies": {
        "level": "error",
        "options": {
          "checkMissingAwait": true,
          "checkUnnecessaryAsync": true,
          "checkFloatingPromises": true,
          "checkAwaitNonPromise": true,
          "checkMixedPatterns": true
        }
      }
    }
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `checkMissingAwait` | boolean | `true` | Detect calls to known async functions without `await` |
| `checkUnnecessaryAsync` | boolean | `true` | Detect `async` functions that never use `await` |
| `checkFloatingPromises` | boolean | `true` | Detect unawaited async calls with no error handling |
| `checkAwaitNonPromise` | boolean | `true` | Detect `await` on literal or non-Promise values |
| `checkMixedPatterns` | boolean | `true` | Detect mixing of `await` with `.then()` or callbacks |
| `ignorePatterns` | string[] | See below | Function name patterns to exclude from analysis |

Default ignore patterns:

```
^_              — Private/internal functions
^main$          — Entry points
^bootstrap$     — Bootstrap functions
Middleware$     — Middleware (async by convention)
Handler$        — Event handlers
Controller$     — Controllers
```

---

## Real-World Scenarios

### Scenario 1: E-Commerce Order Pipeline

An AI agent generates an order processing function. It correctly fetches the order
but forgets to await the audit log and notification calls. Under low traffic, this
appears to work because the promises resolve before the next request. Under load,
audit records are lost, and notifications arrive out of order or fail silently.

**Camouf output:**

```
order-service.ts(15,3): warning async-discrepancies: Async function 'saveAuditLog()' called without 'await', '.then()', or error handling — floating promise
  Suggestion: Add 'await' before 'saveAuditLog()' to properly handle its result and errors.
```

### Scenario 2: Database Transaction

An AI agent wraps a database transaction in an async function but performs
all operations synchronously because it misidentified the ORM methods as
synchronous getters.

```typescript
async function transferFunds(from: string, to: string, amount: number) {
  const sender = db.findUser(from);      // Actually returns Promise<User>
  const recipient = db.findUser(to);     // Actually returns Promise<User>

  sender.balance -= amount;              // Operating on Promise object
  recipient.balance += amount;           // Operating on Promise object

  db.save(sender);                       // Floating promise
  db.save(recipient);                    // Floating promise
}
```

Camouf flags both the missing `await` on `findUser` (if declared async in the project)
and the floating promises on `save`.

### Scenario 3: Middleware Chain

An AI agent adds authentication middleware that calls an async token verification
function without `await`. The middleware returns before verification completes,
allowing unauthenticated requests through.

```typescript
async function authMiddleware(req: Request, res: Response, next: Function) {
  const token = req.headers.authorization;
  const isValid = verifyToken(token);    // Missing await — isValid is a Promise (truthy)
  if (!isValid) {
    return res.status(401).json({ error: 'Unauthorized' });  // Never reached
  }
  next();
}
```

---

## Using Camouf with Complementary Tools

Camouf is designed to integrate into existing toolchains rather than replace them. The
following tools address related but distinct aspects of code quality. Using them
together with Camouf provides layered coverage that no single tool achieves alone.

### Static Analysis and Linting

**[ESLint](https://eslint.org/) with [@typescript-eslint](https://typescript-eslint.io/)**

ESLint handles single-file style enforcement and has the `@typescript-eslint/no-floating-promises`
rule, which performs type-aware floating promise detection within individual files. Camouf
complements this by providing cross-file analysis: it tracks which functions are declared
async across the entire project and flags calls that miss `await` even when the declaration
is in a different module.

Recommended combined configuration:

```json
// eslint.config.js
{
  "rules": {
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/require-await": "warn"
  }
}
```

```json
// camouf.config.json
{
  "rules": {
    "builtin": {
      "async-discrepancies": "error"
    }
  }
}
```

ESLint catches intra-file promise misuse; Camouf catches inter-file async contract drift.

**[Biome](https://biomejs.dev/)**

Biome is a fast Rust-based linter and formatter that includes rules for suspicious patterns.
Its `noFloatingPromises` diagnostic operates at the expression level. Combined with Camouf's
project-wide async tracking, the two tools cover both local and global async correctness.

### Type-Level Safety

**[ts-expect-error and strict mode](https://www.typescriptlang.org/tsconfig#strict)**

Enabling `strict: true` in `tsconfig.json` activates `strictNullChecks` and
`noImplicitAny`, which surface some async misuse at the type level. While TypeScript
alone does not require `await`, strict mode narrows the cases where unawaited Promises
go unnoticed (e.g., assigning `Promise<User>` to a variable typed as `User`).

### Runtime and Testing

**[eslint-plugin-promise](https://github.com/eslint-community/eslint-plugin-promise)**

This ESLint plugin provides rules specifically for Promise best practices:
`no-return-in-finally`, `valid-params`, `no-nesting`, and `catch-or-return`. It operates
at the expression level and pairs well with Camouf's higher-level cross-file analysis.

**[Vitest](https://vitest.dev/) / [Jest](https://jestjs.io/) with async-aware assertions**

Testing frameworks can catch async bugs at runtime, but only for covered code paths.
Camouf's static analysis catches async discrepancies in code that tests may not exercise,
particularly in error-handling branches and rarely executed middleware.

### AI Agent Integration

**[Claude Code](https://docs.anthropic.com/en/docs/claude-code) / [Cursor](https://cursor.sh/) / [GitHub Copilot](https://github.com/features/copilot)**

Camouf's MCP server enables AI agents to validate their own async code before proposing
it. When an agent generates a function call, the validate-fix-revalidate loop
(documented in the [MCP Agent Tutorial](mcp-agent-tutorial.md)) ensures that async
discrepancies are caught and corrected within the agent's own workflow.

### Recommended Toolchain

| Layer | Tool | Coverage |
|-------|------|----------|
| **Formatting** | Prettier or Biome | Code style consistency |
| **Single-file lint** | ESLint + @typescript-eslint | Local promise misuse, require-await |
| **Promise best practices** | eslint-plugin-promise | Promise chain correctness |
| **Cross-file async analysis** | Camouf `async-discrepancies` | AI-generated async contract drift |
| **Cross-file naming** | Camouf `function-signature-matching` | Function/field name drift |
| **Architecture** | Camouf (layer, circular, DDD rules) | Structural integrity |
| **Runtime verification** | Vitest / Jest | Behavioral correctness for covered paths |
| **Type safety** | TypeScript strict mode | Compile-time type narrowing |

---

## CI/CD Integration

Add the `async-discrepancies` rule to your CI pipeline to prevent async bugs from
reaching production:

```yaml
# GitHub Actions
- name: Check async discrepancies
  run: npx camouf validate --rules async-discrepancies --ci
```

For maximum coverage, run all Camouf rules including async-discrepancies:

```yaml
- name: Architecture and async validation
  run: npx camouf validate --ci --format sarif
```

The SARIF output integrates with GitHub's Code Scanning alerts, surfacing async
violations directly in pull request reviews.

---

## Best Practices

1. **Enable `async-discrepancies` at `"error"` level in CI.** Warnings are appropriate
   during local development; errors prevent async bugs from merging.

2. **Combine with `@typescript-eslint/no-floating-promises`.** Camouf detects cross-file
   drift; ESLint detects intra-file misuse. Together they cover the full spectrum.

3. **Enable `strict: true` in tsconfig.json.** Strict null checks make it harder for
   unawaited Promises to pass through type-checked code unnoticed.

4. **Use the MCP server for real-time agent validation.** When AI agents validate their
   own output through Camouf's MCP tools, async discrepancies are caught before code
   is even proposed to the developer.

5. **Review the `ignorePatterns` configuration.** If your project uses naming conventions
   for async functions (e.g., `Async` suffix), adjust the ignore patterns to reduce
   false positives.

6. **Run `camouf validate` in watch mode during development.** Real-time feedback
   catches async issues the moment they are introduced:
   ```bash
   npx camouf watch --format vscode
   ```

---

## Further Reading

- [Configuring Rules](configuring-rules.md) -- Full reference for all rule configuration options
- [AI Agent Challenges](ai-agent-challenges.md) -- Understanding AI context loss patterns
- [MCP Agent Tutorial](mcp-agent-tutorial.md) -- Setting up the validate-fix-revalidate loop
- [CI/CD Integration](ci-cd-integration.md) -- Pipeline configuration for all Camouf rules
- [Creating Plugins](creating-plugins.md) -- Extending Camouf with custom async rules
