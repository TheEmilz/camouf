/**
 * Camouf - Public API
 * 
 * Main entry point for programmatic usage and plugin development.
 * 
 * @example
 * ```typescript
 * import type { CamoufPlugin, IRule, RuleContext } from 'camouf';
 * ```
 */

// Core types for plugin authors
export type {
  CamoufPlugin,
  PluginMetadata,
  PluginConfig,
  LoadedPlugin,
  PluginRegistry,
  PluginLoadContext,
  PluginLogger,
  QuickFix,
  QuickFixContext,
  QuickFixResult,
  PluginParser,
  PluginParseResult,
  PluginAnalyzer,
  AnalyzerContext,
  AnalyzerResult,
  PluginOutputFormatter,
} from './types/plugin.types.js';

// Config types
export type {
  CamoufConfig,
  SupportedLanguage,
  LayerConfig,
  DirectoryConfig,
  RulesConfig,
  BuiltinRulesConfig,
  RuleLevel,
  RuleLevelConfig,
  CustomRuleConfig,
  PatternsConfig,
  OutputConfig,
  AdvancedConfig,
} from './types/config.types.js';

// Core types
export type {
  Violation,
  ViolationSeverity,
  ProjectFile,
  Dependency,
  DependencyType,
  ImportedSymbol,
  ExportedSymbol,
  GraphNode,
  GraphEdge,
  ParsedFile,
  ViolationFix,
  FileChange,
} from './types/core.types.js';

// Rule interfaces for plugin authors
export type {
  IRule,
  RuleContext,
  RuleResult,
  RuleViolation,
  RuleConfig,
  RuleCategory,
} from './core/rules/rule.interface.js';

// Testing utilities
export { createRuleTestContext } from './testing/index.js';
export type { TestContextOptions } from './testing/index.js';
