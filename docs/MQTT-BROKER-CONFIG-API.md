# MQTT Broker Configuration API

Database-backed MQTT broker configuration system for frontend management.

## Overview

The MQTT broker configuration system allows you to:
- Store multiple MQTT broker connection details in the database
- Manage broker credentials (username/password with bcrypt hashing)
- Configure TLS/SSL certificates
- Set default broker for new device provisioning
- View device counts per broker
- Configure via REST API or frontend admin panel

## Database Schema

### Table: `mqtt_broker_config`

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `name` | VARCHAR(255) | Unique broker name (e.g., "Local Broker") |
| `description` | TEXT | Optional description |
| `protocol` | VARCHAR(10) | Connection protocol: `mqtt`, `mqtts`, `ws`, `wss` |
| `host` | VARCHAR(255) | Broker hostname or IP |
| `port` | INTEGER | Broker port (1-65535) |
| `username` | VARCHAR(255) | Authentication username |
| `password_hash` | VARCHAR(255) | bcrypt hashed password |
| `use_tls` | BOOLEAN | Enable TLS/SSL |
| `ca_cert` | TEXT | CA certificate (PEM format) |
| `client_cert` | TEXT | Client certificate (PEM format) |
| `client_key` | TEXT | Client private key (PEM format) |
| `verify_certificate` | BOOLEAN | Verify SSL certificates |
| `client_id_prefix` | VARCHAR(100) | MQTT client ID prefix (default: "Iotistic") |
| `keep_alive` | INTEGER | Keep-alive interval in seconds (default: 60) |
| `clean_session` | BOOLEAN | Clean session flag (default: true) |
| `reconnect_period` | INTEGER | Reconnect delay in ms (default: 1000) |
| `connect_timeout` | INTEGER | Connection timeout in ms (default: 30000) |
| `is_active` | BOOLEAN | Enable/disable broker |
| `is_default` | BOOLEAN | Default broker for new devices |
| `broker_type` | VARCHAR(50) | Broker type: `local`, `cloud`, `edge`, `test` |
| `extra_config` | JSONB | Additional JSON configuration |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |
| `last_connected_at` | TIMESTAMP | Last successful connection |

### Table: `devices` (Extended)

Added column:
- `mqtt_broker_id` (INTEGER, FOREIGN KEY) - Links device to broker configuration

## API Endpoints

Base URL: `http://localhost:4002/api/v1/mqtt`

### List All Brokers

```http
GET /brokers
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Local Broker",
      "description": "Local Mosquitto broker",
      "protocol": "mqtt",
      "host": "localhost",
      "port": 5883,
      "username": "admin",
      "use_tls": false,
      "is_active": true,
      "is_default": true,
      "broker_type": "local",
      "created_at": "2025-10-21T07:05:25.000Z"
    }
  ],
  "count": 1
}
```

### Get Broker Summary (with device counts)

```http
GET /brokers/summary
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Local Broker",
      "host": "localhost",
      "port": 5883,
      "device_count": "5",
      "active_device_count": "3"
    }
  ]
}
```

### Get Broker by ID

```http
GET /brokers/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Local Broker",
    "protocol": "mqtt",
    "host": "localhost",
    "port": 5883,
    "username": "admin",
    "use_tls": false,
    "ca_cert": null,
    "client_cert": null,
    "verify_certificate": true,
    "client_id_prefix": "Iotistic",
    "keep_alive": 60,
    "clean_session": true,
    "reconnect_period": 1000,
    "connect_timeout": 30000,
    "is_active": true,
    "is_default": true,
    "broker_type": "local",
    "extra_config": {}
  }
}
```

### Create New Broker

```http
POST /brokers
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Cloud Broker",
  "description": "Production cloud MQTT broker",
  "protocol": "mqtts",
  "host": "mqtt.example.com",
  "port": 8883,
  "username": "cloud_user",
  "password": "secure_password",
  "use_tls": true,
  "ca_cert": "-----BEGIN CERTIFICATE-----\n...",
  "verify_certificate": true,
  "broker_type": "cloud",
  "is_active": true,
  "is_default": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Broker configuration created successfully",
  "data": {
    "id": 2,
    "name": "Cloud Broker",
    "protocol": "mqtts",
    "host": "mqtt.example.com",
    "port": 8883,
    "created_at": "2025-10-21T07:10:00.000Z"
  }
}
```

### Update Broker

```http
PUT /brokers/:id
Content-Type: application/json
```

**Body:** (All fields optional)
```json
{
  "description": "Updated description",
  "port": 8884,
  "is_active": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Broker configuration updated successfully",
  "data": { ... }
}
```

### Delete Broker

```http
DELETE /brokers/:id
```

**Response:**
```json
{
  "success": true,
  "message": "Broker configuration \"Cloud Broker\" deleted successfully"
}
```

**Error (if in use):**
```json
{
  "success": false,
  "error": "Cannot delete broker configuration that is in use by devices",
  "devices_count": "3"
}
```

### Test Broker Connection

```http
POST /brokers/:id/test
```

**Response:**
```json
{
  "success": true,
  "message": "Connection test endpoint (implementation pending)",
  "broker": {
    "protocol": "mqtt",
    "host": "localhost",
    "port": 5883,
    "username": "admin",
    "has_password": true,
    "use_tls": false
  }
}
```

## Security Notes

1. **Password Storage**: Passwords are stored as bcrypt hashes (cost factor 10)
2. **Password Transmission**: Plain passwords sent via API are immediately hashed
3. **Password Retrieval**: `password_hash` is never returned in API responses
4. **TLS Certificates**: Stored as TEXT (PEM format) - consider encryption for production
5. **API Access**: Add authentication middleware before production deployment

## Usage in Device Agent

Devices can reference a broker configuration:

```sql
UPDATE devices 
SET mqtt_broker_id = 1  -- Reference to mqtt_broker_config.id
WHERE uuid = 'device-uuid-here';
```

If `mqtt_broker_id` is NULL, the default broker (`is_default = true`) will be used.

## Database Views

### `mqtt_broker_summary`

Provides broker details with device counts:
```sql
SELECT * FROM mqtt_broker_summary ORDER BY is_default DESC;
```

## Triggers

1. **`ensure_one_default_broker`**: Automatically unsets other default brokers when setting a new default
2. **`update_updated_at_column`**: Auto-updates `updated_at` timestamp on changes

## Frontend Integration

### Configuration Page

Create an admin page to:
1. List all brokers with device counts
2. Add/edit/delete broker configurations
3. Set default broker
4. Test broker connectivity
5. View TLS certificate details

### Device Provisioning

When provisioning a device, allow selection of broker configuration:
```typescript
const device = await provisionDevice({
  name: "New Device",
  mqtt_broker_id: 2  // Use specific broker
});
```

## Migration

Created: `api/database/migrations/019_add_mqtt_broker_config.sql`

Run migration:
```bash
cd api
npx tsx scripts/run-migration-019.ts
```

## Testing

Test script: `api/scripts/test-mqtt-broker-api.ts`

```bash
# Start API server
npm run dev

# In another terminal, run tests
npx tsx scripts/test-mqtt-broker-api.ts
```

## TODO

- [ ] Implement actual MQTT connection testing in `/brokers/:id/test`
- [ ] Add authentication/authorization middleware
- [ ] Add certificate validation
- [ ] Add broker health monitoring
- [ ] Create frontend admin panel
- [ ] Add broker usage analytics
- [ ] Implement broker failover logic
