/**
 * Plugin Loader
 * 
 * Loads, validates, and manages Camouf plugins.
 */

import { pathToFileURL } from 'url';
import { existsSync } from 'fs';
import { resolve, join } from 'path';
import { Logger } from '../logger.js';
import { IRule } from '../rules/rule.interface.js';
import {
  CamoufPlugin,
  PluginConfig,
  LoadedPlugin,
  PluginRegistry,
  PluginLoadContext,
  QuickFix,
  PluginParser,
  PluginAnalyzer,
  PluginOutputFormatter,
  PluginLogger,
} from '../../types/plugin.types.js';

// Package version - would be read from package.json in production
const CAMOUF_VERSION = '1.0.0';

/**
 * Default plugin logger implementation
 */
class DefaultPluginLogger implements PluginLogger {
  private prefix: string;

  constructor(pluginName: string) {
    this.prefix = `[plugin:${pluginName}]`;
  }

  debug(message: string): void {
    Logger.debug(`${this.prefix} ${message}`);
  }

  info(message: string): void {
    Logger.info(`${this.prefix} ${message}`);
  }

  warn(message: string): void {
    Logger.warn(`${this.prefix} ${message}`);
  }

  error(message: string): void {
    Logger.error(`${this.prefix} ${message}`);
  }
}

/**
 * Plugin Registry Implementation
 */
export class PluginRegistryImpl implements PluginRegistry {
  private plugins: Map<string, LoadedPlugin> = new Map();

  addPlugin(name: string, plugin: LoadedPlugin): void {
    this.plugins.set(name, plugin);
  }

  removePlugin(name: string): void {
    this.plugins.delete(name);
  }

  getPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  getAllRules(): IRule[] {
    const rules: IRule[] = [];
    for (const { plugin, loaded } of this.plugins.values()) {
      if (loaded && plugin.rules) {
        rules.push(...plugin.rules);
      }
    }
    return rules;
  }

  getAllQuickFixes(): QuickFix[] {
    const quickfixes: QuickFix[] = [];
    for (const { plugin, loaded } of this.plugins.values()) {
      if (loaded && plugin.quickfixes) {
        quickfixes.push(...plugin.quickfixes);
      }
    }
    return quickfixes;
  }

  getAllParsers(): PluginParser[] {
    const parsers: PluginParser[] = [];
    for (const { plugin, loaded } of this.plugins.values()) {
      if (loaded && plugin.parsers) {
        parsers.push(...plugin.parsers);
      }
    }
    return parsers;
  }

  getAllAnalyzers(): PluginAnalyzer[] {
    const analyzers: PluginAnalyzer[] = [];
    for (const { plugin, loaded } of this.plugins.values()) {
      if (loaded && plugin.analyzers) {
        analyzers.push(...plugin.analyzers);
      }
    }
    return analyzers;
  }

  getAllFormatters(): PluginOutputFormatter[] {
    const formatters: PluginOutputFormatter[] = [];
    for (const { plugin, loaded } of this.plugins.values()) {
      if (loaded && plugin.formatters) {
        formatters.push(...plugin.formatters);
      }
    }
    return formatters;
  }

  clear(): void {
    this.plugins.clear();
  }
}

/**
 * Plugin Loader
 */
export class PluginLoader {
  private registry: PluginRegistryImpl;
  private rootDir: string;

  constructor(rootDir: string) {
    this.registry = new PluginRegistryImpl();
    this.rootDir = rootDir;
  }

  /**
   * Get the plugin registry
   */
  getRegistry(): PluginRegistry {
    return this.registry;
  }

  /**
   * Load plugins from configuration
   */
  async loadPlugins(pluginConfigs: (string | PluginConfig)[]): Promise<LoadedPlugin[]> {
    const results: LoadedPlugin[] = [];

    for (const config of pluginConfigs) {
      const pluginConfig = this.normalizeConfig(config);
      
      if (pluginConfig.enabled === false) {
        Logger.debug(`Plugin '${pluginConfig.name}' is disabled, skipping`);
        continue;
      }

      try {
        const loadedPlugin = await this.loadPlugin(pluginConfig);
        results.push(loadedPlugin);
        
        if (loadedPlugin.loaded) {
          this.registry.addPlugin(pluginConfig.name, loadedPlugin);
          Logger.info(`Loaded plugin: ${pluginConfig.name}`);
        }
      } catch (error) {
        const errorMessage = (error as Error).message;
        Logger.error(`Failed to load plugin '${pluginConfig.name}': ${errorMessage}`);
        results.push({
          plugin: {} as CamoufPlugin,
          path: pluginConfig.name,
          loaded: false,
          error: errorMessage,
        });
      }
    }

    return results;
  }

  /**
   * Load a single plugin
   */
  private async loadPlugin(config: PluginConfig): Promise<LoadedPlugin> {
    const pluginPath = await this.resolvePluginPath(config.name);
    
    if (!pluginPath) {
      throw new Error(`Could not resolve plugin path: ${config.name}`);
    }

    // Dynamic import
    const pluginModule = await import(pathToFileURL(pluginPath).href);
    const plugin = pluginModule.default || pluginModule;

    // Validate plugin structure
    this.validatePlugin(plugin, config.name);

    // Create load context
    const loadContext: PluginLoadContext = {
      camoufVersion: CAMOUF_VERSION,
      rootDir: this.rootDir,
      config: config.options,
      log: new DefaultPluginLogger(config.name),
    };

    // Call onLoad hook if present
    if (plugin.onLoad) {
      await plugin.onLoad(loadContext);
    }

    return {
      plugin,
      path: pluginPath,
      loaded: true,
    };
  }

  /**
   * Resolve plugin path
   */
  private async resolvePluginPath(name: string): Promise<string | null> {
    // Local path (relative or absolute)
    if (name.startsWith('.') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
      const absolutePath = resolve(this.rootDir, name);
      
      // Try with common extensions
      const extensions = ['', '.js', '.mjs', '.cjs', '/index.js', '/index.mjs'];
      for (const ext of extensions) {
        const fullPath = absolutePath + ext;
        if (existsSync(fullPath)) {
          return fullPath;
        }
      }
      return null;
    }

    // npm package - look in node_modules
    const nodeModulesPath = join(this.rootDir, 'node_modules', name);
    
    // Try to find package.json and get main entry
    const packageJsonPath = join(nodeModulesPath, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = await import(pathToFileURL(packageJsonPath).href, {
          with: { type: 'json' }
        });
        const pkg = packageJson.default;
        const mainEntry = pkg.main || pkg.exports?.['.'] || 'index.js';
        return join(nodeModulesPath, mainEntry);
      } catch {
        // Fallback to index.js
        return join(nodeModulesPath, 'index.js');
      }
    }

    // Last resort: try index.js directly
    if (existsSync(join(nodeModulesPath, 'index.js'))) {
      return join(nodeModulesPath, 'index.js');
    }

    return null;
  }

  /**
   * Validate plugin structure
   */
  private validatePlugin(plugin: unknown, name: string): asserts plugin is CamoufPlugin {
    if (!plugin || typeof plugin !== 'object') {
      throw new Error(`Plugin '${name}' does not export a valid object`);
    }

    const p = plugin as Partial<CamoufPlugin>;

    if (!p.metadata) {
      throw new Error(`Plugin '${name}' is missing required 'metadata' field`);
    }

    if (!p.metadata.name) {
      throw new Error(`Plugin '${name}' metadata is missing 'name' field`);
    }

    if (!p.metadata.version) {
      throw new Error(`Plugin '${name}' metadata is missing 'version' field`);
    }

    if (!p.metadata.types || !Array.isArray(p.metadata.types)) {
      throw new Error(`Plugin '${name}' metadata is missing 'types' array`);
    }

    // Validate rules if present
    if (p.rules) {
      if (!Array.isArray(p.rules)) {
        throw new Error(`Plugin '${name}' rules must be an array`);
      }
      for (const rule of p.rules) {
        if (!rule.id || !rule.name) {
          throw new Error(`Plugin '${name}' contains invalid rule: missing id or name`);
        }
      }
    }
  }

  /**
   * Normalize plugin configuration
   */
  private normalizeConfig(config: string | PluginConfig): PluginConfig {
    if (typeof config === 'string') {
      return { name: config, enabled: true };
    }
    return { enabled: true, ...config };
  }

  /**
   * Unload all plugins
   */
  async unloadAll(): Promise<void> {
    for (const { plugin } of this.registry.getPlugins()) {
      if (plugin.onUnload) {
        try {
          await plugin.onUnload();
        } catch (error) {
          Logger.warn(`Error unloading plugin: ${(error as Error).message}`);
        }
      }
    }
    this.registry.clear();
  }

  /**
   * Get all rules from loaded plugins
   */
  getRules(): IRule[] {
    return this.registry.getAllRules();
  }

  /**
   * Get all quick-fixes from loaded plugins
   */
  getQuickFixes(): QuickFix[] {
    return this.registry.getAllQuickFixes();
  }

  /**
   * Get all parsers from loaded plugins
   */
  getParsers(): PluginParser[] {
    return this.registry.getAllParsers();
  }

  /**
   * Get all analyzers from loaded plugins
   */
  getAnalyzers(): PluginAnalyzer[] {
    return this.registry.getAllAnalyzers();
  }

  /**
   * Get all formatters from loaded plugins
   */
  getFormatters(): PluginOutputFormatter[] {
    return this.registry.getAllFormatters();
  }
}

/**
 * Create a plugin loader instance
 */
export function createPluginLoader(rootDir: string): PluginLoader {
  return new PluginLoader(rootDir);
}
