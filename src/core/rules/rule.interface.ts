/**
 * Rule Interface
 * 
 * Defines the contract for architecture rules.
 */

import { CamoufConfig } from '../../types/config.types.js';
import { Violation, GraphNode, GraphEdge } from '../../types/core.types.js';
import { DependencyGraph } from '../scanner/project-scanner.js';

/**
 * Result returned by a rule check
 */
export interface RuleResult {
  /** Violations found */
  violations: Violation[];
  
  /** Time taken to run the rule (ms) */
  duration?: number;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Violation result from simple rules
 */
export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  file: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

/**
 * Base rule configuration
 */
export interface RuleConfig {
  enabled?: boolean;
  severity?: 'error' | 'warning' | 'info';
}

/**
 * Context provided to rules during checking
 */
export interface RuleContext {
  /** Current configuration */
  config: CamoufConfig;
  
  /** Dependency graph */
  graph: DependencyGraph;
  
  /** File to focus on (for incremental checks) */
  focusFile?: string;
  
  /** Current file being validated (for simple rules) */
  file?: string;
  
  /** Map of file contents */
  fileContents?: Map<string, string>;
  
  /** Get node data */
  getNodeData: (id: string) => GraphNode | undefined;
  
  /** Get edge data */
  getEdgeData: (source: string, target: string) => GraphEdge | undefined;
  
  /** Get incoming edges to a node */
  getIncomingEdges: (id: string) => Array<{ v: string; w: string }>;
  
  /** Get outgoing edges from a node */
  getOutgoingEdges: (id: string) => Array<{ v: string; w: string }>;
}

/**
 * Interface for architecture rules
 */
export interface IRule {
  /** Unique identifier */
  readonly id: string;
  
  /** Human-readable name */
  readonly name: string;
  
  /** Description of what the rule checks */
  readonly description: string;
  
  /** Default severity */
  readonly severity?: 'error' | 'warning' | 'info';
  
  /** Tags for categorization */
  readonly tags?: string[];
  
  /** Category for grouping (optional) */
  readonly category?: RuleCategory;
  
  /** Whether this rule supports incremental checking */
  readonly supportsIncremental?: boolean;
  
  /** Default severity (alternative name) */
  readonly defaultSeverity?: 'error' | 'warning' | 'info';
  
  /**
   * Check the entire project
   */
  check?(context: RuleContext): Promise<RuleResult>;
  
  /**
   * Validate (simplified interface for new rules)
   */
  validate?(context: RuleContext): RuleViolation[];
  
  /**
   * Configure the rule
   */
  configure?(options: Record<string, unknown>): void;
  
  /**
   * Check a single file (for incremental validation)
   */
  checkFile?(filePath: string, context: RuleContext): Promise<RuleResult>;
  
  /**
   * Get rule documentation
   */
  getDocumentation?(): RuleDocumentation;
}

/**
 * Rule categories
 */
export type RuleCategory = 
  | 'architecture'
  | 'dependencies'
  | 'security'
  | 'performance'
  | 'naming'
  | 'structure'
  | 'best-practices';

/**
 * Rule documentation
 */
export interface RuleDocumentation {
  /** Rule summary */
  summary: string;
  
  /** Detailed description */
  details?: string;
  
  /** Examples of violations */
  examples?: RuleExample[];
  
  /** Configuration options */
  options?: RuleOption[];
  
  /** Related rules */
  relatedRules?: string[];
  
  /** External resources */
  resources?: string[];
}

export interface RuleExample {
  /** Example title */
  title: string;
  
  /** Code that violates the rule */
  bad?: string;
  
  /** Code that follows the rule */
  good?: string;
  
  /** Explanation */
  explanation?: string;
}

export interface RuleOption {
  /** Option name */
  name: string;
  
  /** Type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  
  /** Description */
  description: string;
  
  /** Default value */
  default?: unknown;
}

/**
 * Base class for rules
 */
export abstract class BaseRule implements IRule {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  readonly category: RuleCategory = 'architecture';
  
  readonly supportsIncremental: boolean = true;
  readonly defaultSeverity: 'error' | 'warning' | 'info' = 'warning';

  abstract check(context: RuleContext): Promise<RuleResult>;

  async checkFile(_filePath: string, context: RuleContext): Promise<RuleResult> {
    // Default implementation: run full check
    // Rules should override this for better performance
    return this.check(context);
  }

  getDocumentation(): RuleDocumentation {
    return {
      summary: this.description,
    };
  }

  /**
   * Helper to create a violation
   */
  protected createViolation(
    file: string,
    message: string,
    options: Partial<Violation> = {}
  ): Violation {
    return {
      id: `${this.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      message,
      file,
      ...options,
    };
  }
}
