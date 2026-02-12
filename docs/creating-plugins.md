# Creating Plugins for Camouf

This guide explains how to create plugins that extend Camouf with custom rules, analyzers, parsers, and quick-fixes.

## Plugin Architecture Overview

Camouf's plugin system is designed around a simple principle: **plugins export capabilities**, and the core engine integrates them automatically.

```
┌─────────────────────────────────────────────────────────────┐
│                      Camouf Core                            │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐     │
│  │ Rule Engine │  │  Analyzer   │  │ Report Generator │     │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘     │
│         │                │                   │              │
│         └────────────────┼───────────────────┘              │
│                          │                                  │
│                    Plugin Registry                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐       ┌─────▼────┐       ┌─────▼────┐
   │ React   │       │ Next.js  │       │ GraphQL  │
   │ Plugin  │       │ Plugin   │       │ Plugin   │
   └─────────┘       └──────────┘       └──────────┘
```

## Quick Start

The fastest way to create a plugin:

```bash
npx camouf init --plugin
```

This generates the complete structure with prompts for name, description, and first rule ID. Use `--yes` for defaults:

```bash
npx camouf init --plugin --yes
```

### Generated Structure

```
camouf-plugin-{name}/
├── package.json          # With peerDependency on camouf
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts          # Plugin entry with CamoufPlugin export
    └── rules/
        └── {rule-id}.ts  # Rule template implementing IRule
```

### Manual Setup

If you prefer to set up manually:

```json
{
  "name": "camouf-plugin-myframework",
  "version": "1.0.0",
  "description": "Camouf plugin for MyFramework",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "keywords": ["camouf", "camouf-plugin", "architecture", "myframework"],
  "peerDependencies": {
    "camouf": ">=0.7.0"
  },
  "devDependencies": {
    "camouf": "^0.7.1",
    "typescript": "^5.0.0"
  }
}
```

### 3. Implement the Plugin

```typescript
// src/index.ts
import type { CamoufPlugin } from 'camouf';
import { myRule } from './rules/my-rule.js';

const plugin: CamoufPlugin = {
  metadata: {
    name: 'camouf-plugin-myframework',
    version: '1.0.0',
    displayName: 'MyFramework Plugin',
    description: 'Architecture rules for MyFramework',
    types: ['rules'],
    keywords: ['myframework', 'architecture'],
  },
  rules: [myRule],
};

export default plugin;
```

## Plugin Types

### Rule Plugin

Adds custom architecture rules.

```typescript
import type { IRule, RuleContext, RuleResult } from 'camouf/rules';
import type { Violation } from 'camouf';

export class NoGlobalStateRule implements IRule {
  readonly id = 'no-global-state';
  readonly name = 'No Global State';
  readonly description = 'Prevents global state in components';
  readonly category = 'best-practices' as const;
  readonly severity = 'error' as const;

  async check(context: RuleContext): Promise<RuleResult> {
    const violations = [];
    
    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;
      
      const content = context.fileContents?.get(nodeId);
      if (content?.includes('window.globalState')) {
        violations.push({
          id: `global-state-${nodeId}`,
          ruleId: this.id,
          ruleName: this.name,
          severity: this.severity,
          message: 'Global state detected. Use context or state management instead.',
          file: nodeId,
          suggestion: 'Replace with React Context or Redux',
        });
      }
    }
    
    return { violations };
  }
}

export const noGlobalStateRule = new NoGlobalStateRule();
```

### Analyzer Plugin

Extends analysis capabilities beyond dependency graphs.

```typescript
import { PluginAnalyzer, AnalyzerContext, AnalyzerResult } from 'camouf';
import { parse } from 'yaml';

export const openApiAnalyzer: PluginAnalyzer = {
  id: 'openapi-analyzer',
  name: 'OpenAPI Schema Analyzer',
  description: 'Validates code against OpenAPI specifications',
  
  async analyze(context: AnalyzerContext): Promise<AnalyzerResult> {
    const schemaPath = context.options?.schemaPath as string;
    if (!schemaPath) {
      return { data: {}, violations: [] };
    }
    
    const schemaContent = await context.getFileContents(schemaPath);
    const schema = parse(schemaContent);
    
    // Analyze schema and find violations
    const endpoints = extractEndpoints(schema);
    const violations = validateEndpoints(endpoints, context.files);
    
    return {
      data: { endpoints, schema },
      violations,
    };
  }
};
```

### Parser Plugin

Adds support for custom file types.

```typescript
import { PluginParser, PluginParseResult } from 'camouf';

export const graphqlParser: PluginParser = {
  id: 'graphql-parser',
  name: 'GraphQL Parser',
  extensions: ['.graphql', '.gql'],
  
  async parse(filePath: string, contents: string): Promise<PluginParseResult> {
    // Parse GraphQL schema/queries
    const definitions = parseGraphQL(contents);
    
    return {
      exports: definitions.types.map(t => ({
        name: t.name,
        type: 'type',
        line: t.loc?.start.line,
      })),
      imports: definitions.fragments.map(f => ({
        source: f.typeCondition.name.value,
        symbols: [f.name.value],
        isDefault: false,
        isNamespace: false,
      })),
      metadata: {
        operations: definitions.operations,
        fragments: definitions.fragments,
      },
    };
  }
};
```

### Quick-fix Plugin

Provides automatic fixes for violations.

```typescript
import { QuickFix, QuickFixContext, QuickFixResult, RuleViolation } from 'camouf';

export const signatureQuickFix: QuickFix = {
  id: 'fix-signature-mismatch',
  title: 'Fix Function Signature',
  description: 'Corrects mismatched function signatures',
  appliesTo: ['function-signature-matching'],
  
  async apply(
    violation: RuleViolation,
    context: QuickFixContext
  ): Promise<QuickFixResult> {
    const content = await context.getFileContents(violation.file);
    
    // Extract expected and found names from violation
    const match = violation.message.match(/Expected "(\w+)" but found "(\w+)"/);
    if (!match) {
      return { success: false, modifiedFiles: [], error: 'Could not parse violation' };
    }
    
    const [, expected, found] = match;
    const fixed = content.replace(new RegExp(`\\b${found}\\b`, 'g'), expected);
    
    await context.writeFileContents(violation.file, fixed);
    
    return {
      success: true,
      modifiedFiles: [violation.file],
      message: `Renamed "${found}" to "${expected}"`,
    };
  }
};
```

### Output Formatter Plugin

Adds custom report formats.

```typescript
import { PluginOutputFormatter, RuleViolation } from 'camouf';

export const slackFormatter: PluginOutputFormatter = {
  id: 'slack',
  name: 'Slack Formatter',
  extension: 'json',
  
  format(violations: RuleViolation[], options?: Record<string, unknown>): string {
    const blocks = violations.map(v => ({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${v.severity.toUpperCase()}*: ${v.message}\n📁 \`${v.file}:${v.line}\``,
      },
    }));
    
    return JSON.stringify({
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `Camouf Report: ${violations.length} violations` },
        },
        ...blocks,
      ],
    }, null, 2);
  }
};
```

## Lifecycle Hooks

Plugins can implement lifecycle hooks for initialization and cleanup:

```typescript
const plugin: CamoufPlugin = {
  metadata: { /* ... */ },
  rules: [/* ... */],
  
  async onLoad(context) {
    context.log.info('Plugin loaded');
    // Initialize resources, validate config, etc.
    if (!context.config?.apiKey) {
      context.log.warn('No API key configured');
    }
  },
  
  async onUnload() {
    // Cleanup resources
  },
};
```

## Configuration

Plugins can receive configuration through the `options` field:

```json
{
  "plugins": [
    {
      "name": "camouf-plugin-graphql",
      "options": {
        "schemaPath": "./schema.graphql",
        "validateOperations": true,
        "maxQueryDepth": 5
      }
    }
  ]
}
```

Access in your plugin:

```typescript
async onLoad(context: PluginLoadContext) {
  const schemaPath = context.config?.schemaPath as string;
  const maxDepth = context.config?.maxQueryDepth as number ?? 10;
}
```

## Testing Plugins

Use `createRuleTestContext` to test rules without a real project on disk:

```typescript
import { describe, it, expect } from 'vitest';
import { createRuleTestContext } from 'camouf/testing';
import { NoGlobalStateRule } from '../src/rules/no-global-state.js';

describe('no-global-state', () => {
  const rule = new NoGlobalStateRule();

  it('should detect global state usage', async () => {
    const context = createRuleTestContext({
      files: {
        'client/app.ts': 'window.globalState = { user: null };',
        'client/clean.ts': 'const state = useContext(AppContext);',
      },
    });

    const result = await rule.check(context);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].file).toBe('client/app.ts');
  });

  it('should pass for clean code', async () => {
    const context = createRuleTestContext({
      files: {
        'client/app.ts': 'import { useStore } from "./store";',
      },
    });

    const result = await rule.check(context);
    expect(result.violations).toHaveLength(0);
  });

  it('supports config overrides', async () => {
    const context = createRuleTestContext({
      files: { 'src/main.ts': 'window.globalState = {}' },
      config: {
        name: 'test',
        rules: { builtin: { 'no-global-state': 'error' } },
      },
    });

    const result = await rule.check(context);
    expect(result.violations).toHaveLength(1);
  });
});
```

`createRuleTestContext` automatically:
- Builds a graphlib dependency graph from the file map
- Auto-discovers imports to create edges
- Infers language and layer from file paths
- Provides all `RuleContext` methods (`getNodeData`, `getEdgeData`, `getIncomingEdges`, `getOutgoingEdges`)
- Applies sensible config defaults (4 layers, TypeScript patterns)

## Publishing

1. **Naming**: Use the `camouf-plugin-*` prefix for npm discoverability
2. **Keywords**: Include `camouf`, `camouf-plugin` in package.json keywords
3. **Peer Dependencies**: Declare `camouf` as a peer dependency (`>=0.7.0`)
4. **Types**: Export TypeScript declarations for rule configuration

```json
{
  "keywords": ["camouf", "camouf-plugin", "architecture", "linting"],
  \"peerDependencies\": {\n    \"camouf\": \">=0.7.0\"\n  }", "oldString": "  \"peerDependencies\": {\n    \"camouf\": \">=1.0.0\"\n  }
}
```

## Best Practices

1. **Single Responsibility**: Each rule should check one specific thing
2. **Clear Messages**: Violation messages should explain what's wrong and how to fix it
3. **Performance**: Use `supportsIncremental: true` and implement `checkFile()` for faster watch mode
4. **Documentation**: Include examples of violations and fixes in rule documentation
5. **Configuration**: Make rules configurable with sensible defaults

## Example Plugins

- [camouf-plugin-react](https://github.com/example/camouf-plugin-react) — React component rules
- [camouf-plugin-nextjs](https://github.com/example/camouf-plugin-nextjs) — Next.js architecture rules
- [camouf-plugin-nestjs](https://github.com/example/camouf-plugin-nestjs) — NestJS module boundaries
