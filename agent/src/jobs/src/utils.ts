import * as path from 'path';
import * as os from 'os';
import { Logger } from './types';

/**
 * Simple console logger implementation
 */
export class ConsoleLogger implements Logger {
  constructor(private level: 'debug' | 'info' | 'warn' | 'error' = 'info') {}

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${this.formatMessage(message)}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(`[INFO] ${this.formatMessage(message)}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${this.formatMessage(message)}`, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${this.formatMessage(message)}`, ...args);
    }
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private formatMessage(message: string): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} ${message}`;
  }
}

/**
 * Default client base notifier implementation
 */
export class DefaultClientBaseNotifier {
  constructor(private logger: Logger) {}

  onEvent(featureName: string, event: string): void {
    this.logger.info(`Client base notified: ${featureName} - ${event}`);
  }

  onError(featureName: string, error: string, message: string): void {
    this.logger.error(`Client base error: ${featureName} - ${error}: ${message}`);
  }
}

/**
 * Configuration utilities
 */
export class ConfigUtils {
  /**
   * Expand tilde (~) to home directory in file paths
   */
  static expandPath(filePath: string): string {
    if (filePath.startsWith('~/')) {
      return path.join(os.homedir(), filePath.slice(2));
    }
    return filePath;
  }

  /**
   * Get default jobs handler directory
   */
  static getDefaultJobsHandlerDir(): string {
    return this.expandPath('~/.aws-iot-device-client/jobs/');
  }

  /**
   * Validate jobs configuration
   */
  static validateJobsConfig(config: any): void {
    if (!config.thingName || typeof config.thingName !== 'string') {
      throw new Error('Jobs config must include a valid thingName');
    }

    if (!config.handlerDirectory || typeof config.handlerDirectory !== 'string') {
      throw new Error('Jobs config must include a valid handlerDirectory');
    }
  }
}

/**
 * Retry utility with exponential backoff
 */
export class RetryUtils {
  /**
   * Execute a function with exponential backoff retry
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Job document validation utilities
 */
export class JobDocumentUtils {
  /**
   * Validate a job document structure
   */
  static validateJobDocument(jobDoc: any): void {
    if (!jobDoc || typeof jobDoc !== 'object') {
      throw new Error('Job document must be an object');
    }

    // Check for new schema (v1.0)
    if (jobDoc.version === '1.0') {
      this.validateNewSchemaJobDocument(jobDoc);
    } else if (!jobDoc.version || jobDoc.version === '0.0') {
      // Legacy schema
      this.validateLegacyJobDocument(jobDoc);
    } else {
      throw new Error(`Unsupported job document version: ${jobDoc.version}`);
    }
  }

  private static validateNewSchemaJobDocument(jobDoc: any): void {
    if (!jobDoc.steps || !Array.isArray(jobDoc.steps) || jobDoc.steps.length === 0) {
      throw new Error('New schema job document must include at least one step');
    }

    for (const [index, step] of jobDoc.steps.entries()) {
      this.validateJobAction(step, `Step ${index}`);
    }

    if (jobDoc.finalStep) {
      this.validateJobAction(jobDoc.finalStep, 'Final step');
    }
  }

  private static validateLegacyJobDocument(jobDoc: any): void {
    if (!jobDoc.operation || typeof jobDoc.operation !== 'string') {
      throw new Error('Legacy job document must include an operation field');
    }
  }

  private static validateJobAction(action: any, context: string): void {
    if (!action.name || typeof action.name !== 'string') {
      throw new Error(`${context}: Action must have a name`);
    }

    if (!action.type || !['runHandler', 'runCommand'].includes(action.type)) {
      throw new Error(`${context}: Action type must be 'runHandler' or 'runCommand'`);
    }

    if (!action.input || typeof action.input !== 'object') {
      throw new Error(`${context}: Action must have input object`);
    }

    if (action.type === 'runHandler') {
      if (!action.input.handler || typeof action.input.handler !== 'string') {
        throw new Error(`${context}: runHandler action must specify a handler`);
      }
    } else if (action.type === 'runCommand') {
      if (!action.input.command || typeof action.input.command !== 'string') {
        throw new Error(`${context}: runCommand action must specify a command`);
      }
    }
  }

  /**
   * Convert legacy job document to new schema format
   */
  static convertLegacyJobDocument(legacyDoc: any): any {
    return {
      version: '1.0',
      includeStdOut: legacyDoc.includeStdOut || false,
      steps: [
        {
          name: `Execute ${legacyDoc.operation}`,
          type: 'runHandler',
          input: {
            handler: legacyDoc.operation,
            args: legacyDoc.args || [],
            path: legacyDoc.path || 'default'
          },
          allowStdErr: legacyDoc.allowStdErr || 0
        }
      ]
    };
  }
}

/**
 * File system utilities
 */
export class FileUtils {
  /**
   * Check if a file exists and is executable
   */
  static async isExecutable(filePath: string): Promise<boolean> {
    try {
      const { promises: fs } = await import('fs');
      const stats = await fs.stat(filePath);
      
      if (!stats.isFile()) {
        return false;
      }

      // On Windows, any file is potentially executable
      if (process.platform === 'win32') {
        return true;
      }

      // On Unix-like systems, check execute bit
      const mode = stats.mode & parseInt('777', 8);
      return (mode & parseInt('100', 8)) !== 0; // Owner execute bit
    } catch {
      return false;
    }
  }

  /**
   * Ensure directory exists, create if necessary
   */
  static async ensureDirectory(dirPath: string): Promise<void> {
    try {
      const { promises: fs } = await import('fs');
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code !== 'EEXIST') {
        throw error;
      }
    }
  }
}