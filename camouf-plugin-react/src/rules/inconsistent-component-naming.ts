/**
 * Inconsistent Component Naming Rule
 * 
 * Detects React components that don't follow PascalCase naming convention.
 * AI assistants sometimes generate components with incorrect casing,
 * especially when copying patterns from non-React code.
 * 
 * Examples:
 * - function userProfile() vs function UserProfile()
 * - const todoItem = () => vs const TodoItem = () =>
 */

import type { IRule, RuleContext, RuleResult, RuleConfig } from 'camouf/rules';
import type { Violation } from 'camouf';
import * as path from 'path';

interface ComponentNamingConfig extends RuleConfig {
  /** Require PascalCase for all components */
  enforcePascalCase?: boolean;
  /** Also check for consistent file naming */
  checkFileNames?: boolean;
}

interface ComponentInfo {
  name: string;
  type: 'function' | 'arrow' | 'class';
  line: number;
  column: number;
  isPascalCase: boolean;
  isExported: boolean;
  file: string;
}

export class InconsistentComponentNamingRule implements IRule {
  readonly id = 'react/inconsistent-component-naming';
  readonly name = 'Inconsistent Component Naming';
  readonly description = 'Detects React components not following PascalCase naming convention';
  readonly severity = 'warning' as const;
  readonly tags = ['react', 'naming', 'ai-safety'];
  readonly category = 'naming' as const;
  readonly supportsIncremental = true;

  private config: ComponentNamingConfig = {
    enabled: true,
    severity: 'warning',
    enforcePascalCase: true,
    checkFileNames: true,
  };

  private violationCounter = 0;

  configure(options: Partial<ComponentNamingConfig>): void {
    this.config = { ...this.config, ...options };
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];
    this.violationCounter = 0;

    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      const content = context.fileContents?.get(filePath);
      if (!content) continue;

      const ext = path.extname(filePath).toLowerCase();
      if (!['.tsx', '.jsx'].includes(ext)) continue;

      const components = this.findComponents(content, filePath);
      
      for (const component of components) {
        // Check component name
        if (this.config.enforcePascalCase && !component.isPascalCase) {
          this.violationCounter++;
          const suggested = this.toPascalCase(component.name);
          
          violations.push({
            id: `naming-${String(this.violationCounter).padStart(3, '0')}`,
            ruleId: this.id,
            ruleName: this.name,
            severity: this.config.severity as 'error' | 'warning' | 'info',
            message: `React component '${component.name}' should use PascalCase naming`,
            file: component.file,
            line: component.line,
            column: component.column,
            suggestion: `Rename to '${suggested}'`,
            metadata: {
              componentName: component.name,
              componentType: component.type,
              suggestedName: suggested,
              isExported: component.isExported,
              aiErrorType: 'inconsistent-component-naming',
            },
          });
        }
      }

      // Check file name matches primary component
      if (this.config.checkFileNames) {
        const fileViolation = this.checkFileNaming(components, filePath);
        if (fileViolation) {
          violations.push(fileViolation);
        }
      }
    }

    return { violations };
  }

  private findComponents(content: string, filePath: string): ComponentInfo[] {
    const components: ComponentInfo[] = [];
    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const lineNumber = lineNum + 1;

      // Function component: function ComponentName() or export function ComponentName()
      const fnMatch = line.match(/^(\s*)(?:export\s+)?(?:default\s+)?function\s+(\w+)\s*\(/);
      if (fnMatch) {
        const name = fnMatch[2];
        if (this.looksLikeComponent(name, content, lineNum)) {
          components.push({
            name,
            type: 'function',
            line: lineNumber,
            column: fnMatch[1].length + 1,
            isPascalCase: this.isPascalCase(name),
            isExported: line.includes('export'),
            file: filePath,
          });
        }
        continue;
      }

      // Arrow function component: const ComponentName = () => or export const ComponentName = () =>
      const arrowMatch = line.match(/^(\s*)(?:export\s+)?(?:const|let)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:\([^)]*\)|[\w]+)\s*=>/);
      if (arrowMatch) {
        const name = arrowMatch[2];
        if (this.looksLikeComponent(name, content, lineNum)) {
          components.push({
            name,
            type: 'arrow',
            line: lineNumber,
            column: arrowMatch[1].length + 1,
            isPascalCase: this.isPascalCase(name),
            isExported: line.includes('export'),
            file: filePath,
          });
        }
        continue;
      }

      // Class component: class ComponentName extends React.Component
      const classMatch = line.match(/^(\s*)(?:export\s+)?(?:default\s+)?class\s+(\w+)\s+extends\s+(?:React\.)?(?:Component|PureComponent)/);
      if (classMatch) {
        const name = classMatch[2];
        components.push({
          name,
          type: 'class',
          line: lineNumber,
          column: classMatch[1].length + 1,
          isPascalCase: this.isPascalCase(name),
          isExported: line.includes('export'),
          file: filePath,
        });
      }
    }

    return components;
  }

  private looksLikeComponent(name: string, content: string, lineNum: number): boolean {
    // Get the next ~30 lines to check for JSX
    const lines = content.split('\n');
    const snippet = lines.slice(lineNum, lineNum + 30).join('\n');

    // Check for JSX patterns
    const jsxPatterns = [
      /<\w+/,           // JSX element
      /return\s*\(/,    // Return with paren (often JSX)
      /React\./,        // React usage
      /jsx/i,           // JSX mention
      /<\/\w+>/,        // Closing tag
      /<\w+\s*\/>/,     // Self-closing tag
    ];

    // If function returns JSX, it's likely a component
    return jsxPatterns.some(p => p.test(snippet));
  }

  private isPascalCase(name: string): boolean {
    // Must start with uppercase
    if (!/^[A-Z]/.test(name)) return false;
    
    // Should not be all uppercase
    if (/^[A-Z0-9_]+$/.test(name) && name.length > 3) return false;
    
    // Should contain at least one lowercase
    if (!/[a-z]/.test(name)) return false;
    
    return true;
  }

  private toPascalCase(name: string): string {
    // Handle snake_case
    if (name.includes('_')) {
      return name
        .split('_')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('');
    }
    
    // Handle camelCase
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  private checkFileNaming(components: ComponentInfo[], filePath: string): Violation | null {
    const fileName = path.basename(filePath, path.extname(filePath));
    
    // Skip index files
    if (fileName.toLowerCase() === 'index') return null;
    
    // Find the primary component (usually default export or first exported)
    const primaryComponent = components.find(c => c.isExported) || components[0];
    if (!primaryComponent) return null;

    // Check if file name matches component name
    if (primaryComponent.isPascalCase && fileName !== primaryComponent.name) {
      // Allow some common variations
      if (fileName.toLowerCase() === primaryComponent.name.toLowerCase()) {
        this.violationCounter++;
        
        return {
          id: `naming-${String(this.violationCounter).padStart(3, '0')}`,
          ruleId: this.id,
          ruleName: this.name,
          severity: 'info',
          message: `File name '${fileName}' should match component name '${primaryComponent.name}'`,
          file: filePath,
          line: 1,
          suggestion: `Consider renaming file to '${primaryComponent.name}${path.extname(filePath)}'`,
          metadata: {
            fileName,
            componentName: primaryComponent.name,
            aiErrorType: 'file-component-mismatch',
          },
        };
      }
    }

    return null;
  }
}
