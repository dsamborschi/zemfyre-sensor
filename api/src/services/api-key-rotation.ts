/**
 * API Key Rotation Service
 * 
 * Automatically rotates device API keys on a scheduled basis for enhanced security.
 * 
 * Features:
 * - Scheduled rotation before key expiry
 * - Grace period for old keys (allows devices time to update)
 * - Automatic notification to devices via MQTT
 * - Rotation history tracking
 * - Emergency key revocation
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { query } from '../db/connection';
import { getMqttManager } from '../mqtt';

export interface KeyRotationConfig {
  rotationDays: number;          // Days before expiry to rotate
  gracePeriodDays: number;       // Days old key remains valid
  notifyDevice: boolean;         // Notify device via MQTT
  autoRevoke: boolean;           // Auto-revoke old key after grace period
}

export interface DeviceKeyRotation {
  deviceUuid: string;
  deviceName: string;
  oldKeyHash: string;
  newKey: string;
  newKeyHash: string;
  expiresAt: Date;
  gracePeriodEnds: Date;
}

const DEFAULT_CONFIG: KeyRotationConfig = {
  rotationDays: 90,
  gracePeriodDays: 7,
  notifyDevice: true,
  autoRevoke: true
};

/**
 * Generate cryptographically secure API key
 */
function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Rotate API key for a single device
 */
export async function rotateDeviceApiKey(
  deviceUuid: string,
  config: Partial<KeyRotationConfig> = {}
): Promise<DeviceKeyRotation> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Get device info
  const deviceResult = await query(
    `SELECT uuid, device_name, device_api_key_hash, api_key_rotation_days
     FROM devices
     WHERE uuid = $1 AND is_active = true`,
    [deviceUuid]
  );

  if (deviceResult.rows.length === 0) {
    throw new Error(`Device ${deviceUuid} not found or inactive`);
  }

  const device = deviceResult.rows[0];

  // Generate new API key
  const newApiKey = generateApiKey();
  const newKeyHash = await bcrypt.hash(newApiKey, 10);

  // Calculate expiry dates
  const rotationDays = device.api_key_rotation_days || cfg.rotationDays;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + rotationDays);

  const gracePeriodEnds = new Date();
  gracePeriodEnds.setDate(gracePeriodEnds.getDate() + cfg.gracePeriodDays);

  // Update device with new key
  await query(
    `UPDATE devices
     SET 
       device_api_key_hash = $2,
       api_key_expires_at = $3,
       api_key_last_rotated_at = NOW()
     WHERE uuid = $1`,
    [deviceUuid, newKeyHash, expiresAt]
  );

  console.log(`✅ Rotated API key for device ${device.device_name} (${deviceUuid})`);
  console.log(`   New key expires: ${expiresAt.toISOString()}`);
  console.log(`   Grace period ends: ${gracePeriodEnds.toISOString()}`);

  // Notify device via MQTT
  if (cfg.notifyDevice) {
    await notifyDeviceOfRotation(deviceUuid, newApiKey, expiresAt, gracePeriodEnds);
  }

  // Schedule auto-revocation of old key
  if (cfg.autoRevoke) {
    await scheduleOldKeyRevocation(deviceUuid, device.device_api_key_hash, gracePeriodEnds);
  }

  // Log rotation event
  await logRotationEvent(deviceUuid, 'key_rotated', {
    device_name: device.device_name,
    expires_at: expiresAt.toISOString(),
    grace_period_ends: gracePeriodEnds.toISOString()
  });

  return {
    deviceUuid,
    deviceName: device.device_name,
    oldKeyHash: device.device_api_key_hash,
    newKey: newApiKey,
    newKeyHash,
    expiresAt,
    gracePeriodEnds
  };
}

/**
 * Rotate keys for all devices that need rotation
 */
export async function rotateExpiredKeys(
  config: Partial<KeyRotationConfig> = {}
): Promise<DeviceKeyRotation[]> {
  console.log('🔄 Starting automatic API key rotation...');

  // Get devices needing rotation (keys expiring soon)
  const result = await query(
    `SELECT uuid, device_name, days_until_expiry
     FROM devices_needing_rotation
     ORDER BY api_key_expires_at ASC`
  );

  if (result.rows.length === 0) {
    console.log('✅ No devices need key rotation at this time');
    return [];
  }

  console.log(`📋 Found ${result.rows.length} devices needing rotation`);

  const rotations: DeviceKeyRotation[] = [];

  for (const device of result.rows) {
    try {
      const rotation = await rotateDeviceApiKey(device.uuid, config);
      rotations.push(rotation);
      
      console.log(`  ✅ ${device.device_name}: ${device.days_until_expiry} days until expiry`);
    } catch (error) {
      console.error(`  ❌ ${device.device_name}: Rotation failed:`, error);
      
      await logRotationEvent(device.uuid, 'rotation_failed', {
        error: (error as Error).message
      });
    }
  }

  console.log(`✅ Rotation complete: ${rotations.length}/${result.rows.length} successful`);
  
  return rotations;
}

/**
 * Notify device of new API key via MQTT
 */
async function notifyDeviceOfRotation(
  deviceUuid: string,
  newApiKey: string,
  expiresAt: Date,
  gracePeriodEnds: Date
): Promise<void> {
  const mqttManager = getMqttManager();
  
  if (!mqttManager || !mqttManager.isConnected()) {
    console.warn('⚠️  MQTT not available, cannot notify device of rotation');
    return;
  }

  try {
    mqttManager.publish(
      `device/${deviceUuid}/config/api-key-rotation`,
      {
        event: 'api_key_rotated',
        new_api_key: newApiKey,
        expires_at: expiresAt.toISOString(),
        grace_period_ends: gracePeriodEnds.toISOString(),
        message: 'Your API key has been rotated. Please update your configuration.',
        timestamp: new Date().toISOString()
      }
    );

    console.log(`📡 Notified device ${deviceUuid} of key rotation via MQTT`);
  } catch (error) {
    console.error('❌ Failed to notify device via MQTT:', error);
  }
}

/**
 * Schedule revocation of old API key after grace period
 */
async function scheduleOldKeyRevocation(
  deviceUuid: string,
  oldKeyHash: string,
  gracePeriodEnds: Date
): Promise<void> {
  // Mark old key in history as expiring
  await query(
    `UPDATE device_api_key_history
     SET 
       expires_at = $3,
       is_active = true  -- Still active during grace period
     WHERE device_uuid = $1 AND key_hash = $2`,
    [deviceUuid, oldKeyHash, gracePeriodEnds]
  );

  console.log(`⏰ Scheduled revocation of old key for ${deviceUuid} at ${gracePeriodEnds.toISOString()}`);
}

/**
 * Revoke old API keys that are past grace period
 */
export async function revokeExpiredKeys(): Promise<number> {
  console.log('🔒 Revoking expired API keys...');

  const result = await query(
    `UPDATE device_api_key_history
     SET 
       is_active = false,
       revoked_at = NOW(),
       revoked_reason = 'Grace period expired'
     WHERE 
       is_active = true
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()
     RETURNING device_uuid`
  );

  if (result.rows.length > 0) {
    console.log(`✅ Revoked ${result.rows.length} expired API keys`);
    
    // Log revocation events
    for (const row of result.rows) {
      await logRotationEvent(row.device_uuid, 'old_key_revoked', {
        reason: 'Grace period expired'
      });
    }
  }

  return result.rows.length;
}

/**
 * Emergency revoke API key for a device
 */
export async function emergencyRevokeApiKey(
  deviceUuid: string,
  reason: string
): Promise<void> {
  console.log(`🚨 Emergency revocation for device ${deviceUuid}: ${reason}`);

  // Generate new key immediately
  const newApiKey = generateApiKey();
  const newKeyHash = await bcrypt.hash(newApiKey, 10);

  // Update device with new key (0 grace period)
  await query(
    `UPDATE devices
     SET 
       device_api_key_hash = $2,
       api_key_expires_at = NOW() + INTERVAL '90 days',
       api_key_last_rotated_at = NOW()
     WHERE uuid = $1`,
    [deviceUuid, newKeyHash]
  );

  // Revoke all old keys immediately
  await query(
    `UPDATE device_api_key_history
     SET 
       is_active = false,
       revoked_at = NOW(),
       revoked_reason = $2
     WHERE device_uuid = $1 AND is_active = true`,
    [deviceUuid, reason]
  );

  // Notify device immediately
  await notifyDeviceOfRotation(
    deviceUuid,
    newApiKey,
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    new Date() // Grace period = now (immediate)
  );

  await logRotationEvent(deviceUuid, 'emergency_revocation', { reason });

  console.log(`✅ Emergency revocation complete for ${deviceUuid}`);
  console.log(`   New API key: ${newApiKey.substring(0, 16)}...`);
}

/**
 * Log rotation event to audit log
 */
async function logRotationEvent(
  deviceUuid: string,
  eventType: string,
  details: any
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (event_type, device_uuid, severity, details)
       VALUES ($1, $2, $3, $4)`,
      [eventType, deviceUuid, 'info', JSON.stringify(details)]
    );
  } catch (error) {
    console.error('Failed to log rotation event:', error);
  }
}

/**
 * Get rotation status for a device
 */
export async function getDeviceRotationStatus(deviceUuid: string): Promise<any> {
  const result = await query(
    `SELECT 
       d.uuid,
       d.device_name,
       d.api_key_expires_at,
       d.api_key_last_rotated_at,
       d.api_key_rotation_enabled,
       d.api_key_rotation_days,
       EXTRACT(DAY FROM (d.api_key_expires_at - NOW())) as days_until_expiry,
       (SELECT COUNT(*) FROM device_api_key_history WHERE device_uuid = d.uuid) as total_rotations,
       (SELECT COUNT(*) FROM device_api_key_history WHERE device_uuid = d.uuid AND is_active = true) as active_keys
     FROM devices d
     WHERE d.uuid = $1`,
    [deviceUuid]
  );

  if (result.rows.length === 0) {
    throw new Error(`Device ${deviceUuid} not found`);
  }

  return result.rows[0];
}

/**
 * Get rotation history for a device
 */
export async function getDeviceRotationHistory(
  deviceUuid: string,
  limit: number = 10
): Promise<any[]> {
  const result = await query(
    `SELECT 
       id,
       key_hash,
       issued_at,
       expires_at,
       revoked_at,
       revoked_reason,
       is_active
     FROM device_api_key_history
     WHERE device_uuid = $1
     ORDER BY issued_at DESC
     LIMIT $2`,
    [deviceUuid, limit]
  );

  return result.rows;
}

export default {
  rotateDeviceApiKey,
  rotateExpiredKeys,
  revokeExpiredKeys,
  emergencyRevokeApiKey,
  getDeviceRotationStatus,
  getDeviceRotationHistory
};
