/**
 * CLOUD API - Multi-Device Management
 * ====================================
 * 
 * Cloud-side API for managing multiple devices
 * Stores and serves target state per device
 * Receives device reports (current state + metrics)
 * 
 * NO ContainerManager - devices handle their own containers!
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

// ============================================================================
// TYPES
// ============================================================================

interface DeviceTargetState {
	uuid: string;
	apps: { [appId: string]: any };
	updated_at: number;
	etag: string;
}

interface DeviceCurrentState {
	uuid: string;
	apps: { [appId: string]: any };
	cpu_usage?: number;
	memory_usage?: number;
	memory_total?: number;
	storage_usage?: number;
	storage_total?: number;
	temperature?: number;
	is_online?: boolean;
	uptime?: number;
	last_reported: number;
}

// ============================================================================
// IN-MEMORY STORAGE (replace with real database)
// ============================================================================

// In production, this should be a real database (PostgreSQL, MongoDB, etc.)
const deviceTargetStates = new Map<string, DeviceTargetState>();
const deviceCurrentStates = new Map<string, DeviceCurrentState>();

// Helper to generate ETag
function generateETag(data: any): string {
	return Buffer.from(JSON.stringify(data)).toString('base64').substring(0, 32);
}

// ============================================================================
// SERVER SETUP
// ============================================================================

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// HTTP Request Logger Middleware
app.use((req: Request, res: Response, next) => {
	const startTime = Date.now();
	const timestamp = new Date().toISOString();
	
	// Log request
	console.log(`\n[${timestamp}] ➡️  ${req.method} ${req.path}`);
	console.log(`   Headers: ${JSON.stringify({
		'content-type': req.headers['content-type'],
		'content-length': req.headers['content-length'],
		'if-none-match': req.headers['if-none-match'],
	})}`);
	
	if (req.body && Object.keys(req.body).length > 0) {
		console.log(`   Body: ${JSON.stringify(req.body).substring(0, 200)}${JSON.stringify(req.body).length > 200 ? '...' : ''}`);
	}
	
	// Capture response
	const originalSend = res.send;
	const originalJson = res.json;
	
	res.send = function (data: any) {
		const duration = Date.now() - startTime;
		const responseTimestamp = new Date().toISOString();
		console.log(`[${responseTimestamp}] ⬅️  ${res.statusCode} ${req.method} ${req.path} - ${duration}ms`);
		return originalSend.call(this, data);
	};
	
	res.json = function (data: any) {
		const duration = Date.now() - startTime;
		const responseTimestamp = new Date().toISOString();
		console.log(`[${responseTimestamp}] ⬅️  ${res.statusCode} ${req.method} ${req.path} - ${duration}ms`);
		if (res.statusCode >= 400) {
			console.log(`   Response: ${JSON.stringify(data).substring(0, 200)}`);
		}
		return originalJson.call(this, data);
	};
	
	next();
});


app.get('/api/v1/device/:uuid/state', (req: Request, res: Response) => {
	const { uuid } = req.params;
	const ifNoneMatch = req.headers['if-none-match'];
	
	// Get target state for device
	const targetState = deviceTargetStates.get(uuid);
	
	if (!targetState) {
		// No target state set yet - return empty state
		const emptyState = {
			[uuid]: {
				apps: {},
			},
		};
		const etag = generateETag(emptyState);
		
		return res
			.set('ETag', etag)
			.json(emptyState);
	}
	
	// Check ETag (304 Not Modified)
	if (ifNoneMatch && ifNoneMatch === targetState.etag) {
		return res.status(304).end();
	}
	
	// Return target state with ETag
	const response = {
		[uuid]: {
			apps: targetState.apps,
		},
	};
	
	res
		.set('ETag', targetState.etag)
		.json(response);
});

/**
 * POST /api/v1/device/:uuid/logs
 * Device uploads logs (compressed NDJSON)
 * 
 * Content-Type: application/x-ndjson
 * Content-Encoding: gzip (optional)
 */
app.post('/api/v1/device/:uuid/logs', async (req: Request, res: Response) => {
	try {
		const { uuid } = req.params;
		const contentEncoding = req.headers['content-encoding'];
		
		// TODO: In production, decompress and store logs in database
		// For now, just log them
		console.log(`📥 Received logs from device ${uuid.substring(0, 8)}...`);
		console.log(`   Content-Encoding: ${contentEncoding || 'none'}`);
		console.log(`   Size: ${req.headers['content-length'] || 'unknown'} bytes`);
		
		// If you want to actually process the logs:
		// 1. Decompress if gzipped
		// 2. Parse NDJSON (split by \n, JSON.parse each line)
		// 3. Store in database with device UUID
		// 4. Index for search
		
		res.json({ status: 'ok', received: 'logs' });
	} catch (error) {
		res.status(500).json({
			error: 'Failed to process logs',
			message: error instanceof Error ? error.message : String(error),
		});
	}
});

/**
 * PATCH /api/v1/device/state
 * Device reports current state + metrics
 * 
 * Body: { [uuid]: { apps, cpu_usage, memory_usage, ... } }
 */
app.patch('/api/v1/device/state', (req: Request, res: Response) => {
	try {
		const stateReport = req.body;
		
		// Update current state for each device in report
		for (const uuid in stateReport) {
			const deviceState = stateReport[uuid];
			
			deviceCurrentStates.set(uuid, {
				uuid,
				apps: deviceState.apps || {},
				cpu_usage: deviceState.cpu_usage,
				memory_usage: deviceState.memory_usage,
				memory_total: deviceState.memory_total,
				storage_usage: deviceState.storage_usage,
				storage_total: deviceState.storage_total,
				temperature: deviceState.temperature,
				is_online: true,
				uptime: deviceState.uptime,
				last_reported: Date.now(),
			});
			
			console.log(`📥 Received state report from device ${uuid.substring(0, 8)}...`);
		}
		
		res.json({ status: 'ok' });
	} catch (error) {
		res.status(500).json({
			error: 'Failed to process state report',
			message: error instanceof Error ? error.message : String(error),
		});
	}
});

// ============================================================================
// DEVICE MANAGEMENT API - Web UI / Admin
// ============================================================================

/**
 * GET /api/v1/devices
 * List all registered devices
 */
app.get('/api/v1/devices', (req: Request, res: Response) => {
	const devices: any[] = [];
	
	// Combine target and current state
	const allUuids = new Set([
		...deviceTargetStates.keys(),
		...deviceCurrentStates.keys(),
	]);
	
	for (const uuid of allUuids) {
		const targetState = deviceTargetStates.get(uuid);
		const currentState = deviceCurrentStates.get(uuid);
		
		devices.push({
			uuid,
			is_online: currentState?.is_online || false,
			last_reported: currentState?.last_reported,
			target_apps: Object.keys(targetState?.apps || {}).length,
			current_apps: Object.keys(currentState?.apps || {}).length,
			cpu_usage: currentState?.cpu_usage,
			memory_usage: currentState?.memory_usage,
			memory_total: currentState?.memory_total,
			temperature: currentState?.temperature,
		});
	}
	
	res.json({
		count: devices.length,
		devices,
	});
});

/**
 * GET /api/v1/devices/:uuid
 * Get specific device info
 */
app.get('/api/v1/devices/:uuid', (req: Request, res: Response) => {
	const { uuid } = req.params;
	
	const targetState = deviceTargetStates.get(uuid);
	const currentState = deviceCurrentStates.get(uuid);
	
	if (!targetState && !currentState) {
		return res.status(404).json({
			error: 'Device not found',
			message: `Device ${uuid} not found`,
		});
	}
	
	res.json({
		uuid,
		target_state: targetState ? { apps: targetState.apps } : { apps: {} },
		current_state: currentState || null,
		is_online: currentState?.is_online || false,
		last_reported: currentState?.last_reported,
	});
});

/**
 * GET /api/v1/devices/:uuid/target-state
 * Get target state for device
 */
app.get('/api/v1/devices/:uuid/target-state', (req: Request, res: Response) => {
	const { uuid } = req.params;
	const targetState = deviceTargetStates.get(uuid);
	
	res.json({
		uuid,
		apps: targetState?.apps || {},
		updated_at: targetState?.updated_at,
	});
});

/**
 * POST /api/v1/devices/:uuid/target-state
 * Set target state for device (what SHOULD be running)
 * 
 * Body: { apps: { [appId]: ... } }
 */
app.post('/api/v1/devices/:uuid/target-state', (req: Request, res: Response) => {
	try {
		const { uuid } = req.params;
		const { apps } = req.body;
		
		if (!apps || typeof apps !== 'object') {
			return res.status(400).json({
				error: 'Invalid request',
				message: 'Body must contain apps object',
			});
		}
		
		const now = Date.now();
		const targetState: DeviceTargetState = {
			uuid,
			apps,
			updated_at: now,
			etag: generateETag({ uuid, apps, updated_at: now }),
		};
		
		deviceTargetStates.set(uuid, targetState);
		
		console.log(`🎯 Target state updated for device ${uuid.substring(0, 8)}...`);
		console.log(`   Apps: ${Object.keys(apps).length}`);
		
		res.json({
			status: 'ok',
			message: 'Target state updated',
			uuid,
			apps,
		});
	} catch (error) {
		res.status(500).json({
			error: 'Failed to set target state',
			message: error instanceof Error ? error.message : String(error),
		});
	}
});

/**
 * GET /api/v1/devices/:uuid/current-state
 * Get current state from device (last reported)
 */
app.get('/api/v1/devices/:uuid/current-state', (req: Request, res: Response) => {
	const { uuid } = req.params;
	const currentState = deviceCurrentStates.get(uuid);
	
	if (!currentState) {
		return res.status(404).json({
			error: 'No state reported yet',
			message: `Device ${uuid} has not reported its state yet`,
		});
	}
	
	res.json(currentState);
});

/**
 * DELETE /api/v1/devices/:uuid/target-state
 * Clear target state (stop all apps)
 */
app.delete('/api/v1/devices/:uuid/target-state', (req: Request, res: Response) => {
	const { uuid } = req.params;
	
	// Set empty target state
	const now = Date.now();
	const targetState: DeviceTargetState = {
		uuid,
		apps: {},
		updated_at: now,
		etag: generateETag({ uuid, apps: {}, updated_at: now }),
	};
	
	deviceTargetStates.set(uuid, targetState);
	
	console.log(`🧹 Cleared target state for device ${uuid.substring(0, 8)}...`);
	
	res.json({
		status: 'ok',
		message: 'Target state cleared',
	});
});

// ============================================================================
// HEALTH & DOCS
// ============================================================================

/**
 * GET /
 * Health check
 */
app.get('/', (req: Request, res: Response) => {
	res.json({
		status: 'ok',
		service: 'Container Manager Cloud API',
		version: '3.0.0',
		devices_online: Array.from(deviceCurrentStates.values()).filter(d => d.is_online).length,
		devices_total: new Set([...deviceTargetStates.keys(), ...deviceCurrentStates.keys()]).size,
	});
});

/**
 * GET /api/docs
 * API documentation
 */
app.get('/api/docs', (req: Request, res: Response) => {
	res.json({
		version: '3.0.0',
		description: 'Cloud API for managing multiple devices',
		endpoints: {
			device_polling: {
				'GET /api/v1/device/:uuid/state': 'Device polls for target state (ETag cached)',
				'PATCH /api/v1/device/state': 'Device reports current state + metrics',
			},
			device_management: {
				'GET /api/v1/devices': 'List all devices',
				'GET /api/v1/devices/:uuid': 'Get device info',
				'GET /api/v1/devices/:uuid/target-state': 'Get target state',
				'POST /api/v1/devices/:uuid/target-state': 'Set target state',
				'GET /api/v1/devices/:uuid/current-state': 'Get current state',
				'DELETE /api/v1/devices/:uuid/target-state': 'Clear target state',
			},
		},
		notes: [
			'Devices poll /api/v1/device/:uuid/state for target state',
			'Devices report to /api/v1/device/state with current state',
			'ETag caching prevents unnecessary data transfer',
			'Target state stored per device UUID',
		],
	});
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

async function startServer() {
	console.log('🚀 Initializing Cloud API...');
	
	// Start Express server
	app.listen(PORT, () => {
		console.log('='.repeat(80));
		console.log('☁️  Container Manager Cloud API');
		console.log('='.repeat(80));
		console.log(`Server running on http://localhost:${PORT}`);
		console.log(`Documentation: http://localhost:${PORT}/api/docs`);
		console.log('='.repeat(80));
		console.log('\nDevice Polling Endpoints:');
		console.log(`  GET    /api/v1/device/:uuid/state     - Device polls for target state`);
		console.log(`  PATCH  /api/v1/device/state           - Device reports current state`);
		console.log('\nManagement Endpoints:');
		console.log(`  GET    /api/v1/devices                - List all devices`);
		console.log(`  POST   /api/v1/devices/:uuid/target-state - Set target state`);
		console.log('='.repeat(80) + '\n');
	});
}

startServer().catch((error) => {
	console.error('Failed to start server:', error);
	process.exit(1);
});

export default app;
