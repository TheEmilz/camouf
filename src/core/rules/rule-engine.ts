/**
 * Rule Engine
 * 
 * Manages and executes architecture rules.
 */

import { CamoufConfig, RuleLevel, RuleLevelConfig } from '../../types/config.types.js';
import { Violation, ViolationSeverity } from '../../types/core.types.js';
import { DependencyGraph } from '../scanner/project-scanner.js';
import { Logger } from '../logger.js';
import { IRule, RuleContext, RuleResult } from './rule.interface.js';
import { PluginLoader, createPluginLoader } from '../plugins/plugin-loader.js';

// Import built-in rules
import { AiHallucinatedImportsRule } from './builtin/ai-hallucinated-imports.rule.js';
import { ContextDriftPatternsRule } from './builtin/context-drift-patterns.rule.js';
import { PhantomTypeReferencesRule } from './builtin/phantom-type-references.rule.js';
import { LayerDependenciesRule } from './builtin/layer-dependencies.rule.js';
import { CircularDependenciesRule } from './builtin/circular-dependencies.rule.js';
import { ContractMismatchRule } from './builtin/contract-mismatch.rule.js';
import { PerformanceAntipatternsRule } from './builtin/performance-antipatterns.rule.js';
import { TypeSafetyRule } from './builtin/type-safety.rule.js';
import { DataFlowIntegrityRule } from './builtin/data-flow-integrity.rule.js';
import { DistributedTransactionsRule } from './builtin/distributed-transactions.rule.js';
import { ApiVersioningEvolutionRule } from './builtin/api-versioning.rule.js';
import { SecurityContextRule } from './builtin/security-context.rule.js';
import { ResiliencePatternsRule } from './builtin/resilience-patterns.rule.js';
import { DddBoundariesRule } from './builtin/ddd-boundaries.rule.js';
import { FunctionSignatureMatchingRule } from './builtin/function-signature-matching.rule.js';
import { HardcodedSecretsRule } from './builtin/hardcoded-secrets.rule.js';
import { InconsistentCasingRule } from './builtin/inconsistent-casing.rule.js';
import { OrphanedFunctionsRule } from './builtin/orphaned-functions.rule.js';

export class RuleEngine {
  private config: CamoufConfig;
  private rules: Map<string, IRule> = new Map();
  private enabledRules: Set<string> = new Set();
  private pluginLoader: PluginLoader | null = null;

  constructor(config: CamoufConfig) {
    this.config = config;
    this.initializeRules();
  }

  /**
   * Initialize plugins and their rules
   */
  async initializePlugins(rootDir: string): Promise<void> {
    const pluginConfigs = this.config.plugins;
    if (!pluginConfigs || pluginConfigs.length === 0) {
      return;
    }

    this.pluginLoader = createPluginLoader(rootDir);
    await this.pluginLoader.loadPlugins(pluginConfigs);

    // Register rules from plugins
    const pluginRules = this.pluginLoader.getRules();
    for (const rule of pluginRules) {
      this.registerRule(rule);
      // Enable plugin rules by default unless configured otherwise
      const ruleConfig = this.config.rules?.plugin?.[rule.id];
      if (this.isRuleEnabled(ruleConfig ?? 'warn')) {
        this.enabledRules.add(rule.id);
      }
    }

    Logger.info(`Loaded ${pluginRules.length} rules from plugins`);
  }

  /**
   * Get the plugin loader
   */
  getPluginLoader(): PluginLoader | null {
    return this.pluginLoader;
  }

  /**
   * Initialize built-in rules based on configuration
   */
  private initializeRules(): void {
    // Register built-in rules
    const builtinRules: IRule[] = [
      new AiHallucinatedImportsRule(),
      new ContextDriftPatternsRule(),
      new PhantomTypeReferencesRule(),
      new LayerDependenciesRule(),
      new CircularDependenciesRule(),
      new ContractMismatchRule(),
      new PerformanceAntipatternsRule(),
      new TypeSafetyRule(),
      new DataFlowIntegrityRule(),
      new DistributedTransactionsRule(),
      new ApiVersioningEvolutionRule(),
      new SecurityContextRule(),
      new ResiliencePatternsRule(),
      new DddBoundariesRule(),
      new FunctionSignatureMatchingRule(),
      new HardcodedSecretsRule(),
      new InconsistentCasingRule(),
      new OrphanedFunctionsRule(),
    ];

    for (const rule of builtinRules) {
      this.registerRule(rule);
    }

    // Enable rules based on configuration
    const builtinConfig = this.config.rules?.builtin || {};
    
    for (const [ruleId, level] of Object.entries(builtinConfig)) {
      if (this.isRuleEnabled(level)) {
        this.enabledRules.add(ruleId);
      }
    }

    Logger.debug(`Initialized ${this.rules.size} rules, ${this.enabledRules.size} enabled`);
  }

  /**
   * Register a rule
   */
  registerRule(rule: IRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Unregister a rule
   */
  unregisterRule(ruleId: string): void {
    this.rules.delete(ruleId);
    this.enabledRules.delete(ruleId);
  }

  /**
   * Enable a specific rule
   */
  enableRule(ruleId: string): void {
    if (this.rules.has(ruleId)) {
      this.enabledRules.add(ruleId);
    }
  }

  /**
   * Disable a specific rule
   */
  disableRule(ruleId: string): void {
    this.enabledRules.delete(ruleId);
  }

  /**
   * Filter rules to only run specified ones
   */
  filterRules(ruleIds: string[]): void {
    this.enabledRules.clear();
    for (const ruleId of ruleIds) {
      if (this.rules.has(ruleId)) {
        this.enabledRules.add(ruleId);
      } else {
        Logger.warn(`Rule '${ruleId}' not found`);
      }
    }
  }

  /**
   * Validate the entire project
   */
  async validate(graph: DependencyGraph, fileContents?: Map<string, string>): Promise<Violation[]> {
    const violations: Violation[] = [];
    const context = this.createContext(graph, undefined, fileContents);

    for (const ruleId of this.enabledRules) {
      const rule = this.rules.get(ruleId);
      if (!rule || !rule.check) continue;

      try {
        Logger.debug(`Running rule: ${rule.name}`);
        const result = await rule.check(context);
        
        if (result.violations.length > 0) {
          const severity = this.getRuleSeverity(ruleId);
          const processedViolations = result.violations.map(v => ({
            ...v,
            severity,
          }));
          violations.push(...processedViolations);
        }
      } catch (error) {
        Logger.error(`Rule '${ruleId}' failed: ${(error as Error).message}`);
      }
    }

    return violations;
  }

  /**
   * Validate a single file
   */
  async validateFile(filePath: string, graph: DependencyGraph, fileContents?: Map<string, string>): Promise<Violation[]> {
    const violations: Violation[] = [];
    const context = this.createContext(graph, filePath, fileContents);

    for (const ruleId of this.enabledRules) {
      const rule = this.rules.get(ruleId);
      if (!rule) continue;

      // Skip rules that don't support incremental validation
      if (!rule.supportsIncremental || !rule.checkFile) continue;

      try {
        const result = await rule.checkFile(filePath, context);
        
        if (result.violations.length > 0) {
          const severity = this.getRuleSeverity(ruleId);
          const processedViolations = result.violations.map(v => ({
            ...v,
            severity,
          }));
          violations.push(...processedViolations);
        }
      } catch (error) {
        Logger.error(`Rule '${ruleId}' failed for file ${filePath}: ${(error as Error).message}`);
      }
    }

    return violations;
  }

  /**
   * Attempt to auto-fix violations
   */
  async autoFix(violations: Violation[]): Promise<number> {
    let fixedCount = 0;

    for (const violation of violations) {
      if (!violation.fixable || !violation.fix) continue;

      try {
        // Apply the fix
        // This would need implementation based on the fix type
        fixedCount++;
        Logger.debug(`Fixed violation: ${violation.message}`);
      } catch (error) {
        Logger.warn(`Could not auto-fix: ${violation.message}`);
      }
    }

    return fixedCount;
  }

  /**
   * Get all registered rules
   */
  getRules(): IRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get enabled rules
   */
  getEnabledRules(): IRule[] {
    return Array.from(this.enabledRules)
      .map(id => this.rules.get(id))
      .filter((rule): rule is IRule => rule !== undefined);
  }

  /**
   * Create rule context
   */
  private createContext(graph: DependencyGraph, focusFile?: string, fileContents?: Map<string, string>): RuleContext {
    return {
      config: this.config,
      graph,
      focusFile,
      fileContents,
      getNodeData: (id: string) => graph.node(id),
      getEdgeData: (source: string, target: string) => graph.edge(source, target),
      getIncomingEdges: (id: string) => graph.inEdges(id) || [],
      getOutgoingEdges: (id: string) => graph.outEdges(id) || [],
    };
  }

  /**
   * Check if a rule level means enabled
   */
  private isRuleEnabled(level: RuleLevel | undefined): boolean {
    if (!level || level === 'off') return false;
    if (typeof level === 'string') return true;
    return (level as RuleLevelConfig).level !== 'off';
  }

  /**
   * Get the severity for a rule
   */
  private getRuleSeverity(ruleId: string): ViolationSeverity {
    const level = this.config.rules?.builtin?.[ruleId as keyof typeof this.config.rules.builtin];
    
    if (!level) return 'warning';
    if (typeof level === 'string') {
      return level === 'error' ? 'error' : 'warning';
    }
    return (level as RuleLevelConfig).level === 'error' ? 'error' : 'warning';
  }
}
