/**
 * API Versioning Evolution Rule
 * 
 * Validates API versioning practices and evolution patterns.
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';
import * as path from 'path';

interface ApiVersioningConfig extends RuleConfig {
  versioningStrategy?: 'url' | 'header' | 'query';
  requireDeprecationWarnings?: boolean;
  maxSupportedVersions?: number;
}

export class ApiVersioningEvolutionRule implements IRule {
  readonly id = 'api-versioning';
  readonly name = 'API Versioning Evolution';
  readonly description = 'Validates API versioning practices and evolution patterns';
  readonly severity = 'warning' as const;
  readonly tags = ['api', 'versioning', 'evolution'];

  private config: ApiVersioningConfig = {
    enabled: true,
    severity: 'warning',
    versioningStrategy: 'url',
    requireDeprecationWarnings: true,
    maxSupportedVersions: 3,
  };

  configure(options: Partial<ApiVersioningConfig>): void {
    this.config = { ...this.config, ...options };
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];

    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      const fileName = path.basename(filePath).toLowerCase();
      
      if (!this.isApiRelatedFile(fileName)) continue;

      const content = context.fileContents?.get(filePath);
      if (!content) continue;

      this.checkVersionIndicators(filePath, content, violations);
      this.checkBreakingChanges(filePath, content, violations);
      this.checkDeprecationHandling(filePath, content, violations);
    }

    return { violations };
  }

  private isApiRelatedFile(fileName: string): boolean {
    const apiIndicators = ['controller', 'handler', 'router', 'routes', 'endpoint', 'api'];
    return apiIndicators.some(ind => fileName.includes(ind));
  }

  private checkVersionIndicators(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');
    const versionPattern = /\/v\d+\//;
    const hasVersion = versionPattern.test(content);

    if (!hasVersion) {
      const routePatterns = [
        /@(?:Get|Post|Put|Delete|Patch)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /router\.(?:get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g,
      ];

      for (let i = 0; i < lines.length; i++) {
        for (const pattern of routePatterns) {
          pattern.lastIndex = 0;
          const matches = lines[i].matchAll(pattern);
          for (const match of matches) {
            const route = match[1];
            if (!route.includes('/v')) {
              violations.push(this.createViolation(
                filePath,
                `API route without version: ${route}`,
                i + 1,
                `Add version prefix: /v1${route}`
              ));
            }
          }
        }
      }
    }
  }

  private checkBreakingChanges(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');
    const todoBreakingPattern = /(?:TODO|FIXME).*breaking/i;

    for (let i = 0; i < lines.length; i++) {
      if (todoBreakingPattern.test(lines[i])) {
        violations.push(this.createViolation(
          filePath,
          'Breaking change TODO detected',
          i + 1,
          'Ensure breaking changes are properly versioned'
        ));
      }
    }
  }

  private checkDeprecationHandling(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');
    const deprecatedPattern = /@Deprecated|@deprecated|\.deprecated/;

    for (let i = 0; i < lines.length; i++) {
      if (deprecatedPattern.test(lines[i])) {
        const contextLines = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n');
        if (!contextLines.includes('use') && !contextLines.includes('replacement')) {
          violations.push(this.createViolation(
            filePath,
            'Deprecated API without replacement suggestion',
            i + 1,
            'Add documentation about the replacement API'
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
