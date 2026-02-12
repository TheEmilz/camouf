/**
 * MCP Prompts for Camouf
 * 
 * Predefined prompts that teach AI agents HOW to use Camouf tools
 * in the correct sequence. These are workflow instructions, not just tool docs.
 */

import { Prompt, GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * All available prompts
 */
export const promptDefinitions: Prompt[] = [
  {
    name: 'before-writing-code',
    description: 'Workflow: analyze the project architecture BEFORE generating new code to avoid violations',
    arguments: [
      {
        name: 'projectRoot',
        description: 'Root directory of the project',
        required: false,
      },
    ],
  },
  {
    name: 'after-generating-code',
    description: 'Workflow: validate and fix AI-generated code after writing it',
    arguments: [
      {
        name: 'filePath',
        description: 'Path of the file to validate',
        required: true,
      },
    ],
  },
  {
    name: 'understanding-violations',
    description: 'How to interpret Camouf violation results and apply fixes correctly',
  },
  {
    name: 'project-conventions',
    description: 'Discover which rules are active, what architecture is enforced, and project naming conventions',
    arguments: [
      {
        name: 'projectRoot',
        description: 'Root directory of the project',
        required: false,
      },
    ],
  },
];

/**
 * Get prompt content by name
 */
export function getPrompt(name: string, args?: Record<string, string>): GetPromptResult {
  switch (name) {
    case 'before-writing-code':
      return getBeforeWritingCodePrompt(args?.projectRoot);
    case 'after-generating-code':
      return getAfterGeneratingCodePrompt(args?.filePath || 'unknown');
    case 'understanding-violations':
      return getUnderstandingViolationsPrompt();
    case 'project-conventions':
      return getProjectConventionsPrompt(args?.projectRoot);
    default:
      return {
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: `Unknown prompt: ${name}` },
          },
        ],
      };
  }
}

function getBeforeWritingCodePrompt(projectRoot?: string): GetPromptResult {
  const root = projectRoot || '.';
  return {
    description: 'Analyze project before generating code',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Before writing any new code for this project, follow this workflow:

1. **Read project conventions**: Use the \`camouf://config\` resource to understand which rules are active and how the project is structured (layers, directories, naming).

2. **Analyze architecture**: Call \`camouf_analyze\` with projectRoot="${root}" and focus="all" to understand:
   - The dependency graph and module boundaries
   - Existing types, interfaces, and classes (so you don't create duplicates)
   - Naming conventions in use (camelCase vs PascalCase vs snake_case)
   - Which directories are client, server, and shared

3. **Check available types**: Call \`camouf_analyze\` with focus="types" to see all exported interfaces and types. Import these instead of creating new ones.

4. **Respect layer boundaries**: If layers are configured, ensure your new code only imports from allowed layers. For example, presentation should not import from infrastructure directly.

5. **Match existing patterns**: Use the same export style (named vs default), import style (relative vs absolute), and naming conventions found in the analysis.

This prevents the most common AI mistakes: hallucinated imports, naming inconsistencies, and layer violations.`,
        },
      },
    ],
  };
}

function getAfterGeneratingCodePrompt(filePath: string): GetPromptResult {
  return {
    description: 'Validate and fix generated code',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `After generating code, follow this validation workflow:

1. **Validate the code**: Call \`camouf_validate\` with the generated code and filePath="${filePath}". This checks for:
   - Hallucinated imports (modules that don't exist)
   - Function signature mismatches (calling functions with wrong names/args)
   - Naming inconsistencies 
   - Hardcoded secrets
   - Layer violations
   - Performance anti-patterns

2. **Review violations**: Check the response. If violations are found:
   - **Errors** (severity: "error") MUST be fixed before proposing the code
   - **Warnings** (severity: "warning") SHOULD be fixed
   - **Infos** (severity: "info") are suggestions, fix if straightforward

3. **Get fix suggestions**: For each error violation, call \`camouf_suggest_fix\` with the violation details to get specific fix strategies.

4. **Apply fixes and re-validate**: Fix the code, then call \`camouf_validate\` again. Repeat until no errors remain. Maximum 3 iterations.

5. **Report to user**: When proposing the code, mention if Camouf found and fixed any violations. This builds trust.

Exit codes: 0 errors = ready to propose. Any errors = fix first.`,
        },
      },
    ],
  };
}

function getUnderstandingViolationsPrompt(): GetPromptResult {
  return {
    description: 'How to interpret Camouf violations',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Guide to interpreting Camouf violation results:

## Severity Levels
- **error**: Breaks correctness. Function doesn't exist, import is wrong, secret exposed. MUST fix.
- **warning**: Likely problem. Naming mismatch, performance issue, missing error handling. SHOULD fix.
- **info**: Style suggestion. Can be deferred.

## Most Common AI Violations

### ai-hallucinated-imports (error)
You imported a module that doesn't exist. Fix: check the actual file tree, find the real path.

### function-signature-matching (error)
You called a function with the wrong name — similar but not exact (e.g., \`getUser\` vs \`getUserById\`).
Fix: read the actual function declaration in the shared/types directory. Use the exact name.

### inconsistent-casing (warning)  
You mixed naming styles (camelCase + snake_case in same file).
Fix: match the dominant style in the codebase.

### phantom-type-references (error)
You used a type name that doesn't exist (e.g., \`UserDTO\` when the actual type is \`User\`).
Fix: check exports from shared/types files.

### hardcoded-secrets (error)
You left a real or placeholder API key/token in the code.
Fix: use environment variables.

## Reading the JSON Output
\`\`\`json
{
  "violations": [{
    "ruleId": "...",        // Which rule caught it
    "severity": "error",    // How serious
    "message": "...",       // What's wrong
    "file": "...",          // Where
    "line": 42,             // Exact line
    "suggestion": "..."     // How to fix
  }],
  "summary": {
    "errors": 2,            // Must fix
    "warnings": 1,          // Should fix
    "infos": 0              // Optional
  }
}
\`\`\``,
        },
      },
    ],
  };
}

function getProjectConventionsPrompt(projectRoot?: string): GetPromptResult {
  const root = projectRoot || '.';
  return {
    description: 'Discover project conventions and active rules',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `To understand this project's coding conventions, do the following:

1. **Read the config**: Access the \`camouf://config\` resource. This tells you:
   - Which programming languages are used
   - How directories are organized (client/server/shared)
   - Which architecture layers are defined and their allowed dependencies
   - Which rules are enabled and at what severity

2. **Read available rules**: Access the \`camouf://rules\` resource. This lists:
   - All available rules (builtin + plugins) with descriptions
   - Which rules are currently enabled
   - Rule categories and severities

3. **Analyze conventions**: Call \`camouf_analyze\` with projectRoot="${root}" and focus="conventions" to detect:
   - Dominant naming style (camelCase, PascalCase, snake_case)
   - Export style (named exports vs default exports)
   - Import style (relative vs absolute paths)

4. **Summary for code generation**: Based on the above, when generating code:
   - Use the detected naming style consistently
   - Follow the detected export/import patterns
   - Place new files in the correct layer directories
   - Import from allowed layers only
   - Use existing types from shared directories instead of creating new ones`,
        },
      },
    ],
  };
}
