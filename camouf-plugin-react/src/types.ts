/**
 * Type definitions for camouf-plugin-react
 * 
 * These are simplified types compatible with the main Camouf package.
 * When published, users will have these types available through the
 * camouf peer dependency.
 */

/**
 * Violation severity levels
 */
export type ViolationSeverity = 'error' | 'warning' | 'info';

/**
 * Violation reported by a rule
 */
export interface Violation {
  id: string;
  ruleId: string;
  ruleName: string;
  message: string;
  severity: ViolationSeverity;
  file: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  suggestion?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Rule violation result
 */
export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  message: string;
  severity: ViolationSeverity;
  file: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

/**
 * Rule result from check method
 */
export interface RuleResult {
  violations: Violation[];
  duration?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Rule configuration
 */
export interface RuleConfig {
  enabled?: boolean;
  severity?: ViolationSeverity;
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
  | 'best-practices'
  | 'ai-specific';

/**
 * Dependency graph interface (simplified)
 */
export interface DependencyGraph {
  nodes(): string[];
  edges(): Array<{ v: string; w: string }>;
  node(id: string): unknown;
  hasNode(id: string): boolean;
}

/**
 * Graph node data
 */
export interface GraphNode {
  id: string;
  type: string;
  data: {
    relativePath: string;
    absolutePath?: string;
    language?: string;
    exports?: string[];
    imports?: string[];
    [key: string]: unknown;
  };
}

/**
 * Rule context
 */
export interface RuleContext {
  config: Record<string, unknown>;
  graph: DependencyGraph;
  focusFile?: string;
  file?: string;
  fileContents?: Map<string, string>;
  getNodeData: (id: string) => GraphNode | undefined;
  getEdgeData: (source: string, target: string) => unknown;
  getIncomingEdges: (id: string) => Array<{ v: string; w: string }>;
  getOutgoingEdges: (id: string) => Array<{ v: string; w: string }>;
}

/**
 * Rule interface
 */
export interface IRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly severity?: ViolationSeverity;
  readonly tags?: string[];
  readonly category?: RuleCategory;
  readonly supportsIncremental?: boolean;
  readonly defaultSeverity?: ViolationSeverity;
  check?(context: RuleContext): Promise<RuleResult>;
  validate?(context: RuleContext): RuleViolation[];
  configure?(options: Record<string, unknown>): void;
  checkFile?(filePath: string, context: RuleContext): Promise<RuleResult>;
}

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  name: string;
  version: string;
  displayName?: string;
  description?: string;
  author?: string;
  homepage?: string;
  types: Array<'rules' | 'analyzer' | 'parser' | 'quickfix' | 'output'>;
  camoufVersion?: string;
  keywords?: string[];
}

/**
 * Plugin load context
 */
export interface PluginLoadContext {
  camoufVersion: string;
  rootDir: string;
  config?: Record<string, unknown>;
  log: {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
}

/**
 * Camouf plugin interface
 */
export interface CamoufPlugin {
  metadata: PluginMetadata;
  rules?: IRule[];
  onLoad?(context: PluginLoadContext): Promise<void> | void;
  onUnload?(): Promise<void> | void;
}
