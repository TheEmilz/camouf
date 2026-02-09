/**
 * Validate Command
 * 
 * Performs a one-time validation of the project architecture.
 * Returns exit code based on violations found.
 */

import { Command } from 'commander';
import { ConfigurationManager } from '../../core/config/configuration-manager.js';
import { ProjectScanner } from '../../core/scanner/project-scanner.js';
import { RuleEngine } from '../../core/rules/rule-engine.js';
import { ViolationReporter } from '../../core/reporter/violation-reporter.js';
import { Logger } from '../../core/logger.js';
import ora from 'ora';

export const validateCommand = new Command('validate')
  .description('Validate project architecture')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('--rules <rules>', 'Comma-separated list of rules to run')
  .option('--fix', 'Attempt to auto-fix violations where possible')
  .option('--format <format>', 'Output format (text, json, jsond, sarif, vscode)', 'text')
  .option('--output <path>', 'Write report to file')
  .option('--fail-on <severity>', 'Fail on severity level (error, warning, info)', 'error')
  .option('--ci', 'CI/agent mode: no spinners, no colors, machine-parseable output')
  .action(async (options) => {
    const isCIMode = options.ci || options.format === 'json' || options.format === 'jsond' || options.format === 'sarif' || options.format === 'vscode' || !!process.env.CI || !!process.env.CAMOUF_CI;
    const spinner = isCIMode ? null : ora('Loading configuration...').start();

    try {
      // Load configuration
      const configManager = new ConfigurationManager();
      const config = await configManager.loadConfig(options.config);
      
      if (!config) {
        if (spinner) spinner.fail('No configuration found. Run "camouf init" first.');
        else console.error('ERROR: No configuration found. Run "camouf init" first.');
        process.exit(1);
      }

      // Initialize components
      if (spinner) spinner.text = 'Scanning project...';
      const scanner = new ProjectScanner(config);
      const ruleEngine = new RuleEngine(config);
      const reporter = new ViolationReporter(config);

      // Filter rules if specified
      if (options.rules) {
        const enabledRules = options.rules.split(',');
        ruleEngine.filterRules(enabledRules);
      }

      // Set up scan progress reporting
      scanner.onProgress(({ current, total, file, phase }) => {
        if (phase === 'discovering') {
          if (spinner) spinner.text = 'Discovering files...';
          else if (isCIMode) Logger.debug('Discovering files...');
        } else if (phase === 'parsing') {
          const pct = Math.round((current / total) * 100);
          const shortFile = file.length > 50 ? '...' + file.slice(-47) : file;
          if (spinner) spinner.text = `Scanning [${current}/${total}] (${pct}%) ${shortFile}`;
          else if (isCIMode) Logger.debug(`Scanning [${current}/${total}] ${file}`);
        } else if (phase === 'building-graph') {
          if (spinner) spinner.text = 'Building dependency graph...';
          else if (isCIMode) Logger.debug('Building dependency graph...');
        }
      });

      // Scan project
      const graph = await scanner.scan();
      if (spinner) spinner.succeed(`Scanned ${graph.nodeCount()} files`);

      // Validate
      if (spinner) spinner.start('Running validation...');
      const fileContents = scanner.getFileContents();
      const violations = await ruleEngine.validate(graph, fileContents);
      
      // Auto-fix if requested
      if (options.fix) {
        if (spinner) spinner.text = 'Applying auto-fixes...';
        const fixed = await ruleEngine.autoFix(violations);
        if (spinner) spinner.succeed(`Applied ${fixed} auto-fixes`);
      }

      if (spinner) spinner.stop();

      // Report results
      const report = reporter.generateReport(violations, {
        format: options.format,
        outputPath: options.output,
      });

      // Output report
      if (options.output) {
        Logger.success(`Report written to ${options.output}`);
      } else {
        console.log(report);
      }

      // Determine exit code
      const summary = reporter.getSummary();
      const failLevel = options.failOn;
      
      let shouldFail = false;
      if (failLevel === 'error' && summary.errors > 0) shouldFail = true;
      if (failLevel === 'warning' && (summary.errors > 0 || summary.warnings > 0)) shouldFail = true;
      if (failLevel === 'info' && summary.total > 0) shouldFail = true;

      if (shouldFail) {
        process.exit(1);
      }

      if (!isCIMode) {
        Logger.success('\n✅ Validation passed!\n');
      }

    } catch (error) {
      if (spinner) {
        spinner.fail(`Validation failed: ${(error as Error).message}`);
      } else {
        console.error(`ERROR: Validation failed: ${(error as Error).message}`);
      }
      process.exit(1);
    }
  });
