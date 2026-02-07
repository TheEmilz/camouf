/**
 * Violation Reporter
 * 
 * Handles reporting of violations to console and other outputs.
 */

import chalk from 'chalk';
import { CamoufConfig } from '../../types/config.types.js';
import { Violation, ViolationSeverity } from '../../types/core.types.js';
import { Logger } from '../logger.js';

interface ReporterOptions {
  format?: 'text' | 'json' | 'jsond' | 'sarif' | 'vscode';
  outputPath?: string;
}

interface ViolationSummary {
  total: number;
  errors: number;
  warnings: number;
  info: number;
}

export class ViolationReporter {
  private config: CamoufConfig;
  private violations: Violation[] = [];
  private summary: ViolationSummary = { total: 0, errors: 0, warnings: 0, info: 0 };

  constructor(config: CamoufConfig) {
    this.config = config;
  }

  /**
   * Report violations from initial scan
   */
  reportInitial(violations: Violation[]): void {
    this.violations = violations;
    this.updateSummary(violations);

    if (violations.length === 0) {
      Logger.success('\n✅ No architecture violations found!\n');
      return;
    }

    Logger.info(`\n📋 Found ${violations.length} architecture violation(s):\n`);

    // Group violations by file
    const byFile = this.groupByFile(violations);

    for (const [file, fileViolations] of byFile) {
      this.printFileHeader(file);
      
      for (const violation of fileViolations) {
        this.printViolation(violation);
      }
      
      console.log();
    }

    this.printSummary();
  }

  /**
   * Report violations from incremental analysis
   */
  reportIncremental(filePath: string, violations: Violation[]): void {
    // Remove old violations for this file
    this.violations = this.violations.filter(v => v.file !== filePath);
    
    // Add new violations
    this.violations.push(...violations);
    this.updateSummary(this.violations);

    if (violations.length === 0) {
      Logger.success(`✓ ${this.getRelativePath(filePath)}: No violations`);
      return;
    }

    Logger.info(`\n📝 ${this.getRelativePath(filePath)}:`);
    
    for (const violation of violations) {
      this.printViolation(violation);
    }
    
    console.log();
  }

  /**
   * Generate a report in the specified format
   */
  generateReport(violations: Violation[], options: ReporterOptions): string {
    // Always update summary when generating a report
    this.violations = violations;
    this.updateSummary(violations);
    
    switch (options.format) {
      case 'json':
        return this.generateJsonReport(violations);
      case 'jsond':
        return this.generateJsonDReport(violations);
      case 'sarif':
        return this.generateSarifReport(violations);
      case 'vscode':
        return this.generateVSCodeReport(violations);
      default:
        return this.generateTextReport(violations);
    }
  }

  /**
   * Get current summary
   */
  getSummary(): ViolationSummary {
    return { ...this.summary };
  }

  /**
   * Get all current violations
   */
  getViolations(): Violation[] {
    return [...this.violations];
  }

  /**
   * Clear all violations
   */
  clear(): void {
    this.violations = [];
    this.summary = { total: 0, errors: 0, warnings: 0, info: 0 };
  }

  private updateSummary(violations: Violation[]): void {
    this.summary = {
      total: violations.length,
      errors: violations.filter(v => v.severity === 'error').length,
      warnings: violations.filter(v => v.severity === 'warning').length,
      info: violations.filter(v => v.severity === 'info').length,
    };
  }

  private groupByFile(violations: Violation[]): Map<string, Violation[]> {
    const grouped = new Map<string, Violation[]>();
    
    for (const violation of violations) {
      const existing = grouped.get(violation.file) || [];
      existing.push(violation);
      grouped.set(violation.file, existing);
    }

    // Sort violations within each file by line number
    for (const [file, fileViolations] of grouped) {
      fileViolations.sort((a, b) => (a.line || 0) - (b.line || 0));
    }

    return grouped;
  }

  private printFileHeader(file: string): void {
    console.log(chalk.underline(this.getRelativePath(file)));
  }

  private printViolation(violation: Violation): void {
    const icon = this.getSeverityIcon(violation.severity);
    const color = this.getSeverityColor(violation.severity);
    const location = violation.line ? `:${violation.line}` : '';
    const column = violation.column ? `:${violation.column}` : '';
    
    console.log(
      `  ${icon} ${color(violation.message)}`,
      chalk.gray(`[${violation.ruleId}]`)
    );
    
    if (violation.line) {
      console.log(chalk.gray(`    at line ${violation.line}${column ? `, column ${violation.column}` : ''}`));
    }

    if (violation.suggestion) {
      console.log(chalk.cyan(`    💡 ${violation.suggestion}`));
    }
  }

  private printSummary(): void {
    const { total, errors, warnings, info } = this.summary;
    
    console.log(chalk.bold('\n─────────────────────────────────────'));
    console.log(chalk.bold('Summary:'));
    
    if (errors > 0) {
      console.log(chalk.red(`  ✖ ${errors} error(s)`));
    }
    if (warnings > 0) {
      console.log(chalk.yellow(`  ⚠ ${warnings} warning(s)`));
    }
    if (info > 0) {
      console.log(chalk.blue(`  ℹ ${info} info`));
    }
    
    console.log(chalk.bold(`\n  Total: ${total} violation(s)\n`));
  }

  private getSeverityIcon(severity: ViolationSeverity): string {
    switch (severity) {
      case 'error':
        return chalk.red('✖');
      case 'warning':
        return chalk.yellow('⚠');
      case 'info':
        return chalk.blue('ℹ');
    }
  }

  private getSeverityColor(severity: ViolationSeverity): (text: string) => string {
    switch (severity) {
      case 'error':
        return chalk.red;
      case 'warning':
        return chalk.yellow;
      case 'info':
        return chalk.blue;
    }
  }

  private getRelativePath(filePath: string): string {
    // Simple relative path calculation
    const root = this.config.root.replace(/\\/g, '/');
    const file = filePath.replace(/\\/g, '/');
    
    if (file.startsWith(root)) {
      return file.substring(root.length + 1);
    }
    
    return filePath;
  }

  private generateTextReport(violations: Violation[]): string {
    if (violations.length === 0) {
      return '✅ No architecture violations found!';
    }

    let report = `📋 Architecture Violations Report\n`;
    report += `${'='.repeat(50)}\n\n`;
    report += `Total violations: ${violations.length}\n\n`;

    const byFile = this.groupByFile(violations);

    for (const [file, fileViolations] of byFile) {
      report += `${file}\n`;
      report += `${'-'.repeat(file.length)}\n`;
      
      for (const violation of fileViolations) {
        const location = violation.line ? `:${violation.line}` : '';
        report += `  [${violation.severity.toUpperCase()}] ${violation.message}\n`;
        report += `    Rule: ${violation.ruleId}${location}\n`;
        
        if (violation.suggestion) {
          report += `    Suggestion: ${violation.suggestion}\n`;
        }
        report += '\n';
      }
    }

    return report;
  }

  private generateJsonReport(violations: Violation[]): string {
    return JSON.stringify({
      summary: this.summary,
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
    }, null, 2);
  }

  /**
   * Generate JSOND (JSON with Descriptions) report optimized for AI agents.
   * This format includes rich context, descriptions, and metadata that
   * AI coding assistants can easily parse and act upon.
   */
  private generateJsonDReport(violations: Violation[]): string {
    const timestamp = new Date().toISOString();
    const groupedByFile = this.groupByFile(violations);
    const groupedByRule = this.groupByRule(violations);
    const groupedBySeverity = this.groupBySeverity(violations);

    const report = {
      "$schema": "https://camouf.dev/schemas/jsond-report.json",
      "$description": "Camouf Architecture Violations Report - JSOND format optimized for AI agents",
      "metadata": {
        "tool": "camouf",
        "version": "0.4.2",
        "timestamp": timestamp,
        "format": "jsond",
        "format_description": "JSON with Descriptions - A structured format designed for AI agent consumption with rich context and actionable information"
      },
      "summary": {
        "total_violations": this.summary.total,
        "by_severity": {
          "errors": {
            "count": this.summary.errors,
            "description": "Critical violations that must be fixed - these indicate architectural problems that could cause runtime failures or security issues"
          },
          "warnings": {
            "count": this.summary.warnings,
            "description": "Important violations that should be addressed - these indicate architectural patterns that deviate from best practices"
          },
          "info": {
            "count": this.summary.info,
            "description": "Informational notices - suggestions for improving architecture that are not critical"
          }
        },
        "files_affected": groupedByFile.size,
        "rules_triggered": groupedByRule.size
      },
      "analysis": {
        "description": "Detailed breakdown of all architecture violations found during analysis",
        "by_file": Array.from(groupedByFile.entries()).map(([file, fileViolations]) => ({
          "file_path": file,
          "relative_path": this.getRelativePath(file),
          "violation_count": fileViolations.length,
          "violations": fileViolations.map(v => this.formatViolationForJsonD(v))
        })),
        "by_rule": Array.from(groupedByRule.entries()).map(([ruleId, ruleViolations]) => ({
          "rule_id": ruleId,
          "rule_name": ruleViolations[0]?.ruleName || ruleId,
          "occurrence_count": ruleViolations.length,
          "affected_files": [...new Set(ruleViolations.map(v => this.getRelativePath(v.file)))]
        })),
        "by_severity": {
          "errors": groupedBySeverity.get('error')?.map(v => this.formatViolationForJsonD(v)) || [],
          "warnings": groupedBySeverity.get('warning')?.map(v => this.formatViolationForJsonD(v)) || [],
          "info": groupedBySeverity.get('info')?.map(v => this.formatViolationForJsonD(v)) || []
        }
      },
      "violations": violations.map(v => this.formatViolationForJsonD(v)),
      "action_items": this.generateActionItems(violations),
      "ai_instructions": {
        "description": "Instructions for AI agents processing this report",
        "recommended_workflow": [
          "1. Review the summary to understand the scope of issues",
          "2. Prioritize errors over warnings over info",
          "3. Address violations file by file for focused fixes",
          "4. Use the 'suggestion' field when available for recommended fixes",
          "5. Re-run validation after fixes to confirm resolution"
        ],
        "fix_commands": {
          "single_fix": "npx camouf fix --id <violation_id>",
          "signature_fixes": "npx camouf fix-signatures --all",
          "dry_run": "npx camouf fix-signatures --all --dry-run"
        }
      }
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * Format a single violation for JSOND output with rich context
   */
  private formatViolationForJsonD(violation: Violation): Record<string, unknown> {
    return {
      "id": violation.id,
      "rule": {
        "id": violation.ruleId,
        "name": violation.ruleName,
        "description": this.getRuleDescription(violation.ruleId)
      },
      "severity": violation.severity,
      "severity_description": this.getSeverityDescription(violation.severity),
      "location": {
        "file": violation.file,
        "relative_path": this.getRelativePath(violation.file),
        "line": violation.line || null,
        "column": violation.column || null,
        "end_line": violation.endLine || null,
        "end_column": violation.endColumn || null
      },
      "message": violation.message,
      "suggestion": violation.suggestion || null,
      "is_fixable": violation.fixable || false,
      "fix_command": violation.fixable && violation.id ? `npx camouf fix --id ${violation.id}` : null
    };
  }

  /**
   * Get description for a severity level
   */
  private getSeverityDescription(severity: ViolationSeverity): string {
    switch (severity) {
      case 'error':
        return 'Critical issue that must be fixed to maintain architectural integrity';
      case 'warning':
        return 'Important issue that should be addressed to follow best practices';
      case 'info':
        return 'Informational suggestion for improving code architecture';
    }
  }

  /**
   * Get description for a rule ID
   */
  private getRuleDescription(ruleId: string): string {
    const descriptions: Record<string, string> = {
      'layer-dependencies': 'Validates that dependencies between architectural layers follow the defined rules',
      'circular-dependencies': 'Detects circular dependency chains that can cause maintenance issues',
      'function-signature-matching': 'Ensures function names and signatures match between definitions and usages',
      'hardcoded-secrets': 'Detects hardcoded API keys, passwords, and other sensitive data',
      'performance-antipatterns': 'Identifies common performance issues like N+1 queries',
      'type-safety': 'Checks for unsafe type usage and type coercion issues',
      'data-flow-integrity': 'Validates data flow patterns and input sanitization',
      'security-context': 'Ensures authentication and authorization patterns are correctly implemented',
      'resilience-patterns': 'Validates circuit breaker, retry, and timeout pattern usage',
      'distributed-transactions': 'Checks for proper handling of distributed transaction boundaries',
      'ddd-boundaries': 'Validates Domain-Driven Design principles and bounded contexts',
      'api-versioning': 'Ensures API versioning follows consistent patterns',
      'contract-mismatch': 'Detects mismatches between API contracts and implementations'
    };
    return descriptions[ruleId] || 'Architecture rule violation';
  }

  /**
   * Generate action items from violations for AI agents
   */
  private generateActionItems(violations: Violation[]): Array<Record<string, unknown>> {
    const actionItems: Array<Record<string, unknown>> = [];
    const errors = violations.filter(v => v.severity === 'error');
    const warnings = violations.filter(v => v.severity === 'warning');

    if (errors.length > 0) {
      actionItems.push({
        "priority": "high",
        "action": "Fix critical errors",
        "description": `There are ${errors.length} error-level violations that need immediate attention`,
        "affected_files": [...new Set(errors.map(v => this.getRelativePath(v.file)))]
      });
    }

    if (warnings.length > 0) {
      actionItems.push({
        "priority": "medium",
        "action": "Address warnings",
        "description": `There are ${warnings.length} warning-level violations that should be reviewed`,
        "affected_files": [...new Set(warnings.map(v => this.getRelativePath(v.file)))]
      });
    }

    // Check for signature mismatches specifically
    const signatureMismatches = violations.filter(v => v.ruleId === 'function-signature-matching');
    if (signatureMismatches.length > 0) {
      actionItems.push({
        "priority": "high",
        "action": "Fix function signature mismatches",
        "description": `${signatureMismatches.length} function signature mismatches detected - these can cause runtime errors`,
        "quick_fix": "npx camouf fix-signatures --all"
      });
    }

    // Check for hardcoded secrets
    const secrets = violations.filter(v => v.ruleId === 'hardcoded-secrets');
    if (secrets.length > 0) {
      actionItems.push({
        "priority": "critical",
        "action": "Remove hardcoded secrets",
        "description": `${secrets.length} hardcoded secret(s) detected - these are security vulnerabilities`,
        "recommendation": "Move secrets to environment variables or a secrets manager"
      });
    }

    return actionItems;
  }

  /**
   * Group violations by rule ID
   */
  private groupByRule(violations: Violation[]): Map<string, Violation[]> {
    const grouped = new Map<string, Violation[]>();
    
    for (const violation of violations) {
      const existing = grouped.get(violation.ruleId) || [];
      existing.push(violation);
      grouped.set(violation.ruleId, existing);
    }

    return grouped;
  }

  /**
   * Group violations by severity
   */
  private groupBySeverity(violations: Violation[]): Map<ViolationSeverity, Violation[]> {
    const grouped = new Map<ViolationSeverity, Violation[]>();
    
    for (const violation of violations) {
      const existing = grouped.get(violation.severity) || [];
      existing.push(violation);
      grouped.set(violation.severity, existing);
    }

    return grouped;
  }

  private generateSarifReport(violations: Violation[]): string {
    // SARIF (Static Analysis Results Interchange Format) report
    const sarif = {
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [{
        tool: {
          driver: {
            name: 'Camouf',
            version: '0.3.0',
            informationUri: 'https://github.com/TheEmilz/camouf',
            rules: this.getUniqueRules(violations),
          },
        },
        results: violations.map(v => ({
          ruleId: v.ruleId,
          level: this.sarifLevel(v.severity),
          message: {
            text: v.message,
          },
          locations: [{
            physicalLocation: {
              artifactLocation: {
                uri: v.file,
              },
              region: {
                startLine: v.line || 1,
                startColumn: v.column || 1,
                endLine: v.endLine || v.line || 1,
                endColumn: v.endColumn || v.column || 1,
              },
            },
          }],
        })),
      }],
    };

    return JSON.stringify(sarif, null, 2);
  }

  private getUniqueRules(violations: Violation[]): Array<{ id: string; name: string }> {
    const rules = new Map<string, string>();
    
    for (const v of violations) {
      if (!rules.has(v.ruleId)) {
        rules.set(v.ruleId, v.ruleName);
      }
    }

    return Array.from(rules.entries()).map(([id, name]) => ({ id, name }));
  }

  private sarifLevel(severity: ViolationSeverity): string {
    switch (severity) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
        return 'note';
    }
  }

  /**
   * Generate VS Code compatible single-line output for problem matcher
   * Format: file(line,column): severity: message [ruleId]
   * This matches the standard GCC/MSBuild pattern that VS Code understands
   */
  private generateVSCodeReport(violations: Violation[]): string {
    const lines: string[] = [];
    
    for (const violation of violations) {
      const file = this.getRelativePath(violation.file);
      const line = violation.line || 1;
      const column = violation.column || 1;
      const severity = violation.severity;
      const message = violation.message.replace(/\n/g, ' ');
      const ruleId = violation.ruleId;
      
      // Format: file(line,column): severity ruleId: message
      lines.push(`${file}(${line},${column}): ${severity} ${ruleId}: ${message}`);
    }

    // Add summary at the end
    const { total, errors, warnings, info } = this.summary;
    lines.push('');
    lines.push(`=== Camouf: ${total} problem(s) found (${errors} errors, ${warnings} warnings, ${info} info) ===`);

    return lines.join('\n');
  }

  /**
   * Report violations in VS Code format to stdout (for watch mode)
   */
  reportVSCode(violations: Violation[]): void {
    this.violations = violations;
    this.updateSummary(violations);
    console.log(this.generateVSCodeReport(violations));
  }

  /**
   * Report incremental violations in VS Code format
   */
  reportIncrementalVSCode(filePath: string, violations: Violation[]): void {
    // Remove old violations for this file
    this.violations = this.violations.filter(v => v.file !== filePath);
    
    // Add new violations
    this.violations.push(...violations);
    this.updateSummary(this.violations);

    // Output only violations for the changed file
    for (const violation of violations) {
      const file = this.getRelativePath(violation.file);
      const line = violation.line || 1;
      const column = violation.column || 1;
      const severity = violation.severity;
      const message = violation.message.replace(/\n/g, ' ');
      const ruleId = violation.ruleId;
      
      console.log(`${file}(${line},${column}): ${severity} ${ruleId}: ${message}`);
    }
    
    if (violations.length === 0) {
      console.log(`${this.getRelativePath(filePath)}: ✓ No violations`);
    }
  }
}
