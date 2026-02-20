/**
 * Async Discrepancies Rule
 * 
 * Detects async/await misuse patterns commonly introduced by AI coding assistants.
 * These discrepancies arise when AI agents lose context about whether a function
 * is synchronous or asynchronous, leading to subtle runtime bugs.
 * 
 * Detections:
 * 1. Missing `await` on async function calls
 * 2. `async` functions that never use `await` (unnecessary async)
 * 3. Async/sync signature drift between declaration and usage
 * 4. Floating promises (async calls without await or .then/.catch)
 * 5. `await` on non-async/non-promise expressions
 * 6. Mixed async patterns (mixing callbacks with async/await)
 */

import { IRule, RuleContext, RuleConfig, RuleResult, RuleCategory, RuleDocumentation } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';

interface AsyncDiscrepanciesConfig extends RuleConfig {
  /** Check for missing await on async calls */
  checkMissingAwait?: boolean;
  /** Check for unnecessary async keywords */
  checkUnnecessaryAsync?: boolean;
  /** Check for floating promises (unawaited async calls) */
  checkFloatingPromises?: boolean;
  /** Check for await on non-promise values */
  checkAwaitNonPromise?: boolean;
  /** Check for mixed async patterns (callbacks + async/await) */
  checkMixedPatterns?: boolean;
  /** File extensions to analyze */
  includeExtensions?: string[];
  /** Ignore patterns for function names */
  ignorePatterns?: string[];
}

interface AsyncFunctionInfo {
  name: string;
  file: string;
  line: number;
  hasAwaitInBody: boolean;
  returnsPromise: boolean;
  bodyStartLine: number;
  bodyEndLine: number;
}

interface FunctionCallInfo {
  name: string;
  file: string;
  line: number;
  isAwaited: boolean;
  isInThenChain: boolean;
  isInCatchChain: boolean;
  isVoidPrefixed: boolean;
  isAssignedOrReturned: boolean;
}

export class AsyncDiscrepanciesRule implements IRule {
  readonly id = 'async-discrepancies';
  readonly name = 'Async Discrepancies Detection';
  readonly description = 'Detects async/await misuse patterns commonly introduced by AI coding assistants';
  readonly severity = 'warning' as const;
  readonly tags = ['ai-safety', 'async', 'promises', 'correctness'];
  readonly category: RuleCategory = 'ai-specific';
  readonly supportsIncremental = true;
  readonly defaultSeverity = 'warning' as const;

  private config: AsyncDiscrepanciesConfig = {
    enabled: true,
    severity: 'warning',
    checkMissingAwait: true,
    checkUnnecessaryAsync: true,
    checkFloatingPromises: true,
    checkAwaitNonPromise: true,
    checkMixedPatterns: true,
    includeExtensions: ['.ts', '.tsx', '.js', '.jsx'],
    ignorePatterns: [
      '^_',              // Private/internal
      '^main$',          // Entry points
      '^bootstrap$',     // Bootstrap functions
      'Middleware$',     // Middleware (often async by convention)
      'Handler$',        // Handlers (often async by convention)
      'Controller$',     // Controllers
    ],
  };

  private violationCounter = 0;

  /** Known async functions discovered across the project */
  private knownAsyncFunctions = new Map<string, AsyncFunctionInfo>();

  configure(options: Partial<AsyncDiscrepanciesConfig>): void {
    this.config = { ...this.config, ...options };
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];
    this.violationCounter = 0;
    this.knownAsyncFunctions.clear();

    const fileContents: Array<{ filePath: string; content: string }> = [];

    // First pass: collect all async function declarations
    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      if (!this.shouldAnalyzeFile(filePath)) continue;

      const content = context.fileContents?.get(filePath);
      if (!content) continue;

      fileContents.push({ filePath, content });
      this.collectAsyncFunctions(filePath, content);
    }

    // Second pass: detect discrepancies
    for (const { filePath, content } of fileContents) {
      if (this.config.checkUnnecessaryAsync) {
        this.checkUnnecessaryAsyncFunctions(filePath, content, violations);
      }

      if (this.config.checkFloatingPromises || this.config.checkMissingAwait) {
        this.checkFloatingPromisesAndMissingAwait(filePath, content, violations);
      }

      if (this.config.checkAwaitNonPromise) {
        this.checkAwaitOnNonPromise(filePath, content, violations);
      }

      if (this.config.checkMixedPatterns) {
        this.checkMixedAsyncPatterns(filePath, content, violations);
      }
    }

    return { violations };
  }

  async checkFile(filePath: string, context: RuleContext): Promise<RuleResult> {
    // For incremental checks, run the full check (we need cross-file context)
    return this.check(context);
  }

  getDocumentation(): RuleDocumentation {
    return {
      summary: this.description,
      details: `This rule detects async/await discrepancies that AI coding assistants commonly introduce
when they lose context about function signatures. These bugs are particularly insidious because
they often don't cause immediate errors but lead to race conditions, unhandled promise rejections,
and subtle data corruption.`,
      examples: [
        {
          title: 'Unnecessary async function',
          bad: `async function getUser(id: string) {
  return users.find(u => u.id === id); // No await needed
}`,
          good: `function getUser(id: string) {
  return users.find(u => u.id === id);
}`,
          explanation: 'Function marked as async but never uses await. This wraps the return value in an unnecessary Promise.',
        },
        {
          title: 'Missing await on async call',
          bad: `async function processOrder(orderId: string) {
  const order = getOrderById(orderId); // Missing await!
  console.log(order.status); // order is a Promise, not the actual value
}`,
          good: `async function processOrder(orderId: string) {
  const order = await getOrderById(orderId);
  console.log(order.status);
}`,
          explanation: 'Calling an async function without await returns a Promise instead of the resolved value.',
        },
        {
          title: 'Floating promise',
          bad: `function handleRequest(req: Request) {
  saveToDatabase(req.body); // Floating promise - errors silently swallowed
  return { success: true };
}`,
          good: `async function handleRequest(req: Request) {
  await saveToDatabase(req.body);
  return { success: true };
}`,
          explanation: 'Async function called without await, .then(), or .catch() — errors will be silently lost.',
        },
        {
          title: 'Mixed async patterns',
          bad: `async function fetchData() {
  const result = await fetch('/api/data');
  result.json().then(data => {
    processData(data); // Mixing await with .then()
  });
}`,
          good: `async function fetchData() {
  const result = await fetch('/api/data');
  const data = await result.json();
  processData(data);
}`,
          explanation: 'Mixing await and .then() in the same function creates confusing control flow.',
        },
      ],
      options: [
        { name: 'checkMissingAwait', type: 'boolean', description: 'Check for missing await on async function calls', default: true },
        { name: 'checkUnnecessaryAsync', type: 'boolean', description: 'Detect async functions that never use await', default: true },
        { name: 'checkFloatingPromises', type: 'boolean', description: 'Detect unawaited async calls (floating promises)', default: true },
        { name: 'checkAwaitNonPromise', type: 'boolean', description: 'Detect await on values that are not Promises', default: true },
        { name: 'checkMixedPatterns', type: 'boolean', description: 'Detect mixing of callbacks with async/await', default: true },
      ],
      relatedRules: ['function-signature-matching', 'performance-antipatterns'],
    };
  }

  // ─── Detection: Collect async function declarations ─────────────────

  private collectAsyncFunctions(filePath: string, content: string): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match: async function name(...)
      const asyncFnMatch = line.match(/\basync\s+function\s+(\w+)\s*\(/);
      if (asyncFnMatch) {
        const info = this.buildAsyncFunctionInfo(asyncFnMatch[1], filePath, i, lines);
        if (info) this.knownAsyncFunctions.set(info.name, info);
        continue;
      }

      // Match: export async function name(...)
      const exportAsyncFnMatch = line.match(/\bexport\s+(?:default\s+)?async\s+function\s+(\w+)\s*\(/);
      if (exportAsyncFnMatch) {
        const info = this.buildAsyncFunctionInfo(exportAsyncFnMatch[1], filePath, i, lines);
        if (info) this.knownAsyncFunctions.set(info.name, info);
        continue;
      }

      // Match: const name = async (...) => or const name = async function(...)
      const arrowAsyncMatch = line.match(/\b(?:const|let|var)\s+(\w+)\s*=\s*async\s/);
      if (arrowAsyncMatch) {
        const info = this.buildAsyncFunctionInfo(arrowAsyncMatch[1], filePath, i, lines);
        if (info) this.knownAsyncFunctions.set(info.name, info);
        continue;
      }

      // Match: async methodName(...)  inside a class
      const asyncMethodMatch = line.match(/^\s+(?:public\s+|private\s+|protected\s+)?(?:static\s+)?async\s+(\w+)\s*\(/);
      if (asyncMethodMatch && asyncMethodMatch[1] !== 'function') {
        const info = this.buildAsyncFunctionInfo(asyncMethodMatch[1], filePath, i, lines);
        if (info) this.knownAsyncFunctions.set(info.name, info);
      }
    }
  }

  private buildAsyncFunctionInfo(
    name: string,
    filePath: string,
    startLine: number,
    lines: string[]
  ): AsyncFunctionInfo | null {
    // Find the function body boundaries
    let braceCount = 0;
    let bodyStartLine = startLine;
    let bodyEndLine = startLine;
    let foundBody = false;
    let hasAwaitInBody = false;
    let returnsPromise = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      
      // Check return type annotation for Promise
      if (i === startLine || i === startLine + 1) {
        if (/:\s*Promise\s*</.test(line)) {
          returnsPromise = true;
        }
      }

      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;

      if (openBraces > 0 && !foundBody) {
        foundBody = true;
        bodyStartLine = i;
      }

      braceCount += openBraces - closeBraces;

      // Check for await usage in the body
      if (foundBody && /\bawait\s/.test(line)) {
        hasAwaitInBody = true;
      }

      if (foundBody && braceCount <= 0) {
        bodyEndLine = i;
        break;
      }
    }

    if (!foundBody) return null;

    return {
      name,
      file: filePath,
      line: startLine + 1,
      hasAwaitInBody,
      returnsPromise,
      bodyStartLine: bodyStartLine + 1,
      bodyEndLine: bodyEndLine + 1,
    };
  }

  // ─── Detection 1: Unnecessary async functions ──────────────────────

  private checkUnnecessaryAsyncFunctions(
    filePath: string,
    _content: string,
    violations: Violation[]
  ): void {
    for (const [name, info] of this.knownAsyncFunctions) {
      if (info.file !== filePath) continue;
      if (this.shouldIgnoreFunction(name)) continue;

      // async function that never uses await and doesn't explicitly return Promise
      if (!info.hasAwaitInBody && !info.returnsPromise) {
        violations.push(this.createViolation(
          filePath,
          `Function '${name}' is declared async but never uses 'await'`,
          info.line,
          `Remove the 'async' keyword if the function doesn't need to await any asynchronous operations. ` +
          `Unnecessary async wraps the return value in a Promise, adding overhead and misleading callers.`
        ));
      }
    }
  }

  // ─── Detection 2: Floating promises & missing await ────────────────

  private checkFloatingPromisesAndMissingAwait(
    filePath: string,
    content: string,
    violations: Violation[]
  ): void {
    const lines = content.split('\n');

    // Build set of known async function names for this project
    const asyncFunctionNames = new Set<string>();
    for (const [name] of this.knownAsyncFunctions) {
      asyncFunctionNames.add(name);
    }

    // Also add common async APIs
    const commonAsyncApis = new Set([
      'fetch', 'axios', 'request',
      'readFile', 'writeFile', 'readdir', 'mkdir', 'unlink', 'stat',
      'findOne', 'findMany', 'findById', 'findAll',
      'create', 'update', 'delete', 'save', 'remove',
      'query', 'execute', 'transaction',
      'connect', 'disconnect', 'close',
      'send', 'sendMail', 'publish', 'subscribe',
    ]);

    // Track whether we're inside an async function
    let inAsyncFunction = false;
    let asyncBraceDepth = 0;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed === '') {
        continue;
      }

      // Track async function scope
      if (/\basync\s+(function\s+\w+|(\w+)\s*=\s*async|\w+\s*\()/.test(line) || 
          /\basync\s+\w+\s*\(/.test(line)) {
        inAsyncFunction = true;
        asyncBraceDepth = braceCount;
      }

      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceCount += openBraces - closeBraces;

      if (inAsyncFunction && braceCount <= asyncBraceDepth) {
        inAsyncFunction = false;
      }

      // Look for function calls that are known async but not awaited
      for (const asyncName of asyncFunctionNames) {
        // Pattern: bare call statement — functionName(...) not preceded by await, return, or assignment
        const callPattern = new RegExp(`(?<!\\bawait\\s)(?<!\\breturn\\s)(?<!=\\s)(?<!\\bvoid\\s)\\b${this.escapeRegex(asyncName)}\\s*\\(`, 'g');
        
        if (callPattern.test(trimmed)) {
          // Make sure it's a standalone statement (not part of assignment or return)
          const isAssigned = /(?:const|let|var|=)\s*.*\b/.test(trimmed.split(asyncName)[0] || '');
          const isReturned = trimmed.startsWith('return ');
          const isAwaited = new RegExp(`\\bawait\\s+.*\\b${this.escapeRegex(asyncName)}`).test(trimmed);
          const isChained = new RegExp(`${this.escapeRegex(asyncName)}\\s*\\([^)]*\\)\\s*\\.\\s*(then|catch|finally)\\b`).test(trimmed);
          const isVoid = trimmed.startsWith('void ');

          if (!isAssigned && !isReturned && !isAwaited && !isChained && !isVoid) {
            violations.push(this.createViolation(
              filePath,
              `Async function '${asyncName}()' called without 'await', '.then()', or error handling — floating promise`,
              i + 1,
              inAsyncFunction
                ? `Add 'await' before '${asyncName}()' to properly handle its result and errors.`
                : `Either await this call inside an async function, or chain '.then().catch()' to handle the promise.`
            ));
          }
        }
      }

      // Check for common async API calls without await in async functions
      if (inAsyncFunction) {
        for (const apiName of commonAsyncApis) {
          // More conservative: only flag when it looks like a standalone statement
          const stmtPattern = new RegExp(`^\\s*(?:\\w+\\.)?${this.escapeRegex(apiName)}\\s*\\(`);
          if (stmtPattern.test(trimmed)) {
            const isAwaited = new RegExp(`\\bawait\\b`).test(trimmed);
            const isAssigned = /(?:const|let|var)\s+\w+\s*=/.test(trimmed);
            const isReturned = trimmed.startsWith('return ');
            const isChained = /\)\s*\.\s*(then|catch|finally)\b/.test(trimmed);

            if (!isAwaited && !isAssigned && !isReturned && !isChained) {
              violations.push(this.createViolation(
                filePath,
                `Potential floating promise: '${apiName}()' called without 'await' in async function`,
                i + 1,
                `Add 'await' before '${apiName}()' to ensure proper execution order and error propagation.`
              ));
            }
          }
        }
      }
    }
  }

  // ─── Detection 3: await on non-promise values ──────────────────────

  private checkAwaitOnNonPromise(
    filePath: string,
    content: string,
    violations: Violation[]
  ): void {
    const lines = content.split('\n');

    // Patterns that are clearly not promises
    const nonPromisePatterns = [
      // await on literal values
      /\bawait\s+(['"`])/,                          // await "string", await `template`
      /\bawait\s+\d+/,                              // await 42
      /\bawait\s+(true|false|null|undefined)\b/,    // await true/false/null/undefined
      /\bawait\s+\[(?!\s*\.\.\.)(?!.*Promise)/,     // await [array] (not Promise.all style)
      /\bawait\s+{\s*\w+/,                          // await {object}
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      for (const pattern of nonPromisePatterns) {
        if (pattern.test(trimmed)) {
          violations.push(this.createViolation(
            filePath,
            `Suspicious 'await' on a value that is likely not a Promise`,
            i + 1,
            `'await' on non-Promise values is unnecessary and may indicate AI-generated code that ` +
            `confused sync and async APIs. Remove 'await' if the expression doesn't return a Promise.`
          ));
          break;
        }
      }
    }
  }

  // ─── Detection 4: Mixed async patterns ─────────────────────────────

  private checkMixedAsyncPatterns(
    filePath: string,
    content: string,
    violations: Violation[]
  ): void {
    const lines = content.split('\n');

    // Track function scopes to detect mixing
    let inAsyncFunction = false;
    let asyncFuncStartLine = 0;
    let asyncBraceDepth = 0;
    let braceCount = 0;
    let hasAwait = false;
    let hasThenCatch = false;
    let hasCallback = false;
    let thenLine = 0;
    let callbackLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Detect async function start
      if (/\basync\s+(?:function\s+\w+|\w+\s*=\s*async|\(\s*\w)|\basync\s+\w+\s*\(/.test(line)) {
        // Report previous function if mixed
        if (inAsyncFunction) {
          this.reportMixedPatterns(filePath, asyncFuncStartLine, hasAwait, hasThenCatch, hasCallback, thenLine, callbackLine, violations);
        }
        inAsyncFunction = true;
        asyncFuncStartLine = i + 1;
        asyncBraceDepth = braceCount;
        hasAwait = false;
        hasThenCatch = false;
        hasCallback = false;
        thenLine = 0;
        callbackLine = 0;
      }

      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceCount += openBraces - closeBraces;

      if (inAsyncFunction) {
        if (/\bawait\s/.test(trimmed)) hasAwait = true;
        if (/\.\s*then\s*\(/.test(trimmed)) { hasThenCatch = true; thenLine = i + 1; }
        // Detect callback patterns: function(err, result) or (err, data) =>
        if (/\(err(?:or)?\s*,\s*\w+\)\s*(?:=>|{)/.test(trimmed) ||
            /function\s*\(\s*err(?:or)?\s*,/.test(trimmed)) {
          hasCallback = true;
          callbackLine = i + 1;
        }
      }

      if (inAsyncFunction && braceCount <= asyncBraceDepth) {
        this.reportMixedPatterns(filePath, asyncFuncStartLine, hasAwait, hasThenCatch, hasCallback, thenLine, callbackLine, violations);
        inAsyncFunction = false;
      }
    }

    // Handle last function
    if (inAsyncFunction) {
      this.reportMixedPatterns(filePath, asyncFuncStartLine, hasAwait, hasThenCatch, hasCallback, thenLine, callbackLine, violations);
    }
  }

  private reportMixedPatterns(
    filePath: string,
    funcStartLine: number,
    hasAwait: boolean,
    hasThenCatch: boolean,
    hasCallback: boolean,
    thenLine: number,
    callbackLine: number,
    violations: Violation[]
  ): void {
    if (hasAwait && hasThenCatch) {
      violations.push(this.createViolation(
        filePath,
        `Mixed async patterns: function uses both 'await' and '.then()' chains`,
        thenLine || funcStartLine,
        `Convert '.then()' chains to 'await' for consistent async style. ` +
        `Mixing patterns makes control flow harder to follow and may indicate AI-generated code drift.`
      ));
    }

    if (hasAwait && hasCallback) {
      violations.push(this.createViolation(
        filePath,
        `Mixed async patterns: function uses both 'await' and error-first callbacks`,
        callbackLine || funcStartLine,
        `Convert callback-style code to async/await using 'util.promisify()' or manual Promise wrapping. ` +
        `Mixing callbacks with async/await often indicates AI context confusion.`
      ));
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private shouldAnalyzeFile(filePath: string): boolean {
    const extensions = this.config.includeExtensions || ['.ts', '.tsx', '.js', '.jsx'];
    return extensions.some(ext => filePath.endsWith(ext));
  }

  private shouldIgnoreFunction(name: string): boolean {
    const patterns = this.config.ignorePatterns || [];
    return patterns.some(pattern => new RegExp(pattern).test(name));
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private createViolation(
    file: string,
    message: string,
    line: number,
    suggestion?: string
  ): Violation {
    this.violationCounter++;
    return {
      id: `async-discrepancies-${this.violationCounter}`,
      ruleId: this.id,
      ruleName: this.name,
      severity: this.config.severity || 'warning',
      message,
      file,
      line,
      suggestion,
    };
  }
}
