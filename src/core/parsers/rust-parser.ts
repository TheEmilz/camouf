/**
 * Rust Parser
 * 
 * Parses Rust files for import/export analysis.
 */

import { IParser, ParserOptions } from './parser.interface.js';
import { ProjectFile, ParsedFile, Dependency, ExportedSymbol } from '../../types/core.types.js';

export class RustParser implements IParser {
  readonly language = 'rust';
  readonly extensions = ['.rs'];

  canParse(file: ProjectFile): boolean {
    return file.language === 'rust' || this.extensions.includes(file.extension);
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

    // Rust use statements: use std::collections::HashMap;
    const usePattern = /^use\s+([\w:]+)(?:::\{([^}]+)\})?(?:\s+as\s+(\w+))?;/;
    
    // Extern crate (older style)
    const externPattern = /^extern\s+crate\s+(\w+)(?:\s+as\s+(\w+))?;/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip comments
      if (line.startsWith('//') || line.startsWith('/*')) continue;

      // Use statements
      const useMatch = line.match(usePattern);
      if (useMatch) {
        const [, path, names, alias] = useMatch;
        
        if (names) {
          // use path::{A, B, C}
          const importedNames = names.split(',').map(n => n.trim());
          dependencies.push({
            source: '',
            target: path,
            type: 'rust-use',
            line: i + 1,
            imports: importedNames.map(name => ({
              name: name.split(' as ')[0].trim(),
              alias: name.includes(' as ') ? name.split(' as ')[1].trim() : undefined,
            })),
          });
        } else {
          // use path::Item or use path::*
          const name = path.split('::').pop() || path;
          dependencies.push({
            source: '',
            target: path.replace(/::\*$/, ''),
            type: 'rust-use',
            line: i + 1,
            imports: [{
              name: name === '*' ? '*' : name,
              alias,
              isNamespace: name === '*',
            }],
          });
        }
        continue;
      }

      // Extern crate
      const externMatch = line.match(externPattern);
      if (externMatch) {
        const [, crateName, alias] = externMatch;
        dependencies.push({
          source: '',
          target: crateName,
          type: 'rust-use',
          line: i + 1,
          imports: [{
            name: crateName,
            alias,
          }],
        });
      }
    }

    return dependencies;
  }

  async extractExports(content: string): Promise<ExportedSymbol[]> {
    const exports: ExportedSymbol[] = [];
    const lines = content.split('\n');

    // Rust public items
    const pubFnPattern = /^pub(?:\([^)]+\))?\s+(?:async\s+)?fn\s+(\w+)/;
    const pubStructPattern = /^pub(?:\([^)]+\))?\s+struct\s+(\w+)/;
    const pubEnumPattern = /^pub(?:\([^)]+\))?\s+enum\s+(\w+)/;
    const pubTraitPattern = /^pub(?:\([^)]+\))?\s+trait\s+(\w+)/;
    const pubTypePattern = /^pub(?:\([^)]+\))?\s+type\s+(\w+)/;
    const pubConstPattern = /^pub(?:\([^)]+\))?\s+(?:const|static)\s+(\w+)/;
    const pubModPattern = /^pub(?:\([^)]+\))?\s+mod\s+(\w+)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip comments
      if (line.startsWith('//') || line.startsWith('/*')) continue;

      // Public functions
      const fnMatch = line.match(pubFnPattern);
      if (fnMatch) {
        exports.push({
          name: fnMatch[1],
          type: 'function',
          line: i + 1,
        });
        continue;
      }

      // Public structs
      const structMatch = line.match(pubStructPattern);
      if (structMatch) {
        exports.push({
          name: structMatch[1],
          type: 'class',
          line: i + 1,
        });
        continue;
      }

      // Public enums
      const enumMatch = line.match(pubEnumPattern);
      if (enumMatch) {
        exports.push({
          name: enumMatch[1],
          type: 'enum',
          line: i + 1,
        });
        continue;
      }

      // Public traits
      const traitMatch = line.match(pubTraitPattern);
      if (traitMatch) {
        exports.push({
          name: traitMatch[1],
          type: 'interface',
          line: i + 1,
        });
        continue;
      }

      // Public type aliases
      const typeMatch = line.match(pubTypePattern);
      if (typeMatch) {
        exports.push({
          name: typeMatch[1],
          type: 'type',
          line: i + 1,
        });
        continue;
      }

      // Public constants
      const constMatch = line.match(pubConstPattern);
      if (constMatch) {
        exports.push({
          name: constMatch[1],
          type: 'constant',
          line: i + 1,
        });
        continue;
      }

      // Public modules
      const modMatch = line.match(pubModPattern);
      if (modMatch) {
        exports.push({
          name: modMatch[1],
          type: 'module',
          line: i + 1,
        });
        continue;
      }
    }

    return exports;
  }
}
