/**
 * AI Hallucinated Imports Rule
 * 
 * Detects import statements that reference modules or files that don't exist.
 * This is a common pattern in AI-generated code where the AI "hallucinates"
 * imports based on naming conventions rather than actual project structure.
 * 
 * Examples:
 * - import { validateUser } from '@/utils/auth-helpers'; // File doesn't exist
 * - import { formatDate } from 'date-fns/helpers';       // Path doesn't exist in date-fns
 * - import { UserService } from '../services/user';     // Wrong path
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';
import * as path from 'path';
import * as fs from 'fs';

interface HallucinatedImportsConfig extends RuleConfig {
  /** Check npm package imports */
  checkNpmImports?: boolean;
  /** Check relative imports */
  checkRelativeImports?: boolean;
  /** Check alias imports (@/, ~/, etc.) */
  checkAliasImports?: boolean;
  /** Ignore patterns for import paths */
  ignorePatterns?: string[];
  /** Path aliases mapping (e.g., { "@/": "./src/" }) */
  pathAliases?: Record<string, string>;
}

// Common import patterns across languages
interface ImportMatch {
  importPath: string;
  line: number;
  column: number;
  isRelative: boolean;
  isAlias: boolean;
  fullStatement: string;
}

export class AiHallucinatedImportsRule implements IRule {
  readonly id = 'ai-hallucinated-imports';
  readonly name = 'AI Hallucinated Imports Detection';
  readonly description = 'Detects import statements referencing non-existent modules or files, a common AI coding assistant error';
  readonly severity = 'error' as const;
  readonly tags = ['ai-safety', 'imports', 'dependencies', 'best-practices'];
  readonly category = 'ai-specific' as const;
  readonly supportsIncremental = true;

  private config: HallucinatedImportsConfig = {
    enabled: true,
    severity: 'error',
    checkNpmImports: false, // Off by default - requires node_modules analysis
    checkRelativeImports: true,
    checkAliasImports: true,
    ignorePatterns: [],
    pathAliases: {},
  };

  // Import patterns for different languages
  private readonly importPatterns: Array<{ lang: string; pattern: RegExp }> = [
    // TypeScript/JavaScript ES6 imports
    {
      lang: 'typescript',
      pattern: /import\s+(?:(?:\{[^}]*\}|[\w*]+(?:\s+as\s+\w+)?|\*\s+as\s+\w+)\s+from\s+)?['"`]([^'"`]+)['"`]/g,
    },
    // TypeScript/JavaScript dynamic imports
    {
      lang: 'typescript',
      pattern: /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    },
    // TypeScript/JavaScript require
    {
      lang: 'typescript',
      pattern: /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    },
    // Python imports
    {
      lang: 'python',
      pattern: /^(?:from\s+(\S+)\s+import|import\s+(\S+))/gm,
    },
    // Go imports
    {
      lang: 'go',
      pattern: /import\s+(?:\(\s*)?(?:[\w.]+\s+)?["']([^"']+)["']/g,
    },
    // Rust imports
    {
      lang: 'rust',
      pattern: /use\s+(?:crate::)?([^;{]+)/g,
    },
    // Java imports
    {
      lang: 'java',
      pattern: /import\s+(?:static\s+)?([^;]+);/g,
    },
  ];

  // Common file extensions to check
  private readonly fileExtensions = [
    '', // exact match
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.json', '.vue', '.svelte',
    '/index.ts', '/index.tsx', '/index.js', '/index.jsx',
  ];

  // Common alias prefixes
  private readonly aliasPrefixes = ['@/', '~/', '#/', '@@/'];

  configure(options: Partial<HallucinatedImportsConfig>): void {
    this.config = { ...this.config, ...options };
    
    // Load path aliases from tsconfig if available
    this.loadTsConfigAliases();
  }

  private loadTsConfigAliases(): void {
    // This will be called with context in check()
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];

    // Try to load tsconfig paths
    await this.loadPathAliasesFromConfig(context.config.root);

    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      const content = context.fileContents?.get(filePath);
      if (!content) continue;

      const fileViolations = await this.checkFileImports(
        filePath,
        content,
        context.config.root
      );
      violations.push(...fileViolations);
    }

    return { violations };
  }

  async checkFile(filePath: string, context: RuleContext): Promise<RuleResult> {
    const relativePath = path.relative(context.config.root, filePath).replace(/\\/g, '/');
    
    let content = context.fileContents?.get(relativePath);
    if (!content) {
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch {
        return { violations: [] };
      }
    }

    // Load path aliases if not already loaded
    await this.loadPathAliasesFromConfig(context.config.root);

    const violations = await this.checkFileImports(
      relativePath,
      content,
      context.config.root
    );

    return { violations };
  }

  private async loadPathAliasesFromConfig(rootDir: string): Promise<void> {
    // Try to read tsconfig.json for path aliases
    const tsconfigPath = path.join(rootDir, 'tsconfig.json');
    
    try {
      if (fs.existsSync(tsconfigPath)) {
        const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf-8');
        const tsconfig = JSON.parse(tsconfigContent);
        
        if (tsconfig.compilerOptions?.paths) {
          const baseUrl = tsconfig.compilerOptions.baseUrl || '.';
          
          for (const [alias, targets] of Object.entries(tsconfig.compilerOptions.paths)) {
            if (Array.isArray(targets) && targets.length > 0) {
              // Convert "@/*" to "@/" and "./src/*" to "./src/"
              const cleanAlias = alias.replace(/\*$/, '');
              const cleanTarget = (targets[0] as string).replace(/\*$/, '');
              this.config.pathAliases![cleanAlias] = path.join(baseUrl, cleanTarget);
            }
          }
        }
      }
    } catch {
      // Ignore tsconfig parsing errors
    }
  }

  private async checkFileImports(
    filePath: string,
    content: string,
    rootDir: string
  ): Promise<Violation[]> {
    const violations: Violation[] = [];
    const imports = this.extractImports(content, filePath);
    const fileDir = path.dirname(path.join(rootDir, filePath));

    for (const imp of imports) {
      // Skip if matches ignore pattern
      if (this.shouldIgnoreImport(imp.importPath)) continue;

      // Check based on import type
      if (imp.isRelative && this.config.checkRelativeImports) {
        const exists = await this.checkRelativeImport(imp.importPath, fileDir, rootDir);
        if (!exists) {
          violations.push(this.createViolation(filePath, imp, 'relative'));
        }
      } else if (imp.isAlias && this.config.checkAliasImports) {
        const exists = await this.checkAliasImport(imp.importPath, rootDir);
        if (!exists) {
          violations.push(this.createViolation(filePath, imp, 'alias'));
        }
      } else if (!imp.isRelative && !imp.isAlias && this.config.checkNpmImports) {
        const exists = await this.checkNpmImport(imp.importPath, rootDir);
        if (!exists) {
          violations.push(this.createViolation(filePath, imp, 'npm'));
        }
      }
    }

    return violations;
  }

  private extractImports(content: string, filePath: string): ImportMatch[] {
    const imports: ImportMatch[] = [];
    const lines = content.split('\n');
    
    // Determine file type
    const ext = path.extname(filePath).toLowerCase();
    const isTypeScript = ['.ts', '.tsx', '.mts', '.cts'].includes(ext);
    const isJavaScript = ['.js', '.jsx', '.mjs', '.cjs'].includes(ext);
    const isPython = ext === '.py';
    const isGo = ext === '.go';
    const isRust = ext === '.rs';
    const isJava = ext === '.java';

    // Select appropriate patterns
    const patterns: RegExp[] = [];
    if (isTypeScript || isJavaScript) {
      patterns.push(
        /import\s+(?:(?:\{[^}]*\}|[\w*]+(?:\s+as\s+\w+)?|\*\s+as\s+\w+)\s+from\s+)?['"`]([^'"`]+)['"`]/g,
        /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
        /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g
      );
    } else if (isPython) {
      patterns.push(/^(?:from\s+(\S+)\s+import|import\s+(\S+))/gm);
    } else if (isGo) {
      patterns.push(/import\s+(?:\(\s*)?(?:[\w.]+\s+)?["']([^"']+)["']/g);
    } else if (isRust) {
      patterns.push(/use\s+(?:crate::)?([^;{]+)/g);
    } else if (isJava) {
      patterns.push(/import\s+(?:static\s+)?([^;]+);/g);
    }

    for (const pattern of patterns) {
      // Reset pattern for each iteration
      pattern.lastIndex = 0;
      
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1] || match[2];
        if (!importPath) continue;
        
        // Skip built-in modules for Python
        if (isPython && this.isPythonBuiltin(importPath)) continue;
        
        // Skip Go standard library
        if (isGo && this.isGoStdlib(importPath)) continue;
        
        // Find line number
        const upToMatch = content.substring(0, match.index);
        const lineNumber = upToMatch.split('\n').length;
        const lastNewline = upToMatch.lastIndexOf('\n');
        const column = match.index - lastNewline;

        imports.push({
          importPath: importPath.trim(),
          line: lineNumber,
          column,
          isRelative: importPath.startsWith('.'),
          isAlias: this.isAliasImport(importPath),
          fullStatement: match[0],
        });
      }
    }

    return imports;
  }

  private isAliasImport(importPath: string): boolean {
    // Check common alias prefixes
    for (const prefix of this.aliasPrefixes) {
      if (importPath.startsWith(prefix)) return true;
    }
    
    // Check configured aliases
    for (const alias of Object.keys(this.config.pathAliases || {})) {
      if (importPath.startsWith(alias)) return true;
    }
    
    return false;
  }

  private isPythonBuiltin(modulePath: string): boolean {
    const builtins = new Set([
      'os', 'sys', 'json', 're', 'math', 'datetime', 'collections',
      'itertools', 'functools', 'typing', 'pathlib', 'unittest',
      'subprocess', 'threading', 'multiprocessing', 'asyncio',
      'http', 'urllib', 'email', 'html', 'xml', 'logging',
      'io', 'time', 'random', 'hashlib', 'base64', 'copy',
      'pickle', 'sqlite3', 'csv', 'configparser', 'argparse',
      'abc', 'contextlib', 'enum', 'dataclasses', 'inspect',
    ]);
    const rootModule = modulePath.split('.')[0];
    return builtins.has(rootModule);
  }

  private isGoStdlib(importPath: string): boolean {
    // Go standard library packages don't have dots in them (no domain)
    return !importPath.includes('.') && !importPath.includes('/');
  }

  private shouldIgnoreImport(importPath: string): boolean {
    // Ignore virtual modules (vite, webpack, etc.)
    if (importPath.startsWith('virtual:')) return true;
    if (importPath.startsWith('~')) return true; // CSS imports
    
    // Ignore asset imports
    if (/\.(css|scss|sass|less|styl|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot)(\?.*)?$/.test(importPath)) {
      return true;
    }
    
    // Check configured ignore patterns
    for (const pattern of this.config.ignorePatterns || []) {
      if (new RegExp(pattern).test(importPath)) return true;
    }
    
    return false;
  }

  private async checkRelativeImport(
    importPath: string,
    fileDir: string,
    rootDir: string
  ): Promise<boolean> {
    const resolvedPath = path.resolve(fileDir, importPath);
    
    // Check all possible extensions
    for (const ext of this.fileExtensions) {
      const fullPath = resolvedPath + ext;
      if (fs.existsSync(fullPath)) {
        return true;
      }
    }
    
    // Check if it's a directory with index file
    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
      for (const indexExt of ['/index.ts', '/index.tsx', '/index.js', '/index.jsx']) {
        if (fs.existsSync(resolvedPath + indexExt)) {
          return true;
        }
      }
    }
    
    return false;
  }

  private async checkAliasImport(
    importPath: string,
    rootDir: string
  ): Promise<boolean> {
    // Try to resolve alias to actual path
    let resolvedPath = importPath;
    
    for (const [alias, target] of Object.entries(this.config.pathAliases || {})) {
      if (importPath.startsWith(alias)) {
        resolvedPath = importPath.replace(alias, target);
        break;
      }
    }
    
    // If still starts with alias prefix, try common resolutions
    for (const prefix of this.aliasPrefixes) {
      if (resolvedPath.startsWith(prefix)) {
        // Common: @/ -> src/
        resolvedPath = resolvedPath.replace(prefix, 'src/');
        break;
      }
    }
    
    const fullPath = path.resolve(rootDir, resolvedPath);
    
    // Check all possible extensions
    for (const ext of this.fileExtensions) {
      if (fs.existsSync(fullPath + ext)) {
        return true;
      }
    }
    
    return false;
  }

  private async checkNpmImport(
    importPath: string,
    rootDir: string
  ): Promise<boolean> {
    // Get package name (handle scoped packages)
    let packageName = importPath;
    if (importPath.startsWith('@')) {
      const parts = importPath.split('/');
      packageName = parts.slice(0, 2).join('/');
    } else {
      packageName = importPath.split('/')[0];
    }
    
    // Check if package exists in node_modules
    const packagePath = path.join(rootDir, 'node_modules', packageName);
    if (fs.existsSync(packagePath)) {
      return true;
    }
    
    // Check package.json dependencies
    const packageJsonPath = path.join(rootDir, 'package.json');
    try {
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
          ...packageJson.peerDependencies,
        };
        
        if (packageName in allDeps) {
          return true;
        }
      }
    } catch {
      // Ignore parsing errors
    }
    
    return false;
  }

  private violationCounter = 0;

  private createViolation(
    filePath: string,
    imp: ImportMatch,
    type: 'relative' | 'alias' | 'npm'
  ): Violation {
    const typeMessages = {
      relative: `File or module '${imp.importPath}' does not exist`,
      alias: `Alias import '${imp.importPath}' could not be resolved to an existing file`,
      npm: `Package '${imp.importPath}' is not installed or not found in dependencies`,
    };

    const suggestions = {
      relative: this.suggestSimilarFile(imp.importPath),
      alias: `Check your tsconfig.json paths configuration or verify the file exists`,
      npm: `Run 'npm install ${imp.importPath.split('/')[0]}' or remove the unused import`,
    };

    this.violationCounter++;

    return {
      id: `hal-${String(this.violationCounter).padStart(3, '0')}`,
      ruleId: this.id,
      ruleName: this.name,
      message: `Hallucinated import detected: ${typeMessages[type]}`,
      severity: this.config.severity as 'error' | 'warning' | 'info',
      file: filePath,
      line: imp.line,
      column: imp.column,
      suggestion: suggestions[type],
      metadata: {
        importPath: imp.importPath,
        importType: type,
        fullStatement: imp.fullStatement,
        aiErrorType: 'hallucinated-import',
      },
    };
  }

  private suggestSimilarFile(importPath: string): string {
    // Basic suggestion - could be enhanced with fuzzy matching
    const baseName = path.basename(importPath);
    return `Verify the file path. Looking for: ${baseName}. Check for typos in directory or filename.`;
  }
}
