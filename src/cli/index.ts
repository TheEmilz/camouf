#!/usr/bin/env node
/**
 * Camouf CLI - Architecture Guardrails for AI-Generated Code
 * 
 * Entry point for the command-line interface.
 * Provides commands for initializing, watching, validating, and fixing code.
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

// ============================================================================
// Custom Help Formatting
// ============================================================================

const BANNER = `
  ██████╗ █████╗ ███╗   ███╗ ██████╗ ██╗   ██╗███████╗
 ██╔════╝██╔══██╗████╗ ████║██╔═══██╗██║   ██║██╔════╝
 ██║     ███████║██╔████╔██║██║   ██║██║   ██║█████╗  
 ██║     ██╔══██║██║╚██╔╝██║██║   ██║██║   ██║██╔══╝  
 ╚██████╗██║  ██║██║ ╚═╝ ██║╚██████╔╝╚██████╔╝██║    
  ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝  ╚═════╝ ╚═╝    v${version}
`;

function showCustomHelp(): void {
  console.log(BANNER);
  console.log(`  ${description}\n`);
  
  console.log('  ┌─────────────────────────────────────────────────────────────┐');
  console.log('  │  QUICK START                                                │');
  console.log('  │                                                             │');
  console.log('  │  $ npx camouf init              # Setup config              │');
  console.log('  │  $ npx camouf validate          # One-time check            │');
  console.log('  │  $ npx camouf watch             # Real-time monitoring      │');
  console.log('  └─────────────────────────────────────────────────────────────┘\n');

  console.log('  COMMANDS\n');

  console.log('  Setup & Config:');
  console.log('    init [options]            Initialize configuration in the current project');
  console.log('                              --template <t>  Use preset (monorepo, fullstack)');
  console.log('                              --agent <type>  Generate CLAUDE.md / AGENTS.md');
  console.log('');

  console.log('  Validation & Analysis:');
  console.log('    validate [options]        One-time architecture validation');
  console.log('                              --rules <r>     Run specific rules (comma-sep)');
  console.log('                              --format <f>    Output: text, json, sarif, vscode');
  console.log('                              --fix           Auto-fix where possible');
  console.log('                              --ci            CI/agent mode (no spinners)');
  console.log('    watch [options]           Real-time file monitoring with live validation');
  console.log('                              --format vscode VS Code Problems panel integration');
  console.log('                              --rules <r>     Watch specific rules only');
  console.log('    analyze [options]         Deep architecture & dependency analysis');
  console.log('                              --metrics       Include code metrics');
  console.log('                              --coupling      Analyze module coupling');
  console.log('                              --format <f>    Output: html, json, dot');
  console.log('');

  console.log('  Fixing & Refactoring:');
  console.log('    fix [options]             Fix signature mismatches & fixable violations');
  console.log('                              --interactive   Review and confirm each fix');
  console.log('                              --all           Apply all fixes automatically');
  console.log('                              --dry-run       Preview changes without applying');
  console.log('                              --id <id>       Fix specific mismatch by ID');
  console.log('                              --file <path>   Fix all in a specific file');
  console.log('                              --type <type>   Fix by type (function-name, etc.)');
  console.log('    fix-signatures [options]  Alias: fix function signature mismatches');
  console.log('');

  console.log('  Reporting:');
  console.log('    report [options]          Generate comprehensive architecture reports');
  console.log('                              --format <f>    html, pdf, json, markdown');
  console.log('                              --include-code  Include code snippets');
  console.log('                              --include-graphs Include dependency graphs');
  console.log('');

  console.log('  AI Agent Integration:');
  console.log('    mcp [options]             Start MCP server for Cursor, Claude, Copilot');
  console.log('                              --stdio         Use stdio transport (default)');
  console.log('');

  console.log('  GLOBAL OPTIONS\n');
  console.log('    -c, --config <path>       Path to configuration file');
  console.log('    -v, --version             Display current version');
  console.log('    --verbose                 Enable verbose output');
  console.log('    --silent                  Suppress all output except errors');
  console.log('    --no-color                Disable colored output');
  console.log('');

  console.log('  EXAMPLES\n');
  console.log('    $ npx camouf validate --format json          # JSON output for scripts');
  console.log('    $ npx camouf validate --rules function-signature-matching');
  console.log('    $ npx camouf fix --interactive               # Review fixes one by one');
  console.log('    $ npx camouf fix --all --dry-run             # Preview all fixes');
  console.log('    $ npx camouf watch --format vscode           # VS Code integration');
  console.log('    $ npx camouf report --format html            # HTML architecture report');
  console.log('    $ npx camouf init --agent claude             # Generate CLAUDE.md');
  console.log('    $ npx camouf mcp --stdio                    # Start MCP server');
  console.log('');

  console.log('  AVAILABLE RULES\n');
  console.log('    AI Safety:          ai-hallucinated-imports, inconsistent-casing,');
  console.log('                        orphaned-functions, phantom-type-references,');
  console.log('                        context-drift-patterns');
  console.log('    Architecture:       layer-dependencies, circular-dependencies,');
  console.log('                        function-signature-matching, contract-mismatch');
  console.log('    Code Quality:       type-safety, performance-antipatterns,');
  console.log('                        data-flow-integrity, hardcoded-secrets');
  console.log('    Advanced:           ddd-boundaries, distributed-transactions,');
  console.log('                        api-versioning, security-context, resilience-patterns');
  console.log('');
  
  console.log('  DOCS & LINKS\n');
  console.log('    Documentation:      https://github.com/TheEmilz/camouf#readme');
  console.log('    Report Issues:      https://github.com/TheEmilz/camouf/issues');
  console.log('');
}

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

// Override default help
program.helpInformation = () => '';
program.on('--help', () => {});

// Register commands
program.addCommand(initCommand);
program.addCommand(watchCommand);
program.addCommand(validateCommand);
program.addCommand(analyzeCommand);
program.addCommand(reportCommand);
program.addCommand(fixCommand);
program.addCommand(fixSignaturesCommand);
program.addCommand(mcpCommand);

// Custom help command - override default
program
  .command('help [command]', { hidden: true })
  .description('Display help for a command')
  .action((commandName?: string) => {
    if (commandName) {
      const cmd = program.commands.find(c => c.name() === commandName);
      if (cmd) {
        cmd.outputHelp();
      } else {
        console.error(`  Unknown command: ${commandName}\n`);
        console.log(`  Run "npx camouf help" for a list of commands.\n`);
        process.exit(1);
      }
    } else {
      showCustomHelp();
    }
  });

// Show custom help when no args provided
if (process.argv.length <= 2) {
  showCustomHelp();
  process.exit(0);
}

// Handle --help flag explicitly
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  const cmdIndex = process.argv.findIndex(arg => !arg.startsWith('-') && arg !== 'node' && !arg.includes('camouf'));
  if (cmdIndex === -1 || process.argv[cmdIndex] === 'help') {
    showCustomHelp();
    process.exit(0);
  }
  // Otherwise let commander handle subcommand --help
}

// Error handling
program.exitOverride((err) => {
  if (err.code === 'commander.help' || err.code === 'commander.version') {
    process.exit(0);
  }
  if (err.code === 'commander.helpDisplayed' || err.code === 'commander.outputHelp') {
    process.exit(0);
  }
  if (err.code === 'commander.unknownCommand') {
    console.error(`\n  Unknown command: ${process.argv[2]}\n`);
    console.log('  Run "npx camouf help" for a list of available commands.\n');
    process.exit(1);
  }
  Logger.error(`Error: ${err.message}`);
  process.exit(1);
});

// Parse arguments
program.parseAsync(process.argv).catch((error) => {
  Logger.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
