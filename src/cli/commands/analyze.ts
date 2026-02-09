/**
 * Analyze Command
 * 
 * Performs deep analysis of project architecture and generates insights.
 */

import { Command } from 'commander';
import { ConfigurationManager } from '../../core/config/configuration-manager.js';
import { ProjectScanner } from '../../core/scanner/project-scanner.js';
import { DependencyAnalyzer } from '../../core/analyzer/dependency-analyzer.js';
import { ArchitectureVisualizer } from '../../core/analyzer/architecture-visualizer.js';
import { Logger } from '../../core/logger.js';
import ora from 'ora';

export const analyzeCommand = new Command('analyze')
  .description('Analyze project architecture and dependencies')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('--depth <number>', 'Maximum depth for dependency analysis', '5')
  .option('--focus <path>', 'Focus analysis on specific file or directory')
  .option('--output <path>', 'Output directory for visualization files')
  .option('--format <format>', 'Output format (html, json, jsond, dot)', 'html')
  .option('--metrics', 'Include code metrics in analysis')
  .option('--coupling', 'Analyze coupling between modules')
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
      const analyzer = new DependencyAnalyzer(config);
      const visualizer = new ArchitectureVisualizer(config);

      // Set up scan progress reporting
      scanner.onProgress(({ current, total, file, phase }) => {
        if (phase === 'discovering') {
          spinner.text = 'Discovering files...';
        } else if (phase === 'parsing') {
          const pct = Math.round((current / total) * 100);
          const shortFile = file.length > 50 ? '...' + file.slice(-47) : file;
          spinner.text = `Scanning [${current}/${total}] (${pct}%) ${shortFile}`;
        } else if (phase === 'building-graph') {
          spinner.text = 'Building dependency graph...';
        }
      });

      // Scan project
      const graph = await scanner.scan();
      spinner.succeed(`Scanned ${graph.nodeCount()} files`);

      // Analyze dependencies
      spinner.start('Analyzing dependencies...');
      const analysis = await analyzer.analyze(graph, {
        maxDepth: parseInt(options.depth, 10),
        focus: options.focus,
        includeMetrics: options.metrics,
        analyzeCoupling: options.coupling,
      });
      spinner.succeed('Dependency analysis complete');

      // Generate visualization
      spinner.start('Generating visualization...');
      await visualizer.generate(analysis, {
        format: options.format,
        outputPath: options.output || './camouf-report',
      });
      spinner.succeed(`Visualization generated at ${options.output || './camouf-report'}`);

      // Print summary
      Logger.info('\n📊 Analysis Summary:\n');
      Logger.info(`  Total files: ${analysis.summary.totalFiles}`);
      Logger.info(`  Total dependencies: ${analysis.summary.totalDependencies}`);
      Logger.info(`  Circular dependencies: ${analysis.summary.circularDependencies}`);
      Logger.info(`  Average coupling: ${analysis.summary.averageCoupling.toFixed(2)}`);
      
      if (analysis.hotspots.length > 0) {
        Logger.info('\n🔥 Hotspots (most depended upon):\n');
        analysis.hotspots.slice(0, 5).forEach((hotspot, index) => {
          Logger.info(`  ${index + 1}. ${hotspot.file} (${hotspot.dependents} dependents)`);
        });
      }

      if (analysis.suggestions.length > 0) {
        Logger.info('\n💡 Suggestions:\n');
        analysis.suggestions.forEach((suggestion) => {
          Logger.info(`  • ${suggestion}`);
        });
      }

      Logger.info('');

    } catch (error) {
      spinner.fail(`Analysis failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });
