/**
 * Architecture Visualizer
 * 
 * Generates visual representations of the architecture.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { CamoufConfig } from '../../types/config.types.js';
import { AnalysisResult } from '../../types/core.types.js';
import { Logger } from '../logger.js';

interface VisualizerOptions {
  format: 'html' | 'json' | 'dot';
  outputPath: string;
}

export class ArchitectureVisualizer {
  private config: CamoufConfig;

  constructor(config: CamoufConfig) {
    this.config = config;
  }

  async generate(analysis: AnalysisResult, options: VisualizerOptions): Promise<void> {
    await fs.mkdir(options.outputPath, { recursive: true });

    switch (options.format) {
      case 'html':
        await this.generateHtmlVisualization(analysis, options.outputPath);
        break;
      case 'dot':
        await this.generateDotVisualization(analysis, options.outputPath);
        break;
      case 'json':
        await this.generateJsonVisualization(analysis, options.outputPath);
        break;
    }
  }

  private async generateHtmlVisualization(analysis: AnalysisResult, outputPath: string): Promise<void> {
    // Generate interactive HTML visualization using D3.js
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Architecture Visualization - ${this.config.name || 'Project'}</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      overflow: hidden;
    }
    #container {
      display: flex;
      height: 100vh;
    }
    #sidebar {
      width: 300px;
      background: #16213e;
      padding: 1rem;
      overflow-y: auto;
    }
    #graph {
      flex: 1;
      position: relative;
    }
    h1 { font-size: 1.2rem; margin-bottom: 1rem; }
    h2 { font-size: 1rem; margin: 1rem 0 0.5rem; color: #e94560; }
    .stat { margin: 0.5rem 0; }
    .stat-label { color: #aaa; font-size: 0.85rem; }
    .stat-value { font-size: 1.5rem; font-weight: bold; color: #e94560; }
    .list { list-style: none; }
    .list li {
      padding: 0.5rem;
      margin: 0.25rem 0;
      background: #0f3460;
      border-radius: 4px;
      font-size: 0.85rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .node circle {
      stroke: #fff;
      stroke-width: 1.5px;
    }
    .link {
      stroke: #999;
      stroke-opacity: 0.6;
    }
    .link.violation {
      stroke: #e94560;
      stroke-width: 2px;
    }
    .node text {
      font-size: 10px;
      fill: #eee;
    }
    .tooltip {
      position: absolute;
      background: #16213e;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      font-size: 0.85rem;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
    }
  </style>
</head>
<body>
  <div id="container">
    <div id="sidebar">
      <h1>🏗️ ${this.config.name || 'Project'}</h1>
      
      <h2>📊 Summary</h2>
      <div class="stat">
        <div class="stat-label">Files</div>
        <div class="stat-value">${analysis.summary.totalFiles}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Dependencies</div>
        <div class="stat-value">${analysis.summary.totalDependencies}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Circular Deps</div>
        <div class="stat-value">${analysis.summary.circularDependencies}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Avg Coupling</div>
        <div class="stat-value">${analysis.summary.averageCoupling.toFixed(1)}</div>
      </div>
      
      <h2>🔥 Hotspots</h2>
      <ul class="list">
        ${analysis.hotspots.slice(0, 10).map(h => 
          `<li title="${h.file}">${this.getFileName(h.file)} (${h.dependents})</li>`
        ).join('')}
      </ul>
      
      <h2>💡 Suggestions</h2>
      <ul class="list">
        ${analysis.suggestions.map(s => `<li title="${s}">${s}</li>`).join('')}
      </ul>
    </div>
    
    <div id="graph">
      <div class="tooltip" id="tooltip"></div>
    </div>
  </div>
  
  <script>
    const data = ${JSON.stringify(this.prepareGraphData(analysis))};
    
    const container = document.getElementById('graph');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const svg = d3.select('#graph')
      .append('svg')
      .attr('width', width)
      .attr('height', height);
    
    const g = svg.append('g');
    
    // Zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => g.attr('transform', event.transform));
    
    svg.call(zoom);
    
    // Force simulation
    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));
    
    // Links
    const link = g.append('g')
      .selectAll('line')
      .data(data.links)
      .join('line')
      .attr('class', d => d.violation ? 'link violation' : 'link');
    
    // Nodes
    const node = g.append('g')
      .selectAll('.node')
      .data(data.nodes)
      .join('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));
    
    node.append('circle')
      .attr('r', d => Math.min(5 + d.size * 2, 20))
      .attr('fill', d => d.color);
    
    node.append('text')
      .attr('dx', 12)
      .attr('dy', 4)
      .text(d => d.label);
    
    // Tooltip
    const tooltip = d3.select('#tooltip');
    
    node.on('mouseover', (event, d) => {
      tooltip
        .style('opacity', 1)
        .html(\`<strong>\${d.label}</strong><br/>Deps: \${d.deps}<br/>Dependents: \${d.dependents}\`)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px');
    })
    .on('mouseout', () => {
      tooltip.style('opacity', 0);
    });
    
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      
      node.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
    });
    
    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    
    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    
    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
  </script>
</body>
</html>
    `.trim();

    await fs.writeFile(path.join(outputPath, 'visualization.html'), html);
  }

  private async generateDotVisualization(analysis: AnalysisResult, outputPath: string): Promise<void> {
    // Generate GraphViz DOT format
    let dot = `digraph Architecture {\n`;
    dot += `  rankdir=LR;\n`;
    dot += `  node [shape=box, style=filled, fillcolor=lightblue];\n`;
    dot += `  edge [color=gray];\n\n`;

    // Add layer subgraphs
    const layerFiles = new Map<string, string[]>();
    
    for (const hotspot of analysis.hotspots) {
      const layer = this.getLayerForFile(hotspot.file);
      if (layer) {
        const files = layerFiles.get(layer) || [];
        files.push(hotspot.file);
        layerFiles.set(layer, files);
      }
    }

    for (const [layer, files] of layerFiles) {
      dot += `  subgraph cluster_${layer} {\n`;
      dot += `    label="${layer}";\n`;
      dot += `    style=filled;\n`;
      dot += `    color=lightgrey;\n`;
      
      for (const file of files) {
        const safeName = this.sanitizeNodeName(file);
        dot += `    "${safeName}" [label="${this.getFileName(file)}"];\n`;
      }
      
      dot += `  }\n\n`;
    }

    // Add edges for circular dependencies
    for (const cycle of analysis.circularDependencies) {
      for (let i = 0; i < cycle.cycle.length; i++) {
        const from = this.sanitizeNodeName(cycle.cycle[i]);
        const to = this.sanitizeNodeName(cycle.cycle[(i + 1) % cycle.cycle.length]);
        dot += `  "${from}" -> "${to}" [color=red, style=bold];\n`;
      }
    }

    dot += `}\n`;

    await fs.writeFile(path.join(outputPath, 'architecture.dot'), dot);
  }

  private async generateJsonVisualization(analysis: AnalysisResult, outputPath: string): Promise<void> {
    const graphData = this.prepareGraphData(analysis);
    await fs.writeFile(
      path.join(outputPath, 'graph-data.json'),
      JSON.stringify(graphData, null, 2)
    );
  }

  private prepareGraphData(analysis: AnalysisResult): {
    nodes: Array<{ id: string; label: string; color: string; size: number; deps: number; dependents: number }>;
    links: Array<{ source: string; target: string; violation: boolean }>;
  } {
    const layerColors: Record<string, string> = {
      presentation: '#4ecca3',
      application: '#45aaf2',
      domain: '#f7b731',
      infrastructure: '#fc5c65',
      shared: '#a55eea',
    };

    const nodes = analysis.hotspots.map(h => ({
      id: h.file,
      label: this.getFileName(h.file),
      color: layerColors[this.getLayerForFile(h.file) || 'shared'] || '#999',
      size: h.dependents,
      deps: h.dependencies,
      dependents: h.dependents,
    }));

    const links: Array<{ source: string; target: string; violation: boolean }> = [];

    // Add circular dependency links
    for (const cycle of analysis.circularDependencies) {
      for (let i = 0; i < cycle.cycle.length; i++) {
        links.push({
          source: cycle.cycle[i],
          target: cycle.cycle[(i + 1) % cycle.cycle.length],
          violation: true,
        });
      }
    }

    return { nodes, links };
  }

  private getFileName(filePath: string): string {
    return path.basename(filePath);
  }

  private getLayerForFile(filePath: string): string | undefined {
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
    
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

  private sanitizeNodeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '_');
  }
}
