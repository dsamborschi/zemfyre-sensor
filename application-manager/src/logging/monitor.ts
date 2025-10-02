/**
 * Container Log Monitor
 * 
 * Streams logs from Docker containers and forwards them to the log backend.
 * Handles container attachment, detachment, and automatic reconnection.
 */

import type Docker from 'dockerode';
import type { LogMessage, LogStreamOptions, ContainerLogAttachment } from './types';
import type { LocalLogBackend } from './local-backend';

export class ContainerLogMonitor {
	private attachments: Map<string, ContainerLogAttachment> = new Map();
	private docker: Docker;
	private logBackend: LocalLogBackend;

	constructor(docker: Docker, logBackend: LocalLogBackend) {
		this.docker = docker;
		this.logBackend = logBackend;
	}

	/**
	 * Check if a container is already attached
	 */
	public isAttached(containerId: string): boolean {
		const attachment = this.attachments.get(containerId);
		return attachment?.isAttached ?? false;
	}

	/**
	 * Attach to a container's logs
	 */
	public async attach(options: LogStreamOptions): Promise<ContainerLogAttachment> {
		const { containerId, serviceId, serviceName } = options;

		// Check if already attached
		if (this.isAttached(containerId)) {
			console.log(`[LogMonitor] Already attached to container ${containerId}`);
			return this.attachments.get(containerId)!;
		}

		console.log(`[LogMonitor] Attaching to container ${containerId} (${serviceName})`);

		try {
			const container = this.docker.getContainer(containerId);

			// Start streaming logs
			const logStream = (await container.logs({
				follow: true, // Must be true for streaming
				stdout: options.stdout ?? true,
				stderr: options.stderr ?? true,
				timestamps: options.timestamps ?? false,
				tail: options.tail ?? 100, // Get last 100 lines initially
			})) as NodeJS.ReadableStream;

			// Docker multiplexes stdout/stderr in a special format
			// We need to demultiplex it
			this.demultiplexStream(logStream, containerId, serviceId, serviceName);

			// Create attachment object
			const attachment: ContainerLogAttachment = {
				containerId,
				serviceId,
				serviceName,
				isAttached: true,
				detach: async () => {
					console.log(`[LogMonitor] Detaching from container ${containerId}`);
					if ('destroy' in logStream && typeof logStream.destroy === 'function') {
						logStream.destroy();
					}
					this.attachments.delete(containerId);
				},
			};

			this.attachments.set(containerId, attachment);

			// Handle stream end
			logStream.on('end', () => {
				console.log(`[LogMonitor] Log stream ended for container ${containerId}`);
				this.attachments.delete(containerId);
			});

			logStream.on('error', (error) => {
				console.error(`[LogMonitor] Log stream error for container ${containerId}:`, error);
				this.attachments.delete(containerId);
			});

			return attachment;
		} catch (error) {
			console.error(`[LogMonitor] Failed to attach to container ${containerId}:`, error);
			throw error;
		}
	}

	/**
	 * Detach from a container's logs
	 */
	public async detach(containerId: string): Promise<void> {
		const attachment = this.attachments.get(containerId);
		if (attachment) {
			await attachment.detach();
		}
	}

	/**
	 * Detach from all containers
	 */
	public async detachAll(): Promise<void> {
		const detachPromises = Array.from(this.attachments.values()).map((attachment) =>
			attachment.detach(),
		);
		await Promise.all(detachPromises);
	}

	/**
	 * Get list of attached containers
	 */
	public getAttachedContainers(): string[] {
		return Array.from(this.attachments.keys());
	}

	/**
	 * Demultiplex Docker log stream
	 * 
	 * Docker uses a special format for multiplexed streams:
	 * [8 bytes header][payload]
	 * 
	 * Header format:
	 * - Byte 0: stream type (0=stdin, 1=stdout, 2=stderr)
	 * - Bytes 1-3: padding
	 * - Bytes 4-7: payload size (big-endian uint32)
	 */
	private demultiplexStream(
		stream: NodeJS.ReadableStream,
		containerId: string,
		serviceId: number,
		serviceName: string,
	): void {
		let buffer = Buffer.alloc(0);

		stream.on('data', (chunk: Buffer) => {
			buffer = Buffer.concat([buffer, chunk]);

			while (buffer.length >= 8) {
				// Read header
				const streamType = buffer.readUInt8(0);
				const payloadSize = buffer.readUInt32BE(4);

				// Check if we have the full payload
				if (buffer.length < 8 + payloadSize) {
					break;
				}

				// Extract payload
				const payload = buffer.slice(8, 8 + payloadSize);
				buffer = buffer.slice(8 + payloadSize);

				// Parse log message
				const message = payload.toString('utf-8').trim();

				if (message) {
					// Determine if stderr
					const isStdErr = streamType === 2;

					// Create log message
					const logMessage: LogMessage = {
						message,
						timestamp: Date.now(),
						level: isStdErr ? 'error' : 'info',
						source: {
							type: 'container',
							name: serviceName,
						},
						serviceId,
						serviceName,
						containerId,
						isStdErr,
						isSystem: false,
					};

					// Store log
					this.logBackend.log(logMessage).catch((error) => {
						console.error('[LogMonitor] Failed to store log:', error);
					});
				}
			}
		});
	}

	/**
	 * Log a system message
	 */
	public async logSystemMessage(
		message: string,
		level: 'debug' | 'info' | 'warn' | 'error' = 'info',
	): Promise<void> {
		const logMessage: LogMessage = {
			message,
			timestamp: Date.now(),
			level,
			source: {
				type: 'system',
				name: 'container-manager',
			},
			isSystem: true,
		};

		await this.logBackend.log(logMessage);
	}

	/**
	 * Log a manager event
	 */
	public async logManagerEvent(
		event: string,
		details?: Record<string, any>,
		level: 'debug' | 'info' | 'warn' | 'error' = 'info',
	): Promise<void> {
		const message = details
			? `${event}: ${JSON.stringify(details)}`
			: event;

		const logMessage: LogMessage = {
			message,
			timestamp: Date.now(),
			level,
			source: {
				type: 'manager',
				name: 'container-manager',
			},
			isSystem: true,
		};

		await this.logBackend.log(logMessage);
	}
}
