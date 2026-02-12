/**
 * MCP Tool: camouf_analyze
 * 
 * Analyzes code dependencies and architecture patterns using the Camouf core.
 * 
 * This tool helps AI understand the project structure before
 * generating new code, reducing the chance of violations.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ConfigurationManager } from '../../core/config/configuration-manager.js';
import { ProjectScanner } from '../../core/scanner/project-scanner.js';
import { DependencyAnalyzer } from '../../core/analyzer/dependency-analyzer.js';
import { CamoufConfig } from '../../types/config.types.js';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Tool definition for MCP
 */
export const definition: Tool = {
  name: 'camouf_analyze',
  description: `Analyze project architecture and dependencies. Use this to understand:
- Project structure and layers
- Existing types and interfaces
- Naming conventions in use
- Import patterns and module boundaries
- Potential integration points

This helps generate code that fits the existing architecture.`,
  inputSchema: {
    type: 'object',
    properties: {
      projectRoot: {
        type: 'string',
        description: 'Root directory of the project to analyze',
      },
      focus: {
        type: 'string',
        enum: ['dependencies', 'types', 'conventions', 'structure', 'all'],
        description: 'What aspect to focus on (default: all)',
      },
      path: {
        type: 'string',
        description: 'Optional specific path or pattern to analyze',
      },
    },
    required: ['projectRoot'],
  },
};

/**
 * Analysis result structure — enriched with core analysis data
 */
interface AnalysisResult {
  projectRoot: string;
  structure: {
    directories: string[];
    fileCount: number;
    languages: Record<string, number>;
    layers: Array<{ name: string; directories: string[]; fileCount: number }>;
  };
  dependencies: {
    external: string[];
    internal: string[];
    circularRisks: string[];
    graphStats: {
      totalNodes: number;
      totalEdges: number;
      averageCoupling: number;
      maxCoupling: number;
    };
    hotspots: Array<{ file: string; dependents: number; dependencies: number }>;
  };
  types: {
    interfaces: string[];
    types: string[];
    classes: string[];
  };
  conventions: {
    namingStyle: string;
    exportStyle: string;
    importStyle: string;
  };
  suggestions: string[];
  analysisSource: 'core' | 'fallback';
}

/**
 * Handler for camouf_analyze tool
 */
export async function handler(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  const projectRoot = (args.projectRoot as string) || process.cwd();
  const focus = (args.focus as string) || 'all';
  const specificPath = args.path as string | undefined;

  try {
    const result = await analyzeProject(projectRoot, focus, specificPath);

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
            error: message,
            projectRoot,
          }),
        },
      ],
    };
  }
}

/**
 * Analyze the project using Camouf core (with fallback)
 */
async function analyzeProject(
  projectRoot: string,
  focus: string,
  specificPath?: string
): Promise<AnalysisResult> {
  // Try core-based analysis first
  try {
    return await analyzeWithCore(projectRoot, focus, specificPath);
  } catch {
    // Fallback to lightweight fs-based analysis
    return await analyzeWithFallback(projectRoot, focus, specificPath);
  }
}

/**
 * Core-based analysis using ProjectScanner + DependencyAnalyzer
 */
async function analyzeWithCore(
  projectRoot: string,
  focus: string,
  specificPath?: string
): Promise<AnalysisResult> {
  // Load configuration
  const configManager = new ConfigurationManager();
  let config = await configManager.loadConfig(projectRoot);

  if (!config) {
    config = createDefaultConfig(projectRoot);
  }

  // Scan project and build real dependency graph
  const scanner = new ProjectScanner(config);
  const graph = await scanner.scan();
  const fileContents = scanner.getFileContents();

  // Run DependencyAnalyzer for deep metrics
  const depAnalyzer = new DependencyAnalyzer(config);
  const coreAnalysis = await depAnalyzer.analyze(graph, {
    includeMetrics: true,
    analyzeCoupling: true,
  });

  // Build structure info
  const structure = buildStructureFromGraph(graph, config, fileContents);

  // Build dependencies info from core analysis
  const dependencies = buildDependenciesFromCore(graph, coreAnalysis, fileContents);

  // Build types info
  const types = (focus === 'all' || focus === 'types')
    ? await analyzeTypes(fileContents)
    : { interfaces: [], types: [], classes: [] };

  // Build conventions info
  const conventions = (focus === 'all' || focus === 'conventions')
    ? analyzeConventions(fileContents)
    : { namingStyle: 'unknown', exportStyle: 'unknown', importStyle: 'unknown' };

  return {
    projectRoot,
    structure,
    dependencies,
    types,
    conventions,
    suggestions: coreAnalysis.suggestions,
    analysisSource: 'core',
  };
}

/**
 * Build structure info from the real dependency graph
 */
function buildStructureFromGraph(
  graph: ReturnType<ProjectScanner['getGraph']>,
  config: CamoufConfig,
  fileContents: Map<string, string>
): AnalysisResult['structure'] {
  const directories = new Set<string>();
  const languages: Record<string, number> = {};

  for (const nodeId of graph.nodes()) {
    const node = graph.node(nodeId);
    if (!node) continue;

    const relPath = node.data?.relativePath || nodeId;
    const dir = path.dirname(relPath);
    if (dir !== '.') {
      // Top-level directory
      const topLevel = dir.split(/[/\\]/)[0];
      directories.add(topLevel);
    }

    const lang = node.data?.language || 'unknown';
    languages[lang] = (languages[lang] || 0) + 1;
  }

  // Layer info from config
  const layers = config.layers.map(layer => {
    const layerFiles = graph.nodes().filter(nodeId => {
      const node = graph.node(nodeId);
      const relPath = node?.data?.relativePath || nodeId;
      return layer.directories.some(dir =>
        relPath.replace(/\\/g, '/').startsWith(dir.replace(/\\/g, '/'))
      );
    });
    return {
      name: layer.name,
      directories: layer.directories,
      fileCount: layerFiles.length,
    };
  });

  return {
    directories: Array.from(directories).sort(),
    fileCount: graph.nodeCount(),
    languages,
    layers,
  };
}

/**
 * Build dependencies info from core analysis results
 */
function buildDependenciesFromCore(
  graph: ReturnType<ProjectScanner['getGraph']>,
  coreAnalysis: { 
    summary: { averageCoupling: number; maxCoupling: number; totalDependencies: number };
    circularDependencies: Array<{ cycle: string[] }>;
    hotspots: Array<{ file: string; dependents: number; dependencies: number }>;
  },
  fileContents: Map<string, string>
): AnalysisResult['dependencies'] {
  const external = new Set<string>();
  const internal = new Set<string>();

  // Extract imports from file contents for external/internal classification
  for (const content of fileContents.values()) {
    const imports = extractImports(content);
    for (const imp of imports) {
      if (imp.startsWith('.') || imp.startsWith('/')) {
        internal.add(imp);
      } else if (!imp.startsWith('@types/')) {
        const pkgName = imp.startsWith('@')
          ? imp.split('/').slice(0, 2).join('/')
          : imp.split('/')[0];
        external.add(pkgName);
      }
    }
  }

  return {
    external: Array.from(external).sort(),
    internal: Array.from(internal).slice(0, 20).sort(),
    circularRisks: coreAnalysis.circularDependencies
      .slice(0, 10)
      .map(c => c.cycle.join(' → ')),
    graphStats: {
      totalNodes: graph.nodeCount(),
      totalEdges: graph.edgeCount(),
      averageCoupling: Math.round(coreAnalysis.summary.averageCoupling * 100) / 100,
      maxCoupling: coreAnalysis.summary.maxCoupling,
    },
    hotspots: coreAnalysis.hotspots.slice(0, 10).map(h => ({
      file: h.file,
      dependents: h.dependents,
      dependencies: h.dependencies,
    })),
  };
}

/**
 * Create default config when none found
 */
function createDefaultConfig(projectRoot: string): CamoufConfig {
  return {
    name: 'camouf-mcp-analysis',
    root: projectRoot,
    languages: ['typescript', 'javascript'],
    layers: [],
    directories: {
      client: ['src/client', 'src/components', 'src/pages', 'client', 'frontend'],
      server: ['src/server', 'src/api', 'server', 'backend'],
      shared: ['src/shared', 'src/common', 'shared', 'common'],
    },
    rules: {
      builtin: {},
    },
    patterns: {
      include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    },
  };
}

/**
 * Fallback analysis when core is not available (no config, parser errors, etc.)
 */
async function analyzeWithFallback(
  projectRoot: string,
  focus: string,
  specificPath?: string
): Promise<AnalysisResult> {
  const result: AnalysisResult = {
    projectRoot,
    structure: {
      directories: [],
      fileCount: 0,
      languages: {},
      layers: [],
    },
    dependencies: {
      external: [],
      internal: [],
      circularRisks: [],
      graphStats: { totalNodes: 0, totalEdges: 0, averageCoupling: 0, maxCoupling: 0 },
      hotspots: [],
    },
    types: {
      interfaces: [],
      types: [],
      classes: [],
    },
    conventions: {
      namingStyle: 'unknown',
      exportStyle: 'unknown',
      importStyle: 'unknown',
    },
    suggestions: ['No camouf.config.json found. Run `npx camouf init` for full analysis.'],
    analysisSource: 'fallback',
  };

  const targetPath = specificPath
    ? path.join(projectRoot, specificPath)
    : projectRoot;

  const files = await collectFiles(targetPath, projectRoot);

  if (focus === 'all' || focus === 'structure') {
    result.structure = { ...analyzeStructure(files), layers: [] };
  }

  if (focus === 'all' || focus === 'dependencies') {
    const deps = await analyzeFallbackDependencies(files);
    result.dependencies = {
      ...deps,
      graphStats: { totalNodes: files.size, totalEdges: 0, averageCoupling: 0, maxCoupling: 0 },
      hotspots: [],
    };
  }

  if (focus === 'all' || focus === 'types') {
    result.types = await analyzeTypes(files);
  }

  if (focus === 'all' || focus === 'conventions') {
    result.conventions = analyzeConventions(files);
  }

  return result;
}

/**
 * Collect files from directory
 */
async function collectFiles(
  targetPath: string,
  projectRoot: string
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const extensions = ['.ts', '.tsx', '.js', '.jsx'];

  async function scan(dir: string, depth: number): Promise<void> {
    if (depth > 6) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(projectRoot, fullPath);

        // Skip common non-source directories
        if (entry.name.startsWith('.') ||
            entry.name === 'node_modules' ||
            entry.name === 'dist' ||
            entry.name === 'build' ||
            entry.name === 'coverage' ||
            entry.name === '.git') {
          continue;
        }

        if (entry.isDirectory()) {
          await scan(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            try {
              const content = await fs.readFile(fullPath, 'utf-8');
              files.set(relativePath, content);
            } catch {
              // Skip unreadable files
            }
          }
        }
      }
    } catch {
      // Ignore directory errors
    }
  }

  await scan(targetPath, 0);
  return files;
}

/**
 * Analyze project structure (fallback)
 */
function analyzeStructure(files: Map<string, string>): Omit<AnalysisResult['structure'], 'layers'> {
  const directories = new Set<string>();
  const languages: Record<string, number> = {};

  for (const filePath of files.keys()) {
    const dir = path.dirname(filePath);
    if (dir !== '.') {
      directories.add(dir.split(path.sep)[0]); // Top-level directories
    }

    const ext = path.extname(filePath);
    const lang = ext === '.ts' || ext === '.tsx' ? 'typescript' : 'javascript';
    languages[lang] = (languages[lang] || 0) + 1;
  }

  return {
    directories: Array.from(directories).sort(),
    fileCount: files.size,
    languages,
  };
}

/**
 * Analyze dependencies (fallback)
 */
async function analyzeFallbackDependencies(files: Map<string, string>): Promise<{
  external: string[];
  internal: string[];
  circularRisks: string[];
}> {
  const external = new Set<string>();
  const internal = new Set<string>();
  const importGraph = new Map<string, Set<string>>();

  for (const [filePath, content] of files) {
    const imports = extractImports(content);
    const fileImports = new Set<string>();

    for (const imp of imports) {
      if (imp.startsWith('.') || imp.startsWith('/')) {
        internal.add(imp);
        fileImports.add(imp);
      } else if (!imp.startsWith('@types/')) {
        // Get package name (handle scoped packages)
        const pkgName = imp.startsWith('@') 
          ? imp.split('/').slice(0, 2).join('/')
          : imp.split('/')[0];
        external.add(pkgName);
      }
    }

    importGraph.set(filePath, fileImports);
  }

  // Detect potential circular dependency risks
  const circularRisks: string[] = [];
  for (const [file, imports] of importGraph) {
    for (const imp of imports) {
      // Check if the imported file imports this file back
      const importedFile = resolveRelativeImport(file, imp);
      const theirImports = importGraph.get(importedFile);
      if (theirImports) {
        for (const theirImp of theirImports) {
          const resolved = resolveRelativeImport(importedFile, theirImp);
          if (resolved === file) {
            circularRisks.push(`${file} <-> ${importedFile}`);
          }
        }
      }
    }
  }

  return {
    external: Array.from(external).sort(),
    internal: Array.from(internal).slice(0, 20).sort(), // Limit
    circularRisks: [...new Set(circularRisks)].slice(0, 10),
  };
}

/**
 * Analyze types (shared between core and fallback)
 */
async function analyzeTypes(files: Map<string, string>): Promise<AnalysisResult['types']> {
  const interfaces: string[] = [];
  const types: string[] = [];
  const classes: string[] = [];

  for (const content of files.values()) {
    // Extract interfaces
    const interfaceMatches = content.matchAll(/(?:export\s+)?interface\s+(\w+)/g);
    for (const match of interfaceMatches) {
      interfaces.push(match[1]);
    }

    // Extract type aliases
    const typeMatches = content.matchAll(/(?:export\s+)?type\s+(\w+)\s*=/g);
    for (const match of typeMatches) {
      types.push(match[1]);
    }

    // Extract classes
    const classMatches = content.matchAll(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g);
    for (const match of classMatches) {
      classes.push(match[1]);
    }
  }

  // Deduplicate and limit
  return {
    interfaces: [...new Set(interfaces)].sort().slice(0, 30),
    types: [...new Set(types)].sort().slice(0, 30),
    classes: [...new Set(classes)].sort().slice(0, 30),
  };
}

/**
 * Analyze naming conventions (shared between core and fallback)
 */
function analyzeConventions(files: Map<string, string>): AnalysisResult['conventions'] {
  let camelCaseCount = 0;
  let pascalCaseCount = 0;
  let snakeCaseCount = 0;
  let namedExports = 0;
  let defaultExports = 0;
  let absoluteImports = 0;
  let relativeImports = 0;

  for (const content of files.values()) {
    // Count naming styles
    const camelMatches = content.match(/\b[a-z][a-zA-Z0-9]*\b/g) || [];
    const pascalMatches = content.match(/\b[A-Z][a-zA-Z0-9]*\b/g) || [];
    const snakeMatches = content.match(/\b[a-z]+_[a-z_]+\b/g) || [];
    
    camelCaseCount += camelMatches.length;
    pascalCaseCount += pascalMatches.length;
    snakeCaseCount += snakeMatches.length;

    // Count export styles
    namedExports += (content.match(/export\s+(?:const|function|class|interface|type)\s+/g) || []).length;
    defaultExports += (content.match(/export\s+default/g) || []).length;

    // Count import styles
    const imports = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
    for (const imp of imports) {
      if (imp.includes('./') || imp.includes('../')) {
        relativeImports++;
      } else if (imp.includes('@/') || imp.includes('~/')) {
        absoluteImports++;
      }
    }
  }

  // Determine dominant styles
  const isPascalDominant = pascalCaseCount > camelCaseCount;
  const namingStyle = snakeCaseCount > camelCaseCount / 2 
    ? 'mixed' 
    : (isPascalDominant ? 'PascalCase' : 'camelCase');
  const exportStyle = defaultExports > namedExports ? 'default' : 'named';
  const importStyle = absoluteImports > relativeImports ? 'absolute' : 'relative';

  return {
    namingStyle,
    exportStyle,
    importStyle,
  };
}

/**
 * Extract imports from code (shared)
 */
function extractImports(code: string): string[] {
  const imports: string[] = [];
  
  const matches = code.matchAll(/(?:import|from)\s+['"]([^'"]+)['"]/g);
  for (const match of matches) {
    imports.push(match[1]);
  }

  return imports;
}

/**
 * Resolve relative import path
 */
function resolveRelativeImport(fromFile: string, importPath: string): string {
  const dir = path.dirname(fromFile);
  let resolved = path.join(dir, importPath);
  
  // Remove extension if present and add common ones
  if (!path.extname(resolved)) {
    resolved += '.ts'; // Assume TypeScript
  }

  return resolved;
}

/**
 * Export tool for use in MCP server
 */
export const analyzeTool = {
  definition,
  handler,
};
