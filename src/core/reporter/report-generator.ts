/**
 * Report Generator
 * 
 * Generates comprehensive HTML/PDF reports of architecture analysis.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { CamoufConfig } from '../../types/config.types.js';
import { Violation } from '../../types/core.types.js';
import { DependencyGraph } from '../scanner/project-scanner.js';
import { Logger } from '../logger.js';
import { generateSignatureReportHTML } from './signature-report.template.js';

interface ReportOptions {
  graph: DependencyGraph;
  violations: Violation[];
  format: 'html' | 'pdf' | 'json' | 'markdown';
  outputPath: string;
  includeCode?: boolean;
  includeGraphs?: boolean;
  template?: string;
}

export class ReportGenerator {
  private config: CamoufConfig;

  constructor(config: CamoufConfig) {
    this.config = config;
  }

  async generate(options: ReportOptions): Promise<void> {
    // Ensure output directory exists
    await fs.mkdir(options.outputPath, { recursive: true });

    switch (options.format) {
      case 'html':
        await this.generateHtmlReport(options);
        break;
      case 'json':
        await this.generateJsonReport(options);
        break;
      case 'markdown':
        await this.generateMarkdownReport(options);
        break;
      case 'pdf':
        // PDF generation would require additional dependencies
        Logger.warn('PDF generation is not yet implemented. Generating HTML instead.');
        await this.generateHtmlReport(options);
        break;
    }
  }

  private async generateHtmlReport(options: ReportOptions): Promise<void> {
    const { graph, violations } = options;
    
    const summary = this.calculateSummary(graph, violations);
    const violationsByRule = this.groupViolationsByRule(violations);
    const violationsByFile = this.groupViolationsByFile(violations);

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Camouf Architecture Report - ${this.config.name || 'Project'}</title>
  <style>
    :root {
      --color-bg: #1a1a2e;
      --color-surface: #16213e;
      --color-primary: #0f3460;
      --color-accent: #e94560;
      --color-text: #eee;
      --color-text-secondary: #aaa;
      --color-success: #4ecca3;
      --color-warning: #ffc107;
      --color-error: #e94560;
      --color-info: #17a2b8;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.6;
    }
    
    .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }
    
    header {
      background: var(--color-surface);
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
    }
    
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.5rem; margin-bottom: 1rem; color: var(--color-accent); }
    h3 { font-size: 1.2rem; margin-bottom: 0.75rem; }
    
    .subtitle { color: var(--color-text-secondary); }
    
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin: 2rem 0;
    }
    
    .stat-card {
      background: var(--color-primary);
      padding: 1.5rem;
      border-radius: 8px;
      text-align: center;
    }
    
    .stat-value {
      font-size: 2.5rem;
      font-weight: bold;
      color: var(--color-accent);
    }
    
    .stat-label {
      color: var(--color-text-secondary);
      font-size: 0.9rem;
    }
    
    .card {
      background: var(--color-surface);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    
    .violation-list {
      list-style: none;
    }
    
    .violation-item {
      background: var(--color-primary);
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 0.75rem;
      border-left: 4px solid;
    }
    
    .violation-item.error { border-color: var(--color-error); }
    .violation-item.warning { border-color: var(--color-warning); }
    .violation-item.info { border-color: var(--color-info); }
    
    .violation-message { font-weight: 500; margin-bottom: 0.5rem; }
    
    .violation-meta {
      font-size: 0.85rem;
      color: var(--color-text-secondary);
    }
    
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .badge-error { background: var(--color-error); }
    .badge-warning { background: var(--color-warning); color: #000; }
    .badge-info { background: var(--color-info); }
    .badge-success { background: var(--color-success); color: #000; }
    
    .file-path {
      font-family: 'Fira Code', monospace;
      font-size: 0.85rem;
      color: var(--color-text-secondary);
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--color-primary);
    }
    
    th {
      background: var(--color-primary);
      font-weight: 600;
    }
    
    .progress-bar {
      background: var(--color-primary);
      border-radius: 4px;
      height: 8px;
      overflow: hidden;
    }
    
    .progress-fill {
      height: 100%;
      background: var(--color-success);
      transition: width 0.3s ease;
    }
    
    footer {
      text-align: center;
      padding: 2rem;
      color: var(--color-text-secondary);
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🏗️ Architecture Report</h1>
      <p class="subtitle">${this.config.name || 'Project'} • Generated on ${new Date().toLocaleString()}</p>
    </header>
    
    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">${summary.totalFiles}</div>
        <div class="stat-label">Files Analyzed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${summary.totalDependencies}</div>
        <div class="stat-label">Dependencies</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${violations.length}</div>
        <div class="stat-label">Violations</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${summary.healthScore}%</div>
        <div class="stat-label">Health Score</div>
      </div>
    </div>
    
    <div class="card">
      <h2>📊 Violations by Severity</h2>
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Count</th>
            <th>Percentage</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="badge badge-error">Error</span></td>
            <td>${summary.errors}</td>
            <td>${violations.length ? ((summary.errors / violations.length) * 100).toFixed(1) : 0}%</td>
          </tr>
          <tr>
            <td><span class="badge badge-warning">Warning</span></td>
            <td>${summary.warnings}</td>
            <td>${violations.length ? ((summary.warnings / violations.length) * 100).toFixed(1) : 0}%</td>
          </tr>
          <tr>
            <td><span class="badge badge-info">Info</span></td>
            <td>${summary.info}</td>
            <td>${violations.length ? ((summary.info / violations.length) * 100).toFixed(1) : 0}%</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <div class="card">
      <h2>📁 Violations by Rule</h2>
      ${Array.from(violationsByRule.entries()).map(([rule, ruleViolations]) => `
        <h3>${rule} (${ruleViolations.length})</h3>
        <ul class="violation-list">
          ${ruleViolations.slice(0, 10).map(v => `
            <li class="violation-item ${v.severity}">
              <div class="violation-message">${this.escapeHtml(v.message)}</div>
              <div class="violation-meta">
                <span class="file-path">${this.escapeHtml(v.file)}${v.line ? `:${v.line}` : ''}</span>
              </div>
            </li>
          `).join('')}
          ${ruleViolations.length > 10 ? `<li class="violation-item info">... and ${ruleViolations.length - 10} more</li>` : ''}
        </ul>
      `).join('')}
    </div>
    
    <div class="card">
      <h2>📂 Most Affected Files</h2>
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Violations</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          ${Array.from(violationsByFile.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 10)
            .map(([file, fileViolations]) => {
              const maxSeverity = fileViolations.some(v => v.severity === 'error') ? 'error' :
                                  fileViolations.some(v => v.severity === 'warning') ? 'warning' : 'info';
              return `
                <tr>
                  <td class="file-path">${this.escapeHtml(file)}</td>
                  <td>${fileViolations.length}</td>
                  <td><span class="badge badge-${maxSeverity}">${maxSeverity}</span></td>
                </tr>
              `;
            }).join('')}
        </tbody>
      </table>
    </div>
    
    <footer>
      <p>Generated by <strong>Camouf</strong> • Architecture Monitoring Tool</p>
    </footer>
  </div>
</body>
</html>
    `.trim();

    await fs.writeFile(path.join(options.outputPath, 'index.html'), html);
    Logger.debug(`HTML report written to ${options.outputPath}/index.html`);

    // Generate signature-specific report if there are signature violations
    const signatureViolations = violations.filter(v => v.ruleId === 'function-signature-matching');
    if (signatureViolations.length > 0) {
      await this.generateSignatureReport(signatureViolations, options.outputPath);
    }
  }

  private async generateSignatureReport(violations: Violation[], outputPath: string): Promise<void> {
    // Convert violations to signature mismatch data
    type MismatchType = 'function-name' | 'parameter-name' | 'parameter-count' | 'type-field' | 'missing-field';
    
    const mismatches = violations.map((v, index) => {
      const meta = v.metadata as {
        mismatchId?: string;
        mismatchType?: MismatchType;
        expected?: string;
        found?: string;
        similarity?: number;
        definedIn?: { file: string; line: number };
      } | undefined;
      
      return {
        id: meta?.mismatchId || `sig-${String(index + 1).padStart(3, '0')}`,
        type: (meta?.mismatchType || 'function-name') as MismatchType,
        expected: meta?.expected || '',
        found: meta?.found || '',
        similarity: meta?.similarity,
        definedIn: meta?.definedIn || { file: 'unknown', line: 0 },
        usedIn: { file: v.file, line: v.line || 0, column: v.column },
        quickFixCommand: `npx camouf fix --id ${meta?.mismatchId || `sig-${String(index + 1).padStart(3, '0')}`}`,
      };
    });

    const summary = {
      total: violations.length,
      functionNames: violations.filter(v => (v.metadata as { mismatchType?: string })?.mismatchType === 'function-name').length,
      parameterNames: violations.filter(v => (v.metadata as { mismatchType?: string })?.mismatchType === 'parameter-name').length,
      parameterCounts: violations.filter(v => (v.metadata as { mismatchType?: string })?.mismatchType === 'parameter-count').length,
      typeFields: violations.filter(v => (v.metadata as { mismatchType?: string })?.mismatchType === 'type-field').length,
    };

    const reportData = {
      projectName: this.config.name || 'Project',
      timestamp: new Date().toISOString(),
      summary,
      mismatches,
    };

    const signatureHtml = generateSignatureReportHTML(reportData);
    await fs.writeFile(path.join(outputPath, 'signature-mismatches.html'), signatureHtml);
    Logger.debug(`Signature mismatch report written to ${outputPath}/signature-mismatches.html`);
  }

  private async generateJsonReport(options: ReportOptions): Promise<void> {
    const { graph, violations } = options;
    
    const report = {
      metadata: {
        projectName: this.config.name,
        generatedAt: new Date().toISOString(),
        camoufVersion: '0.1.0',
      },
      summary: this.calculateSummary(graph, violations),
      violations: violations.map(v => ({
        ruleId: v.ruleId,
        ruleName: v.ruleName,
        severity: v.severity,
        message: v.message,
        file: v.file,
        line: v.line,
        column: v.column,
        suggestion: v.suggestion,
      })),
      files: graph.nodes().map(nodeId => {
        const node = graph.node(nodeId);
        return {
          path: node?.data.relativePath,
          language: node?.data.language,
          layer: node?.data.layer,
          dependencies: (graph.outEdges(nodeId) || []).length,
          dependents: (graph.inEdges(nodeId) || []).length,
        };
      }),
    };

    await fs.writeFile(
      path.join(options.outputPath, 'report.json'),
      JSON.stringify(report, null, 2)
    );
  }

  private async generateMarkdownReport(options: ReportOptions): Promise<void> {
    const { graph, violations } = options;
    const summary = this.calculateSummary(graph, violations);
    const violationsByRule = this.groupViolationsByRule(violations);

    let md = `# 🏗️ Architecture Report\n\n`;
    md += `**Project:** ${this.config.name || 'Project'}  \n`;
    md += `**Generated:** ${new Date().toLocaleString()}  \n\n`;

    md += `## 📊 Summary\n\n`;
    md += `| Metric | Value |\n|--------|-------|\n`;
    md += `| Files Analyzed | ${summary.totalFiles} |\n`;
    md += `| Total Dependencies | ${summary.totalDependencies} |\n`;
    md += `| Violations | ${violations.length} |\n`;
    md += `| Health Score | ${summary.healthScore}% |\n\n`;

    md += `## ⚠️ Violations\n\n`;
    md += `| Severity | Count |\n|----------|-------|\n`;
    md += `| 🔴 Errors | ${summary.errors} |\n`;
    md += `| 🟡 Warnings | ${summary.warnings} |\n`;
    md += `| 🔵 Info | ${summary.info} |\n\n`;

    for (const [rule, ruleViolations] of violationsByRule) {
      md += `### ${rule}\n\n`;
      
      for (const v of ruleViolations.slice(0, 10)) {
        const severity = v.severity === 'error' ? '🔴' : v.severity === 'warning' ? '🟡' : '🔵';
        md += `- ${severity} ${v.message}\n`;
        md += `  - File: \`${v.file}${v.line ? `:${v.line}` : ''}\`\n`;
        if (v.suggestion) {
          md += `  - 💡 ${v.suggestion}\n`;
        }
      }
      
      if (ruleViolations.length > 10) {
        md += `\n*... and ${ruleViolations.length - 10} more*\n`;
      }
      
      md += '\n';
    }

    await fs.writeFile(path.join(options.outputPath, 'report.md'), md);
  }

  private calculateSummary(graph: DependencyGraph, violations: Violation[]): {
    totalFiles: number;
    totalDependencies: number;
    errors: number;
    warnings: number;
    info: number;
    healthScore: number;
  } {
    const totalFiles = graph.nodeCount();
    const totalDependencies = graph.edgeCount();
    const errors = violations.filter(v => v.severity === 'error').length;
    const warnings = violations.filter(v => v.severity === 'warning').length;
    const info = violations.filter(v => v.severity === 'info').length;

    // Calculate health score (simple formula)
    const maxScore = 100;
    const errorPenalty = errors * 10;
    const warningPenalty = warnings * 3;
    const infoPenalty = info * 1;
    
    const healthScore = Math.max(0, maxScore - errorPenalty - warningPenalty - infoPenalty);

    return { totalFiles, totalDependencies, errors, warnings, info, healthScore };
  }

  private groupViolationsByRule(violations: Violation[]): Map<string, Violation[]> {
    const grouped = new Map<string, Violation[]>();
    
    for (const v of violations) {
      const existing = grouped.get(v.ruleName) || [];
      existing.push(v);
      grouped.set(v.ruleName, existing);
    }

    return grouped;
  }

  private groupViolationsByFile(violations: Violation[]): Map<string, Violation[]> {
    const grouped = new Map<string, Violation[]>();
    
    for (const v of violations) {
      const existing = grouped.get(v.file) || [];
      existing.push(v);
      grouped.set(v.file, existing);
    }

    return grouped;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
