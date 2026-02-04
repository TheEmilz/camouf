/**
 * Project Scanner
 * 
 * Scans the project and builds a dependency graph.
 */

import * as path from 'path';
import fg from 'fast-glob';
import { Graph } from 'graphlib';
import { CamoufConfig, SupportedLanguage } from '../../types/config.types.js';
import { ProjectFile, ParsedFile, Dependency, GraphNode, GraphEdge } from '../../types/core.types.js';
import { ParserRegistry } from '../parsers/parser-registry.js';
import { Logger } from '../logger.js';
import * as fs from 'fs/promises';

export interface DependencyGraph {
  nodeCount(): number;
  edgeCount(): number;
  nodes(): string[];
  edges(): Array<{ v: string; w: string }>;
  node(id: string): GraphNode | undefined;
  edge(v: string, w: string): GraphEdge | undefined;
  setNode(id: string, data: GraphNode): void;
  setEdge(v: string, w: string, data: GraphEdge): void;
  removeNode(id: string): void;
  removeEdge(v: string, w: string): void;
  inEdges(id: string): Array<{ v: string; w: string }> | undefined;
  outEdges(id: string): Array<{ v: string; w: string }> | undefined;
  hasNode(id: string): boolean;
  successors(id: string): string[] | undefined;
  predecessors(id: string): string[] | undefined;
}

export class ProjectScanner {
  private config: CamoufConfig;
  private parserRegistry: ParserRegistry;
  private graph: DependencyGraph;
  private fileCache: Map<string, ParsedFile> = new Map();
  private fileContents: Map<string, string> = new Map();  // Store file contents for rules

  constructor(config: CamoufConfig) {
    this.config = config;
    this.parserRegistry = new ParserRegistry(config);
    this.graph = new Graph({ directed: true, compound: false, multigraph: false }) as DependencyGraph;
  }

  /**
   * Perform a full project scan
   */
  async scan(): Promise<DependencyGraph> {
    Logger.debug('Starting project scan...');

    // Find all files matching the patterns
    const files = await this.findFiles();
    Logger.debug(`Found ${files.length} files to analyze`);

    // Parse each file and build the graph
    const parsedFiles = await this.parseFiles(files);

    // Build dependency graph
    this.buildGraph(parsedFiles);

    Logger.debug(`Graph built with ${this.graph.nodeCount()} nodes and ${this.graph.edgeCount()} edges`);

    return this.graph;
  }

  /**
   * Update graph for a single file change
   */
  async updateFile(filePath: string, changeType: 'add' | 'change' | 'unlink'): Promise<DependencyGraph> {
    const relativePath = path.relative(this.config.root, filePath);

    if (changeType === 'unlink') {
      // Remove node and all edges
      this.graph.removeNode(relativePath);
      this.fileCache.delete(filePath);
      this.fileContents.delete(relativePath);
      Logger.debug(`Removed ${relativePath} from graph`);
    } else {
      // Parse the file
      const projectFile = await this.createProjectFile(filePath);
      if (!projectFile) {
        return this.graph;
      }

      const parser = this.parserRegistry.getParser(projectFile.language);
      if (!parser) {
        Logger.debug(`No parser available for ${projectFile.language}`);
        return this.graph;
      }

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const parsedFile = await parser.parse(projectFile, content);
        
        // Update cache and content
        this.fileCache.set(filePath, parsedFile);
        this.fileContents.set(relativePath, content);

        // Remove old edges from this file
        const oldEdges = this.graph.outEdges(relativePath);
        if (oldEdges) {
          for (const edge of oldEdges) {
            this.graph.removeEdge(edge.v, edge.w);
          }
        }

        // Add/update node
        this.addNodeToGraph(parsedFile);

        // Add new edges
        this.addEdgesToGraph(parsedFile);

        Logger.debug(`Updated ${relativePath} in graph`);
      } catch (error) {
        Logger.error(`Failed to parse ${filePath}: ${(error as Error).message}`);
      }
    }

    return this.graph;
  }

  /**
   * Get the current dependency graph
   */
  getGraph(): DependencyGraph {
    return this.graph;
  }

  /**
   * Get parsed file from cache
   */
  getParsedFile(filePath: string): ParsedFile | undefined {
    return this.fileCache.get(filePath);
  }

  /**
   * Get all file contents (for rules that need source code)
   */
  getFileContents(): Map<string, string> {
    return this.fileContents;
  }

  /**
   * Find all files matching configuration patterns
   */
  private async findFiles(): Promise<string[]> {
    const files = await fg(this.config.patterns.include, {
      cwd: this.config.root,
      ignore: this.config.patterns.exclude,
      absolute: true,
      onlyFiles: true,
      suppressErrors: true,
    });

    return files;
  }

  /**
   * Parse all files
   */
  private async parseFiles(filePaths: string[]): Promise<ParsedFile[]> {
    const parsedFiles: ParsedFile[] = [];

    // Process files in batches for performance
    const batchSize = this.config.advanced?.maxWorkers || 4;
    
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (filePath) => {
          try {
            const projectFile = await this.createProjectFile(filePath);
            if (!projectFile) {
              return null;
            }

            const parser = this.parserRegistry.getParser(projectFile.language);
            if (!parser) {
              Logger.debug(`No parser for language: ${projectFile.language}`);
              return null;
            }

            const content = await fs.readFile(filePath, 'utf-8');
            const parsedFile = await parser.parse(projectFile, content);
            
            // Cache the parsed file and content
            this.fileCache.set(filePath, parsedFile);
            
            // Store content with relative path for rules
            const relativePath = path.relative(this.config.root, filePath);
            this.fileContents.set(relativePath, content);
            
            return parsedFile;
          } catch (error) {
            Logger.debug(`Failed to parse ${filePath}: ${(error as Error).message}`);
            return null;
          }
        })
      );

      parsedFiles.push(...batchResults.filter((f): f is ParsedFile => f !== null));
    }

    return parsedFiles;
  }

  /**
   * Create a ProjectFile object from a file path
   */
  private async createProjectFile(filePath: string): Promise<ProjectFile | null> {
    try {
      const stats = await fs.stat(filePath);
      const extension = path.extname(filePath).toLowerCase();
      const language = this.detectLanguage(extension);

      if (!language) {
        return null;
      }

      const relativePath = path.relative(this.config.root, filePath);
      const layer = this.detectLayer(relativePath);

      return {
        path: filePath,
        relativePath,
        language,
        extension,
        layer,
        lastModified: stats.mtimeMs,
        size: stats.size,
      };
    } catch (error) {
      Logger.debug(`Failed to create ProjectFile for ${filePath}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(extension: string): SupportedLanguage | null {
    const extensionMap: Record<string, SupportedLanguage> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.mts': 'typescript',
      '.cts': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cs': 'csharp',
      '.kt': 'kotlin',
      '.kts': 'kotlin',
    };

    const language = extensionMap[extension];
    
    // Only return if the language is configured
    if (language && this.config.languages.includes(language)) {
      return language;
    }

    return null;
  }

  /**
   * Detect which layer a file belongs to
   */
  private detectLayer(relativePath: string): string | undefined {
    const normalizedPath = relativePath.replace(/\\/g, '/').toLowerCase();

    for (const layer of this.config.layers) {
      for (const dir of layer.directories) {
        const normalizedDir = dir.replace(/\\/g, '/').toLowerCase();
        if (normalizedPath.startsWith(normalizedDir + '/') || normalizedPath === normalizedDir) {
          return layer.name;
        }
      }
    }

    return undefined;
  }

  /**
   * Build the dependency graph from parsed files
   */
  private buildGraph(parsedFiles: ParsedFile[]): void {
    // Clear existing graph
    for (const node of this.graph.nodes()) {
      this.graph.removeNode(node);
    }

    // Add all nodes first
    for (const parsedFile of parsedFiles) {
      this.addNodeToGraph(parsedFile);
    }

    // Then add edges
    for (const parsedFile of parsedFiles) {
      this.addEdgesToGraph(parsedFile);
    }
  }

  /**
   * Add a node to the graph
   */
  private addNodeToGraph(parsedFile: ParsedFile): void {
    const nodeData: GraphNode = {
      id: parsedFile.file.relativePath,
      data: parsedFile.file,
    };

    this.graph.setNode(parsedFile.file.relativePath, nodeData);
  }

  /**
   * Add edges for a parsed file's dependencies
   */
  private addEdgesToGraph(parsedFile: ParsedFile): void {
    for (const dependency of parsedFile.dependencies) {
      // Resolve the dependency target to a file in the graph
      const targetPath = this.resolveDependency(dependency, parsedFile.file);
      
      if (targetPath && this.graph.hasNode(targetPath)) {
        const edgeData: GraphEdge = {
          source: parsedFile.file.relativePath,
          target: targetPath,
          data: dependency,
        };

        this.graph.setEdge(parsedFile.file.relativePath, targetPath, edgeData);
      }
    }
  }

  /**
   * Resolve a dependency target to a file path
   */
  private resolveDependency(dependency: Dependency, sourceFile: ProjectFile): string | null {
    const target = dependency.target;

    // Skip external dependencies (node_modules, etc.)
    if (this.isExternalDependency(target)) {
      return null;
    }

    // Handle relative imports
    if (target.startsWith('.')) {
      const sourceDir = path.dirname(sourceFile.path);
      const resolved = path.resolve(sourceDir, target);
      const relativePath = path.relative(this.config.root, resolved);
      
      // Try with various extensions
      const extensions = this.getExtensionsForLanguage(sourceFile.language);
      for (const ext of extensions) {
        const withExt = relativePath + ext;
        if (this.graph.hasNode(withExt)) {
          return withExt;
        }
        
        // Try index files
        const indexPath = path.join(relativePath, `index${ext}`);
        if (this.graph.hasNode(indexPath)) {
          return indexPath;
        }
      }
      
      // Return as-is if already has extension
      if (path.extname(relativePath)) {
        return relativePath.replace(/\\/g, '/');
      }
    }

    // Handle absolute/alias imports
    // For now, skip them (would need tsconfig paths resolution)
    return null;
  }

  /**
   * Check if a dependency is external
   */
  private isExternalDependency(target: string): boolean {
    // Node.js built-ins
    if (!target.startsWith('.') && !target.startsWith('/') && !target.startsWith('@/')) {
      return true;
    }

    return false;
  }

  /**
   * Get file extensions for a language
   */
  private getExtensionsForLanguage(language: SupportedLanguage): string[] {
    const extensionMap: Record<SupportedLanguage, string[]> = {
      typescript: ['.ts', '.tsx', '.d.ts', '.mts', '.cts'],
      javascript: ['.js', '.jsx', '.mjs', '.cjs'],
      python: ['.py'],
      java: ['.java'],
      go: ['.go'],
      rust: ['.rs'],
      csharp: ['.cs'],
      kotlin: ['.kt', '.kts'],
    };

    return extensionMap[language] || [];
  }
}
