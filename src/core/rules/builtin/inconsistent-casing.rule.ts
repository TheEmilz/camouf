/**
 * Inconsistent Casing Rule
 * 
 * Detects inconsistencies in naming conventions within the codebase.
 * AI coding assistants often switch between naming conventions when they
 * lose context or are influenced by training data from different languages.
 * 
 * Examples:
 * - getUserById() and get_user_by_id() in the same file
 * - camelCase and snake_case mixed in the same component
 * - PascalCase and camelCase for similar entities
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';
import * as path from 'path';

type CasingStyle = 'camelCase' | 'PascalCase' | 'snake_case' | 'SCREAMING_SNAKE_CASE' | 'kebab-case' | 'unknown';

interface InconsistentCasingConfig extends RuleConfig {
  /** Check function names */
  checkFunctions?: boolean;
  /** Check variable names */
  checkVariables?: boolean;
  /** Check property names */
  checkProperties?: boolean;
  /** Check method names */
  checkMethods?: boolean;
  /** Preferred casing style for identifiers */
  preferredCasing?: CasingStyle;
  /** Minimum identifiers to analyze before flagging inconsistency */
  minIdentifiers?: number;
  /** Threshold percentage for dominant style (0-100) */
  dominantStyleThreshold?: number;
}

interface IdentifierInfo {
  name: string;
  style: CasingStyle;
  type: 'function' | 'variable' | 'property' | 'method' | 'constant';
  line: number;
  column: number;
}

interface CasingAnalysis {
  file: string;
  dominantStyle: CasingStyle;
  identifiers: IdentifierInfo[];
  violations: IdentifierInfo[];
  styleDistribution: Map<CasingStyle, number>;
}

export class InconsistentCasingRule implements IRule {
  readonly id = 'inconsistent-casing';
  readonly name = 'Inconsistent Casing Detection';
  readonly description = 'Detects mixing of naming conventions (camelCase, snake_case, etc.) within the same codebase';
  readonly severity = 'warning' as const;
  readonly tags = ['ai-safety', 'naming', 'style', 'consistency'];
  readonly category = 'naming' as const;
  readonly supportsIncremental = true;

  private config: InconsistentCasingConfig = {
    enabled: true,
    severity: 'warning',
    checkFunctions: true,
    checkVariables: true,
    checkProperties: true,
    checkMethods: true,
    minIdentifiers: 5,
    dominantStyleThreshold: 70,
  };

  private violationCounter = 0;

  // Words that are commonly all-caps (acronyms, initialisms)
  private readonly commonAcronyms = new Set([
    'ID', 'URL', 'URI', 'API', 'HTML', 'CSS', 'JSON', 'XML', 'HTTP', 'HTTPS',
    'SQL', 'JWT', 'UUID', 'GUID', 'DOM', 'SDK', 'PDF', 'UI', 'UX', 'IO',
  ]);

  configure(options: Partial<InconsistentCasingConfig>): void {
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
      if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) continue;

      const analysis = this.analyzeFile(content, filePath);
      
      if (analysis.violations.length > 0) {
        violations.push(...this.createViolations(analysis));
      }
    }

    return { violations };
  }

  private analyzeFile(content: string, filePath: string): CasingAnalysis {
    const identifiers = this.extractIdentifiers(content);
    const styleDistribution = this.calculateStyleDistribution(identifiers);
    const dominantStyle = this.findDominantStyle(styleDistribution, identifiers.length);
    
    // Find identifiers that don't match the dominant style
    const violations: IdentifierInfo[] = [];
    
    if (dominantStyle !== 'unknown') {
      for (const identifier of identifiers) {
        // Skip if it matches dominant style
        if (identifier.style === dominantStyle) continue;
        
        // Skip SCREAMING_SNAKE_CASE for constants (usually intentional)
        if (identifier.type === 'constant' && identifier.style === 'SCREAMING_SNAKE_CASE') continue;
        
        // Skip PascalCase for constructors/classes
        if (identifier.style === 'PascalCase' && this.isPascalCaseAcceptable(identifier)) continue;
        
        // Skip if it's an acronym
        if (this.isAcronymOrAbbreviation(identifier.name)) continue;
        
        violations.push(identifier);
      }
    }

    return {
      file: filePath,
      dominantStyle,
      identifiers,
      violations,
      styleDistribution,
    };
  }

  private extractIdentifiers(content: string): IdentifierInfo[] {
    const identifiers: IdentifierInfo[] = [];
    const lines = content.split('\n');

    // Patterns for different identifier types
    const patterns: Array<{ type: IdentifierInfo['type']; pattern: RegExp }> = [];

    if (this.config.checkFunctions) {
      // Function declarations: function myFunc() or async function myFunc()
      patterns.push({
        type: 'function',
        pattern: /(?:async\s+)?function\s+(\w+)/g,
      });
      // Arrow functions: const myFunc = () or const myFunc = async ()
      patterns.push({
        type: 'function',
        pattern: /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w]+)\s*=>/g,
      });
    }

    if (this.config.checkVariables) {
      // Variable declarations (but not destructuring)
      patterns.push({
        type: 'variable',
        pattern: /(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=/g,
      });
    }

    if (this.config.checkMethods) {
      // Class methods: methodName() { or async methodName() {
      patterns.push({
        type: 'method',
        pattern: /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/gm,
      });
    }

    if (this.config.checkProperties) {
      // Object properties: propertyName: value
      patterns.push({
        type: 'property',
        pattern: /^\s*(\w+)\s*:/gm,
      });
    }

    for (const { type, pattern } of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        
        // Skip very short names (single letters, common abbreviations)
        if (name.length < 2) continue;
        
        // Skip common keywords that might match
        if (this.isKeywordOrBuiltin(name)) continue;

        const lineNumber = content.substring(0, match.index).split('\n').length;
        const lastNewline = content.lastIndexOf('\n', match.index);
        const column = match.index - lastNewline;
        
        const style = this.detectCasingStyle(name);
        
        // Determine if it's a constant (all caps or const with uppercase)
        const actualType = style === 'SCREAMING_SNAKE_CASE' ? 'constant' : type;

        identifiers.push({
          name,
          style,
          type: actualType,
          line: lineNumber,
          column,
        });
      }
    }

    return identifiers;
  }

  private detectCasingStyle(name: string): CasingStyle {
    // SCREAMING_SNAKE_CASE: ALL_CAPS_WITH_UNDERSCORES
    if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(name)) {
      return 'SCREAMING_SNAKE_CASE';
    }
    
    // snake_case: lowercase_with_underscores
    if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(name)) {
      return 'snake_case';
    }
    
    // kebab-case: lowercase-with-dashes (usually in strings, not identifiers)
    if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(name)) {
      return 'kebab-case';
    }
    
    // PascalCase: CapitalizedWords
    if (/^[A-Z][a-z0-9]*(?:[A-Z][a-z0-9]*)*$/.test(name)) {
      return 'PascalCase';
    }
    
    // camelCase: firstWordLowercase
    if (/^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)*$/.test(name)) {
      return 'camelCase';
    }
    
    // Handle mixed cases with numbers and acronyms
    if (/^[a-z]/.test(name) && !name.includes('_')) {
      return 'camelCase';
    }
    
    if (/^[A-Z]/.test(name) && !name.includes('_')) {
      return 'PascalCase';
    }
    
    return 'unknown';
  }

  private calculateStyleDistribution(identifiers: IdentifierInfo[]): Map<CasingStyle, number> {
    const distribution = new Map<CasingStyle, number>();
    
    for (const identifier of identifiers) {
      const count = distribution.get(identifier.style) || 0;
      distribution.set(identifier.style, count + 1);
    }
    
    return distribution;
  }

  private findDominantStyle(distribution: Map<CasingStyle, number>, totalCount: number): CasingStyle {
    if (totalCount < this.config.minIdentifiers!) {
      return 'unknown'; // Not enough data to determine
    }

    // Get all styles with counts (excluding unknown and SCREAMING_SNAKE_CASE for constants)
    const styleCounts: Array<{ style: CasingStyle; count: number }> = [];
    
    for (const [style, count] of distribution) {
      if (style === 'unknown') continue;
      if (style === 'SCREAMING_SNAKE_CASE') continue; // Constants are special
      styleCounts.push({ style, count });
    }

    // Sort by count descending
    styleCounts.sort((a, b) => b.count - a.count);
    
    if (styleCounts.length === 0) {
      return 'unknown';
    }

    const maxStyle = styleCounts[0].style;
    const maxCount = styleCounts[0].count;
    
    // Check if dominant style meets threshold
    const percentage = (maxCount / totalCount) * 100;
    if (percentage >= this.config.dominantStyleThreshold!) {
      return maxStyle;
    }

    // NEW: If there's a clear winner (most common style), use it as dominant
    // This catches mixed codebases where neither reaches 70%
    // but one style is clearly more common than others
    if (styleCounts.length >= 2) {
      const secondCount = styleCounts[1].count;
      // If the most common style has at least 50% more occurrences than second
      // OR if it's the plurality leader, treat it as dominant
      if (maxCount > secondCount || maxCount >= 3) {
        return maxStyle;
      }
    } else if (maxCount >= 2) {
      // Only one style detected with multiple occurrences
      return maxStyle;
    }

    return 'unknown';
  }

  private isKeywordOrBuiltin(name: string): boolean {
    const keywords = new Set([
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
      'return', 'function', 'class', 'const', 'let', 'var', 'new', 'this',
      'super', 'extends', 'implements', 'import', 'export', 'default', 'from',
      'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof',
      'in', 'of', 'true', 'false', 'null', 'undefined', 'void', 'delete',
      'constructor', 'prototype', 'arguments',
    ]);
    return keywords.has(name);
  }

  private isPascalCaseAcceptable(identifier: IdentifierInfo): boolean {
    // PascalCase is acceptable for things that look like class names or components
    const name = identifier.name;
    
    // React components often use PascalCase
    if (name.endsWith('Component') || name.endsWith('Provider') || name.endsWith('Context')) {
      return true;
    }
    
    // Class-like patterns
    if (name.endsWith('Service') || name.endsWith('Controller') || name.endsWith('Handler')) {
      return true;
    }
    
    // Type-like patterns
    if (name.endsWith('Type') || name.endsWith('Interface') || name.endsWith('Enum')) {
      return true;
    }
    
    return false;
  }

  private isAcronymOrAbbreviation(name: string): boolean {
    // Check if the name is or contains a known acronym
    for (const acronym of this.commonAcronyms) {
      if (name === acronym) return true;
      if (name.includes(acronym)) return true;
    }
    
    // Very short all-caps names are likely abbreviations
    if (name.length <= 3 && /^[A-Z]+$/.test(name)) {
      return true;
    }
    
    return false;
  }

  private createViolations(analysis: CasingAnalysis): Violation[] {
    const violations: Violation[] = [];

    for (const identifier of analysis.violations) {
      this.violationCounter++;

      const expectedStyle = this.config.preferredCasing || analysis.dominantStyle;
      const suggestion = this.suggestRename(identifier.name, expectedStyle);

      violations.push({
        id: `casing-${String(this.violationCounter).padStart(3, '0')}`,
        ruleId: this.id,
        ruleName: this.name,
        message: `Inconsistent casing: '${identifier.name}' uses ${identifier.style} but codebase predominantly uses ${analysis.dominantStyle}`,
        severity: this.config.severity as 'error' | 'warning' | 'info',
        file: analysis.file,
        line: identifier.line,
        column: identifier.column,
        suggestion: `Consider renaming to ${suggestion} to match project conventions`,
        metadata: {
          identifierName: identifier.name,
          identifierType: identifier.type,
          currentStyle: identifier.style,
          expectedStyle: analysis.dominantStyle,
          suggestedName: suggestion,
          aiErrorType: 'inconsistent-casing',
          styleDistribution: Object.fromEntries(analysis.styleDistribution),
        },
      });
    }

    return violations;
  }

  private suggestRename(name: string, targetStyle: CasingStyle): string {
    // Split name into words
    const words = this.splitIntoWords(name);
    
    switch (targetStyle) {
      case 'camelCase':
        return words.map((w, i) => i === 0 ? w.toLowerCase() : this.capitalize(w)).join('');
      
      case 'PascalCase':
        return words.map(w => this.capitalize(w)).join('');
      
      case 'snake_case':
        return words.map(w => w.toLowerCase()).join('_');
      
      case 'SCREAMING_SNAKE_CASE':
        return words.map(w => w.toUpperCase()).join('_');
      
      case 'kebab-case':
        return words.map(w => w.toLowerCase()).join('-');
      
      default:
        return name;
    }
  }

  private splitIntoWords(name: string): string[] {
    // Handle different separators
    if (name.includes('_')) {
      return name.split('_').filter(w => w.length > 0);
    }
    
    if (name.includes('-')) {
      return name.split('-').filter(w => w.length > 0);
    }
    
    // Split camelCase/PascalCase
    return name
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(' ')
      .filter(w => w.length > 0);
  }

  private capitalize(word: string): string {
    if (word.length === 0) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
}
