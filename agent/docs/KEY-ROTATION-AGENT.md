# Agent-Side API Key Rotation

Guide for implementing automatic API key rotation in the device agent.

## Overview

The device agent must handle API key rotation gracefully to maintain connectivity while keys are rotated. This includes:

- ✅ Detecting when rotation is needed
- ✅ Requesting new keys from the API
- ✅ Updating local configuration
- ✅ Handling MQTT rotation notifications
- ✅ Graceful reconnection with new credentials

## Implementation Strategy

### 1. Key Status Monitoring

Add periodic checks to detect when rotation is needed:

```typescript
// agent/src/provisioning/device-manager.ts

export class DeviceManager {
  private rotationCheckInterval: NodeJS.Timeout | null = null;
  
  /**
   * Start monitoring for API key rotation needs
   */
  public startRotationMonitoring(): void {
    const checkInterval = parseInt(process.env.KEY_ROTATION_CHECK_HOURS || '24') * 60 * 60 * 1000;
    
    this.rotationCheckInterval = setInterval(async () => {
      await this.checkKeyRotationNeeded();
    }, checkInterval);
    
    // Check immediately on startup
    this.checkKeyRotationNeeded();
  }
  
  /**
   * Stop rotation monitoring
   */
  public stopRotationMonitoring(): void {
    if (this.rotationCheckInterval) {
      clearInterval(this.rotationCheckInterval);
      this.rotationCheckInterval = null;
    }
  }
  
  /**
   * Check if API key rotation is needed
   */
  private async checkKeyRotationNeeded(): Promise<void> {
    try {
      const deviceInfo = await this.getDeviceInfo();
      if (!deviceInfo || !deviceInfo.uuid) {
        return;
      }
      
      const apiEndpoint = process.env.CLOUD_ENDPOINT || 'http://localhost:4002';
      const apiVersion = process.env.API_VERSION || 'v1';
      
      const response = await fetch(
        `${apiEndpoint}/api/${apiVersion}/device/${deviceInfo.uuid}/key-status`,
        {
          headers: {
            'X-Device-API-Key': deviceInfo.apiKey || ''
          }
        }
      );
      
      if (!response.ok) {
        console.error('Failed to check key status:', response.statusText);
        return;
      }
      
      const data = await response.json();
      
      if (data.success && data.data.needs_rotation) {
        console.log(`🔄 API key rotation needed (expires in ${data.data.days_until_expiry} days)`);
        await this.rotateApiKey('Automatic rotation - key expiring soon');
      }
      
    } catch (error) {
      console.error('Error checking key rotation status:', error);
    }
  }
  
  /**
   * Rotate API key
   */
  public async rotateApiKey(reason: string = 'Manual rotation'): Promise<boolean> {
    try {
      const deviceInfo = await this.getDeviceInfo();
      if (!deviceInfo || !deviceInfo.uuid) {
        throw new Error('Device not provisioned');
      }
      
      console.log(`🔄 Rotating API key for device ${deviceInfo.uuid}...`);
      console.log(`   Reason: ${reason}`);
      
      const apiEndpoint = process.env.CLOUD_ENDPOINT || 'http://localhost:4002';
      const apiVersion = process.env.API_VERSION || 'v1';
      
      const response = await fetch(
        `${apiEndpoint}/api/${apiVersion}/device/${deviceInfo.uuid}/rotate-key`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-API-Key': deviceInfo.apiKey || ''
          },
          body: JSON.stringify({ reason })
        }
      );
      
      if (!response.ok) {
        throw new Error(`Rotation request failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Rotation failed');
      }
      
      // Update local storage with new key
      await this.updateApiKey(data.data.new_api_key);
      
      console.log(`✅ API key rotated successfully`);
      console.log(`   New key expires: ${data.data.expires_at}`);
      console.log(`   Old key valid until: ${data.data.grace_period_ends}`);
      
      // Trigger reconnection with new key
      await this.reconnectWithNewKey();
      
      return true;
      
    } catch (error) {
      console.error('❌ API key rotation failed:', error);
      return false;
    }
  }
  
  /**
   * Update API key in local storage
   */
  private async updateApiKey(newApiKey: string): Promise<void> {
    const db = await this.getDatabase();
    
    await db.run(
      `UPDATE device_info 
       SET device_api_key = ?, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = 1`,
      [newApiKey]
    );
    
    console.log('✅ API key updated in local storage');
  }
  
  /**
   * Reconnect all services with new API key
   */
  private async reconnectWithNewKey(): Promise<void> {
    console.log('🔄 Reconnecting services with new API key...');
    
    // Emit event for supervisor to handle reconnection
    // This allows supervisor to restart CloudLogBackend, CloudJobsAdapter, etc.
    process.emit('rotation:key-updated' as any);
    
    console.log('✅ Services notified of key rotation');
  }
}
```

### 2. MQTT Rotation Handler

Listen for server-initiated rotation notifications:

```typescript
// agent/src/provisioning/mqtt-rotation-handler.ts

import { DeviceManager } from './device-manager';

export class MqttRotationHandler {
  constructor(
    private deviceManager: DeviceManager,
    private mqttClient: any // Your MQTT client
  ) {}
  
  /**
   * Subscribe to rotation notifications
   */
  public subscribe(deviceUuid: string): void {
    const topic = `device/${deviceUuid}/config/api-key-rotation`;
    
    this.mqttClient.subscribe(topic, (err: Error) => {
      if (err) {
        console.error('Failed to subscribe to rotation topic:', err);
      } else {
        console.log(`📡 Subscribed to rotation notifications: ${topic}`);
      }
    });
    
    this.mqttClient.on('message', async (receivedTopic: string, payload: Buffer) => {
      if (receivedTopic === topic) {
        await this.handleRotationMessage(payload);
      }
    });
  }
  
  /**
   * Handle rotation notification
   */
  private async handleRotationMessage(payload: Buffer): Promise<void> {
    try {
      const message = JSON.parse(payload.toString());
      
      if (message.event === 'api_key_rotated') {
        console.log('📡 Received API key rotation notification via MQTT');
        console.log(`   New key expires: ${message.expires_at}`);
        console.log(`   Grace period ends: ${message.grace_period_ends}`);
        
        // Update local storage with new key
        await this.deviceManager['updateApiKey'](message.new_api_key);
        
        // Reconnect services
        await this.deviceManager['reconnectWithNewKey']();
        
        console.log('✅ API key updated from MQTT notification');
      }
      
    } catch (error) {
      console.error('Error handling rotation MQTT message:', error);
    }
  }
}
```

### 3. Supervisor Integration

Update supervisor to handle key rotation events:

```typescript
// agent/src/supervisor.ts

import { DeviceManager } from './provisioning/device-manager';
import { MqttRotationHandler } from './provisioning/mqtt-rotation-handler';

export class Supervisor {
  private deviceManager: DeviceManager;
  private rotationHandler: MqttRotationHandler | null = null;
  
  async initialize() {
    // ... existing initialization ...
    
    // Start rotation monitoring
    this.deviceManager.startRotationMonitoring();
    
    // Subscribe to MQTT rotation notifications if MQTT is enabled
    if (process.env.MQTT_ENABLED === 'true' && this.mqttClient) {
      const deviceInfo = await this.deviceManager.getDeviceInfo();
      if (deviceInfo && deviceInfo.uuid) {
        this.rotationHandler = new MqttRotationHandler(
          this.deviceManager,
          this.mqttClient
        );
        this.rotationHandler.subscribe(deviceInfo.uuid);
      }
    }
    
    // Listen for rotation events
    process.on('rotation:key-updated' as any, async () => {
      console.log('🔄 Handling API key rotation...');
      await this.reconnectServices();
    });
  }
  
  /**
   * Reconnect all cloud services with new API key
   */
  private async reconnectServices(): Promise<void> {
    try {
      const deviceInfo = await this.deviceManager.getDeviceInfo();
      
      // Restart CloudLogBackend
      if (this.cloudLogBackend) {
        this.cloudLogBackend.stop();
        this.cloudLogBackend = new CloudLogBackend({
          ...this.cloudLogBackend.config,
          deviceApiKey: deviceInfo.apiKey
        });
        this.cloudLogBackend.start();
      }
      
      // Restart CloudJobsAdapter
      if (this.cloudJobsAdapter) {
        this.cloudJobsAdapter.stop();
        this.cloudJobsAdapter = new CloudJobsAdapter({
          ...this.cloudJobsAdapter.config,
          deviceApiKey: deviceInfo.apiKey
        });
        this.cloudJobsAdapter.start();
      }
      
      // Restart API binder (state polling)
      if (this.apiBinder) {
        this.apiBinder.updateApiKey(deviceInfo.apiKey);
      }
      
      console.log('✅ All services reconnected with new API key');
      
    } catch (error) {
      console.error('❌ Failed to reconnect services:', error);
    }
  }
  
  async shutdown() {
    // Stop rotation monitoring
    this.deviceManager.stopRotationMonitoring();
    
    // ... existing shutdown ...
  }
}
```

### 4. Configuration

Add environment variables to agent:

```bash
# Enable automatic key rotation monitoring (default: true)
ENABLE_KEY_ROTATION=true

# How often to check if rotation is needed (hours, default: 24)
KEY_ROTATION_CHECK_HOURS=24

# Cloud API endpoint
CLOUD_ENDPOINT=http://api.example.com:4002

# API version
API_VERSION=v1

# Enable MQTT for receiving rotation notifications
MQTT_ENABLED=true
MQTT_BROKER=mqtt://mosquitto:1883
```

## Rotation Workflow

### Server-Initiated Rotation

1. **API scheduler** detects device needs rotation (expires within 7 days)
2. **API generates** new key, updates database
3. **MQTT notification** sent to `device/{uuid}/config/api-key-rotation`
4. **Agent receives** MQTT message
5. **Agent updates** local SQLite with new key
6. **Agent reconnects** all services with new credentials
7. **Old key** remains valid for 7 days (grace period)

### Device-Initiated Rotation

1. **Agent scheduler** checks key status every 24 hours
2. **Detects** key expiring soon (`needs_rotation: true`)
3. **Calls** `POST /device/:uuid/rotate-key` with current key
4. **Receives** new key in response
5. **Updates** local storage
6. **Reconnects** all services
7. **Old key** valid for 7 days

### Emergency Rotation

1. **Admin** calls emergency revoke endpoint
2. **All old keys** immediately invalidated (no grace period)
3. **MQTT notification** sent with `grace_period_ends = NOW`
4. **Agent** must update immediately or lose access
5. **Agent** automatically retries provisioning if 401 errors persist

## Testing

### Test Automatic Rotation

```bash
# Set device key to expire soon
psql -U postgres -d iotistic -c "
  UPDATE devices 
  SET api_key_expires_at = NOW() + INTERVAL '5 days'
  WHERE uuid = 'test-device-uuid';
"

# Wait for rotation scheduler (or trigger manually)
# Check agent logs for rotation messages
```

### Test Manual Rotation

```bash
# From agent console
curl -X POST http://localhost:4002/api/v1/device/test-device-uuid/rotate-key \
  -H "X-Device-API-Key: current-key" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Testing manual rotation"}'
```

### Test MQTT Notification

```bash
# Publish test rotation message
mosquitto_pub -h localhost -t 'device/test-device-uuid/config/api-key-rotation' \
  -m '{
    "event": "api_key_rotated",
    "new_api_key": "test-new-key-64-chars-long",
    "expires_at": "2025-04-15T12:00:00.000Z",
    "grace_period_ends": "2025-01-22T12:00:00.000Z",
    "message": "Your API key has been rotated.",
    "timestamp": "2025-01-15T12:00:00.000Z"
  }'
```

## Troubleshooting

### Agent Not Rotating

**Check**:
- `ENABLE_KEY_ROTATION=true` in agent environment
- Agent logs show "Starting rotation monitoring"
- Device has `api_key_rotation_enabled = true` in database

**Fix**:
```bash
# Enable in database
UPDATE devices SET api_key_rotation_enabled = true WHERE uuid = 'device-uuid';

# Restart agent with rotation enabled
ENABLE_KEY_ROTATION=true npm run start:device
```

### MQTT Notifications Not Received

**Check**:
- Agent subscribed to correct topic: `device/{uuid}/config/api-key-rotation`
- MQTT broker is running and accessible
- Agent logs show "Subscribed to rotation notifications"

**Fix**:
```bash
# Test MQTT connectivity
mosquitto_sub -h localhost -t 'device/+/config/#' -v

# Check agent MQTT config
echo $MQTT_ENABLED
echo $MQTT_BROKER
```

### 401 Errors After Rotation

**Cause**: Old key revoked before agent updated

**Fix**:
```bash
# Emergency provision with new key
# Agent will automatically re-provision if device_api_key is invalid
# Check agent logs for provisioning flow
```

## Best Practices

1. **Monitor Grace Periods**: Ensure agent updates within 7 days
2. **Log Rotation Events**: Track all rotations for audit
3. **Test Regularly**: Simulate rotation in staging environment
4. **Backup Keys**: Keep old key during grace period
5. **Health Checks**: Monitor 401 errors as indicator of rotation issues
6. **Fallback**: Implement re-provisioning if rotation fails

## See Also

- [API Key Rotation Guide](../../api/docs/API-KEY-ROTATION.md)
- [Device Authentication](../../api/docs/DEVICE-AUTHENTICATION.md)
- [Device Manager](../src/provisioning/device-manager.ts)
