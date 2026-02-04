/**
 * Dependency Analyzer
 * 
 * Analyzes the dependency graph for insights and metrics.
 */

import { CamoufConfig } from '../../types/config.types.js';
import { AnalysisResult, AnalysisSummary, Hotspot, CircularDependency, LayerViolation, FileMetrics } from '../../types/core.types.js';
import { DependencyGraph } from '../scanner/project-scanner.js';
import { Logger } from '../logger.js';

interface AnalyzeOptions {
  maxDepth?: number;
  focus?: string;
  includeMetrics?: boolean;
  analyzeCoupling?: boolean;
}

export class DependencyAnalyzer {
  private config: CamoufConfig;

  constructor(config: CamoufConfig) {
    this.config = config;
  }

  async analyze(graph: DependencyGraph, options: AnalyzeOptions = {}): Promise<AnalysisResult> {
    Logger.debug('Starting dependency analysis...');

    const nodes = graph.nodes();
    const edges = graph.edges();

    // Calculate basic metrics
    const totalFiles = nodes.length;
    const totalDependencies = edges.length;

    // Find circular dependencies
    const circularDependencies = this.findCircularDependencies(graph);

    // Find layer violations
    const layerViolations = this.findLayerViolations(graph);

    // Calculate coupling metrics
    const couplingMetrics = this.calculateCouplingMetrics(graph);

    // Find hotspots (files with most dependencies/dependents)
    const hotspots = this.findHotspots(graph);

    // Generate file metrics if requested
    const fileMetrics = options.includeMetrics 
      ? await this.calculateFileMetrics(graph)
      : undefined;

    // Generate suggestions
    const suggestions = this.generateSuggestions({
      totalFiles,
      circularDependencies,
      layerViolations,
      hotspots,
      couplingMetrics,
    });

    const summary: AnalysisSummary = {
      totalFiles,
      totalDependencies,
      circularDependencies: circularDependencies.length,
      averageCoupling: couplingMetrics.average,
      maxCoupling: couplingMetrics.max,
      layerViolations: layerViolations.length,
    };

    return {
      summary,
      hotspots,
      circularDependencies,
      layerViolations,
      suggestions,
      fileMetrics,
    };
  }

  /**
   * Find all circular dependencies using DFS
   */
  private findCircularDependencies(graph: DependencyGraph): CircularDependency[] {
    const cycles: CircularDependency[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const outEdges = graph.outEdges(node) || [];
      
      for (const edge of outEdges) {
        const neighbor = edge.w;
        
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart !== -1) {
            const cycle = path.slice(cycleStart);
            
            // Only add if not a duplicate
            const cycleKey = [...cycle].sort().join(',');
            const exists = cycles.some(c => 
              [...c.cycle].sort().join(',') === cycleKey
            );
            
            if (!exists && cycle.length > 1) {
              cycles.push({
                cycle,
                files: cycle,
              });
            }
          }
        }
      }

      path.pop();
      recursionStack.delete(node);
    };

    for (const node of graph.nodes()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  /**
   * Find layer violations
   */
  private findLayerViolations(graph: DependencyGraph): LayerViolation[] {
    const violations: LayerViolation[] = [];
    
    // Build layer map
    const layerMap = new Map<string, string>();
    const allowedDeps = new Map<string, Set<string>>();

    for (const layer of this.config.layers) {
      for (const dir of layer.directories) {
        const normalizedDir = dir.replace(/\\/g, '/').toLowerCase();
        layerMap.set(normalizedDir, layer.name);
      }
      allowedDeps.set(layer.name, new Set(layer.allowedDependencies));
    }

    // Check each edge
    for (const edge of graph.edges()) {
      const sourceNode = graph.node(edge.v);
      const targetNode = graph.node(edge.w);
      
      if (!sourceNode || !targetNode) continue;

      const sourceLayer = this.getLayerForFile(sourceNode.data.relativePath, layerMap);
      const targetLayer = this.getLayerForFile(targetNode.data.relativePath, layerMap);

      if (!sourceLayer || !targetLayer || sourceLayer === targetLayer) continue;

      const allowed = allowedDeps.get(sourceLayer);
      if (!allowed?.has(targetLayer) && !allowed?.has('*')) {
        violations.push({
          sourceLayer,
          targetLayer,
          file: sourceNode.data.relativePath,
          dependency: targetNode.data.relativePath,
        });
      }
    }

    return violations;
  }

  /**
   * Calculate coupling metrics
   */
  private calculateCouplingMetrics(graph: DependencyGraph): { average: number; max: number; min: number } {
    const couplings: number[] = [];

    for (const node of graph.nodes()) {
      const inDegree = (graph.inEdges(node) || []).length;
      const outDegree = (graph.outEdges(node) || []).length;
      const coupling = inDegree + outDegree;
      couplings.push(coupling);
    }

    if (couplings.length === 0) {
      return { average: 0, max: 0, min: 0 };
    }

    const sum = couplings.reduce((a, b) => a + b, 0);
    const average = sum / couplings.length;
    const max = Math.max(...couplings);
    const min = Math.min(...couplings);

    return { average, max, min };
  }

  /**
   * Find hotspot files (high coupling)
   */
  private findHotspots(graph: DependencyGraph): Hotspot[] {
    const hotspots: Hotspot[] = [];

    for (const node of graph.nodes()) {
      const inEdges = graph.inEdges(node) || [];
      const outEdges = graph.outEdges(node) || [];
      
      const dependents = inEdges.length;
      const dependencies = outEdges.length;
      const coupling = dependents + dependencies;

      hotspots.push({
        file: node,
        dependents,
        dependencies,
        coupling,
      });
    }

    // Sort by number of dependents (most depended upon)
    hotspots.sort((a, b) => b.dependents - a.dependents);

    return hotspots.slice(0, 20);
  }

  /**
   * Calculate detailed file metrics
   */
  private async calculateFileMetrics(graph: DependencyGraph): Promise<FileMetrics[]> {
    const metrics: FileMetrics[] = [];

    for (const node of graph.nodes()) {
      const nodeData = graph.node(node);
      const inEdges = graph.inEdges(node) || [];
      const outEdges = graph.outEdges(node) || [];

      metrics.push({
        file: node,
        linesOfCode: 0, // Would need to read file to calculate
        dependencies: outEdges.length,
        dependents: inEdges.length,
      });
    }

    return metrics;
  }

  /**
   * Generate improvement suggestions
   */
  private generateSuggestions(data: {
    totalFiles: number;
    circularDependencies: CircularDependency[];
    layerViolations: LayerViolation[];
    hotspots: Hotspot[];
    couplingMetrics: { average: number; max: number };
  }): string[] {
    const suggestions: string[] = [];

    // Circular dependencies suggestions
    if (data.circularDependencies.length > 0) {
      suggestions.push(
        `Found ${data.circularDependencies.length} circular dependency chains. Consider:`,
        `  - Extracting shared code to a common module`,
        `  - Using dependency injection`,
        `  - Applying the mediator pattern for complex interactions`
      );
    }

    // Layer violation suggestions
    if (data.layerViolations.length > 0) {
      suggestions.push(
        `Found ${data.layerViolations.length} layer violations. Consider:`,
        `  - Moving shared code to the 'shared' layer`,
        `  - Using interfaces for cross-layer communication`,
        `  - Restructuring to follow the defined architecture`
      );
    }

    // High coupling suggestions
    if (data.couplingMetrics.max > 20) {
      const highCouplingFiles = data.hotspots.filter(h => h.coupling > 15);
      if (highCouplingFiles.length > 0) {
        suggestions.push(
          `${highCouplingFiles.length} files have high coupling (>15 connections). Consider:`,
          `  - Breaking large files into smaller, focused modules`,
          `  - Applying the single responsibility principle`,
          `  - Creating facade modules to reduce direct dependencies`
        );
      }
    }

    // Hotspot suggestions
    const superHotspots = data.hotspots.filter(h => h.dependents > 10);
    if (superHotspots.length > 0) {
      suggestions.push(
        `${superHotspots.length} files are depended upon by >10 other files:`,
        ...superHotspots.slice(0, 3).map(h => `  - ${h.file} (${h.dependents} dependents)`),
        `  These might be good candidates for optimization or splitting.`
      );
    }

    // General suggestions if no issues
    if (suggestions.length === 0) {
      suggestions.push(
        `✨ Great job! No major architectural issues detected.`,
        `Continue monitoring as your codebase grows.`
      );
    }

    return suggestions;
  }

  /**
   * Get layer for a file path
   */
  private getLayerForFile(filePath: string, layerMap: Map<string, string>): string | undefined {
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
    
    for (const [dir, layer] of layerMap) {
      if (normalizedPath.startsWith(dir + '/') || normalizedPath === dir) {
        return layer;
      }
    }
    
    return undefined;
  }
}
