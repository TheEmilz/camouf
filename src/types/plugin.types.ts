/**
 * Plugin Types
 * 
 * Defines the contract for Camouf plugins.
 * Plugins can extend Camouf with custom rules, parsers, analyzers, and quick-fixes.
 */

import { IRule, RuleViolation } from '../core/rules/rule.interface.js';

/**
 * Plugin type categories
 */
export type PluginType = 'rules' | 'analyzer' | 'parser' | 'quickfix' | 'output';

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  /** Plugin name (should match npm package name) */
  name: string;
  
  /** Plugin version (semver) */
  version: string;
  
  /** Human-readable display name */
  displayName?: string;
  
  /** Plugin description */
  description?: string;
  
  /** Plugin author */
  author?: string;
  
  /** Plugin homepage/repository URL */
  homepage?: string;
  
  /** Plugin types provided */
  types: PluginType[];
  
  /** Minimum Camouf version required */
  camoufVersion?: string;
  
  /** Keywords for discovery */
  keywords?: string[];
}

/**
 * Quick-fix definition
 */
export interface QuickFix {
  /** Unique identifier */
  id: string;
  
  /** Human-readable title */
  title: string;
  
  /** Description of what the fix does */
  description?: string;
  
  /** Rule IDs this fix applies to */
  appliesTo: string[];
  
  /** Apply the fix */
  apply(violation: RuleViolation, context: QuickFixContext): Promise<QuickFixResult>;
}

/**
 * Context provided to quick-fixes
 */
export interface QuickFixContext {
  /** Get file contents */
  getFileContents(filePath: string): Promise<string>;
  
  /** Write file contents */
  writeFileContents(filePath: string, contents: string): Promise<void>;
  
  /** Read JSON file */
  readJson<T>(filePath: string): Promise<T>;
  
  /** Write JSON file */
  writeJson(filePath: string, data: unknown): Promise<void>;
}

/**
 * Result of applying a quick-fix
 */
export interface QuickFixResult {
  /** Whether the fix was applied successfully */
  success: boolean;
  
  /** Files that were modified */
  modifiedFiles: string[];
  
  /** Optional message describing what was done */
  message?: string;
  
  /** Error if fix failed */
  error?: string;
}

/**
 * Custom parser interface for plugins
 */
export interface PluginParser {
  /** Parser identifier */
  id: string;
  
  /** Display name */
  name: string;
  
  /** File extensions this parser handles */
  extensions: string[];
  
  /** Parse a file and return AST/structure info */
  parse(filePath: string, contents: string): Promise<PluginParseResult>;
}

/**
 * Result of parsing a file
 */
export interface PluginParseResult {
  /** Exported symbols */
  exports: PluginExportedSymbol[];
  
  /** Imported dependencies */
  imports: PluginImportedDependency[];
  
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Exported symbol from a plugin parser
 */
export interface PluginExportedSymbol {
  name: string;
  type: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'const' | 'enum';
  line?: number;
  column?: number;
}

/**
 * Imported dependency from a plugin parser
 */
export interface PluginImportedDependency {
  source: string;
  symbols: string[];
  isDefault: boolean;
  isNamespace: boolean;
  line?: number;
}

/**
 * Custom analyzer for plugins
 */
export interface PluginAnalyzer {
  /** Analyzer identifier */
  id: string;
  
  /** Display name */
  name: string;
  
  /** Description */
  description?: string;
  
  /** Run the analyzer */
  analyze(context: AnalyzerContext): Promise<AnalyzerResult>;
}

/**
 * Context provided to analyzers
 */
export interface AnalyzerContext {
  /** Project root directory */
  rootDir: string;
  
  /** File paths to analyze */
  files: string[];
  
  /** Get file contents */
  getFileContents(filePath: string): Promise<string>;
  
  /** Configuration options for this analyzer */
  options?: Record<string, unknown>;
}

/**
 * Result from an analyzer
 */
export interface AnalyzerResult {
  /** Analysis data (custom per analyzer) */
  data: Record<string, unknown>;
  
  /** Optional violations found during analysis */
  violations?: RuleViolation[];
  
  /** Duration in milliseconds */
  duration?: number;
}

/**
 * Output formatter for plugins
 */
export interface PluginOutputFormatter {
  /** Formatter identifier */
  id: string;
  
  /** Display name */
  name: string;
  
  /** File extension for output */
  extension: string;
  
  /** Format violations into output string */
  format(violations: RuleViolation[], options?: Record<string, unknown>): string;
}

/**
 * Main plugin interface
 * 
 * Plugins export an object conforming to this interface.
 * Only the 'metadata' field is required. All capabilities are optional.
 */
export interface CamoufPlugin {
  /** Plugin metadata (required) */
  metadata: PluginMetadata;
  
  /** Rules provided by this plugin */
  rules?: IRule[];
  
  /** Quick-fixes provided by this plugin */
  quickfixes?: QuickFix[];
  
  /** Custom parsers */
  parsers?: PluginParser[];
  
  /** Custom analyzers */
  analyzers?: PluginAnalyzer[];
  
  /** Custom output formatters */
  formatters?: PluginOutputFormatter[];
  
  /** Called when plugin is loaded */
  onLoad?(context: PluginLoadContext): Promise<void> | void;
  
  /** Called when plugin is unloaded */
  onUnload?(): Promise<void> | void;
}

/**
 * Context provided when plugin is loaded
 */
export interface PluginLoadContext {
  /** Camouf version */
  camoufVersion: string;
  
  /** Project root directory */
  rootDir: string;
  
  /** Plugin-specific configuration from camouf.config */
  config?: Record<string, unknown>;
  
  /** Logger instance */
  log: PluginLogger;
}

/**
 * Logger interface for plugins
 */
export interface PluginLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Plugin configuration in camouf.config
 */
export interface PluginConfig {
  /** Plugin name (npm package name or local path) */
  name: string;
  
  /** Whether the plugin is enabled (default: true) */
  enabled?: boolean;
  
  /** Plugin-specific options */
  options?: Record<string, unknown>;
}

/**
 * Loaded plugin instance
 */
export interface LoadedPlugin {
  /** Plugin instance */
  plugin: CamoufPlugin;
  
  /** Resolved path to plugin */
  path: string;
  
  /** Whether plugin loaded successfully */
  loaded: boolean;
  
  /** Error if loading failed */
  error?: string;
}

/**
 * Plugin registry for managing loaded plugins
 */
export interface PluginRegistry {
  /** Get all loaded plugins */
  getPlugins(): LoadedPlugin[];
  
  /** Get a specific plugin by name */
  getPlugin(name: string): LoadedPlugin | undefined;
  
  /** Get all rules from all plugins */
  getAllRules(): IRule[];
  
  /** Get all quick-fixes from all plugins */
  getAllQuickFixes(): QuickFix[];
  
  /** Get all parsers from all plugins */
  getAllParsers(): PluginParser[];
  
  /** Get all analyzers from all plugins */
  getAllAnalyzers(): PluginAnalyzer[];
  
  /** Get all formatters from all plugins */
  getAllFormatters(): PluginOutputFormatter[];
}
