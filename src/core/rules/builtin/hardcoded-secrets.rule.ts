/**
 * Hardcoded Secrets Rule
 * 
 * Detects hardcoded sensitive values like passwords, API keys, tokens, and credentials.
 */

import { IRule, RuleContext, RuleConfig, RuleResult } from '../rule.interface.js';
import { Violation } from '../../../types/core.types.js';

interface SecretPattern {
  name: string;
  pattern: RegExp;
  description: string;
}

interface HardcodedSecretsConfig extends RuleConfig {
  /** Additional custom patterns to search for */
  customPatterns?: Array<{ name: string; pattern: string; description: string }>;
  /** Paths to ignore (e.g., test files, examples) */
  ignorePaths?: string[];
  /** Minimum length for generic secret detection */
  minSecretLength?: number;
  /** Check environment variable assignments */
  checkEnvAssignments?: boolean;
}

export class HardcodedSecretsRule implements IRule {
  readonly id = 'hardcoded-secrets';
  readonly name = 'Hardcoded Secrets Detection';
  readonly description = 'Detects hardcoded sensitive values like passwords, API keys, tokens, and credentials';
  readonly severity = 'error' as const;
  readonly tags = ['security', 'secrets', 'credentials', 'best-practices'];
  readonly category = 'security' as const;
  readonly supportsIncremental = true;  // Enable real-time checking

  private config: HardcodedSecretsConfig = {
    enabled: true,
    severity: 'error',
    ignorePaths: [],  // Intentionally empty: AI agents often hide secrets in test/mock files
    minSecretLength: 8,
    checkEnvAssignments: true,
  };

  // Built-in patterns for common secrets
  private readonly secretPatterns: SecretPattern[] = [
    // API Keys
    {
      name: 'Generic API Key',
      pattern: /['"`](?:api[_-]?key|apikey)\s*['"`]\s*[:=]\s*['"`]([^'"`]{8,})['"`]/gi,
      description: 'Hardcoded API key detected',
    },
    {
      name: 'AWS Access Key',
      pattern: /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g,
      description: 'AWS Access Key ID detected',
    },
    {
      name: 'AWS Secret Key',
      pattern: /['"`]?(?:aws)?[_-]?secret[_-]?(?:access)?[_-]?key['"`]?\s*[:=]\s*['"`]([A-Za-z0-9/+=]{40})['"`]/gi,
      description: 'AWS Secret Access Key detected',
    },
    {
      name: 'OpenAI API Key',
      pattern: /sk-(?:proj-)?[A-Za-z0-9]{20,}/g,
      description: 'OpenAI API key detected',
    },
    {
      name: 'Anthropic API Key',
      pattern: /sk-ant-[A-Za-z0-9_-]{40,}/g,
      description: 'Anthropic API key detected',
    },
    {
      name: 'Azure OpenAI Key',
      pattern: /[A-Fa-f0-9]{32}/g,
      description: 'Potential Azure API key detected (32-char hex)',
    },
    {
      name: 'Hugging Face Token',
      pattern: /hf_[A-Za-z0-9]{34,}/g,
      description: 'Hugging Face API token detected',
    },
    {
      name: 'Stripe API Key',
      pattern: /(?:sk|pk)_(?:test|live)_[A-Za-z0-9]{24,}/g,
      description: 'Stripe API key detected',
    },
    {
      name: 'GitHub Token',
      pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/g,
      description: 'GitHub personal access token detected',
    },
    {
      name: 'Slack Token',
      pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g,
      description: 'Slack token detected',
    },
    {
      name: 'Google API Key',
      pattern: /AIza[A-Za-z0-9_-]{35}/g,
      description: 'Google API key detected',
    },

    // JWT Tokens
    {
      name: 'JWT Token',
      pattern: /['"`]eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*['"`]/g,
      description: 'Hardcoded JWT token detected',
    },

    // Database Connection Strings
    {
      name: 'MongoDB Connection',
      pattern: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^/]+/gi,
      description: 'MongoDB connection string with credentials detected',
    },
    {
      name: 'PostgreSQL Connection',
      pattern: /postgres(?:ql)?:\/\/[^:]+:[^@]+@[^/]+/gi,
      description: 'PostgreSQL connection string with credentials detected',
    },
    {
      name: 'MySQL Connection',
      pattern: /mysql:\/\/[^:]+:[^@]+@[^/]+/gi,
      description: 'MySQL connection string with credentials detected',
    },
    {
      name: 'Redis Connection',
      pattern: /redis:\/\/[^:]+:[^@]+@[^/]+/gi,
      description: 'Redis connection string with credentials detected',
    },

    // Passwords
    {
      name: 'Password Assignment',
      pattern: /['"`]?(?:password|passwd|pwd|pass)['"`]?\s*[:=]\s*['"`]([^'"`]{4,})['"`]/gi,
      description: 'Hardcoded password detected',
    },

    // Secrets and Tokens
    {
      name: 'Secret Key Assignment',
      pattern: /['"`]?(?:secret[_-]?key|client[_-]?secret|app[_-]?secret)['"`]?\s*[:=]\s*['"`]([^'"`]{8,})['"`]/gi,
      description: 'Hardcoded secret key detected',
    },
    {
      name: 'Private Key',
      pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
      description: 'Private key detected in source code',
    },
    {
      name: 'Bearer Token',
      pattern: /['"`]Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+['"`]/g,
      description: 'Hardcoded Bearer token detected',
    },

    // Auth Headers
    {
      name: 'Basic Auth',
      pattern: /['"`]Basic\s+[A-Za-z0-9+/=]{10,}['"`]/g,
      description: 'Hardcoded Basic authentication detected',
    },
    {
      name: 'Authorization Header',
      pattern: /['"`]?(?:authorization|auth[_-]?token)['"`]?\s*[:=]\s*['"`]([^'"`]{20,})['"`]/gi,
      description: 'Hardcoded authorization header detected',
    },

    // SSH Keys
    {
      name: 'SSH Private Key',
      pattern: /-----BEGIN (?:DSA |RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
      description: 'SSH private key detected',
    },

    // NPM/Package tokens
    {
      name: 'NPM Token',
      pattern: /\/\/registry\.npmjs\.org\/:_authToken=.+/g,
      description: 'NPM authentication token detected',
    },

    // Twilio
    {
      name: 'Twilio Account SID',
      pattern: /AC[a-z0-9]{32}/gi,
      description: 'Twilio Account SID detected',
    },
    {
      name: 'Twilio Auth Token',
      pattern: /['"`]?(?:twilio[_-]?auth[_-]?token|twilio[_-]?token)['"`]?\s*[:=]\s*['"`]([a-z0-9]{32})['"`]/gi,
      description: 'Twilio auth token detected',
    },

    // Sendgrid
    {
      name: 'SendGrid API Key',
      pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g,
      description: 'SendGrid API key detected',
    },

    // Mailgun
    {
      name: 'Mailgun API Key',
      pattern: /key-[A-Za-z0-9]{32}/g,
      description: 'Mailgun API key detected',
    },

    // Firebase
    {
      name: 'Firebase Config',
      pattern: /['"`]?(?:firebase[_-]?(?:api[_-]?key|project[_-]?id|app[_-]?id))['"`]?\s*[:=]\s*['"`]([^'"`]{10,})['"`]/gi,
      description: 'Firebase configuration detected',
    },

    // Generic high-entropy strings that might be secrets
    {
      name: 'Generic Token',
      pattern: /['"`]?(?:token|access[_-]?token|refresh[_-]?token)['"`]?\s*[:=]\s*['"`]([A-Za-z0-9_-]{20,})['"`]/gi,
      description: 'Hardcoded token detected',
    },

    // AI Agent common patterns - these are often used to "hide" real secrets
    {
      name: 'Variable with Secret Value',
      pattern: /(?:const|let|var)\s+(?:[A-Z_]*(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|AUTH)[A-Z_]*)\s*=\s*['"`]([^'"`]{8,})['"`]/g,
      description: 'Variable name suggests sensitive value',
    },
    {
      name: 'Supabase Key',
      pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      description: 'Supabase anon/service key detected (JWT format)',
    },
    {
      name: 'Discord Token',
      pattern: /[MN][A-Za-z0-9]{23,}\.[A-Za-z0-9-_]{6}\.[A-Za-z0-9-_]{27}/g,
      description: 'Discord bot token detected',
    },
    {
      name: 'Telegram Bot Token',
      pattern: /\d{8,10}:[A-Za-z0-9_-]{35}/g,
      description: 'Telegram bot token detected',
    },
    {
      name: 'Replicate API Token',
      pattern: /r8_[A-Za-z0-9]{40}/g,
      description: 'Replicate API token detected',
    },
    {
      name: 'Linear API Key',
      pattern: /lin_api_[A-Za-z0-9]{40}/g,
      description: 'Linear API key detected',
    },
    {
      name: 'Notion API Key',
      pattern: /secret_[A-Za-z0-9]{43}/g,
      description: 'Notion API key detected',
    },
    {
      name: 'Airtable API Key',
      pattern: /key[A-Za-z0-9]{14}/g,
      description: 'Airtable API key detected',
    },
    {
      name: 'Doppler Token',
      pattern: /dp\.pt\.[A-Za-z0-9]{43}/g,
      description: 'Doppler token detected',
    },
  ];

  // Patterns to exclude (false positives)
  // NOTE: Intentionally minimal - AI agents often use words like "test", "mock", "example"
  // to disguise real hardcoded secrets. We only exclude obvious template patterns.
  private readonly excludePatterns: RegExp[] = [
    /process\.env\.[A-Z_]+\s*$/,  // Only pure env var references (no fallback)
    /import\.meta\.env\.[A-Z_]+\s*$/,  // Only pure env var references
    /\$\{[A-Z_]+\}/,  // Template literals with env-style variables only
    /<%[=]?\s*\w+\s*%>/,    // EJS templates
    /\{\{\s*\w+\s*\}\}/, // Handlebars/Mustache templates
    /your[_-]?(?:api[_-]?key|password|secret|token)(?:[_-]?here)?/i,  // Obvious placeholders
    /\*{8,}/,    // Heavily masked values like ********
    /^x{8,}$/i,  // Only pure xxx... strings
    /<[A-Z_]+>/,  // Placeholder patterns like <API_KEY>
    /\[(?:YOUR|INSERT|REPLACE)[_\s].*\]/i,  // [YOUR_API_KEY] style placeholders
  ];

  configure(options: Partial<HardcodedSecretsConfig>): void {
    this.config = { ...this.config, ...options };
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];

    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      
      // Skip ignored paths
      if (this.shouldIgnorePath(filePath)) continue;

      const content = context.fileContents?.get(filePath);
      if (!content) continue;

      this.checkForSecrets(filePath, content, violations);
    }

    return { violations };
  }

  /**
   * Check a single file for secrets (incremental/real-time validation)
   */
  async checkFile(filePath: string, context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];
    
    // Skip ignored paths
    if (this.shouldIgnorePath(filePath)) {
      return { violations };
    }

    // Convert to relative path for fileContents lookup
    const path = await import('path');
    const relativePath = path.relative(context.config.root, filePath).replace(/\\/g, '/');
    
    // Get file content from context or read directly
    let content = context.fileContents?.get(relativePath);
    
    if (!content) {
      // Try with backslashes (Windows)
      content = context.fileContents?.get(relativePath.replace(/\//g, '\\'));
    }
    
    if (!content) {
      // Read file directly as fallback
      try {
        const fs = await import('fs/promises');
        content = await fs.readFile(filePath, 'utf-8');
      } catch {
        // File might not exist or be readable
        return { violations };
      }
    }

    this.checkForSecrets(relativePath, content, violations);
    return { violations };
  }

  private shouldIgnorePath(filePath: string): boolean {
    const normalizedPath = filePath.toLowerCase();
    return (this.config.ignorePaths || []).some(ignorePath => 
      normalizedPath.includes(ignorePath.toLowerCase())
    );
  }

  private checkForSecrets(filePath: string, content: string, violations: Violation[]): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Skip comments
      if (this.isComment(line)) continue;

      // Check each secret pattern
      for (const secretPattern of this.secretPatterns) {
        // Reset regex state
        secretPattern.pattern.lastIndex = 0;
        
        let match;
        while ((match = secretPattern.pattern.exec(line)) !== null) {
          const matchedValue = match[0];
          
          // Check if it's a false positive
          if (this.isFalsePositive(line, matchedValue)) continue;

          violations.push(this.createViolation(
            filePath,
            `${secretPattern.description}: ${this.maskSecret(matchedValue)}`,
            lineNumber,
            'Move sensitive values to environment variables or a secrets manager'
          ));
        }
      }

      // Check custom patterns
      if (this.config.customPatterns) {
        for (const customPattern of this.config.customPatterns) {
          const regex = new RegExp(customPattern.pattern, 'gi');
          let match;
          while ((match = regex.exec(line)) !== null) {
            if (this.isFalsePositive(line, match[0])) continue;

            violations.push(this.createViolation(
              filePath,
              `${customPattern.description}: ${this.maskSecret(match[0])}`,
              lineNumber,
              'Move sensitive values to environment variables or a secrets manager'
            ));
          }
        }
      }

      // Check for suspicious environment variable assignments with hardcoded values
      if (this.config.checkEnvAssignments) {
        this.checkEnvAssignments(filePath, line, lineNumber, violations);
      }
    }
  }

  private checkEnvAssignments(filePath: string, line: string, lineNumber: number, violations: Violation[]): void {
    // Check for .env file contents being set directly (e.g., in config files)
    const envAssignmentPattern = /(?:process\.env\.|import\.meta\.env\.)\w+\s*(?:\|\||=)\s*['"`]([^'"`]{8,})['"`]/g;
    
    let match;
    while ((match = envAssignmentPattern.exec(line)) !== null) {
      const value = match[1];
      
      // Check if the fallback value looks like a real secret
      if (this.looksLikeSecret(value) && !this.isFalsePositive(line, value)) {
        violations.push(this.createViolation(
          filePath,
          `Environment variable fallback contains potential secret: ${this.maskSecret(value)}`,
          lineNumber,
          'Avoid using real secrets as fallback values. Use empty strings or throw errors for missing env vars.'
        ));
      }
    }
  }

  private looksLikeSecret(value: string): boolean {
    // Check if value has characteristics of a secret
    const minLength = this.config.minSecretLength || 8;
    if (value.length < minLength) return false;

    // High entropy check (mix of character types)
    const hasUppercase = /[A-Z]/.test(value);
    const hasLowercase = /[a-z]/.test(value);
    const hasNumbers = /[0-9]/.test(value);
    const hasSpecial = /[_+=/-]/.test(value);
    
    const charTypeCount = [hasUppercase, hasLowercase, hasNumbers, hasSpecial].filter(Boolean).length;
    
    return charTypeCount >= 3 || value.length > 20;
  }

  private isComment(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('//') || 
           trimmed.startsWith('#') || 
           trimmed.startsWith('*') ||
           trimmed.startsWith('/*') ||
           trimmed.startsWith('"""') ||
           trimmed.startsWith("'''");
  }

  private isFalsePositive(line: string, matchedValue: string): boolean {
    // Check against exclusion patterns
    for (const excludePattern of this.excludePatterns) {
      if (excludePattern.test(line) || excludePattern.test(matchedValue)) {
        return true;
      }
    }

    // Check if it's using environment variable
    if (/process\.env\.\w+|import\.meta\.env\.\w+|getenv\(|os\.environ/.test(line)) {
      // But not if it's a fallback with a real value
      if (!/\|\||:\s*['"`][^'"`]+['"`]/.test(line)) {
        return true;
      }
    }

    return false;
  }

  private maskSecret(secret: string): string {
    if (secret.length <= 8) {
      return '*'.repeat(secret.length);
    }
    const visibleChars = Math.min(4, Math.floor(secret.length / 4));
    return secret.substring(0, visibleChars) + '*'.repeat(secret.length - visibleChars * 2) + secret.substring(secret.length - visibleChars);
  }

  private createViolation(file: string, message: string, line: number, suggestion?: string): Violation {
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
