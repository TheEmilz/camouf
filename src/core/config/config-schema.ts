/**
 * Configuration Schema
 * 
 * JSON Schema for validating Camouf configuration files.
 */

export const configSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['root', 'languages', 'directories'],
  properties: {
    name: {
      type: 'string',
      description: 'Project name',
    },
    root: {
      type: 'string',
      description: 'Root directory of the project',
    },
    languages: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['typescript', 'javascript', 'python', 'java', 'go', 'rust', 'csharp', 'kotlin'],
      },
      minItems: 1,
      description: 'Languages to analyze',
    },
    layers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'type', 'directories', 'allowedDependencies'],
        properties: {
          name: {
            type: 'string',
          },
          type: {
            type: 'string',
            enum: ['presentation', 'application', 'domain', 'infrastructure', 'shared', 'custom'],
          },
          directories: {
            type: 'array',
            items: { type: 'string' },
          },
          allowedDependencies: {
            type: 'array',
            items: { type: 'string' },
          },
          forbiddenDependencies: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      description: 'Architecture layer definitions',
    },
    directories: {
      type: 'object',
      required: ['client', 'server', 'shared'],
      properties: {
        client: {
          type: 'array',
          items: { type: 'string' },
        },
        server: {
          type: 'array',
          items: { type: 'string' },
        },
        shared: {
          type: 'array',
          items: { type: 'string' },
        },
        tests: {
          type: 'array',
          items: { type: 'string' },
        },
        custom: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
    rules: {
      type: 'object',
      properties: {
        builtin: {
          type: 'object',
          additionalProperties: {
            oneOf: [
              { type: 'string', enum: ['off', 'warn', 'error'] },
              {
                type: 'object',
                properties: {
                  level: { type: 'string', enum: ['off', 'warn', 'error'] },
                  options: { type: 'object' },
                },
                required: ['level'],
              },
            ],
          },
        },
        custom: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name', 'level'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              level: { type: 'string', enum: ['warn', 'error'] },
              path: { type: 'string' },
              declarative: {
                type: 'object',
                required: ['type', 'pattern', 'target', 'action', 'message'],
                properties: {
                  type: { type: 'string', enum: ['import', 'dependency', 'naming', 'structure'] },
                  pattern: { type: 'string' },
                  target: { type: 'string' },
                  action: { type: 'string', enum: ['allow', 'deny'] },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        settings: {
          type: 'object',
          properties: {
            maxCircularDepth: { type: 'number', minimum: 1 },
            excludePatterns: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
    parsers: {
      type: 'object',
      properties: {
        typescript: {
          type: 'object',
          properties: {
            tsConfigPath: { type: 'string' },
            strict: { type: 'boolean' },
          },
        },
        python: {
          type: 'object',
          properties: {
            version: { type: 'string', enum: ['2', '3'] },
          },
        },
        java: {
          type: 'object',
          properties: {
            sourceVersion: { type: 'string' },
          },
        },
      },
    },
    patterns: {
      type: 'object',
      required: ['include', 'exclude'],
      properties: {
        include: {
          type: 'array',
          items: { type: 'string' },
        },
        exclude: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
    output: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['text', 'json', 'sarif', 'html'] },
        directory: { type: 'string' },
        showCode: { type: 'boolean' },
      },
    },
    advanced: {
      type: 'object',
      properties: {
        cache: { type: 'boolean' },
        cacheDirectory: { type: 'string' },
        maxWorkers: { type: 'number', minimum: 1 },
        debug: { type: 'boolean' },
      },
    },
  },
};
