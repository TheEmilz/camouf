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

### 1. Create Package Structure

```
camouf-plugin-myframework/
├── package.json
├── src/
│   ├── index.ts
│   └── rules/
│       └── my-rule.ts
├── tsconfig.json
└── README.md
```

### 2. Define Package.json

```json
{
  "name": "camouf-plugin-myframework",
  "version": "1.0.0",
  "description": "Camouf plugin for MyFramework",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "keywords": ["camouf", "camouf-plugin", "architecture", "myframework"],
  "peerDependencies": {
    "camouf": "^1.0.0"
  },
  "devDependencies": {
    "camouf": "^1.0.0",
    "typescript": "^5.0.0"
  }
}
```

### 3. Implement the Plugin

```typescript
// src/index.ts
import { CamoufPlugin } from 'camouf';
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
import { IRule, RuleContext, RuleResult, BaseRule } from 'camouf';

export class NoGlobalStateRule extends BaseRule {
  readonly id = 'no-global-state';
  readonly name = 'No Global State';
  readonly description = 'Prevents global state in components';
  readonly category = 'best-practices';
  readonly defaultSeverity = 'error';

  async check(context: RuleContext): Promise<RuleResult> {
    const violations = [];
    
    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;
      
      // Check for global state patterns
      const content = context.fileContents?.get(node.path);
      if (content?.includes('window.globalState')) {
        violations.push(this.createViolation(
          node.path,
          'Global state detected. Use context or state management instead.',
          { suggestion: 'Replace with React Context or Redux' }
        ));
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

```typescript
import { describe, it, expect } from 'vitest';
import { RuleEngine } from 'camouf';
import myPlugin from '../src/index.js';

describe('my-plugin', () => {
  it('should detect violations', async () => {
    const config = {
      root: './test-fixtures',
      plugins: [myPlugin],
      // ... other config
    };
    
    const engine = new RuleEngine(config);
    await engine.initializePlugins('./test-fixtures');
    
    const violations = await engine.validate(graph);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe('my-rule');
  });
});
```

## Publishing

1. **Naming**: Use the `camouf-plugin-*` prefix for npm discoverability
2. **Keywords**: Include `camouf`, `camouf-plugin` in package.json keywords
3. **Peer Dependencies**: Declare `camouf` as a peer dependency
4. **Types**: Export TypeScript declarations for rule configuration

```json
{
  "keywords": ["camouf", "camouf-plugin", "architecture", "linting"],
  "peerDependencies": {
    "camouf": ">=1.0.0"
  }
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
