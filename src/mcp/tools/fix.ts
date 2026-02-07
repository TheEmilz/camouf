/**
 * MCP Tool: camouf_suggest_fix
 * 
 * Suggests fixes for architecture violations.
 * 
 * This tool helps AI correct violations it detected, providing
 * specific code changes and explanations.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Tool definition for MCP
 */
export const definition: Tool = {
  name: 'camouf_suggest_fix',
  description: `Get fix suggestions for architecture violations. Given a violation from camouf_validate,
this tool provides:
- Specific code changes to fix the issue
- Alternative approaches
- Explanation of why the fix works
- Prevention tips for the future`,
  inputSchema: {
    type: 'object',
    properties: {
      violation: {
        type: 'object',
        description: 'The violation object from camouf_validate',
        properties: {
          ruleId: { type: 'string' },
          message: { type: 'string' },
          line: { type: 'number' },
          suggestion: { type: 'string' },
        },
        required: ['ruleId', 'message'],
      },
      code: {
        type: 'string',
        description: 'The original code with the violation',
      },
      context: {
        type: 'string',
        description: 'Additional context about the codebase or requirements',
      },
    },
    required: ['violation'],
  },
};

/**
 * Fix suggestion structure
 */
interface FixSuggestion {
  ruleId: string;
  fixType: 'code_change' | 'refactor' | 'configuration' | 'manual_review';
  priority: 'high' | 'medium' | 'low';
  fix: {
    description: string;
    before?: string;
    after?: string;
    steps?: string[];
  };
  alternatives?: Array<{
    description: string;
    code?: string;
  }>;
  explanation: string;
  prevention: string;
}

/**
 * Handler for camouf_suggest_fix tool
 */
export async function handler(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  const violation = args.violation as {
    ruleId: string;
    message: string;
    line?: number;
    suggestion?: string;
  };
  const code = args.code as string | undefined;
  const context = args.context as string | undefined;

  try {
    const suggestion = generateFixSuggestion(violation, code, context);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(suggestion, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: message,
            ruleId: violation.ruleId,
          }),
        },
      ],
    };
  }
}

/**
 * Generate fix suggestion based on violation type
 */
function generateFixSuggestion(
  violation: { ruleId: string; message: string; line?: number; suggestion?: string },
  code?: string,
  _context?: string
): FixSuggestion {
  // Get rule-specific fix
  const ruleFix = getRuleSpecificFix(violation.ruleId);
  
  return {
    ruleId: violation.ruleId,
    fixType: ruleFix.fixType,
    priority: ruleFix.priority,
    fix: {
      description: violation.suggestion || ruleFix.defaultDescription,
      before: code ? extractRelevantCode(code, violation.line) : undefined,
      after: generateFixedCode(violation.ruleId, code, violation.line),
      steps: ruleFix.steps,
    },
    alternatives: ruleFix.alternatives,
    explanation: ruleFix.explanation,
    prevention: ruleFix.prevention,
  };
}

/**
 * Get rule-specific fix information
 */
function getRuleSpecificFix(ruleId: string): {
  fixType: FixSuggestion['fixType'];
  priority: FixSuggestion['priority'];
  defaultDescription: string;
  steps: string[];
  alternatives?: FixSuggestion['alternatives'];
  explanation: string;
  prevention: string;
} {
  const fixes: Record<string, ReturnType<typeof getRuleSpecificFix>> = {
    'ai-hallucinated-imports': {
      fixType: 'code_change',
      priority: 'high',
      defaultDescription: 'Fix or remove the invalid import',
      steps: [
        'Check if the module exists with a different name/path',
        'If using path aliases, verify tsconfig.json paths',
        'If module does not exist, either create it or remove the import',
        'If using npm package, verify the correct import path in docs',
      ],
      alternatives: [
        { description: 'Create the missing module if it was intended' },
        { description: 'Use an existing similar module instead' },
      ],
      explanation: 'AI sometimes generates imports for modules that do not exist, often by hallucinating API structures from similar libraries or imagining helper files.',
      prevention: 'Before generating imports, verify the module exists. When creating new modules, create the file first.',
    },

    'context-drift-patterns': {
      fixType: 'refactor',
      priority: 'medium',
      defaultDescription: 'Unify the naming across the codebase',
      steps: [
        'Identify the canonical name for the concept',
        'Rename the inconsistent entity to match',
        'Update all references',
        'Consider creating a type alias if both names are needed',
      ],
      alternatives: [
        { description: 'Add a type alias: type User = Customer' },
        { description: 'Create a mapper if the types are intentionally different' },
      ],
      explanation: 'Context drift occurs when AI loses track of established naming and introduces different names for the same concepts.',
      prevention: 'When generating new code, first query existing types with similar purpose. Reuse established naming.',
    },

    'phantom-type-references': {
      fixType: 'code_change',
      priority: 'high',
      defaultDescription: 'Replace the phantom type with the correct existing type',
      steps: [
        'Find the actual type name in the codebase',
        'Replace the phantom reference',
        'Update any dependent code that used the wrong type',
      ],
      explanation: 'AI may reference types that were renamed, deleted, or never existed. This causes TypeScript compilation errors.',
      prevention: 'Always verify type existence before using. When types might have changed, check current definitions.',
    },

    'inconsistent-casing': {
      fixType: 'code_change',
      priority: 'low',
      defaultDescription: 'Rename to match the dominant naming convention',
      steps: [
        'Identify the codebase naming convention (camelCase, snake_case, etc.)',
        'Rename the identifier to match',
        'Update all references',
      ],
      explanation: 'AI may switch naming conventions based on its training data, creating inconsistent code style.',
      prevention: 'Follow the dominant naming style visible in surrounding code. When unsure, prefer camelCase for JS/TS.',
    },

    'orphaned-functions': {
      fixType: 'manual_review',
      priority: 'low',
      defaultDescription: 'Determine if the function should be called or removed',
      steps: [
        'Check if the function was meant to be exported',
        'Check if there are missing call sites',
        'If truly unused, remove the function',
      ],
      alternatives: [
        { description: 'Export the function if it is part of the public API' },
        { description: 'Add the missing call site' },
        { description: 'Remove the dead code' },
      ],
      explanation: 'AI sometimes generates helper functions that were never integrated into the main code flow.',
      prevention: 'When generating helper functions, immediately add the call site. Do not generate speculative helpers.',
    },

    'circular-dependencies': {
      fixType: 'refactor',
      priority: 'high',
      defaultDescription: 'Break the circular dependency',
      steps: [
        'Identify shared code that both modules need',
        'Extract shared code to a third module',
        'Have both modules import from the shared module',
        'Alternatively, use dependency injection',
      ],
      alternatives: [
        { description: 'Move shared types to a types.ts file' },
        { description: 'Use lazy imports (import inside function)' },
        { description: 'Restructure module boundaries' },
      ],
      explanation: 'Circular dependencies create initialization order issues and make code harder to maintain.',
      prevention: 'Design module boundaries carefully. Higher-level modules import from lower-level, not vice versa.',
    },

    'hardcoded-secrets': {
      fixType: 'code_change',
      priority: 'high',
      defaultDescription: 'Move secrets to environment variables',
      steps: [
        'Remove the hardcoded secret from code immediately',
        'Add the secret to .env file',
        'Use process.env.SECRET_NAME in code',
        'Add .env to .gitignore',
        'Consider if the secret was already exposed (rotate it)',
      ],
      explanation: 'Hardcoded secrets get committed to version control and can be extracted by attackers.',
      prevention: 'Never generate hardcoded secrets. Always use environment variables or secret management services.',
    },

    'layer-dependencies': {
      fixType: 'refactor',
      priority: 'medium',
      defaultDescription: 'Fix the layer violation',
      steps: [
        'Identify which layer is being violated',
        'Move the import to respect layer boundaries',
        'Consider using interfaces for cross-layer communication',
        'Use dependency injection if needed',
      ],
      explanation: 'Layer architecture violations lead to tight coupling and make code harder to test and maintain.',
      prevention: 'Understand the layer architecture before generating imports. Controllers should not import from DB directly.',
    },
  };

  return fixes[ruleId] || {
    fixType: 'manual_review',
    priority: 'medium',
    defaultDescription: 'Review and fix the violation',
    steps: ['Review the violation message', 'Apply the suggested fix', 'Test the change'],
    explanation: 'This violation needs manual review to determine the best fix.',
    prevention: 'Validate generated code against architecture rules before proposing.',
  };
}

/**
 * Extract relevant code around the violation line
 */
function extractRelevantCode(code: string, line?: number): string | undefined {
  if (!line) return undefined;

  const lines = code.split('\n');
  const start = Math.max(0, line - 3);
  const end = Math.min(lines.length, line + 2);

  return lines.slice(start, end).join('\n');
}

/**
 * Generate fixed code (placeholder - actual fixes would be rule-specific)
 */
function generateFixedCode(_ruleId: string, _code?: string, _line?: number): string | undefined {
  // In a full implementation, this would generate actual fixed code
  // For now, return undefined to indicate manual fix needed
  return undefined;
}

/**
 * Export tool for use in MCP server
 */
export const suggestFixTool = {
  definition,
  handler,
};
