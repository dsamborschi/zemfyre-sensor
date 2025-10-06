/**
 * WEBSOCKET MANAGER
 * =================
 * 
 * WebSocket server for real-time updates to clients
 * Broadcasts system metrics to all connected clients
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import * as systemMetrics from './system-metrics';
import type { SystemMetrics } from './system-metrics';

// ============================================================================
// TYPES
// ============================================================================

export interface WebSocketMessage {
	type: 'metrics' | 'error' | 'connected';
	data?: any;
	message?: string;
	timestamp: string;
}

export interface ClientSubscription {
	ws: WebSocket;
	id: string;
	subscribedChannels: Set<string>;
	connectedAt: Date;
}

// ============================================================================
// WEBSOCKET MANAGER CLASS
// ============================================================================

export class WebSocketManager {
	private wss: WebSocketServer | null = null;
	private clients: Map<string, ClientSubscription> = new Map();
	private metricsInterval: NodeJS.Timeout | null = null;
	private metricsIntervalMs: number;
	private isShuttingDown = false;

	constructor(metricsIntervalMs: number = 5000) {
		this.metricsIntervalMs = metricsIntervalMs;
	}

	/**
	 * Initialize WebSocket server attached to HTTP server
	 */
	initialize(httpServer: HttpServer, port?: number): void {
		console.log('🔌 Initializing WebSocket server...');

		this.wss = new WebSocketServer({ 
			server: httpServer,
			path: '/ws/metrics'
		});

		this.wss.on('connection', (ws: WebSocket, req) => {
			const clientId = this.generateClientId();
			const clientIp = req.socket.remoteAddress || 'unknown';
			
			console.log(`📱 Client connected: ${clientId} from ${clientIp}`);

			// Create client subscription
			const subscription: ClientSubscription = {
				ws,
				id: clientId,
				subscribedChannels: new Set(['metrics']), // Auto-subscribe to metrics
				connectedAt: new Date(),
			};

			this.clients.set(clientId, subscription);

			// Send connection confirmation
			this.sendMessage(ws, {
				type: 'connected',
				data: { clientId, subscribedChannels: Array.from(subscription.subscribedChannels) },
				timestamp: new Date().toISOString(),
			});

			// Handle client messages
			ws.on('message', (data: Buffer) => {
				try {
					const message = JSON.parse(data.toString());
					this.handleClientMessage(clientId, message);
				} catch (error) {
					console.error(`Failed to parse message from ${clientId}:`, error);
					this.sendError(ws, 'Invalid message format');
				}
			});

			// Handle client disconnect
			ws.on('close', () => {
				console.log(`📴 Client disconnected: ${clientId}`);
				this.clients.delete(clientId);
			});

			// Handle errors
			ws.on('error', (error) => {
				console.error(`WebSocket error for ${clientId}:`, error);
				this.clients.delete(clientId);
			});

			// Send initial metrics immediately
			this.sendMetricsToClient(ws).catch(err => {
				console.error(`Failed to send initial metrics to ${clientId}:`, err);
			});
		});

		// Start broadcasting metrics periodically
		this.startMetricsBroadcast();

		const portInfo = port ? `:${port}` : '';
		console.log(`✅ WebSocket server ready on ws://localhost${portInfo}/ws/metrics`);
		console.log(`📊 Broadcasting metrics every ${this.metricsIntervalMs}ms`);
	}

	/**
	 * Start periodic metrics broadcasting
	 */
	private startMetricsBroadcast(): void {
		if (this.metricsInterval) {
			clearInterval(this.metricsInterval);
		}

		this.metricsInterval = setInterval(() => {
			if (this.isShuttingDown) return;
			
			// Only broadcast if we have connected clients
			if (this.clients.size > 0) {
				this.broadcastMetrics().catch(err => {
					console.error('Failed to broadcast metrics:', err);
				});
			}
		}, this.metricsIntervalMs);
	}

	/**
	 * Broadcast metrics to all subscribed clients
	 */
	private async broadcastMetrics(): Promise<void> {
		try {
			const metrics = await systemMetrics.getSystemMetrics();
			const message: WebSocketMessage = {
				type: 'metrics',
				data: metrics,
				timestamp: new Date().toISOString(),
			};

			let successCount = 0;
			let failCount = 0;

			for (const [clientId, subscription] of this.clients.entries()) {
				if (subscription.subscribedChannels.has('metrics')) {
					try {
						if (subscription.ws.readyState === WebSocket.OPEN) {
							this.sendMessage(subscription.ws, message);
							successCount++;
						} else {
							// Clean up disconnected clients
							this.clients.delete(clientId);
							failCount++;
						}
					} catch (error) {
						console.error(`Failed to send metrics to ${clientId}:`, error);
						this.clients.delete(clientId);
						failCount++;
					}
				}
			}

			if (successCount > 0) {
				console.log(`📡 Metrics broadcast to ${successCount} client(s) ${failCount > 0 ? `(${failCount} failed)` : ''}`);
			}
		} catch (error) {
			console.error('Failed to get system metrics for broadcast:', error);
		}
	}

	/**
	 * Send metrics to a specific client
	 */
	private async sendMetricsToClient(ws: WebSocket): Promise<void> {
		try {
			const metrics = await systemMetrics.getSystemMetrics();
			const message: WebSocketMessage = {
				type: 'metrics',
				data: metrics,
				timestamp: new Date().toISOString(),
			};
			this.sendMessage(ws, message);
		} catch (error) {
			console.error('Failed to send metrics to client:', error);
			this.sendError(ws, 'Failed to fetch system metrics');
		}
	}

	/**
	 * Handle messages from clients
	 */
	private handleClientMessage(clientId: string, message: any): void {
		const subscription = this.clients.get(clientId);
		if (!subscription) return;

		switch (message.type) {
			case 'subscribe':
				if (message.channel) {
					subscription.subscribedChannels.add(message.channel);
					console.log(`📝 Client ${clientId} subscribed to ${message.channel}`);
				}
				break;

			case 'unsubscribe':
				if (message.channel) {
					subscription.subscribedChannels.delete(message.channel);
					console.log(`📝 Client ${clientId} unsubscribed from ${message.channel}`);
				}
				break;

			case 'ping':
				this.sendMessage(subscription.ws, {
					type: 'connected',
					data: { pong: true },
					timestamp: new Date().toISOString(),
				});
				break;

			default:
				console.warn(`⚠️  Unknown message type from ${clientId}:`, message.type);
		}
	}

	/**
	 * Send a message to a specific client
	 */
	private sendMessage(ws: WebSocket, message: WebSocketMessage): void {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(message));
		}
	}

	/**
	 * Send an error message to a client
	 */
	private sendError(ws: WebSocket, errorMessage: string): void {
		this.sendMessage(ws, {
			type: 'error',
			message: errorMessage,
			timestamp: new Date().toISOString(),
		});
	}

	/**
	 * Generate a unique client ID
	 */
	private generateClientId(): string {
		return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Get current connection statistics
	 */
	getStats(): {
		connectedClients: number;
		clients: Array<{
			id: string;
			connectedAt: Date;
			subscribedChannels: string[];
		}>;
	} {
		return {
			connectedClients: this.clients.size,
			clients: Array.from(this.clients.values()).map(sub => ({
				id: sub.id,
				connectedAt: sub.connectedAt,
				subscribedChannels: Array.from(sub.subscribedChannels),
			})),
		};
	}

	/**
	 * Shutdown WebSocket server gracefully
	 */
	async shutdown(): Promise<void> {
		console.log('🛑 Shutting down WebSocket server...');
		this.isShuttingDown = true;

		// Stop metrics broadcast
		if (this.metricsInterval) {
			clearInterval(this.metricsInterval);
			this.metricsInterval = null;
		}

		// Close all client connections
		for (const [clientId, subscription] of this.clients.entries()) {
			try {
				subscription.ws.close(1000, 'Server shutting down');
			} catch (error) {
				console.error(`Failed to close connection for ${clientId}:`, error);
			}
		}
		this.clients.clear();

		// Close WebSocket server
		if (this.wss) {
			await new Promise<void>((resolve, reject) => {
				this.wss!.close((err) => {
					if (err) {
						console.error('Error closing WebSocket server:', err);
						reject(err);
					} else {
						console.log('✅ WebSocket server closed');
						resolve();
					}
				});
			});
		}
	}
}

export default WebSocketManager;
