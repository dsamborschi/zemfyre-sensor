# Provisioning Process Update - Dynamic Broker Configuration ✅

## Summary

Updated device provisioning to return **database-driven MQTT broker configuration** instead of hardcoded environment variables.

## Key Changes

### 1. Provisioning Response Enhanced

**Before:**
```json
"mqtt": {
  "broker": "mqtt://mosquitto:1883"  // Hardcoded from env var
}
```

**After:**
```json
"mqtt": {
  "broker": "mqtts://mqtt.example.com:8883",  // From database
  "brokerConfig": {
    "protocol": "mqtts",
    "host": "mqtt.example.com",
    "port": 8883,
    "useTls": true,
    "keepAlive": 60,
    "caCert": "-----BEGIN CERTIFICATE-----\n..."
    // ... full configuration
  }
}
```

### 2. Broker Selection Logic

**Priority order:**
1. Device-specific broker (`devices.mqtt_broker_id`)
2. Default broker (`mqtt_broker_config.is_default = true`)
3. Environment variable (`MQTT_BROKER_URL`) - fallback

### 3. New Utility Functions

Created `api/src/utils/mqtt-broker-config.ts`:
- `getBrokerConfigForDevice()` - Fetch broker with defaults
- `getDefaultBrokerConfig()` - Get default broker
- `buildBrokerUrl()` - Build connection URL
- `formatBrokerConfigForClient()` - Sanitize for API response
- `assignBrokerToDevice()` - Assign broker to device

### 4. Code Updates

**Modified:**
- `api/src/routes/provisioning.ts` - Use database broker config

**Created:**
- `api/src/utils/mqtt-broker-config.ts` - Helper functions
- `docs/PROVISIONING-BROKER-CONFIG.md` - Complete documentation

## Benefits

✅ **Frontend Configurable** - Manage brokers via admin panel
✅ **Multi-Tenant** - Different brokers per fleet/device
✅ **Secure** - TLS certificates distributed automatically
✅ **Flexible** - Local dev, cloud prod, edge deployment
✅ **Backward Compatible** - Falls back to env vars

## Agent Integration

Agents receive full broker configuration during provisioning:

```typescript
const connectOptions = {
  username: provisioningData.mqtt.username,
  password: provisioningData.mqtt.password,
  
  // Use detailed config if provided
  ...(provisioningData.mqtt.brokerConfig && {
    protocol: provisioningData.mqtt.brokerConfig.protocol,
    host: provisioningData.mqtt.brokerConfig.host,
    port: provisioningData.mqtt.brokerConfig.port,
    keepalive: provisioningData.mqtt.brokerConfig.keepAlive,
    
    // TLS options
    ca: provisioningData.mqtt.brokerConfig.caCert,
    rejectUnauthorized: provisioningData.mqtt.brokerConfig.verifyCertificate
  })
};

mqtt.connect(provisioningData.mqtt.broker, connectOptions);
```

## Usage Examples

### Assign Broker to Device
```bash
# Via API
curl -X PUT http://localhost:4002/api/v1/devices/{uuid} \
  -d '{"mqtt_broker_id": 2}'

# Via Database
UPDATE devices SET mqtt_broker_id = 2 WHERE uuid = 'device-uuid';
```

### Test Provisioning
```bash
curl -X POST http://localhost:4002/api/v1/device/register \
  -H "Authorization: Bearer PROVISIONING_KEY" \
  -d '{
    "uuid": "test-123",
    "deviceName": "Test Device",
    "deviceType": "raspberry-pi",
    "deviceApiKey": "test-key"
  }'
```

**Response includes:**
- `mqtt.broker` - Connection URL
- `mqtt.brokerConfig` - Full configuration (protocol, TLS, timeouts, etc.)
- `mqtt.topics` - Publish/subscribe topics

## Migration for Existing Devices

```sql
-- Assign default broker to all existing devices
UPDATE devices 
SET mqtt_broker_id = (
  SELECT id FROM mqtt_broker_config WHERE is_default = true LIMIT 1
)
WHERE mqtt_broker_id IS NULL;
```

## Files Modified

### Modified
- `api/src/routes/provisioning.ts` (lines 452-468)
  - Import broker config utilities
  - Fetch broker from database during provisioning
  - Return enhanced MQTT configuration

### Created
- `api/src/utils/mqtt-broker-config.ts` - 145 lines
- `docs/PROVISIONING-BROKER-CONFIG.md` - Complete guide

## Backward Compatibility

✅ **100% Backward Compatible**
- No database config? Uses `MQTT_BROKER_URL` env var
- Query fails? Falls back to env var
- `brokerConfig` is optional in response
- Agents can ignore detailed config and just use `broker` URL

## Testing

1. **Start API server** with database migration 019 applied
2. **Provision new device** - Should receive broker config
3. **Check response** - Contains `mqtt.brokerConfig` object
4. **Agent connects** - Uses detailed configuration

## Next Steps

### Required
- [ ] Update agent to use `brokerConfig` if present
- [ ] Test with different broker configurations (local, cloud, TLS)
- [ ] Add broker selection to admin panel device edit page

### Optional
- [ ] Add broker health monitoring
- [ ] Implement automatic failover to backup broker
- [ ] Add certificate rotation via device shadow
- [ ] Regional broker auto-assignment

---

**Status**: ✅ Complete. Provisioning now returns database-driven broker configuration with full backward compatibility.
