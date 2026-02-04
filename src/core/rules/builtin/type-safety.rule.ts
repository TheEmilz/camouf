/**
 * Type Safety Rule
 * 
 * Validates type safety practices and detects unsafe type patterns.
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';

interface TypeSafetyConfig extends RuleConfig {
  strictNullChecks?: boolean;
  noExplicitAny?: boolean;
  noTypeAssertions?: boolean;
  allowedAnyPatterns?: string[];
}

export class TypeSafetyRule implements IRule {
  readonly id = 'type-safety';
  readonly name = 'Type Safety';
  readonly description = 'Validates type safety practices and detects unsafe type patterns';
  readonly severity = 'warning' as const;
  readonly tags = ['typescript', 'type-safety', 'quality'];

  private config: TypeSafetyConfig = {
    enabled: true,
    severity: 'warning',
    strictNullChecks: true,
    noExplicitAny: true,
    noTypeAssertions: false,
    allowedAnyPatterns: ['catch', 'test', 'spec', '.d.ts'],
  };

  configure(options: Partial<TypeSafetyConfig>): void {
    this.config = { ...this.config, ...options };
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];

    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      
      // Only check TypeScript files
      if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) continue;

      const content = context.fileContents?.get(filePath);
      if (!content) continue;

      if (this.config.noExplicitAny) {
        this.checkExplicitAny(filePath, content, violations);
      }
      if (this.config.noTypeAssertions) {
        this.checkTypeAssertions(filePath, content, violations);
      }
      if (this.config.strictNullChecks) {
        this.checkNullSafety(filePath, content, violations);
      }
      this.checkUnsafeOperations(filePath, content, violations);
    }

    return { violations };
  }

  private checkExplicitAny(filePath: string, content: string, violations: Violation[]): void {
    // Skip if file matches allowed patterns
    if (this.isAllowedAnyFile(filePath)) return;

    const lines = content.split('\n');
    const anyPatterns = [
      /:\s*any\b/,
      /as\s+any\b/,
      /<any>/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

      for (const pattern of anyPatterns) {
        if (pattern.test(line)) {
          violations.push(this.createViolation(
            filePath,
            'Explicit any type detected',
            i + 1,
            'Use specific types or unknown instead of any'
          ));
          break;
        }
      }
    }
  }

  private checkTypeAssertions(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');
    const assertionPatterns = [
      /as\s+\w+(?:<[^>]+>)?(?!\s*;?\s*$)/, // as SomeType (not at end of statement)
      /<\w+(?:<[^>]+>)?>\s*\(/, // <SomeType>value
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip type definitions and imports
      if (/^import|^export\s+type|^type\s+/.test(line.trim())) continue;

      for (const pattern of assertionPatterns) {
        if (pattern.test(line) && !line.includes('as const')) {
          violations.push(this.createViolation(
            filePath,
            'Type assertion detected',
            i + 1,
            'Consider using type guards or proper type inference'
          ));
          break;
        }
      }
    }
  }

  private checkNullSafety(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for non-null assertions
      if (/\w+!\s*[.[\]]/.test(line) && !line.includes('!==') && !line.includes('!=')) {
        violations.push(this.createViolation(
          filePath,
          'Non-null assertion operator (!) used',
          i + 1,
          'Use optional chaining (?.) or null checks instead'
        ));
      }

      // Check for potentially unsafe property access
      if (/\w+\.\w+\.\w+/.test(line) && !line.includes('?.')) {
        const hasNullCheck = this.hasNullCheckAbove(lines, i, line);
        if (!hasNullCheck) {
          // This is a heuristic - might produce false positives
          // Only flag if it looks like accessing optional data
          if (/response\.|data\.|result\.|user\.|params\.|query\./.test(line)) {
            violations.push(this.createViolation(
              filePath,
              'Potential unsafe deep property access',
              i + 1,
              'Consider using optional chaining (?.) for potentially undefined values'
            ));
          }
        }
      }
    }
  }

  private checkUnsafeOperations(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for JSON.parse without try-catch
      if (/JSON\.parse\s*\(/.test(line)) {
        const hasTryCatch = this.isInTryCatch(lines, i);
        if (!hasTryCatch) {
          violations.push(this.createViolation(
            filePath,
            'JSON.parse without error handling',
            i + 1,
            'Wrap JSON.parse in try-catch or use a safe parsing utility'
          ));
        }
      }

      // Check for eval usage
      if (/\beval\s*\(/.test(line)) {
        violations.push(this.createViolation(
          filePath,
          'Unsafe eval() usage detected',
          i + 1,
          'Avoid eval() - use safer alternatives'
        ));
      }

      // Check for Function constructor
      if (/new\s+Function\s*\(/.test(line)) {
        violations.push(this.createViolation(
          filePath,
          'Unsafe Function constructor usage',
          i + 1,
          'Avoid Function constructor - use regular functions'
        ));
      }
    }
  }

  private isAllowedAnyFile(filePath: string): boolean {
    return this.config.allowedAnyPatterns?.some(p => filePath.includes(p)) || false;
  }

  private hasNullCheckAbove(lines: string[], currentIndex: number, currentLine: string): boolean {
    // Simple heuristic: look for null/undefined checks in previous lines
    const start = Math.max(0, currentIndex - 5);
    const context = lines.slice(start, currentIndex).join('\n');
    
    // Extract the base object being accessed
    const match = currentLine.match(/(\w+)\./);
    if (!match) return true;
    
    const varName = match[1];
    return new RegExp(`${varName}\\s*(!==?|===?)\\s*(null|undefined)|\\?\\.|if\\s*\\(\\s*${varName}\\s*\\)`).test(context);
  }

  private isInTryCatch(lines: string[], currentIndex: number): boolean {
    // Look backwards for try block
    for (let i = currentIndex; i >= Math.max(0, currentIndex - 20); i--) {
      if (/\btry\s*\{/.test(lines[i])) {
        // Check if we're still in the try block
        let braceCount = 0;
        for (let j = i; j <= currentIndex; j++) {
          braceCount += (lines[j].match(/{/g) || []).length;
          braceCount -= (lines[j].match(/}/g) || []).length;
        }
        return braceCount > 0;
      }
    }
    return false;
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
