/**
 * Cloud Multi-Device Management Routes
 * Manage multiple IoT devices from a central server
 */

import express from 'express';

export const router = express.Router();

// Types
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

// In-memory storage (replace with database in production)
const deviceTargetStates = new Map<string, DeviceTargetState>();
const deviceCurrentStates = new Map<string, DeviceCurrentState>();

function generateETag(data: any): string {
  return Buffer.from(JSON.stringify(data)).toString('base64').substring(0, 32);
}

// Device polling for target state
router.get('/api/v1/device/:uuid/state', (req, res) => {
  const { uuid } = req.params;
  const ifNoneMatch = req.headers['if-none-match'];

  const targetState = deviceTargetStates.get(uuid);

  if (!targetState) {
    const emptyState = { [uuid]: { apps: {} } };
    const etag = generateETag(emptyState);
    return res.set('ETag', etag).json(emptyState);
  }

  if (ifNoneMatch && ifNoneMatch === targetState.etag) {
    return res.status(304).end();
  }

  const response = { [uuid]: { apps: targetState.apps } };
  res.set('ETag', targetState.etag).json(response);
});

// Device uploads logs
router.post('/api/v1/device/:uuid/logs', async (req, res) => {
  try {
    const { uuid } = req.params;
    const contentEncoding = req.headers['content-encoding'];

    console.log(`📥 Received logs from device ${uuid.substring(0, 8)}...`);
    console.log(`   Content-Encoding: ${contentEncoding || 'none'}`);
    console.log(`   Size: ${req.headers['content-length'] || 'unknown'} bytes`);

    res.json({ status: 'ok', received: 'logs' });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to process logs',
      message: error.message
    });
  }
});

// Device reports current state
router.patch('/api/v1/device/state', (req, res) => {
  try {
    const stateReport = req.body;

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
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to process state report',
      message: error.message
    });
  }
});

// List all devices
router.get('/api/v1/devices', (req, res) => {
  const devices: any[] = [];

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

  res.json({ count: devices.length, devices });
});

// Get specific device
router.get('/api/v1/devices/:uuid', (req, res) => {
  const { uuid } = req.params;

  const targetState = deviceTargetStates.get(uuid);
  const currentState = deviceCurrentStates.get(uuid);

  if (!targetState && !currentState) {
    return res.status(404).json({
      error: 'Device not found',
      message: `Device ${uuid} not found`
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

// Get device target state
router.get('/api/v1/devices/:uuid/target-state', (req, res) => {
  const { uuid } = req.params;
  const targetState = deviceTargetStates.get(uuid);

  res.json({
    uuid,
    apps: targetState?.apps || {},
    updated_at: targetState?.updated_at,
  });
});

// Set device target state
router.post('/api/v1/devices/:uuid/target-state', (req, res) => {
  try {
    const { uuid } = req.params;
    const { apps } = req.body;

    if (!apps || typeof apps !== 'object') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Body must contain apps object'
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
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to set target state',
      message: error.message
    });
  }
});

// Get device current state
router.get('/api/v1/devices/:uuid/current-state', (req, res) => {
  const { uuid } = req.params;
  const currentState = deviceCurrentStates.get(uuid);

  if (!currentState) {
    return res.status(404).json({
      error: 'No state reported yet',
      message: `Device ${uuid} has not reported its state yet`
    });
  }

  res.json(currentState);
});

// Clear device target state
router.delete('/api/v1/devices/:uuid/target-state', (req, res) => {
  const { uuid } = req.params;

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

export default router;
