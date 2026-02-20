# CI/CD Integration

Integrate Camouf into your continuous integration pipeline to catch architecture violations before they reach production.

## GitHub Actions (Marketplace)

Camouf is available on the [GitHub Actions Marketplace](https://github.com/marketplace/actions/camouf-ai-code-guardrails). Add it to any workflow with a single step.

### Quick Start

```yaml
name: Architecture Check

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  architecture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: TheEmilz/camouf@v0.10.0
```

That is all that is needed. Camouf will auto-detect your `camouf.config.json`, run all enabled rules, generate a report artifact, and annotate changed files directly in the pull request diff.

### Targeting Specific Rules

To run only specific rules (for example, during gradual adoption or to focus on async safety):

```yaml
- uses: TheEmilz/camouf@v0.10.0
  with:
    rules: 'async-discrepancies,contract-mismatch,function-signature-matching'
    fail-on: 'error'
```

### Async Discrepancies in CI

The `async-discrepancies` rule is particularly effective in CI pipelines. AI-generated async code often compiles and passes basic tests, but introduces subtle runtime issues — floating promises, unnecessary async wrappers, or mixed `await`/`.then()` patterns that silently swallow errors.

#### Example: Catch Async Issues on Every PR

```yaml
name: Async Safety

on:
  pull_request:
    paths:
      - '**/*.ts'
      - '**/*.js'

jobs:
  async-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: TheEmilz/camouf@v0.10.0
        with:
          rules: 'async-discrepancies'
          fail-on: 'warn'
          annotate: 'true'
```

This runs the `async-discrepancies` rule on every pull request that modifies TypeScript or JavaScript files. Violations appear as inline annotations on the PR diff, making review straightforward.

#### Example: Full Architecture Gate

```yaml
name: Architecture Gate

on:
  pull_request:
    branches: [main]

jobs:
  camouf:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: TheEmilz/camouf@v0.10.0
        id: camouf
        with:
          fail-on: 'error'
          max-warnings: '20'

      - name: Post summary
        if: always()
        run: |
          echo "Violations: ${{ steps.camouf.outputs.total-violations }}"
          echo "Errors: ${{ steps.camouf.outputs.errors }}"
          echo "Warnings: ${{ steps.camouf.outputs.warnings }}"
```

### Action Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `version` | `latest` | Camouf version to install |
| `config` | auto-detect | Path to `camouf.config.json` |
| `rules` | all enabled | Comma-separated list of rules to run |
| `fail-on` | `error` | Minimum severity to fail: `error`, `warn`, or `off` |
| `format` | `text` | Output format: `text`, `json`, or `vscode` |
| `max-warnings` | unlimited | Maximum warnings before failing |
| `working-directory` | `.` | Working directory for analysis |
| `report-artifact` | `true` | Upload report as GitHub artifact |
| `annotate` | `true` | Add inline annotations on PRs |

### Action Outputs

| Output | Description |
|--------|-------------|
| `total-violations` | Total number of violations found |
| `errors` | Number of error-level violations |
| `warnings` | Number of warning-level violations |
| `report-path` | Path to the generated JSON report |
| `exit-code` | Exit code (0 = clean, 1 = violations, 2 = config error) |

### Manual Setup (Without Marketplace)

If you prefer not to use the marketplace action, you can install Camouf directly:

```yaml
name: Architecture Check

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  architecture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm install -g camouf
      - run: camouf validate
```

### With Pull Request Comments

```yaml
name: Architecture Review

on:
  pull_request:

jobs:
  architecture:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - run: npm ci
      - run: npm install -g camouf
      
      - name: Run Camouf
        id: camouf
        run: |
          camouf validate --format json > report.json 2>&1 || true
          echo "violations=$(cat report.json | jq '.totalViolations')" >> $GITHUB_OUTPUT
      
      - name: Comment on PR
        if: steps.camouf.outputs.violations > 0
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('report.json', 'utf8'));
            
            let comment = `## Architecture Report\n\n`;
            comment += `Found **${report.totalViolations}** violations.\n\n`;
            
            for (const [file, violations] of Object.entries(report.files)) {
              comment += `### ${file}\n`;
              for (const v of violations) {
                comment += `- Line ${v.line}: ${v.message}\n`;
              }
            }
            
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: comment
            });
```

## GitLab CI

Create `.gitlab-ci.yml`:

```yaml
stages:
  - validate

architecture:
  stage: validate
  image: node:20
  script:
    - npm ci
    - npm install -g camouf
    - camouf validate
  artifacts:
    reports:
      codequality: camouf-report.json
    when: always
```

## Jenkins

```groovy
pipeline {
    agent any
    
    stages {
        stage('Architecture Check') {
            steps {
                sh 'npm ci'
                sh 'npm install -g camouf'
                sh 'camouf validate --format json --output camouf-report.json'
            }
            post {
                always {
                    archiveArtifacts artifacts: 'camouf-report.json'
                }
            }
        }
    }
}
```

## Azure DevOps

```yaml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'
  
  - script: |
      npm ci
      npm install -g camouf
      camouf validate
    displayName: 'Architecture Validation'
```

## Pre-commit Hook

### Using Husky

```bash
npm install --save-dev husky
npx husky init
```

Create `.husky/pre-commit`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run camouf on changed files
npx camouf validate --fail-on-error
```

### Using lint-staged

```json
{
  "lint-staged": {
    "*.{ts,js}": [
      "camouf validate"
    ]
  }
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | No errors found |
| 1 | Errors found (violations with severity "error") |
| 2 | Configuration error |

Use these in CI to fail builds on architecture violations:

```bash
camouf validate || exit 1
```

## Ignoring Violations in CI

For gradual adoption, you can set a threshold:

```bash
# Allow up to 10 warnings
camouf validate --max-warnings 10
```

Or ignore specific rules:

```bash
camouf validate --ignore-rules circular-dependencies,type-safety
```

## Caching

Speed up CI runs by caching Camouf's analysis:

```yaml
- name: Cache Camouf
  uses: actions/cache@v4
  with:
    path: |
      ~/.npm
      .camouf-cache
    key: ${{ runner.os }}-camouf-${{ hashFiles('**/package-lock.json') }}
```
