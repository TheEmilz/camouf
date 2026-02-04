/**
 * Data Flow Integrity Rule
 * 
 * Validates data flow patterns and integrity constraints.
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';
import * as path from 'path';

interface DataFlowConfig extends RuleConfig {
  trackMutations?: boolean;
  enforceImmutability?: boolean;
  sensitivePatterns?: string[];
}

export class DataFlowIntegrityRule implements IRule {
  readonly id = 'data-flow-integrity';
  readonly name = 'Data Flow Integrity';
  readonly description = 'Validates data flow patterns and integrity constraints';
  readonly severity = 'warning' as const;
  readonly tags = ['data-flow', 'security', 'integrity'];

  private config: DataFlowConfig = {
    enabled: true,
    severity: 'warning',
    trackMutations: true,
    enforceImmutability: false,
    sensitivePatterns: ['password', 'secret', 'token', 'key', 'credential'],
  };

  configure(options: Partial<DataFlowConfig>): void {
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

      this.checkSensitiveDataExposure(filePath, content, violations);
      this.checkMutableOperations(filePath, content, violations);
      this.checkDataValidation(filePath, content, violations);
    }

    return { violations };
  }

  private checkSensitiveDataExposure(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');
    const sensitivePatterns = this.config.sensitivePatterns || [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      
      for (const pattern of sensitivePatterns) {
        if (line.includes(pattern)) {
          // Check for logging exposure
          if (/console\.(log|info|debug|warn|error)/.test(lines[i]) ||
              /logger\.(log|info|debug|warn|error)/.test(lines[i])) {
            violations.push(this.createViolation(
              filePath,
              `Potential sensitive data logged: ${pattern}`,
              i + 1,
              'Remove or mask sensitive data before logging'
            ));
          }

          // Check for direct assignment from user input
          if (/req\.(body|query|params)/.test(lines[i])) {
            violations.push(this.createViolation(
              filePath,
              `Sensitive data directly from user input: ${pattern}`,
              i + 1,
              'Validate and sanitize user input before processing'
            ));
          }
        }
      }
    }
  }

  private checkMutableOperations(filePath: string, content: string, violations: Violation[]): void {
    if (!this.config.enforceImmutability) return;

    const lines = content.split('\n');
    const mutationPatterns = [
      /\.push\s*\(/,
      /\.pop\s*\(/,
      /\.shift\s*\(/,
      /\.unshift\s*\(/,
      /\.splice\s*\(/,
      /\.sort\s*\(/,
      /\.reverse\s*\(/,
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of mutationPatterns) {
        if (pattern.test(lines[i])) {
          violations.push(this.createViolation(
            filePath,
            'Mutable array operation detected',
            i + 1,
            'Use immutable alternatives like spread operator, map, filter, or slice'
          ));
        }
      }
    }
  }

  private checkDataValidation(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');
    const fileName = path.basename(filePath).toLowerCase();

    // Check for data models/entities without validation
    if (fileName.includes('model') || fileName.includes('entity') || fileName.includes('dto')) {
      const hasValidation = content.includes('@Valid') || 
                           content.includes('validate') ||
                           content.includes('IsNotEmpty') ||
                           content.includes('IsString') ||
                           content.includes('class-validator');

      if (!hasValidation && content.includes('class ')) {
        const classMatch = content.match(/class\s+(\w+)/);
        if (classMatch) {
          violations.push(this.createViolation(
            filePath,
            `Data class '${classMatch[1]}' without validation`,
            1,
            'Add validation decorators or validation logic'
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
