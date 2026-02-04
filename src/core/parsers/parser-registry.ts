/**
 * Parser Registry
 * 
 * Manages language parsers and provides access to them.
 */

import { CamoufConfig, SupportedLanguage } from '../../types/config.types.js';
import { IParser } from './parser.interface.js';
import { TypeScriptParser } from './typescript-parser.js';
import { JavaScriptParser } from './javascript-parser.js';
import { PythonParser } from './python-parser.js';
import { JavaParser } from './java-parser.js';
import { GoParser } from './go-parser.js';
import { RustParser } from './rust-parser.js';
import { Logger } from '../logger.js';

export class ParserRegistry {
  private parsers: Map<SupportedLanguage, IParser> = new Map();
  private config: CamoufConfig;

  constructor(config: CamoufConfig) {
    this.config = config;
    this.initializeParsers();
  }

  /**
   * Initialize parsers for configured languages
   */
  private initializeParsers(): void {
    for (const language of this.config.languages) {
      try {
        const parser = this.createParser(language);
        if (parser) {
          this.parsers.set(language, parser);
          Logger.debug(`Initialized parser for ${language}`);
        }
      } catch (error) {
        Logger.warn(`Failed to initialize parser for ${language}: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Create a parser for a specific language
   */
  private createParser(language: SupportedLanguage): IParser | null {
    const tsOptions = this.config.parsers?.typescript;
    const pyOptions = this.config.parsers?.python;
    const javaOptions = this.config.parsers?.java;

    switch (language) {
      case 'typescript':
        return new TypeScriptParser({
          tsConfigPath: tsOptions?.tsConfigPath,
          strict: tsOptions?.strict,
        });

      case 'javascript':
        return new JavaScriptParser();

      case 'python':
        return new PythonParser({
          version: pyOptions?.version,
        });

      case 'java':
        return new JavaParser({
          sourceVersion: javaOptions?.sourceVersion,
        });

      case 'go':
        return new GoParser();

      case 'rust':
        return new RustParser();

      case 'csharp':
      case 'kotlin':
        // These will be implemented later
        Logger.debug(`Parser for ${language} is not yet implemented`);
        return null;

      default:
        return null;
    }
  }

  /**
   * Get parser for a language
   */
  getParser(language: SupportedLanguage): IParser | undefined {
    return this.parsers.get(language);
  }

  /**
   * Get parser that can handle a file extension
   */
  getParserForExtension(extension: string): IParser | undefined {
    for (const parser of this.parsers.values()) {
      if (parser.extensions.includes(extension)) {
        return parser;
      }
    }
    return undefined;
  }

  /**
   * Check if a language is supported
   */
  isSupported(language: SupportedLanguage): boolean {
    return this.parsers.has(language);
  }

  /**
   * Get all supported languages
   */
  getSupportedLanguages(): SupportedLanguage[] {
    return Array.from(this.parsers.keys());
  }

  /**
   * Register a custom parser
   */
  registerParser(language: SupportedLanguage, parser: IParser): void {
    this.parsers.set(language, parser);
    Logger.debug(`Registered custom parser for ${language}`);
  }

  /**
   * Dispose all parsers
   */
  dispose(): void {
    for (const parser of this.parsers.values()) {
      if (parser.dispose) {
        parser.dispose();
      }
    }
    this.parsers.clear();
  }
}
