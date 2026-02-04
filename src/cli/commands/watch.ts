/**
 * Watch Command
 * 
 * Starts real-time file monitoring and architecture validation.
 * Reports violations as they occur during development.
 */

import { Command } from 'commander';
import { ConfigurationManager } from '../../core/config/configuration-manager.js';
import { FileWatcher } from '../../core/watcher/file-watcher.js';
import { RuleEngine } from '../../core/rules/rule-engine.js';
import { ViolationReporter } from '../../core/reporter/violation-reporter.js';
import { ProjectScanner } from '../../core/scanner/project-scanner.js';
import { Logger } from '../../core/logger.js';
import ora from 'ora';

export const watchCommand = new Command('watch')
  .description('Start real-time architecture monitoring')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('--no-initial', 'Skip initial validation')
  .option('--debounce <ms>', 'Debounce time for file changes (default: 300)', '300')
  .option('--rules <rules>', 'Comma-separated list of rules to run')
  .option('--ignore <patterns>', 'Additional patterns to ignore')
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

      spinner.text = 'Initializing components...';

      // Initialize components
      const scanner = new ProjectScanner(config);
      const ruleEngine = new RuleEngine(config);
      const reporter = new ViolationReporter(config);
      const watcher = new FileWatcher(config, {
        debounce: parseInt(options.debounce, 10),
        additionalIgnore: options.ignore?.split(','),
      });

      // Filter rules if specified
      if (options.rules) {
        const enabledRules = options.rules.split(',');
        ruleEngine.filterRules(enabledRules);
      }

      // Initial scan
      if (options.initial !== false) {
        spinner.text = 'Performing initial scan...';
        const graph = await scanner.scan();
        
        spinner.text = 'Running initial validation...';
        const violations = await ruleEngine.validate(graph);
        
        spinner.stop();
        reporter.reportInitial(violations);
      } else {
        spinner.stop();
      }

      // Setup file watcher
      Logger.info('\n👁️  Watching for changes...\n');
      Logger.info('Press Ctrl+C to stop\n');

      watcher.on('change', async (filePath, changeType) => {
        Logger.debug(`File ${changeType}: ${filePath}`);
        
        try {
          // Incremental analysis
          const updatedGraph = await scanner.updateFile(filePath, changeType);
          const violations = await ruleEngine.validateFile(filePath, updatedGraph);
          
          reporter.reportIncremental(filePath, violations);
        } catch (error) {
          Logger.error(`Error analyzing ${filePath}: ${(error as Error).message}`);
        }
      });

      watcher.on('error', (error) => {
        Logger.error(`Watcher error: ${error.message}`);
      });

      // Start watching
      await watcher.start();

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        Logger.info('\n\nStopping file watcher...');
        await watcher.stop();
        
        const summary = reporter.getSummary();
        Logger.info(`\nSession summary: ${summary.total} violations found`);
        Logger.info(`  Errors: ${summary.errors}, Warnings: ${summary.warnings}, Info: ${summary.info}\n`);
        
        process.exit(0);
      });

    } catch (error) {
      spinner.fail(`Watch failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });
