/**
 * MCP Server - Camouf
 * 
 * Model Context Protocol server that exposes Camouf functionality
 * to AI agents (Claude, Cursor, Copilot, etc.)
 * 
 * This allows AI to validate its own generated code BEFORE proposing it,
 * creating a feedback loop that catches architecture violations in real-time.
 * 
 * Usage in Claude Desktop config:
 * {
 *   "mcpServers": {
 *     "camouf": {
 *       "command": "npx",
 *       "args": ["camouf", "mcp"]
 *     }
 *   }
 * }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { validateTool } from './tools/validate.js';
import { analyzeTool } from './tools/analyze.js';
import { suggestFixTool } from './tools/fix.js';
import { rulesResource } from './resources/rules.js';
import { configResource } from './resources/config.js';
import { promptDefinitions, getPrompt } from './prompts/index.js';

/**
 * MCP Server version
 */
const VERSION = '0.9.0';

/**
 * Create and configure the MCP server
 */
export function createMcpServer(): Server {
  const server = new Server(
    {
      name: 'camouf',
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        validateTool.definition,
        analyzeTool.definition,
        suggestFixTool.definition,
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'camouf_validate':
          return await validateTool.handler(args || {});

        case 'camouf_analyze':
          return await analyzeTool.handler(args || {});

        case 'camouf_suggest_fix':
          return await suggestFixTool.handler(args || {});

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
      }
    } catch (error) {
      if (error instanceof McpError) throw error;
      
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: message }),
          },
        ],
        isError: true,
      };
    }
  });

  // Register resource handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        rulesResource.definition,
        configResource.definition,
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    switch (uri) {
      case 'camouf://rules':
        return await rulesResource.handler();

      case 'camouf://config':
        return await configResource.handler();

      default:
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Unknown resource: ${uri}`
        );
    }
  });

  // Register prompt handlers
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: promptDefinitions,
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = getPrompt(name, args);
    return result;
  });

  return server;
}

/**
 * Start the MCP server with stdio transport
 */
export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });
}

// Export for CLI integration
export { validateTool, analyzeTool, suggestFixTool, rulesResource, configResource };
