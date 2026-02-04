/**
 * Circular Dependencies Rule
 * 
 * Detects and reports circular dependencies in the codebase.
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';

interface CircularDependenciesConfig extends RuleConfig {
  maxCycleLength?: number;
  ignoredPaths?: string[];
}

export class CircularDependenciesRule implements IRule {
  readonly id = 'circular-dependencies';
  readonly name = 'Circular Dependencies Detection';
  readonly description = 'Detects and reports circular dependencies in the codebase';
  readonly severity = 'error' as const;
  readonly tags = ['dependencies', 'architecture', 'maintainability'];

  private config: CircularDependenciesConfig = {
    enabled: true,
    severity: 'error',
    maxCycleLength: 10,
    ignoredPaths: [],
  };

  configure(options: Partial<CircularDependenciesConfig>): void {
    this.config = { ...this.config, ...options };
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];
    const cycles = this.findCycles(context);

    for (const cycle of cycles) {
      if (this.config.maxCycleLength && cycle.length > this.config.maxCycleLength) {
        continue;
      }

      if (this.isIgnored(cycle)) {
        continue;
      }

      const cycleStr = cycle.join(' -> ') + ' -> ' + cycle[0];
      violations.push(this.createViolation(
        cycle[0],
        `Circular dependency detected: ${cycleStr}`,
        1,
        'Consider introducing an interface or event-based communication to break the cycle'
      ));
    }

    return { violations };
  }

  private findCycles(context: RuleContext): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): void => {
      if (recursionStack.has(node)) {
        const cycleStart = path.indexOf(node);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart);
          if (!this.cycleExists(cycles, cycle)) {
            cycles.push([...cycle]);
          }
        }
        return;
      }

      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const successors = context.graph.successors(node);
      if (successors) {
        for (const successor of successors) {
          dfs(successor);
        }
      }

      path.pop();
      recursionStack.delete(node);
    };

    for (const node of context.graph.nodes()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  private cycleExists(cycles: string[][], newCycle: string[]): boolean {
    const sorted = [...newCycle].sort().join(',');
    return cycles.some(existing => {
      const existingSorted = [...existing].sort().join(',');
      return existingSorted === sorted;
    });
  }

  private isIgnored(cycle: string[]): boolean {
    if (!this.config.ignoredPaths?.length) return false;
    return cycle.some(node => 
      this.config.ignoredPaths!.some(ignored => node.includes(ignored))
    );
  }

  private createViolation(file: string, message: string, line: number, suggestion?: string): Violation {
    return {
      id: `${this.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId: this.id,
      ruleName: this.name,
      severity: 'error',
      message,
      file,
      line,
      suggestion,
    };
  }
}
