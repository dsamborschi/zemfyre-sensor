# Custom Application Deployment Guide

## Quick Reference

### Add Custom App to Provisioned Device

```bash
cd api

# Method 1: Use pre-built examples
npx ts-node scripts/add-custom-app.ts --device=<uuid> --example=node-app

# Method 2: Interactive mode (step-by-step)
npx ts-node scripts/add-custom-app.ts --device=<uuid> --interactive

# List available examples
npx ts-node scripts/add-custom-app.ts --list-examples
```

---

## Available Example Apps

### 1. Node.js Application (`--example=node-app`)
**Services:**
- `node-server` - Node.js 18 Alpine
  - Port: 3000:3000
  - Environment: NODE_ENV=production, REDIS_HOST=redis
  - Volume: /app/data:/data

- `redis` - Redis 7 Alpine
  - Port: 6379:6379
  - Volume: /data/redis:/data

### 2. Python Application (`--example=python-app`)
**Services:**
- `flask-app` - Python 3.11 Slim
  - Port: 5000:5000
  - Environment: FLASK_APP=app.py, FLASK_ENV=production
  - Volume: /app:/app

### 3. Docker Registry (`--example=docker-registry`)
**Services:**
- `registry` - Registry 2
  - Port: 5000:5000
  - Environment: REGISTRY_STORAGE_FILESYSTEM_ROOTDIRECTORY=/data
  - Volume: /data/registry:/data

---

## Your Device Status

**Device UUID:** `8479359e-dbeb-4858-813c-e8a9008dde04`  
**Name:** device-8479359e  
**Status:** 🟢 Online | ✅ Active

**Currently Deployed Apps:**
1. **node-application** (ID: 1002)
   - node-server (ID: 6, Image: node:18-alpine)
   - redis (ID: 7, Image: redis:7-alpine)
   - Version: 1

---

## Interactive Mode Example

```bash
npx ts-node scripts/add-custom-app.ts \
  --device=8479359e-dbeb-4858-813c-e8a9008dde04 \
  --interactive
```

**You'll be prompted for:**
1. Application name
2. Slug (URL-friendly name)
3. Description
4. For each service:
   - Service name
   - Docker image
   - Ports (optional)
   - Environment variables (optional)
   - Volumes (optional)
5. Add more services? (y/n)

**Example Interactive Session:**
```
📦 Application name: my-custom-app
🔗 Slug (url-friendly name): my-app
📝 Description: My custom application

--- Service 1 ---
Service name: web
Docker image (e.g., nginx:alpine): nginx:latest
Ports (e.g., 80:80,443:443 or press Enter to skip): 8080:80
Add environment variables? (y/n): y
  Env key (or press Enter to finish): NGINX_HOST
  Env value for NGINX_HOST: localhost
  Env key (or press Enter to finish): [Enter]
Volumes (e.g., /data:/app/data or press Enter to skip): /app/html:/usr/share/nginx/html

Add another service? (y/n): n
```

---

## Workflow Summary

```
┌─────────────────────────────────────────────────────┐
│ 1. Device is provisioned (already done ✓)          │
│    - UUID: 8479359e-dbeb-4858-813c-e8a9008dde04    │
│    - Status: Online ✓                              │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ 2. Add app using script                            │
│    npx ts-node scripts/add-custom-app.ts \         │
│      --device=8479359e... --example=node-app       │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ 3. Script creates app in catalog                   │
│    - App ID: 1002 (from global_app_id_seq)        │
│    - Stored in applications table                  │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ 4. Script generates service IDs                    │
│    - node-server: ID 6 (from global_service_id_seq)│
│    - redis: ID 7                                   │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ 5. Updates device_target_state                     │
│    - Adds app to device's JSONB apps field         │
│    - Increments version (0 → 1)                    │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ 6. Device polls for state                          │
│    GET /api/v1/device/<uuid>/state                 │
│    - Receives new target state                     │
│    - Applies changes (creates containers)          │
└─────────────────────────────────────────────────────┘
```

---

## Verify Deployment

```bash
# Check all devices and their apps
npx ts-node scripts/create-and-deploy-app.ts --list-devices

# Check specific device target state
curl http://localhost:3002/api/v1/devices/8479359e-dbeb-4858-813c-e8a9008dde04/target-state

# List all applications in catalog
npx ts-node scripts/create-and-deploy-app.ts --list
```

---

## Common Use Cases

### Deploy Multiple Apps to Same Device

```bash
# Deploy app 1
npx ts-node scripts/add-custom-app.ts \
  --device=8479359e-dbeb-4858-813c-e8a9008dde04 \
  --example=node-app

# Deploy app 2 (adds to existing apps, doesn't replace)
npx ts-node scripts/add-custom-app.ts \
  --device=8479359e-dbeb-4858-813c-e8a9008dde04 \
  --example=python-app

# Device now has both apps!
```

### Create Custom App from Scratch

```bash
# Use interactive mode for full customization
npx ts-node scripts/add-custom-app.ts \
  --device=8479359e-dbeb-4858-813c-e8a9008dde04 \
  --interactive
```

---

## Testing Your Current Setup

```bash
# 1. View device with deployed app
npx ts-node scripts/create-and-deploy-app.ts --list-devices

# Expected output:
# 2. 8479359e... (device-8479359e)
#    Status: 🟢 Online | ✅ Active
#    Apps deployed: 1
#      - node-application (ID: 1002, Services: 2)
#    Version: 1

# 2. Check target state JSON
curl http://localhost:3002/api/v1/devices/8479359e-dbeb-4858-813c-e8a9008dde04/target-state

# Expected output:
# {
#   "apps": {
#     "1002": {
#       "appId": 1002,
#       "appName": "node-application",
#       "services": [
#         {
#           "serviceId": 6,
#           "serviceName": "node-server",
#           "imageName": "node:18-alpine",
#           "config": { ... }
#         },
#         {
#           "serviceId": 7,
#           "serviceName": "redis",
#           "imageName": "redis:7-alpine",
#           "config": { ... }
#         }
#       ]
#     }
#   },
#   "version": 1
# }
```

---

## Next Steps

1. ✅ **Device is provisioned and online** (8479359e...)
2. ✅ **App deployed** (node-application with 2 services)
3. ⏳ **Device will poll and apply** on next sync
4. 🎯 **You can deploy more apps** using the same script

---

## Complete Command Reference

```bash
# List examples
npx ts-node scripts/add-custom-app.ts --list-examples

# Deploy example app
npx ts-node scripts/add-custom-app.ts --device=<uuid> --example=<name>

# Interactive custom app
npx ts-node scripts/add-custom-app.ts --device=<uuid> --interactive

# Your specific device
npx ts-node scripts/add-custom-app.ts \
  --device=8479359e-dbeb-4858-813c-e8a9008dde04 \
  --example=<name>
```

---

## Status: ✅ Ready to Use!

**Your device (8479359e...):**
- ✅ Provisioned
- ✅ Online
- ✅ Has node-application deployed (2 services)
- ✅ Ready for more apps

**Next time device polls, it will receive the configuration and create the containers!** 🚀
