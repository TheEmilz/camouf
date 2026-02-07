/**
 * MCP Command
 * 
 * Starts the Camouf MCP (Model Context Protocol) server.
 * This allows AI agents to use Camouf for real-time validation.
 */

import { Command } from 'commander';
import { Logger } from '../../core/logger.js';

export const mcpCommand = new Command('mcp')
  .description('Start MCP server for AI agent integration')
  .option('--stdio', 'Use stdio transport (default)', true)
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    try {
      // Dynamic import to avoid loading MCP on every CLI invocation
      const { startMcpServer } = await import('../../mcp/index.js');
      
      if (options.verbose) {
        Logger.info('Starting Camouf MCP Server...');
        Logger.info('Tools available: camouf_validate, camouf_analyze, camouf_suggest_fix');
        Logger.info('Resources available: camouf://rules');
      }

      await startMcpServer();
    } catch (error) {
      // MCP server should be silent except for actual errors
      const message = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`MCP server error: ${message}`);
      process.exit(1);
    }
  });

export default mcpCommand;
