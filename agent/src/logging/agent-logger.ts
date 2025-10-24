/**
 * Agent Logger
 * =============
 * 
 * Structured logging for agent-level events (supervisor, api-binder, connection-monitor, etc.)
 * Integrates with existing LogBackend system (LocalLogBackend, CloudLogBackend).
 * 
 * Usage:
 *   const logger = new AgentLogger(logBackends);
 *   await logger.info('Connection restored', { component: 'ConnectionMonitor' });
 *   await logger.error('Poll failed', error, { component: 'ApiBinder', operation: 'poll' });
 */

import type { LogBackend, LogLevel } from './types';

export interface LogContext {
	component?: string;
	operation?: string;
	[key: string]: any;
}

// Log level hierarchy for filtering
const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

export class AgentLogger {
	private backends: LogBackend[];
	private deviceId?: string;
	private minLogLevel: LogLevel = 'info'; // Default to info level

	constructor(backends: LogBackend | LogBackend[], initialLogLevel: LogLevel = 'info') {
		this.backends = Array.isArray(backends) ? backends : [backends];
		this.minLogLevel = initialLogLevel;
	}

	/**
	 * Set device ID for all logs
	 */
	public setDeviceId(deviceId: string): void {
		this.deviceId = deviceId;
	}

	/**
	 * Update the minimum log level
	 * @param level - 'debug', 'info', 'warn', or 'error'
	 */
	public setLogLevel(level: LogLevel): void {
		const oldLevel = this.minLogLevel;
		this.minLogLevel = level;
		
		// Log the change at info level (always show this)
		const originalMinLevel = this.minLogLevel;
		this.minLogLevel = 'info'; // Temporarily set to info to ensure this message is logged
		this.consoleLog('info', `Log level changed: ${oldLevel} → ${level}`, { component: 'AgentLogger' });
		this.minLogLevel = originalMinLevel;
	}

	/**
	 * Get the current minimum log level
	 */
	public getLogLevel(): LogLevel {
		return this.minLogLevel;
	}

	/**
	 * Check if a log level should be logged
	 */
	private shouldLog(level: LogLevel): boolean {
		return LOG_LEVELS[level] >= LOG_LEVELS[this.minLogLevel];
	}

	/**
	 * Log debug message
	 */
	public async debug(message: string, context?: LogContext): Promise<void> {
		await this.log('debug', message, context);
	}

	/**
	 * Log info message
	 */
	public async info(message: string, context?: LogContext): Promise<void> {
		await this.log('info', message, context);
	}

	/**
	 * Log warning message
	 */
	public async warn(message: string, context?: LogContext): Promise<void> {
		await this.log('warn', message, context);
	}

	/**
	 * Log error message
	 */
	public async error(message: string, error?: Error, context?: LogContext): Promise<void> {
		const errorContext = error ? {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack,
			},
		} : {};

		await this.log('error', message, {
			...context,
			...errorContext,
		});
	}

	/**
	 * Core logging method
	 */
	private async log(level: LogLevel, message: string, context?: LogContext): Promise<void> {
		// Filter based on minimum log level
		if (!this.shouldLog(level)) {
			return;
		}

		const logMessage = {
			timestamp: Date.now(),
			level,
			message,
			source: {
				type: 'system' as const,
				name: context?.component || 'agent',
			},
			isSystem: true,
			...(this.deviceId && { deviceId: this.deviceId }),
			...(context && { context }),
		};

		// Send to all backends (LocalLogBackend, CloudLogBackend, etc.)
		// Fire and forget - don't block on logging
		const promises = this.backends.map(backend => 
			backend.log(logMessage).catch(err => {
				// If logging fails, still output to console
				console.error('[AgentLogger] Failed to log to backend:', err);
			})
		);

		// Also output to console for development/Docker logs
		this.consoleLog(level, message, context);

		// Don't await - let logging happen in background
		Promise.all(promises).catch(() => {
			// Silently ignore - already logged to console above
		});
	}

	/**
	 * Console output (for development and Docker logs)
	 */
	private consoleLog(level: LogLevel, message: string, context?: LogContext): void {
		const timestamp = new Date().toISOString();
		const component = context?.component || 'agent';
		const prefix = `${timestamp} [${level.toUpperCase()}] [${component}]`;

		// Format message
		let output = `${prefix} ${message}`;

		// Add context if present
		if (context && Object.keys(context).length > 0) {
			const { component: _, ...otherContext } = context;
			if (Object.keys(otherContext).length > 0) {
				output += ` ${JSON.stringify(otherContext)}`;
			}
		}

		// Output to appropriate console method
		switch (level) {
			case 'debug':
				console.log(output);
				break;
			case 'info':
				console.log(output);
				break;
			case 'warn':
				console.warn(output);
				break;
			case 'error':
				console.error(output);
				break;
		}
	}

	/**
	 * Synchronous log methods (for places where async is difficult)
	 * These don't wait for backend writes
	 */
	public debugSync(message: string, context?: LogContext): void {
		this.log('debug', message, context);
	}

	public infoSync(message: string, context?: LogContext): void {
		this.log('info', message, context);
	}

	public warnSync(message: string, context?: LogContext): void {
		this.log('warn', message, context);
	}

	public errorSync(message: string, error?: Error, context?: LogContext): void {
		const errorContext = error ? {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack,
			},
		} : {};

		this.log('error', message, {
			...context,
			...errorContext,
		});
	}
}
