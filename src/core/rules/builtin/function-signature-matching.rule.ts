/**
 * Function Signature Matching Rule
 * 
 * Detects mismatches between function signatures, type fields, and API contracts
 * across frontend/backend boundaries. This rule is specifically designed to catch
 * errors commonly made by AI agents with limited context windows.
 * 
 * Common scenarios detected:
 * - Backend: getUserById(id) vs Frontend calls: getUser(userId)
 * - Shared DTO: CreateUserDTO.email vs Frontend: data.userEmail
 * - API endpoint mismatch between definition and consumption
 */

// fs import removed - not used
import * as path from 'path';
import { IRule, RuleContext, RuleConfig, RuleResult, RuleDocumentation } from '../rule.interface.js';
import { Violation, FileChange } from '../../../types/core.types.js';

// ============================================================================
// Configuration Interface
// ============================================================================

interface FunctionSignatureConfig extends RuleConfig {
  /** Directories containing shared types/interfaces */
  sharedDirectories?: string[];
  /** Directories containing client/frontend code */
  clientDirectories?: string[];
  /** Directories containing server/backend code */
  serverDirectories?: string[];
  /** Fuzzy matching threshold (0-1, default 0.7) */
  similarityThreshold?: number;
  /** Maximum Levenshtein distance for name suggestions */
  maxEditDistance?: number;
  /** Check function parameter names */
  checkParameterNames?: boolean;
  /** Check type field usage */
  checkTypeFields?: boolean;
  /** Generate quick-fix commands */
  generateQuickFixes?: boolean;
}

// ============================================================================
// Type Definitions
// ============================================================================

interface ExportedFunction {
  name: string;
  filePath: string;
  line: number;
  parameters: FunctionParameter[];
  returnType?: string;
  isAsync?: boolean;
}

interface FunctionParameter {
  name: string;
  type?: string;
  optional?: boolean;
  defaultValue?: string;
}

interface ExportedType {
  name: string;
  filePath: string;
  line: number;
  kind: 'interface' | 'type' | 'class' | 'enum';
  fields: TypeField[];
}

interface TypeField {
  name: string;
  type?: string;
  optional?: boolean;
}

interface FunctionCall {
  calledName: string;
  filePath: string;
  line: number;
  column?: number;
  arguments: string[];
  importedFrom?: string;
}

interface FieldAccess {
  objectType: string;
  fieldName: string;
  filePath: string;
  line: number;
  column?: number;
}

interface SignatureMismatch {
  id: string;
  type: 'function-name' | 'parameter-name' | 'parameter-count' | 'type-field' | 'missing-field';
  expected: string;
  found: string;
  definedIn: { file: string; line: number };
  usedIn: { file: string; line: number; column?: number };
  similarity?: number;
  suggestions?: string[];
  quickFix?: QuickFix;
}

interface QuickFix {
  id: string;
  command: string;
  description: string;
  changes: FileChange[];
}

// ============================================================================
// Rule Implementation
// ============================================================================

export class FunctionSignatureMatchingRule implements IRule {
  readonly id = 'function-signature-matching';
  readonly name = 'Function Signature Matching';
  readonly description = 'Detects function name, parameter, and type field mismatches between frontend and backend code';
  readonly severity = 'error' as const;
  readonly tags = ['architecture', 'contracts', 'ai-safety', 'cross-boundary'];
  readonly supportsIncremental = true;

  private config: FunctionSignatureConfig = {
    enabled: true,
    severity: 'error',
    sharedDirectories: ['shared', 'common', 'types', 'contracts', 'api'],
    clientDirectories: ['client', 'frontend', 'web', 'app', 'pages', 'components'],
    serverDirectories: ['server', 'backend', 'api', 'services'],
    similarityThreshold: 0.7,
    maxEditDistance: 3,
    checkParameterNames: true,
    checkTypeFields: true,
    generateQuickFixes: true,
  };

  // Cache for parsed exports
  private exportedFunctions: Map<string, ExportedFunction> = new Map();
  private exportedTypes: Map<string, ExportedType> = new Map();
  private mismatches: SignatureMismatch[] = [];
  private mismatchCounter = 0;

  configure(options: Partial<FunctionSignatureConfig>): void {
    this.config = { ...this.config, ...options };
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];
    this.mismatches = [];
    this.mismatchCounter = 0;
    this.exportedFunctions.clear();
    this.exportedTypes.clear();

    // Load config directories
    const sharedDirs = this.config.sharedDirectories || context.config.directories?.shared || [];
    const clientDirs = this.config.clientDirectories || context.config.directories?.client || [];
    const serverDirs = this.config.serverDirectories || context.config.directories?.server || [];

    // Phase 1: Extract all exports from shared directories
    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      const content = context.fileContents?.get(filePath);
      if (!content) continue;

      if (this.isInDirectories(filePath, sharedDirs)) {
        this.extractExports(filePath, content);
      }
    }

    // Phase 2: Check client and server files for mismatches
    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      const content = context.fileContents?.get(filePath);
      if (!content) continue;

      const isClient = this.isInDirectories(filePath, clientDirs);
      const isServer = this.isInDirectories(filePath, serverDirs);

      if (isClient || isServer) {
        this.checkFileForMismatches(filePath, content, violations);
      }
    }

    // Generate quick-fix metadata for HTML report
    if (this.config.generateQuickFixes && this.mismatches.length > 0) {
      this.attachQuickFixMetadata(violations);
    }

    return {
      violations,
      metadata: {
        mismatches: this.mismatches,
        exportedFunctions: Array.from(this.exportedFunctions.values()),
        exportedTypes: Array.from(this.exportedTypes.values()),
      },
    };
  }

  /**
   * Incremental file check for watch mode.
   * This method is called when a file changes to validate it without full graph rebuild.
   */
  async checkFile(filePath: string, context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];
    this.mismatches = [];
    this.mismatchCounter = 0;

    // Get config directories
    const sharedDirs = this.config.sharedDirectories || context.config.directories?.shared || [];
    const clientDirs = this.config.clientDirectories || context.config.directories?.client || [];
    const serverDirs = this.config.serverDirectories || context.config.directories?.server || [];

    // Ensure exports are loaded from shared files (may need to rebuild cache)
    if (this.exportedFunctions.size === 0 && this.exportedTypes.size === 0) {
      // Load all shared files to build the export cache
      for (const nodeId of context.graph.nodes()) {
        const node = context.getNodeData(nodeId);
        if (!node) continue;

        const fp = node.data.relativePath;
        const content = context.fileContents?.get(fp);
        if (!content) continue;

        if (this.isInDirectories(fp, sharedDirs)) {
          this.extractExports(fp, content);
        }
      }
    }

    // If the changed file is a shared file, re-extract its exports
    if (this.isInDirectories(filePath, sharedDirs)) {
      const content = context.fileContents?.get(filePath);
      if (content) {
        // Clear old exports from this file and re-extract
        this.clearExportsFromFile(filePath);
        this.extractExports(filePath, content);
      }
    }

    // Check the changed file for mismatches
    const isClient = this.isInDirectories(filePath, clientDirs);
    const isServer = this.isInDirectories(filePath, serverDirs);

    if (isClient || isServer) {
      const content = context.fileContents?.get(filePath);
      if (content) {
        this.checkFileForMismatches(filePath, content, violations);
      }
    }

    // Generate quick-fix metadata
    if (this.config.generateQuickFixes && this.mismatches.length > 0) {
      this.attachQuickFixMetadata(violations);
    }

    return {
      violations,
      metadata: {
        mismatches: this.mismatches,
        exportedFunctions: Array.from(this.exportedFunctions.values()),
        exportedTypes: Array.from(this.exportedTypes.values()),
      },
    };
  }

  /**
   * Clear cached exports from a specific file
   */
  private clearExportsFromFile(filePath: string): void {
    for (const [name, func] of this.exportedFunctions) {
      if (func.filePath === filePath) {
        this.exportedFunctions.delete(name);
      }
    }
    for (const [name, type] of this.exportedTypes) {
      if (type.filePath === filePath) {
        this.exportedTypes.delete(name);
      }
    }
  }

  // ==========================================================================
  // Export Extraction
  // ==========================================================================

  private extractExports(filePath: string, content: string): void {
    this.extractFunctionExports(filePath, content);
    this.extractTypeExports(filePath, content);
  }

  private extractFunctionExports(filePath: string, content: string): void {
    const lines = content.split('\n');
    
    // Pattern: export function name(params)
    // Pattern: export const name = (params) =>
    // Pattern: export const name = async (params) =>
    // Pattern: export async function name(params)
    const patterns = [
      /export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
      /export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::\s*\w+)?\s*=>/,
      /export\s+const\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(([^)]*)\)/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const name = match[1];
          const paramsStr = match[2];
          const parameters = this.parseParameters(paramsStr);
          const isAsync = line.includes('async');

          this.exportedFunctions.set(name, {
            name,
            filePath,
            line: i + 1,
            parameters,
            isAsync,
          });
        }
      }
    }

    // Also check for class method exports
    this.extractClassMethodExports(filePath, lines);
  }

  private extractClassMethodExports(filePath: string, lines: string[]): void {
    let inExportedClass = false;
    let className = '';
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track exported class
      const classMatch = line.match(/export\s+class\s+(\w+)/);
      if (classMatch) {
        inExportedClass = true;
        className = classMatch[1];
        braceCount = 0;
      }

      if (inExportedClass) {
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;

        // Check for public methods
        const methodMatch = line.match(/^\s*(?:public\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)/);
        if (methodMatch && !line.includes('constructor') && !line.includes('private') && !line.includes('protected')) {
          const methodName = methodMatch[1];
          const paramsStr = methodMatch[2];
          const fullName = `${className}.${methodName}`;

          this.exportedFunctions.set(fullName, {
            name: fullName,
            filePath,
            line: i + 1,
            parameters: this.parseParameters(paramsStr),
            isAsync: line.includes('async'),
          });
        }

        if (braceCount <= 0) {
          inExportedClass = false;
        }
      }
    }
  }

  private extractTypeExports(filePath: string, content: string): void {
    const lines = content.split('\n');

    // Pattern: export interface Name { fields }
    // Pattern: export type Name = { fields }
    let currentType: ExportedType | null = null;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Start of interface/type
      const interfaceMatch = line.match(/export\s+interface\s+(\w+)/);
      const typeMatch = line.match(/export\s+type\s+(\w+)\s*=\s*\{/);

      if (interfaceMatch) {
        currentType = {
          name: interfaceMatch[1],
          filePath,
          line: i + 1,
          kind: 'interface',
          fields: [],
        };
        braceCount = 0;
      } else if (typeMatch) {
        currentType = {
          name: typeMatch[1],
          filePath,
          line: i + 1,
          kind: 'type',
          fields: [],
        };
        braceCount = 0;
      }

      if (currentType) {
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;

        // Extract fields
        const fieldMatch = line.match(/^\s*(\w+)(\?)?:\s*(.+?);?\s*$/);
        if (fieldMatch && !line.includes('export')) {
          currentType.fields.push({
            name: fieldMatch[1],
            optional: !!fieldMatch[2],
            type: fieldMatch[3].replace(/;$/, '').trim(),
          });
        }

        if (braceCount <= 0 && currentType.fields.length > 0) {
          this.exportedTypes.set(currentType.name, currentType);
          currentType = null;
        }
      }
    }
  }

  private parseParameters(paramsStr: string): FunctionParameter[] {
    if (!paramsStr.trim()) return [];

    const params: FunctionParameter[] = [];
    // Simple parsing - handles basic cases
    // For complex generic types, this would need enhancement
    const parts = paramsStr.split(',').map(p => p.trim());

    for (const part of parts) {
      if (!part) continue;

      // Handle destructuring
      if (part.startsWith('{')) continue;

      // Pattern: name: type = default
      const match = part.match(/^(\w+)(\?)?(?::\s*([^=]+))?(?:\s*=\s*(.+))?$/);
      if (match) {
        params.push({
          name: match[1],
          optional: !!match[2],
          type: match[3]?.trim(),
          defaultValue: match[4]?.trim(),
        });
      }
    }

    return params;
  }

  // ==========================================================================
  // Mismatch Detection
  // ==========================================================================

  private checkFileForMismatches(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');

    // Check function calls
    this.checkFunctionCalls(filePath, lines, violations);

    // Check type field access
    if (this.config.checkTypeFields) {
      this.checkTypeFieldAccess(filePath, lines, violations);
    }
  }

  private checkFunctionCalls(filePath: string, lines: string[], violations: Violation[]): void {
    // Build a set of known function names for fuzzy matching
    const knownFunctions = Array.from(this.exportedFunctions.keys());

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip imports, exports, comments
      if (line.trim().startsWith('import') || 
          line.trim().startsWith('export') || 
          line.trim().startsWith('//') ||
          line.trim().startsWith('*')) continue;

      // Find function calls - pattern: functionName(
      const callPattern = /\b([a-z][a-zA-Z0-9]*)\s*\(/g;
      let match;

      while ((match = callPattern.exec(line)) !== null) {
        const calledName = match[1];
        const column = match.index + 1;

        // Skip common JS/TS built-ins and keywords
        if (this.isBuiltinOrKeyword(calledName)) continue;

        // Check if this function exists in exports
        if (this.exportedFunctions.has(calledName)) {
          // Exact match - check parameters
          this.checkParameterMatch(filePath, i + 1, column, calledName, line, violations);
        } else {
          // Fuzzy match - check for similar names
          const similar = this.findSimilarFunctions(calledName, knownFunctions);
          if (similar.length > 0) {
            const bestMatch = similar[0];
            const mismatchId = this.generateMismatchId();
            
            const exportedFn = this.exportedFunctions.get(bestMatch.name)!;
            
            const mismatch: SignatureMismatch = {
              id: mismatchId,
              type: 'function-name',
              expected: bestMatch.name,
              found: calledName,
              similarity: bestMatch.similarity,
              definedIn: { file: exportedFn.filePath, line: exportedFn.line },
              usedIn: { file: filePath, line: i + 1, column },
              suggestions: similar.map(s => s.name),
              quickFix: this.createQuickFix(mismatchId, filePath, i + 1, calledName, bestMatch.name),
            };

            this.mismatches.push(mismatch);

            violations.push(this.createViolation(
              filePath,
              `Function name mismatch: '${calledName}' called but '${bestMatch.name}' is defined in shared contracts`,
              i + 1,
              column,
              `Rename to '${bestMatch.name}'. This may be a context loss issue from AI-generated code.`,
              mismatch
            ));
          }
        }
      }
    }
  }

  private checkParameterMatch(
    filePath: string,
    line: number,
    column: number,
    functionName: string,
    lineContent: string,
    violations: Violation[]
  ): void {
    if (!this.config.checkParameterNames) return;

    const exportedFn = this.exportedFunctions.get(functionName);
    if (!exportedFn || exportedFn.parameters.length === 0) return;

    // Extract call arguments from the line
    const callMatch = lineContent.match(new RegExp(`${functionName}\\s*\\(([^)]+)\\)`));
    if (!callMatch) return;

    const argsStr = callMatch[1];
    const callArgs = argsStr.split(',').map(a => a.trim());

    // Check argument count
    const requiredParams = exportedFn.parameters.filter(p => !p.optional && !p.defaultValue);
    if (callArgs.length < requiredParams.length) {
      const mismatchId = this.generateMismatchId();
      
      violations.push(this.createViolation(
        filePath,
        `Parameter count mismatch: '${functionName}' expects ${requiredParams.length} required parameters but ${callArgs.length} provided`,
        line,
        column,
        `Expected parameters: ${exportedFn.parameters.map(p => p.name).join(', ')}`,
        {
          id: mismatchId,
          type: 'parameter-count',
          expected: String(requiredParams.length),
          found: String(callArgs.length),
          definedIn: { file: exportedFn.filePath, line: exportedFn.line },
          usedIn: { file: filePath, line, column },
        }
      ));
    }

    // Check for named argument mismatches (in object-style calls)
    if (argsStr.includes(':')) {
      this.checkNamedArguments(filePath, line, column, exportedFn, argsStr, violations);
    }
  }

  private checkNamedArguments(
    filePath: string,
    line: number,
    column: number,
    exportedFn: ExportedFunction,
    argsStr: string,
    violations: Violation[]
  ): void {
    // Pattern: { paramName: value }
    const namedArgPattern = /(\w+)\s*:/g;
    let match;

    while ((match = namedArgPattern.exec(argsStr)) !== null) {
      const usedParamName = match[1];
      
      // Check if this parameter exists
      const paramExists = exportedFn.parameters.some(p => p.name === usedParamName);
      
      if (!paramExists) {
        // Find similar parameter names
        const paramNames = exportedFn.parameters.map(p => p.name);
        const similar = this.findSimilarStrings(usedParamName, paramNames);
        
        if (similar.length > 0 && similar[0].similarity >= this.config.similarityThreshold!) {
          const mismatchId = this.generateMismatchId();
          
          violations.push(this.createViolation(
            filePath,
            `Parameter name mismatch: '${usedParamName}' used but '${similar[0].name}' is the defined parameter`,
            line,
            column,
            `Rename parameter to '${similar[0].name}'`,
            {
              id: mismatchId,
              type: 'parameter-name',
              expected: similar[0].name,
              found: usedParamName,
              definedIn: { file: exportedFn.filePath, line: exportedFn.line },
              usedIn: { file: filePath, line, column },
            }
          ));
        }
      }
    }
  }

  private checkTypeFieldAccess(filePath: string, lines: string[], violations: Violation[]): void {
    // Build set of known type field names
    const typeFieldMap = new Map<string, { typeName: string; field: TypeField; typeInfo: ExportedType }>();
    
    for (const [typeName, typeInfo] of this.exportedTypes) {
      for (const field of typeInfo.fields) {
        typeFieldMap.set(`${typeName}.${field.name}`, { typeName, field, typeInfo });
      }
    }

    // Build flat list of field names for matching
    // Build flat list of field names for matching (used implicitly via typeFieldMap)

    // Check for field access patterns that might not match
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

      // Pattern: variable.fieldName or data.fieldName
      const accessPattern = /\b(\w+)\.(\w+)\b/g;
      let match;

      while ((match = accessPattern.exec(line)) !== null) {
        const objectVar = match[1];
        const fieldName = match[2];
        const column = match.index + 1;

        // Skip common JS builtins like console.log, Promise.resolve, etc.
        if (this.isBuiltinObjectAccess(objectVar, fieldName)) continue;

        // Find best matching field using enhanced similarity
        const similar = this.findSimilarFields(fieldName, typeFieldMap);
        
        if (similar.length > 0) {
          const bestMatch = similar[0];
          const mismatchId = this.generateMismatchId();
          
          const mismatch: SignatureMismatch = {
            id: mismatchId,
            type: 'type-field',
            expected: bestMatch.field.name,
            found: fieldName,
            similarity: bestMatch.similarity,
            definedIn: { file: bestMatch.typeInfo.filePath, line: bestMatch.typeInfo.line },
            usedIn: { file: filePath, line: i + 1, column },
            quickFix: this.createQuickFix(mismatchId, filePath, i + 1, fieldName, bestMatch.field.name),
          };

          this.mismatches.push(mismatch);

          violations.push(this.createViolation(
            filePath,
            `Type field mismatch: '${objectVar}.${fieldName}' accessed but '${bestMatch.typeName}.${bestMatch.field.name}' is the defined field`,
            i + 1,
            column,
            `Rename to '${bestMatch.field.name}'`,
            mismatch
          ));
        }
      }
    }
  }

  /**
   * Find similar type fields using enhanced matching strategies
   */
  private findSimilarFields(
    fieldName: string, 
    typeFieldMap: Map<string, { typeName: string; field: TypeField; typeInfo: ExportedType }>
  ): Array<{ typeName: string; field: TypeField; typeInfo: ExportedType; similarity: number }> {
    const results: Array<{ typeName: string; field: TypeField; typeInfo: ExportedType; similarity: number }> = [];

    for (const [_fullPath, { typeName, field, typeInfo }] of typeFieldMap) {
      // Try multiple matching strategies
      const similarities = [
        this.calculateSimilarity(fieldName.toLowerCase(), field.name.toLowerCase()),
        this.calculateSemanticSimilarity(fieldName, field.name),
        this.calculatePrefixSuffixSimilarity(fieldName, field.name),
        this.calculateWordOverlapSimilarity(fieldName, field.name),
      ];
      
      const bestSimilarity = Math.max(...similarities);
      
      // Match if similar but not exact
      if (bestSimilarity >= this.config.similarityThreshold! && bestSimilarity < 1) {
        results.push({ typeName, field, typeInfo, similarity: bestSimilarity });
      }
    }

    // Sort by similarity and return top matches
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, 3);
  }

  /**
   * Check if the field access is a built-in JavaScript/TypeScript pattern
   */
  private isBuiltinObjectAccess(objectVar: string, fieldName: string): boolean {
    const builtinObjects = ['console', 'Math', 'JSON', 'Object', 'Array', 'Promise', 'Date', 'String', 'Number', 'Boolean', 'RegExp', 'Error', 'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Reflect', 'Proxy', 'process', 'Buffer', 'global', 'window', 'document', 'navigator'];
    
    if (builtinObjects.includes(objectVar)) return true;
    
    // Skip common method/property access
    const commonMethods = ['length', 'map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every', 'includes', 'indexOf', 'slice', 'splice', 'concat', 'join', 'split', 'trim', 'toLowerCase', 'toUpperCase', 'toString', 'valueOf', 'keys', 'values', 'entries', 'push', 'pop', 'shift', 'unshift', 'sort', 'reverse', 'then', 'catch', 'finally', 'resolve', 'reject', 'all', 'race', 'prototype', 'constructor', 'call', 'apply', 'bind', 'log', 'error', 'warn', 'info', 'debug', 'table', 'json', 'body', 'headers', 'status', 'statusText', 'ok', 'text', 'get', 'set', 'has', 'delete', 'clear', 'size', 'add'];
    
    return commonMethods.includes(fieldName);
  }

  // ==========================================================================
  // Similarity Matching - Enhanced with Semantic Patterns
  // ==========================================================================

  // Common word synonyms for semantic matching
  private static readonly SYNONYMS: Map<string, string[]> = new Map([
    ['get', ['fetch', 'retrieve', 'find', 'load', 'read']],
    ['create', ['add', 'insert', 'new', 'make', 'register', 'post']],
    ['update', ['edit', 'modify', 'change', 'patch', 'set']],
    ['delete', ['remove', 'destroy', 'drop', 'cancel', 'erase']],
    ['list', ['items', 'array', 'collection', 'all']],
    ['user', ['account', 'profile', 'member']],
    ['total', ['amount', 'sum', 'price', 'cost']],
    ['name', ['title', 'label', 'text']],
    ['id', ['identifier', 'key', 'code']],
    ['date', ['time', 'timestamp', 'at', 'when']],
    ['email', ['mail', 'address']],
    ['status', ['state', 'condition']],
    ['data', ['info', 'details', 'payload', 'body']],
    ['by', ['for', 'with', 'from']],
  ]);

  // Common prefixes that indicate the same field with object context
  private static readonly CONTEXT_PREFIXES = [
    'user', 'product', 'order', 'item', 'account', 'customer',
    'payment', 'cart', 'session', 'request', 'response', 'current'
  ];

  private findSimilarFunctions(name: string, knownNames: string[]): Array<{ name: string; similarity: number }> {
    const results: Array<{ name: string; similarity: number }> = [];

    for (const known of knownNames) {
      // Try multiple matching strategies and take the best
      const similarities = [
        this.calculateSimilarity(name.toLowerCase(), known.toLowerCase()),
        this.calculateSemanticSimilarity(name, known),
        this.calculatePrefixSuffixSimilarity(name, known),
        this.calculateWordOverlapSimilarity(name, known),
      ];
      
      const bestSimilarity = Math.max(...similarities);
      
      if (bestSimilarity >= this.config.similarityThreshold! && bestSimilarity < 1) {
        results.push({ name: known, similarity: bestSimilarity });
      }
    }

    // Sort by similarity (highest first)
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, 3);
  }

  private findSimilarStrings(name: string, candidates: string[]): Array<{ name: string; similarity: number }> {
    return this.findSimilarFunctions(name, candidates);
  }

  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    // Levenshtein distance
    const distance = this.levenshteinDistance(a, b);
    const maxLength = Math.max(a.length, b.length);
    
    return 1 - (distance / maxLength);
  }

  /**
   * Semantic similarity: check if words are synonyms
   * e.g., "getUser" matches "fetchUser", "deleteProduct" matches "removeProduct"
   */
  private calculateSemanticSimilarity(a: string, b: string): number {
    const wordsA = this.splitCamelCase(a);
    const wordsB = this.splitCamelCase(b);
    
    if (wordsA.length === 0 || wordsB.length === 0) return 0;
    
    let matchCount = 0;
    const maxWords = Math.max(wordsA.length, wordsB.length);
    
    for (const wordA of wordsA) {
      for (const wordB of wordsB) {
        if (wordA.toLowerCase() === wordB.toLowerCase()) {
          matchCount++;
          break;
        }
        // Check if they are synonyms
        if (this.areSynonyms(wordA.toLowerCase(), wordB.toLowerCase())) {
          matchCount += 0.9; // Slight penalty for synonym vs exact match
          break;
        }
      }
    }
    
    return matchCount / maxWords;
  }

  /**
   * Prefix/suffix similarity: "userEmail" should match "email"
   * Common pattern: objectType + fieldName (user + Email → email)
   */
  private calculatePrefixSuffixSimilarity(accessedField: string, definedField: string): number {
    const accessedLower = accessedField.toLowerCase();
    const definedLower = definedField.toLowerCase();
    
    // Check if accessed field ends with defined field (prefix pattern)
    // e.g., userEmail ends with email → high match
    if (accessedLower.endsWith(definedLower)) {
      const prefix = accessedLower.slice(0, -definedLower.length);
      // Check if prefix is a common context prefix
      if (FunctionSignatureMatchingRule.CONTEXT_PREFIXES.some(p => prefix.endsWith(p))) {
        return 0.9; // High confidence match
      }
      // Even without known prefix, still likely a match
      return 0.8;
    }
    
    // Check if defined field ends with accessed field (suffix pattern)
    // e.g., totalAmount ends with Amount, accessed "total" → match with "totalAmount"
    if (definedLower.endsWith(accessedLower) || definedLower.startsWith(accessedLower)) {
      return 0.7;
    }
    
    // Check if accessed field starts with defined field
    if (accessedLower.startsWith(definedLower)) {
      return 0.75;
    }
    
    return 0;
  }

  /**
   * Word overlap similarity: Compare individual words in camelCase
   * e.g., "getUserById" and "getUser" share "get" and "User"
   */
  private calculateWordOverlapSimilarity(a: string, b: string): number {
    const wordsA = new Set(this.splitCamelCase(a).map(w => w.toLowerCase()));
    const wordsB = new Set(this.splitCamelCase(b).map(w => w.toLowerCase()));
    
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    
    const intersection = [...wordsA].filter(w => wordsB.has(w) || this.hasCloseMatch(w, wordsB));
    const union = new Set([...wordsA, ...wordsB]);
    
    // Jaccard similarity with synonym awareness
    return intersection.length / union.size;
  }

  /**
   * Check if a word has a close match in a set (synonym or very similar)
   */
  private hasCloseMatch(word: string, set: Set<string>): boolean {
    for (const candidate of set) {
      if (this.areSynonyms(word, candidate)) return true;
      if (this.levenshteinDistance(word, candidate) <= 2 && 
          Math.max(word.length, candidate.length) >= 4) return true;
    }
    return false;
  }

  /**
   * Check if two words are synonyms
   */
  private areSynonyms(a: string, b: string): boolean {
    for (const [key, synonyms] of FunctionSignatureMatchingRule.SYNONYMS) {
      const allWords = [key, ...synonyms];
      const hasA = allWords.includes(a);
      const hasB = allWords.includes(b);
      if (hasA && hasB && a !== b) return true;
    }
    return false;
  }

  /**
   * Split camelCase or PascalCase string into words
   */
  private splitCamelCase(str: string): string[] {
    return str
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(/[\s_-]+/)
      .filter(w => w.length > 0);
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  // ==========================================================================
  // Quick Fix Generation
  // ==========================================================================

  private createQuickFix(
    id: string,
    filePath: string,
    line: number,
    oldName: string,
    newName: string
  ): QuickFix {
    return {
      id,
      command: `npx camouf fix --id ${id}`,
      description: `Rename '${oldName}' to '${newName}' in ${path.basename(filePath)}:${line}`,
      changes: [{
        file: filePath,
        start: { line, column: 0 },
        end: { line, column: 0 },
        newText: '', // The actual change would be a replace
      }],
    };
  }

  private attachQuickFixMetadata(violations: Violation[]): void {
    for (const violation of violations) {
      const mismatch = this.mismatches.find(m => 
        violation.file === m.usedIn.file && 
        violation.line === m.usedIn.line
      );

      if (mismatch?.quickFix) {
        violation.fixable = true;
        violation.metadata = {
          ...violation.metadata,
          mismatchId: mismatch.id,
          quickFixCommand: mismatch.quickFix.command,
        };
      }
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private isInDirectories(filePath: string, directories: string[]): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
    return directories.some(dir => {
      const normalizedDir = dir.replace(/\\/g, '/').toLowerCase();
      return normalizedPath.includes(`/${normalizedDir}/`) || normalizedPath.startsWith(`${normalizedDir}/`);
    });
  }

  private isBuiltinOrKeyword(name: string): boolean {
    const builtins = new Set([
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
      'return', 'throw', 'try', 'catch', 'finally', 'new', 'delete', 'typeof',
      'void', 'this', 'super', 'class', 'extends', 'function', 'async', 'await',
      'console', 'log', 'error', 'warn', 'info', 'debug', 'trace', 'table',
      'require', 'import', 'export', 'default', 'from', 'as',
      'parseInt', 'parseFloat', 'isNaN', 'isFinite',
      'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
      'fetch', 'then', 'catch', 'finally',
      'map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every',
      'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'concat',
      'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol',
      'Promise', 'Date', 'Math', 'JSON', 'RegExp', 'Error',
      'describe', 'it', 'test', 'expect', 'beforeEach', 'afterEach', 'jest',
    ]);
    
    return builtins.has(name);
  }

  private generateMismatchId(): string {
    this.mismatchCounter++;
    return `sig-${String(this.mismatchCounter).padStart(3, '0')}`;
  }

  private createViolation(
    file: string,
    message: string,
    line: number,
    column?: number,
    suggestion?: string,
    mismatch?: SignatureMismatch
  ): Violation {
    return {
      id: `${this.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId: this.id,
      ruleName: this.name,
      severity: this.config.severity || 'error',
      message,
      file,
      line,
      column,
      suggestion,
      fixable: !!mismatch?.quickFix,
      metadata: mismatch ? {
        mismatchId: mismatch.id,
        mismatchType: mismatch.type,
        expected: mismatch.expected,
        found: mismatch.found,
        similarity: mismatch.similarity,
        definedIn: mismatch.definedIn,
        quickFixCommand: mismatch.quickFix?.command,
      } : undefined,
    };
  }

  getDocumentation(): RuleDocumentation {
    return {
      summary: this.description,
      details: `
This rule is designed to catch a common class of errors made by AI coding agents 
with limited context windows. When an AI agent works on frontend code without 
full visibility into backend contracts (or vice versa), it may:

1. Use slightly different function names (getUserById vs getUser)
2. Use incorrect parameter names (userId vs id)
3. Access fields with wrong names (data.userEmail vs data.email)

These mismatches compile successfully but cause runtime errors that are 
difficult to debug.

The rule uses fuzzy matching (Levenshtein distance) to detect names that are 
similar but not identical, suggesting the correct name and providing quick-fix 
commands.
      `.trim(),
      examples: [
        {
          title: 'Function Name Mismatch',
          bad: `// Frontend code
const user = await getUser(userId); // Wrong!`,
          good: `// Frontend code
const user = await getUserById(userId); // Correct - matches backend`,
          explanation: 'The backend exports getUserById() but the frontend calls getUser()',
        },
        {
          title: 'Type Field Mismatch',
          bad: `// Using wrong field name
const email = response.userEmail; // Wrong!`,
          good: `// Using correct field name
const email = response.email; // Correct - matches DTO`,
          explanation: 'The shared DTO defines "email" but the code accesses "userEmail"',
        },
      ],
      options: [
        {
          name: 'similarityThreshold',
          type: 'number',
          description: 'Minimum similarity score (0-1) to flag as potential mismatch',
          default: 0.7,
        },
        {
          name: 'checkParameterNames',
          type: 'boolean',
          description: 'Check function parameter names for mismatches',
          default: true,
        },
        {
          name: 'checkTypeFields',
          type: 'boolean',
          description: 'Check type/interface field access for mismatches',
          default: true,
        },
      ],
      relatedRules: ['contract-mismatch', 'type-safety'],
      resources: [
        'https://github.com/emilianofant/camouf/blob/master/docs/ai-agent-challenges.md',
      ],
    };
  }
}
