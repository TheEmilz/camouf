# CI/CD Integration

Integrate Camouf into your continuous integration pipeline to catch architecture violations before they reach production.

## GitHub Actions

Create `.github/workflows/architecture.yml`:

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
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Camouf
        run: npm install -g camouf
      
      - name: Run architecture validation
        run: camouf validate --format json --output camouf-report.json
      
      - name: Upload report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: camouf-report
          path: camouf-report.json
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
            
            let comment = `## 🏛️ Architecture Report\n\n`;
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
