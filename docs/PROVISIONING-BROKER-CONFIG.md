# Provisioning Process with Dynamic Broker Configuration

## Overview

The device provisioning process now returns **dynamic MQTT broker configuration from the database** instead of hardcoded environment variables. This allows frontend configuration of broker settings per device or fleet.

## Changes to Provisioning Response

### Before (Hardcoded)
```json
{
  "mqtt": {
    "username": "device_abc123",
    "password": "secure_password",
    "broker": "mqtt://mosquitto:1883",
    "topics": {
      "publish": ["iot/device/abc123/#"],
      "subscribe": ["iot/device/abc123/#"]
    }
  }
}
```

### After (Database-Driven)
```json
{
  "mqtt": {
    "username": "device_abc123",
    "password": "secure_password",
    "broker": "mqtts://mqtt.example.com:8883",
    "brokerConfig": {
      "protocol": "mqtts",
      "host": "mqtt.example.com",
      "port": 8883,
      "useTls": true,
      "verifyCertificate": true,
      "clientIdPrefix": "zemfyre",
      "keepAlive": 60,
      "cleanSession": true,
      "reconnectPeriod": 1000,
      "connectTimeout": 30000,
      "caCert": "-----BEGIN CERTIFICATE-----\n..."
    },
    "topics": {
      "publish": ["iot/device/abc123/#"],
      "subscribe": ["iot/device/abc123/#"]
    }
  }
}
```

## How It Works

### 1. Database Lookup
When a device registers, the provisioning endpoint:
```typescript
const brokerConfig = await getBrokerConfigForDevice(uuid);
```

This query:
1. Checks if device has a specific `mqtt_broker_id` assigned
2. Falls back to default broker (`is_default = true`)
3. Returns null if no broker config exists (uses env var fallback)

### 2. Broker Selection Logic

```sql
SELECT * FROM mqtt_broker_config 
WHERE id = COALESCE(
  (SELECT mqtt_broker_id FROM devices WHERE uuid = $1),
  (SELECT id FROM mqtt_broker_config WHERE is_default = true LIMIT 1)
)
```

**Priority:**
1. Device-specific broker (`devices.mqtt_broker_id`)
2. Default broker (`mqtt_broker_config.is_default = true`)
3. Environment variable (`MQTT_BROKER_URL`)

### 3. Response Building

```typescript
const brokerUrl = brokerConfig 
  ? buildBrokerUrl(brokerConfig)
  : (process.env.MQTT_BROKER_URL || 'mqtt://mosquitto:1883');

const response = {
  mqtt: {
    broker: brokerUrl,
    brokerConfig: brokerConfig ? formatBrokerConfigForClient(brokerConfig) : undefined
  }
};
```

## Agent Integration

The device agent can now use the detailed broker configuration:

```typescript
// agent/src/mqtt/mqtt-manager.ts
interface ProvisioningResponse {
  mqtt: {
    username: string;
    password: string;
    broker: string;
    brokerConfig?: {
      protocol: string;
      host: string;
      port: number;
      useTls: boolean;
      verifyCertificate: boolean;
      clientIdPrefix: string;
      keepAlive: number;
      cleanSession: boolean;
      reconnectPeriod: number;
      connectTimeout: number;
      caCert?: string;
      clientCert?: string;
    };
    topics: {
      publish: string[];
      subscribe: string[];
    };
  };
}

// Use broker config if provided
const connectOptions: IClientOptions = {
  username: provisioningData.mqtt.username,
  password: provisioningData.mqtt.password,
  
  // Use detailed config if available
  ...(provisioningData.mqtt.brokerConfig && {
    protocol: provisioningData.mqtt.brokerConfig.protocol,
    host: provisioningData.mqtt.brokerConfig.host,
    port: provisioningData.mqtt.brokerConfig.port,
    keepalive: provisioningData.mqtt.brokerConfig.keepAlive,
    clean: provisioningData.mqtt.brokerConfig.cleanSession,
    reconnectPeriod: provisioningData.mqtt.brokerConfig.reconnectPeriod,
    connectTimeout: provisioningData.mqtt.brokerConfig.connectTimeout,
    
    // TLS options
    ...(provisioningData.mqtt.brokerConfig.useTls && {
      rejectUnauthorized: provisioningData.mqtt.brokerConfig.verifyCertificate,
      ca: provisioningData.mqtt.brokerConfig.caCert ? 
          [Buffer.from(provisioningData.mqtt.brokerConfig.caCert)] : undefined,
      cert: provisioningData.mqtt.brokerConfig.clientCert ? 
            Buffer.from(provisioningData.mqtt.brokerConfig.clientCert) : undefined
    })
  })
};

const client = mqtt.connect(provisioningData.mqtt.broker, connectOptions);
```

## Utility Functions

Created in `api/src/utils/mqtt-broker-config.ts`:

### `getBrokerConfigForDevice(deviceUuid)`
Fetches broker configuration for a specific device (with default fallback)

### `getDefaultBrokerConfig()`
Fetches the default broker configuration

### `buildBrokerUrl(config)`
Builds full broker URL from configuration object

### `formatBrokerConfigForClient(config)`
Sanitizes and formats broker config for API response (removes sensitive data)

### `assignBrokerToDevice(deviceUuid, brokerId)`
Assigns a specific broker to a device

## Assigning Brokers to Devices

### Via API
```bash
# Assign specific broker
curl -X PUT http://localhost:4002/api/v1/devices/{uuid} \
  -H "Content-Type: application/json" \
  -d '{"mqtt_broker_id": 2}'

# Use default broker
curl -X PUT http://localhost:4002/api/v1/devices/{uuid} \
  -H "Content-Type: application/json" \
  -d '{"mqtt_broker_id": null}'
```

### Via Database
```sql
-- Assign specific broker to device
UPDATE devices 
SET mqtt_broker_id = 2 
WHERE uuid = 'device-uuid';

-- Use default broker
UPDATE devices 
SET mqtt_broker_id = NULL 
WHERE uuid = 'device-uuid';
```

### Via Provisioning Key (Future Enhancement)
You could extend provisioning keys to pre-assign brokers:

```sql
ALTER TABLE provisioning_keys 
ADD COLUMN default_broker_id INTEGER REFERENCES mqtt_broker_config(id);

-- When provisioning, use key's default broker
UPDATE devices 
SET mqtt_broker_id = (
  SELECT default_broker_id 
  FROM provisioning_keys 
  WHERE id = $1
)
WHERE uuid = $2;
```

## Benefits

### 1. Flexible Deployment
- **Local development**: Use `mqtt://localhost:1883`
- **Cloud production**: Use `mqtts://mqtt.example.com:8883`
- **Edge gateways**: Use local edge broker per region

### 2. Security
- Store TLS certificates in database
- Automatic certificate distribution to devices
- Centralized certificate management

### 3. Multi-Tenancy
- Different brokers for different fleets
- Isolate customer data by broker
- Geographic broker distribution

### 4. Configuration Management
- Update broker settings without code changes
- Test new broker configurations gradually
- Roll back broker changes easily

## Migration Path

### Existing Devices
Devices provisioned before this change will continue using `process.env.MQTT_BROKER_URL` until:
1. Database has broker configurations (migration 019 run)
2. Default broker is set (`is_default = true`)
3. Device re-provisions or gets manually assigned

### Gradual Rollout
```sql
-- 1. Verify default broker exists
SELECT * FROM mqtt_broker_config WHERE is_default = true;

-- 2. Assign default broker to existing devices
UPDATE devices 
SET mqtt_broker_id = (
  SELECT id FROM mqtt_broker_config WHERE is_default = true LIMIT 1
)
WHERE mqtt_broker_id IS NULL;

-- 3. Monitor device connections
SELECT 
  d.uuid,
  d.device_name,
  mbc.name AS broker_name,
  mbc.host AS broker_host
FROM devices d
LEFT JOIN mqtt_broker_config mbc ON d.mqtt_broker_id = mbc.id
WHERE d.is_online = true;
```

## Testing

### Test Provisioning Response
```bash
curl -X POST http://localhost:4002/api/v1/device/register \
  -H "Authorization: Bearer YOUR_PROVISIONING_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "uuid": "test-device-123",
    "deviceName": "Test Device",
    "deviceType": "raspberry-pi-4",
    "deviceApiKey": "test-api-key"
  }'
```

**Expected Response:**
```json
{
  "mqtt": {
    "broker": "mqtt://localhost:5883",
    "brokerConfig": {
      "protocol": "mqtt",
      "host": "localhost",
      "port": 5883,
      "useTls": false,
      "keepAlive": 60,
      ...
    }
  }
}
```

## Backward Compatibility

✅ **Fully backward compatible**
- If no database broker config: Uses `process.env.MQTT_BROKER_URL`
- If database query fails: Falls back to env var
- `brokerConfig` field is optional in response
- Agents can use simple `broker` URL or detailed `brokerConfig`

## Future Enhancements

1. **Broker Health Monitoring**: Track which devices use which brokers
2. **Automatic Failover**: Switch to backup broker if primary fails
3. **Load Balancing**: Distribute devices across multiple brokers
4. **Certificate Rotation**: Automatic cert updates via shadow
5. **Regional Brokers**: Auto-assign based on device location
