/**
 * Security Context Rule
 * 
 * Validates security context propagation and authorization patterns.
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';
import * as path from 'path';

interface SecurityContextConfig extends RuleConfig {
  requireAuthentication?: boolean;
  requireAuthorization?: boolean;
  sensitiveRoutes?: string[];
  publicRoutes?: string[];
}

export class SecurityContextRule implements IRule {
  readonly id = 'security-context';
  readonly name = 'Security Context Propagation';
  readonly description = 'Validates security context propagation and authorization patterns';
  readonly severity = 'error' as const;
  readonly tags = ['security', 'authentication', 'authorization'];

  private config: SecurityContextConfig = {
    enabled: true,
    severity: 'error',
    requireAuthentication: true,
    requireAuthorization: true,
    sensitiveRoutes: ['/admin', '/api/users', '/api/settings'],
    publicRoutes: ['/health', '/public', '/auth/login'],
  };

  configure(options: Partial<SecurityContextConfig>): void {
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

      const fileName = path.basename(filePath).toLowerCase();
      
      if (this.isSecurityRelevantFile(fileName)) {
        this.checkAuthenticationMiddleware(filePath, content, violations);
        this.checkAuthorizationDecorators(filePath, content, violations);
        this.checkSecurityHeaders(filePath, content, violations);
        this.checkSensitiveDataHandling(filePath, content, violations);
      }
    }

    return { violations };
  }

  private isSecurityRelevantFile(fileName: string): boolean {
    const relevantPatterns = ['controller', 'handler', 'router', 'middleware', 'guard', 'auth'];
    return relevantPatterns.some(p => fileName.includes(p));
  }

  private checkAuthenticationMiddleware(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');
    
    // Look for routes/endpoints
    const routePatterns = [
      /@(?:Get|Post|Put|Delete|Patch)\s*\(\s*['"]([^'"]+)['"]\s*\)/,
      /router\.(?:get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const pattern of routePatterns) {
        const match = line.match(pattern);
        if (match) {
          const route = match[1];
          
          // Check if it's a public route
          if (this.isPublicRoute(route)) continue;

          // Look for auth guards/middleware in surrounding context
          const contextStart = Math.max(0, i - 5);
          const contextEnd = Math.min(lines.length, i + 2);
          const context = lines.slice(contextStart, contextEnd).join('\n');

          const hasAuth = /@UseGuards|@Auth|authenticate|isAuthenticated|requireAuth|@Public\(false\)/.test(context);
          
          if (!hasAuth && this.config.requireAuthentication) {
            violations.push(this.createViolation(
              filePath,
              `Route '${route}' without authentication guard`,
              i + 1,
              'Add authentication middleware or guard'
            ));
          }

          // Check for authorization on sensitive routes
          if (this.isSensitiveRoute(route)) {
            const hasAuthorization = /@Roles|@Permissions|@Authorize|authorize|checkPermission/.test(context);
            
            if (!hasAuthorization && this.config.requireAuthorization) {
              violations.push(this.createViolation(
                filePath,
                `Sensitive route '${route}' without authorization`,
                i + 1,
                'Add role-based or permission-based authorization'
              ));
            }
          }
        }
      }
    }
  }

  private checkAuthorizationDecorators(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');

    // Check for direct database access in controllers without authorization
    if (filePath.toLowerCase().includes('controller')) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (/repository\.|\.find\(|\.save\(|\.delete\(|\.update\(/.test(line)) {
          // Check if there's authorization above
          const contextAbove = lines.slice(Math.max(0, i - 10), i).join('\n');
          
          if (!/@Roles|@Permissions|authorize|checkPermission/.test(contextAbove)) {
            violations.push(this.createViolation(
              filePath,
              'Direct data access in controller without authorization check',
              i + 1,
              'Add authorization check before data operations'
            ));
          }
        }
      }
    }
  }

  private checkSecurityHeaders(filePath: string, content: string, violations: Violation[]): void {
    // Check for response handling without security headers
    if (content.includes('res.send') || content.includes('res.json')) {
      const hasHelmet = content.includes('helmet') || content.includes('Helmet');
      const hasSecurityHeaders = content.includes('X-Content-Type-Options') ||
                                 content.includes('X-Frame-Options') ||
                                 content.includes('Content-Security-Policy');

      if (!hasHelmet && !hasSecurityHeaders) {
        violations.push(this.createViolation(
          filePath,
          'Response handling without security headers',
          1,
          'Use helmet middleware or set security headers manually'
        ));
      }
    }
  }

  private checkSensitiveDataHandling(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard', 'ssn'];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();

      for (const field of sensitiveFields) {
        if (line.includes(field)) {
          // Check if it's being exposed in response
          if (/res\.(json|send)\s*\(/.test(lines[i]) || /return\s+\{/.test(lines[i])) {
            violations.push(this.createViolation(
              filePath,
              `Potential sensitive data '${field}' in response`,
              i + 1,
              'Exclude sensitive fields from API responses using DTOs or serialization'
            ));
          }
        }
      }
    }
  }

  private isPublicRoute(route: string): boolean {
    return this.config.publicRoutes?.some(p => route.startsWith(p)) || false;
  }

  private isSensitiveRoute(route: string): boolean {
    return this.config.sensitiveRoutes?.some(p => route.startsWith(p)) || false;
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
