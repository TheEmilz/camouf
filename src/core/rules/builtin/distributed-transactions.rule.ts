/**
 * Distributed Transactions Rule
 * 
 * Validates distributed transaction patterns and saga implementations.
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';
import * as path from 'path';

interface DistributedTransactionsConfig extends RuleConfig {
  requireCompensation?: boolean;
  maxTransactionSteps?: number;
  sagaPatterns?: string[];
}

export class DistributedTransactionsRule implements IRule {
  readonly id = 'distributed-transactions';
  readonly name = 'Distributed Transactions';
  readonly description = 'Validates distributed transaction patterns and saga implementations';
  readonly severity = 'error' as const;
  readonly tags = ['distributed', 'transactions', 'saga', 'reliability'];

  private config: DistributedTransactionsConfig = {
    enabled: true,
    severity: 'error',
    requireCompensation: true,
    maxTransactionSteps: 5,
    sagaPatterns: ['saga', 'choreography', 'orchestration'],
  };

  configure(options: Partial<DistributedTransactionsConfig>): void {
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

      this.checkDistributedTransaction(filePath, content, violations);
      this.checkSagaPattern(filePath, content, violations);
      this.checkCompensation(filePath, content, violations);
    }

    return { violations };
  }

  private checkDistributedTransaction(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');
    
    // Detect potential distributed transactions
    const multiServiceCalls: number[] = [];
    let inTransaction = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect transaction start
      if (/@Transaction|beginTransaction|startTransaction/.test(line)) {
        inTransaction = true;
      }

      // Detect service calls within transactions
      if (inTransaction) {
        if (/\.call\(|httpClient|fetch\(|axios\./.test(line)) {
          multiServiceCalls.push(i + 1);
        }
      }

      // Detect transaction end
      if (/commit|endTransaction/.test(line)) {
        inTransaction = false;
      }
    }

    if (multiServiceCalls.length > 1) {
      violations.push(this.createViolation(
        filePath,
        'Multiple service calls in single transaction scope',
        multiServiceCalls[0],
        'Use saga pattern for distributed transactions instead of single transaction scope'
      ));
    }
  }

  private checkSagaPattern(filePath: string, content: string, violations: Violation[]): void {
    const fileName = path.basename(filePath).toLowerCase();
    const lines = content.split('\n');

    // Check if it's a saga file
    const isSaga = this.config.sagaPatterns?.some(p => fileName.includes(p)) ||
                   content.includes('@Saga') ||
                   content.includes('Saga');

    if (isSaga) {
      // Count transaction steps
      const stepPatterns = [
        /step\s*\d+|Step\d+/g,
        /execute\w+Step/g,
        /on\w+Success|on\w+Failure/g,
      ];

      let stepCount = 0;
      for (const pattern of stepPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          stepCount += matches.length;
        }
      }

      const maxSteps = this.config.maxTransactionSteps || 5;
      if (stepCount > maxSteps * 2) { // Account for success/failure handlers
        violations.push(this.createViolation(
          filePath,
          `Saga has too many steps (${Math.floor(stepCount / 2)} estimated)`,
          1,
          `Consider breaking down into smaller sagas (max ${maxSteps} steps)`
        ));
      }

      // Check for proper error handling
      const hasCompensation = content.includes('compensat') || 
                              content.includes('rollback') ||
                              content.includes('onFailure');
      
      if (!hasCompensation && this.config.requireCompensation) {
        violations.push(this.createViolation(
          filePath,
          'Saga without compensation handlers',
          1,
          'Add compensation/rollback logic for each saga step'
        ));
      }
    }
  }

  private checkCompensation(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');

    // Check for database operations without rollback
    const dbOperations: Array<{ line: number; operation: string }> = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/\.save\(|\.insert\(|\.update\(|\.delete\(|\.remove\(/.test(line)) {
        dbOperations.push({ line: i + 1, operation: line.trim() });
      }
    }

    // If multiple DB operations exist, check for transaction or compensation
    if (dbOperations.length > 1) {
      const hasTransactionControl = content.includes('transaction') ||
                                    content.includes('@Transactional') ||
                                    content.includes('beginTransaction');

      const hasCompensation = content.includes('try') && 
                             (content.includes('catch') || content.includes('finally'));

      if (!hasTransactionControl && !hasCompensation) {
        violations.push(this.createViolation(
          filePath,
          'Multiple database operations without transaction or error handling',
          dbOperations[0].line,
          'Wrap operations in transaction or add proper error handling with compensation'
        ));
      }
    }
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
