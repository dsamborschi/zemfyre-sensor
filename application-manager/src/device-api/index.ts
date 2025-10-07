/**
 * Device API for Standalone Application Manager
 * Adapted from balena-supervisor device API
 * Simplified version without balena-specific dependencies
 */

import express from 'express';
import type { Server } from 'http';
import * as middleware from './middleware';
import * as actions from './actions';

interface DeviceAPIConstructOpts {
	routers: express.Router[];
	healthchecks?: Array<() => Promise<boolean>>;
}

export class DeviceAPI {
	private routers: express.Router[];
	private healthchecks: Array<() => Promise<boolean>>;

	private api = express();
	private server: Server | null = null;

	public constructor({ routers, healthchecks = [] }: DeviceAPIConstructOpts) {
		this.routers = routers;
		this.healthchecks = healthchecks;

		this.api.disable('x-powered-by');
		this.api.use(middleware.logging);

		// Health check endpoint
		this.api.get('/v1/healthy', async (_req, res) => {
			const isHealthy = await actions.runHealthchecks(this.healthchecks);
			if (isHealthy) {
				return res.sendStatus(200);
			} else {
				return res.status(500).send('Unhealthy');
			}
		});

		// Ping endpoint
		this.api.get('/ping', (_req, res) => res.send('OK'));

		// Authentication middleware (optional - can be enabled/disabled)
		if (process.env.ENABLE_AUTH === 'true') {
			this.api.use(middleware.auth);
		}

		// Parse request bodies
		this.api.use(express.urlencoded({ limit: '10mb', extended: true }));
		this.api.use(express.json({ limit: '10mb' }));

		// Mount all routers
		for (const router of this.routers) {
			this.api.use(router);
		}

		// Error handling middleware
		this.api.use(middleware.errors);
	}

	public async listen(port: number, timeout: number = 300000): Promise<void> {
		return new Promise((resolve) => {
			this.server = this.api.listen(port, () => {
				console.log(`Device API successfully started on port ${port}`);
				if (this.server) {
					this.server.timeout = timeout;
				}
				return resolve();
			});
		});
	}

	public async stop(): Promise<void> {
		if (this.server != null) {
			const server = this.server;
			this.server = null;
			return new Promise((resolve, reject) => {
				server.close((err: Error) => {
					if (err) {
						this.server = server;
						return reject(err);
					} else {
						console.log('Stopped Device API');
						return resolve();
					}
				});
			});
		} else {
			console.warn('Device API already stopped, ignoring further requests');
		}
	}

	public getApp(): express.Application {
		return this.api;
	}
}

export default DeviceAPI;
