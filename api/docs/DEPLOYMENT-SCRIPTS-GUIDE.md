# Application Deployment Scripts - Quick Reference

## Create and Deploy Script

The `create-and-deploy-app.ts` script lets you create application templates and deploy them to devices without a frontend.

### Usage

```bash
cd api

# Basic usage (creates monitoring app for test device)
npx ts-node scripts/create-and-deploy-app.ts

# List available applications
npx ts-node scripts/create-and-deploy-app.ts --list

# List all devices
npx ts-node scripts/create-and-deploy-app.ts --list-devices

# Deploy specific app to specific device
npx ts-node scripts/create-and-deploy-app.ts \
  --app=monitoring \
  --device=abc123-uuid-here

# Deploy with custom port
npx ts-node scripts/create-and-deploy-app.ts \
  --app=monitoring \
  --port=8097

# Deploy web server to specific device
npx ts-node scripts/create-and-deploy-app.ts \
  --app=web-server \
  --device=xyz789-uuid-here
```

---

## ⚠️ Important: Device Provisioning Required

**Devices must be provisioned first** before you can deploy applications to them.

The script will **fail** if you try to deploy to a device that doesn't exist:
```
❌ Error: Device abc123... not found.
   Devices must be created through the provisioning process first.
   Use the device provisioning API endpoint to register new devices.
```

**To provision a device:**
1. Device calls provisioning endpoint with its details
2. System creates device record and generates API key
3. Device can now receive application deployments

See your provisioning documentation for details on the device registration process.

---

## Available Templates

### 1. Monitoring Stack (`--app=monitoring`)
**Description:** Prometheus and Grafana monitoring

**Services:**
- `prometheus` - Metrics collection (port 9090)
- `grafana` - Visualization dashboard (port 3000)

**Default Config:**
```json
{
  "prometheus": {
    "image": "prom/prometheus:latest",
    "ports": ["9090:9090"],
    "environment": {
      "RETENTION": "30d",
      "SCRAPE_INTERVAL": "15s"
    }
  },
  "grafana": {
    "image": "grafana/grafana:latest",
    "ports": ["3000:3000"],
    "environment": {
      "GF_SECURITY_ADMIN_USER": "admin",
      "GF_SECURITY_ADMIN_PASSWORD": "admin"
    }
  }
}
```

### 2. Web Server (`--app=web-server`)
**Description:** Nginx web server with SSL support

**Services:**
- `nginx` - Web server (ports 80, 443)

**Default Config:**
```json
{
  "nginx": {
    "image": "nginx:alpine",
    "ports": ["80:80", "443:443"],
    "environment": {
      "NGINX_HOST": "localhost",
      "NGINX_PORT": "80"
    }
  }
}
```

### 3. Database (`--app=database`)
**Description:** PostgreSQL database server

**Services:**
- `postgres` - PostgreSQL 16 (port 5432)

**Default Config:**
```json
{
  "postgres": {
    "image": "postgres:16-alpine",
    "ports": ["5432:5432"],
    "environment": {
      "POSTGRES_USER": "admin",
      "POSTGRES_PASSWORD": "changeme",
      "POSTGRES_DB": "myapp"
    }
  }
}
```

### 4. MQTT Broker (`--app=mqtt-broker`)
**Description:** Eclipse Mosquitto MQTT broker

**Services:**
- `mosquitto` - MQTT broker (ports 1883, 9001)

**Default Config:**
```json
{
  "mosquitto": {
    "image": "eclipse-mosquitto:latest",
    "ports": ["1883:1883", "9001:9001"]
  }
}
```

---

## Examples

### Example 1: Deploy Monitoring to Test Device

```bash
npx ts-node scripts/create-and-deploy-app.ts
```

**Output:**
```
✅ Application created with ID: 1001
✅ Deployed successfully!
   App ID: 1001
   Services deployed: 2
     - prometheus (ID: 1, Image: prom/prometheus:latest)
     - grafana (ID: 2, Image: grafana/grafana:latest)
```

### Example 2: Deploy Web Server with Custom Port

```bash
npx ts-node scripts/create-and-deploy-app.ts \
  --app=web-server \
  --device=raspberry-pi-001 \
  --port=8080
```

**Result:** Web server will be accessible on ports 8080 (HTTP) and 8081 (HTTPS)

### Example 3: Deploy Multiple Apps to Same Device

```bash
# Deploy monitoring
npx ts-node scripts/create-and-deploy-app.ts \
  --app=monitoring \
  --device=my-device-uuid

# Deploy MQTT broker to same device
npx ts-node scripts/create-and-deploy-app.ts \
  --app=mqtt-broker \
  --device=my-device-uuid

# Deploy web server to same device
npx ts-node scripts/create-and-deploy-app.ts \
  --app=web-server \
  --device=my-device-uuid \
  --port=8080
```

**Result:** All three apps running on the same device!

### Example 4: List Everything

```bash
# List all applications in catalog
npx ts-node scripts/create-and-deploy-app.ts --list

# List all devices and their deployed apps
npx ts-node scripts/create-and-deploy-app.ts --list-devices
```

---

## Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| (no args) | Deploy monitoring to test device | `npx ts-node scripts/create-and-deploy-app.ts` |
| `--list` | List all applications in catalog | `--list` |
| `--list-devices` | List all devices and their apps | `--list-devices` |
| `--app=<name>` | Specify app template | `--app=monitoring` |
| `--device=<uuid>` | Specify device UUID | `--device=abc123-...` |
| `--port=<number>` | Customize base port | `--port=8097` |

---

## After Deployment

### Check Device Target State

```bash
# Via API
curl http://localhost:3002/api/v1/devices/<device-uuid>/target-state

# Pretty print JSON
curl -s http://localhost:3002/api/v1/devices/<device-uuid>/target-state | jq
```

### Device Polling

The device will poll this endpoint:
```bash
GET /api/v1/device/<device-uuid>/state
```

**Response:**
```json
{
  "<device-uuid>": {
    "apps": {
      "1001": {
        "appId": 1001,
        "appName": "monitoring",
        "services": [
          {
            "serviceId": 1,
            "serviceName": "prometheus",
            "imageName": "prom/prometheus:latest",
            "config": {
              "ports": ["9090:9090"],
              "environment": { "RETENTION": "30d" }
            }
          }
        ]
      }
    }
  }
}
```

### Update Deployed App

To update an app already deployed, use the API:

```bash
curl -X PATCH http://localhost:3002/api/v1/devices/<uuid>/apps/1001 \
  -H "Content-Type: application/json" \
  -d '{
    "services": [
      {
        "serviceName": "prometheus",
        "image": "prom/prometheus:v2.50.0",
        "ports": ["9090:9090"],
        "environment": { "RETENTION": "60d" }
      }
    ]
  }'
```

### Remove App from Device

```bash
curl -X DELETE http://localhost:3002/api/v1/devices/<uuid>/apps/1001
```

---

## Workflow

```
1. Create Application Template
   ↓
   npx ts-node scripts/create-and-deploy-app.ts --app=monitoring

2. Template Stored in Database
   ↓
   applications table (id: 1001)

3. Deploy to Device
   ↓
   device_target_state.apps updated

4. Device Polls for State
   ↓
   GET /api/v1/device/<uuid>/state

5. Device Applies Configuration
   ↓
   Docker containers created
```

---

## Troubleshooting

### App Already Exists

If you see:
```
⚠️  Application already exists with ID: 1001
Using existing application...
```

**Solution:** The script reuses existing applications. To create a new one, use a different slug or delete the existing one:

```bash
# Delete application
curl -X DELETE http://localhost:3002/api/v1/applications/1001
```

### Device Not Found

The script automatically creates the device if it doesn't exist.

### Port Conflicts

If ports conflict on the same device, use `--port` to customize:

```bash
npx ts-node scripts/create-and-deploy-app.ts \
  --app=monitoring \
  --device=my-device \
  --port=8097
```

### Check Database

```bash
# Connect to PostgreSQL
psql -U postgres -d iotistic

# List applications
SELECT id, app_name, slug FROM applications;

# List devices
SELECT uuid, device_name FROM devices;

# Check target state
SELECT device_uuid, apps FROM device_target_state;
```

---

## Testing Workflow

### Complete Test

```bash
# 1. List available templates
npx ts-node scripts/create-and-deploy-app.ts --list

# 2. Deploy monitoring to test device
npx ts-node scripts/create-and-deploy-app.ts --app=monitoring

# 3. Deploy web server to same device (different ports)
npx ts-node scripts/create-and-deploy-app.ts \
  --app=web-server \
  --port=8080

# 4. List all devices
npx ts-node scripts/create-and-deploy-app.ts --list-devices

# 5. Check device state via API
curl http://localhost:3002/api/v1/devices/12345678-1234-1234-1234-123456789abc/target-state

# 6. Simulate device polling
curl http://localhost:3002/api/v1/device/12345678-1234-1234-1234-123456789abc/state
```

---

## Advanced Usage

### Create Custom Template

Edit `create-and-deploy-app.ts` and add your template:

```typescript
const MY_TEMPLATE: ApplicationTemplate = {
  appName: 'my-app',
  slug: 'my-custom-app',
  description: 'My custom application',
  defaultConfig: {
    services: [
      {
        serviceName: 'myservice',
        image: 'myimage:latest',
        ports: ['8080:80'],
        environment: {
          MY_VAR: 'value'
        }
      }
    ]
  }
};

// Add to ALL_TEMPLATES
const ALL_TEMPLATES = {
  // ...existing
  'my-app': MY_TEMPLATE
};
```

Then use:
```bash
npx ts-node scripts/create-and-deploy-app.ts --app=my-app
```

---

## Summary

**Quick Commands:**

```bash
# Deploy monitoring (default)
npx ts-node scripts/create-and-deploy-app.ts

# Deploy specific app
npx ts-node scripts/create-and-deploy-app.ts --app=web-server

# Deploy to specific device
npx ts-node scripts/create-and-deploy-app.ts --device=<uuid>

# Customize ports
npx ts-node scripts/create-and-deploy-app.ts --port=8097

# List everything
npx ts-node scripts/create-and-deploy-app.ts --list
npx ts-node scripts/create-and-deploy-app.ts --list-devices
```

**Perfect for testing without frontend!** 🚀
