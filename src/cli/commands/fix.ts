/**
 * Fix Command
 * 
 * Applies fixes for signature mismatches and other fixable violations.
 * Supports both single fix by ID and batch operations.
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationManager } from '../../core/config/configuration-manager.js';
import { ProjectScanner } from '../../core/scanner/project-scanner.js';
import { RuleEngine } from '../../core/rules/rule-engine.js';
import { Logger } from '../../core/logger.js';
import ora from 'ora';

interface MismatchFix {
  id: string;
  file: string;
  line: number;
  oldText: string;
  newText: string;
  type: string;
}

export const fixCommand = new Command('fix')
  .description('Fix signature mismatches and other fixable violations')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('--id <id>', 'Fix specific mismatch by ID (e.g., sig-001)')
  .option('--file <path>', 'Fix all mismatches in a specific file')
  .option('--type <type>', 'Fix all mismatches of a specific type (function-name, parameter-name, type-field)')
  .option('--all', 'Fix all signature mismatches')
  .option('--interactive', 'Interactive mode: confirm each fix')
  .option('--dry-run', 'Show what would be fixed without making changes')
  .option('--ci', 'CI/agent mode: no prompts, no spinners')
  .action(async (options) => {
    await executeFixAction(options);
  });

export const fixSignaturesCommand = new Command('fix-signatures')
  .description('Fix function signature mismatches (alias for fix with signature options)')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('--type <type>', 'Fix type: function-name, parameter-name, type-field')
  .option('--file <path>', 'Fix all in specific file')
  .option('--all', 'Fix all signature mismatches')
  .option('--interactive', 'Interactive mode')
  .option('--dry-run', 'Show what would be fixed')
  .option('--ci', 'CI mode')
  .action(async (options) => {
    // Default to interactive if no mode specified
    if (!options.type && !options.file && !options.all && !options.interactive) {
      options.interactive = true;
    }
    // Execute the same action as fix command
    await executeFixAction(options);
  });

async function executeFixAction(options: {
  config?: string;
  id?: string;
  file?: string;
  type?: string;
  all?: boolean;
  interactive?: boolean;
  dryRun?: boolean;
  ci?: boolean;
}): Promise<void> {
  const isCIMode = options.ci || !!process.env.CI || !!process.env.CAMOUF_CI;
  const spinner = isCIMode ? null : ora('Loading configuration...').start();

  try {
    // Load configuration
    const configManager = new ConfigurationManager();
    const config = await configManager.loadConfig(options.config);
    
    if (!config) {
      if (spinner) spinner.fail('No configuration found');
      Logger.error('Run "npx camouf init" to initialize configuration.');
      process.exit(1);
    }

    // Scan project and run function-signature-matching rule
    if (spinner) spinner.text = 'Scanning for signature mismatches...';
    
    const scanner = new ProjectScanner(config);
    const ruleEngine = new RuleEngine(config);
    
    // Only run function-signature-matching rule
    ruleEngine.filterRules(['function-signature-matching']);
    
    const graph = await scanner.scan();
    const fileContents = scanner.getFileContents();
    const violations = await ruleEngine.validate(graph, fileContents);
    
    if (spinner) spinner.succeed(`Found ${violations.length} signature mismatches`);

    if (violations.length === 0) {
      if (!isCIMode) Logger.success('\nNo signature mismatches found!\n');
      return;
    }

    // Filter violations based on options
    let targetViolations = violations.filter(v => v.ruleId === 'function-signature-matching');
    
    if (options.id) {
      targetViolations = targetViolations.filter(v => 
        v.metadata?.mismatchId === options.id
      );
    }
    
    if (options.file) {
      const targetPath = path.resolve(options.file);
      targetViolations = targetViolations.filter(v => 
        path.resolve(config.root, v.file).includes(targetPath)
      );
    }

    if (options.type) {
      targetViolations = targetViolations.filter(v => 
        v.metadata?.mismatchType === options.type
      );
    }

    if (targetViolations.length === 0) {
      Logger.warn('\nNo matching violations found with the given filters.\n');
      return;
    }

    // If no action specified, show available fixes
    if (!options.all && !options.interactive && !options.id) {
      Logger.info('\nAvailable fixes:\n');
      Logger.info('Usage:');
      Logger.info('  npx camouf fix --id sig-001      # Fix specific mismatch');
      Logger.info('  npx camouf fix --file src/api.ts # Fix all in file');
      Logger.info('  npx camouf fix --type function-name # Fix by type');
      Logger.info('  npx camouf fix --all             # Fix all mismatches');
      Logger.info('  npx camouf fix --interactive     # Interactive mode\n');
      
      // Show summary of mismatches
      console.log('\nMismatches by type:');
      const byType = new Map<string, number>();
      violations.forEach(v => {
        const type = String(v.metadata?.mismatchType || 'unknown');
        byType.set(type, (byType.get(type) || 0) + 1);
      });
      byType.forEach((count, type) => {
        console.log(`  ${type}: ${count}`);
      });
      console.log('');
      
      return;
    }

    // Apply fixes
    const fixes: MismatchFix[] = [];
    
    for (const violation of targetViolations) {
      if (!violation.metadata) continue;
      
      const { expected, found, mismatchId, mismatchType } = violation.metadata;
      
      if (expected && found && typeof expected === 'string' && typeof found === 'string') {
        fixes.push({
          id: String(mismatchId || 'unknown'),
          file: violation.file,
          line: violation.line || 0,
          oldText: found,
          newText: expected,
          type: String(mismatchType || 'unknown'),
        });
      }
    }

    if (fixes.length === 0) {
      Logger.warn('\nNo fixes could be generated from the violations.\n');
      return;
    }

    // Interactive mode
    if (options.interactive && !isCIMode) {
      Logger.info(`\nFound ${fixes.length} fixes to apply:\n`);
      
      for (const fix of fixes) {
        console.log(`  [${fix.id}] ${fix.file}:${fix.line}`);
        console.log(`    ${fix.type}: "${fix.oldText}" → "${fix.newText}"`);
      }
      
      // In interactive mode, we'd use inquirer to confirm each fix
      // For now, just show them
      Logger.info('\nUse --all to apply all fixes, or --id <id> for specific fixes.\n');
      return;
    }

    // Dry run mode
    if (options.dryRun) {
      Logger.info('\n[DRY RUN] Would apply the following fixes:\n');
      
      for (const fix of fixes) {
        console.log(`  [${fix.id}] ${fix.file}:${fix.line}`);
        console.log(`    ${fix.type}: "${fix.oldText}" → "${fix.newText}"`);
      }
      
      Logger.info(`\n[DRY RUN] Would fix ${fixes.length} mismatch(es).\n`);
      return;
    }

    // Group fixes by file
    const fixesByFile = new Map<string, MismatchFix[]>();
    for (const fix of fixes) {
      const existing = fixesByFile.get(fix.file) || [];
      existing.push(fix);
      fixesByFile.set(fix.file, existing);
    }

    // Apply fixes
    if (spinner) spinner.text = 'Applying fixes...';
    
    let appliedCount = 0;
    
    for (const [filePath, fileFixes] of fixesByFile) {
      try {
        const absolutePath = path.resolve(config.root, filePath);
        let content = fs.readFileSync(absolutePath, 'utf-8');
        
        // Apply fixes in reverse line order to preserve line numbers
        const sortedFixes = [...fileFixes].sort((a, b) => b.line - a.line);
        
        for (const fix of sortedFixes) {
          // Replace the old text with new text (word boundary aware)
          const regex = new RegExp(`\\b${escapeRegExp(fix.oldText)}\\b`, 'g');
          const newContent = content.replace(regex, fix.newText);
          
          if (newContent !== content) {
            content = newContent;
            appliedCount++;
            
            if (!isCIMode) {
              Logger.info(`  Fixed: ${filePath}:${fix.line} - "${fix.oldText}" → "${fix.newText}"`);
            }
          }
        }
        
        // Write back
        fs.writeFileSync(absolutePath, content, 'utf-8');
        
      } catch (error) {
        Logger.error(`Failed to apply fixes to ${filePath}: ${error}`);
      }
    }

    if (spinner) spinner.succeed(`Applied ${appliedCount} fixes`);
    
    // Output results
    if (isCIMode) {
      console.log(JSON.stringify({
        applied: appliedCount,
        total: fixes.length,
        files: Array.from(fixesByFile.keys()),
      }));
    } else {
      Logger.success(`\nApplied ${appliedCount} fixes to ${fixesByFile.size} file(s).`);
      Logger.info('Run "npx camouf validate" to verify the changes.\n');
    }

  } catch (error) {
    if (spinner) spinner.fail(`Error: ${error}`);
    else console.error(`ERROR: ${error}`);
    process.exit(1);
  }
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
