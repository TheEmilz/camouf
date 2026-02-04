/**
 * Project Detector
 * 
 * Automatically detects project structure, languages, and frameworks.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import fg from 'fast-glob';
import { SupportedLanguage } from '../../types/config.types.js';
import { Logger } from '../logger.js';

interface ProjectDetection {
  languages: SupportedLanguage[];
  directories: {
    client: string[];
    server: string[];
    shared: string[];
  };
  framework?: string;
  packageManager?: 'npm' | 'yarn' | 'pnpm';
  monorepo?: boolean;
}

interface FrameworkIndicator {
  name: string;
  files?: string[];
  dependencies?: string[];
  directories?: string[];
}

export class ProjectDetector {
  private readonly frameworkIndicators: FrameworkIndicator[] = [
    // Frontend frameworks
    { name: 'next.js', files: ['next.config.js', 'next.config.mjs'], dependencies: ['next'] },
    { name: 'nuxt', files: ['nuxt.config.js', 'nuxt.config.ts'], dependencies: ['nuxt'] },
    { name: 'react', files: [], dependencies: ['react', 'react-dom'] },
    { name: 'vue', dependencies: ['vue'], files: ['vue.config.js'] },
    { name: 'angular', files: ['angular.json'], dependencies: ['@angular/core'] },
    { name: 'svelte', dependencies: ['svelte'], files: ['svelte.config.js'] },
    
    // Backend frameworks
    { name: 'express', files: [], dependencies: ['express'] },
    { name: 'nestjs', files: [], dependencies: ['@nestjs/core'] },
    { name: 'fastify', files: [], dependencies: ['fastify'] },
    { name: 'koa', files: [], dependencies: ['koa'] },
    { name: 'hapi', files: [], dependencies: ['@hapi/hapi'] },
    
    // Fullstack
    { name: 'remix', files: [], dependencies: ['@remix-run/react'] },
    { name: 'astro', files: [], dependencies: ['astro'] },
    
    // Python
    { name: 'django', files: ['manage.py'], dependencies: ['django'] },
    { name: 'flask', files: [], dependencies: ['flask'] },
    { name: 'fastapi', files: [], dependencies: ['fastapi'] },
    
    // Java
    { name: 'spring', files: ['pom.xml'], directories: ['src/main/java'] },
    { name: 'gradle', files: ['build.gradle', 'build.gradle.kts'] },
    
    // Go
    { name: 'go-module', files: ['go.mod'] },
    
    // Rust
    { name: 'cargo', files: ['Cargo.toml'] },
  ];

  private readonly directoryPatterns = {
    client: [
      'client', 'frontend', 'web', 'app', 'apps/web', 'apps/client',
      'packages/web', 'packages/client', 'packages/frontend',
      'src/app', 'src/client', 'src/frontend', 'src/web',
      'pages', 'components', 'views',
    ],
    server: [
      'server', 'backend', 'api', 'apps/api', 'apps/server',
      'packages/api', 'packages/server', 'packages/backend',
      'src/server', 'src/api', 'src/backend',
      'services', 'functions', 'lambda',
    ],
    shared: [
      'shared', 'common', 'lib', 'libs', 'core',
      'packages/shared', 'packages/common', 'packages/core',
      'src/shared', 'src/common', 'src/lib',
      'types', 'utils', 'helpers',
    ],
  };

  /**
   * Detect project structure and configuration
   */
  async detect(rootDir: string): Promise<ProjectDetection> {
    Logger.debug(`Detecting project structure in ${rootDir}`);

    const [languages, directories, packageInfo] = await Promise.all([
      this.detectLanguages(rootDir),
      this.detectDirectories(rootDir),
      this.detectPackageInfo(rootDir),
    ]);

    const framework = await this.detectFramework(rootDir, packageInfo.dependencies);
    const monorepo = await this.detectMonorepo(rootDir);

    return {
      languages,
      directories,
      framework,
      packageManager: packageInfo.packageManager,
      monorepo,
    };
  }

  /**
   * Detect programming languages used in the project
   */
  private async detectLanguages(rootDir: string): Promise<SupportedLanguage[]> {
    const languages: Set<SupportedLanguage> = new Set();

    const languageExtensions: Record<string, SupportedLanguage> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.mts': 'typescript',
      '.cts': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cs': 'csharp',
      '.kt': 'kotlin',
      '.kts': 'kotlin',
    };

    // Sample files to detect languages (limit for performance)
    const sampleFiles = await fg('**/*', {
      cwd: rootDir,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/vendor/**'],
      onlyFiles: true,
      deep: 4,
      suppressErrors: true,
    });

    const extensionCounts = new Map<string, number>();

    for (const file of sampleFiles.slice(0, 1000)) {
      const ext = path.extname(file).toLowerCase();
      if (languageExtensions[ext]) {
        extensionCounts.set(ext, (extensionCounts.get(ext) || 0) + 1);
      }
    }

    // Add languages with significant presence (more than 1 file)
    for (const [ext, count] of extensionCounts) {
      if (count > 1 && languageExtensions[ext]) {
        languages.add(languageExtensions[ext]);
      }
    }

    // Check for configuration files as hints
    const configFiles = await fg([
      'tsconfig.json', 'jsconfig.json', 'setup.py', 'pyproject.toml',
      'pom.xml', 'build.gradle', 'go.mod', 'Cargo.toml', '*.csproj',
    ], {
      cwd: rootDir,
      suppressErrors: true,
    });

    for (const file of configFiles) {
      const fileName = path.basename(file).toLowerCase();
      if (fileName === 'tsconfig.json') languages.add('typescript');
      if (fileName === 'jsconfig.json') languages.add('javascript');
      if (fileName === 'setup.py' || fileName === 'pyproject.toml') languages.add('python');
      if (fileName === 'pom.xml' || fileName === 'build.gradle') languages.add('java');
      if (fileName === 'go.mod') languages.add('go');
      if (fileName === 'cargo.toml') languages.add('rust');
      if (fileName.endsWith('.csproj')) languages.add('csharp');
    }

    // Default to TypeScript/JavaScript if nothing detected
    if (languages.size === 0) {
      languages.add('typescript');
      languages.add('javascript');
    }

    return Array.from(languages);
  }

  /**
   * Detect directory structure
   */
  private async detectDirectories(rootDir: string): Promise<ProjectDetection['directories']> {
    const directories = await fg('**/', {
      cwd: rootDir,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
      onlyDirectories: true,
      deep: 3,
      suppressErrors: true,
    });

    const result: ProjectDetection['directories'] = {
      client: [],
      server: [],
      shared: [],
    };

    for (const dir of directories) {
      const normalizedDir = dir.replace(/\/$/, '');
      const dirName = path.basename(normalizedDir).toLowerCase();

      // Check client patterns
      if (this.matchesPatterns(normalizedDir, this.directoryPatterns.client)) {
        result.client.push(normalizedDir);
      }

      // Check server patterns
      if (this.matchesPatterns(normalizedDir, this.directoryPatterns.server)) {
        result.server.push(normalizedDir);
      }

      // Check shared patterns
      if (this.matchesPatterns(normalizedDir, this.directoryPatterns.shared)) {
        result.shared.push(normalizedDir);
      }
    }

    // If no directories found, use reasonable defaults
    if (result.client.length === 0 && result.server.length === 0) {
      // Check if src exists
      const srcExists = directories.some(d => d === 'src/' || d === 'src');
      if (srcExists) {
        result.client.push('src');
      }
    }

    return result;
  }

  /**
   * Detect package manager and dependencies
   */
  private async detectPackageInfo(rootDir: string): Promise<{
    packageManager?: 'npm' | 'yarn' | 'pnpm';
    dependencies: string[];
  }> {
    let packageManager: 'npm' | 'yarn' | 'pnpm' | undefined;
    const dependencies: string[] = [];

    // Check for lock files
    const lockFiles = await fg(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'], {
      cwd: rootDir,
      suppressErrors: true,
    });

    if (lockFiles.includes('pnpm-lock.yaml')) packageManager = 'pnpm';
    else if (lockFiles.includes('yarn.lock')) packageManager = 'yarn';
    else if (lockFiles.includes('package-lock.json')) packageManager = 'npm';

    // Read package.json for dependencies
    try {
      const packageJsonPath = path.join(rootDir, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      if (packageJson.dependencies) {
        dependencies.push(...Object.keys(packageJson.dependencies));
      }
      if (packageJson.devDependencies) {
        dependencies.push(...Object.keys(packageJson.devDependencies));
      }
    } catch {
      // No package.json or not a Node.js project
    }

    return { packageManager, dependencies };
  }

  /**
   * Detect framework used
   */
  private async detectFramework(rootDir: string, dependencies: string[]): Promise<string | undefined> {
    const files = await fg('*', {
      cwd: rootDir,
      onlyFiles: true,
      suppressErrors: true,
    });

    for (const indicator of this.frameworkIndicators) {
      // Check files
      if (indicator.files) {
        const hasFile = indicator.files.some(f => files.includes(f));
        if (hasFile) {
          return indicator.name;
        }
      }

      // Check dependencies
      if (indicator.dependencies) {
        const hasDep = indicator.dependencies.some(d => dependencies.includes(d));
        if (hasDep) {
          return indicator.name;
        }
      }
    }

    return undefined;
  }

  /**
   * Detect if project is a monorepo
   */
  private async detectMonorepo(rootDir: string): Promise<boolean> {
    try {
      // Check for common monorepo indicators
      const indicators = await fg([
        'lerna.json',
        'pnpm-workspace.yaml',
        'rush.json',
        'nx.json',
        'turbo.json',
        'packages/*',
        'apps/*',
      ], {
        cwd: rootDir,
        suppressErrors: true,
      });

      if (indicators.length > 0) {
        return true;
      }

      // Check package.json for workspaces
      try {
        const packageJsonPath = path.join(rootDir, 'package.json');
        const content = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(content);

        if (packageJson.workspaces) {
          return true;
        }
      } catch {
        // No package.json
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check if directory matches any patterns
   */
  private matchesPatterns(dir: string, patterns: string[]): boolean {
    const normalizedDir = dir.toLowerCase().replace(/\\/g, '/');
    return patterns.some(pattern => {
      const normalizedPattern = pattern.toLowerCase();
      return normalizedDir === normalizedPattern || 
             normalizedDir.endsWith('/' + normalizedPattern) ||
             normalizedDir.includes('/' + normalizedPattern + '/');
    });
  }
}
