/**
 * Component Logger
 * ================
 * 
 * Wrapper around AgentLogger that automatically includes component name in all log calls.
 * Eliminates repetitive { component: 'ComponentName' } in every log statement.
 * 
 * Usage:
 *   const logger = new ComponentLogger(agentLogger, 'Agent');
 *   logger.infoSync('Database initialized'); // component: 'Agent' auto-added
 *   logger.errorSync('Failed to connect', error, { retries: 3 }); // component merged with context
 */

import type { AgentLogger } from './agent-logger.js';
import type { LogContext } from './agent-logger.js';

export class ComponentLogger {
	constructor(
		private readonly agentLogger: AgentLogger,
		private readonly component: string
	) {}

	/**
	 * Merge component with provided context
	 */
	private mergeContext(context?: LogContext): LogContext {
		return {
			component: this.component,
			...context,
		};
	}

	// Async methods
	async debug(message: string, context?: LogContext): Promise<void> {
		await this.agentLogger.debug(message, this.mergeContext(context));
	}

	async info(message: string, context?: LogContext): Promise<void> {
		await this.agentLogger.info(message, this.mergeContext(context));
	}

	async warn(message: string, context?: LogContext): Promise<void> {
		await this.agentLogger.warn(message, this.mergeContext(context));
	}

	async error(message: string, error: Error, context?: LogContext): Promise<void> {
		await this.agentLogger.error(message, error, this.mergeContext(context));
	}

	// Sync methods
	debugSync(message: string, context?: LogContext): void {
		this.agentLogger.debugSync(message, this.mergeContext(context));
	}

	infoSync(message: string, context?: LogContext): void {
		this.agentLogger.infoSync(message, this.mergeContext(context));
	}

	warnSync(message: string, context?: LogContext): void {
		this.agentLogger.warnSync(message, this.mergeContext(context));
	}

	errorSync(message: string, error: Error | undefined, context?: LogContext): void {
		this.agentLogger.errorSync(message, error, this.mergeContext(context));
	}

	/**
	 * Get the underlying AgentLogger for advanced operations
	 */
	getUnderlyingLogger(): AgentLogger {
		return this.agentLogger;
	}
}
