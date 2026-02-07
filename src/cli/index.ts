#!/usr/bin/env node
/**
 * Camouf CLI - Real-time Architecture Monitoring Tool
 * 
 * Entry point for the command-line interface.
 * Provides commands for initializing, watching, and validating project architecture.
 */

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { watchCommand } from './commands/watch.js';
import { validateCommand } from './commands/validate.js';
import { analyzeCommand } from './commands/analyze.js';
import { reportCommand } from './commands/report.js';
import { fixCommand, fixSignaturesCommand } from './commands/fix.js';
import { mcpCommand } from './commands/mcp.js';
import { Logger } from '../core/logger.js';
import { version, description } from './version.js';

const program = new Command();

program
  .name('camouf')
  .description(description)
  .version(version, '-v, --version', 'Display the current version');

// Global options
program
  .option('-c, --config <path>', 'Path to configuration file')
  .option('--verbose', 'Enable verbose output')
  .option('--silent', 'Suppress all output except errors')
  .option('--no-color', 'Disable colored output');

// Register commands
program.addCommand(initCommand);
program.addCommand(watchCommand);
program.addCommand(validateCommand);
program.addCommand(analyzeCommand);
program.addCommand(reportCommand);
program.addCommand(fixCommand);
program.addCommand(fixSignaturesCommand);
program.addCommand(mcpCommand);

// Error handling
program.exitOverride((err) => {
  if (err.code === 'commander.help' || err.code === 'commander.version') {
    process.exit(0);
  }
  if (err.code !== 'commander.helpDisplayed' && err.code !== 'commander.outputHelp') {
    Logger.error(`Error: ${err.message}`);
  }
  process.exit(1);
});

// Parse arguments
program.parseAsync(process.argv).catch((error) => {
  Logger.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
