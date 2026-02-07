/**
 * Orphaned Functions Rule
 * 
 * Detects functions that are declared but never called anywhere in the codebase.
 * AI coding assistants sometimes generate helper functions that the main code
 * never uses, either due to context loss or incomplete implementation.
 * 
 * Examples:
 * - Helper function created but never invoked
 * - Utility exported but not imported anywhere
 * - Dead code left behind after context window reset
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';
import * as path from 'path';

interface OrphanedFunctionsConfig extends RuleConfig {
  /** Ignore exported functions (they might be used externally) */
  ignoreExported?: boolean;
  /** Ignore functions matching these patterns */
  ignorePatterns?: string[];
  /** Ignore functions in test files */
  ignoreTestFiles?: boolean;
  /** Minimum function name length to check */
  minNameLength?: number;
  /** File patterns to analyze */
  includePatterns?: string[];
}

interface FunctionDeclaration {
  name: string;
  file: string;
  line: number;
  column: number;
  isExported: boolean;
  isDefault: boolean;
  type: 'function' | 'method' | 'arrow';
}

interface FunctionCall {
  name: string;
  file: string;
  line: number;
}

export class OrphanedFunctionsRule implements IRule {
  readonly id = 'orphaned-functions';
  readonly name = 'Orphaned Functions Detection';
  readonly description = 'Detects functions that are declared but never called anywhere in the codebase';
  readonly severity = 'warning' as const;
  readonly tags = ['ai-safety', 'dead-code', 'cleanup', 'quality'];
  readonly category = 'ai-specific' as const;
  readonly supportsIncremental = false;

  private config: OrphanedFunctionsConfig = {
    enabled: true,
    severity: 'warning',
    ignoreExported: true,
    ignoreTestFiles: true,
    minNameLength: 2,
    ignorePatterns: [
      '^_',           // Private/underscore prefix
      '^on[A-Z]',     // Event handlers
      '^handle[A-Z]', // Event handlers
      '^render',      // React render methods
      '^use[A-Z]',    // React hooks
      '^get[A-Z]',    // Getters (might be used dynamically)
      '^set[A-Z]',    // Setters (might be used dynamically)
      'constructor',  // Class constructors
      'componentDid', // React lifecycle
      'componentWill',// React lifecycle
      '^ngOn',        // Angular lifecycle
      '^ngAfter',     // Angular lifecycle
    ],
    includePatterns: ['.ts', '.tsx', '.js', '.jsx'],
  };

  private violationCounter = 0;

  configure(options: Partial<OrphanedFunctionsConfig>): void {
    this.config = { ...this.config, ...options };
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];
    this.violationCounter = 0;

    // Collect all function declarations across the codebase
    const declarations = new Map<string, FunctionDeclaration[]>();
    const calls = new Set<string>();

    // First pass: collect all declarations and calls
    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      const content = context.fileContents?.get(filePath);
      if (!content) continue;

      const ext = path.extname(filePath).toLowerCase();
      if (!this.config.includePatterns!.includes(ext)) continue;

      // Skip test files if configured
      if (this.config.ignoreTestFiles && this.isTestFile(filePath)) continue;

      // Collect declarations
      const fileFunctions = this.extractFunctionDeclarations(content, filePath);
      for (const fn of fileFunctions) {
        const existing = declarations.get(fn.name) || [];
        existing.push(fn);
        declarations.set(fn.name, existing);
      }

      // Collect calls
      const fileCalls = this.extractFunctionCalls(content, filePath);
      for (const call of fileCalls) {
        calls.add(call.name);
      }
    }

    // Second pass: find orphaned functions
    for (const [name, fns] of declarations) {
      // Skip if function is called somewhere
      if (calls.has(name)) continue;

      for (const fn of fns) {
        // Skip if exported and config says to ignore
        if (fn.isExported && this.config.ignoreExported) continue;

        // Skip if matches ignore patterns
        if (this.matchesIgnorePattern(name)) continue;

        // Skip if name is too short
        if (name.length < this.config.minNameLength!) continue;

        this.violationCounter++;

        violations.push({
          id: `orphan-${String(this.violationCounter).padStart(3, '0')}`,
          ruleId: this.id,
          ruleName: this.name,
          message: `Function '${name}' is declared but never called anywhere in the codebase`,
          severity: this.config.severity as 'error' | 'warning' | 'info',
          file: fn.file,
          line: fn.line,
          column: fn.column,
          suggestion: fn.isExported 
            ? 'If this function is part of the public API, ignore this warning. Otherwise, consider removing it.'
            : 'Consider removing this unused function or verify it was meant to be called somewhere.',
          metadata: {
            functionName: name,
            functionType: fn.type,
            isExported: fn.isExported,
            aiErrorType: 'orphaned-function',
          },
        });
      }
    }

    return { violations };
  }

  private extractFunctionDeclarations(content: string, filePath: string): FunctionDeclaration[] {
    const declarations: FunctionDeclaration[] = [];
    const lines = content.split('\n');

    // Track export context
    let inExportBlock = false;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const lineNumber = lineNum + 1;

      // Track export blocks
      if (/^export\s*{/.test(line)) {
        inExportBlock = true;
      }
      if (inExportBlock && line.includes('}')) {
        inExportBlock = false;
        continue;
      }
      if (inExportBlock) continue;

      // Function declarations
      const fnDeclMatch = line.match(/^(\s*)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*\(/);
      if (fnDeclMatch) {
        const isExported = line.includes('export');
        const isDefault = line.includes('default');
        declarations.push({
          name: fnDeclMatch[2],
          file: filePath,
          line: lineNumber,
          column: fnDeclMatch[1].length + 1,
          isExported,
          isDefault,
          type: 'function',
        });
        continue;
      }

      // Arrow function declarations (const myFunc = () => ...)
      const arrowMatch = line.match(/^(\s*)(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w]+)\s*=>/);
      if (arrowMatch) {
        const isExported = line.includes('export');
        declarations.push({
          name: arrowMatch[2],
          file: filePath,
          line: lineNumber,
          column: arrowMatch[1].length + 1,
          isExported,
          isDefault: false,
          type: 'arrow',
        });
        continue;
      }

      // Arrow function assigned to const (multiline or with type annotation)
      const arrowConstMatch = line.match(/^(\s*)(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*$/);
      if (arrowConstMatch) {
        // Check the next few lines for arrow function
        const nextLines = lines.slice(lineNum + 1, lineNum + 4).join('\n');
        if (/(?:async\s+)?(?:\([^)]*\)|[\w]+)\s*=>/.test(nextLines)) {
          const isExported = line.includes('export');
          declarations.push({
            name: arrowConstMatch[2],
            file: filePath,
            line: lineNumber,
            column: arrowConstMatch[1].length + 1,
            isExported,
            isDefault: false,
            type: 'arrow',
          });
        }
        continue;
      }

      // Class method declarations (not standalone, but useful for internal call tracking)
      const methodMatch = line.match(/^(\s+)(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/);
      if (methodMatch) {
        const indent = methodMatch[1].length;
        const methodName = methodMatch[2];
        // Methods usually have indent >= 2 and are not top-level
        // Skip keywords that look like method calls (if, for, while, switch, catch)
        const controlFlowKeywords = ['if', 'for', 'while', 'switch', 'catch', 'with'];
        if (indent >= 2 && !controlFlowKeywords.includes(methodName)) {
          // Skip constructor and common lifecycle methods
          if (!['constructor', 'render'].includes(methodName)) {
            declarations.push({
              name: methodName,
              file: filePath,
              line: lineNumber,
              column: indent + 1,
              isExported: false,
              isDefault: false,
              type: 'method',
            });
          }
        }
      }
    }

    return declarations;
  }

  private extractFunctionCalls(content: string, filePath: string): FunctionCall[] {
    const calls: FunctionCall[] = [];
    const lines = content.split('\n');

    // Pattern for function calls: functionName( or functionName<
    // Use negative lookbehind to exclude function declarations
    const callPattern = /\b(\w+)\s*(?:<[^>]*>)?\s*\(/g;

    // Also track property access calls: obj.method()
    const methodCallPattern = /\.(\w+)\s*(?:<[^>]*>)?\s*\(/g;

    // Pattern to detect function declaration lines
    const declarationLinePattern = /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+\w+\s*\(/;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const lineNumber = lineNum + 1;

      // Skip comments
      if (/^\s*\/\/|^\s*\/\*|^\s*\*/.test(line)) continue;

      // Skip function declaration lines - we only want actual calls
      if (declarationLinePattern.test(line)) continue;

      // Extract function calls
      let match;
      while ((match = callPattern.exec(line)) !== null) {
        const name = match[1];
        // Skip keywords
        if (!this.isKeyword(name)) {
          calls.push({
            name,
            file: filePath,
            line: lineNumber,
          });
        }
      }

      // Extract method calls
      while ((match = methodCallPattern.exec(line)) !== null) {
        const name = match[1];
        if (!this.isKeyword(name)) {
          calls.push({
            name,
            file: filePath,
            line: lineNumber,
          });
        }
      }

      // Also track references (for callbacks, etc.): someFunc (without parentheses)
      const refPattern = /[=,:(]\s*(\w+)\s*[,)}\]]/g;
      while ((match = refPattern.exec(line)) !== null) {
        const name = match[1];
        if (!this.isKeyword(name) && name.length >= 2) {
          calls.push({
            name,
            file: filePath,
            line: lineNumber,
          });
        }
      }

      // Track spread/destructure usage: ...funcName or { funcName }
      const spreadPattern = /\.\.\.(\w+)/g;
      while ((match = spreadPattern.exec(line)) !== null) {
        calls.push({
          name: match[1],
          file: filePath,
          line: lineNumber,
        });
      }

      // Track direct exports: export { funcName }
      const exportPattern = /export\s*{([^}]+)}/;
      const exportMatch = line.match(exportPattern);
      if (exportMatch) {
        const exports = exportMatch[1].split(',').map(e => e.trim().split(/\s+as\s+/)[0].trim());
        for (const exp of exports) {
          if (exp && !this.isKeyword(exp)) {
            calls.push({
              name: exp,
              file: filePath,
              line: lineNumber,
            });
          }
        }
      }
    }

    return calls;
  }

  private isTestFile(filePath: string): boolean {
    const testPatterns = [
      /\.test\./,
      /\.spec\./,
      /__tests__\//,
      /\/test\//,
      /\/tests\//,
      /\.mock\./,
    ];
    return testPatterns.some(p => p.test(filePath));
  }

  private matchesIgnorePattern(name: string): boolean {
    for (const pattern of this.config.ignorePatterns || []) {
      try {
        if (new RegExp(pattern).test(name)) {
          return true;
        }
      } catch {
        // Invalid regex, skip
      }
    }
    return false;
  }

  private isKeyword(name: string): boolean {
    const keywords = new Set([
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
      'return', 'function', 'class', 'const', 'let', 'var', 'new', 'this',
      'super', 'extends', 'implements', 'import', 'export', 'default', 'from',
      'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof',
      'in', 'of', 'true', 'false', 'null', 'undefined', 'void', 'delete',
      'constructor', 'prototype', 'arguments', 'require', 'module', 'exports',
      'Array', 'Object', 'String', 'Number', 'Boolean', 'Symbol', 'Map', 'Set',
      'Promise', 'Date', 'RegExp', 'Error', 'JSON', 'Math', 'console',
    ]);
    return keywords.has(name);
  }
}
