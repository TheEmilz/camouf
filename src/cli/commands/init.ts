/**
 * Init Command
 * 
 * Initializes a new Camouf configuration in the current project.
 * Creates camouf.config.json with default settings.
 */

import { Command } from 'commander';
import { ConfigurationManager } from '../../core/config/configuration-manager.js';
import { Logger } from '../../core/logger.js';
import { ProjectDetector } from '../../core/scanner/project-detector.js';
import inquirer from 'inquirer';
import ora from 'ora';

export const initCommand = new Command('init')
  .description('Initialize Camouf configuration in the current project')
  .option('-y, --yes', 'Skip interactive prompts and use defaults')
  .option('-f, --force', 'Overwrite existing configuration')
  .option('--template <template>', 'Use a predefined template (monorepo, microservices, fullstack)')
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

      if (options.yes) {
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

      Logger.success('\n✨ Camouf initialized successfully!');
      Logger.info('\nNext steps:');
      Logger.info('  1. Review and customize camouf.config.json');
      Logger.info('  2. Run "camouf validate" to check your architecture');
      Logger.info('  3. Run "camouf watch" to start real-time monitoring\n');

    } catch (error) {
      spinner.fail(`Initialization failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });
