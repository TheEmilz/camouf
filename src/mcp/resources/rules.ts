/**
 * MCP Resource: camouf://rules
 * 
 * Exposes available Camouf rules as an MCP resource.
 * 
 * This allows AI agents to discover what rules are available
 * and understand what each rule checks for.
 */

import { Resource } from '@modelcontextprotocol/sdk/types.js';

/**
 * Resource definition for MCP
 */
export const definition: Resource = {
  uri: 'camouf://rules',
  name: 'Camouf Rules',
  description: 'List of all available Camouf architecture rules',
  mimeType: 'application/json',
};

/**
 * Rule documentation structure
 */
interface RuleDoc {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: string;
  tags: string[];
  aiRelevance: string;
  examples?: {
    bad: string;
    good: string;
    explanation: string;
  };
}

/**
 * Handler for reading the rules resource
 */
export async function handler(): Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}> {
  const rules = getAllRuleDocs();

  return {
    contents: [
      {
        uri: 'camouf://rules',
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            count: rules.length,
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
 * Get documentation for all rules
 */
function getAllRuleDocs(): RuleDoc[] {
  return [
    // AI-Specific Rules
    {
      id: 'ai-hallucinated-imports',
      name: 'AI Hallucinated Imports',
      description: 'Detects imports of modules that do not exist in the project or npm registry',
      category: 'ai-specific',
      severity: 'error',
      tags: ['ai-safety', 'imports', 'hallucination'],
      aiRelevance: 'CRITICAL - AI frequently generates imports for non-existent modules',
      examples: {
        bad: `import { validateUser } from '@/utils/auth-helpers'; // File doesn't exist`,
        good: `import { validateUser } from '@/utils/auth'; // Actual file path`,
        explanation: 'Verify file existence before importing. Check path aliases in tsconfig.json.',
      },
    },
    {
      id: 'context-drift-patterns',
      name: 'Context Drift Patterns',
      description: 'Detects when the same concept is named differently across the codebase',
      category: 'ai-specific',
      severity: 'warning',
      tags: ['ai-safety', 'naming', 'consistency'],
      aiRelevance: 'HIGH - AI loses context and creates naming inconsistencies',
      examples: {
        bad: `// File 1: User { userId: string }
// File 2: Customer { id: string } // Same concept, different name`,
        good: `// Consistent: User { userId: string } throughout`,
        explanation: 'Use consistent naming for the same domain concepts across the codebase.',
      },
    },
    {
      id: 'phantom-type-references',
      name: 'Phantom Type References',
      description: 'Detects references to types that do not exist or were renamed',
      category: 'ai-specific',
      severity: 'error',
      tags: ['ai-safety', 'types', 'typescript'],
      aiRelevance: 'HIGH - AI may reference old type names from its training data',
      examples: {
        bad: `function process(order: OrderDTO) {} // OrderDTO doesn't exist`,
        good: `function process(order: Order) {} // Order is the actual type`,
        explanation: 'Always verify type exists before using. Check for similar type names.',
      },
    },
    {
      id: 'inconsistent-casing',
      name: 'Inconsistent Casing',
      description: 'Detects mixing of naming conventions (camelCase, snake_case) in the same codebase',
      category: 'naming',
      severity: 'warning',
      tags: ['ai-safety', 'naming', 'style'],
      aiRelevance: 'MEDIUM - AI switches naming conventions based on training data',
      examples: {
        bad: `getUserById()
get_user_by_id() // Mixed conventions in same file`,
        good: `getUserById()
getUserByEmail() // Consistent camelCase`,
        explanation: 'Follow the dominant naming convention in the codebase.',
      },
    },
    {
      id: 'orphaned-functions',
      name: 'Orphaned Functions',
      description: 'Detects functions that are declared but never called',
      category: 'ai-specific',
      severity: 'warning',
      tags: ['ai-safety', 'dead-code', 'cleanup'],
      aiRelevance: 'MEDIUM - AI sometimes generates helpers it never uses',
      examples: {
        bad: `function validateEmail(email: string) { ... } // Never called`,
        good: `// Either remove unused function or add the call site`,
        explanation: 'When creating helpers, immediately add the call site.',
      },
    },

    // Architecture Rules
    {
      id: 'layer-dependencies',
      name: 'Layer Dependencies',
      description: 'Enforces layer architecture (controllers should not import from data layer directly)',
      category: 'architecture',
      severity: 'error',
      tags: ['architecture', 'layers', 'clean-code'],
      aiRelevance: 'HIGH - AI may violate layer boundaries when generating quick solutions',
    },
    {
      id: 'circular-dependencies',
      name: 'Circular Dependencies',
      description: 'Detects circular import chains that cause initialization issues',
      category: 'architecture',
      severity: 'error',
      tags: ['architecture', 'dependencies', 'imports'],
      aiRelevance: 'HIGH - AI may create circular dependencies when not seeing full context',
    },
    {
      id: 'ddd-boundaries',
      name: 'DDD Boundaries',
      description: 'Enforces Domain-Driven Design aggregate boundaries',
      category: 'architecture',
      severity: 'warning',
      tags: ['architecture', 'ddd', 'aggregates'],
      aiRelevance: 'MEDIUM - AI may not understand domain boundaries',
    },

    // Contract Rules
    {
      id: 'contract-mismatch',
      name: 'Contract Mismatch',
      description: 'Detects when function implementations do not match their contracts',
      category: 'contracts',
      severity: 'error',
      tags: ['contracts', 'interfaces', 'types'],
      aiRelevance: 'HIGH - AI may change signatures without updating callers',
    },
    {
      id: 'function-signature-matching',
      name: 'Function Signature Matching',
      description: 'Ensures function calls match their declarations',
      category: 'contracts',
      severity: 'error',
      tags: ['contracts', 'functions', 'types'],
      aiRelevance: 'CRITICAL - AI may call functions with wrong argument types',
    },

    // Security Rules
    {
      id: 'hardcoded-secrets',
      name: 'Hardcoded Secrets',
      description: 'Detects API keys, passwords, and tokens hardcoded in source',
      category: 'security',
      severity: 'error',
      tags: ['security', 'secrets', 'credentials'],
      aiRelevance: 'HIGH - AI may generate placeholder secrets that get committed',
    },
    {
      id: 'security-context',
      name: 'Security Context',
      description: 'Validates security context propagation across service boundaries',
      category: 'security',
      severity: 'warning',
      tags: ['security', 'authentication', 'context'],
      aiRelevance: 'MEDIUM - AI may forget to propagate security context',
    },

    // Performance Rules
    {
      id: 'performance-antipatterns',
      name: 'Performance Anti-patterns',
      description: 'Detects common performance issues like N+1 queries',
      category: 'performance',
      severity: 'warning',
      tags: ['performance', 'optimization', 'queries'],
      aiRelevance: 'MEDIUM - AI may generate inefficient code patterns',
    },

    // Data Flow Rules
    {
      id: 'data-flow-integrity',
      name: 'Data Flow Integrity',
      description: 'Ensures data transformations maintain type safety',
      category: 'data-flow',
      severity: 'warning',
      tags: ['data-flow', 'types', 'transformations'],
      aiRelevance: 'MEDIUM - AI may lose type information in transformations',
    },
    {
      id: 'distributed-transactions',
      name: 'Distributed Transactions',
      description: 'Detects unsafe distributed transaction patterns',
      category: 'data-flow',
      severity: 'error',
      tags: ['distributed', 'transactions', 'consistency'],
      aiRelevance: 'LOW - AI rarely generates distributed transaction code',
    },

    // API Rules
    {
      id: 'api-versioning',
      name: 'API Versioning',
      description: 'Enforces API versioning best practices',
      category: 'api',
      severity: 'warning',
      tags: ['api', 'versioning', 'breaking-changes'],
      aiRelevance: 'LOW - AI follows existing patterns when visible',
    },
    {
      id: 'resilience-patterns',
      name: 'Resilience Patterns',
      description: 'Ensures external calls have proper error handling and retries',
      category: 'resilience',
      severity: 'warning',
      tags: ['resilience', 'error-handling', 'retries'],
      aiRelevance: 'MEDIUM - AI may skip error handling for brevity',
    },

    // Type Safety Rules
    {
      id: 'type-safety',
      name: 'Type Safety',
      description: 'Detects type coercion and unsafe any usage',
      category: 'types',
      severity: 'warning',
      tags: ['types', 'typescript', 'type-safety'],
      aiRelevance: 'HIGH - AI may use any to avoid type errors',
    },
  ];
}

/**
 * Export resource for use in MCP server
 */
export const rulesResource = {
  definition,
  handler,
};
