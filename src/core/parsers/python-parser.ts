/**
 * Python Parser
 * 
 * Parses Python files using tree-sitter for AST analysis.
 */

import { IParser, ParserOptions } from './parser.interface.js';
import { ProjectFile, ParsedFile, Dependency, ExportedSymbol, DependencyType } from '../../types/core.types.js';

interface PythonParserOptions extends ParserOptions {
  version?: '2' | '3';
}

export class PythonParser implements IParser {
  readonly language = 'python';
  readonly extensions = ['.py'];
  
  private options: PythonParserOptions;

  constructor(options: PythonParserOptions = {}) {
    this.options = options;
  }

  canParse(file: ProjectFile): boolean {
    return file.language === 'python' || this.extensions.includes(file.extension);
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

    // Regex patterns for Python imports
    const importPattern = /^(?:from\s+([\w.]+)\s+)?import\s+(.+)$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip comments and empty lines
      if (line.startsWith('#') || line === '') continue;

      const match = line.match(importPattern);
      if (match) {
        const [, fromModule, imports] = match;
        
        if (fromModule) {
          // from X import Y, Z
          const importedNames = imports.split(',').map(s => s.trim().split(/\s+as\s+/));
          
          dependencies.push({
            source: '',
            target: fromModule,
            type: 'python-import',
            line: i + 1,
            imports: importedNames.map(([name, alias]) => ({
              name: name.trim(),
              alias: alias?.trim(),
            })),
          });
        } else {
          // import X, Y, Z
          const modules = imports.split(',').map(s => s.trim().split(/\s+as\s+/));
          
          for (const [moduleName, alias] of modules) {
            dependencies.push({
              source: '',
              target: moduleName.trim(),
              type: 'python-import',
              line: i + 1,
              imports: [{
                name: moduleName.trim(),
                alias: alias?.trim(),
              }],
            });
          }
        }
      }
    }

    return dependencies;
  }

  async extractExports(content: string): Promise<ExportedSymbol[]> {
    const exports: ExportedSymbol[] = [];
    const lines = content.split('\n');

    // Patterns for Python definitions
    const classPattern = /^class\s+(\w+)/;
    const functionPattern = /^def\s+(\w+)/;
    const variablePattern = /^(\w+)\s*=/;
    const allPattern = /__all__\s*=\s*\[([^\]]+)\]/;

    // Check for __all__ definition
    const allMatch = content.match(allPattern);
    const explicitExports = allMatch 
      ? allMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''))
      : null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip indented lines (they're inside a class/function)
      if (line.startsWith(' ') || line.startsWith('\t')) continue;

      // Class definitions
      const classMatch = line.match(classPattern);
      if (classMatch) {
        const name = classMatch[1];
        if (!name.startsWith('_') || (explicitExports && explicitExports.includes(name))) {
          exports.push({
            name,
            type: 'class',
            line: i + 1,
          });
        }
        continue;
      }

      // Function definitions
      const funcMatch = line.match(functionPattern);
      if (funcMatch) {
        const name = funcMatch[1];
        if (!name.startsWith('_') || (explicitExports && explicitExports.includes(name))) {
          exports.push({
            name,
            type: 'function',
            line: i + 1,
          });
        }
        continue;
      }

      // Top-level variables (constants)
      const varMatch = line.match(variablePattern);
      if (varMatch) {
        const name = varMatch[1];
        if (!name.startsWith('_') || (explicitExports && explicitExports.includes(name))) {
          // Check if it's uppercase (constant) or in __all__
          const isConstant = name === name.toUpperCase();
          if (isConstant || (explicitExports && explicitExports.includes(name))) {
            exports.push({
              name,
              type: isConstant ? 'constant' : 'variable',
              line: i + 1,
            });
          }
        }
      }
    }

    return exports;
  }
}
