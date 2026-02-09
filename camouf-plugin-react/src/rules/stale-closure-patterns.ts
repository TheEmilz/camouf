/**
 * Stale Closure Patterns Rule
 * 
 * Detects potential stale closure issues in React hooks.
 * AI assistants often create closures that capture stale values,
 * especially when using intervals, event listeners, or async operations.
 * 
 * Examples:
 * - setInterval callback using state variable without ref
 * - Event listener with stale closure over state
 * - Async function capturing outdated state
 */

import { IRule, RuleContext, RuleResult, RuleConfig, Violation } from '../types.js';
import * as path from 'path';

interface StaleClosureConfig extends RuleConfig {
  /** Check setInterval patterns */
  checkIntervals?: boolean;
  /** Check event listeners */
  checkEventListeners?: boolean;
  /** Check async callbacks */
  checkAsyncCallbacks?: boolean;
}

interface StaleClosureIssue {
  type: 'interval' | 'event-listener' | 'async-callback' | 'timeout';
  line: number;
  column: number;
  staleVariables: string[];
  hookContext?: string;
  file: string;
}

export class StaleClosurePatternsRule implements IRule {
  readonly id = 'react/stale-closure-patterns';
  readonly name = 'Stale Closure Patterns';
  readonly description = 'Detects potential stale closure issues in React hooks';
  readonly severity = 'warning' as const;
  readonly tags = ['react', 'hooks', 'ai-safety', 'bugs'];
  readonly category = 'best-practices' as const;
  readonly supportsIncremental = true;

  private config: StaleClosureConfig = {
    enabled: true,
    severity: 'warning',
    checkIntervals: true,
    checkEventListeners: true,
    checkAsyncCallbacks: true,
  };

  private violationCounter = 0;

  configure(options: Partial<StaleClosureConfig>): void {
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

      // Find state variables
      const stateVariables = this.findStateVariables(content);
      
      // Find potential stale closure issues
      const issues = this.findStaleClosures(content, stateVariables, filePath);

      for (const issue of issues) {
        this.violationCounter++;

        violations.push({
          id: `stale-${String(this.violationCounter).padStart(3, '0')}`,
          ruleId: this.id,
          ruleName: this.name,
          severity: this.config.severity as 'error' | 'warning' | 'info',
          message: this.createMessage(issue),
          file: issue.file,
          line: issue.line,
          column: issue.column,
          suggestion: this.createSuggestion(issue),
          metadata: {
            issueType: issue.type,
            staleVariables: issue.staleVariables,
            hookContext: issue.hookContext,
            aiErrorType: 'stale-closure',
          },
        });
      }
    }

    return { violations };
  }

  private findStateVariables(content: string): Map<string, { setter: string; line: number }> {
    const stateVars = new Map<string, { setter: string; line: number }>();
    const lines = content.split('\n');

    // Match useState patterns
    const useStatePattern = /const\s+\[\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*useState/g;
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      let match;
      
      while ((match = useStatePattern.exec(line)) !== null) {
        const [, stateName, setterName] = match;
        stateVars.set(stateName, { setter: setterName, line: lineNum + 1 });
      }
    }

    // Match useReducer patterns
    const useReducerPattern = /const\s+\[\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*useReducer/g;
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      let match;
      
      while ((match = useReducerPattern.exec(line)) !== null) {
        const [, stateName, dispatchName] = match;
        stateVars.set(stateName, { setter: dispatchName, line: lineNum + 1 });
      }
    }

    return stateVars;
  }

  private findStaleClosures(
    content: string, 
    stateVariables: Map<string, { setter: string; line: number }>,
    filePath: string
  ): StaleClosureIssue[] {
    const issues: StaleClosureIssue[] = [];
    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const lineNumber = lineNum + 1;

      // Check for setInterval with potential stale closure
      if (this.config.checkIntervals && /setInterval\s*\(/.test(line)) {
        const intervalContent = this.extractCallbackContent(content, lineNum);
        if (intervalContent) {
          const staleVars = this.findStaleVariablesInCallback(intervalContent, stateVariables);
          if (staleVars.length > 0) {
            issues.push({
              type: 'interval',
              line: lineNumber,
              column: line.indexOf('setInterval') + 1,
              staleVariables: staleVars,
              hookContext: this.findHookContext(content, lineNum),
              file: filePath,
            });
          }
        }
      }

      // Check for setTimeout (less common but similar issue)
      if (this.config.checkIntervals && /setTimeout\s*\(/.test(line)) {
        const timeoutContent = this.extractCallbackContent(content, lineNum);
        if (timeoutContent) {
          const staleVars = this.findStaleVariablesInCallback(timeoutContent, stateVariables);
          // Only flag if inside useEffect with empty deps and using state
          if (staleVars.length > 0 && this.isInsideEmptyDepsEffect(content, lineNum)) {
            issues.push({
              type: 'timeout',
              line: lineNumber,
              column: line.indexOf('setTimeout') + 1,
              staleVariables: staleVars,
              hookContext: this.findHookContext(content, lineNum),
              file: filePath,
            });
          }
        }
      }

      // Check for addEventListener with potential stale closure
      if (this.config.checkEventListeners && /addEventListener\s*\(/.test(line)) {
        // Look for the callback
        const listenerContent = this.extractCallbackContent(content, lineNum);
        if (listenerContent) {
          const staleVars = this.findStaleVariablesInCallback(listenerContent, stateVariables);
          if (staleVars.length > 0 && this.isInsideEmptyDepsEffect(content, lineNum)) {
            issues.push({
              type: 'event-listener',
              line: lineNumber,
              column: line.indexOf('addEventListener') + 1,
              staleVariables: staleVars,
              hookContext: this.findHookContext(content, lineNum),
              file: filePath,
            });
          }
        }
      }

      // Check for async functions in useEffect that might have stale closures
      if (this.config.checkAsyncCallbacks) {
        if (/async\s*\([^)]*\)\s*=>/.test(line) || /async\s+function/.test(line)) {
          const asyncContent = this.extractCallbackContent(content, lineNum);
          if (asyncContent) {
            const staleVars = this.findStaleVariablesInCallback(asyncContent, stateVariables);
            // Check if async operation uses state after await
            if (staleVars.length > 0 && this.usesStateAfterAwait(asyncContent, staleVars)) {
              issues.push({
                type: 'async-callback',
                line: lineNumber,
                column: line.indexOf('async') + 1,
                staleVariables: staleVars,
                hookContext: this.findHookContext(content, lineNum),
                file: filePath,
              });
            }
          }
        }
      }
    }

    return issues;
  }

  private extractCallbackContent(content: string, startLineNum: number): string | null {
    const lines = content.split('\n');
    let result = '';
    let braceCount = 0;
    let parenCount = 0;
    let started = false;

    for (let i = startLineNum; i < lines.length && i < startLineNum + 30; i++) {
      const line = lines[i];
      
      for (const char of line) {
        if (char === '(' || char === '{') {
          if (char === '(') parenCount++;
          if (char === '{') braceCount++;
          started = true;
        }
        
        if (started) {
          result += char;
        }
        
        if (char === ')') parenCount--;
        if (char === '}') braceCount--;
        
        // End when we've closed all braces/parens
        if (started && braceCount === 0 && parenCount === 0) {
          return result;
        }
      }
      result += '\n';
    }

    return null;
  }

  private findStaleVariablesInCallback(
    callback: string, 
    stateVariables: Map<string, { setter: string; line: number }>
  ): string[] {
    const staleVars: string[] = [];

    // Collect locally declared/shadowed variable names within the callback
    const shadowedNames = this.extractShadowedNames(callback);

    for (const [stateName, { setter }] of stateVariables) {
      // If the state variable name is shadowed by a local declaration,
      // the reference in the callback is NOT the component state — skip it
      if (shadowedNames.has(stateName)) continue;

      // Check if state is used directly without using functional update
      const statePattern = new RegExp(`\\b${stateName}\\b`, 'g');
      const setterPattern = new RegExp(`${setter}\\s*\\(\\s*${stateName}`, 'g');
      
      // State is used in callback
      const usesState = statePattern.test(callback);
      // Check if setter uses functional update: setSomething(prev => ...)
      const usesFunctionalUpdate = new RegExp(`${setter}\\s*\\(\\s*(?:\\w+\\s*=>|function)`).test(callback);
      
      if (usesState && !usesFunctionalUpdate) {
        staleVars.push(stateName);
      }
    }

    return staleVars;
  }

  /**
   * Extract variable names that are locally declared inside the callback,
   * which would shadow any component-scope state variables with the same name.
   */
  private extractShadowedNames(callback: string): Set<string> {
    const names = new Set<string>();

    // const/let/var declarations: const data = ..., let { data } = ...
    const declPattern = /\b(?:const|let|var)\s+(?:\{([^}]+)\}|\[([^\]]+)\]|(\w+))\s*=/g;
    let m;
    while ((m = declPattern.exec(callback)) !== null) {
      const source = m[1] || m[2] || m[3];
      if (source) {
        const varNames = source.matchAll(/\b([a-z][a-zA-Z0-9]*)\b/g);
        for (const vm of varNames) {
          names.add(vm[1]);
        }
      }
    }

    // Arrow function parameters: (data) => ..., data => ...
    const arrowParams = callback.matchAll(/\(\s*([^)]*)\)\s*=>/g);
    for (const ap of arrowParams) {
      const params = ap[1].matchAll(/\b([a-z][a-zA-Z0-9]*)\b/g);
      for (const pm of params) {
        names.add(pm[1]);
      }
    }
    // Single param arrow: data => (without parens)
    const singleArrow = callback.matchAll(/(?:^|[,;{(\s])([a-z]\w*)\s*=>/g);
    for (const sa of singleArrow) {
      names.add(sa[1]);
    }

    // Function parameters: function(data) {}, function handler(data) {}
    const funcParams = callback.matchAll(/function\s*\w*\s*\(\s*([^)]*)\)/g);
    for (const fp of funcParams) {
      const params = fp[1].matchAll(/\b([a-z][a-zA-Z0-9]*)\b/g);
      for (const pm of params) {
        names.add(pm[1]);
      }
    }

    // for-of/for-in: for (const item of ...), for (const key in ...)
    const forPattern = /for\s*\(\s*(?:const|let|var)\s+(?:\[([^\]]+)\]|\{([^}]+)\}|(\w+))\s+(?:of|in)/g;
    while ((m = forPattern.exec(callback)) !== null) {
      const source = m[1] || m[2] || m[3];
      if (source) {
        const varNames = source.matchAll(/\b([a-z][a-zA-Z0-9]*)\b/g);
        for (const vm of varNames) {
          names.add(vm[1]);
        }
      }
    }

    // catch (err) {}
    const catchPattern = /catch\s*\(\s*(\w+)\s*\)/g;
    while ((m = catchPattern.exec(callback)) !== null) {
      names.add(m[1]);
    }

    return names;
  }

  private isInsideEmptyDepsEffect(content: string, lineNum: number): boolean {
    const lines = content.split('\n');
    
    // Look backwards to find useEffect
    for (let i = lineNum; i >= 0 && i >= lineNum - 20; i--) {
      const line = lines[i];
      if (/useEffect\s*\(/.test(line)) {
        // Check if this useEffect has empty deps
        const effectContent = lines.slice(i, lineNum + 5).join('\n');
        return /\[\s*\]\s*\)/.test(effectContent);
      }
    }

    return false;
  }

  private usesStateAfterAwait(asyncContent: string, staleVars: string[]): boolean {
    // Check if await is followed by usage of stale variables
    const awaitIndex = asyncContent.indexOf('await');
    if (awaitIndex === -1) return false;

    const afterAwait = asyncContent.substring(awaitIndex);
    
    for (const varName of staleVars) {
      const pattern = new RegExp(`\\b${varName}\\b`);
      if (pattern.test(afterAwait)) {
        return true;
      }
    }

    return false;
  }

  private findHookContext(content: string, lineNum: number): string | undefined {
    const lines = content.split('\n');
    
    // Look backwards to find hook
    for (let i = lineNum; i >= 0 && i >= lineNum - 10; i--) {
      const line = lines[i];
      const hookMatch = line.match(/\b(useEffect|useCallback|useMemo|useLayoutEffect)\s*\(/);
      if (hookMatch) {
        return hookMatch[1];
      }
    }

    return undefined;
  }

  private createMessage(issue: StaleClosureIssue): string {
    const varList = issue.staleVariables.join(', ');
    
    switch (issue.type) {
      case 'interval':
        return `setInterval callback may have stale closure over: ${varList}. The callback captures the initial value and won't update.`;
      
      case 'timeout':
        return `setTimeout callback may have stale closure over: ${varList}. Consider using a ref to access latest values.`;
      
      case 'event-listener':
        return `Event listener callback may have stale closure over: ${varList}. The listener won't see updated state.`;
      
      case 'async-callback':
        return `Async function may use stale values of: ${varList} after await. State might have changed.`;
      
      default:
        return `Potential stale closure over: ${varList}`;
    }
  }

  private createSuggestion(issue: StaleClosureIssue): string {
    switch (issue.type) {
      case 'interval':
        return `Use a ref (useRef) to store the latest value, or use a functional update (setState(prev => ...)) to access current state`;
      
      case 'timeout':
        return `Either add the variables to the dependency array and handle cleanup, or use refs for mutable access`;
      
      case 'event-listener':
        return `Store the latest value in a ref using useRef and update it in useEffect, then read from the ref in the listener`;
      
      case 'async-callback':
        return `Consider checking if the component is still mounted, or use refs for values that might change during async operation`;
      
      default:
        return `Use useRef to maintain a mutable reference to the latest value`;
    }
  }
}
