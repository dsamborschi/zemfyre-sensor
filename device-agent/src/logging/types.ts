/**
 * Logging types and interfaces
 * 
 * Simplified logging system inspired by balena-supervisor
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogMessage {
	/** Unique log message ID */
	id?: string;
	/** Log message content */
	message: string;
	/** Timestamp in milliseconds since epoch */
	timestamp: number;
	/** Log level/severity */
	level: LogLevel;
	/** Source of the log */
	source: LogSource;
	/** Service ID (if from container) */
	serviceId?: number;
	/** Service name (if from container) */
	serviceName?: string;
	/** Container ID (if from container) */
	containerId?: string;
	/** Whether this is stdout (false) or stderr (true) */
	isStdErr?: boolean;
	/** Whether this is a system message */
	isSystem?: boolean;
}

export interface LogSource {
	/** Type of log source */
	type: 'container' | 'system' | 'manager';
	/** Name of the source */
	name: string;
}

export interface LogFilter {
	/** Filter by service ID */
	serviceId?: number;
	/** Filter by service name */
	serviceName?: string;
	/** Filter by container ID */
	containerId?: string;
	/** Filter by log level */
	level?: LogLevel;
	/** Filter by source type */
	sourceType?: 'container' | 'system' | 'manager';
	/** Start timestamp (ms) - logs after this time */
	since?: number;
	/** End timestamp (ms) - logs before this time */
	until?: number;
	/** Maximum number of logs to return */
	limit?: number;
	/** Include stderr logs */
	includeStderr?: boolean;
	/** Include stdout logs */
	includeStdout?: boolean;
}

export interface LogBackend {
	/** Store a log message */
	log(message: LogMessage): Promise<void>;
	/** Retrieve logs matching filter */
	getLogs(filter?: LogFilter): Promise<LogMessage[]>;
	/** Clear old logs */
	cleanup(olderThanMs: number): Promise<number>;
	/** Get total number of stored logs */
	getLogCount(): Promise<number>;
}

export interface LogStreamOptions {
	/** Container ID to stream logs from */
	containerId: string;
	/** Service ID */
	serviceId: number;
	/** Service name */
	serviceName: string;
	/** Stream stdout */
	stdout?: boolean;
	/** Stream stderr */
	stderr?: boolean;
	/** Follow log output (tail -f style) */
	follow?: boolean;
	/** Number of lines to show from the end */
	tail?: number;
	/** Show timestamps */
	timestamps?: boolean;
}

export interface ContainerLogAttachment {
	/** Container ID */
	containerId: string;
	/** Service ID */
	serviceId: number;
	/** Service name */
	serviceName: string;
	/** Whether streaming is active */
	isAttached: boolean;
	/** Detach from container logs */
	detach: () => Promise<void>;
}
