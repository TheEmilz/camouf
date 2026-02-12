/**
 * Prop Drilling Detection Rule
 * 
 * Detects when props are passed through multiple layers of components
 * without being used. AI assistants often generate code that passes props
 * through many levels instead of using Context or state management.
 * 
 * Examples:
 * - A prop passed through 3+ components without modification
 * - Same prop name appearing in deeply nested component chains
 */

import type { IRule, RuleContext, RuleResult, RuleConfig } from 'camouf/rules';
import type { Violation, GraphNode } from 'camouf';
import * as path from 'path';

interface PropDrillingConfig extends RuleConfig {
  /** Maximum depth before flagging prop drilling */
  maxDepth?: number;
  /** Ignore common props like className, style, children */
  ignoreCommonProps?: boolean;
}

interface PropUsage {
  propName: string;
  componentName: string;
  file: string;
  line: number;
  isUsed: boolean;
  isPassedDown: boolean;
}

interface PropChain {
  propName: string;
  chain: PropUsage[];
  depth: number;
}

export class PropDrillingDetectionRule implements IRule {
  readonly id = 'react/prop-drilling-detection';
  readonly name = 'Prop Drilling Detection';
  readonly description = 'Detects props passed through multiple component layers without use';
  readonly severity = 'warning' as const;
  readonly tags = ['react', 'architecture', 'ai-safety'];
  readonly category = 'architecture' as const;
  readonly supportsIncremental = false;

  private config: PropDrillingConfig = {
    enabled: true,
    severity: 'warning',
    maxDepth: 3,
    ignoreCommonProps: true,
  };

  private violationCounter = 0;

  // Common props that are often legitimately passed through
  private readonly commonProps = new Set([
    // Layout & styling
    'className', 'style', 'children', 'id', 'key', 'ref',
    // Event handlers
    'onClick', 'onChange', 'onSubmit', 'onBlur', 'onFocus',
    'onKeyDown', 'onKeyUp', 'onMouseDown', 'onMouseUp', 'onScroll',
    // UI state
    'disabled', 'loading', 'visible', 'hidden', 'active', 'selected',
    'checked', 'open', 'closed', 'expanded', 'collapsed',
    // Component variants
    'as', 'component', 'variant', 'size', 'color', 'type', 'theme',
    'mode', 'layout', 'orientation', 'position', 'align',
    // Very generic names that appear across unrelated components
    'data', 'value', 'values', 'name', 'label', 'title', 'text',
    'description', 'placeholder', 'content', 'message', 'error',
    'status', 'state', 'result', 'results', 'item', 'items',
    'list', 'options', 'config', 'settings', 'info',
    'count', 'total', 'index', 'level', 'depth',
    'width', 'height', 'min', 'max', 'step',
    'src', 'href', 'url', 'path', 'icon', 'image',
    'header', 'footer', 'prefix', 'suffix',
    'onClose', 'onOpen', 'onSelect', 'onDelete', 'onEdit', 'onSave',
    'onCancel', 'onConfirm', 'onError', 'onSuccess', 'onLoad',
    'renderItem', 'render', 'fallback',
  ]);

  configure(options: Partial<PropDrillingConfig>): void {
    this.config = { ...this.config, ...options };
  }

  async check(context: RuleContext): Promise<RuleResult> {
    const violations: Violation[] = [];
    this.violationCounter = 0;

    // Collect all component prop information
    const componentProps = new Map<string, Map<string, PropUsage[]>>();

    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (!node) continue;

      const filePath = node.data.relativePath;
      const content = context.fileContents?.get(filePath);
      if (!content) continue;

      const ext = path.extname(filePath).toLowerCase();
      if (!['.tsx', '.jsx'].includes(ext)) continue;

      const propsInfo = this.analyzeComponentProps(content, filePath);
      componentProps.set(filePath, propsInfo);
    }

    // Analyze prop chains using the dependency graph
    const propChains = this.findPropChains(componentProps, context);

    // Report violations for deep prop drilling
    for (const chain of propChains) {
      if (chain.depth >= this.config.maxDepth!) {
        this.violationCounter++;
        
        const startComponent = chain.chain[0];
        const endComponent = chain.chain[chain.chain.length - 1];
        
        violations.push({
          id: `drill-${String(this.violationCounter).padStart(3, '0')}`,
          ruleId: this.id,
          ruleName: this.name,
          severity: this.config.severity as 'error' | 'warning' | 'info',
          message: `Prop '${chain.propName}' is drilled through ${chain.depth} components from ${startComponent.componentName} to ${endComponent.componentName}`,
          file: endComponent.file,
          line: endComponent.line,
          suggestion: `Consider using React Context or a state management solution to avoid prop drilling`,
          metadata: {
            propName: chain.propName,
            drillingDepth: chain.depth,
            componentChain: chain.chain.map(c => c.componentName),
            aiErrorType: 'prop-drilling',
          },
        });
      }
    }

    return { violations };
  }

  private analyzeComponentProps(content: string, filePath: string): Map<string, PropUsage[]> {
    const propsMap = new Map<string, PropUsage[]>();
    const lines = content.split('\n');

    // Find component definitions
    const componentPattern = /(?:function\s+|const\s+|let\s+)(\w+)\s*(?::\s*\w+)?\s*=?\s*(?:\([^)]*\)|(?:async\s+)?\([^)]*\))\s*(?::\s*[^=>{]+)?\s*(?:=>|{)/g;
    
    let match;
    const fullContent = content;
    
    while ((match = componentPattern.exec(fullContent)) !== null) {
      const componentName = match[1];
      if (!this.isPascalCase(componentName)) continue;

      const lineNum = fullContent.substring(0, match.index).split('\n').length;
      
      // Extract props from function signature
      const propsInSignature = this.extractPropsFromSignature(match[0]);
      
      // Find the component body
      const componentBody = this.extractComponentBody(fullContent, match.index);
      if (!componentBody) continue;

      // Analyze which props are used vs passed down
      for (const propName of propsInSignature) {
        if (this.config.ignoreCommonProps && this.commonProps.has(propName)) continue;

        const usage: PropUsage = {
          propName,
          componentName,
          file: filePath,
          line: lineNum,
          isUsed: this.isPropUsedDirectly(propName, componentBody),
          isPassedDown: this.isPropPassedToChild(propName, componentBody),
        };

        const existing = propsMap.get(propName) || [];
        existing.push(usage);
        propsMap.set(propName, existing);
      }
    }

    return propsMap;
  }

  private extractPropsFromSignature(signature: string): string[] {
    const props: string[] = [];
    
    // Destructured props: ({ prop1, prop2 })
    const destructuredMatch = signature.match(/\(\s*{\s*([^}]+)\s*}/);
    if (destructuredMatch) {
      const propsStr = destructuredMatch[1];
      // Split by comma, handling default values
      const propMatches = propsStr.matchAll(/(\w+)\s*(?:=|:|,|$)/g);
      for (const m of propMatches) {
        props.push(m[1]);
      }
    }

    // Props object: (props) and then props.x access
    const propsObjMatch = signature.match(/\(\s*(\w+)\s*(?::|,|\))/);
    if (propsObjMatch && propsObjMatch[1] !== '{') {
      // Will need to analyze body for props.x patterns
    }

    return props;
  }

  private extractComponentBody(content: string, startIndex: number): string | null {
    // Find the opening brace after the arrow/function
    const afterStart = content.substring(startIndex);
    const arrowOrBrace = afterStart.match(/(?:=>|function[^{]*)\s*{/);
    
    if (!arrowOrBrace) {
      // Might be an implicit return arrow function
      const implicitReturn = afterStart.match(/=>\s*\(/);
      if (implicitReturn) {
        // Find matching closing paren
        return this.extractParenContent(afterStart, afterStart.indexOf('=>') + 2);
      }
      return null;
    }

    const braceStart = startIndex + (arrowOrBrace.index || 0) + arrowOrBrace[0].length - 1;
    return this.extractBraceContent(content, braceStart);
  }

  private extractBraceContent(content: string, startIndex: number): string {
    let depth = 0;
    let started = false;
    let result = '';

    for (let i = startIndex; i < content.length && i < startIndex + 5000; i++) {
      const char = content[i];
      
      if (char === '{') {
        depth++;
        started = true;
      }
      if (started) {
        result += char;
      }
      if (char === '}') {
        depth--;
        if (depth === 0 && started) {
          return result;
        }
      }
    }

    return result;
  }

  private extractParenContent(content: string, startIndex: number): string {
    let depth = 0;
    let started = false;
    let result = '';

    for (let i = startIndex; i < content.length && i < startIndex + 5000; i++) {
      const char = content[i];
      
      if (char === '(') {
        depth++;
        started = true;
      }
      if (started) {
        result += char;
      }
      if (char === ')') {
        depth--;
        if (depth === 0 && started) {
          return result;
        }
      }
    }

    return result;
  }

  private isPropUsedDirectly(propName: string, body: string): boolean {
    // Check if prop is used in logic, not just passed to children
    const usagePatterns = [
      new RegExp(`\\b${propName}\\s*[=!<>]`, 'g'),        // Comparison
      new RegExp(`\\b${propName}\\s*\\?`, 'g'),           // Ternary
      new RegExp(`\\b${propName}\\s*&&`, 'g'),            // Logical
      new RegExp(`\\b${propName}\\.\\w+`, 'g'),           // Property access
      new RegExp(`\\b${propName}\\s*\\(`, 'g'),           // Function call
      new RegExp(`\\{\\s*${propName}\\s*\\}`, 'g'),       // JSX expression (rendering)
      new RegExp(`\\$\\{\\s*${propName}\\s*\\}`, 'g'),    // Template literal
    ];

    return usagePatterns.some(p => p.test(body));
  }

  private isPropPassedToChild(propName: string, body: string): boolean {
    // Check if prop is passed to a child component
    const passPatterns = [
      new RegExp(`<\\w+[^>]*\\b${propName}\\s*=`, 'g'),           // Named prop
      new RegExp(`<\\w+[^>]*\\b${propName}\\s*\\}`, 'g'),         // Shorthand
      new RegExp(`\\.\\.\\.[^}]*${propName}`, 'g'),               // Spread
    ];

    return passPatterns.some(p => p.test(body));
  }

  private isPascalCase(name: string): boolean {
    return /^[A-Z][a-zA-Z0-9]*$/.test(name);
  }

  private findPropChains(
    componentProps: Map<string, Map<string, PropUsage[]>>,
    context: RuleContext
  ): PropChain[] {
    const chains: PropChain[] = [];
    const propToUsages = new Map<string, PropUsage[]>();

    // Build a set of files that import each other for parent→child verification
    const importGraph = new Map<string, Set<string>>();
    // Initialize all nodes
    for (const nodeId of context.graph.nodes()) {
      const node = context.getNodeData(nodeId);
      if (node) {
        importGraph.set(node.data.relativePath, new Set<string>());
      }
    }
    // Use edges to build import relationships
    for (const edge of context.graph.edges()) {
      const sourceNode = context.getNodeData(edge.v);
      const targetNode = context.getNodeData(edge.w);
      if (sourceNode && targetNode) {
        const imports = importGraph.get(sourceNode.data.relativePath);
        if (imports) {
          imports.add(targetNode.data.relativePath);
        }
      }
    }

    // Flatten all prop usages
    for (const [_file, propsMap] of componentProps) {
      for (const [propName, usages] of propsMap) {
        const existing = propToUsages.get(propName) || [];
        existing.push(...usages);
        propToUsages.set(propName, existing);
      }
    }

    // Find chains where prop is passed through without being used
    for (const [propName, usages] of propToUsages) {
      // Count components that pass this prop without using it
      const passOnlyUsages = usages.filter(u => u.isPassedDown && !u.isUsed);
      
      if (passOnlyUsages.length >= (this.config.maxDepth! - 1)) {
        // Verify there's an actual import chain between the files
        // (at least some files must import others in the chain)
        const files = usages.map(u => u.file);
        const hasRealChain = this.verifyImportChain(files, importGraph);
        
        if (hasRealChain) {
          chains.push({
            propName,
            chain: usages,
            depth: passOnlyUsages.length + 1,
          });
        }
      }
    }

    return chains;
  }

  /**
   * Verify that the files form a real import chain (at least one file imports another).
   * This prevents false positives from unrelated components sharing a common prop name.
   */
  private verifyImportChain(files: string[], importGraph: Map<string, Set<string>>): boolean {
    const uniqueFiles = [...new Set(files)];
    if (uniqueFiles.length <= 1) return false;

    // Check if at least one pair of files has an import relationship
    for (const file of uniqueFiles) {
      const imports = importGraph.get(file);
      if (!imports) continue;
      for (const otherFile of uniqueFiles) {
        if (file !== otherFile && imports.has(otherFile)) {
          return true;
        }
      }
    }

    return false;
  }
}
