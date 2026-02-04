/**
 * Core Types
 * 
 * Defines core interfaces used throughout Camouf.
 */

import type { SupportedLanguage } from './config.types.js';

/**
 * Represents a file in the project
 */
export interface ProjectFile {
  /** Absolute path to the file */
  path: string;
  
  /** Relative path from project root */
  relativePath: string;
  
  /** Programming language */
  language: SupportedLanguage;
  
  /** File extension */
  extension: string;
  
  /** Layer this file belongs to */
  layer?: string;
  
  /** Last modified timestamp */
  lastModified: number;
  
  /** File size in bytes */
  size: number;
}

/**
 * Represents a dependency between files
 */
export interface Dependency {
  /** Source file path */
  source: string;
  
  /** Target file/module path */
  target: string;
  
  /** Type of import */
  type: DependencyType;
  
  /** Line number of the import statement */
  line?: number;
  
  /** Column number */
  column?: number;
  
  /** Imported symbols */
  imports?: ImportedSymbol[];
  
  /** Whether it's a dynamic import */
  isDynamic?: boolean;
  
  /** Whether it's a type-only import */
  isTypeOnly?: boolean;
}

export type DependencyType = 
  | 'import'           // ES6 import
  | 'require'          // CommonJS require
  | 'dynamic-import'   // Dynamic import()
  | 're-export'        // Export from
  | 'side-effect'      // Import for side effects
  | 'type-import'      // TypeScript type import
  | 'python-import'    // Python import
  | 'java-import'      // Java import
  | 'go-import'        // Go import
  | 'rust-use';        // Rust use

/**
 * Represents an imported symbol
 */
export interface ImportedSymbol {
  /** Original name in the source module */
  name: string;
  
  /** Alias if renamed */
  alias?: string;
  
  /** Whether it's a default import */
  isDefault?: boolean;
  
  /** Whether it's a namespace import */
  isNamespace?: boolean;
}

/**
 * Represents a violation of architecture rules
 */
export interface Violation {
  /** Unique identifier for this violation instance */
  id: string;
  
  /** Rule that was violated */
  ruleId: string;
  
  /** Rule name */
  ruleName: string;
  
  /** Severity level */
  severity: ViolationSeverity;
  
  /** Violation message */
  message: string;
  
  /** Detailed description */
  description?: string;
  
  /** File where violation occurred */
  file: string;
  
  /** Line number */
  line?: number;
  
  /** Column number */
  column?: number;
  
  /** End line (for ranges) */
  endLine?: number;
  
  /** End column */
  endColumn?: number;
  
  /** Code snippet */
  codeSnippet?: string;
  
  /** Suggested fix */
  suggestion?: string;
  
  /** Whether auto-fix is available */
  fixable?: boolean;
  
  /** Fix function */
  fix?: ViolationFix;
  
  /** Related locations */
  relatedLocations?: RelatedLocation[];
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export type ViolationSeverity = 'error' | 'warning' | 'info';

export interface ViolationFix {
  /** Description of the fix */
  description: string;
  
  /** Changes to apply */
  changes: FileChange[];
}

export interface FileChange {
  /** File to modify */
  file: string;
  
  /** Start position */
  start: Position;
  
  /** End position */
  end: Position;
  
  /** New text */
  newText: string;
}

export interface Position {
  line: number;
  column: number;
}

export interface RelatedLocation {
  /** File path */
  file: string;
  
  /** Line number */
  line: number;
  
  /** Column number */
  column?: number;
  
  /** Message */
  message: string;
}

/**
 * Parsed file information
 */
export interface ParsedFile {
  /** File information */
  file: ProjectFile;
  
  /** Dependencies found */
  dependencies: Dependency[];
  
  /** Exported symbols */
  exports: ExportedSymbol[];
  
  /** AST (language-specific) */
  ast?: unknown;
  
  /** Parse errors */
  errors?: ParseError[];
}

export interface ExportedSymbol {
  /** Symbol name */
  name: string;
  
  /** Symbol type */
  type: SymbolType;
  
  /** Line number */
  line?: number;
  
  /** Whether it's a default export */
  isDefault?: boolean;
  
  /** Type annotation (if available) */
  typeAnnotation?: string;
}

export type SymbolType = 
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'variable'
  | 'constant'
  | 'namespace'
  | 'module';

export interface ParseError {
  /** Error message */
  message: string;
  
  /** Line number */
  line: number;
  
  /** Column number */
  column?: number;
}

/**
 * Dependency graph node
 */
export interface GraphNode {
  /** Node ID (usually file path) */
  id: string;
  
  /** Node metadata */
  data: ProjectFile;
}

/**
 * Dependency graph edge
 */
export interface GraphEdge {
  /** Source node ID */
  source: string;
  
  /** Target node ID */
  target: string;
  
  /** Edge metadata */
  data: Dependency;
}

/**
 * Analysis result
 */
export interface AnalysisResult {
  /** Summary statistics */
  summary: AnalysisSummary;
  
  /** Hotspot files */
  hotspots: Hotspot[];
  
  /** Circular dependencies found */
  circularDependencies: CircularDependency[];
  
  /** Layer violations */
  layerViolations: LayerViolation[];
  
  /** Suggestions for improvement */
  suggestions: string[];
  
  /** Metrics by file */
  fileMetrics?: FileMetrics[];
}

export interface AnalysisSummary {
  totalFiles: number;
  totalDependencies: number;
  circularDependencies: number;
  averageCoupling: number;
  maxCoupling: number;
  layerViolations: number;
}

export interface Hotspot {
  file: string;
  dependents: number;
  dependencies: number;
  coupling: number;
}

export interface CircularDependency {
  cycle: string[];
  files: string[];
}

export interface LayerViolation {
  sourceLayer: string;
  targetLayer: string;
  file: string;
  dependency: string;
}

export interface FileMetrics {
  file: string;
  linesOfCode: number;
  dependencies: number;
  dependents: number;
  complexity?: number;
  maintainability?: number;
}

/**
 * File change event
 */
export interface FileChangeEvent {
  /** File path */
  path: string;
  
  /** Change type */
  type: 'add' | 'change' | 'unlink';
  
  /** Timestamp */
  timestamp: number;
}
