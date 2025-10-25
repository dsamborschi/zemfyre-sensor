# Iotistic IoT Platform - AI Coding Agent Instructions

**A multi-tenant SaaS IoT platform** combining edge device management (Raspberry Pi) with cloud-based Kubernetes deployment, Stripe billing, and JWT license validation.

## ⚠️ Architecture Alert: Two Deployment Models

This codebase supports **TWO DISTINCT ARCHITECTURES** - understand which you're working with:

### 1. **Edge Device Stack** (Original - Raspberry Pi)
- Single-tenant: One Pi, one customer
- Docker Compose orchestration (`docker-compose.yml`, `docker-compose.dev.yml`)
- Services: `agent/`, `mosquitto/`, `nodered/`, `influx/`, `nginx/`, `grafana/`
- Target: On-premise Raspberry Pi hardware

### 2. **Multi-Tenant SaaS** (Current Focus - Kubernetes)
- Cloud-hosted: Multiple customers, isolated namespaces
- Kubernetes/Helm deployment (`charts/customer-instance/`)
- Services: `billing/` (global), `api/`, `dashboard/`, `postgres/`, `mosquitto/`, `billing-exporter/`
- Target: Cloud K8s clusters (AWS EKS, GKE, AKS, etc.)

**When editing**: Always clarify which deployment model your changes affect. Many services (API, Mosquitto) exist in both contexts but with different configurations.

---

## Critical Architecture Patterns

### 1. Multi-Tenant SaaS (Kubernetes)

**The "Why"**: One billing service deploys isolated customer instances. Customer signs up → 14-day trial → K8s namespace deployed → JWT license issued.

**Flow**: `billing/` → Stripe checkout → `k8s-deployment-service.ts` → Helm chart → Customer namespace

**Key Files**:
- `billing/src/services/k8s-deployment-service.ts` - Helm orchestration
- `charts/customer-instance/` - Helm chart templates
- `billing/src/services/license-generator.ts` - RS256 JWT signing
- `api/src/middleware/license-validator.ts` - JWT verification

**Namespace Convention**: `customer-{8-char-id}` (e.g., `customer-dc5fec42`)
- Sanitized from `cust_dc5fec42901a...` to fit K8s 63-char limit
- Each namespace gets: PostgreSQL, Mosquitto, API, Dashboard, Billing Exporter

**License Validation Pattern**:
```typescript
// billing/ signs with PRIVATE key
const jwt = sign(payload, privateKey, { algorithm: 'RS256' });

// api/ validates with PUBLIC key
const decoded = verify(token, publicKey, { algorithms: ['RS256'] });
```

**Environment Variables - CRITICAL**:
- `SIMULATE_K8S_DEPLOYMENT=true` - Skip actual Helm for local dev
- `LICENSE_PUBLIC_KEY` - Must match billing service's private key (PEM format with newlines!)
- `IOTISTIC_LICENSE_KEY` - JWT passed to customer instances
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - Billing integration

**When adding features**: Check if feature requires billing plan upgrade. Use `LicenseValidator.checkFeatureAccess()` to gate features.

**Monitoring Architecture**:
- **Shared Prometheus** (Starter/Professional): ServiceMonitor in customer namespace, scraped by cluster Prometheus in `monitoring` namespace
- **Dedicated Prometheus** (Enterprise): Full Prometheus + Grafana stack deployed in customer namespace with 30-day retention and 50GB storage
- License JWT contains monitoring flags: `hasDedicatedPrometheus`, `prometheusRetentionDays`, `prometheusStorageGb`
- Deployment service automatically configures monitoring based on license

### 2. Edge Device Stack (Raspberry Pi)

**The "Why"**: Single-tenant IoT stack on customer's own hardware for environmental monitoring and data collection.

**Services** (Docker Compose):
- `agent/` - Container orchestrator (inspired by Balena Supervisor)
- `mosquitto/` - MQTT broker (1883, 9001)
- `nodered/` - Flow engine (1880)
- `influxdb/` - Time-series DB (8086)
- `grafana/` - Visualization (3000)
- `nginx/` - Reverse proxy (80)

**Multi-Architecture Build** (Critical!):
```bash
TARGET_ARCH=armhf  → DEVICE_TYPE=pi3  → iotistic/agent:latest-pi3
TARGET_ARCH=arm64  → DEVICE_TYPE=pi4  → iotistic/agent:latest-pi4
TARGET_ARCH=amd64  → DEVICE_TYPE=x86  → iotistic/agent:latest-x86
```

**Pattern**: `docker-compose.yml.tmpl` + `envsubst` → `docker-compose.yml`
- See `bin/install.sh::set_device_type()` for architecture detection
- ALWAYS use `DEVICE_TYPE` env var, not `ARCHITECTURE` or `TARGET_ARCH`

**Service Communication**:
- Use container names: `mqtt://mosquitto:1883`, `http://influxdb:8086`
- Exception: Agent uses `network_mode: host` → accesses via `localhost:port`

### 3. Database Patterns

**PostgreSQL** (Multi-tenant SaaS):
- `billing/` - Customer/subscription/usage tables (global instance)
- `api/` - Device shadow state, MQTT ACLs (per-customer instance)
- Shared auth: Mosquitto uses PostgreSQL for ACL via `mosquitto-go-auth`

**Migration Commands**:
```bash
# Billing service
cd billing && npx knex migrate:latest

# Customer API instance
cd api && npx knex migrate:latest
```

**MQTT ACL Pattern** (Critical for multi-tenancy):
```sql
-- mosquitto-go-auth queries postgres
SELECT 1 FROM mqtt_acls 
WHERE username = $1 AND topic = $2 AND rw >= $3
```

**Connection String Convention**:
- K8s: `postgresql://postgres:password@postgres:5432/iotistic`
- Local: `postgresql://localhost:5432/iotistic`

---

## Development Workflows

### Starting Services

**Multi-Tenant SaaS (Local Dev)**:
```powershell
# Start billing + postgres
docker-compose up -d postgres
cd billing && npm run dev

# Start customer API instance
cd api && npm run dev

# Test signup flow
.\billing\scripts\test-signup-flow.ps1
```

**Edge Device Stack**:
```bash
# Development mode
docker-compose -f docker-compose.dev.yml up -d

# Build agent
cd agent && npm run build

# Access services
curl http://localhost:48484/v2/device  # Agent API
http://localhost:1880                  # Node-RED
http://localhost:3000                  # Grafana (admin/admin)
```

**Sensor Simulator** (No hardware testing):
```bash
docker-compose -f docker-compose.dev.yml up -d sensor-simulator
# Generates 3 fake sensors publishing to MQTT
```

### Testing Kubernetes Deployment

**Local (Simulated)**:
```powershell
cd billing
$env:SIMULATE_K8S_DEPLOYMENT="true"
npm run dev

# Signup creates customer but skips Helm
curl -X POST http://localhost:3100/api/customers/signup `
  -H "Content-Type: application/json" `
  -d '{...}'
```

**Real K8s Cluster**:
```bash
# Deploy billing service
kubectl apply -f billing/k8s/

# Test customer signup (creates namespace + Helm release)
curl -X POST https://billing.iotistic.cloud/api/customers/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", ...}'

# Verify deployment
kubectl get namespaces | grep customer-
kubectl get pods -n customer-dc5fec42
```

### Database Migrations

**Create New Migration**:
```bash
cd api && npx knex migrate:make add_feature_table
cd billing && npx knex migrate:make update_subscriptions
```

**Run Migrations**:
```bash
# Local
npx knex migrate:latest

# K8s (run inside pod)
kubectl exec -it -n billing deployment/billing-api -- npm run migrate
```

---

## Critical Conventions

### Service Communication

**Rule**: Always use **container names** for inter-service URLs (not `localhost`)

**Correct**:
```typescript
const mqttUrl = 'mqtt://mosquitto:1883';
const dbHost = 'postgres';
const apiUrl = 'http://api:3002';
```

**Exception**: Agent (edge device) uses `network_mode: host`:
```typescript
// Only in agent/
const mqttUrl = 'mqtt://localhost:1883';
```

### Environment Variables

**Naming Convention**:
- Database: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- MQTT: `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`
- Ports: `API_PORT_EXT`, `MOSQUITTO_PORT_EXT` (external), `PORT` (internal)

**Multi-Tenant Critical**:
- `LICENSE_PUBLIC_KEY` - RSA public key (PEM format, newlines preserved!)
- `IOTISTIC_LICENSE_KEY` - JWT token (passed to customer instances)
- `SIMULATE_K8S_DEPLOYMENT` - Skip Helm for local dev

**Port Allocation**:
- Internal: Standard (1883, 3000, 8086, etc.)
- External: 5xxxx range for custom mappings (`GRAFANA_PORT_EXT=53000`)

### Container State Control (Agent)

**State Field**: Add `state` field to service config for declarative container control

**Values**:
- `"running"` (default) - Container should be running
- `"stopped"` - Container gracefully stopped (SIGTERM), config preserved
- `"paused"` - Container processes frozen (SIGSTOP), instant suspend/resume

**Example** (target state JSON):
```json
{
  "1001": {
    "appId": "1001",
    "appName": "test-app",
    "services": [
      {
        "serviceId": "2",
        "serviceName": "nodered",
        "imageName": "nodered/node-red:latest",
        "state": "paused",  // Optional: defaults to "running" if omitted
        "config": {
          "ports": ["1880:1880"],
          "volumes": ["nodered-data:/data"]
        }
      }
    ]
  }
}
```

**Implementation Details**:
- `agent/src/orchestrator/types.ts`: `ServiceConfig.state` field definition
- `agent/src/compose/container-manager.ts`: Reconciliation logic (lines 1138-1270)
- `agent/src/compose/docker-manager.ts`: Docker pause/unpause methods (lines 364-406)
- State synced from Docker: `syncCurrentStateFromDocker()` maps container.state → service.state
- Works with both Docker Compose and K3s orchestrators

**When to Use**:
- **Pause**: Temporary suspension (preserves container ID, instant resume, RAM preserved). Use this for quick suspend/resume cycles without losing container identity.
- **Stop**: Long-term shutdown (frees RAM, graceful SIGTERM, container recreated on restart). Note: Manually stopping in Docker Desktop also triggers this behavior.
- **Running**: Normal operation (default if state omitted)

**Critical Docker Behavior**: When a container is stopped (either via `state: "stopped"` or manual Docker Desktop stop), it enters "exited" state. Docker cannot restart exited containers - they must be removed and recreated. This causes container ID changes. If you need to preserve container IDs, always use `state: "paused"` instead of stopping.

### MQTT Topic Structure

**Pattern**: `<category>/<metric>`

**Topics**:
```
sensor/temperature      # Sensor readings
sensor/humidity
sensor/pressure
sensor/gas              # Air quality
system/status           # Device health
alerts/environmental    # Threshold alerts
```

**Payload Format**:
```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "value": 23.5,
  "unit": "°C",
  "sensor_id": "bme688_001"
}
```

---

## Key Files Reference

### Multi-Tenant SaaS
- `billing/src/services/k8s-deployment-service.ts` - Helm orchestration
- `billing/src/services/license-generator.ts` - JWT signing (RS256)
- `billing/src/workers/deployment-worker.ts` - Async deployment queue
- `charts/customer-instance/templates/` - K8s manifests
- `api/src/middleware/license-validator.ts` - Feature gating
- `billing-exporter/src/collectors/` - Usage metrics

### Edge Device Stack
- `agent/src/compose/container-manager.ts` - Docker orchestration with state management
- `agent/src/compose/docker-driver.ts` - Docker Compose driver implementation
- `agent/src/k3s/k3s-driver.ts` - K3s Kubernetes driver implementation (577 lines)
- `agent/src/device-api/` - REST API (port 48484)
- `bin/install.sh` - Installation script (CI + hardware detection)
- `ansible/roles/` - Deployment automation

**Container State Management** (agent/):
- **State Field**: `state?: "running" | "stopped" | "paused"` (optional, defaults to "running")
- **Docker Native**: Uses `docker pause/unpause/stop` commands (NOT replicas field)
- **State Transitions**: All 6 transitions supported (running↔paused, running↔stopped, paused↔stopped)
- **Container Preservation**: pause/unpause preserves container ID; stop/start recreates container (Docker limitation)
- **Orchestrator Abstraction**: Works with both Docker Compose and K3s drivers

**State Transition Behaviors**:
| Transition | Command | Container ID | Speed | RAM | Trigger |
|------------|---------|--------------|-------|-----|---------|
| running → paused | `docker pause` | Preserved ✅ | Instant | Preserved | Set `state: "paused"` |
| paused → running | `docker unpause` | Preserved ✅ | Instant | Preserved | Set `state: "running"` |
| running → stopped | `docker stop` | Preserved but exited | ~10s | Freed | Set `state: "stopped"` OR manual stop in Docker Desktop |
| stopped → running | Remove + recreate | Changes ❌ | ~10-30s | Allocated | Set `state: "running"` after stopped |

**Best Practice**: Use `state: "paused"` for temporary suspension to avoid container recreation and preserve IDs.

**Important**: If you manually stop a container in Docker Desktop (or via `docker stop`), the system will **recreate** it when target state is `"running"`. This is a Docker limitation - exited containers cannot be restarted, only removed and recreated. To preserve container IDs, use `state: "paused"` instead of stopping.

### Shared Services
- `api/src/routes/` - REST endpoints (both contexts)
- `dashboard/src/` - React admin panel (Vite + TypeScript)
- `mosquitto/mosquitto.conf` - MQTT broker config

---

## Common Commands

### Multi-Tenant SaaS
```powershell
# Start billing stack
docker-compose up -d postgres
cd billing && npm run dev

# Generate license keys (first-time setup)
cd billing && npm run generate-keys

# Test signup flow
.\billing\scripts\test-signup-flow.ps1

# View deployment queue
curl http://localhost:3100/api/admin/jobs
```

### Edge Device Stack
```bash
# Install on Raspberry Pi
curl -sSL https://raw.githubusercontent.com/dsamborschi/iotistic-sensor/master/bin/install.sh | bash

# Local development
docker-compose -f docker-compose.dev.yml up -d
cd agent && npm run dev

# Ansible deployment
cd ansible && ./run.sh
```

### Kubernetes
```bash
# Deploy billing service
helm install billing ./charts/billing --namespace billing --create-namespace

# List customer instances
kubectl get namespaces -l managed-by=iotistic

# Check customer deployment
kubectl get pods -n customer-dc5fec42
kubectl logs -n customer-dc5fec42 deployment/customer-dc5fec42-api
```

---

## Troubleshooting Quick Reference

### License Validation Fails
**Symptom**: API returns 402 Payment Required

**Check**:
```bash
# Verify public key matches private key
cd billing && npm run verify-keys

# Check license JWT structure
echo $IOTISTIC_LICENSE_KEY | cut -d'.' -f2 | base64 -d | jq

# Test validation
curl http://localhost:3002/api/license/verify
```

### K8s Deployment Fails
**Symptom**: Customer status stuck in "provisioning" or Helm install errors

**Most Common Issue**: ServiceMonitor CRD not installed

```bash
# Error you'll see:
# "no matches for kind 'ServiceMonitor' in version 'monitoring.coreos.com/v1'"

# Fix: Install ServiceMonitor CRD (REQUIRED before any deployments)
kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/main/example/prometheus-operator-crd/monitoring.coreos.com_servicemonitors.yaml

# Verify
kubectl get crd servicemonitors.monitoring.coreos.com

# Retry deployment
curl -X POST http://localhost:3100/api/customers/<customer-id>/deploy
```

**Other checks**:
```bash
# View deployment logs
kubectl logs -n billing deployment/billing-api

# Check Helm release
helm list --all-namespaces | grep customer-

# View deployment job status
curl http://localhost:3100/api/admin/jobs | jq

# Check customer namespace
kubectl get pods -n customer-<id>
kubectl get events -n customer-<id> --sort-by='.lastTimestamp'
```

### MQTT Connection Refused
**Symptom**: Devices can't connect to broker

**Check**:
```bash
# Verify mosquitto running
docker ps | grep mosquitto
kubectl get pods -n customer-dc5fec42 | grep mosquitto

# Test connection
mosquitto_pub -h localhost -p 1883 -t test -m "hello"

# Check ACL (K8s)
kubectl exec -it -n customer-dc5fec42 deployment/postgres -- \
  psql -U postgres -d iotistic -c "SELECT * FROM mqtt_acls;"
```

---

## Documentation Structure

**Primary Docs**:
- `README.md` - Project overview and quick start
- `charts/README.md` - **Complete Kubernetes guide** (cluster setup + Helm chart deployment)
- `docs/K8S-DEPLOYMENT-GUIDE.md` - Production Kubernetes deployment
- `docs/CUSTOMER-SIGNUP-K8S-DEPLOYMENT.md` - Signup flow implementation
- `billing/docs/README.md` - Complete billing system guide (3700 lines!)

**Service-Specific**:
- `agent/README.md` - Container orchestration (Balena-style)
- `api/README.md` - Unified API (Grafana + Docker + Cloud management)
- `dashboard/README.md` - React dashboard
- `billing-exporter/README.md` - Metrics collection

**Topic Directories** (`docs/`):
- `mqtt/` - MQTT centralization, topics, debugging
- `provisioning/` - Device provisioning workflows
- `security/` - Auth, JWT, provisioning security
- `database/` - PostgreSQL optimization, state records

---

## Architecture Philosophy

1. **Multi-Tenancy First**: Namespace isolation, resource quotas, network policies
2. **License-Driven Features**: All premium features gated by JWT validation
3. **Dual Deployment**: Cloud K8s for SaaS, Docker Compose for edge devices
4. **Configuration over Code**: Environment variables for all deployment decisions
5. **Developer Experience**: Simulated modes, comprehensive logging, clear error messages

**When making changes**: Always test both deployment contexts (K8s + Docker Compose) and verify license feature gating works correctly.
