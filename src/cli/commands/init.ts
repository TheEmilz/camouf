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
  .option('--plugin', 'Scaffold a new Camouf plugin project')
  .action(async (options) => {
    // Plugin scaffolding is a separate path
    if (options.plugin) {
      await scaffoldPlugin(options);
      return;
    }

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

/**
 * Scaffold a new Camouf plugin project
 */
async function scaffoldPlugin(options: { yes?: boolean; force?: boolean }): Promise<void> {
  let pluginName: string;
  let pluginDescription: string;
  let ruleId: string;

  if (options.yes) {
    pluginName = 'my-plugin';
    pluginDescription = 'A custom Camouf plugin';
    ruleId = 'my-custom-rule';
  } else {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Plugin name (without camouf-plugin- prefix):',
        default: 'my-plugin',
        validate: (input: string) => {
          if (/^[a-z0-9-]+$/.test(input)) return true;
          return 'Use lowercase letters, numbers, and hyphens only';
        },
      },
      {
        type: 'input',
        name: 'description',
        message: 'Plugin description:',
        default: 'A custom Camouf plugin',
      },
      {
        type: 'input',
        name: 'ruleId',
        message: 'First rule ID (e.g., no-global-state):',
        default: 'my-custom-rule',
        validate: (input: string) => {
          if (/^[a-z0-9-]+$/.test(input)) return true;
          return 'Use lowercase letters, numbers, and hyphens only';
        },
      },
    ]);

    pluginName = answers.name;
    pluginDescription = answers.description;
    ruleId = answers.ruleId;
  }

  const dirName = `camouf-plugin-${pluginName}`;
  const dirPath = path.join(process.cwd(), dirName);

  if (fs.existsSync(dirPath) && !options.force) {
    Logger.error(`Directory ${dirName} already exists. Use --force to overwrite.`);
    process.exit(1);
  }

  const spinner = ora(`Scaffolding ${dirName}...`).start();

  try {
    // Create directory structure
    fs.mkdirSync(path.join(dirPath, 'src', 'rules'), { recursive: true });

    // Convert rule-id to PascalCase class name
    const className = ruleId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('') + 'Rule';

    // package.json
    const packageJson = {
      name: `camouf-plugin-${pluginName}`,
      version: '0.1.0',
      description: pluginDescription,
      type: 'module',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      scripts: {
        build: 'tsc',
        dev: 'tsc -w',
        prepublishOnly: 'npm run build',
      },
      keywords: ['camouf', 'camouf-plugin', 'architecture', 'static-analysis'],
      license: 'MIT',
      peerDependencies: {
        camouf: '>=0.9.0',
      },
      devDependencies: {
        camouf: '^0.9.0',
        typescript: '^5.3.0',
      },
      files: ['dist', 'README.md'],
    };

    // tsconfig.json
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        outDir: './dist',
        rootDir: './src',
        strict: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist'],
    };

    // src/index.ts — plugin entry
    const indexTs = `/**
 * Camouf Plugin: ${pluginName}
 * 
 * ${pluginDescription}
 */

import type { CamoufPlugin } from 'camouf';
import { ${className} } from './rules/${ruleId}.js';

const plugin: CamoufPlugin = {
  metadata: {
    name: 'camouf-plugin-${pluginName}',
    version: '0.1.0',
    description: '${pluginDescription}',
    author: '',
    camoufVersion: '>=0.9.0',
  },
  rules: [new ${className}()],
};

export default plugin;
`;

    // src/rules/{ruleId}.ts — example rule
    const ruleTs = `/**
 * Rule: ${ruleId}
 * 
 * TODO: Describe what this rule checks for.
 */

import type { IRule, RuleContext, RuleResult } from 'camouf/rules';
import type { Violation } from 'camouf';

export class ${className} implements IRule {
  readonly id = '${ruleId}';
  readonly name = '${className.replace(/Rule$/, '').replace(/([A-Z])/g, ' $1').trim()}';
  readonly description = 'TODO: Describe what this rule checks for';
  readonly severity = 'warning' as const;
  readonly tags = ['custom'];
  readonly category = 'custom' as const;

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];

    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data?.relativePath || nodeId;
      const content = context.fileContents?.get(filePath);
      if (!content) continue;

      // TODO: Implement your rule logic here
      // Example: detect a pattern in the file content
      //
      // if (content.includes('some-pattern')) {
      //   violations.push({
      //     id: \`\${this.id}-\${Date.now()}\`,
      //     ruleId: this.id,
      //     ruleName: this.name,
      //     severity: this.severity,
      //     message: 'Description of the violation',
      //     file: filePath,
      //     suggestion: 'How to fix it',
      //   });
      // }
    }

    return { violations };
  }
}
`;

    // README.md
    const readme = `# camouf-plugin-${pluginName}

${pluginDescription}

## Installation

\`\`\`bash
npm install camouf-plugin-${pluginName}
\`\`\`

## Configuration

Add to your \`camouf.config.json\`:

\`\`\`json
{
  "plugins": [
    {
      "name": "camouf-plugin-${pluginName}",
      "enabled": true
    }
  ]
}
\`\`\`

## Rules

| Rule | Severity | Description |
|------|----------|-------------|
| \`${ruleId}\` | warning | TODO: Describe the rule |

## Development

\`\`\`bash
npm run build    # Compile TypeScript
npm run dev      # Watch mode
\`\`\`

## License

MIT
`;

    // Write all files
    fs.writeFileSync(path.join(dirPath, 'package.json'), JSON.stringify(packageJson, null, 2));
    fs.writeFileSync(path.join(dirPath, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
    fs.writeFileSync(path.join(dirPath, 'src', 'index.ts'), indexTs);
    fs.writeFileSync(path.join(dirPath, 'src', 'rules', `${ruleId}.ts`), ruleTs);
    fs.writeFileSync(path.join(dirPath, 'README.md'), readme);

    spinner.succeed(`Plugin scaffolded: ${dirName}/`);

    Logger.success('\n✨ Plugin created successfully!');
    Logger.info('\nStructure:');
    Logger.info(`  ${dirName}/`);
    Logger.info(`  ├── package.json`);
    Logger.info(`  ├── tsconfig.json`);
    Logger.info(`  ├── README.md`);
    Logger.info(`  └── src/`);
    Logger.info(`      ├── index.ts`);
    Logger.info(`      └── rules/`);
    Logger.info(`          └── ${ruleId}.ts`);
    Logger.info('\nNext steps:');
    Logger.info(`  1. cd ${dirName}`);
    Logger.info(`  2. npm install`);
    Logger.info(`  3. Edit src/rules/${ruleId}.ts with your rule logic`);
    Logger.info(`  4. npm run build`);
    Logger.info(`  5. Add the plugin to your project's camouf.config.json\n`);

  } catch (error) {
    spinner.fail(`Scaffolding failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
