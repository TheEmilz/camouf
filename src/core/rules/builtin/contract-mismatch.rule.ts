/**
 * Contract Mismatch Rule
 * 
 * Detects discrepancies between API contracts (OpenAPI/GraphQL schemas) and client code.
 * This rule validates that client-side API calls match the defined server contracts.
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Types for OpenAPI Schema
// ============================================================================

interface OpenAPISchema {
  openapi?: string;
  swagger?: string;
  info?: {
    title?: string;
    version?: string;
  };
  paths?: Record<string, OpenAPIPathItem>;
  components?: {
    schemas?: Record<string, OpenAPISchemaObject>;
  };
}

interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  options?: OpenAPIOperation;
  head?: OpenAPIOperation;
  parameters?: OpenAPIParameter[];
}

interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: OpenAPISchemaObject }>;
  };
  responses?: Record<string, OpenAPIResponse>;
  deprecated?: boolean;
}

interface OpenAPIParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: OpenAPISchemaObject;
}

interface OpenAPIResponse {
  description?: string;
  content?: Record<string, { schema?: OpenAPISchemaObject }>;
}

interface OpenAPISchemaObject {
  type?: string;
  properties?: Record<string, OpenAPISchemaObject>;
  required?: string[];
  items?: OpenAPISchemaObject;
  $ref?: string;
  enum?: unknown[];
  format?: string;
}

// ============================================================================
// Types for GraphQL Schema
// ============================================================================

interface GraphQLSchema {
  queries: Map<string, GraphQLField>;
  mutations: Map<string, GraphQLField>;
  subscriptions: Map<string, GraphQLField>;
  types: Map<string, GraphQLType>;
}

interface GraphQLField {
  name: string;
  args: GraphQLArg[];
  returnType: string;
  deprecated?: boolean;
}

interface GraphQLArg {
  name: string;
  type: string;
  required: boolean;
}

interface GraphQLType {
  name: string;
  fields: Map<string, { name: string; type: string }>;
}

// ============================================================================
// Types for API Calls detected in client code
// ============================================================================

interface DetectedAPICall {
  file: string;
  line: number;
  method: string;
  path: string;
  pathParams: string[];
  queryParams: string[];
  bodyFields: string[];
  isGraphQL: boolean;
  operationName?: string;
  selectedFields?: string[];
}

// ============================================================================
// Rule Configuration
// ============================================================================

interface ContractMismatchConfig extends RuleConfig {
  /** Paths to OpenAPI spec files (supports glob) */
  openApiSpecs?: string[];
  /** Paths to GraphQL schema files */
  graphqlSchemas?: string[];
  /** Auto-detect schema files in project */
  autoDetect?: boolean;
  /** Check for deprecated endpoint usage */
  checkDeprecated?: boolean;
  /** Check for missing required parameters */
  checkRequiredParams?: boolean;
  /** Check for unknown endpoints */
  checkUnknownEndpoints?: boolean;
  /** Check for type mismatches */
  checkTypeMismatches?: boolean;
  /** Ignore patterns for API paths */
  ignorePaths?: string[];
}

// ============================================================================
// Main Rule Implementation
// ============================================================================

export class ContractMismatchRule implements IRule {
  readonly id = 'contract-mismatch';
  readonly name = 'API Contract Mismatch';
  readonly description = 'Detects discrepancies between API contracts and client code';
  readonly severity = 'error' as const;
  readonly tags = ['api', 'contract', 'openapi', 'graphql', 'validation'];
  readonly category = 'architecture' as const;

  private config: ContractMismatchConfig = {
    enabled: true,
    severity: 'error',
    autoDetect: true,
    checkDeprecated: true,
    checkRequiredParams: true,
    checkUnknownEndpoints: true,
    checkTypeMismatches: true,
    ignorePaths: ['/health', '/healthz', '/ready', '/metrics'],
  };

  private openApiSchema: OpenAPISchema | null = null;
  private graphqlSchema: GraphQLSchema | null = null;
  private schemaEndpoints: Map<string, OpenAPIOperation> = new Map();

  configure(options: Partial<ContractMismatchConfig>): void {
    this.config = { ...this.config, ...options };
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];

    // Load API schemas
    await this.loadSchemas(context.config.root);

    // If no schemas found, skip validation
    if (!this.openApiSchema && !this.graphqlSchema) {
      return { violations, metadata: { schemasFound: false } };
    }

    // Analyze each file for API calls
    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      const content = context.fileContents?.get(filePath);
      if (!content) continue;

      // Skip non-client files (likely server files)
      if (this.isServerFile(filePath)) continue;

      // Detect API calls in the file
      const apiCalls = this.detectAPICalls(filePath, content);

      // Validate each API call against schemas
      for (const call of apiCalls) {
        if (call.isGraphQL) {
          this.validateGraphQLCall(call, violations);
        } else {
          this.validateRESTCall(call, violations);
        }
      }
    }

    return { 
      violations,
      metadata: {
        schemasFound: true,
        openApiLoaded: !!this.openApiSchema,
        graphqlLoaded: !!this.graphqlSchema,
        endpointsIndexed: this.schemaEndpoints.size,
      }
    };
  }

  // ============================================================================
  // Schema Loading
  // ============================================================================

  private async loadSchemas(rootDir: string): Promise<void> {
    this.schemaEndpoints.clear();

    if (this.config.autoDetect) {
      // Auto-detect OpenAPI specs
      const openApiFiles = await this.findSchemaFiles(rootDir, [
        'openapi.json', 'openapi.yaml', 'openapi.yml',
        'swagger.json', 'swagger.yaml', 'swagger.yml',
        'api.json', 'api.yaml', 'api.yml',
        '**/openapi.json', '**/openapi.yaml', '**/swagger.json',
      ]);

      for (const file of openApiFiles) {
        await this.loadOpenAPISchema(file);
      }

      // Auto-detect GraphQL schemas
      const graphqlFiles = await this.findSchemaFiles(rootDir, [
        'schema.graphql', 'schema.gql',
        '**/schema.graphql', '**/schema.gql',
        '**/*.graphql', '**/*.gql',
      ]);

      for (const file of graphqlFiles) {
        await this.loadGraphQLSchema(file);
      }
    }

    // Load explicitly configured specs
    if (this.config.openApiSpecs) {
      for (const specPath of this.config.openApiSpecs) {
        const fullPath = path.isAbsolute(specPath) ? specPath : path.join(rootDir, specPath);
        await this.loadOpenAPISchema(fullPath);
      }
    }

    if (this.config.graphqlSchemas) {
      for (const schemaPath of this.config.graphqlSchemas) {
        const fullPath = path.isAbsolute(schemaPath) ? schemaPath : path.join(rootDir, schemaPath);
        await this.loadGraphQLSchema(fullPath);
      }
    }
  }

  private async findSchemaFiles(rootDir: string, patterns: string[]): Promise<string[]> {
    const files: string[] = [];
    
    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        // Skip glob patterns for now - would need fast-glob
        continue;
      }
      
      const fullPath = path.join(rootDir, pattern);
      try {
        await fs.access(fullPath);
        files.push(fullPath);
      } catch {
        // File doesn't exist, skip
      }
    }
    
    return files;
  }

  private async loadOpenAPISchema(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      let schema: OpenAPISchema;
      
      if (filePath.endsWith('.json')) {
        schema = JSON.parse(content);
      } else {
        // Simple YAML parsing for basic cases
        schema = this.parseSimpleYAML(content);
      }

      // Validate it's an OpenAPI/Swagger spec
      if (!schema.openapi && !schema.swagger) {
        return;
      }

      this.openApiSchema = schema;
      this.indexOpenAPIEndpoints(schema);
    } catch {
      // Failed to load schema, skip
    }
  }

  private async loadGraphQLSchema(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      this.graphqlSchema = this.parseGraphQLSchema(content);
    } catch {
      // Failed to load schema, skip
    }
  }

  private parseSimpleYAML(content: string): OpenAPISchema {
    // Simple YAML parser for basic OpenAPI specs
    // For production, would use a proper YAML parser like js-yaml
    try {
      // Try JSON first (some .yaml files are actually JSON)
      return JSON.parse(content);
    } catch {
      // Basic YAML-like parsing
      const result: OpenAPISchema = {};
      const lines = content.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('openapi:')) {
          result.openapi = line.split(':')[1].trim().replace(/['"]/g, '');
        } else if (line.startsWith('swagger:')) {
          result.swagger = line.split(':')[1].trim().replace(/['"]/g, '');
        }
      }
      
      // For proper YAML parsing, we'd need js-yaml
      // This is a simplified fallback
      return result;
    }
  }

  private parseGraphQLSchema(content: string): GraphQLSchema {
    const schema: GraphQLSchema = {
      queries: new Map(),
      mutations: new Map(),
      subscriptions: new Map(),
      types: new Map(),
    };

    // Parse type definitions
    const typePattern = /type\s+(\w+)\s*{([^}]+)}/g;
    let match;

    while ((match = typePattern.exec(content)) !== null) {
      const typeName = match[1];
      const fieldsBlock = match[2];
      
      if (typeName === 'Query') {
        this.parseGraphQLFields(fieldsBlock, schema.queries);
      } else if (typeName === 'Mutation') {
        this.parseGraphQLFields(fieldsBlock, schema.mutations);
      } else if (typeName === 'Subscription') {
        this.parseGraphQLFields(fieldsBlock, schema.subscriptions);
      } else {
        const fields = new Map<string, { name: string; type: string }>();
        const fieldPattern = /(\w+)(?:\([^)]*\))?\s*:\s*([^\n]+)/g;
        let fieldMatch;
        while ((fieldMatch = fieldPattern.exec(fieldsBlock)) !== null) {
          fields.set(fieldMatch[1], { name: fieldMatch[1], type: fieldMatch[2].trim() });
        }
        schema.types.set(typeName, { name: typeName, fields });
      }
    }

    return schema;
  }

  private parseGraphQLFields(block: string, target: Map<string, GraphQLField>): void {
    const lines = block.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    
    for (const line of lines) {
      const fieldPattern = /(\w+)(?:\(([^)]*)\))?\s*:\s*([^\n@]+)(?:@deprecated)?/;
      const match = line.match(fieldPattern);
      
      if (match) {
        const name = match[1];
        const argsStr = match[2] || '';
        const returnType = match[3].trim();
        const deprecated = line.includes('@deprecated');
        
        const args: GraphQLArg[] = [];
        if (argsStr) {
          const argPattern = /(\w+)\s*:\s*([^,)]+)/g;
          let argMatch;
          while ((argMatch = argPattern.exec(argsStr)) !== null) {
            const argType = argMatch[2].trim();
            args.push({
              name: argMatch[1],
              type: argType,
              required: argType.endsWith('!'),
            });
          }
        }
        
        target.set(name, { name, args, returnType, deprecated });
      }
    }
  }

  private indexOpenAPIEndpoints(schema: OpenAPISchema): void {
    if (!schema.paths) return;

    for (const [pathPattern, pathItem] of Object.entries(schema.paths)) {
      const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;
      
      for (const method of methods) {
        const operation = pathItem[method];
        if (operation) {
          // Combine path-level and operation-level parameters
          const params = [
            ...(pathItem.parameters || []),
            ...(operation.parameters || []),
          ];
          
          const key = `${method.toUpperCase()}:${pathPattern}`;
          this.schemaEndpoints.set(key, {
            ...operation,
            parameters: params,
          });
        }
      }
    }
  }

  // ============================================================================
  // API Call Detection
  // ============================================================================

  private detectAPICalls(filePath: string, content: string): DetectedAPICall[] {
    const calls: DetectedAPICall[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Detect fetch() calls
      const fetchCalls = this.detectFetchCalls(line, filePath, lineNum);
      calls.push(...fetchCalls);

      // Detect axios calls
      const axiosCalls = this.detectAxiosCalls(line, filePath, lineNum);
      calls.push(...axiosCalls);

      // Detect GraphQL operations
      const graphqlCalls = this.detectGraphQLCalls(line, lines, i, filePath, lineNum);
      calls.push(...graphqlCalls);

      // Detect $http, http client calls (Angular, etc.)
      const httpClientCalls = this.detectHttpClientCalls(line, filePath, lineNum);
      calls.push(...httpClientCalls);
    }

    return calls;
  }

  private detectFetchCalls(line: string, file: string, lineNum: number): DetectedAPICall[] {
    const calls: DetectedAPICall[] = [];
    
    // Pattern: fetch('/api/users') or fetch(`/api/users/${id}`)
    const fetchPattern = /fetch\s*\(\s*[`'"]([^`'"]+)[`'"]/g;
    let match;
    
    while ((match = fetchPattern.exec(line)) !== null) {
      const url = match[1];
      const parsedCall = this.parseURLCall(url, file, lineNum);
      if (parsedCall) {
        calls.push(parsedCall);
      }
    }

    // Pattern with method: fetch(url, { method: 'POST' })
    const fetchMethodPattern = /fetch\s*\([^,]+,\s*\{[^}]*method\s*:\s*[`'"](\w+)[`'"]/gi;
    while ((match = fetchMethodPattern.exec(line)) !== null) {
      // Method is captured, but URL was already captured above
      // Update the method of the last call if it exists
      if (calls.length > 0) {
        calls[calls.length - 1].method = match[1].toUpperCase();
      }
    }

    return calls;
  }

  private detectAxiosCalls(line: string, file: string, lineNum: number): DetectedAPICall[] {
    const calls: DetectedAPICall[] = [];
    
    // Pattern: axios.get('/api/users'), axios.post('/api/users', data)
    const axiosPattern = /axios\.(\w+)\s*\(\s*[`'"]([^`'"]+)[`'"]/gi;
    let match;
    
    while ((match = axiosPattern.exec(line)) !== null) {
      const method = match[1].toUpperCase();
      const url = match[2];
      
      const parsedCall = this.parseURLCall(url, file, lineNum);
      if (parsedCall) {
        parsedCall.method = method;
        calls.push(parsedCall);
      }
    }

    // Pattern: axios({ method: 'post', url: '/api/users' })
    const axiosConfigPattern = /axios\s*\(\s*\{[^}]*url\s*:\s*[`'"]([^`'"]+)[`'"][^}]*method\s*:\s*[`'"](\w+)[`'"]/gi;
    while ((match = axiosConfigPattern.exec(line)) !== null) {
      const url = match[1];
      const method = match[2].toUpperCase();
      
      const parsedCall = this.parseURLCall(url, file, lineNum);
      if (parsedCall) {
        parsedCall.method = method;
        calls.push(parsedCall);
      }
    }

    return calls;
  }

  private detectGraphQLCalls(
    line: string, 
    lines: string[], 
    lineIndex: number,
    file: string, 
    lineNum: number
  ): DetectedAPICall[] {
    const calls: DetectedAPICall[] = [];
    
    // Pattern: gql`query GetUser { ... }` or graphql`...`
    const gqlPattern = /(?:gql|graphql)\s*`([^`]+)`/gs;
    
    // Look at current line and next few lines for multi-line queries
    const context = lines.slice(lineIndex, Math.min(lineIndex + 20, lines.length)).join('\n');
    let match;
    
    while ((match = gqlPattern.exec(context)) !== null) {
      const query = match[1];
      const parsedCall = this.parseGraphQLQuery(query, file, lineNum);
      if (parsedCall) {
        calls.push(parsedCall);
      }
    }

    // Pattern: useQuery(GET_USER) - detect query variable usage
    const useQueryPattern = /use(?:Query|Mutation|Subscription)\s*\(\s*(\w+)/g;
    while ((match = useQueryPattern.exec(line)) !== null) {
      calls.push({
        file,
        line: lineNum,
        method: 'GRAPHQL',
        path: '',
        pathParams: [],
        queryParams: [],
        bodyFields: [],
        isGraphQL: true,
        operationName: match[1],
      });
    }

    return calls;
  }

  private detectHttpClientCalls(line: string, file: string, lineNum: number): DetectedAPICall[] {
    const calls: DetectedAPICall[] = [];
    
    // Pattern: this.http.get('/api/users'), httpClient.post('/api/users')
    const httpPattern = /(?:this\.)?(?:http|httpClient)\s*\.\s*(\w+)\s*(?:<[^>]*>)?\s*\(\s*[`'"]([^`'"]+)[`'"]/gi;
    let match;
    
    while ((match = httpPattern.exec(line)) !== null) {
      const method = match[1].toUpperCase();
      const url = match[2];
      
      const parsedCall = this.parseURLCall(url, file, lineNum);
      if (parsedCall) {
        parsedCall.method = method;
        calls.push(parsedCall);
      }
    }

    return calls;
  }

  private parseURLCall(url: string, file: string, line: number): DetectedAPICall | null {
    // Skip external URLs
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // Extract path from full URL
      try {
        const parsed = new URL(url);
        url = parsed.pathname + parsed.search;
      } catch {
        return null;
      }
    }

    // Skip non-API paths
    if (!url.startsWith('/') && !url.startsWith('api')) {
      return null;
    }

    // Extract path parameters (e.g., /users/${userId} or /users/:id)
    const pathParams: string[] = [];
    const pathParamPattern = /(?:\$\{(\w+)\}|:(\w+))/g;
    let match;
    while ((match = pathParamPattern.exec(url)) !== null) {
      pathParams.push(match[1] || match[2]);
    }

    // Normalize path (replace dynamic segments with placeholders)
    const normalizedPath = url
      .replace(/\$\{\w+\}/g, '{param}')
      .replace(/:\w+/g, '{param}')
      .split('?')[0]; // Remove query string

    // Extract query parameters
    const queryParams: string[] = [];
    const queryMatch = url.match(/\?(.+)$/);
    if (queryMatch) {
      const queryString = queryMatch[1];
      const paramPattern = /(\w+)=/g;
      while ((match = paramPattern.exec(queryString)) !== null) {
        queryParams.push(match[1]);
      }
    }

    return {
      file,
      line,
      method: 'GET', // Default, will be overwritten if method detected
      path: normalizedPath,
      pathParams,
      queryParams,
      bodyFields: [],
      isGraphQL: false,
    };
  }

  private parseGraphQLQuery(query: string, file: string, line: number): DetectedAPICall | null {
    // Extract operation type and name
    const operationPattern = /^\s*(query|mutation|subscription)\s+(\w+)?/i;
    const match = query.match(operationPattern);
    
    if (!match) return null;

    const operationType = match[1].toLowerCase();
    const operationName = match[2] || 'anonymous';

    // Extract selected fields
    const selectedFields: string[] = [];
    const fieldPattern = /(\w+)(?:\s*\(|(?=\s*\{)|(?=\s*\n))/g;
    let fieldMatch;
    while ((fieldMatch = fieldPattern.exec(query)) !== null) {
      const field = fieldMatch[1];
      if (!['query', 'mutation', 'subscription', operationName].includes(field)) {
        selectedFields.push(field);
      }
    }

    return {
      file,
      line,
      method: operationType.toUpperCase(),
      path: '',
      pathParams: [],
      queryParams: [],
      bodyFields: [],
      isGraphQL: true,
      operationName,
      selectedFields,
    };
  }

  // ============================================================================
  // Validation
  // ============================================================================

  private validateRESTCall(call: DetectedAPICall, violations: Violation[]): void {
    if (!this.openApiSchema) return;

    // Skip ignored paths
    if (this.config.ignorePaths?.some(p => call.path.startsWith(p))) {
      return;
    }

    // Find matching endpoint in schema
    const endpoint = this.findMatchingEndpoint(call.method, call.path);

    if (!endpoint) {
      if (this.config.checkUnknownEndpoints) {
        violations.push(this.createViolation(
          call.file,
          `API call to undefined endpoint: ${call.method} ${call.path}`,
          call.line,
          'Verify the endpoint exists in your OpenAPI specification or add it if missing'
        ));
      }
      return;
    }

    // Check for deprecated endpoint
    if (this.config.checkDeprecated && endpoint.deprecated) {
      violations.push(this.createViolation(
        call.file,
        `Call to deprecated endpoint: ${call.method} ${call.path}`,
        call.line,
        'This endpoint is marked as deprecated. Consider using the replacement API'
      ));
    }

    // Check required parameters
    if (this.config.checkRequiredParams && endpoint.parameters) {
      const requiredParams = endpoint.parameters.filter(p => p.required);
      
      for (const param of requiredParams) {
        if (param.in === 'path') {
          // Path params are usually always provided via template literals
          continue;
        }
        
        if (param.in === 'query' && !call.queryParams.includes(param.name)) {
          violations.push(this.createViolation(
            call.file,
            `Missing required query parameter '${param.name}' for ${call.method} ${call.path}`,
            call.line,
            `Add the required parameter: ?${param.name}=value`
          ));
        }
      }
    }
  }

  private validateGraphQLCall(call: DetectedAPICall, violations: Violation[]): void {
    if (!this.graphqlSchema) return;

    const operationType = call.method.toLowerCase();
    let operations: Map<string, GraphQLField>;

    switch (operationType) {
      case 'query':
        operations = this.graphqlSchema.queries;
        break;
      case 'mutation':
        operations = this.graphqlSchema.mutations;
        break;
      case 'subscription':
        operations = this.graphqlSchema.subscriptions;
        break;
      default:
        return;
    }

    // Check if selected fields exist in schema
    if (call.selectedFields) {
      for (const field of call.selectedFields) {
        if (!operations.has(field) && !this.isScalarField(field)) {
          if (this.config.checkUnknownEndpoints) {
            violations.push(this.createViolation(
              call.file,
              `GraphQL ${operationType} references undefined field: ${field}`,
              call.line,
              `Verify the field '${field}' exists in your GraphQL schema`
            ));
          }
        }

        // Check for deprecated fields
        const operation = operations.get(field);
        if (operation?.deprecated && this.config.checkDeprecated) {
          violations.push(this.createViolation(
            call.file,
            `GraphQL ${operationType} uses deprecated field: ${field}`,
            call.line,
            `The field '${field}' is marked as @deprecated. Consider using the replacement`
          ));
        }
      }
    }
  }

  private findMatchingEndpoint(method: string, path: string): OpenAPIOperation | null {
    // Try exact match first
    const exactKey = `${method}:${path}`;
    if (this.schemaEndpoints.has(exactKey)) {
      return this.schemaEndpoints.get(exactKey)!;
    }

    // Try pattern matching for path parameters
    for (const [key, operation] of this.schemaEndpoints) {
      const [keyMethod, keyPath] = key.split(':');
      if (keyMethod !== method) continue;

      // Convert OpenAPI path pattern to regex
      const pathRegex = new RegExp(
        '^' + keyPath
          .replace(/\{[^}]+\}/g, '[^/]+')
          .replace(/\//g, '\\/') + '$'
      );

      const normalizedCallPath = path.replace(/\{param\}/g, 'placeholder');
      
      if (pathRegex.test(normalizedCallPath)) {
        return operation;
      }
    }

    return null;
  }

  private isScalarField(field: string): boolean {
    const scalarFields = ['id', '__typename', 'createdAt', 'updatedAt'];
    return scalarFields.includes(field);
  }

  private isServerFile(filePath: string): boolean {
    const serverPatterns = [
      /controller/i,
      /handler/i,
      /resolver/i,
      /route/i,
      /server/i,
      /api\//i,
      /backend/i,
      /\.spec\./i,
      /\.test\./i,
    ];

    return serverPatterns.some(pattern => pattern.test(filePath));
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private createViolation(
    file: string, 
    message: string, 
    line: number, 
    suggestion?: string
  ): Violation {
    return {
      id: `${this.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId: this.id,
      ruleName: this.name,
      severity: 'error',
      message,
      file,
      line,
      suggestion,
    };
  }
}
