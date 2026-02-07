/**
 * MCP Tool: camouf_validate
 * 
 * Validates code against Camouf architecture rules.
 * 
 * This is the primary tool that AI agents use to check their generated
 * code for architecture violations before proposing it to the user.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ConfigurationManager } from '../../core/config/configuration-manager.js';
import { RuleEngine } from '../../core/rules/rule-engine.js';
import { DependencyGraph } from '../../core/scanner/project-scanner.js';
import { Violation } from '../../types/core.types.js';
import { SupportedLanguage, CamoufConfig } from '../../types/config.types.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Graph } from 'graphlib';

/**
 * Tool definition for MCP
 */
export const definition: Tool = {
  name: 'camouf_validate',
  description: `Validate code against architecture rules. Use this to check AI-generated code for:
- Hallucinated imports (modules that don't exist)
- Contract mismatches (function signatures that changed)
- Context drift (same concept named differently)
- Circular dependencies
- Security issues (hardcoded secrets, SQL injection)
- Performance anti-patterns

Returns a list of violations with suggestions for fixes.`,
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'The source code to validate',
      },
      filePath: {
        type: 'string',
        description: 'The path where this code would be saved (for context)',
      },
      rules: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of specific rule IDs to check. If omitted, all enabled rules run.',
      },
      projectRoot: {
        type: 'string',
        description: 'Optional project root directory for full context',
      },
    },
    required: ['code', 'filePath'],
  },
};

/**
 * Validate handler result
 */
interface ValidateResult {
  success: boolean;
  violations: Array<{
    ruleId: string;
    ruleName: string;
    severity: string;
    message: string;
    line?: number;
    column?: number;
    suggestion?: string;
  }>;
  summary: {
    totalViolations: number;
    errors: number;
    warnings: number;
    infos: number;
  };
}

/**
 * Handler for camouf_validate tool
 */
export async function handler(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  const code = args.code as string;
  const filePath = args.filePath as string;
  const rules = args.rules as string[] | undefined;
  const projectRoot = (args.projectRoot as string) || process.cwd();

  try {
    const result = await validateCode(code, filePath, projectRoot, rules);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
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
            success: false,
            error: message,
            violations: [],
            summary: { totalViolations: 0, errors: 0, warnings: 0, infos: 0 },
          }),
        },
      ],
    };
  }
}

/**
 * Validate code against rules
 */
async function validateCode(
  code: string,
  filePath: string,
  projectRoot: string,
  specificRules?: string[]
): Promise<ValidateResult> {
  // Load configuration
  const configManager = new ConfigurationManager();
  let config = await configManager.loadConfig(projectRoot);

  // Use default config if none found
  if (!config) {
    config = createDefaultConfig();
  }

  // Create a minimal dependency graph for single-file validation
  const graph = createMinimalGraph(filePath, code);

  // Create file contents map
  const fileContents = new Map<string, string>();
  fileContents.set(filePath, code);

  // Optionally load existing project files for context
  try {
    await loadProjectFiles(projectRoot, fileContents, filePath);
  } catch {
    // Ignore errors loading project files - single file validation works
  }

  // Initialize rule engine
  const ruleEngine = new RuleEngine(config);

  // Filter rules if specific ones requested
  if (specificRules && specificRules.length > 0) {
    ruleEngine.filterRules(specificRules);
  }
  
  // Run validation
  const violations = await ruleEngine.validate(graph, fileContents);

  // Summarize results
  const summary = {
    totalViolations: violations.length,
    errors: violations.filter((v: Violation) => v.severity === 'error').length,
    warnings: violations.filter((v: Violation) => v.severity === 'warning').length,
    infos: violations.filter((v: Violation) => v.severity === 'info').length,
  };

  return {
    success: summary.errors === 0,
    violations: violations.map((v: Violation) => ({
      ruleId: v.ruleId,
      ruleName: v.ruleName,
      severity: v.severity,
      message: v.message,
      line: v.line,
      column: v.column,
      suggestion: v.suggestion,
    })),
    summary,
  };
}

/**
 * Create a default config when no config file exists
 */
function createDefaultConfig(): CamoufConfig {
  return {
    name: 'camouf-mcp-validation',
    root: '.',
    languages: ['typescript', 'javascript'],
    layers: [],
    directories: {
      client: ['src/client', 'src/components', 'src/pages'],
      server: ['src/server', 'src/api'],
      shared: ['src/shared', 'src/common'],
    },
    rules: {
      builtin: {
        'ai-hallucinated-imports': 'error',
        'context-drift-patterns': 'warn',
        'phantom-type-references': 'warn',
        'inconsistent-casing': 'warn',
        'orphaned-functions': 'warn',
        'layer-dependencies': 'error',
        'circular-dependencies': 'warn',
        'contract-mismatch': 'error',
        'performance-antipatterns': 'warn',
        'type-safety': 'warn',
        'hardcoded-secrets': 'error',
        'security-context': 'warn',
      },
    },
    patterns: {
      include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    },
  };
}

/**
 * Create a minimal dependency graph for single-file validation
 */
function createMinimalGraph(filePath: string, code: string): DependencyGraph {
  const graph = new Graph({ directed: true }) as DependencyGraph;

  const nodeId = filePath;
  const ext = path.extname(filePath).toLowerCase();
  const now = Date.now();
  
  graph.setNode(nodeId, {
    id: nodeId,
    data: {
      path: path.resolve(filePath),
      relativePath: filePath,
      language: getLanguage(ext),
      extension: ext,
      lastModified: now,
      size: Buffer.byteLength(code, 'utf-8'),
    },
  });

  return graph;
}

/**
 * Load project files for context
 */
async function loadProjectFiles(
  projectRoot: string,
  fileContents: Map<string, string>,
  excludeFile: string
): Promise<void> {
  const extensions = ['.ts', '.tsx', '.js', '.jsx'];
  
  async function scanDir(dir: string, depth: number): Promise<void> {
    if (depth > 5) return; // Limit recursion

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(projectRoot, fullPath);

        // Skip node_modules, dist, etc.
        if (entry.name.startsWith('.') || 
            entry.name === 'node_modules' || 
            entry.name === 'dist' ||
            entry.name === 'build') {
          continue;
        }

        if (entry.isDirectory()) {
          await scanDir(fullPath, depth + 1);
        } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
          if (relativePath !== excludeFile && !fileContents.has(relativePath)) {
            try {
              const content = await fs.readFile(fullPath, 'utf-8');
              fileContents.set(relativePath, content);
            } catch {
              // Skip files that can't be read
            }
          }
        }
      }
    } catch {
      // Ignore directory access errors
    }
  }

  await scanDir(projectRoot, 0);
}

/**
 * Determine language from file extension
 */
function getLanguage(ext: string): SupportedLanguage {
  const languages: Record<string, SupportedLanguage> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.java': 'java',
    '.rs': 'rust',
  };
  return languages[ext] || 'typescript';
}

/**
 * Export tool for use in MCP server
 */
export const validateTool = {
  definition,
  handler,
};
