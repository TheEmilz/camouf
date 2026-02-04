/**
 * Go Parser
 * 
 * Parses Go files for import/export analysis.
 */

import { IParser, ParserOptions } from './parser.interface.js';
import { ProjectFile, ParsedFile, Dependency, ExportedSymbol } from '../../types/core.types.js';

export class GoParser implements IParser {
  readonly language = 'go';
  readonly extensions = ['.go'];

  canParse(file: ProjectFile): boolean {
    return file.language === 'go' || this.extensions.includes(file.extension);
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
    
    // Single import: import "fmt"
    const singleImportPattern = /import\s+"([^"]+)"/g;
    
    // Multi import: import ( ... )
    const multiImportPattern = /import\s*\(([^)]+)\)/gs;

    // Process single imports
    let match;
    while ((match = singleImportPattern.exec(content)) !== null) {
      const importPath = match[1];
      const line = content.substring(0, match.index).split('\n').length;
      
      dependencies.push({
        source: '',
        target: importPath,
        type: 'go-import',
        line,
        imports: [{
          name: importPath.split('/').pop() || importPath,
        }],
      });
    }

    // Process multi imports
    while ((match = multiImportPattern.exec(content)) !== null) {
      const importBlock = match[1];
      const blockStartLine = content.substring(0, match.index).split('\n').length;
      
      const importLines = importBlock.split('\n');
      for (let i = 0; i < importLines.length; i++) {
        const line = importLines[i].trim();
        if (!line) continue;

        // Match: alias "path" or just "path"
        const importMatch = line.match(/(?:(\w+)\s+)?"([^"]+)"/);
        if (importMatch) {
          const [, alias, importPath] = importMatch;
          
          dependencies.push({
            source: '',
            target: importPath,
            type: 'go-import',
            line: blockStartLine + i,
            imports: [{
              name: importPath.split('/').pop() || importPath,
              alias,
            }],
          });
        }
      }
    }

    return dependencies;
  }

  async extractExports(content: string): Promise<ExportedSymbol[]> {
    const exports: ExportedSymbol[] = [];
    const lines = content.split('\n');

    // Go exports are public if they start with uppercase
    const funcPattern = /^func\s+(?:\([^)]+\)\s+)?([A-Z]\w*)\s*\(/;
    const typePattern = /^type\s+([A-Z]\w*)\s+(?:struct|interface)/;
    const constPattern = /^(?:const|var)\s+([A-Z]\w*)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip comments
      if (line.startsWith('//') || line.startsWith('/*')) continue;

      // Function declarations
      const funcMatch = line.match(funcPattern);
      if (funcMatch) {
        exports.push({
          name: funcMatch[1],
          type: 'function',
          line: i + 1,
        });
        continue;
      }

      // Type declarations
      const typeMatch = line.match(typePattern);
      if (typeMatch) {
        const isInterface = line.includes('interface');
        exports.push({
          name: typeMatch[1],
          type: isInterface ? 'interface' : 'class',
          line: i + 1,
        });
        continue;
      }

      // Const/var declarations
      const constMatch = line.match(constPattern);
      if (constMatch) {
        exports.push({
          name: constMatch[1],
          type: line.startsWith('const') ? 'constant' : 'variable',
          line: i + 1,
        });
        continue;
      }
    }

    return exports;
  }
}
