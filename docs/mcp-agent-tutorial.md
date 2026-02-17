# Using Camouf with AI Agents (MCP Tutorial)

Camouf exposes an MCP (Model Context Protocol) server that allows AI coding agents to validate, analyze, and fix architecture violations in real time. This tutorial walks through the full setup and usage with Claude CLI (Claude Code), but the same MCP server works with any MCP-compatible agent (Cursor, Copilot, Windsurf, etc.).

---

## Table of Contents

- [Why This Matters](#why-this-matters)
- [Prerequisites](#prerequisites)
- [Step 1: Register camouf as MCP server](#step-1-register-camouf-as-mcp-server)
- [Step 2: Verify the connection](#step-2-verify-the-connection)
- [Step 3: Run a validation session](#step-3-run-a-validation-session)
- [Step 4: See the agent reasoning in real time](#step-4-see-the-agent-reasoning-in-real-time)
- [Step 5: Let the agent fix the code](#step-5-let-the-agent-fix-the-code)
- [Multi-Agent Collaboration](#multi-agent-collaboration)
- [Available MCP Tools](#available-mcp-tools)
- [Available MCP Prompts](#available-mcp-prompts)
- [Output Formats](#output-formats)
- [Troubleshooting](#troubleshooting)

---

## Why This Matters

When AI agents generate code, they work with limited context windows. This causes predictable problems:

- **Function name drift** -- the AI invents `fetchOrder()` instead of using the canonical `getOrderById()`.
- **Parameter count mismatches** -- the AI omits required parameters like `reason` in `cancelOrder(orderId, reason)`.
- **Type property errors** -- the AI writes `filter.id` instead of `filter.customerId`.

These errors compile fine but break at runtime. Camouf catches them by comparing generated code against your canonical type definitions.

With MCP, the agent can call camouf directly, see the violations, get fix suggestions, and correct the code -- all in the same conversation, without you doing anything.

---

## Prerequisites

- Node.js 18+
- A project with `camouf.config.json` configured (see [Getting Started](getting-started.md))
- Claude CLI (Claude Code) installed: `npm install -g @anthropic-ai/claude-code`

Verify Claude CLI is installed:

```bash
claude --version
```

---

## Step 1: Register camouf as MCP server

Navigate to the root of your project (where `camouf.config.json` lives) and run:

```bash
claude mcp add camouf -- npx camouf mcp
```

This registers camouf as a stdio MCP server in your local Claude CLI configuration. The configuration is scoped to the current project directory.

For other agents, the registration is different. For example, in Claude Desktop, add this to your config file (`%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "camouf": {
      "command": "npx",
      "args": ["camouf", "mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

---

## Step 2: Verify the connection

Check that camouf is connected:

```bash
claude mcp list
```

Expected output:

```
Checking MCP server health...

camouf: npx camouf mcp - Connected
```

If you see "Failed to connect", check that `npx camouf mcp` works from the same directory.

---

## Step 3: Run a validation session

The simplest way to use camouf with Claude CLI is print mode (`-p`). This sends a prompt, lets the agent call the MCP tools, and prints the result when done.

You need to explicitly allow the camouf MCP tools with `--allowed-tools`:

```bash
echo "Run camouf_validate on this project and summarize the violations." | claude -p --allowed-tools "mcp__camouf__camouf_validate,mcp__camouf__camouf_suggest_fix,mcp__camouf__camouf_analyze"
```

The agent will:

1. Call `camouf_validate` to scan the project
2. Receive the list of violations with file paths, line numbers, and severity
3. Summarize the findings in a readable format

### A more detailed prompt

For a complete analysis including fix guidance, use a multi-step prompt:

```bash
echo "You have access to camouf MCP tools. Step 1: Run camouf_validate to find all violations. Step 2: For each function-signature-matching ERROR violation, run camouf_suggest_fix to get fix guidance. Step 3: Summarize what is wrong, the canonical signatures, and how to fix each mismatch." | claude -p --allowed-tools "mcp__camouf__camouf_validate,mcp__camouf__camouf_suggest_fix,mcp__camouf__camouf_analyze"
```

The agent will chain the MCP tool calls: first validate, then request fix suggestions for each violation, then produce a comprehensive report.

---

## Step 4: See the agent reasoning in real time

With print mode (`-p`), the output appears only when the agent finishes. There are two ways to see what the agent is doing while it works.

### Option A: Interactive mode (recommended for exploration)

Launch Claude CLI without `-p`:

```bash
claude
```

Then type your prompt directly:

```
Run camouf_validate on this project and explain every violation.
```

In interactive mode, the agent streams its reasoning, tool calls, and results in real time. You see each MCP tool invocation as it happens. The agent will ask for permission before calling each tool the first time.

To pre-authorize the camouf tools and skip the permission prompts:

```bash
claude --allowed-tools "mcp__camouf__camouf_validate,mcp__camouf__camouf_suggest_fix,mcp__camouf__camouf_analyze"
```

### Option B: Streaming JSON output (for programmatic use)

For CI pipelines or tooling that needs real-time events, use `--output-format stream-json` with `--verbose`:

```bash
echo "Run camouf_validate on this project." | claude -p --verbose --output-format stream-json --allowed-tools "mcp__camouf__camouf_validate"
```

This outputs one JSON object per line as events happen:

- `{"type":"system","subtype":"init",...}` -- session started, lists available tools and MCP servers
- `{"type":"assistant","message":{...}}` -- agent reasoning and tool calls
- `{"type":"result","subtype":"success",...}` -- final result with cost and usage stats

Each JSON event includes the session ID, timestamps, and tool call details, making it possible to build dashboards or integrations on top of the agent.

---

## Step 5: Let the agent fix the code

The real power of MCP integration is letting the agent fix the violations it finds. This is the full workflow:

```bash
echo "You have access to camouf MCP tools. Follow this workflow: 1. Run camouf_validate to find all violations. 2. For each ERROR violation, run camouf_suggest_fix to understand the fix. 3. Apply the fixes directly to the source files. 4. Run camouf_validate again to confirm the fixes worked. Repeat until there are zero ERROR violations." | claude -p --allowed-tools "mcp__camouf__camouf_validate,mcp__camouf__camouf_suggest_fix,mcp__camouf__camouf_analyze,Edit,Read,Write" --permission-mode acceptEdits
```

Note the additional flags:

- `Edit,Read,Write` added to `--allowed-tools`: lets the agent read and edit your source files
- `--permission-mode acceptEdits`: auto-approves file edits without prompting

The agent will:

1. Validate the project and find violations
2. Get fix suggestions from camouf for each violation
3. Edit the source files to apply the fixes (rename functions, add missing parameters, fix property names)
4. Re-validate to confirm the fixes are correct
5. Repeat if any violations remain

This is the validate-fix-revalidate loop described in the `after-generating-code` MCP prompt, with a maximum of 3 iterations to prevent infinite loops.

### What the agent can fix that the CLI cannot

The `npx camouf fix --all` command handles deterministic text replacements: renaming a function from `fetchOrder` to `getOrderById`, or fixing a property name from `filter.id` to `filter.customerId`.

But parameter-count mismatches require judgment. If `cancelOrder(orderId)` should be `cancelOrder(orderId, reason)`, the CLI cannot invent the `reason` value. An AI agent can:

- Read the surrounding code to understand the context
- Determine that `reason` should come from user input, a request body, or a default value
- Add the parameter to both the function definition and all call sites
- Re-validate to confirm the fix is complete

This is why MCP integration matters: it closes the gap between detection and resolution for violations that require understanding, not just text replacement.

---

## Multi-Agent Collaboration

When camouf runs as an MCP server, it enables collaboration between multiple AI agents. For example:

- **GitHub Copilot** (in VS Code) can launch Claude CLI to validate code
- **Claude CLI** calls camouf MCP tools to detect violations
- **Camouf** returns structured violation data
- **Claude CLI** uses the data to produce fix suggestions or apply edits
- **GitHub Copilot** presents the results to the user

The command from a Copilot chat session looks like this:

```bash
echo "Run camouf_validate and fix all ERROR violations." | claude -p --allowed-tools "mcp__camouf__camouf_validate,mcp__camouf__camouf_suggest_fix,Edit,Read,Write" --permission-mode acceptEdits
```

This chain (Copilot -> Claude Code -> Camouf MCP) demonstrates how agents can use specialized tools through MCP to produce better results than any single agent working alone.

---

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `camouf_validate` | Scans the project and returns all violations with file paths, line numbers, severity, and rule IDs |
| `camouf_analyze` | Analyzes project structure: layers, dependencies, naming conventions, import patterns |
| `camouf_suggest_fix` | Returns specific fix steps for a given violation, including code changes, alternatives, and prevention tips |

---

## Available MCP Prompts

These prompts teach the agent the correct workflow for using camouf. They are available as slash commands in interactive mode (e.g., `/mcp__camouf__before-writing-code`).

| Prompt | When to use |
|--------|-------------|
| `before-writing-code` | Before generating any code. Tells the agent to analyze the project architecture first. |
| `after-generating-code` | After generating code. Defines the validate-fix-revalidate loop (max 3 iterations). |
| `understanding-violations` | When the agent encounters violations. Explains severity levels and common AI error patterns. |
| `project-conventions` | When the agent needs to understand the project. Discovers active rules, layers, and naming conventions. |

---

## Output Formats

| Mode | Flag | Behavior |
|------|------|----------|
| Interactive | (no flag) | Real-time streaming in the terminal. Best for exploration and demos. |
| Print | `-p` | Output appears when the agent finishes. Best for scripting. |
| JSON | `-p --output-format json` | Single JSON object with the final result. Best for parsing. |
| Stream JSON | `-p --verbose --output-format stream-json` | One JSON event per line in real time. Best for CI and dashboards. |

---

## Troubleshooting

### "No MCP servers configured"

Make sure you registered the server from the correct directory:

```bash
cd /path/to/your/project
claude mcp add camouf -- npx camouf mcp
```

The registration is scoped to the directory where you run the command.

### "Failed to connect" in `claude mcp list`

Check that `npx camouf mcp` works from the same directory:

```bash
npx camouf mcp
```

If this fails, make sure camouf is installed:

```bash
npm install --save-dev camouf
```

### Tool calls are denied

By default, Claude CLI asks for permission before calling MCP tools. Use `--allowed-tools` to pre-authorize them:

```bash
claude --allowed-tools "mcp__camouf__camouf_validate,mcp__camouf__camouf_suggest_fix,mcp__camouf__camouf_analyze"
```

The tool names follow the pattern `mcp__<server-name>__<tool-name>`.

### The agent does not see violations

Make sure your project has a `camouf.config.json` with the correct configuration. At minimum:

```json
{
  "rules": {
    "function-signature-matching": "error"
  },
  "layers": [
    { "name": "shared", "path": "shared" },
    { "name": "client", "path": "client" },
    { "name": "server", "path": "server" }
  ]
}
```

Run `npx camouf validate` manually to confirm camouf finds violations before involving the agent.
