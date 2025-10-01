/**
 * SIMPLE CONTAINER MANAGER - REST API SERVER
 * ===========================================
 * 
 * Express API for controlling containers using the Simple Container Manager
 * Inspired by Balena API, but simplified without commit logic
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import ContainerManager from '../container-manager';
import type { SimpleState, SimpleApp, SimpleService } from '../container-manager';
import * as db from '../db';

// ============================================================================
// SERVER SETUP
// ============================================================================

const app = express();
const PORT = process.env.APP_MANAGER_PORT_EXT || 3002;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Create container manager instance
// Set USE_REAL_DOCKER=true to use real Docker instead of simulation
const USE_REAL_DOCKER = process.env.USE_REAL_DOCKER === 'true';
let containerManager: ContainerManager;

// Initialize database and container manager
async function initializeServer() {
	console.log('🚀 Initializing server...');
	
	// Initialize database
	await db.initialized();
	
	// Create and initialize container manager
	containerManager = new ContainerManager(USE_REAL_DOCKER);
	await containerManager.init();
	
	console.log('✅ Server initialization complete');
}

// Store for tracking operations
let isReconciling = false;
let lastError: string | null = null;

// ============================================================================
// API ROUTES
// ============================================================================

/**
 * GET /
 * Health check
 */
app.get('/', (req: Request, res: Response) => {
	res.json({
		status: 'ok',
		service: 'Simple Container Manager API',
		version: '1.0.0',
		dockerMode: USE_REAL_DOCKER ? 'real' : 'simulated',
		documentation: '/api/docs',
	});
});

/**
 * GET /api/docs
 * API documentation
 */
app.get('/api/docs', (req: Request, res: Response) => {
	res.json({
		endpoints: {
			'GET /': 'Health check',
			'GET /api/docs': 'This documentation',
			'GET /api/v1/state': 'Get current and target state',
			'GET /api/v1/state/current': 'Get current state (what IS running)',
			'GET /api/v1/state/target': 'Get target state (what SHOULD be running)',
			'POST /api/v1/state/target': 'Set target state',
			'POST /api/v1/state/apply': 'Apply target state (reconcile)',
			'GET /api/v1/status': 'Get manager status',
			'GET /api/v1/apps': 'List all apps in current state',
			'GET /api/v1/apps/:appId': 'Get specific app',
			'POST /api/v1/apps/:appId': 'Set app (update or create)',
			'DELETE /api/v1/apps/:appId': 'Remove app',
		},
		examples: {
			setTargetState: {
				method: 'POST',
				url: '/api/v1/state/target',
				body: {
					apps: {
						'1001': {
							appId: 1001,
							appName: 'My Web App',
							services: [
								{
									serviceId: 1,
									serviceName: 'web',
									imageName: 'nginx:latest',
									appId: 1001,
									appName: 'My Web App',
									config: {
										image: 'nginx:latest',
										ports: ['80:80'],
									},
								},
							],
						},
					},
				},
			},
		},
	});
});

/**
 * GET /api/v1/state
 * Get both current and target state
 */
app.get('/api/v1/state', async (req: Request, res: Response) => {
	try {
		const currentState = await containerManager.getCurrentState();
		const targetState = containerManager.getTargetState();

		res.json({
			current: currentState,
			target: targetState,
		});
	} catch (error) {
		res.status(500).json({
			error: 'Failed to get state',
			message: error instanceof Error ? error.message : String(error),
		});
	}
});

/**
 * GET /api/v1/state/current
 * Get current state (what IS running)
 */
app.get('/api/v1/state/current', async (req: Request, res: Response) => {
	try {
		const state = await containerManager.getCurrentState();
		res.json(state);
	} catch (error) {
		res.status(500).json({
			error: 'Failed to get current state',
			message: error instanceof Error ? error.message : String(error),
		});
	}
});

/**
 * GET /api/v1/state/target
 * Get target state (what SHOULD be running)
 */
app.get('/api/v1/state/target', (req: Request, res: Response) => {
	try {
		const state = containerManager.getTargetState();
		res.json(state);
	} catch (error) {
		res.status(500).json({
			error: 'Failed to get target state',
			message: error instanceof Error ? error.message : String(error),
		});
	}
});

/**
 * POST /api/v1/state/target
 * Set target state (what SHOULD be running)
 * 
 * Body: SimpleState object
 */
app.post('/api/v1/state/target', async (req: Request, res: Response) => {
	try {
		const targetState: SimpleState = req.body;

		// Validate
		if (!targetState || typeof targetState !== 'object') {
			return res.status(400).json({
				error: 'Invalid target state',
				message: 'Body must be a SimpleState object with apps property',
			});
		}

		if (!targetState.apps || typeof targetState.apps !== 'object') {
			return res.status(400).json({
				error: 'Invalid target state',
				message: 'Target state must have an apps object',
			});
		}

		// Set target state
		await containerManager.setTarget(targetState);

		res.json({
			status: 'success',
			message: 'Target state updated',
			target: targetState,
		});
	} catch (error) {
		res.status(500).json({
			error: 'Failed to set target state',
			message: error instanceof Error ? error.message : String(error),
		});
	}
});

/**
 * POST /api/v1/state/apply
 * Apply target state (reconcile current → target)
 */
app.post('/api/v1/state/apply', async (req: Request, res: Response) => {
	try {
		if (isReconciling) {
			return res.status(409).json({
				error: 'Already reconciling',
				message: 'State reconciliation is already in progress',
			});
		}

		isReconciling = true;
		lastError = null;

		// Apply state in background
		containerManager
			.applyTargetState()
			.then(() => {
				console.log('✅ Reconciliation complete');
			})
			.catch((error) => {
				console.error('❌ Reconciliation failed:', error);
				lastError = error instanceof Error ? error.message : String(error);
				isReconciling = false;
			});

		res.json({
			status: 'started',
			message: 'State reconciliation started',
		});
	} catch (error) {
		isReconciling = false;
		res.status(500).json({
			error: 'Failed to apply state',
			message: error instanceof Error ? error.message : String(error),
		});
	}
});

/**
 * GET /api/v1/status
 * Get manager status
 */
app.get('/api/v1/status', (req: Request, res: Response) => {
	try {
		const status = containerManager.getStatus();

		res.json({
			...status,
			isReconciling,
			lastError,
		});
	} catch (error) {
		res.status(500).json({
			error: 'Failed to get status',
			message: error instanceof Error ? error.message : String(error),
		});
	}
});

/**
 * GET /api/v1/apps
 * List all apps in current state
 */
app.get('/api/v1/apps', async (req: Request, res: Response) => {
	try {
		const state = await containerManager.getCurrentState();
		const apps = Object.values(state.apps);

		res.json({
			count: apps.length,
			apps: apps.map((app) => ({
				appId: app.appId,
				appName: app.appName,
				serviceCount: app.services.length,
				services: app.services.map((s) => s.serviceName),
			})),
		});
	} catch (error) {
		res.status(500).json({
			error: 'Failed to list apps',
			message: error instanceof Error ? error.message : String(error),
		});
	}
});

/**
 * GET /api/v1/apps/:appId
 * Get specific app
 */
app.get('/api/v1/apps/:appId', async (req: Request, res: Response) => {
	try {
		const appId = parseInt(req.params.appId, 10);
		if (isNaN(appId)) {
			return res.status(400).json({
				error: 'Invalid app ID',
				message: 'App ID must be a number',
			});
		}

		const state = await containerManager.getCurrentState();
		const app = state.apps[appId];

		if (!app) {
			return res.status(404).json({
				error: 'App not found',
				message: `App ${appId} not found in current state`,
			});
		}

		res.json(app);
	} catch (error) {
		res.status(500).json({
			error: 'Failed to get app',
			message: error instanceof Error ? error.message : String(error),
		});
	}
});

/**
 * POST /api/v1/apps/:appId
 * Set app in target state (create or update)
 * 
 * Body: SimpleApp object
 */
app.post('/api/v1/apps/:appId', async (req: Request, res: Response) => {
	try {
		const appId = parseInt(req.params.appId, 10);
		if (isNaN(appId)) {
			return res.status(400).json({
				error: 'Invalid app ID',
				message: 'App ID must be a number',
			});
		}

		const app: SimpleApp = req.body;

		// Validate
		if (!app || typeof app !== 'object') {
			return res.status(400).json({
				error: 'Invalid app',
				message: 'Body must be a SimpleApp object',
			});
		}

		if (app.appId !== appId) {
			return res.status(400).json({
				error: 'App ID mismatch',
				message: 'App ID in URL must match app ID in body',
			});
		}

		// Get current target state
		const targetState = containerManager.getTargetState();

		// Update or add app
		targetState.apps[appId] = app;

		// Set new target state
		await containerManager.setTarget(targetState);

		res.json({
			status: 'success',
			message: `App ${appId} updated in target state`,
			app: app,
		});
	} catch (error) {
		res.status(500).json({
			error: 'Failed to set app',
			message: error instanceof Error ? error.message : String(error),
		});
	}
});

/**
 * DELETE /api/v1/apps/:appId
 * Remove app from target state
 */
app.delete('/api/v1/apps/:appId', async (req: Request, res: Response) => {
	try {
		const appId = parseInt(req.params.appId, 10);
		if (isNaN(appId)) {
			return res.status(400).json({
				error: 'Invalid app ID',
				message: 'App ID must be a number',
			});
		}

		// Get current target state
		const targetState = containerManager.getTargetState();

		// Check if app exists
		if (!targetState.apps[appId]) {
			return res.status(404).json({
				error: 'App not found',
				message: `App ${appId} not found in target state`,
			});
		}

		// Remove app
		delete targetState.apps[appId];

		// Set new target state
		await containerManager.setTarget(targetState);

		res.json({
			status: 'success',
			message: `App ${appId} removed from target state`,
		});
	} catch (error) {
		res.status(500).json({
			error: 'Failed to remove app',
			message: error instanceof Error ? error.message : String(error),
		});
	}
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((req: Request, res: Response) => {
	res.status(404).json({
		error: 'Not found',
		message: `Route ${req.method} ${req.path} not found`,
		hint: 'See /api/docs for available endpoints',
	});
});

app.use((err: Error, req: Request, res: Response, next: any) => {
	console.error('Server error:', err);
	res.status(500).json({
		error: 'Internal server error',
		message: err.message,
	});
});

// ============================================================================
// START SERVER
// ============================================================================

// Initialize and start server
initializeServer().then(() => {
	// Setup event listeners after containerManager is initialized
	containerManager.on('target-state-changed', (state) => {
		console.log('📡 Target state updated');
	});

	containerManager.on('current-state-changed', (state) => {
		console.log('📡 Current state updated');
	});

	containerManager.on('state-applied', () => {
		console.log('State successfully applied');
		isReconciling = false;
	});

	// Start Express server
	app.listen(PORT, () => {
		console.log('='.repeat(80));
		console.log('Simple Container Manager API');
		console.log('='.repeat(80));
		console.log(`Server running on http://localhost:${PORT}`);
		console.log(`Documentation: http://localhost:${PORT}/api/docs`);
		console.log(`Docker mode: ${USE_REAL_DOCKER ? 'REAL' : 'SIMULATED'}`);
		console.log('='.repeat(80));
		console.log('\nEndpoints:');
		console.log(`  GET    /api/v1/state           - Get current and target state`);
		console.log(`  POST   /api/v1/state/target    - Set target state`);
		console.log(`  POST   /api/v1/state/apply     - Apply target state`);
		console.log(`  GET    /api/v1/status          - Get manager status`);
		console.log(`  GET    /api/v1/apps            - List all apps`);
		console.log(`  GET    /api/v1/apps/:appId     - Get specific app`);
		console.log(`  POST   /api/v1/apps/:appId     - Set app`);
		console.log(`  DELETE /api/v1/apps/:appId     - Remove app`);
		console.log('='.repeat(80) + '\n');
	});
}).catch((error) => {
	console.error('Failed to initialize server:', error);
	process.exit(1);
});

export default app;
