/**
 * MCP Resource: camouf://config
 * 
 * Exposes the active Camouf configuration as an MCP resource.
 * Allows AI agents to see which rules are active, directories configured,
 * and project structure — without running a full analysis.
 */

import { Resource } from '@modelcontextprotocol/sdk/types.js';
import { ConfigurationManager } from '../../core/config/configuration-manager.js';

/**
 * Resource definition for MCP
 */
export const definition: Resource = {
  uri: 'camouf://config',
  name: 'Camouf Configuration',
  description: 'Active Camouf configuration: enabled rules, directories, languages, and layers',
  mimeType: 'application/json',
};

/**
 * Handler for reading the config resource
 */
export async function handler(): Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}> {
  const configManager = new ConfigurationManager();
  const config = await configManager.loadConfig();

  if (!config) {
    return {
      contents: [
        {
          uri: 'camouf://config',
          mimeType: 'application/json',
          text: JSON.stringify({
            found: false,
            message: 'No camouf.config.json found. Run `npx camouf init` to create one.',
            defaults: {
              languages: ['typescript', 'javascript'],
              directories: {
                client: ['src/client', 'src/components', 'src/pages'],
                server: ['src/server', 'src/api'],
                shared: ['src/shared', 'src/common'],
              },
            },
          }, null, 2),
        },
      ],
    };
  }

  // Strip unnecessary details, expose what's useful for AI
  const safeConfig = {
    found: true,
    name: config.name,
    languages: config.languages,
    directories: config.directories,
    layers: config.layers.map(l => ({
      name: l.name,
      type: l.type,
      directories: l.directories,
      allowedDependencies: l.allowedDependencies,
    })),
    rules: config.rules,
    patterns: config.patterns,
  };

  return {
    contents: [
      {
        uri: 'camouf://config',
        mimeType: 'application/json',
        text: JSON.stringify(safeConfig, null, 2),
      },
    ],
  };
}

/**
 * Export resource for use in MCP server
 */
export const configResource = {
  definition,
  handler,
};
