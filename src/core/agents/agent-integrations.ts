/**
 * Agent Integrations
 * 
 * Generates configuration files for CLI agent tools:
 * - Claude Code: CLAUDE.md + .claude/commands/*.md
 * - OpenAI Codex: AGENTS.md
 * 
 * These files allow AI coding agents to understand and use Camouf
 * natively within their workflow.
 */

import * as fs from 'fs';
import * as path from 'path';

export type AgentType = 'claude' | 'codex' | 'all';

interface AgentIntegrationResult {
  filesCreated: string[];
  filesSkipped: string[];
}

/**
 * Generate agent integration files for the specified agent type
 */
export async function generateAgentIntegration(
  projectRoot: string,
  agentType: AgentType,
  options: { force?: boolean } = {}
): Promise<AgentIntegrationResult> {
  const result: AgentIntegrationResult = { filesCreated: [], filesSkipped: [] };

  if (agentType === 'claude' || agentType === 'all') {
    await generateClaudeIntegration(projectRoot, result, options);
  }

  if (agentType === 'codex' || agentType === 'all') {
    await generateCodexIntegration(projectRoot, result, options);
  }

  return result;
}

/**
 * Generate Claude Code integration files:
 * - CLAUDE.md (project instructions)
 * - .claude/commands/camouf-validate.md (slash command)
 */
async function generateClaudeIntegration(
  projectRoot: string,
  result: AgentIntegrationResult,
  options: { force?: boolean }
): Promise<void> {
  // 1. Generate CLAUDE.md
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath) || options.force) {
    fs.writeFileSync(claudeMdPath, getClaudeMdContent());
    result.filesCreated.push('CLAUDE.md');
  } else {
    // Append Camouf section if not present
    const existing = fs.readFileSync(claudeMdPath, 'utf-8');
    if (!existing.includes('## Camouf')) {
      fs.appendFileSync(claudeMdPath, '\n\n' + getCamoufClaudeSection());
      result.filesCreated.push('CLAUDE.md (appended)');
    } else {
      result.filesSkipped.push('CLAUDE.md (already has Camouf section)');
    }
  }

  // 2. Generate .claude/commands/camouf-validate.md
  const claudeCommandsDir = path.join(projectRoot, '.claude', 'commands');
  if (!fs.existsSync(claudeCommandsDir)) {
    fs.mkdirSync(claudeCommandsDir, { recursive: true });
  }

  const validateCommandPath = path.join(claudeCommandsDir, 'camouf-validate.md');
  if (!fs.existsSync(validateCommandPath) || options.force) {
    fs.writeFileSync(validateCommandPath, getClaudeValidateCommand());
    result.filesCreated.push('.claude/commands/camouf-validate.md');
  } else {
    result.filesSkipped.push('.claude/commands/camouf-validate.md');
  }

  // 3. Generate .claude/commands/camouf-fix.md
  const fixCommandPath = path.join(claudeCommandsDir, 'camouf-fix.md');
  if (!fs.existsSync(fixCommandPath) || options.force) {
    fs.writeFileSync(fixCommandPath, getClaudeFixCommand());
    result.filesCreated.push('.claude/commands/camouf-fix.md');
  } else {
    result.filesSkipped.push('.claude/commands/camouf-fix.md');
  }

  // 3b. Generate .claude/commands/camouf-fix-signatures.md
  const fixSignaturesCommandPath = path.join(claudeCommandsDir, 'camouf-fix-signatures.md');
  if (!fs.existsSync(fixSignaturesCommandPath) || options.force) {
    fs.writeFileSync(fixSignaturesCommandPath, getClaudeFixSignaturesCommand());
    result.filesCreated.push('.claude/commands/camouf-fix-signatures.md');
  } else {
    result.filesSkipped.push('.claude/commands/camouf-fix-signatures.md');
  }

  // 4. Generate .claude/rules/camouf.md
  const claudeRulesDir = path.join(projectRoot, '.claude', 'rules');
  if (!fs.existsSync(claudeRulesDir)) {
    fs.mkdirSync(claudeRulesDir, { recursive: true });
  }

  const camoufRulePath = path.join(claudeRulesDir, 'camouf.md');
  if (!fs.existsSync(camoufRulePath) || options.force) {
    fs.writeFileSync(camoufRulePath, getClaudeRule());
    result.filesCreated.push('.claude/rules/camouf.md');
  } else {
    result.filesSkipped.push('.claude/rules/camouf.md');
  }
}

/**
 * Generate OpenAI Codex integration files:
 * - AGENTS.md (project instructions)
 */
async function generateCodexIntegration(
  projectRoot: string,
  result: AgentIntegrationResult,
  options: { force?: boolean }
): Promise<void> {
  const agentsMdPath = path.join(projectRoot, 'AGENTS.md');
  
  if (!fs.existsSync(agentsMdPath) || options.force) {
    fs.writeFileSync(agentsMdPath, getAgentsMdContent());
    result.filesCreated.push('AGENTS.md');
  } else {
    // Append Camouf section if not present
    const existing = fs.readFileSync(agentsMdPath, 'utf-8');
    if (!existing.includes('## Camouf')) {
      fs.appendFileSync(agentsMdPath, '\n\n' + getCamoufAgentsSection());
      result.filesCreated.push('AGENTS.md (appended)');
    } else {
      result.filesSkipped.push('AGENTS.md (already has Camouf section)');
    }
  }
}

// ─── Template Content Functions ──────────────────────────────────────────────

function getClaudeMdContent(): string {
  return `# Project Instructions

## Camouf — Architecture Monitoring

This project uses [Camouf](https://www.npmjs.com/package/camouf) for real-time architecture monitoring.
Camouf enforces architecture rules (layer dependencies, circular dependencies, security, DDD boundaries, and more).

### How to Run Camouf

**Always use \`npx camouf\` to invoke the CLI.** Do NOT use \`node camouf.js\` or \`camouf\` directly.

\`\`\`bash
# One-shot validation (JSON output for parsing)
npx camouf validate --format json --ci

# One-shot validation (human-readable)
npx camouf validate --ci

# Watch mode (real-time)
npx camouf watch --ci
\`\`\`

### Architecture Rules

Camouf validates 12 builtin rules (configured in \`camouf.config.json\`):

| Rule | What it enforces |
|------|-----------------|
| \`layer-dependencies\` | Layers can only import from allowed layers |
| \`circular-dependencies\` | No circular import chains |
| \`hardcoded-secrets\` | No API keys, tokens, or credentials in code |
| \`security-context\` | Routes/endpoints must have auth guards |
| \`performance-antipatterns\` | No N+1 queries, sync I/O, memory leaks |
| \`type-safety\` | No unsafe \`any\`, type assertions, non-null assertions |
| \`ddd-boundaries\` | Bounded contexts must not leak across domains |
| \`api-versioning\` | API endpoints must include version prefix |
| \`data-flow-integrity\` | Input validation and output sanitization required |
| \`contract-mismatch\` | Shared types must be consistent across layers |
| \`function-signature-matching\` | Function names and parameters must match across frontend/backend |
| \`distributed-transactions\` | Multi-service calls need saga/compensation |
| \`resilience-patterns\` | HTTP calls need timeout, retry, circuit breaker |

### Workflow for Code Changes

1. Before committing, run \`npx camouf validate --format json --ci\`
2. Fix any violations before pushing
3. If a violation is a false positive, add it to the \`exclude\` patterns in \`camouf.config.json\`

### Output Formats

- \`--format text\` — Human-readable (default)
- \`--format json\` — Machine-parseable JSON with violations array
- \`--format sarif\` — SARIF standard for security tools
- \`--format vscode\` — VS Code Problems panel format
- \`--ci\` — Suppresses spinners/colors for non-interactive use

### Exit Codes

- \`0\` — No violations found
- \`1\` — Violations found (or error)
`;
}

function getCamoufClaudeSection(): string {
  return `## Camouf — Architecture Monitoring

This project uses [Camouf](https://www.npmjs.com/package/camouf) for architecture monitoring.

**Always use \`npx camouf\` to invoke the CLI.** Do NOT use \`node camouf.js\` or \`camouf\` directly.

### Quick Commands

\`\`\`bash
npx camouf validate --format json --ci    # JSON output for parsing
npx camouf validate --ci                  # Human-readable output
\`\`\`

### Workflow

- Run \`npx camouf validate --format json --ci\` before committing to check for architecture violations
- Fix violations before pushing
- Configuration is in \`camouf.config.json\`
- Exit code 0 = clean, 1 = violations found
`;
}

function getClaudeValidateCommand(): string {
  return `---
description: Run Camouf architecture validation and fix any violations found
allowed-tools: Read, Grep, Bash, Write
---

Run Camouf to validate the project architecture.

**Important**: Always use \`npx camouf\` to run Camouf. Do NOT use \`node camouf.js\` or bare \`camouf\`.

1. Execute: \`npx camouf validate --format json --ci\`
2. Parse the JSON output to identify violations
3. For each violation:
   - Read the file at the specified line
   - Understand the rule that was violated
   - Apply the suggested fix
4. Re-run validation to confirm fixes
5. Report a summary of what was fixed

Important:
- Use \`--format json\` so the output is machine-parseable
- Use \`--ci\` to suppress spinners and colors
- Exit code 0 means no violations, 1 means violations exist
- The JSON output has a \`violations\` array with \`file\`, \`line\`, \`ruleId\`, \`message\`, and \`suggestion\` fields
`;
}

function getClaudeFixCommand(): string {
  return `---
description: Run Camouf and automatically fix all architecture violations
allowed-tools: Read, Grep, Bash, Write
---

Run Camouf to find and fix architecture violations.

**Important**: Always use \`npx camouf\` to run Camouf. Do NOT use \`node camouf.js\` or bare \`camouf\`.

1. Execute: \`npx camouf validate --format json --ci\`
2. Parse the JSON output
3. If the \`violations\` array is empty, report "No violations found" and stop
4. For each violation in the JSON:
   - Read the violation's \`file\` at the \`line\` number
   - Check the \`ruleId\` to understand what rule was violated
   - Check the \`suggestion\` field for fix guidance
   - Apply the appropriate fix to the source code
5. After fixing all violations, re-run: \`npx camouf validate --format json --ci\`
6. If new violations appear, repeat the fix cycle (max 3 iterations)
7. Report final summary: how many violations were found, how many fixed, how many remain

### Rule-Specific Fix Strategies

- **hardcoded-secrets**: Move secrets to environment variables or .env files
- **circular-dependencies**: Refactor to break the cycle (extract shared interface, dependency inversion)
- **layer-dependencies**: Move the import to the correct layer or create a proper abstraction
- **security-context**: Add authentication/authorization guards to routes
- **performance-antipatterns**: Replace N+1 queries with batch operations, sync I/O with async
- **type-safety**: Replace \`any\` with proper types, add return type annotations
- **function-signature-matching**: Rename functions/fields to match the shared contract definition
`;
}

function getClaudeFixSignaturesCommand(): string {
  return `---
description: Fix function signature mismatches between frontend and backend code
allowed-tools: Read, Grep, Bash, Write
---

Fix function signature mismatches detected by Camouf.

**Important**: Always use \`npx camouf\` to run Camouf. Do NOT use \`node camouf.js\` or bare \`camouf\`.

## Background

AI coding agents often work with limited context windows and may create mismatched function names
or type field names between frontend and backend code. For example:

- Backend defines \`getUserById(id)\` but frontend calls \`getUser(userId)\`
- Shared DTO has \`email\` field but frontend accesses \`userEmail\`

These mismatches compile successfully but cause runtime errors.

## Steps

1. Run: \`npx camouf validate --format json --ci --rules function-signature-matching\`
2. Parse the JSON output to find violations with \`ruleId: "function-signature-matching"\`
3. For each violation:
   - The \`metadata.expected\` field contains the correct name (as defined in shared contracts)
   - The \`metadata.found\` field contains the incorrect name being used
   - The \`metadata.definedIn\` shows where the correct definition is
   - Read the file at \`violation.file\` line \`violation.line\`
   - Rename \`found\` to \`expected\` in that location
4. Re-run validation to confirm fixes
5. Report summary of fixes applied

## Alternative: Use the fix command

You can also use Camouf's built-in fix command:

\`\`\`bash
# Interactive mode - confirm each fix
npx camouf fix-signatures --interactive

# Fix all automatically
npx camouf fix-signatures --all

# Fix specific mismatch by ID
npx camouf fix --id sig-001

# Dry run to see what would be fixed
npx camouf fix-signatures --all --dry-run
\`\`\`

## Example Violation

\`\`\`json
{
  "ruleId": "function-signature-matching",
  "message": "Function name mismatch: 'getUser' called but 'getUserById' is defined",
  "file": "src/frontend/api.ts",
  "line": 42,
  "metadata": {
    "expected": "getUserById",
    "found": "getUser",
    "definedIn": { "file": "src/shared/api-contracts.ts", "line": 15 }
  }
}
\`\`\`
`;
}

function getClaudeRule(): string {
  return `# Camouf Architecture Rules

When writing or modifying code in this project, follow these architecture principles enforced by Camouf:

- Do NOT hardcode API keys, tokens, passwords, or secrets — use environment variables
- Do NOT create circular dependencies between modules
- Do NOT import from forbidden layers (check \`camouf.config.json\` for allowed layer dependencies)
- Always add authentication guards to API routes handling sensitive data
- Use async I/O instead of sync operations (\`readFileSync\`, \`execSync\`, etc.)
- Avoid N+1 query patterns (fetching in loops)
- Add proper TypeScript types — avoid \`any\` and unnecessary type assertions
- API endpoints should include version prefix (\`/api/v1/...\`)
- Validate all user inputs before processing
- Add timeout, retry, and error handling to external HTTP calls

**Always use \`npx camouf\` to invoke the CLI.** Do NOT use \`node camouf.js\` or bare \`camouf\`.

Run \`npx camouf validate --format json --ci\` to check compliance.
`;
}

function getAgentsMdContent(): string {
  return `# Project Agent Instructions

## Camouf — Architecture Monitoring

This project uses [Camouf](https://www.npmjs.com/package/camouf) for real-time architecture monitoring.
Camouf enforces architecture rules and catches violations before they reach production.

**Always use \`npx camouf\` to invoke the CLI.** Do NOT use \`node camouf.js\` or bare \`camouf\`.

### Commands

\`\`\`bash
# One-shot validation (JSON output — preferred for agents)
npx camouf validate --format json --ci

# One-shot validation (human-readable)
npx camouf validate --ci

# Watch mode (real-time monitoring)
npx camouf watch --ci
\`\`\`

### Output Parsing

When using \`--format json\`, output is:

\`\`\`json
{
  "summary": { "total": 2, "errors": 1, "warnings": 1, "info": 0 },
  "violations": [
    {
      "ruleId": "hardcoded-secrets",
      "ruleName": "Hardcoded Secrets Detection",
      "severity": "error",
      "message": "Potential hardcoded API key found",
      "file": "src/config.ts",
      "line": 15,
      "column": 1,
      "suggestion": "Move to environment variable"
    }
  ]
}
\`\`\`

### Exit Codes

- \`0\` — No violations found (architecture is clean)
- \`1\` — Violations found or error occurred

### Architecture Rules

The following rules are enforced (configured in \`camouf.config.json\`):

- \`layer-dependencies\` — Layers can only import from allowed layers
- \`circular-dependencies\` — No circular import chains
- \`hardcoded-secrets\` — No API keys, tokens, or credentials in code
- \`security-context\` — Routes/endpoints must have auth guards
- \`performance-antipatterns\` — No N+1 queries, sync I/O, memory leaks
- \`type-safety\` — No unsafe any, type assertions, non-null assertions
- \`ddd-boundaries\` — Bounded contexts must not cross domains
- \`api-versioning\` — API endpoints must include version prefix
- \`data-flow-integrity\` — Input validation and output sanitization
- \`contract-mismatch\` — Shared types must be consistent
- \`function-signature-matching\` — Function/field names must match across frontend/backend
- \`distributed-transactions\` — Multi-service calls need saga/compensation
- \`resilience-patterns\` — HTTP calls need timeout, retry, circuit breaker

### Signature Mismatch Fixing

Camouf can detect and fix function/field name mismatches caused by AI context loss:

\`\`\`bash
# Find signature mismatches
npx camouf validate --format json --ci --rules function-signature-matching

# Fix all mismatches
npx camouf fix-signatures --all

# Fix single mismatch
npx camouf fix --id sig-001
\`\`\`

### Workflow

1. Before committing code changes, run \`npx camouf validate --format json --ci\`
2. Parse the JSON output to check for violations
3. Fix violations following the \`suggestion\` field guidance
4. Re-run validation to confirm all violations are resolved
5. Configuration file: \`camouf.config.json\`

### CI/Agent Flags

- \`--ci\` — Suppresses spinners, colors, and interactive prompts
- \`--format json\` — Structured JSON output for machine parsing
- \`--format sarif\` — SARIF standard output for security tools
- \`--fail-on <severity>\` — Set minimum severity for non-zero exit (error, warning, info)
- \`CAMOUF_CI=1\` — Environment variable alternative to \`--ci\` flag
`;
}

function getCamoufAgentsSection(): string {
  return `## Camouf — Architecture Monitoring

This project uses [Camouf](https://www.npmjs.com/package/camouf) for architecture monitoring.

**Always use \`npx camouf\` to invoke the CLI.** Do NOT use \`node camouf.js\` or bare \`camouf\`.

### Commands

\`\`\`bash
npx camouf validate --format json --ci    # JSON output for parsing
npx camouf validate --ci                  # Human-readable output
\`\`\`

### Workflow

- Run \`npx camouf validate --format json --ci\` before committing
- Fix violations following the \`suggestion\` field in the JSON output
- Exit code 0 = clean, 1 = violations found
- Config: \`camouf.config.json\`
`;
}
