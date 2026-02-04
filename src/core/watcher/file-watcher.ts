/**
 * File Watcher
 * 
 * Monitors file system changes and triggers analysis.
 */

import chokidar, { FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import * as path from 'path';
import { CamoufConfig } from '../../types/config.types.js';
import { FileChangeEvent } from '../../types/core.types.js';
import { Logger } from '../logger.js';

interface FileWatcherOptions {
  debounce?: number;
  additionalIgnore?: string[];
}

export class FileWatcher extends EventEmitter {
  private config: CamoufConfig;
  private options: FileWatcherOptions;
  private watcher: FSWatcher | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: CamoufConfig, options: FileWatcherOptions = {}) {
    super();
    this.config = config;
    this.options = {
      debounce: options.debounce || 300,
      additionalIgnore: options.additionalIgnore || [],
    };
  }

  /**
   * Start watching for file changes
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      const watchPatterns = this.config.patterns.include.map(pattern => 
        path.join(this.config.root, pattern)
      );

      const ignorePatterns = [
        ...this.config.patterns.exclude,
        ...this.options.additionalIgnore || [],
      ];

      Logger.info(`Starting file watcher on ${this.config.root}`);
      Logger.info(`Watch patterns: ${watchPatterns.join(', ')}`);
      Logger.info(`Ignore patterns: ${ignorePatterns.join(', ')}`);

      this.watcher = chokidar.watch(watchPatterns, {
        ignored: ignorePatterns,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 200,
        },
        usePolling: true,  // Enable polling for better Windows compatibility
        interval: 500,     // Increased for Windows
        binaryInterval: 500,
      });

      this.watcher
        .on('add', (filePath) => {
          Logger.info(`[CHOKIDAR] File added: ${filePath}`);
          this.handleFileChange(filePath, 'add');
        })
        .on('change', (filePath) => {
          Logger.info(`[CHOKIDAR] File changed: ${filePath}`);
          this.handleFileChange(filePath, 'change');
        })
        .on('unlink', (filePath) => {
          Logger.info(`[CHOKIDAR] File removed: ${filePath}`);
          this.handleFileChange(filePath, 'unlink');
        })
        .on('error', (error) => this.emit('error', error))
        .on('ready', () => {
          Logger.info('[CHOKIDAR] File watcher ready and listening');
          this.emit('ready');
          resolve(); // Resolve when watcher is ready
        });
    });
  }

  /**
   * Stop watching for file changes
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      
      // Clear all debounce timers
      for (const timer of this.debounceTimers.values()) {
        clearTimeout(timer);
      }
      this.debounceTimers.clear();
      
      Logger.debug('File watcher stopped');
    }
  }

  /**
   * Check if watcher is active
   */
  isWatching(): boolean {
    return this.watcher !== null;
  }

  /**
   * Add a specific path to watch
   */
  addPath(filePath: string): void {
    if (this.watcher) {
      this.watcher.add(filePath);
      Logger.debug(`Added watch path: ${filePath}`);
    }
  }

  /**
   * Remove a specific path from watching
   */
  removePath(filePath: string): void {
    if (this.watcher) {
      this.watcher.unwatch(filePath);
      Logger.debug(`Removed watch path: ${filePath}`);
    }
  }

  /**
   * Handle file change with debouncing
   */
  private handleFileChange(filePath: string, changeType: 'add' | 'change' | 'unlink'): void {
    // Clear existing debounce timer for this file
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.emitChange(filePath, changeType);
    }, this.options.debounce);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Emit change event
   */
  private emitChange(filePath: string, changeType: 'add' | 'change' | 'unlink'): void {
    Logger.info(`[FileWatcher] Emitting change event: ${changeType} - ${filePath}`);
    const event: FileChangeEvent = {
      path: filePath,
      type: changeType,
      timestamp: Date.now(),
    };

    this.emit('change', filePath, changeType, event);
  }
}
