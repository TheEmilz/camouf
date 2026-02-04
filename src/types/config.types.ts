/**
 * Configuration Types
 * 
 * Defines all configuration interfaces for Camouf.
 */

export interface CamoufConfig {
  /** Project name */
  name?: string;

  /** Root directory of the project */
  root: string;

  /** Languages to analyze */
  languages: SupportedLanguage[];

  /** Architecture layer definitions */
  layers: LayerConfig[];

  /** Directory mappings */
  directories: DirectoryConfig;

  /** Rules configuration */
  rules: RulesConfig;

  /** Parser configurations */
  parsers?: ParsersConfig;

  /** File patterns to include/exclude */
  patterns: PatternsConfig;

  /** Output and reporting options */
  output?: OutputConfig;

  /** Advanced options */
  advanced?: AdvancedConfig;
}

export type SupportedLanguage = 
  | 'typescript' 
  | 'javascript' 
  | 'python' 
  | 'java' 
  | 'go' 
  | 'rust'
  | 'csharp'
  | 'kotlin';

export interface LayerConfig {
  /** Layer name */
  name: string;
  
  /** Layer type for predefined rules */
  type: 'presentation' | 'application' | 'domain' | 'infrastructure' | 'shared' | 'custom';
  
  /** Directories belonging to this layer */
  directories: string[];
  
  /** Allowed dependencies (other layer names) */
  allowedDependencies: string[];
  
  /** Forbidden dependencies (other layer names) */
  forbiddenDependencies?: string[];
}

export interface DirectoryConfig {
  /** Client/Frontend directories */
  client: string[];
  
  /** Server/Backend directories */
  server: string[];
  
  /** Shared/Common directories */
  shared: string[];
  
  /** Test directories */
  tests?: string[];
  
  /** Custom directory mappings */
  custom?: Record<string, string[]>;
}

export interface RulesConfig {
  /** Built-in rules configuration */
  builtin: BuiltinRulesConfig;
  
  /** Custom rules */
  custom?: CustomRuleConfig[];
  
  /** Global rule settings */
  settings?: RuleSettings;
}

export interface BuiltinRulesConfig {
  /** Layer dependency violations */
  'layer-dependencies'?: RuleLevel;
  
  /** Circular dependency detection */
  'circular-dependencies'?: RuleLevel;
  
  /** Data flow integrity */
  'data-flow-integrity'?: RuleLevel;
  
  /** Distributed transaction boundaries */
  'distributed-transactions'?: RuleLevel;
  
  /** API versioning evolution */
  'api-versioning'?: RuleLevel;
  
  /** Security context propagation */
  'security-context'?: RuleLevel;
  
  /** Performance anti-patterns */
  'performance-antipatterns'?: RuleLevel;
  
  /** Resilience pattern compliance */
  'resilience-patterns'?: RuleLevel;
  
  /** DDD boundaries */
  'ddd-boundaries'?: RuleLevel;
  
  /** Multi-language type safety */
  'type-safety'?: RuleLevel;
  
  /** Hardcoded secrets detection */
  'hardcoded-secrets'?: RuleLevel;
}

export type RuleLevel = 'off' | 'warn' | 'error' | RuleLevelConfig;

export interface RuleLevelConfig {
  level: 'off' | 'warn' | 'error';
  options?: Record<string, unknown>;
}

export interface CustomRuleConfig {
  /** Rule identifier */
  id: string;
  
  /** Rule name */
  name: string;
  
  /** Rule description */
  description?: string;
  
  /** Severity level */
  level: 'warn' | 'error';
  
  /** Rule implementation path (JS/TS file) */
  path?: string;
  
  /** Declarative rule definition */
  declarative?: DeclarativeRule;
}

export interface DeclarativeRule {
  /** Pattern type */
  type: 'import' | 'dependency' | 'naming' | 'structure';
  
  /** Pattern to match */
  pattern: string;
  
  /** Target files/directories */
  target: string;
  
  /** Action: allow or deny */
  action: 'allow' | 'deny';
  
  /** Message to show on violation */
  message: string;
}

export interface RuleSettings {
  /** Maximum circular dependency chain length to report */
  maxCircularDepth?: number;
  
  /** Patterns to exclude from rule checking */
  excludePatterns?: string[];
}

export interface ParsersConfig {
  /** TypeScript/JavaScript parser options */
  typescript?: {
    tsConfigPath?: string;
    strict?: boolean;
  };
  
  /** Python parser options */
  python?: {
    version?: '2' | '3';
  };
  
  /** Java parser options */
  java?: {
    sourceVersion?: string;
  };
}

export interface PatternsConfig {
  /** File patterns to include */
  include: string[];
  
  /** File patterns to exclude */
  exclude: string[];
}

export interface OutputConfig {
  /** Report format */
  format?: 'text' | 'json' | 'sarif' | 'html';
  
  /** Output directory */
  directory?: string;
  
  /** Show code snippets */
  showCode?: boolean;
}

export interface AdvancedConfig {
  /** Enable caching */
  cache?: boolean;
  
  /** Cache directory */
  cacheDirectory?: string;
  
  /** Max parallel workers */
  maxWorkers?: number;
  
  /** Enable debug mode */
  debug?: boolean;
}

/**
 * Default configuration
 */
export const defaultConfig: Partial<CamoufConfig> = {
  languages: ['typescript', 'javascript'],
  patterns: {
    include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
      '**/*.test.*',
      '**/*.spec.*',
    ],
  },
  rules: {
    builtin: {
      'layer-dependencies': 'error',
      'circular-dependencies': 'warn',
      'performance-antipatterns': 'warn',
      'type-safety': 'warn',
    },
  },
  advanced: {
    cache: true,
    maxWorkers: 4,
  },
};
