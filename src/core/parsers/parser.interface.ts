/**
 * Parser Interface
 * 
 * Defines the contract for language-specific parsers.
 */

import { ProjectFile, ParsedFile, Dependency, ExportedSymbol } from '../../types/core.types.js';

/**
 * Interface for language parsers
 */
export interface IParser {
  /** Language this parser handles */
  readonly language: string;
  
  /** File extensions this parser can handle */
  readonly extensions: string[];
  
  /**
   * Parse a file and extract dependencies and exports
   */
  parse(file: ProjectFile, content: string): Promise<ParsedFile>;
  
  /**
   * Check if this parser can handle a file
   */
  canParse(file: ProjectFile): boolean;
  
  /**
   * Get import statements from content
   */
  extractImports(content: string): Promise<Dependency[]>;
  
  /**
   * Get export statements from content
   */
  extractExports(content: string): Promise<ExportedSymbol[]>;
  
  /**
   * Dispose of any resources
   */
  dispose?(): void;
}

/**
 * Base parser options
 */
export interface ParserOptions {
  /** Enable strict mode */
  strict?: boolean;
  
  /** Additional options passed to the parser */
  parserOptions?: Record<string, unknown>;
}

/**
 * Parser factory function type
 */
export type ParserFactory = (options?: ParserOptions) => IParser;
