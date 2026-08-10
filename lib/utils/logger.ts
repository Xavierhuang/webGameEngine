/**
 * Logger utility for the game engine
 * Provides environment-aware logging (only logs in development)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  public readonly isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  private shouldLog(level: LogLevel): boolean {
    // Always log errors, even in production
    if (level === 'error') return true;
    // Only log other levels in development
    return this.isDevelopment;
  }

  debug(...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug('[DEBUG]', ...args);
    }
  }

  info(...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info('[INFO]', ...args);
    }
  }

  warn(...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn('[WARN]', ...args);
    }
  }

  error(...args: any[]): void {
    // Always log errors
    console.error('[ERROR]', ...args);
  }

  // Performance logging (only in development)
  performance(label: string, fn: () => void): void {
    if (this.isDevelopment && typeof performance !== 'undefined') {
      const start = performance.now();
      fn();
      const end = performance.now();
      console.debug(`[PERF] ${label}: ${(end - start).toFixed(2)}ms`);
    } else {
      fn();
    }
  }

  // Grouped logging for better organization
  group(label: string, fn: () => void): void {
    if (this.isDevelopment) {
      console.group(label);
      fn();
      console.groupEnd();
    } else {
      fn();
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Export type for use in other files
export type { LogLevel };

