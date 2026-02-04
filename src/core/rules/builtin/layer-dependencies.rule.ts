/**
 * Layer Dependencies Rule
 * 
 * Validates architectural layer dependencies (e.g., presentation -> business -> data).
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';

interface LayerConfig {
  name: string;
  patterns: string[];
  allowedDependencies: string[];
}

interface LayerDependenciesConfig extends RuleConfig {
  layers?: LayerConfig[];
  strictMode?: boolean;
}

export class LayerDependenciesRule implements IRule {
  readonly id = 'layer-dependencies';
  readonly name = 'Layer Dependencies';
  readonly description = 'Validates architectural layer dependencies';
  readonly severity = 'error' as const;
  readonly tags = ['architecture', 'layers', 'dependencies'];

  private config: LayerDependenciesConfig = {
    enabled: true,
    severity: 'error',
    strictMode: true,
    layers: [
      {
        name: 'presentation',
        patterns: ['controller', 'handler', 'view', 'component', 'page'],
        allowedDependencies: ['application', 'domain'],
      },
      {
        name: 'application',
        patterns: ['service', 'usecase', 'application'],
        allowedDependencies: ['domain', 'infrastructure'],
      },
      {
        name: 'domain',
        patterns: ['entity', 'domain', 'model', 'aggregate', 'value-object'],
        allowedDependencies: [],
      },
      {
        name: 'infrastructure',
        patterns: ['repository', 'adapter', 'infrastructure', 'persistence'],
        allowedDependencies: ['domain'],
      },
    ],
  };

  configure(options: Partial<LayerDependenciesConfig>): void {
    this.config = { ...this.config, ...options };
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];

    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      const sourceLayer = this.detectLayer(filePath);
      if (!sourceLayer) continue;

      const successors = context.graph.successors(nodeId);
      if (!successors) continue;

      for (const successor of successors) {
        const targetNode = context.getNodeData(successor);
        if (!targetNode) continue;

        const targetPath = targetNode.data.relativePath;
        const targetLayer = this.detectLayer(targetPath);
        if (!targetLayer) continue;

        if (sourceLayer.name === targetLayer.name) continue;

        if (!this.isDependencyAllowed(sourceLayer, targetLayer.name)) {
          violations.push(this.createViolation(
            filePath,
            `Invalid layer dependency: ${sourceLayer.name} -> ${targetLayer.name}`,
            1,
            `${sourceLayer.name} layer can only depend on: ${sourceLayer.allowedDependencies.join(', ') || 'none'}`
          ));
        }
      }
    }

    return { violations };
  }

  private detectLayer(filePath: string): LayerConfig | null {
    const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');

    for (const layer of this.config.layers || []) {
      for (const pattern of layer.patterns) {
        if (normalizedPath.includes(pattern)) {
          return layer;
        }
      }
    }

    return null;
  }

  private isDependencyAllowed(sourceLayer: LayerConfig, targetLayerName: string): boolean {
    if (!this.config.strictMode) {
      return true;
    }
    return sourceLayer.allowedDependencies.includes(targetLayerName);
  }

  private createViolation(file: string, message: string, line: number, suggestion?: string): Violation {
    return {
      id: `${this.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId: this.id,
      ruleName: this.name,
      severity: 'error',
      message,
      file,
      line,
      suggestion,
    };
  }
}
