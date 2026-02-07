/**
 * Report Command
 * 
 * Generates comprehensive architecture reports in various formats.
 */

import { Command } from 'commander';
import { ConfigurationManager } from '../../core/config/configuration-manager.js';
import { ProjectScanner } from '../../core/scanner/project-scanner.js';
import { RuleEngine } from '../../core/rules/rule-engine.js';
import { ReportGenerator } from '../../core/reporter/report-generator.js';
import { Logger } from '../../core/logger.js';
import ora from 'ora';

export const reportCommand = new Command('report')
  .description('Generate architecture reports')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('--format <format>', 'Report format (html, pdf, json, jsond, markdown)', 'html')
  .option('--output <path>', 'Output path for report', './camouf-report')
  .option('--include-code', 'Include code snippets in report')
  .option('--include-graphs', 'Include dependency graphs')
  .option('--template <template>', 'Custom report template')
  .action(async (options) => {
    const spinner = ora('Loading configuration...').start();

    try {
      // Load configuration
      const configManager = new ConfigurationManager();
      const config = await configManager.loadConfig(options.config);
      
      if (!config) {
        spinner.fail('No configuration found. Run "camouf init" first.');
        process.exit(1);
      }

      // Initialize components
      spinner.text = 'Scanning project...';
      const scanner = new ProjectScanner(config);
      const ruleEngine = new RuleEngine(config);
      const reportGenerator = new ReportGenerator(config);

      // Scan project
      const graph = await scanner.scan();
      spinner.succeed(`Scanned ${graph.nodeCount()} files`);

      // Validate
      spinner.start('Running validation...');
      const fileContents = scanner.getFileContents();
      const violations = await ruleEngine.validate(graph, fileContents);
      spinner.succeed(`Found ${violations.length} violations`);

      // Generate report
      spinner.start('Generating report...');
      await reportGenerator.generate({
        graph,
        violations,
        format: options.format,
        outputPath: options.output,
        includeCode: options.includeCode,
        includeGraphs: options.includeGraphs,
        template: options.template,
      });
      spinner.succeed(`Report generated at ${options.output}`);

      Logger.success(`\n✨ Report generated successfully!\n`);
      Logger.info(`Open ${options.output}/index.html in your browser to view the report.\n`);

    } catch (error) {
      spinner.fail(`Report generation failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });
