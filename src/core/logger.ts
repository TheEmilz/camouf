/**
 * Logger - Centralized logging utility for Camouf
 */

import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

class LoggerInstance {
  private level: LogLevel = LogLevel.INFO;
  private useColors: boolean = true;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setColors(enabled: boolean): void {
    this.useColors = enabled;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      const prefix = this.useColors ? chalk.gray('[DEBUG]') : '[DEBUG]';
      console.log(prefix, message, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(message, ...args);
    }
  }

  success(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      const formatted = this.useColors ? chalk.green(message) : message;
      console.log(formatted, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      const prefix = this.useColors ? chalk.yellow('⚠') : '[WARN]';
      const formatted = this.useColors ? chalk.yellow(message) : message;
      console.warn(prefix, formatted, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      const prefix = this.useColors ? chalk.red('✖') : '[ERROR]';
      const formatted = this.useColors ? chalk.red(message) : message;
      console.error(prefix, formatted, ...args);
    }
  }

  violation(severity: 'error' | 'warning' | 'info', message: string, file?: string, line?: number): void {
    if (this.level <= LogLevel.INFO) {
      const colors = {
        error: chalk.red,
        warning: chalk.yellow,
        info: chalk.blue,
      };
      const symbols = {
        error: '✖',
        warning: '⚠',
        info: 'ℹ',
      };

      const color = this.useColors ? colors[severity] : (s: string) => s;
      const symbol = this.useColors ? color(symbols[severity]) : `[${severity.toUpperCase()}]`;
      
      let location = '';
      if (file) {
        location = this.useColors ? chalk.gray(` (${file}${line ? `:${line}` : ''})`) : ` (${file}${line ? `:${line}` : ''})`;
      }

      console.log(`  ${symbol} ${message}${location}`);
    }
  }

  table(data: Record<string, unknown>[]): void {
    if (this.level <= LogLevel.INFO) {
      console.table(data);
    }
  }

  newLine(): void {
    if (this.level <= LogLevel.INFO) {
      console.log();
    }
  }
}

export const Logger = new LoggerInstance();
