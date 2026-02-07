# Test Fixtures — AI Error Examples

This directory contains example files that demonstrate the types of errors Camouf's AI-specific rules catch.

## How to Run

```bash
cd test-fixtures/ai-errors
npx camouf validate
```

Expected output: **49 violations** across all 5 AI-specific rules.

## Files

| File | Rule Tested | What It Demonstrates |
|------|-------------|---------------------|
| `hallucinated-imports.ts` | `ai-hallucinated-imports` | Imports of non-existent files and modules |
| `user-service.ts` + `payment-handler.ts` | `context-drift-patterns` | Same concept (User) named differently across files |
| `phantom-types.ts` | `phantom-type-references` | References to types that don't exist (OrderDTO, PaymentRequest) |
| `inconsistent-casing.ts` | `inconsistent-casing` | Mixing camelCase and snake_case in the same file |
| `orphaned-functions.ts` | `orphaned-functions` | Functions that are declared but never called |

## Using as Documentation

These files serve as living documentation for how each rule works. If you want to understand what a specific rule catches, look at the corresponding test file.

### Example: Hallucinated Imports

```typescript
// AI generates imports that don't exist:
import { validateUser } from '@/utils/auth-helpers';  // ❌ File doesn't exist
import { helper } from './non-existent-file';           // ❌ No such file
import { process } from '../processors/data';           // ❌ Path hallucinated
```

### Example: Context Drift

```typescript
// user-service.ts
interface User { userId: string; ... }

// payment-handler.ts (AI loses context)
interface Customer { customerId: string; ... }  // ❌ Same concept, different name!
```

### Example: Inconsistent Casing

```typescript
function getUserById() { }      // camelCase
function get_user_settings() { } // ❌ snake_case in same file!
```

## Configuration

The `camouf.config.json` in `ai-errors/` enables only AI-specific rules for focused testing:

```json
{
  "rules": {
    "builtin": {
      "ai-hallucinated-imports": "error",
      "context-drift-patterns": "warn",
      "phantom-type-references": "warn",
      "inconsistent-casing": "warn",
      "orphaned-functions": "warn",
      "layer-dependencies": "off",
      ...
    }
  }
}
```
