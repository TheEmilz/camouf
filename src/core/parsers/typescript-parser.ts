/**
 * TypeScript Parser
 * 
 * Parses TypeScript files using ts-morph for deep analysis.
 */

import { Project, SourceFile, ImportDeclaration, ExportDeclaration, Node } from 'ts-morph';
import { IParser, ParserOptions } from './parser.interface.js';
import { ProjectFile, ParsedFile, Dependency, ExportedSymbol, ImportedSymbol, DependencyType, SymbolType } from '../../types/core.types.js';

interface TypeScriptParserOptions extends ParserOptions {
  tsConfigPath?: string;
}

export class TypeScriptParser implements IParser {
  readonly language: string = 'typescript';
  readonly extensions = ['.ts', '.tsx', '.mts', '.cts'];
  
  protected project: Project;

  constructor(options: TypeScriptParserOptions = {}) {
    this.project = new Project({
      tsConfigFilePath: options.tsConfigPath,
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        noEmit: true,
        skipLibCheck: true,
      },
    });
  }

  canParse(file: ProjectFile): boolean {
    return file.language === 'typescript' || this.extensions.includes(file.extension);
  }

  async parse(file: ProjectFile, content: string): Promise<ParsedFile> {
    // Create or get source file
    let sourceFile = this.project.getSourceFile(file.path);
    
    if (sourceFile) {
      sourceFile.replaceWithText(content);
    } else {
      sourceFile = this.project.createSourceFile(file.path, content, { overwrite: true });
    }

    const dependencies = await this.extractImports(content, sourceFile);
    const exports = await this.extractExports(content, sourceFile);

    return {
      file,
      dependencies,
      exports,
      ast: sourceFile,
    };
  }

  async extractImports(content: string, sourceFile?: SourceFile): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];
    
    if (!sourceFile) {
      sourceFile = this.project.createSourceFile('__temp__.ts', content, { overwrite: true });
    }

    // Regular imports
    const importDeclarations = sourceFile.getImportDeclarations();
    for (const importDecl of importDeclarations) {
      const dependency = this.parseImportDeclaration(importDecl);
      if (dependency) {
        dependencies.push(dependency);
      }
    }

    // Dynamic imports
    const dynamicImports = this.findDynamicImports(sourceFile);
    dependencies.push(...dynamicImports);

    // Require statements
    const requires = this.findRequireStatements(sourceFile);
    dependencies.push(...requires);

    // Export from statements
    const exportFroms = sourceFile.getExportDeclarations();
    for (const exportDecl of exportFroms) {
      const moduleSpecifier = exportDecl.getModuleSpecifier();
      if (moduleSpecifier) {
        dependencies.push({
          source: sourceFile.getFilePath(),
          target: moduleSpecifier.getLiteralText(),
          type: 're-export',
          line: exportDecl.getStartLineNumber(),
          imports: this.getExportedNames(exportDecl),
        });
      }
    }

    return dependencies;
  }

  async extractExports(content: string, sourceFile?: SourceFile): Promise<ExportedSymbol[]> {
    const exports: ExportedSymbol[] = [];
    
    if (!sourceFile) {
      sourceFile = this.project.createSourceFile('__temp__.ts', content, { overwrite: true });
    }

    // Get all exported declarations
    const exportedDeclarations = sourceFile.getExportedDeclarations();
    
    for (const [name, declarations] of exportedDeclarations) {
      for (const declaration of declarations) {
        const exportedSymbol = this.parseExportedDeclaration(name, declaration);
        if (exportedSymbol) {
          exports.push(exportedSymbol);
        }
      }
    }

    // Check for default export
    const defaultExport = sourceFile.getDefaultExportSymbol();
    if (defaultExport) {
      exports.push({
        name: 'default',
        type: 'variable',
        isDefault: true,
        line: defaultExport.getDeclarations()[0]?.getStartLineNumber(),
      });
    }

    return exports;
  }

  private parseImportDeclaration(importDecl: ImportDeclaration): Dependency | null {
    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    const importedSymbols: ImportedSymbol[] = [];
    
    // Default import
    const defaultImport = importDecl.getDefaultImport();
    if (defaultImport) {
      importedSymbols.push({
        name: 'default',
        alias: defaultImport.getText(),
        isDefault: true,
      });
    }

    // Namespace import
    const namespaceImport = importDecl.getNamespaceImport();
    if (namespaceImport) {
      importedSymbols.push({
        name: '*',
        alias: namespaceImport.getText(),
        isNamespace: true,
      });
    }

    // Named imports
    const namedImports = importDecl.getNamedImports();
    for (const namedImport of namedImports) {
      importedSymbols.push({
        name: namedImport.getName(),
        alias: namedImport.getAliasNode()?.getText(),
      });
    }

    // Determine import type
    let importType: DependencyType = 'import';
    if (importDecl.isTypeOnly()) {
      importType = 'type-import';
    } else if (importedSymbols.length === 0) {
      importType = 'side-effect';
    }

    return {
      source: importDecl.getSourceFile().getFilePath(),
      target: moduleSpecifier,
      type: importType,
      line: importDecl.getStartLineNumber(),
      imports: importedSymbols,
      isTypeOnly: importDecl.isTypeOnly(),
    };
  }

  private findDynamicImports(sourceFile: SourceFile): Dependency[] {
    const dependencies: Dependency[] = [];
    
    sourceFile.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expression = node.getExpression();
        if (expression.getText() === 'import') {
          const args = node.getArguments();
          if (args.length > 0) {
            const arg = args[0];
            if (Node.isStringLiteral(arg)) {
              dependencies.push({
                source: sourceFile.getFilePath(),
                target: arg.getLiteralText(),
                type: 'dynamic-import',
                line: node.getStartLineNumber(),
                isDynamic: true,
              });
            }
          }
        }
      }
    });

    return dependencies;
  }

  private findRequireStatements(sourceFile: SourceFile): Dependency[] {
    const dependencies: Dependency[] = [];
    
    sourceFile.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expression = node.getExpression();
        if (Node.isIdentifier(expression) && expression.getText() === 'require') {
          const args = node.getArguments();
          if (args.length > 0) {
            const arg = args[0];
            if (Node.isStringLiteral(arg)) {
              dependencies.push({
                source: sourceFile.getFilePath(),
                target: arg.getLiteralText(),
                type: 'require',
                line: node.getStartLineNumber(),
              });
            }
          }
        }
      }
    });

    return dependencies;
  }

  private getExportedNames(exportDecl: ExportDeclaration): ImportedSymbol[] {
    const namedExports = exportDecl.getNamedExports();
    return namedExports.map((exp) => ({
      name: exp.getName(),
      alias: exp.getAliasNode()?.getText(),
    }));
  }

  private parseExportedDeclaration(name: string, declaration: Node): ExportedSymbol | null {
    let symbolType: SymbolType = 'variable';
    let typeAnnotation: string | undefined;

    if (Node.isFunctionDeclaration(declaration) || Node.isFunctionExpression(declaration)) {
      symbolType = 'function';
    } else if (Node.isClassDeclaration(declaration) || Node.isClassExpression(declaration)) {
      symbolType = 'class';
    } else if (Node.isInterfaceDeclaration(declaration)) {
      symbolType = 'interface';
    } else if (Node.isTypeAliasDeclaration(declaration)) {
      symbolType = 'type';
    } else if (Node.isEnumDeclaration(declaration)) {
      symbolType = 'enum';
    } else if (Node.isVariableDeclaration(declaration)) {
      const initializer = declaration.getInitializer();
      if (initializer) {
        if (Node.isFunctionExpression(initializer) || Node.isArrowFunction(initializer)) {
          symbolType = 'function';
        }
      }
      
      const typeNode = declaration.getTypeNode();
      if (typeNode) {
        typeAnnotation = typeNode.getText();
      }
    } else if (Node.isModuleDeclaration(declaration)) {
      symbolType = 'namespace';
    }

    return {
      name,
      type: symbolType,
      line: declaration.getStartLineNumber(),
      typeAnnotation,
    };
  }

  dispose(): void {
    // Clean up project resources
  }
}
