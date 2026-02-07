/**
 * Context Drift Patterns Rule
 * 
 * Detects when the same concept is implemented with different naming across
 * different parts of the codebase. This is a common pattern in AI-generated code
 * where the AI loses context and refers to the same entity with different names.
 * 
 * Examples:
 * - User vs Customer vs Account for the same concept
 * - email vs userEmail vs emailAddress for the same field
 * - getUserById vs fetchUser vs getUser for similar operations
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';
import * as path from 'path';

interface ContextDriftConfig extends RuleConfig {
  /** Minimum similarity threshold (0-1) to consider as drift */
  similarityThreshold?: number;
  /** Minimum occurrences to consider pattern analysis */
  minOccurrences?: number;
  /** Check interface/type similarities */
  checkTypes?: boolean;
  /** Check function name similarities */
  checkFunctions?: boolean;
  /** Check variable/field name similarities */
  checkFields?: boolean;
  /** Known synonyms that are intentional */
  allowedSynonyms?: string[][];
}

interface EntityDefinition {
  name: string;
  type: 'interface' | 'type' | 'class' | 'function' | 'field';
  file: string;
  line: number;
  properties?: string[];
  parameters?: string[];
}

interface SimilarityGroup {
  canonical: EntityDefinition;
  variants: EntityDefinition[];
  similarity: number;
}

export class ContextDriftPatternsRule implements IRule {
  readonly id = 'context-drift-patterns';
  readonly name = 'Context Drift Pattern Detection';
  readonly description = 'Detects when the same concept is named differently across the codebase, a common AI context-loss error';
  readonly severity = 'warning' as const;
  readonly tags = ['ai-safety', 'naming', 'consistency', 'best-practices'];
  readonly category = 'ai-specific' as const;
  readonly supportsIncremental = false; // Requires full codebase analysis

  private config: ContextDriftConfig = {
    enabled: true,
    severity: 'warning',
    similarityThreshold: 0.75,
    minOccurrences: 2,
    checkTypes: true,
    checkFunctions: true,
    checkFields: true,
    allowedSynonyms: [
      ['id', 'uuid', 'guid'],
      ['email', 'mail'],
      ['password', 'pwd', 'pass'],
      ['user', 'account', 'member'], // Add more domain-specific allowed synonyms
    ],
  };

  private violationCounter = 0;

  // Common naming patterns that suggest same concept
  private readonly conceptPatterns = [
    // Entity patterns
    { base: 'user', variants: ['customer', 'client', 'member', 'account', 'person'] },
    { base: 'order', variants: ['purchase', 'transaction', 'checkout'] },
    { base: 'product', variants: ['item', 'article', 'good', 'sku'] },
    { base: 'payment', variants: ['charge', 'transaction', 'billing'] },
    
    // Action patterns
    { base: 'get', variants: ['fetch', 'retrieve', 'find', 'load', 'read'] },
    { base: 'create', variants: ['add', 'new', 'make', 'insert', 'save'] },
    { base: 'update', variants: ['edit', 'modify', 'change', 'patch', 'set'] },
    { base: 'delete', variants: ['remove', 'destroy', 'drop', 'erase'] },
    
    // Field patterns
    { base: 'id', variants: ['uuid', 'guid', 'key', 'identifier'] },
    { base: 'name', variants: ['title', 'label', 'displayName'] },
    { base: 'description', variants: ['desc', 'details', 'summary', 'info'] },
    { base: 'date', variants: ['timestamp', 'datetime', 'time'] },
    { base: 'created', variants: ['createdAt', 'createDate', 'dateCreated'] },
    { base: 'updated', variants: ['updatedAt', 'updateDate', 'dateUpdated', 'modified'] },
  ];

  configure(options: Partial<ContextDriftConfig>): void {
    this.config = { ...this.config, ...options };
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];
    this.violationCounter = 0;
    
    // Collect all entity definitions
    const entities = await this.collectEntities(context);
    
    // Group similar entities
    const similarGroups = this.findSimilarEntities(entities);
    
    // Generate violations for inconsistent naming
    for (const group of similarGroups) {
      if (group.variants.length > 0) {
        violations.push(...this.createGroupViolations(group));
      }
    }
    
    return { violations };
  }

  private async collectEntities(context: RuleContext): Promise<EntityDefinition[]> {
    const entities: EntityDefinition[] = [];
    
    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;
      
      const filePath = node.data.relativePath;
      const content = context.fileContents?.get(filePath);
      if (!content) continue;
      
      const ext = path.extname(filePath).toLowerCase();
      if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) continue;
      
      // Extract interfaces and types
      if (this.config.checkTypes) {
        entities.push(...this.extractTypes(content, filePath));
      }
      
      // Extract functions
      if (this.config.checkFunctions) {
        entities.push(...this.extractFunctions(content, filePath));
      }
      
      // Extract class definitions
      if (this.config.checkTypes) {
        entities.push(...this.extractClasses(content, filePath));
      }
    }
    
    return entities;
  }

  private extractTypes(content: string, filePath: string): EntityDefinition[] {
    const entities: EntityDefinition[] = [];
    const lines = content.split('\n');
    
    // Match interfaces
    const interfacePattern = /^(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+[\w,\s]+)?\s*\{/gm;
    let match;
    
    while ((match = interfacePattern.exec(content)) !== null) {
      const name = match[1];
      const lineNumber = content.substring(0, match.index).split('\n').length;
      
      // Extract properties from interface body
      const properties = this.extractPropertiesFromBody(content, match.index);
      
      entities.push({
        name,
        type: 'interface',
        file: filePath,
        line: lineNumber,
        properties,
      });
    }
    
    // Match type aliases
    const typePattern = /^(?:export\s+)?type\s+(\w+)\s*=\s*\{/gm;
    
    while ((match = typePattern.exec(content)) !== null) {
      const name = match[1];
      const lineNumber = content.substring(0, match.index).split('\n').length;
      
      const properties = this.extractPropertiesFromBody(content, match.index);
      
      entities.push({
        name,
        type: 'type',
        file: filePath,
        line: lineNumber,
        properties,
      });
    }
    
    return entities;
  }

  private extractFunctions(content: string, filePath: string): EntityDefinition[] {
    const entities: EntityDefinition[] = [];
    
    // Match function declarations
    const patterns = [
      /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/gm,
      /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/gm,
      /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(/gm,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        const lineNumber = content.substring(0, match.index).split('\n').length;
        
        entities.push({
          name,
          type: 'function',
          file: filePath,
          line: lineNumber,
        });
      }
    }
    
    return entities;
  }

  private extractClasses(content: string, filePath: string): EntityDefinition[] {
    const entities: EntityDefinition[] = [];
    
    const classPattern = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?\s*\{/gm;
    let match;
    
    while ((match = classPattern.exec(content)) !== null) {
      const name = match[1];
      const lineNumber = content.substring(0, match.index).split('\n').length;
      
      entities.push({
        name,
        type: 'class',
        file: filePath,
        line: lineNumber,
      });
    }
    
    return entities;
  }

  private extractPropertiesFromBody(content: string, startIndex: number): string[] {
    const properties: string[] = [];
    
    // Find the opening brace
    const braceStart = content.indexOf('{', startIndex);
    if (braceStart === -1) return properties;
    
    // Find matching closing brace
    let depth = 1;
    let i = braceStart + 1;
    let bodyEnd = content.length;
    
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth++;
      if (content[i] === '}') depth--;
      if (depth === 0) {
        bodyEnd = i;
        break;
      }
      i++;
    }
    
    const body = content.substring(braceStart + 1, bodyEnd);
    
    // Extract property names (simplified)
    const propPattern = /^\s*(?:readonly\s+)?(\w+)\s*[?:]?\s*:/gm;
    let match;
    
    while ((match = propPattern.exec(body)) !== null) {
      properties.push(match[1]);
    }
    
    return properties;
  }

  private findSimilarEntities(entities: EntityDefinition[]): SimilarityGroup[] {
    const groups: SimilarityGroup[] = [];
    const processed = new Set<string>();
    
    // Group by type
    const byType = new Map<string, EntityDefinition[]>();
    for (const entity of entities) {
      const key = entity.type;
      if (!byType.has(key)) byType.set(key, []);
      byType.get(key)!.push(entity);
    }
    
    // Find similar entities within each type
    for (const [type, typeEntities] of byType) {
      for (let i = 0; i < typeEntities.length; i++) {
        const entity = typeEntities[i];
        const key = `${entity.file}:${entity.name}`;
        
        if (processed.has(key)) continue;
        processed.add(key);
        
        const variants: EntityDefinition[] = [];
        
        for (let j = i + 1; j < typeEntities.length; j++) {
          const other = typeEntities[j];
          const otherKey = `${other.file}:${other.name}`;
          
          if (processed.has(otherKey)) continue;
          
          // Skip if same file
          if (entity.file === other.file) continue;
          
          const similarity = this.calculateSimilarity(entity, other);
          
          if (similarity >= this.config.similarityThreshold!) {
            // Check if this is an allowed synonym
            if (!this.isAllowedSynonym(entity.name, other.name)) {
              variants.push(other);
              processed.add(otherKey);
            }
          }
        }
        
        if (variants.length > 0) {
          groups.push({
            canonical: entity,
            variants,
            similarity: variants.length > 0 
              ? variants.reduce((sum, v) => sum + this.calculateSimilarity(entity, v), 0) / variants.length
              : 0,
          });
        }
      }
    }
    
    return groups;
  }

  private calculateSimilarity(a: EntityDefinition, b: EntityDefinition): number {
    // Calculate name similarity using multiple methods
    const nameSimilarity = this.calculateNameSimilarity(a.name, b.name);
    
    // If types have properties, compare structural similarity
    if (a.properties && b.properties && a.properties.length > 0 && b.properties.length > 0) {
      const structuralSimilarity = this.calculateStructuralSimilarity(a.properties, b.properties);
      // Weight: 40% name, 60% structure
      return nameSimilarity * 0.4 + structuralSimilarity * 0.6;
    }
    
    return nameSimilarity;
  }

  private calculateNameSimilarity(name1: string, name2: string): number {
    const n1 = this.normalizeName(name1);
    const n2 = this.normalizeName(name2);
    
    // Check for concept pattern match
    for (const pattern of this.conceptPatterns) {
      const matches1 = n1.includes(pattern.base) || pattern.variants.some(v => n1.includes(v));
      const matches2 = n2.includes(pattern.base) || pattern.variants.some(v => n2.includes(v));
      
      if (matches1 && matches2) {
        // Check if they use different variants
        const used1 = [pattern.base, ...pattern.variants].find(v => n1.includes(v));
        const used2 = [pattern.base, ...pattern.variants].find(v => n2.includes(v));
        
        if (used1 && used2 && used1 !== used2) {
          return 0.85; // High similarity due to concept match
        }
      }
    }
    
    // Levenshtein distance-based similarity
    return this.levenshteinSimilarity(n1, n2);
  }

  private normalizeName(name: string): string {
    // Convert to lowercase and split camelCase/PascalCase
    return name
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .toLowerCase()
      .replace(/[_-]/g, ' ')
      .trim();
  }

  private levenshteinSimilarity(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1;
    
    const distance = this.levenshteinDistance(str1, str2);
    return 1 - distance / maxLen;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    
    if (m === 0) return n;
    if (n === 0) return m;
    
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    
    return dp[m][n];
  }

  private calculateStructuralSimilarity(props1: string[], props2: string[]): number {
    if (props1.length === 0 || props2.length === 0) return 0;
    
    // Normalize property names
    const normalized1 = new Set(props1.map(p => p.toLowerCase()));
    const normalized2 = new Set(props2.map(p => p.toLowerCase()));
    
    // Calculate Jaccard similarity
    const intersection = [...normalized1].filter(p => normalized2.has(p)).length;
    const union = new Set([...normalized1, ...normalized2]).size;
    
    return intersection / union;
  }

  private isAllowedSynonym(name1: string, name2: string): boolean {
    const n1 = name1.toLowerCase();
    const n2 = name2.toLowerCase();
    
    for (const synonyms of this.config.allowedSynonyms || []) {
      const normalizedSynonyms = synonyms.map(s => s.toLowerCase());
      if (normalizedSynonyms.includes(n1) && normalizedSynonyms.includes(n2)) {
        return true;
      }
    }
    
    return false;
  }

  private createGroupViolations(group: SimilarityGroup): Violation[] {
    const violations: Violation[] = [];
    
    for (const variant of group.variants) {
      this.violationCounter++;
      
      violations.push({
        id: `drift-${String(this.violationCounter).padStart(3, '0')}`,
        ruleId: this.id,
        ruleName: this.name,
        message: `Context drift detected: '${variant.name}' appears to be the same concept as '${group.canonical.name}' (${Math.round(group.similarity * 100)}% similar)`,
        severity: this.config.severity as 'error' | 'warning' | 'info',
        file: variant.file,
        line: variant.line,
        suggestion: `Consider using consistent naming. The same ${variant.type} appears as '${group.canonical.name}' in ${group.canonical.file}:${group.canonical.line}. Unify naming or create explicit type aliases.`,
        metadata: {
          canonicalName: group.canonical.name,
          canonicalFile: group.canonical.file,
          canonicalLine: group.canonical.line,
          variantName: variant.name,
          entityType: variant.type,
          similarity: group.similarity,
          aiErrorType: 'context-drift',
        },
      });
    }
    
    return violations;
  }
}
