/**
 * DDD Boundaries Rule
 * 
 * Validates Domain-Driven Design boundary patterns.
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';
import * as path from 'path';

interface DddBoundariesConfig extends RuleConfig {
  domains?: string[];
  allowedCrossings?: Array<{ from: string; to: string }>;
  enforceAggregateRoots?: boolean;
}

export class DddBoundariesRule implements IRule {
  readonly id = 'ddd-boundaries';
  readonly name = 'DDD Bounded Context Boundaries';
  readonly description = 'Validates Domain-Driven Design boundary patterns';
  readonly severity = 'error' as const;
  readonly tags = ['ddd', 'architecture', 'boundaries'];

  private config: DddBoundariesConfig = {
    enabled: true,
    severity: 'error',
    domains: [],
    allowedCrossings: [],
    enforceAggregateRoots: true,
  };

  configure(options: Partial<DddBoundariesConfig>): void {
    this.config = { ...this.config, ...options };
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];

    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      const sourceDomain = this.extractDomain(filePath);
      if (!sourceDomain) continue;

      // Check cross-boundary imports
      const successors = context.graph.successors(nodeId);
      if (successors) {
        for (const successor of successors) {
          const targetNode = context.getNodeData(successor);
          if (!targetNode) continue;

          const targetPath = targetNode.data.relativePath;
          const targetDomain = this.extractDomain(targetPath);

          if (targetDomain && sourceDomain !== targetDomain) {
            if (!this.isCrossingAllowed(sourceDomain, targetDomain)) {
              violations.push(this.createViolation(
                filePath,
                `Cross-boundary dependency: ${sourceDomain} -> ${targetDomain}`,
                1,
                'Use domain events or anti-corruption layer for cross-domain communication'
              ));
            }
          }
        }
      }

      // Check aggregate root patterns
      const content = context.fileContents?.get(filePath);
      if (content) {
        this.checkAggregatePatterns(filePath, content, violations);
        this.checkRepositoryPatterns(filePath, content, violations);
      }
    }

    return { violations };
  }

  private extractDomain(filePath: string): string | null {
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // Look for common domain folder patterns
    const domainPatterns = [
      /\/domains?\/([^/]+)\//,
      /\/bounded-contexts?\/([^/]+)\//,
      /\/modules?\/([^/]+)\//,
      /\/features?\/([^/]+)\//,
    ];

    for (const pattern of domainPatterns) {
      const match = normalizedPath.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Check configured domains
    if (this.config.domains?.length) {
      for (const domain of this.config.domains) {
        if (normalizedPath.includes(`/${domain}/`) || normalizedPath.includes(`\\${domain}\\`)) {
          return domain;
        }
      }
    }

    return null;
  }

  private isCrossingAllowed(from: string, to: string): boolean {
    if (!this.config.allowedCrossings?.length) return false;
    return this.config.allowedCrossings.some(
      crossing => crossing.from === from && crossing.to === to
    );
  }

  private checkAggregatePatterns(filePath: string, content: string, violations: Violation[]): void {
    if (!this.config.enforceAggregateRoots) return;

    const fileName = path.basename(filePath).toLowerCase();
    const lines = content.split('\n');

    // Check if it's an entity file
    if (fileName.includes('entity') || fileName.includes('.entity')) {
      // Check for direct repository access in entities
      for (let i = 0; i < lines.length; i++) {
        if (/repository/i.test(lines[i]) && /inject|@Inject/i.test(lines[i])) {
          violations.push(this.createViolation(
            filePath,
            'Entity should not have direct repository dependency',
            i + 1,
            'Repositories should be accessed through aggregate roots or domain services'
          ));
        }
      }
    }

    // Check for aggregate root markers
    if (content.includes('AggregateRoot') || content.includes('@Aggregate')) {
      // Verify it has proper invariants
      if (!content.includes('validate') && !content.includes('invariant')) {
        violations.push(this.createViolation(
          filePath,
          'Aggregate root without invariant validation',
          1,
          'Add invariant validation methods to maintain consistency'
        ));
      }
    }
  }

  private checkRepositoryPatterns(filePath: string, content: string, violations: Violation[]): void {
    const fileName = path.basename(filePath).toLowerCase();

    if (fileName.includes('repository')) {
      const lines = content.split('\n');

      // Check for business logic in repository
      const businessLogicPatterns = [
        /if\s*\(.*\.(status|state|is\w+)/,
        /throw\s+new\s+(?!EntityNotFound|NotFound)/,
      ];

      for (let i = 0; i < lines.length; i++) {
        for (const pattern of businessLogicPatterns) {
          if (pattern.test(lines[i])) {
            violations.push(this.createViolation(
              filePath,
              'Business logic detected in repository',
              i + 1,
              'Move business logic to domain entities or services'
            ));
          }
        }
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
