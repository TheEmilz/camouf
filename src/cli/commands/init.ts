/**
 * Init Command
 * 
 * Initializes a new Camouf configuration in the current project.
 * Creates camouf.config.json with default settings.
 * Creates .vscode/tasks.json for real-time Problems integration.
 * Optionally generates agent integration files (CLAUDE.md, AGENTS.md).
 */

import { Command } from 'commander';
import { ConfigurationManager } from '../../core/config/configuration-manager.js';
import { Logger } from '../../core/logger.js';
import { ProjectDetector } from '../../core/scanner/project-detector.js';
import { generateAgentIntegration, AgentType } from '../../core/agents/agent-integrations.js';
import inquirer from 'inquirer';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';

export const initCommand = new Command('init')
  .description('Initialize Camouf configuration in the current project')
  .option('-y, --yes', 'Skip interactive prompts and use defaults')
  .option('-f, --force', 'Overwrite existing configuration')
  .option('--template <template>', 'Use a predefined template (monorepo, microservices, fullstack)')
  .option('--agent <type>', 'Generate agent integration files (claude, codex, all)')
  .action(async (options) => {
    const spinner = ora('Detecting project structure...').start();

    try {
      const configManager = new ConfigurationManager();
      const projectDetector = new ProjectDetector();

      // Check if config already exists
      if (configManager.configExists() && !options.force) {
        spinner.fail('Configuration already exists. Use --force to overwrite.');
        return;
      }

      // Detect project structure
      const detection = await projectDetector.detect(process.cwd());
      spinner.succeed('Project structure detected');

      let config;

      // --agent implies --yes (non-interactive) since agents can't answer prompts
      const skipPrompts = options.yes || !!options.agent;

      if (skipPrompts) {
        // Use detected defaults
        config = configManager.generateDefaultConfig(detection);
      } else {
        // Interactive prompts
        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'useDetected',
            message: `Detected: ${detection.languages.join(', ')}. Use detected settings?`,
            default: true,
          },
          {
            type: 'checkbox',
            name: 'languages',
            message: 'Select languages to analyze:',
            choices: ['typescript', 'javascript', 'python', 'java', 'go', 'rust'],
            default: detection.languages,
            when: (ans) => !ans.useDetected,
          },
          {
            type: 'input',
            name: 'clientDir',
            message: 'Client/Frontend directory (comma-separated if multiple):',
            default: detection.directories.client.join(', '),
          },
          {
            type: 'input',
            name: 'serverDir',
            message: 'Server/Backend directory (comma-separated if multiple):',
            default: detection.directories.server.join(', '),
          },
          {
            type: 'input',
            name: 'sharedDir',
            message: 'Shared/Common directory (comma-separated if multiple):',
            default: detection.directories.shared.join(', '),
          },
          {
            type: 'checkbox',
            name: 'rules',
            message: 'Select rules to enable:',
            choices: [
              { name: 'Layer Dependencies', value: 'layer-dependencies', checked: true },
              { name: 'Circular Dependencies', value: 'circular-dependencies', checked: true },
              { name: 'Data Flow Integrity', value: 'data-flow-integrity', checked: false },
              { name: 'API Versioning', value: 'api-versioning', checked: false },
              { name: 'Security Context', value: 'security-context', checked: false },
              { name: 'Performance Anti-Patterns', value: 'performance-antipatterns', checked: true },
              { name: 'DDD Boundaries', value: 'ddd-boundaries', checked: false },
              { name: 'Type Safety', value: 'type-safety', checked: true },
            ],
          },
        ]);

        config = configManager.buildConfigFromAnswers(answers, detection);
      }

      // Write configuration
      spinner.start('Writing configuration...');
      await configManager.writeConfig(config);
      spinner.succeed('Configuration written to camouf.config.json');

      // Create VS Code integration for real-time Problems
      spinner.start('Setting up VS Code integration...');
      await createVSCodeIntegration(process.cwd());
      spinner.succeed('VS Code integration configured');

      // Generate agent integration files if requested
      if (options.agent) {
        const agentType = options.agent as AgentType;
        const validTypes: AgentType[] = ['claude', 'codex', 'all'];
        
        if (!validTypes.includes(agentType)) {
          Logger.error(`Invalid agent type: ${agentType}. Use: claude, codex, or all`);
        } else {
          spinner.start(`Setting up ${agentType} agent integration...`);
          const agentResult = await generateAgentIntegration(process.cwd(), agentType, { force: options.force });
          spinner.succeed(`Agent integration configured`);
          
          if (agentResult.filesCreated.length > 0) {
            Logger.info('\n  Agent files created:');
            for (const file of agentResult.filesCreated) {
              Logger.info(`    ✓ ${file}`);
            }
          }
          if (agentResult.filesSkipped.length > 0) {
            Logger.info('  Agent files skipped (already exist):');
            for (const file of agentResult.filesSkipped) {
              Logger.info(`    - ${file}`);
            }
          }
        }
      }

      Logger.success('\n✨ Camouf initialized successfully!');
      Logger.info('\nNext steps:');
      Logger.info('  1. Review and customize camouf.config.json');
      Logger.info('  2. Run "camouf validate" to check your architecture');
      Logger.info('  3. For real-time Problems in VS Code:');
      Logger.info('     - Press Ctrl+Shift+B and select "camouf: Watch"');
      Logger.info('     - Or run Terminal > Run Task > camouf: Watch');
      Logger.info('  4. Violations will appear in the Problems panel (Ctrl+Shift+M)');
      
      if (!options.agent) {
        Logger.info('\n  💡 Tip: Use --agent to set up AI agent integration:');
        Logger.info('     camouf init --agent claude    # Claude Code (CLAUDE.md + commands)');
        Logger.info('     camouf init --agent codex     # OpenAI Codex (AGENTS.md)');
        Logger.info('     camouf init --agent all       # All agent integrations\n');
      } else {
        Logger.info('');
      }

    } catch (error) {
      spinner.fail(`Initialization failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });

/**
 * Create VS Code integration files for real-time Problems panel
 */
async function createVSCodeIntegration(projectRoot: string): Promise<void> {
  const vscodeDir = path.join(projectRoot, '.vscode');
  
  // Create .vscode directory if it doesn't exist
  if (!fs.existsSync(vscodeDir)) {
    fs.mkdirSync(vscodeDir, { recursive: true });
  }

  // Tasks configuration with problem matcher
  const tasksConfig = {
    version: '2.0.0',
    tasks: [
      {
        label: 'camouf: Validate',
        type: 'shell',
        command: 'npx camouf validate --format vscode',
        group: 'build',
        presentation: {
          reveal: 'silent',
          panel: 'dedicated',
          clear: true
        },
        problemMatcher: {
          owner: 'camouf',
          fileLocation: ['relative', '${workspaceFolder}'],
          pattern: {
            regexp: '^(.+)\\((\\d+),(\\d+)\\):\\s+(error|warning|info)\\s+([^:]+):\\s+(.*)$',
            file: 1,
            line: 2,
            column: 3,
            severity: 4,
            code: 5,
            message: 6
          }
        }
      },
      {
        label: 'camouf: Watch',
        type: 'shell',
        command: 'npx camouf watch --format vscode',
        group: 'build',
        isBackground: true,
        presentation: {
          reveal: 'always',
          panel: 'dedicated'
        },
        problemMatcher: {
          owner: 'camouf',
          fileLocation: ['relative', '${workspaceFolder}'],
          background: {
            activeOnStart: true,
            beginsPattern: '>>> CAMOUF WATCH STARTED <<<',
            endsPattern: '>>> CAMOUF WATCH STOPPED'
          },
          pattern: {
            regexp: '^(.+)\\((\\d+),(\\d+)\\):\\s+(error|warning|info)\\s+([^:]+):\\s+(.*)$',
            file: 1,
            line: 2,
            column: 3,
            severity: 4,
            code: 5,
            message: 6
          }
        }
      }
    ]
  };

  const tasksPath = path.join(vscodeDir, 'tasks.json');
  
  // Merge with existing tasks.json if it exists
  let existingTasks: { version?: string; tasks?: unknown[] } = { version: '2.0.0', tasks: [] };
  if (fs.existsSync(tasksPath)) {
    try {
      existingTasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
    } catch {
      // If parsing fails, start fresh
    }
  }

  // Remove existing camouf tasks
  const otherTasks = (existingTasks.tasks || []).filter(
    (task: unknown) => !(task as { label?: string }).label?.startsWith('camouf:')
  );

  // Merge tasks
  const mergedTasks = {
    version: '2.0.0',
    tasks: [...otherTasks, ...tasksConfig.tasks]
  };

  fs.writeFileSync(tasksPath, JSON.stringify(mergedTasks, null, 2));

  // Create settings.json for better integration
  const settingsPath = path.join(vscodeDir, 'settings.json');
  let existingSettings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      existingSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      // If parsing fails, start fresh
    }
  }

  // Add camouf-related settings
  const camoufSettings = {
    ...existingSettings,
    'task.autoDetect': 'on',
    'task.problemMatchers.neverPrompt': {
      ...(existingSettings['task.problemMatchers.neverPrompt'] as Record<string, boolean> || {}),
      'camouf': true
    }
  };

  fs.writeFileSync(settingsPath, JSON.stringify(camoufSettings, null, 2));
}
