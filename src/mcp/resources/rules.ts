/**
 * MCP Resource: camouf://rules
 * 
 * Dynamically exposes available Camouf rules as an MCP resource.
 * Reads rules from RuleEngine at runtime, ensuring plugin rules
 * and config-disabled rules are correctly reflected.
 */

import { Resource } from '@modelcontextprotocol/sdk/types.js';
import { ConfigurationManager } from '../../core/config/configuration-manager.js';
import { RuleEngine } from '../../core/rules/rule-engine.js';
import { IRule } from '../../core/rules/rule.interface.js';
import { CamoufConfig } from '../../types/config.types.js';

/**
 * Resource definition for MCP
 */
export const definition: Resource = {
  uri: 'camouf://rules',
  name: 'Camouf Rules',
  description: 'List of all available Camouf architecture rules (dynamically generated from config and plugins)',
  mimeType: 'application/json',
};

/**
 * Rule documentation structure (generated from IRule at runtime)
 */
interface RuleDoc {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: string;
  tags: string[];
  enabled: boolean;
  source: 'builtin' | 'plugin';
}

/**
 * Handler for reading the rules resource — generates dynamically
 */
export async function handler(): Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}> {
  let rules: RuleDoc[];

  try {
    rules = await getDynamicRuleDocs();
  } catch {
    // Fallback to basic rule metadata if core fails
    rules = getFallbackRuleDocs();
  }

  return {
    contents: [
      {
        uri: 'camouf://rules',
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            count: rules.length,
            enabledCount: rules.filter(r => r.enabled).length,
            categories: [...new Set(rules.map(r => r.category))],
            rules,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Generate rule docs dynamically from RuleEngine
 */
async function getDynamicRuleDocs(): Promise<RuleDoc[]> {
  // Load config
  const configManager = new ConfigurationManager();
  let config = await configManager.loadConfig();

  if (!config) {
    config = createDefaultConfig();
  }

  // Initialize RuleEngine (loads builtins + plugins)
  const ruleEngine = new RuleEngine(config);

  const allRules = ruleEngine.getRules();
  const enabledRules = new Set(ruleEngine.getEnabledRules().map(r => r.id));

  return allRules.map((rule: IRule) => ({
    id: rule.id,
    name: rule.name,
    description: rule.description,
    category: rule.category || 'general',
    severity: rule.severity || 'warning',
    tags: rule.tags || [],
    enabled: enabledRules.has(rule.id),
    source: isBuiltinRule(rule.id) ? 'builtin' as const : 'plugin' as const,
  }));
}

/**
 * Check if a rule ID belongs to builtin rules
 */
function isBuiltinRule(ruleId: string): boolean {
  const builtinIds = new Set([
    'ai-hallucinated-imports',
    'context-drift-patterns',
    'phantom-type-references',
    'inconsistent-casing',
    'orphaned-functions',
    'layer-dependencies',
    'circular-dependencies',
    'contract-mismatch',
    'function-signature-matching',
    'hardcoded-secrets',
    'security-context',
    'performance-antipatterns',
    'ddd-boundaries',
    'type-safety',
    'api-versioning',
    'data-flow-integrity',
    'distributed-transactions',
    'resilience-patterns',
  ]);
  return builtinIds.has(ruleId);
}

/**
 * Fallback rule docs when core is not available
 */
function getFallbackRuleDocs(): RuleDoc[] {
  const fallbackRules = [
    { id: 'ai-hallucinated-imports', name: 'AI Hallucinated Imports', description: 'Detects imports of modules that do not exist', category: 'ai-specific' },
    { id: 'context-drift-patterns', name: 'Context Drift Patterns', description: 'Detects naming inconsistencies for same concepts', category: 'ai-specific' },
    { id: 'phantom-type-references', name: 'Phantom Type References', description: 'Detects references to types that do not exist', category: 'ai-specific' },
    { id: 'inconsistent-casing', name: 'Inconsistent Casing', description: 'Detects mixed naming conventions', category: 'naming' },
    { id: 'orphaned-functions', name: 'Orphaned Functions', description: 'Detects functions declared but never called', category: 'ai-specific' },
    { id: 'function-signature-matching', name: 'Function Signature Matching', description: 'Ensures function calls match their declarations', category: 'contracts' },
    { id: 'layer-dependencies', name: 'Layer Dependencies', description: 'Enforces layer architecture dependencies', category: 'architecture' },
    { id: 'circular-dependencies', name: 'Circular Dependencies', description: 'Detects circular import chains', category: 'architecture' },
    { id: 'contract-mismatch', name: 'Contract Mismatch', description: 'Detects contract inconsistencies between layers', category: 'contracts' },
    { id: 'hardcoded-secrets', name: 'Hardcoded Secrets', description: 'Detects API keys and secrets in source', category: 'security' },
    { id: 'security-context', name: 'Security Context', description: 'Validates security context propagation', category: 'security' },
    { id: 'performance-antipatterns', name: 'Performance Anti-patterns', description: 'Detects N+1 queries and similar issues', category: 'performance' },
    { id: 'ddd-boundaries', name: 'DDD Boundaries', description: 'Enforces DDD aggregate boundaries', category: 'architecture' },
    { id: 'type-safety', name: 'Type Safety', description: 'Detects unsafe type usage', category: 'types' },
    { id: 'api-versioning', name: 'API Versioning', description: 'Enforces API versioning best practices', category: 'api' },
    { id: 'data-flow-integrity', name: 'Data Flow Integrity', description: 'Ensures data transformations maintain type safety', category: 'data-flow' },
    { id: 'distributed-transactions', name: 'Distributed Transactions', description: 'Detects unsafe distributed transaction patterns', category: 'data-flow' },
    { id: 'resilience-patterns', name: 'Resilience Patterns', description: 'Ensures proper error handling and retries', category: 'resilience' },
  ];

  return fallbackRules.map(r => ({
    ...r,
    severity: 'warning',
    tags: [],
    enabled: true,
    source: 'builtin' as const,
  }));
}

/**
 * Create default config when no config file found
 */
function createDefaultConfig(): CamoufConfig {
  return {
    name: 'camouf-mcp',
    root: '.',
    languages: ['typescript', 'javascript'],
    layers: [],
    directories: {
      client: ['src/client', 'src/components', 'src/pages'],
      server: ['src/server', 'src/api'],
      shared: ['src/shared', 'src/common'],
    },
    rules: {
      builtin: {},
    },
    patterns: {
      include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      exclude: ['**/node_modules/**', '**/dist/**'],
    },
  };
}

/**
 * Export resource for use in MCP server
 */
export const rulesResource = {
  definition,
  handler,
};
