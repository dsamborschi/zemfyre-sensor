# Zemfyre Sensor - AI Coding Agent Instructions

## Project Overview

**Zemfyre Sensor** is a containerized IoT environmental monitoring system for Bosch BME688 sensors connected via Single Pair Ethernet (SPE). The system runs primarily on Raspberry Pi devices and provides real-time data visualization, MQTT-based communication, and container orchestration.

### Core Architecture

```
BME688 Sensor (SPE) → Raspberry Pi → Docker Stack
                                    ├─ Mosquitto (MQTT Broker)
                                    ├─ Node-RED (Flow Engine)
                                    ├─ InfluxDB (Time-Series DB)
                                    ├─ Grafana (Visualization)
                                    ├─ Application Manager (Container Orchestration)
                                    ├─ Nginx (Reverse Proxy)
                                    └─ Admin Panel (Web UI)
```

**Key Technologies**: Docker Compose, TypeScript/Node.js, Python, MQTT, InfluxDB, Grafana, Ansible

---

## Service-Oriented Design

This project uses **Docker Compose** to orchestrate multiple independent services. Each service runs in its own container:

- **application-manager**: Custom container orchestration engine (TypeScript, port 3002) - inspired by Balena Supervisor
- **mosquitto**: MQTT broker (ports 1883, 9001)
- **nodered**: IoT automation flows (port 1880)
- **influxdb**: Time-series database (port 8086)
- **grafana**: Data dashboards (port 3000)
- **nginx**: Reverse proxy (port 80)
- **admin**: Web management UI (port 51850)
- **api**: REST API for system control (port 3001)

**Critical Pattern**: Services communicate via Docker bridge network `zemfyre-net` and reference each other by container name (e.g., `mqtt://mosquitto:1883`).

---

## Application Manager: The Heart of the System

The `application-manager/` directory contains a **standalone container orchestration engine** extracted from Balena Supervisor:

### Architecture
- **ContainerManager** (`src/container-manager.ts`): Manages Docker container lifecycle
- **State Reconciliation**: Compares current state vs. target state, generates diff
- **REST API** (`src/api/server.ts`): HTTP interface for deploying/updating containers
- **Database**: SQLite persistence for target state and device provisioning
- **Logging**: Multi-backend system (local storage, optional MQTT streaming)
- **Metrics**: System resource monitoring via `systeminformation`

### Key Workflows

**Deploy a Container**:
```bash
cd application-manager
npm run build  # Compile TypeScript
npm run dev    # Start in dev mode (port 3002)

# POST target state
curl -X POST http://localhost:3002/api/v1/state/target \
  -H "Content-Type: application/json" \
  -d '{"apps": {...}}'

# Apply changes
curl -X POST http://localhost:3002/api/v1/state/apply
```

**Livepush Development** (hot-reload for containers):
```bash
npm run dev:livepush -- --container=<id> --dockerfile=./Dockerfile
```

**MQTT Logging** (optional):
```bash
MQTT_BROKER=mqtt://mosquitto:1883 npm run dev
```

### Critical Files
- `src/container-manager.ts` - Core orchestration logic
- `src/docker-manager.ts` - Docker API wrapper using `dockerode`
- `src/api/server.ts` - REST API endpoints
- `src/provisioning/device-manager.ts` - Device identity and registration
- `knexfile.js` - Database migrations config

**Environment Variables**:
- `USE_REAL_DOCKER=true` - Enable real Docker (vs. simulated mode)
- `DATABASE_PATH=/app/data/database.sqlite` - SQLite location
- `MQTT_BROKER=mqtt://mosquitto:1883` - Optional MQTT logging
- `NODE_ENV=production` - Environment mode

---

## Development Workflows

### Starting the Stack

**Development Mode**:
```bash
docker-compose -f docker-compose.dev.yml up -d
```

**Production Build**:
```bash
# Uses docker-compose.yml.tmpl (template - needs configuration)
docker-compose up -d
```

**Port Customization**: Set via `.env` file:
```bash
MOSQUITTO_PORT_EXT=51883
NODERED_PORT_EXT=51880
INFLUXDB_PORT_EXT=58086
GRAFANA_PORT_EXT=53000
ADMIN_PORT_EXT=51850
API_PORT_EXT=53001
```

### Ansible Deployment (Raspberry Pi)

**Remote Deployment via Containerized Ansible**:
```bash
cd ansible
# Edit hosts.ini and .env with Pi credentials
./run.sh  # Builds Ansible image and deploys
```

This automates:
1. System configuration (NTP, network, packages)
2. Docker installation
3. Service deployment
4. Optional kiosk mode setup

**Ansible Roles**: `system`, `network`, `kiosk`, `docker` (see `ansible/roles/`)

---

## MQTT Communication Patterns

**Topic Structure**:
```
sensor/temperature      - BME688 temperature readings
sensor/humidity         - Humidity data
sensor/pressure         - Atmospheric pressure
sensor/gas              - Air quality (gas resistance)
system/status           - System health
alerts/environmental    - Threshold alerts
container-manager/logs  - Application manager logs (if enabled)
```

**Broker Configuration**: `mosquitto/config/mosquitto.conf`

**MQTT in Application Manager**:
- Optional logging backend (enable with `MQTT_BROKER` env var)
- Publishes container logs and events to MQTT topics
- See `application-manager/docs/MQTT-USAGE.md`

---

## Sensor Configuration

**Hardware**: Bosch BME688 4-in-1 environmental sensor (temp, humidity, pressure, gas/VOC)

**SPE Connectivity**: Single Pair Ethernet - both data and power over one cable

**Initial Setup** (via serial CLI):
```bash
# Connect via serial (115200 baud)
eth -ifconfig ip 192.168.2.40
eth -ifconfig gw 192.168.2.1
eth -mqtt ip 192.168.2.30
eth -mqtt port 1883
core -reset
```

**Full Guide**: See `SENSOR.md` for complete hardware setup and CLI commands

---

## TypeScript Project Patterns

### Build System
- **TSC** compilation to `dist/` directory
- **Watch mode**: `npm run watch` for live recompilation
- **Source maps**: Enabled for debugging

### Database Migrations
```bash
cd application-manager
npx knex migrate:latest  # Run pending migrations
npx knex migrate:make add_new_table  # Create migration
```

**Migration Location**: `application-manager/src/migrations/`

### Docker Integration
- Uses `dockerode` library for Docker API access
- Requires `/var/run/docker.sock` volume mount
- Set `USE_REAL_DOCKER=true` to enable actual container operations

---

## Testing and Debugging

### Application Manager Tests
```bash
cd application-manager
npx tsx test/simple-test.ts          # Basic functionality
npx tsx test/mock-data-test.ts       # With mock data
```

### Device Provisioning Test
```powershell
# Windows PowerShell
cd application-manager
.\test-provisioning.ps1
```

### Container Logs
```bash
docker-compose logs -f application-manager
docker logs -f <container-id>
```

### Common Issues

**Application Manager Build Fails**:
- Check TypeScript version: `npm list typescript`
- Rebuild: `npm run clean && npm run build`

**Docker Permission Denied**:
- Ensure `/var/run/docker.sock` is mounted
- Run with `privileged: true` in docker-compose

**MQTT Connection Fails**:
- Verify mosquitto container is running: `docker ps`
- Check network: `docker network inspect zemfyre-net`
- Test connection: `mosquitto_pub -h localhost -t test -m "hello"`

---

## Grafana Dashboard Customization

**Access**: `http://<pi-ip>:3000` (default: admin/admin)

**API Integration** (`api/index.js`):
- Update dashboard variables: `POST /grafana/dashboards/:uid/variables/:varName`
- Modify alert thresholds: `POST /grafana/update-alert-threshold`
- Requires `GRAFANA_API_TOKEN` environment variable

**Configuration**: `grafana/provisioning/` for datasources and dashboards

---

## Critical Conventions

### Service Communication
- **Always use container names** for inter-service URLs (not `localhost`)
- Example: `http://influxdb:8086` not `http://localhost:8086`
- Exception: Host-networked containers (application-manager uses `network_mode: host`)

### Environment Variables
- Defined in `docker-compose.dev.yml` with `${VAR:-default}` syntax
- Override with `.env` file in project root
- Application manager reads from container environment

### Volume Mounts
- Persistent data in named volumes: `application-manager-data`, etc.
- Configuration mounted as bind mounts: `./mosquitto/config:/mosquitto/config`

### Port Allocation Pattern
- Internal ports: Standard (1883, 3000, 8086, etc.)
- External ports: 5xxxx range for non-standard mappings to avoid conflicts
- Example: Grafana internally on 3000, externally on 53000

---

## Documentation Structure

- **README.md** - Main project documentation
- **SENSOR.md** - Hardware setup and sensor CLI
- **application-manager/README.md** - Container orchestration guide
- **application-manager/docs/** - Detailed feature documentation:
  - `LIVEPUSH.md` - Hot-reload development
  - `PROVISIONING.md` - Device identity system
  - `LOGGING.md` - Multi-backend logging
  - `MQTT-USAGE.md` - MQTT integration
  - `METRICS.md` - System monitoring

---

## When Editing Docker Compose

1. **Port changes**: Update both internal and external port mappings
2. **New service**: Add to `zemfyre-net` network for inter-service communication
3. **Environment variables**: Use `${VAR:-default}` pattern for flexibility
4. **Volumes**: Named volumes for persistence, bind mounts for config
5. **Health checks**: Not currently implemented but recommended for production

---

## Platform-Specific Notes

**Target Hardware**: Raspberry Pi 3+ (ARM64), also supports x86_64

**PowerShell Commands** (Windows development):
- Use `docker-compose` not `docker compose` (hyphenated version)
- Serial connection via PuTTY (see SENSOR.md)

**Ansible Deployment**: Linux/Mac for running `./ansible/run.sh`

---

## Quick Reference: Most Common Commands

```bash
# Start development stack
docker-compose -f docker-compose.dev.yml up -d

# Build application manager
cd application-manager && npm run build

# Start application manager dev server
cd application-manager && USE_REAL_DOCKER=true npm run dev

# Deploy via Ansible
cd ansible && ./run.sh

# View logs
docker-compose logs -f application-manager
docker-compose logs -f nodered

# Rebuild single service
docker-compose up -d --build <service-name>

# Stop everything
docker-compose down

# Check container health
docker ps
docker stats
```

---

This project emphasizes **modularity** (microservices), **configurability** (environment variables), and **developer experience** (livepush, comprehensive logging, clear APIs). When making changes, preserve these patterns and always test in the full Docker stack context.
