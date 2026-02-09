/**
 * Missing Dependency Array Rule
 * 
 * Detects React hooks (useEffect, useCallback, useMemo) that are missing
 * dependencies in their dependency array. AI assistants often forget to add
 * variables used inside the hook to the dependency array.
 * 
 * Examples:
 * - useEffect using state variable but not listing it as dependency
 * - useCallback referencing props but with empty dependency array
 */

import { IRule, RuleContext, RuleResult, RuleConfig, Violation } from '../types.js';
import * as path from 'path';

interface MissingDependencyConfig extends RuleConfig {
  /** Hooks to check */
  hooks?: string[];
  /** Ignore specific function names */
  ignorePatterns?: string[];
}

interface HookUsage {
  hookName: string;
  line: number;
  column: number;
  dependencies: string[];
  usedVariables: string[];
  hasEmptyDeps: boolean;
  hasDeps: boolean;
  file: string;
}

export class MissingDependencyArrayRule implements IRule {
  readonly id = 'react/missing-dependency-array';
  readonly name = 'Missing Hook Dependency Array';
  readonly description = 'Detects React hooks with missing variables in dependency arrays';
  readonly severity = 'warning' as const;
  readonly tags = ['react', 'hooks', 'ai-safety'];
  readonly category = 'best-practices' as const;
  readonly supportsIncremental = true;

  private config: MissingDependencyConfig = {
    enabled: true,
    severity: 'warning',
    hooks: ['useEffect', 'useCallback', 'useMemo', 'useLayoutEffect'],
  };

  private violationCounter = 0;

  configure(options: Partial<MissingDependencyConfig>): void {
    this.config = { ...this.config, ...options };
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];
    this.violationCounter = 0;

    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      const content = context.fileContents?.get(filePath);
      if (!content) continue;

      const ext = path.extname(filePath).toLowerCase();
      if (!['.tsx', '.jsx'].includes(ext)) continue;

      const hookUsages = this.findHookUsages(content, filePath);
      
      for (const usage of hookUsages) {
        const missing = this.findMissingDependencies(usage);
        
        if (missing.length > 0) {
          this.violationCounter++;
          
          violations.push({
            id: `dep-${String(this.violationCounter).padStart(3, '0')}`,
            ruleId: this.id,
            ruleName: this.name,
            severity: this.config.severity as 'error' | 'warning' | 'info',
            message: `${usage.hookName} is missing ${missing.length} ${missing.length === 1 ? 'dependency' : 'dependencies'}: ${missing.join(', ')}`,
            file: usage.file,
            line: usage.line,
            column: usage.column,
            suggestion: `Add missing dependencies to the array: [${[...usage.dependencies, ...missing].join(', ')}]`,
            metadata: {
              hookName: usage.hookName,
              missingDependencies: missing,
              currentDependencies: usage.dependencies,
              usedVariables: usage.usedVariables,
              aiErrorType: 'missing-dependency-array',
            },
          });
        }
      }
    }

    return { violations };
  }

  private findHookUsages(content: string, filePath: string): HookUsage[] {
    const usages: HookUsage[] = [];
    const lines = content.split('\n');
    const hooks = this.config.hooks || [];

    // Build regex for hooks
    const hookPattern = new RegExp(`\\b(${hooks.join('|')})\\s*\\(`, 'g');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      let match;

      while ((match = hookPattern.exec(line)) !== null) {
        const hookName = match[1];
        const startIndex = match.index;

        // Extract the full hook call (might span multiple lines)
        const hookCall = this.extractHookCall(content, lineNum, startIndex);
        if (!hookCall) continue;

        // Parse the hook call
        const parsed = this.parseHookCall(hookCall.content, hookName);
        
        usages.push({
          hookName,
          line: lineNum + 1,
          column: startIndex + 1,
          dependencies: parsed.dependencies,
          usedVariables: parsed.usedVariables,
          hasEmptyDeps: parsed.hasEmptyDeps,
          hasDeps: parsed.hasDeps,
          file: filePath,
        });
      }
    }

    return usages;
  }

  private extractHookCall(content: string, startLine: number, startCol: number): { content: string; endLine: number } | null {
    const lines = content.split('\n');
    let result = '';
    let parenCount = 0;
    let started = false;
    let currentLine = startLine;

    // Start from the hook position
    for (let i = startLine; i < lines.length && i < startLine + 50; i++) {
      const line = i === startLine ? lines[i].slice(startCol) : lines[i];
      
      for (const char of line) {
        if (char === '(') {
          parenCount++;
          started = true;
        }
        if (started) {
          result += char;
        }
        if (char === ')') {
          parenCount--;
          if (parenCount === 0 && started) {
            return { content: result, endLine: i + 1 };
          }
        }
      }
      
      if (started) {
        result += '\n';
      }
      currentLine = i;
    }

    return null;
  }

  private parseHookCall(hookCall: string, hookName: string): {
    dependencies: string[];
    usedVariables: string[];
    hasEmptyDeps: boolean;
    hasDeps: boolean;
  } {
    // Extract dependency array (last argument of hook)
    const depArrayMatch = hookCall.match(/,\s*\[([^\]]*)\]\s*\)$/);
    
    let dependencies: string[] = [];
    let hasDeps = false;
    let hasEmptyDeps = false;

    if (depArrayMatch) {
      hasDeps = true;
      const depContent = depArrayMatch[1].trim();
      hasEmptyDeps = depContent === '';
      
      if (!hasEmptyDeps) {
        // Parse dependency names
        dependencies = depContent
          .split(',')
          .map(d => d.trim())
          .filter(d => d.length > 0);
      }
    }

    // Extract callback function body
    const callbackMatch = hookCall.match(/\(\s*(?:async\s*)?\([^)]*\)\s*=>\s*{?([\s\S]*?)(?:}?\s*,\s*\[|,\s*\[)/);
    let usedVariables: string[] = [];

    if (callbackMatch) {
      const body = callbackMatch[1];
      usedVariables = this.extractUsedVariables(body);
    } else {
      // Try alternative pattern: useEffect(() => something, [])
      const simpleCallback = hookCall.match(/\(\s*(?:async\s*)?\([^)]*\)\s*=>\s*([^,]+),\s*\[/);
      if (simpleCallback) {
        usedVariables = this.extractUsedVariables(simpleCallback[1]);
      }
    }

    return { dependencies, usedVariables, hasEmptyDeps, hasDeps };
  }

  private extractUsedVariables(body: string): string[] {
    const variables: string[] = [];
    
    // First, collect all callback parameter names and local variable declarations
    // so we can exclude them (they are NOT component-scope dependencies)
    const localNames = this.extractLocalNames(body);
    
    // Match identifiers that are likely state/props/context values
    const identifierPattern = /\b([a-z][a-zA-Z0-9]*)\b(?!\s*[:(])/g;
    let match;

    while ((match = identifierPattern.exec(body)) !== null) {
      const name = match[1];
      
      // Skip JS keywords and common globals
      if (this.isBuiltinOrKeyword(name)) continue;
      
      // Skip callback parameters and locally declared variables
      if (localNames.has(name)) continue;

      // Skip common iterator/callback parameter names
      if (this.isCommonCallbackParam(name)) continue;
      
      variables.push(name);
    }

    // Deduplicate
    return [...new Set(variables)];
  }

  /**
   * Extract names that are locally scoped within the hook body:
   * - Arrow function parameters: (item) =>, (item, index) =>
   * - Function parameters: function(item) {}, function handler(event) {}
   * - Destructured params: ({ name, value }) =>
   * - Local variable declarations: const x = ..., let y = ...
   * - For-loop variables: for (const item of items)
   */
  private extractLocalNames(body: string): Set<string> {
    const names = new Set<string>();

    // Arrow function params: (item) =>, (item, index) =>, item =>
    const arrowParamPatterns = [
      /\(\s*([^)]*)\)\s*=>/g,                    // (params) =>
      /(?:^|[,;{(\s])([a-z]\w*)\s*=>/g,          // single param =>
    ];
    
    for (const pattern of arrowParamPatterns) {
      let m;
      while ((m = pattern.exec(body)) !== null) {
        const params = m[1];
        // Extract individual param names (handle destructuring, defaults, types)
        const paramNames = params.matchAll(/\b([a-z][a-zA-Z0-9]*)\b(?=\s*[,)=:}]|\s*$)/g);
        for (const pm of paramNames) {
          names.add(pm[1]);
        }
      }
    }

    // Function params: function(item) {}, function handler(event) {}
    const funcParamPattern = /function\s*\w*\s*\(\s*([^)]*)\)/g;
    let fm;
    while ((fm = funcParamPattern.exec(body)) !== null) {
      const params = fm[1];
      const paramNames = params.matchAll(/\b([a-z][a-zA-Z0-9]*)\b/g);
      for (const pm of paramNames) {
        names.add(pm[1]);
      }
    }

    // Local variable declarations: const x =, let y =, var z =
    const localDeclPattern = /\b(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=/g;
    let lm;
    while ((lm = localDeclPattern.exec(body)) !== null) {
      if (lm[1]) {
        // Destructured: const { a, b } = ...
        const destructured = lm[1].matchAll(/\b([a-z][a-zA-Z0-9]*)\b/g);
        for (const dm of destructured) {
          names.add(dm[1]);
        }
      } else if (lm[2]) {
        names.add(lm[2]);
      }
    }

    // For-loop variables: for (const item of ...), for (const [key, val] of ...)
    const forPattern = /for\s*\(\s*(?:const|let|var)\s+(?:\[([^\]]+)\]|\{([^}]+)\}|(\w+))\s+(?:of|in)/g;
    let forM;
    while ((forM = forPattern.exec(body)) !== null) {
      const source = forM[1] || forM[2] || forM[3];
      if (source) {
        const varNames = source.matchAll(/\b([a-z][a-zA-Z0-9]*)\b/g);
        for (const vm of varNames) {
          names.add(vm[1]);
        }
      }
    }

    // .catch(err => ...), .catch((error) => ...)
    const catchPattern = /\.catch\s*\(\s*(?:\(\s*)?(\w+)/g;
    let cm;
    while ((cm = catchPattern.exec(body)) !== null) {
      names.add(cm[1]);
    }

    // try {} catch (err) {}
    const tryCatchPattern = /catch\s*\(\s*(\w+)\s*\)/g;
    let tcm;
    while ((tcm = tryCatchPattern.exec(body)) !== null) {
      names.add(tcm[1]);
    }

    return names;
  }

  /**
   * Common callback parameter names that almost never refer to
   * component-scope variables that should be dependencies.
   */
  private isCommonCallbackParam(name: string): boolean {
    const commonParams = new Set([
      // Iterator callbacks
      'item', 'items', 'element', 'el', 'entry', 'node', 'child',
      'acc', 'accumulator', 'curr', 'current', 'prev', 'previous', 'next',
      'idx', 'index', 'i', 'j', 'k', 'n',
      'key', 'val', 'value', 'pair', 'tuple',
      'row', 'col', 'column', 'cell',
      'char', 'str', 'line', 'word', 'token', 'match',
      // Event handler params
      'event', 'evt', 'ev', 'e',
      // Promise/async callbacks
      'res', 'response', 'result',
      'rej', 'reason',
      'err', 'error', 'ex', 'exception',
      // General callback params
      'cb', 'callback', 'fn', 'func', 'handler',
      'arg', 'args', 'param', 'params', 'opt', 'opts', 'option', 'options',
      'msg', 'message', 'payload', 'body', 'req', 'request',
      'ctx', 'context', 'scope', 'self',
    ]);
    return commonParams.has(name);
  }

  private findMissingDependencies(usage: HookUsage): string[] {
    // If no dependency array, we don't flag (could be intentional)
    if (!usage.hasDeps) return [];

    // If empty array with used variables, flag potential issues
    const missing: string[] = [];
    
    for (const variable of usage.usedVariables) {
      // Skip if already in dependencies
      if (usage.dependencies.includes(variable)) continue;
      
      // Skip common patterns that don't need to be dependencies
      if (this.isStableReference(variable)) continue;
      
      missing.push(variable);
    }

    // Limit to most likely missing deps (avoid false positives)
    return missing.slice(0, 5);
  }

  private isBuiltinOrKeyword(name: string): boolean {
    const builtins = new Set([
      'if', 'else', 'for', 'while', 'return', 'true', 'false', 'null', 'undefined',
      'console', 'window', 'document', 'process', 'require', 'module', 'exports',
      'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'Math', 'JSON',
      'Promise', 'Error', 'Map', 'Set', 'async', 'await', 'new', 'this', 'super',
      'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of',
      'const', 'let', 'var', 'function', 'class', 'import', 'export', 'default',
      'length', 'push', 'pop', 'map', 'filter', 'reduce', 'forEach', 'find',
      'includes', 'indexOf', 'slice', 'splice', 'join', 'split', 'trim',
      'then', 'catch', 'finally',
    ]);
    return builtins.has(name);
  }

  private isStableReference(name: string): boolean {
    // Common patterns that are stable (don't need to be deps)
    const stablePatterns = [
      /^set[A-Z]/,      // setState functions
      /^dispatch$/,     // useReducer dispatch
      /^navigate$/,     // React Router
      /Ref$/,           // Refs
    ];
    
    return stablePatterns.some(p => p.test(name));
  }
}
