/**
 * Phantom Type References Rule
 * 
 * Detects references to types that don't exist or have been renamed.
 * This is common in AI-generated code where the AI "remembers" old type names
 * or hallucinates type names that look plausible but don't exist.
 * 
 * Examples:
 * - function processOrder(order: OrderDTO) { } // OrderDTO doesn't exist, now it's Order
 * - const user: UserModel = ... // UserModel is undefined
 * - implements IUserRepository // Interface doesn't exist
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';
import * as path from 'path';

interface PhantomTypeConfig extends RuleConfig {
  /** Check function parameter types */
  checkParameters?: boolean;
  /** Check variable type annotations */
  checkVariables?: boolean;
  /** Check return types */
  checkReturnTypes?: boolean;
  /** Check implements clauses */
  checkImplements?: boolean;
  /** Check extends clauses */
  checkExtends?: boolean;
  /** Ignore patterns (e.g., builtin types) */
  ignorePatterns?: string[];
}

interface TypeReference {
  name: string;
  file: string;
  line: number;
  column: number;
  context: 'parameter' | 'variable' | 'return' | 'implements' | 'extends' | 'generic' | 'annotation';
  fullStatement: string;
}

interface TypeDefinition {
  name: string;
  file: string;
  line: number;
  kind: 'interface' | 'type' | 'class' | 'enum';
  isExported: boolean;
}

export class PhantomTypeReferencesRule implements IRule {
  readonly id = 'phantom-type-references';
  readonly name = 'Phantom Type References Detection';
  readonly description = 'Detects references to types that dont exist or have been renamed, a common AI hallucination error';
  readonly severity = 'error' as const;
  readonly tags = ['ai-safety', 'types', 'typescript', 'best-practices'];
  readonly category = 'ai-specific' as const;
  readonly supportsIncremental = false; // Requires knowledge of all types

  private config: PhantomTypeConfig = {
    enabled: true,
    severity: 'error',
    checkParameters: true,
    checkVariables: true,
    checkReturnTypes: true,
    checkImplements: true,
    checkExtends: true,
    ignorePatterns: [],
  };

  private violationCounter = 0;

  // Built-in TypeScript types that should never be flagged
  private readonly builtinTypes = new Set([
    // Primitives
    'string', 'number', 'boolean', 'null', 'undefined', 'void', 'never', 'any', 'unknown', 'object', 'symbol', 'bigint',
    // Common utility types
    'Array', 'Object', 'Function', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt',
    'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Date', 'RegExp', 'Error',
    'Record', 'Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'Exclude', 'Extract',
    'NonNullable', 'Parameters', 'ReturnType', 'InstanceType', 'ThisType',
    'Awaited', 'ConstructorParameters', 'Uppercase', 'Lowercase', 'Capitalize', 'Uncapitalize',
    // DOM types (common in frontend)
    'HTMLElement', 'HTMLDivElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLFormElement',
    'HTMLAnchorElement', 'HTMLImageElement', 'HTMLSpanElement', 'HTMLTableElement',
    'Element', 'Node', 'Document', 'Window', 'Event', 'MouseEvent', 'KeyboardEvent',
    'React', 'ReactNode', 'ReactElement', 'FC', 'Component', 'JSX',
    // Node.js types
    'Buffer', 'NodeJS', 'Process',
    // Common patterns
    'T', 'K', 'V', 'P', 'R', 'U', 'S', 'E', // Generic type parameters
  ]);

  // Common type suffixes that might indicate a phantom type
  private readonly suspiciousSuffixes = ['DTO', 'Model', 'Entity', 'Interface', 'Type', 'Props', 'State', 'Data', 'Info', 'Response', 'Request'];

  configure(options: Partial<PhantomTypeConfig>): void {
    this.config = { ...this.config, ...options };
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];
    this.violationCounter = 0;

    // First pass: collect all type definitions
    const typeDefinitions = await this.collectTypeDefinitions(context);
    const definedTypes = new Set(typeDefinitions.map(t => t.name));

    // Second pass: find type references and check if they exist
    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      const content = context.fileContents?.get(filePath);
      if (!content) continue;

      const ext = path.extname(filePath).toLowerCase();
      if (!['.ts', '.tsx'].includes(ext)) continue;

      const references = this.extractTypeReferences(content, filePath);

      for (const ref of references) {
        // Skip builtin types
        if (this.isBuiltinType(ref.name)) continue;

        // Skip ignored patterns
        if (this.matchesIgnorePattern(ref.name)) continue;

        // Skip if type is defined locally in the same file
        if (this.isDefinedInFile(content, ref.name)) continue;

        // Skip if type is imported
        if (this.isImportedInFile(content, ref.name)) continue;

        // Check if type exists in project
        if (!definedTypes.has(ref.name)) {
          // Find similar types to suggest
          const suggestion = this.findSimilarType(ref.name, definedTypes);
          violations.push(this.createViolation(ref, suggestion));
        }
      }
    }

    return { violations };
  }

  private async collectTypeDefinitions(context: RuleContext): Promise<TypeDefinition[]> {
    const definitions: TypeDefinition[] = [];

    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      const content = context.fileContents?.get(filePath);
      if (!content) continue;

      const ext = path.extname(filePath).toLowerCase();
      if (!['.ts', '.tsx'].includes(ext)) continue;

      definitions.push(...this.extractTypeDefinitions(content, filePath));
    }

    return definitions;
  }

  private extractTypeDefinitions(content: string, filePath: string): TypeDefinition[] {
    const definitions: TypeDefinition[] = [];

    const patterns = [
      { kind: 'interface' as const, pattern: /^(?:export\s+)?interface\s+(\w+)/gm },
      { kind: 'type' as const, pattern: /^(?:export\s+)?type\s+(\w+)\s*(?:<[^>]*>)?\s*=/gm },
      { kind: 'class' as const, pattern: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm },
      { kind: 'enum' as const, pattern: /^(?:export\s+)?(?:const\s+)?enum\s+(\w+)/gm },
    ];

    for (const { kind, pattern } of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const isExported = match[0].includes('export');

        definitions.push({
          name,
          file: filePath,
          line: lineNumber,
          kind,
          isExported,
        });
      }
    }

    return definitions;
  }

  private extractTypeReferences(content: string, filePath: string): TypeReference[] {
    const references: TypeReference[] = [];

    // Type annotation patterns
    const patterns: Array<{ context: TypeReference['context']; pattern: RegExp }> = [];

    if (this.config.checkParameters) {
      // Function parameters: (param: TypeName)
      patterns.push({
        context: 'parameter',
        pattern: /\(\s*(?:\w+\s*:\s*)?(\w+)(?:\s*[,)])/g,
      });
      // Explicit param types: param: TypeName
      patterns.push({
        context: 'parameter',
        pattern: /(?:^|[(,])\s*\w+\s*:\s*(\w+)(?:<[^>]*>)?(?:\s*[,)=])/gm,
      });
    }

    if (this.config.checkVariables) {
      // Variable type annotations: const x: TypeName
      patterns.push({
        context: 'variable',
        pattern: /(?:const|let|var)\s+\w+\s*:\s*(\w+)(?:<[^>]*>)?/g,
      });
    }

    if (this.config.checkReturnTypes) {
      // Function return types: ): TypeName
      patterns.push({
        context: 'return',
        pattern: /\)\s*:\s*(?:Promise<)?(\w+)(?:>)?(?:\s*[{=])/g,
      });
    }

    if (this.config.checkImplements) {
      // Implements clause: implements TypeName
      patterns.push({
        context: 'implements',
        pattern: /implements\s+([\w,\s]+)(?:\s*\{)/g,
      });
    }

    if (this.config.checkExtends) {
      // Extends clause: extends TypeName
      patterns.push({
        context: 'extends',
        pattern: /(?:class|interface)\s+\w+\s+extends\s+(\w+)/g,
      });
    }

    // Generic type arguments: TypeName<OtherType>
    patterns.push({
      context: 'generic',
      pattern: /(\w+)<(\w+)(?:,\s*(\w+))*>/g,
    });

    for (const { context, pattern } of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        // Handle multiple captures (like implements multiple interfaces)
        for (let i = 1; i < match.length; i++) {
          const capture = match[i];
          if (!capture) continue;

          // Split by comma for implements clauses
          const typeNames = capture.split(',').map(t => t.trim()).filter(t => t);

          for (const typeName of typeNames) {
            if (!typeName || !typeName.match(/^[A-Z]\w*$/)) continue; // Skip non-type-like names

            const lineNumber = content.substring(0, match.index).split('\n').length;
            const lastNewline = content.lastIndexOf('\n', match.index);
            const column = match.index - lastNewline;

            references.push({
              name: typeName,
              file: filePath,
              line: lineNumber,
              column,
              context,
              fullStatement: match[0],
            });
          }
        }
      }
    }

    return references;
  }

  private isBuiltinType(typeName: string): boolean {
    return this.builtinTypes.has(typeName);
  }

  private matchesIgnorePattern(typeName: string): boolean {
    for (const pattern of this.config.ignorePatterns || []) {
      if (new RegExp(pattern).test(typeName)) return true;
    }
    return false;
  }

  private isDefinedInFile(content: string, typeName: string): boolean {
    // Check for local type/interface/class/enum definition
    const patterns = [
      new RegExp(`^\\s*(?:export\\s+)?interface\\s+${typeName}\\b`, 'm'),
      new RegExp(`^\\s*(?:export\\s+)?type\\s+${typeName}\\s*(?:<|=)`, 'm'),
      new RegExp(`^\\s*(?:export\\s+)?(?:abstract\\s+)?class\\s+${typeName}\\b`, 'm'),
      new RegExp(`^\\s*(?:export\\s+)?(?:const\\s+)?enum\\s+${typeName}\\b`, 'm'),
    ];

    return patterns.some(p => p.test(content));
  }

  private isImportedInFile(content: string, typeName: string): boolean {
    // Check for various import patterns
    const patterns = [
      // Named import: import { TypeName } from ...
      new RegExp(`import\\s*\\{[^}]*\\b${typeName}\\b[^}]*\\}\\s*from`, 'm'),
      // Default import: import TypeName from ...
      new RegExp(`import\\s+${typeName}\\s+from`, 'm'),
      // Namespace import: import * as Namespace from ... (and using Namespace.TypeName)
      new RegExp(`import\\s+\\*\\s+as\\s+\\w+`, 'm'),
      // Type import: import type { TypeName } from ...
      new RegExp(`import\\s+type\\s*\\{[^}]*\\b${typeName}\\b[^}]*\\}\\s*from`, 'm'),
    ];

    return patterns.some(p => p.test(content));
  }

  private findSimilarType(typeName: string, definedTypes: Set<string>): string | null {
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const defined of definedTypes) {
      const score = this.calculateSimilarity(typeName, defined);
      if (score > bestScore && score > 0.6) {
        bestScore = score;
        bestMatch = defined;
      }
    }

    return bestMatch;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Normalize: remove common suffixes and compare
    const normalized1 = this.normalizTypeName(str1);
    const normalized2 = this.normalizTypeName(str2);

    if (normalized1 === normalized2) return 0.95;

    // Levenshtein-based similarity
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1;

    const distance = this.levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    return 1 - distance / maxLen;
  }

  private normalizTypeName(name: string): string {
    let normalized = name;
    for (const suffix of this.suspiciousSuffixes) {
      if (normalized.endsWith(suffix) && normalized.length > suffix.length) {
        normalized = normalized.slice(0, -suffix.length);
      }
    }
    return normalized.toLowerCase();
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

  private createViolation(ref: TypeReference, suggestion: string | null): Violation {
    this.violationCounter++;

    const suggestionText = suggestion
      ? `Did you mean '${suggestion}'? Check if the type was renamed or if you need to import it.`
      : `Verify the type exists and is properly imported. Common issues: typo in type name, missing import, or type was renamed.`;

    return {
      id: `phantom-${String(this.violationCounter).padStart(3, '0')}`,
      ruleId: this.id,
      ruleName: this.name,
      message: `Phantom type reference: '${ref.name}' is not defined or imported`,
      severity: this.config.severity as 'error' | 'warning' | 'info',
      file: ref.file,
      line: ref.line,
      column: ref.column,
      suggestion: suggestionText,
      metadata: {
        typeName: ref.name,
        context: ref.context,
        suggestedType: suggestion,
        aiErrorType: 'phantom-type-reference',
      },
    };
  }
}
