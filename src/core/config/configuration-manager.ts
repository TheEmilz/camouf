/**
 * Configuration Manager
 * 
 * Handles loading, validating, and managing Camouf configuration.
 * Supports multiple configuration formats and sources.
 */

import { cosmiconfig } from 'cosmiconfig';
import _Ajv, { ValidateFunction } from 'ajv';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { CamoufConfig, defaultConfig, SupportedLanguage, LayerConfig } from '../../types/config.types.js';
import { Logger } from '../logger.js';
import { configSchema } from './config-schema.js';

// ESM compatibility for Ajv
const Ajv = _Ajv as unknown as typeof _Ajv.default;

interface ProjectDetection {
  languages: SupportedLanguage[];
  directories: {
    client: string[];
    server: string[];
    shared: string[];
  };
  framework?: string;
}

interface ConfigAnswers {
  useDetected: boolean;
  languages?: SupportedLanguage[];
  clientDir: string;
  serverDir: string;
  sharedDir: string;
  rules: string[];
}

export class ConfigurationManager {
  private config: CamoufConfig | null = null;
  private configPath: string | null = null;
  private explorer = cosmiconfig('camouf', {
    searchPlaces: [
      'camouf.config.json',
      'camouf.config.js',
      'camouf.config.ts',
      'camouf.config.yaml',
      'camouf.config.yml',
      '.camoufrc',
      '.camoufrc.json',
      '.camoufrc.yaml',
      '.camoufrc.yml',
      'package.json',
    ],
    packageProp: 'camouf',
  });

  private ajv: InstanceType<typeof Ajv>;
  private validateSchema: ValidateFunction;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    this.validateSchema = this.ajv.compile(configSchema);
  }

  /**
   * Load configuration from file or search for it
   */
  async loadConfig(configPath?: string): Promise<CamoufConfig | null> {
    try {
      let result;

      if (configPath) {
        // Load from specific path
        result = await this.explorer.load(configPath);
      } else {
        // Search for configuration
        result = await this.explorer.search();
      }

      if (!result || result.isEmpty) {
        Logger.debug('No configuration found');
        return null;
      }

      this.configPath = result.filepath;
      const rawConfig = result.config;

      // Merge with defaults
      const mergedConfig = this.mergeWithDefaults(rawConfig);

      // Validate configuration
      if (!this.validate(mergedConfig)) {
        throw new Error('Invalid configuration');
      }

      // Resolve paths
      this.config = this.resolvePaths(mergedConfig, path.dirname(result.filepath));

      Logger.debug(`Loaded configuration from ${result.filepath}`);
      return this.config;

    } catch (error) {
      Logger.error(`Failed to load configuration: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Check if configuration exists in current directory
   */
  configExists(): boolean {
    const configFiles = [
      'camouf.config.json',
      'camouf.config.js',
      'camouf.config.ts',
      '.camoufrc',
      '.camoufrc.json',
    ];

    for (const file of configFiles) {
      const filePath = path.join(process.cwd(), file);
      if (fsSync.existsSync(filePath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate default configuration based on project detection
   */
  generateDefaultConfig(detection: ProjectDetection): CamoufConfig {
    const layers = this.generateLayers(detection);

    return {
      name: path.basename(process.cwd()),
      root: '.',
      languages: detection.languages,
      layers,
      directories: {
        client: detection.directories.client,
        server: detection.directories.server,
        shared: detection.directories.shared,
      },
      rules: {
        builtin: {
          'layer-dependencies': 'error',
          'circular-dependencies': 'warn',
          'performance-antipatterns': 'warn',
          'type-safety': 'warn',
        },
      },
      patterns: {
        include: this.getIncludePatterns(detection.languages),
        exclude: defaultConfig.patterns!.exclude,
      },
    };
  }

  /**
   * Build configuration from user answers
   */
  buildConfigFromAnswers(answers: ConfigAnswers, detection: ProjectDetection): CamoufConfig {
    const languages = answers.languages || detection.languages;
    const clientDirs = answers.clientDir.split(',').map(d => d.trim()).filter(Boolean);
    const serverDirs = answers.serverDir.split(',').map(d => d.trim()).filter(Boolean);
    const sharedDirs = answers.sharedDir.split(',').map(d => d.trim()).filter(Boolean);

    const directories = {
      client: clientDirs,
      server: serverDirs,
      shared: sharedDirs,
    };

    const layers = this.generateLayers({ languages, directories, framework: detection.framework });

    const builtinRules: Record<string, 'off' | 'warn' | 'error'> = {};
    for (const rule of answers.rules) {
      builtinRules[rule] = 'error';
    }

    return {
      name: path.basename(process.cwd()),
      root: '.',
      languages,
      layers,
      directories,
      rules: {
        builtin: builtinRules as CamoufConfig['rules']['builtin'],
      },
      patterns: {
        include: this.getIncludePatterns(languages),
        exclude: defaultConfig.patterns!.exclude,
      },
    };
  }

  /**
   * Write configuration to file
   */
  async writeConfig(config: CamoufConfig, filePath?: string): Promise<void> {
    const targetPath = filePath || path.join(process.cwd(), 'camouf.config.json');
    const content = JSON.stringify(config, null, 2);
    await fs.writeFile(targetPath, content, 'utf-8');
    this.config = config;
    this.configPath = targetPath;
  }

  /**
   * Get current configuration
   */
  getConfig(): CamoufConfig | null {
    return this.config;
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string | null {
    return this.configPath;
  }

  /**
   * Validate configuration against schema
   */
  private validate(config: unknown): config is CamoufConfig {
    const valid = this.validateSchema(config);
    
    if (!valid && this.validateSchema.errors) {
      for (const error of this.validateSchema.errors) {
        Logger.error(`Config validation error: ${error.instancePath} ${error.message}`);
      }
    }

    return valid as boolean;
  }

  /**
   * Merge configuration with defaults
   */
  private mergeWithDefaults(config: Partial<CamoufConfig>): CamoufConfig {
    return {
      ...defaultConfig,
      ...config,
      patterns: {
        ...defaultConfig.patterns,
        ...config.patterns,
      },
      rules: {
        ...defaultConfig.rules,
        ...config.rules,
        builtin: {
          ...defaultConfig.rules?.builtin,
          ...config.rules?.builtin,
        },
      },
      advanced: {
        ...defaultConfig.advanced,
        ...config.advanced,
      },
    } as CamoufConfig;
  }

  /**
   * Resolve relative paths in configuration
   */
  private resolvePaths(config: CamoufConfig, basePath: string): CamoufConfig {
    const resolve = (p: string) => path.isAbsolute(p) ? p : path.resolve(basePath, p);

    return {
      ...config,
      root: resolve(config.root),
      directories: {
        client: config.directories.client.map(resolve),
        server: config.directories.server.map(resolve),
        shared: config.directories.shared.map(resolve),
        tests: config.directories.tests?.map(resolve),
      },
      layers: config.layers.map(layer => ({
        ...layer,
        directories: layer.directories.map(resolve),
      })),
    };
  }

  /**
   * Generate layer configurations
   */
  private generateLayers(detection: ProjectDetection): LayerConfig[] {
    const layers: LayerConfig[] = [];

    if (detection.directories.client.length > 0) {
      layers.push({
        name: 'presentation',
        type: 'presentation',
        directories: detection.directories.client,
        allowedDependencies: ['application', 'shared'],
      });
    }

    if (detection.directories.server.length > 0) {
      layers.push({
        name: 'application',
        type: 'application',
        directories: detection.directories.server,
        allowedDependencies: ['domain', 'infrastructure', 'shared'],
      });

      layers.push({
        name: 'domain',
        type: 'domain',
        directories: detection.directories.server.map(d => `${d}/domain`),
        allowedDependencies: ['shared'],
      });

      layers.push({
        name: 'infrastructure',
        type: 'infrastructure',
        directories: detection.directories.server.map(d => `${d}/infrastructure`),
        allowedDependencies: ['domain', 'application', 'shared'],
      });
    }

    if (detection.directories.shared.length > 0) {
      layers.push({
        name: 'shared',
        type: 'shared',
        directories: detection.directories.shared,
        allowedDependencies: [],
      });
    }

    return layers;
  }

  /**
   * Get file include patterns based on languages
   */
  private getIncludePatterns(languages: SupportedLanguage[]): string[] {
    const patterns: string[] = [];

    const languagePatterns: Record<SupportedLanguage, string[]> = {
      typescript: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
      javascript: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
      python: ['**/*.py'],
      java: ['**/*.java'],
      go: ['**/*.go'],
      rust: ['**/*.rs'],
      csharp: ['**/*.cs'],
      kotlin: ['**/*.kt', '**/*.kts'],
    };

    for (const lang of languages) {
      if (languagePatterns[lang]) {
        patterns.push(...languagePatterns[lang]);
      }
    }

    return patterns;
  }
}
