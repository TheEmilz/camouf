/**
 * Camouf Plugin: React
 * 
 * React-specific rules for Camouf that catch AI-generated React code errors.
 * 
 * Rules included:
 * - react/missing-dependency-array: Detects hooks with missing dependencies
 * - react/inconsistent-component-naming: Enforces PascalCase for components
 * - react/prop-drilling-detection: Detects excessive prop drilling
 * - react/stale-closure-patterns: Detects stale closure bugs in hooks
 */

import type { CamoufPlugin, PluginLoadContext } from 'camouf';
import type { IRule } from 'camouf/rules';

// Import rules
import { MissingDependencyArrayRule } from './rules/missing-dependency-array.js';
import { InconsistentComponentNamingRule } from './rules/inconsistent-component-naming.js';
import { PropDrillingDetectionRule } from './rules/prop-drilling-detection.js';
import { StaleClosurePatternsRule } from './rules/stale-closure-patterns.js';

/**
 * Create all React rules
 */
function createRules(): IRule[] {
  return [
    new MissingDependencyArrayRule(),
    new InconsistentComponentNamingRule(),
    new PropDrillingDetectionRule(),
    new StaleClosurePatternsRule(),
  ];
}

/**
 * The Camouf React Plugin
 */
const plugin: CamoufPlugin = {
  metadata: {
    name: 'camouf-plugin-react',
    version: '0.2.0',
    displayName: 'Camouf React Plugin',
    description: 'React-specific rules for Camouf - catches AI-generated React code errors like missing hook dependencies, stale closures, and prop drilling',
    author: 'TheEmilz',
    homepage: 'https://github.com/TheEmilz/camouf/tree/main/camouf-plugin-react',
    types: ['rules'],
    camoufVersion: '>=0.7.0',
    keywords: [
      'react',
      'hooks',
      'useEffect',
      'useState',
      'ai',
      'linter',
      'architecture',
      'prop-drilling',
      'stale-closure',
    ],
  },

  rules: createRules(),

  onLoad(context: PluginLoadContext): void {
    context.log.info(`🔌 Camouf React Plugin v${this.metadata.version} loaded`);
    context.log.info(`   📏 ${this.rules?.length || 0} rules available`);
  },

  onUnload(): void {
    // Cleanup if needed
  },
};

export default plugin;

// Also export named for flexibility
export { plugin };

// Export individual rules for direct usage
export { MissingDependencyArrayRule } from './rules/missing-dependency-array.js';
export { InconsistentComponentNamingRule } from './rules/inconsistent-component-naming.js';
export { PropDrillingDetectionRule } from './rules/prop-drilling-detection.js';
export { StaleClosurePatternsRule } from './rules/stale-closure-patterns.js';
