/**
 * Resilience Patterns Rule
 * 
 * Validates resilience patterns like circuit breaker, retry, and timeout.
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';
import * as path from 'path';

interface ResilienceConfig extends RuleConfig {
  requireCircuitBreaker?: boolean;
  requireRetry?: boolean;
  requireTimeout?: boolean;
  externalCallPatterns?: string[];
}

export class ResiliencePatternsRule implements IRule {
  readonly id = 'resilience-patterns';
  readonly name = 'Resilience Patterns';
  readonly description = 'Validates resilience patterns like circuit breaker, retry, and timeout';
  readonly severity = 'warning' as const;
  readonly tags = ['resilience', 'reliability', 'patterns'];

  private config: ResilienceConfig = {
    enabled: true,
    severity: 'warning',
    requireCircuitBreaker: true,
    requireRetry: true,
    requireTimeout: true,
    externalCallPatterns: ['fetch', 'axios', 'http', 'request', 'got'],
  };

  configure(options: Partial<ResilienceConfig>): void {
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

      this.checkExternalCalls(filePath, content, violations);
      this.checkResiliencePatterns(filePath, content, violations);
      this.checkErrorHandling(filePath, content, violations);
    }

    return { violations };
  }

  private checkExternalCalls(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');
    const callPatterns = this.config.externalCallPatterns || [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const pattern of callPatterns) {
        const regex = new RegExp(`\\b${pattern}\\s*[\\(.]`, 'i');
        if (regex.test(line)) {
          // Check for timeout in surrounding context
          const contextStart = Math.max(0, i - 10);
          const contextEnd = Math.min(lines.length, i + 10);
          const context = lines.slice(contextStart, contextEnd).join('\n');

          if (this.config.requireTimeout && !this.hasTimeout(context)) {
            violations.push(this.createViolation(
              filePath,
              `External call without timeout configuration`,
              i + 1,
              'Add timeout to external service calls'
            ));
          }
        }
      }
    }
  }

  private checkResiliencePatterns(filePath: string, content: string, violations: Violation[]): void {
    const fileName = path.basename(filePath).toLowerCase();
    
    // Skip if not a service or client file
    if (!fileName.includes('service') && !fileName.includes('client') && !fileName.includes('adapter')) {
      return;
    }

    const hasExternalCalls = this.config.externalCallPatterns?.some(p => 
      content.toLowerCase().includes(p)
    );

    if (!hasExternalCalls) return;

    const hasCircuitBreaker = content.includes('circuitBreaker') || 
                              content.includes('CircuitBreaker') ||
                              content.includes('@CircuitBreaker');

    const hasRetry = content.includes('retry') || 
                     content.includes('Retry') ||
                     content.includes('@Retryable') ||
                     content.includes('maxRetries');

    if (this.config.requireCircuitBreaker && !hasCircuitBreaker) {
      violations.push(this.createViolation(
        filePath,
        'Service with external calls missing circuit breaker',
        1,
        'Implement circuit breaker pattern for fault tolerance'
      ));
    }

    if (this.config.requireRetry && !hasRetry) {
      violations.push(this.createViolation(
        filePath,
        'Service with external calls missing retry logic',
        1,
        'Implement retry with exponential backoff for transient failures'
      ));
    }
  }

  private checkErrorHandling(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for empty catch blocks
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line) || 
          (/catch\s*\([^)]*\)\s*\{/.test(line) && lines[i + 1]?.trim() === '}')) {
        violations.push(this.createViolation(
          filePath,
          'Empty catch block swallows errors silently',
          i + 1,
          'Log the error or handle it appropriately'
        ));
      }

      // Check for catch blocks that only console.log
      if (/catch\s*\([^)]*\)\s*\{/.test(line)) {
        const nextLines = lines.slice(i + 1, i + 4).join('\n');
        if (/console\.(log|error)/.test(nextLines) && !/throw|return|reject/.test(nextLines)) {
          violations.push(this.createViolation(
            filePath,
            'Catch block only logs error without proper handling',
            i + 1,
            'Consider rethrowing, returning error result, or using circuit breaker'
          ));
        }
      }
    }
  }

  private hasTimeout(context: string): boolean {
    const timeoutPatterns = [
      /timeout/i,
      /AbortController/,
      /signal/,
      /deadline/i,
      /\d+\s*\*\s*1000/, // Common timeout patterns like 30 * 1000
    ];

    return timeoutPatterns.some(p => p.test(context));
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
