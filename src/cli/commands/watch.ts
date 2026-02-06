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
  .option('--format <format>', 'Output format (text, vscode)', 'text')
  .option('--ci', 'CI/agent mode: no spinners, no colors, machine-parseable output')
  .action(async (options) => {
    const isVSCodeFormat = options.format === 'vscode';
    const isCIMode = options.ci || isVSCodeFormat || !!process.env.CI || !!process.env.CAMOUF_CI;
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

      if (spinner) spinner.text = 'Initializing components...';

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
        if (spinner) spinner.text = 'Performing initial scan...';
        const graph = await scanner.scan();
        
        if (spinner) spinner.text = 'Running initial validation...';
        const fileContents = scanner.getFileContents();
        const violations = await ruleEngine.validate(graph, fileContents);
        
        if (spinner) spinner.stop();
        
        if (isVSCodeFormat) {
          reporter.reportVSCode(violations);
        } else {
          reporter.reportInitial(violations);
        }
      } else {
        if (spinner) spinner.stop();
      }

      // Setup file watcher
      if (!isVSCodeFormat) {
        Logger.info('\n👁️  Watching for changes...\n');
        Logger.info('Press Ctrl+C to stop\n');
      } else {
        console.log('>>> CAMOUF WATCH STARTED <<<');
      }

      watcher.on('change', async (filePath, changeType) => {
        if (!isVSCodeFormat) {
          Logger.info(`\n📝 File ${changeType}: ${filePath}`);
        }
        
        try {
          // Incremental analysis
          const updatedGraph = await scanner.updateFile(filePath, changeType);
          const fileContents = scanner.getFileContents();
          const violations = await ruleEngine.validateFile(filePath, updatedGraph, fileContents);
          
          if (isVSCodeFormat) {
            reporter.reportIncrementalVSCode(filePath, violations);
          } else {
            if (violations.length > 0) {
              Logger.info(`   Found ${violations.length} violation(s):`);
            } else {
              Logger.info(`   ✅ No violations found`);
            }
            reporter.reportIncremental(filePath, violations);
          }
        } catch (error) {
          if (isVSCodeFormat) {
            console.error(`camouf: Error analyzing ${filePath}: ${(error as Error).message}`);
          } else {
            Logger.error(`Error analyzing ${filePath}: ${(error as Error).message}`);
          }
        }
      });

      watcher.on('error', (error) => {
        if (isVSCodeFormat) {
          console.error(`camouf: Watcher error: ${error.message}`);
        } else {
          Logger.error(`Watcher error: ${error.message}`);
        }
      });

      // Start watching
      await watcher.start();

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        if (!isVSCodeFormat) {
          Logger.info('\n\nStopping file watcher...');
        }
        await watcher.stop();
        
        const summary = reporter.getSummary();
        if (!isVSCodeFormat) {
          Logger.info(`\nSession summary: ${summary.total} violations found`);
          Logger.info(`  Errors: ${summary.errors}, Warnings: ${summary.warnings}, Info: ${summary.info}\n`);
        } else {
          console.log(`>>> CAMOUF WATCH STOPPED: ${summary.total} total violations <<<`);
        }
        
        process.exit(0);
      });

    } catch (error) {
      if (spinner) {
        spinner.fail(`Watch failed: ${(error as Error).message}`);
      } else {
        console.error(`camouf: Watch failed: ${(error as Error).message}`);
      }
      process.exit(1);
    }
  });
