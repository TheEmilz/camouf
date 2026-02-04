/**
 * JavaScript Parser
 * 
 * Parses JavaScript files. Extends TypeScript parser since TS can parse JS.
 */

import { TypeScriptParser } from './typescript-parser.js';
import { ProjectFile } from '../../types/core.types.js';

export class JavaScriptParser extends TypeScriptParser {
  override readonly language: string = 'javascript';
  override readonly extensions = ['.js', '.jsx', '.mjs', '.cjs'];

  constructor() {
    super({
      strict: false,
    });
  }

  override canParse(file: ProjectFile): boolean {
    return file.language === 'javascript' || this.extensions.includes(file.extension);
  }
}
