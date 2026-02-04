/**
 * Performance Anti-patterns Rule
 * 
 * Detects common performance anti-patterns in code.
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';

interface PerformanceConfig extends RuleConfig {
  checkN1Queries?: boolean;
  checkUnboundedLoops?: boolean;
  checkMemoryLeaks?: boolean;
  maxLoopDepth?: number;
}

export class PerformanceAntipatternsRule implements IRule {
  readonly id = 'performance-antipatterns';
  readonly name = 'Performance Anti-patterns';
  readonly description = 'Detects common performance anti-patterns in code';
  readonly severity = 'warning' as const;
  readonly tags = ['performance', 'optimization', 'best-practices'];

  private config: PerformanceConfig = {
    enabled: true,
    severity: 'warning',
    checkN1Queries: true,
    checkUnboundedLoops: true,
    checkMemoryLeaks: true,
    maxLoopDepth: 3,
  };

  configure(options: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...options };
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];

    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      const content = context.fileContents?.get(filePath);
      if (!content) continue;

      if (this.config.checkN1Queries) {
        this.checkN1QueryPattern(filePath, content, violations);
      }
      if (this.config.checkUnboundedLoops) {
        this.checkUnboundedLoops(filePath, content, violations);
      }
      if (this.config.checkMemoryLeaks) {
        this.checkMemoryLeakPatterns(filePath, content, violations);
      }
      this.checkSyncOperations(filePath, content, violations);
    }

    return { violations };
  }

  private checkN1QueryPattern(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');
    let inLoop = false;
    let loopStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect loop start
      if (/\b(for|while|forEach|map|reduce|filter)\s*[\(\[]/.test(line)) {
        inLoop = true;
        loopStartLine = i + 1;
      }

      // Detect query/fetch inside loop
      if (inLoop) {
        if (/\.find\(|\.findOne\(|\.query\(|\.execute\(|await\s+fetch\(|axios\.\w+\(/.test(line)) {
          violations.push(this.createViolation(
            filePath,
            'Potential N+1 query pattern detected',
            i + 1,
            'Consider using batch queries, eager loading, or data loaders'
          ));
        }

        // Detect loop end (simplified)
        const openBraces = (line.match(/{/g) || []).length;
        const closeBraces = (line.match(/}/g) || []).length;
        if (closeBraces > openBraces) {
          inLoop = false;
        }
      }
    }
  }

  private checkUnboundedLoops(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');
    let currentDepth = 0;
    const maxDepth = this.config.maxLoopDepth || 3;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/\b(for|while|do)\s*[\(\{]/.test(line)) {
        currentDepth++;
        if (currentDepth > maxDepth) {
          violations.push(this.createViolation(
            filePath,
            `Deep nested loops detected (depth: ${currentDepth})`,
            i + 1,
            'Consider refactoring to reduce loop nesting or use different algorithms'
          ));
        }
      }

      // Check for while(true) or infinite loops
      if (/while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)/.test(line)) {
        violations.push(this.createViolation(
          filePath,
          'Potentially infinite loop detected',
          i + 1,
          'Ensure proper exit conditions exist'
        ));
      }

      if (line.includes('}')) {
        currentDepth = Math.max(0, currentDepth - 1);
      }
    }
  }

  private checkMemoryLeakPatterns(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for event listeners without cleanup
      if (/addEventListener\s*\(|\.on\s*\(/.test(line)) {
        // Look for corresponding removeEventListener in the file
        if (!content.includes('removeEventListener') && !content.includes('.off(')) {
          violations.push(this.createViolation(
            filePath,
            'Event listener without apparent cleanup',
            i + 1,
            'Ensure event listeners are removed in cleanup/unmount'
          ));
        }
      }

      // Check for setInterval without clearInterval
      if (/setInterval\s*\(/.test(line)) {
        if (!content.includes('clearInterval')) {
          violations.push(this.createViolation(
            filePath,
            'setInterval without clearInterval',
            i + 1,
            'Store interval ID and clear it during cleanup'
          ));
        }
      }

      // Check for large array accumulation in loops
      if (/\.push\s*\(/.test(line) && /while|for/.test(content.substring(Math.max(0, content.indexOf(line) - 200), content.indexOf(line)))) {
        // Check if there's no size limit
        if (!/\.length\s*[<>]|\.slice\(|\.splice\(/.test(content)) {
          violations.push(this.createViolation(
            filePath,
            'Array accumulation in loop without apparent size limit',
            i + 1,
            'Consider adding size limits or using streaming'
          ));
          break;
        }
      }
    }
  }

  private checkSyncOperations(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');
    const syncPatterns = [
      { pattern: /readFileSync\s*\(/, name: 'readFileSync' },
      { pattern: /writeFileSync\s*\(/, name: 'writeFileSync' },
      { pattern: /execSync\s*\(/, name: 'execSync' },
      { pattern: /spawnSync\s*\(/, name: 'spawnSync' },
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const { pattern, name } of syncPatterns) {
        if (pattern.test(lines[i])) {
          violations.push(this.createViolation(
            filePath,
            `Synchronous operation '${name}' may block event loop`,
            i + 1,
            `Consider using async version or worker threads`
          ));
        }
      }
    }
  }

  private createViolation(file: string, message: string, line: number, suggestion?: string): Violation {
    return {
      id: `${this.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId: this.id,
      ruleName: this.name,
      severity: 'warning',
      message,
      file,
      line,
      suggestion,
    };
  }
}
