/**
 * Camouf Testing Utilities
 * 
 * Helpers for plugin authors to test their rules without a real project.
 * 
 * @example
 * ```typescript
 * import { createRuleTestContext } from 'camouf/testing';
 * 
 * const context = createRuleTestContext({
 *   files: {
 *     'shared/types.ts': 'export interface User { id: string; name: string; }',
 *     'client/api.ts': 'import { User } from "../shared/types"; function getUsers(): Usr[] {}',
 *   },
 *   config: {
 *     rules: { builtin: { 'function-signature-matching': 'error' } },
 *   },
 * });
 * 
 * const result = await myRule.check(context);
 * expect(result.violations).toHaveLength(1);
 * ```
 */

import { Graph } from 'graphlib';
import type { CamoufConfig } from '../types/config.types.js';
import type { GraphNode, GraphEdge, ProjectFile } from '../types/core.types.js';
import type { RuleContext } from '../core/rules/rule.interface.js';
import type { DependencyGraph } from '../core/scanner/project-scanner.js';

/**
 * Input options for creating a test rule context
 */
export interface TestContextOptions {
  /** Map of relative file paths to their contents */
  files: Record<string, string>;

  /** Partial config — merged with sensible defaults */
  config?: Partial<CamoufConfig>;

  /** Optional focus file for incremental checks */
  focusFile?: string;

  /** Optional explicit edges to add to the graph (source → target) */
  edges?: Array<{ source: string; target: string; line?: number }>;
}

/**
 * Infer language from file extension
 */
function inferLanguage(filePath: string): CamoufConfig['languages'][number] {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'py':
      return 'python';
    case 'java':
      return 'java';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    default:
      return 'typescript';
  }
}

/**
 * Extract imports from file content (simple regex-based for testing)
 */
function extractImports(filePath: string, content: string): Array<{ target: string; line: number }> {
  const imports: Array<{ target: string; line: number }> = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    // ES import: import ... from '...'
    const esMatch = lines[i].match(/(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/);
    if (esMatch) {
      imports.push({ target: resolveRelative(filePath, esMatch[1]), line: i + 1 });
      continue;
    }

    // require: require('...')
    const reqMatch = lines[i].match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (reqMatch) {
      imports.push({ target: resolveRelative(filePath, reqMatch[1]), line: i + 1 });
    }
  }

  return imports;
}

/**
 * Resolve a relative import path against the source file
 */
function resolveRelative(sourceFile: string, importPath: string): string {
  if (!importPath.startsWith('.')) {
    return importPath; // external package
  }

  const sourceDir = sourceFile.includes('/')
    ? sourceFile.substring(0, sourceFile.lastIndexOf('/'))
    : '';

  const parts = sourceDir ? sourceDir.split('/') : [];
  const importParts = importPath.split('/');

  for (const part of importParts) {
    if (part === '..') {
      parts.pop();
    } else if (part !== '.') {
      parts.push(part);
    }
  }

  const resolved = parts.join('/');

  // Try to match against known file extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs'];
  for (const ext of extensions) {
    if (resolved.endsWith(ext)) return resolved;
  }

  // No extension — return as-is (rules will match by prefix)
  return resolved;
}

/**
 * Infer which layer a file belongs to based on its path
 */
function inferLayer(filePath: string, config: CamoufConfig): string | undefined {
  for (const layer of config.layers) {
    for (const dir of layer.directories) {
      if (filePath.startsWith(dir + '/') || filePath.startsWith(dir + '\\')) {
        return layer.name;
      }
    }
  }

  // Fallback: directory-based inference
  const dirs = config.directories;
  const firstDir = filePath.split('/')[0];
  if (dirs.client.includes(firstDir)) return 'client';
  if (dirs.server.includes(firstDir)) return 'server';
  if (dirs.shared.includes(firstDir)) return 'shared';

  return undefined;
}

/**
 * Build a default CamoufConfig, merged with user overrides
 */
function buildConfig(partial?: Partial<CamoufConfig>): CamoufConfig {
  const defaults: CamoufConfig = {
    name: 'test-project',
    root: '.',
    languages: ['typescript'],
    layers: [
      {
        name: 'presentation',
        type: 'presentation',
        directories: ['client', 'pages', 'components'],
        allowedDependencies: ['application', 'shared'],
      },
      {
        name: 'application',
        type: 'application',
        directories: ['server', 'api', 'services'],
        allowedDependencies: ['domain', 'infrastructure', 'shared'],
      },
      {
        name: 'domain',
        type: 'domain',
        directories: ['domain', 'models'],
        allowedDependencies: ['shared'],
      },
      {
        name: 'shared',
        type: 'shared',
        directories: ['shared', 'common', 'utils'],
        allowedDependencies: [],
      },
    ],
    directories: {
      client: ['client', 'pages', 'components'],
      server: ['server', 'api', 'services'],
      shared: ['shared', 'common', 'utils'],
    },
    rules: {
      builtin: {},
    },
    patterns: {
      include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      exclude: ['node_modules/**', 'dist/**'],
    },
  };

  if (!partial) return defaults;

  // Deep merge: config overrides defaults
  return {
    ...defaults,
    ...partial,
    languages: partial.languages ?? defaults.languages,
    layers: partial.layers ?? defaults.layers,
    directories: partial.directories
      ? { ...defaults.directories, ...partial.directories }
      : defaults.directories,
    rules: partial.rules
      ? {
          ...defaults.rules,
          ...partial.rules,
          builtin: { ...defaults.rules.builtin, ...partial.rules?.builtin },
        }
      : defaults.rules,
    patterns: partial.patterns
      ? { ...defaults.patterns, ...partial.patterns }
      : defaults.patterns,
  } as CamoufConfig;
}

/**
 * Create a RuleContext for testing rules without a real project on disk.
 * 
 * Builds a graphlib-based dependency graph from the provided file map,
 * auto-discovers import relationships, and wires up all RuleContext methods.
 */
export function createRuleTestContext(options: TestContextOptions): RuleContext {
  const { files, focusFile, edges: explicitEdges } = options;
  const config = buildConfig(options.config);

  // Build the graph
  const graph = new Graph({
    directed: true,
    compound: false,
    multigraph: false,
  }) as unknown as DependencyGraph;

  const fileContents = new Map<string, string>();

  // Add nodes for each file
  for (const [filePath, content] of Object.entries(files)) {
    fileContents.set(filePath, content);

    const language = inferLanguage(filePath);
    const ext = filePath.split('.').pop() || '';
    const layer = inferLayer(filePath, config);

    const projectFile: ProjectFile = {
      path: filePath,
      relativePath: filePath,
      language,
      extension: `.${ext}`,
      layer,
      lastModified: Date.now(),
      size: content.length,
    };

    const nodeData: GraphNode = {
      id: filePath,
      data: projectFile,
    };

    graph.setNode(filePath, nodeData);
  }

  // Auto-discover edges from import statements
  for (const [filePath, content] of Object.entries(files)) {
    const imports = extractImports(filePath, content);
    for (const imp of imports) {
      // Try to find the target node — with or without extension
      let targetNode: string | undefined;

      if (graph.hasNode(imp.target)) {
        targetNode = imp.target;
      } else {
        // Try adding common extensions
        const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
        for (const ext of extensions) {
          if (graph.hasNode(imp.target + ext)) {
            targetNode = imp.target + ext;
            break;
          }
        }
      }

      if (targetNode) {
        const edgeData: GraphEdge = {
          source: filePath,
          target: targetNode,
          data: {
            source: filePath,
            target: targetNode,
            type: 'import',
            line: imp.line,
          },
        };
        graph.setEdge(filePath, targetNode, edgeData);
      }
    }
  }

  // Add explicit edges (if provided)
  if (explicitEdges) {
    for (const edge of explicitEdges) {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        const edgeData: GraphEdge = {
          source: edge.source,
          target: edge.target,
          data: {
            source: edge.source,
            target: edge.target,
            type: 'import',
            line: edge.line,
          },
        };
        graph.setEdge(edge.source, edge.target, edgeData);
      }
    }
  }

  // Build the RuleContext
  const context: RuleContext = {
    config,
    graph,
    focusFile,
    fileContents,

    getNodeData(id: string): GraphNode | undefined {
      return graph.node(id);
    },

    getEdgeData(source: string, target: string): GraphEdge | undefined {
      return graph.edge(source, target);
    },

    getIncomingEdges(id: string): Array<{ v: string; w: string }> {
      return graph.inEdges(id) ?? [];
    },

    getOutgoingEdges(id: string): Array<{ v: string; w: string }> {
      return graph.outEdges(id) ?? [];
    },
  };

  return context;
}
