/**
 * Java Parser
 * 
 * Parses Java files for import/export analysis.
 */

import { IParser, ParserOptions } from './parser.interface.js';
import { ProjectFile, ParsedFile, Dependency, ExportedSymbol } from '../../types/core.types.js';

interface JavaParserOptions extends ParserOptions {
  sourceVersion?: string;
}

export class JavaParser implements IParser {
  readonly language = 'java';
  readonly extensions = ['.java'];
  
  private options: JavaParserOptions;

  constructor(options: JavaParserOptions = {}) {
    this.options = options;
  }

  canParse(file: ProjectFile): boolean {
    return file.language === 'java' || this.extensions.includes(file.extension);
  }

  async parse(file: ProjectFile, content: string): Promise<ParsedFile> {
    const dependencies = await this.extractImports(content);
    const exports = await this.extractExports(content);

    return {
      file,
      dependencies,
      exports,
    };
  }

  async extractImports(content: string): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];
    const lines = content.split('\n');

    // Java import pattern
    const importPattern = /^import\s+(static\s+)?([\w.]+)(?:\.\*)?;/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip comments
      if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;

      const match = line.match(importPattern);
      if (match) {
        const [, isStatic, importPath] = match;
        
        dependencies.push({
          source: '',
          target: importPath,
          type: 'java-import',
          line: i + 1,
          imports: [{
            name: importPath.split('.').pop() || importPath,
          }],
        });
      }
    }

    return dependencies;
  }

  async extractExports(content: string): Promise<ExportedSymbol[]> {
    const exports: ExportedSymbol[] = [];
    const lines = content.split('\n');

    // Patterns for Java declarations
    const classPattern = /^(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+(\w+)/;
    const interfacePattern = /^(?:public\s+)?interface\s+(\w+)/;
    const enumPattern = /^(?:public\s+)?enum\s+(\w+)/;
    const methodPattern = /^(?:public\s+)(?:static\s+)?(?:final\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/;

    let inClass = false;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Track brace depth
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      // Skip if inside class body (except for public methods)
      if (inClass && braceCount > 1) {
        // Check for public methods
        const methodMatch = line.match(methodPattern);
        if (methodMatch) {
          exports.push({
            name: methodMatch[1],
            type: 'function',
            line: i + 1,
          });
        }
        continue;
      }

      // Class definitions
      const classMatch = line.match(classPattern);
      if (classMatch) {
        exports.push({
          name: classMatch[1],
          type: 'class',
          line: i + 1,
        });
        inClass = true;
        continue;
      }

      // Interface definitions
      const interfaceMatch = line.match(interfacePattern);
      if (interfaceMatch) {
        exports.push({
          name: interfaceMatch[1],
          type: 'interface',
          line: i + 1,
        });
        continue;
      }

      // Enum definitions
      const enumMatch = line.match(enumPattern);
      if (enumMatch) {
        exports.push({
          name: enumMatch[1],
          type: 'enum',
          line: i + 1,
        });
        continue;
      }
    }

    return exports;
  }
}
