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
    
    // Match identifiers that are likely state/props/context values
    // This is a simplified heuristic
    const identifierPattern = /\b([a-z][a-zA-Z0-9]*)\b(?!\s*[:(])/g;
    let match;

    while ((match = identifierPattern.exec(body)) !== null) {
      const name = match[1];
      
      // Skip JS keywords and common globals
      if (!this.isBuiltinOrKeyword(name)) {
        variables.push(name);
      }
    }

    // Deduplicate
    return [...new Set(variables)];
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
