/**
 * MCP Tool: camouf_analyze
 * 
 * Analyzes code dependencies and architecture patterns.
 * 
 * This tool helps AI understand the project structure before
 * generating new code, reducing the chance of violations.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
// Config and analysis imports available for future use
// import { ConfigurationManager } from '../../core/config/configuration-manager.js';
// import { ProjectScanner } from '../../core/scanner/project-scanner.js';
// import { DependencyAnalyzer } from '../../core/analyzer/dependency-analyzer.js';
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
 * Analysis result structure
 */
interface AnalysisResult {
  projectRoot: string;
  structure: {
    directories: string[];
    fileCount: number;
    languages: Record<string, number>;
  };
  dependencies: {
    external: string[];
    internal: string[];
    circularRisks: string[];
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
 * Analyze the project
 */
async function analyzeProject(
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
    },
    dependencies: {
      external: [],
      internal: [],
      circularRisks: [],
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
    suggestions: [],
  };

  const targetPath = specificPath 
    ? path.join(projectRoot, specificPath) 
    : projectRoot;

  // Collect file information
  const files = await collectFiles(targetPath, projectRoot);

  // Analyze structure
  if (focus === 'all' || focus === 'structure') {
    result.structure = analyzeStructure(files);
  }

  // Analyze dependencies
  if (focus === 'all' || focus === 'dependencies') {
    result.dependencies = await analyzeDependencies(files);
  }

  // Analyze types
  if (focus === 'all' || focus === 'types') {
    result.types = await analyzeTypes(files);
  }

  // Analyze conventions
  if (focus === 'all' || focus === 'conventions') {
    result.conventions = analyzeConventions(files);
  }

  // Generate suggestions
  result.suggestions = generateSuggestions(result);

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
 * Analyze project structure
 */
function analyzeStructure(files: Map<string, string>): AnalysisResult['structure'] {
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
 * Analyze dependencies
 */
async function analyzeDependencies(files: Map<string, string>): Promise<AnalysisResult['dependencies']> {
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
 * Analyze types
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
 * Analyze naming conventions
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
 * Generate suggestions based on analysis
 */
function generateSuggestions(result: AnalysisResult): string[] {
  const suggestions: string[] = [];

  if (result.dependencies.circularRisks.length > 0) {
    suggestions.push('Consider refactoring to eliminate circular dependencies');
  }

  if (result.conventions.exportStyle === 'named') {
    suggestions.push('Use named exports for new modules');
  }

  if (result.conventions.namingStyle === 'camelCase') {
    suggestions.push('Use camelCase for functions and variables');
    suggestions.push('Use PascalCase for classes, interfaces, and types');
  }

  if (result.structure.directories.includes('src')) {
    suggestions.push('Place new code in the src/ directory');
  }

  return suggestions;
}

/**
 * Extract imports from code
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
