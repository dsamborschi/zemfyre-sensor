# Zemfyre Sensor - AI Coding Agent Instructions

**Full Documentation**: See [docs/AI-AGENT-GUIDE.md](../docs/AI-AGENT-GUIDE.md) for comprehensive architecture patterns, workflows, and troubleshooting.

## ⚠️ Folders to Ignore

**Do not analyze or reference these directories** - they contain deprecated/archived code:

- `admin_old/` - Legacy admin panel implementation (superseded by `admin/`)

When working with the admin panel, **always use the `admin/` directory**, never `admin_old/`.



## Quick Start## Project Overview## Project Overview



### Architecture

- **Multi-service IoT stack**: Device Agent, MQTT, Node-RED, InfluxDB, Grafana, Nginx, Admin Panel, API

- **Multi-architecture**: Raspberry Pi (ARM6/7/64) and x86_64 with device-specific Docker image tags**Zemfyre Sensor** is a containerized IoT environmental monitoring system for Bosch BME688 sensors connected via Single Pair Ethernet (SPE). Runs on Raspberry Pi with real-time data visualization, MQTT communication, and custom container orchestration inspired by Balena Supervisor.**Zemfyre Sensor** is a containerized IoT environmental monitoring system for Bosch BME688 sensors connected via Single Pair Ethernet (SPE). The system runs primarily on Raspberry Pi devices and provides real-time data visualization, MQTT-based communication, and container orchestration.

- **Container orchestration**: Custom agent inspired by Balena Supervisor



### Critical Patterns

### Core Architecture### Core Architecture

**Multi-Architecture Build**:

- `TARGET_ARCH` (CI) or `uname -m` (hardware) → `DEVICE_TYPE` (pi3/pi4/x86) → Docker image tag

- See `bin/install.sh::set_device_type()` and `bin/upgrade_containers.sh`

``````

**Template-Based Deployment**:

- `docker-compose.yml.tmpl` + `envsubst` → `docker-compose.yml`BME688 Sensor (SPE) → Raspberry Pi → Docker StackBME688 Sensor (SPE) → Raspberry Pi → Docker Stack

- Variables: `${DEVICE_TYPE}`, `${DOCKER_TAG}`, port mappings

                                    ├─ Device Agent (Container Orchestration, port 48484)                                    ├─ Mosquitto (MQTT Broker)

**Service Communication**:

- Use container names: `mqtt://mosquitto:1883`, `http://influxdb:8086`                                    ├─ Mosquitto (MQTT Broker, 1883/9001)                                    ├─ Node-RED (Flow Engine)

- Exception: Device agent uses `network_mode: host` → `localhost:port`

                                    ├─ Node-RED (Flow Engine, 1880)                                    ├─ InfluxDB (Time-Series DB)

### Common Commands

                                    ├─ InfluxDB (Time-Series DB, 8086)                                    ├─ Grafana (Visualization)

```bash

# Development                                    ├─ Grafana (Visualization, 3000)                                    ├─ Application Manager (Container Orchestration)

docker-compose -f docker-compose.dev.yml up -d

cd agent npm run dev                                    ├─ Nginx (Reverse Proxy, 80)                                    ├─ Nginx (Reverse Proxy)



# Build agent                                    ├─ Admin Panel (Web UI, 51850)                                    └─ Admin Panel (Web UI)

cd agent && npm run build

                                    └─ API (System Control, 3001)```

# Device API

curl http://localhost:48484/v2/device```



# Deploy via Ansible**Key Technologies**: Docker Compose, TypeScript/Node.js, Python, MQTT, InfluxDB, Grafana, Ansible

cd ansible && ./run.sh

**Key Technologies**: Docker Compose, TypeScript/Node.js, Bash, MQTT, InfluxDB, Grafana, Ansible

# Update containers

DEVICE_TYPE=pi4 DOCKER_TAG=latest ./bin/upgrade_containers.sh---

```

---

### Key Files

- `bin/install.sh` - Main installation (CI + hardware detection)## Service-Oriented Design

- `agent/src/supervisor.ts` - Container orchestrator

- `agent/src/device-api/` - HTTP API (port 48484)## Critical Architecture Patterns

- `docker-compose.yml.tmpl` - Service definitions template

This project uses **Docker Compose** to orchestrate multiple independent services. Each service runs in its own container:

**See [docs/AI-AGENT-GUIDE.md](../docs/AI-AGENT-GUIDE.md) for detailed patterns, workflows, and troubleshooting.**

### 1. Multi-Architecture Build System

- **application-manager**: Custom container orchestration engine (TypeScript, port 3002) - inspired by Balena Supervisor

**The "Why"**: System must run on Pi1 (ARMv6), Pi2/3 (ARMv7), Pi4/5 (ARM64), and x86_64. Docker images are tagged by device type, not generic arch names.- **mosquitto**: MQTT broker (ports 1883, 9001)

- **nodered**: IoT automation flows (port 1880)

**Device Type Mapping** (see `bin/install.sh::set_device_type()` and `bin/upgrade_containers.sh`):- **influxdb**: Time-series database (port 8086)

```bash- **grafana**: Data dashboards (port 3000)

TARGET_ARCH=armhf    → DEVICE_TYPE=pi3  → iotistic/agent:latest-pi3- **nginx**: Reverse proxy (port 80)

TARGET_ARCH=arm64    → DEVICE_TYPE=pi4  → iotistic/agent:latest-pi4  - **admin**: Web management UI (port 51850)

TARGET_ARCH=amd64    → DEVICE_TYPE=x86  → iotistic/agent:latest-x86- **api**: REST API for system control (port 3001)

```

**Critical Pattern**: Services communicate via Docker bridge network `zemfyre-net` and reference each other by container name (e.g., `mqtt://mosquitto:1883`).

**Critical Flow**:

1. `bin/install.sh` detects architecture from `TARGET_ARCH` (CI) or `uname -m` (hardware)---

2. Maps to `DEVICE_TYPE` via `set_device_type()` function

3. Passes `DEVICE_TYPE` env var to `upgrade_containers.sh`## Application Manager: The Heart of the System

4. `envsubst` substitutes `${DEVICE_TYPE}` into `docker-compose.yml.tmpl`

5. Docker pulls/builds correct architecture-specific imagesThe `application-manager/` directory contains a **standalone container orchestration engine** extracted from Balena Supervisor:

1. `bin/install.sh` is also used to be run on the device (Raspberry Pi) to set up the entire stack. It detects the architecture and configures services accordingly.



**When editing install.sh or CI workflows**: Always ensure `DEVICE_TYPE` environment variable flows through the entire pipeline. It's the primary architecture selector, not `ARCHITECTURE` or `TARGET_ARCH`.### Architecture

- **ContainerManager** (`src/container-manager.ts`): Manages Docker container lifecycle

### 2. Template-Based Docker Compose- **State Reconciliation**: Compares current state vs. target state, generates diff

- **REST API** (`src/api/server.ts`): HTTP interface for deploying/updating containers

**Pattern**: `docker-compose.yml.tmpl` + `envsubst` → `docker-compose.yml`- **Database**: SQLite persistence for target state and device provisioning

- **Logging**: Multi-backend system (local storage, optional MQTT streaming)

**Why**: Enables dynamic configuration without maintaining multiple compose files. Variables like `${DEVICE_TYPE}`, `${DOCKER_TAG}`, `${GRAFANA_PORT_EXT}` are substituted at deployment time.- **Metrics**: System resource monitoring via `systeminformation`



**Location**: `docker-compose.yml.tmpl` (template), `bin/upgrade_containers.sh` (substitution logic)### Key Workflows



**Example**:**Deploy a Container**:

```yaml```bash

device-agent:cd application-manager

    image: iotistic/agent:${DOCKER_TAG}-${DEVICE_TYPE}  # Becomes: iotistic/agent:latest-pi4 
    
npm run build  # Compile TypeScript

```npm run dev    # Start in dev mode (port 3002)



### 3. Device Agent = Balena-Style Orchestration# POST target state

curl -X POST http://localhost:3002/api/v1/state/target \

**The Agent** (`agent/` directory) is NOT just another service—it's the **container lifecycle manager** inspired by Balena Supervisor. It runs with `privileged: true`, `network_mode: host`, and `/var/run/docker.sock` mount.  -H "Content-Type: application/json" \

  -d '{"apps": {...}}'

**Key Components**:

- `src/supervisor.ts` - Main orchestrator, initializes all subsystems# Apply changes

- `src/container-manager.ts` - Docker operations (start/stop/update containers)curl -X POST http://localhost:3002/api/v1/state/apply

- `src/device-api/` - HTTP API (port 48484) for remote management```

- `src/provisioning/device-manager.ts` - Device identity and cloud registration

- `src/jobs/` - Background job system for async operations**Livepush Development** (hot-reload for containers):

- `src/logging/` - Multi-backend logging (file, console, MQTT)```bash

npm run dev:livepush -- --container=<id> --dockerfile=./Dockerfile

**Device API Endpoints** (port 48484):```

- `/v2/device` - Device info and health

- `/v2/applications/:appId/state` - Container state management**MQTT Logging** (optional):

- `/v1/apps/:appId/restart` - Restart services```bash

MQTT_BROKER=mqtt://mosquitto:1883 npm run dev

**Critical**: The agent manages OTHER containers, including itself. State is persisted in SQLite (`/app/data/database.sqlite`).```



---### Critical Files

- `src/container-manager.ts` - Core orchestration logic

## Installation & Deployment Workflows- `src/docker-manager.ts` - Docker API wrapper using `dockerode`

- `src/api/server.ts` - REST API endpoints

### Installation Script Architecture (`bin/install.sh`)- `src/provisioning/device-manager.ts` - Device identity and registration

- `knexfile.js` - Database migrations config

**The "Why"**: Single script handles both bare-metal Pi installation AND CI testing. Detects environment (CI vs hardware) and adapts behavior.

**Environment Variables**:

**Key Functions** (read these first when editing install.sh):- Enable real Docker (vs. simulated mode)

1. `set_device_type()` - Maps TARGET_ARCH → DEVICE_TYPE (lines ~245-300)- `DATABASE_PATH=/app/data/database.sqlite` - SQLite location

2. `run_ansible_playbook()` - Clones repo, runs Ansible deployment- `MQTT_BROKER=mqtt://mosquitto:1883` - Optional MQTT logging

3. `upgrade_docker_containers()` - Downloads/runs `upgrade_containers.sh`- `NODE_ENV=production` - Environment mode

4. `setup_remote_access()` - SSH reverse tunnel configuration (optional)

---

**CI Mode Detection** (line ~10):

```bash## Development Workflows

IS_CI_MODE=false

if [ "${CI:-false}" = "true" ] || [ -n "${GITHUB_ACTIONS:-}" ]; then### Starting the Stack

    IS_CI_MODE=true

fi**Development Mode**:

``````bash

docker-compose -f docker-compose.dev.yml up -d

**When IS_CI_MODE=true**:```

- Skips interactive `gum` prompts (uses wrapper function)

- Skips reboot**Production Build**:

- Uses `TARGET_ARCH` environment variable for architecture```bash

# Uses docker-compose.yml.tmpl (template - needs configuration)

**Architecture Detection** (lines ~51-58):docker-compose up -d

```bash```

if [ -n "${TARGET_ARCH}" ]; then

    ARCHITECTURE="${TARGET_ARCH}"  # CI or explicit override**Port Customization**: Set via `.env` file:

else```bash

    ARCHITECTURE=$(uname -m)        # Detect from hardwareMOSQUITTO_PORT_EXT=51883

fiNODERED_PORT_EXT=51880

```INFLUXDB_PORT_EXT=58086

GRAFANA_PORT_EXT=53000

### Ansible Deployment (`ansible/`)ADMIN_PORT_EXT=51850

API_PORT_EXT=53001

**Pattern**: Containerized Ansible runs locally via `ansible/run.sh`, deploying to `localhost`.```



**Roles** (`ansible/roles/`):### Ansible Deployment (Raspberry Pi)

- `system` - Docker installation (uses get.docker.com script), NTP config

- `network` - Network Manager configuration**Remote Deployment via Containerized Ansible**:

- `kiosk` - Full-screen browser setup for dedicated displays```bash

- `docker` - Runs docker-compose (see `docker/tasks/main.yml`)cd ansible

# Edit hosts.ini and .env with Pi credentials

**Critical**: `ansible/roles/docker/tasks/main.yml` uses `docker compose` (not `docker-compose`), delegates to actual Docker daemon../run.sh  # Builds Ansible image and deploys

```

**When editing Ansible**: The playbook runs as regular user with `become: yes` for sudo operations. Environment variables (like `DEVICE_TYPE`) must be passed via `-e` flag in `install.sh`.

This automates:

---1. System configuration (NTP, network, packages)

2. Docker installation

## GitHub Actions CI/CD3. Service deployment

4. Optional kiosk mode setup

### Multi-Architecture Testing Pattern

**Ansible Roles**: `system`, `network`, `kiosk`, `docker` (see `ansible/roles/`)

**Workflow**: `.github/workflows/test-full-installation.yml`

---

**Setup**:

```yaml## MQTT Communication Patterns

- name: Set up QEMU

  uses: docker/setup-qemu-action@v3  # ARM emulation on x86_64 runners**Topic Structure**:

```

- name: Set up Docker Buildxsensor/temperature      - BME688 temperature readings

  uses: docker/setup-buildx-action@v3  # Multi-platform buildssensor/humidity         - Humidity data

```sensor/pressure         - Atmospheric pressure

sensor/gas              - Air quality (gas resistance)

**Critical Environment Variables**:system/status           - System health

```bashalerts/environmental    - Threshold alerts

TARGET_ARCH=${{ matrix.board }}      # pi3, pi4-64, x86container-manager/logs  - Application manager logs (if enabled)

PLATFORM=${{ matrix.platform }}      # linux/arm/v7, linux/arm64/v8```

```

**Broker Configuration**: `mosquitto/config/mosquitto.conf`

**Docker Image Builds**: See `.github/workflows/build-device-agent.yml`, `build-zemfyre-*.yml`

**MQTT in Application Manager**:

**Pattern**: Each service (agent, nodered, grafana, admin, api) has its own build workflow that:- Optional logging backend (enable with `MQTT_BROKER` env var)

1. Builds for multiple architectures in parallel (`linux/arm/v7`, `linux/arm64`, `linux/amd64`)- Publishes container logs and events to MQTT topics

2. Tags with `latest-pi3`, `latest-pi4`, `latest-x86` suffixes- See `application-manager/docs/MQTT-USAGE.md`

3. Pushes to Docker Hub `iotistic/*` organization

---

**When adding new services**: Copy existing build workflow pattern, update service name and context path.

## Sensor Configuration

---

**Hardware**: Bosch BME688 4-in-1 environmental sensor (temp, humidity, pressure, gas/VOC)

## TypeScript/Node.js Patterns

**SPE Connectivity**: Single Pair Ethernet - both data and power over one cable

### Device Agent Structure (`agent/src/`)

**Initial Setup** (via serial CLI):

**Build System**:```bash

```bash# Connect via serial (115200 baud)

npm run build       # TSC → dist/eth -ifconfig ip 192.168.2.40

npm run watch       # Live recompilationeth -ifconfig gw 192.168.2.1

npm run start:device  # Production mode (requires built dist/)eth -mqtt ip 192.168.2.30

npm run dev         # Development with ts-nodeeth -mqtt port 1883

```core -reset

```

**Database Migrations** (`agent/src/migrations/`):

```bash**Full Guide**: See `SENSOR.md` for complete hardware setup and CLI commands

npx knex migrate:latest           # Run pending

npx knex migrate:make <name>      # Create new---

```

## TypeScript Project Patterns

**Critical**: Migrations use Knex.js, config in `agent/knexfile.js`. Database path: `/app/data/database.sqlite` (in container) or `agent/data/database.sqlite` (local dev).

### Build System

### Job System (`agent/src/jobs/`)- **TSC** compilation to `dist/` directory

- **Watch mode**: `npm run watch` for live recompilation

**Pattern**: Background jobs for async operations (container updates, log rotation, metrics collection).- **Source maps**: Enabled for debugging



**Job Registration** (`src/jobs/job-manager.ts`):### Database Migrations

```typescript```bash

jobManager.registerJob('container-update', async (payload) => {cd application-manager

    // Handler logicnpx knex migrate:latest  # Run pending migrations

}, { retries: 3, backoff: 5000 });npx knex migrate:make add_new_table  # Create migration

``````



**Jobs stored in SQLite** with state tracking (pending, running, completed, failed).**Migration Location**: `application-manager/src/migrations/`



**When creating new jobs**: Add handler in `src/jobs/handlers/`, register in `job-manager.ts`, trigger via Device API or internal event.### Docker Integration

- Uses `dockerode` library for Docker API access

---- Requires `/var/run/docker.sock` volume mount


## Service Communication Patterns

---

### Inter-Service URLs

## Testing and Debugging

**Rule**: Always use **container names**, never `localhost`, except for host-networked containers.

### Application Manager Tests

**Correct**:```bash

```typescriptcd application-manager

const mqttUrl = 'mqtt://mosquitto:1883';npx tsx test/simple-test.ts          # Basic functionality

const influxUrl = 'http://influxdb:8086';npx tsx test/mock-data-test.ts       # With mock data

``````



**Exception**: Device agent uses `network_mode: host`, so it accesses services via `localhost:port`.### Device Provisioning Test

```powershell

**Network**: All services (except agent) on `zemfyre-net` Docker bridge network.# Windows PowerShell

cd application-manager

### MQTT Topics (`mosquitto/`).\test-provisioning.ps1

```

**Pattern**: Hierarchical topics with sensor type prefix.

### Container Logs

**Topics**:```bash

```docker-compose logs -f application-manager

sensor/temperature      # BME688 temperaturedocker logs -f <container-id>

sensor/humidity         # BME688 humidity```

sensor/pressure         # Atmospheric pressure

sensor/gas              # Air quality (VOC)### Common Issues

system/status           # System health

alerts/environmental    # Threshold alerts**Application Manager Build Fails**:

device-agent/logs       # Agent logs (optional, if MQTT logging enabled)- Check TypeScript version: `npm list typescript`

```- Rebuild: `npm run clean && npm run build`



**When adding sensors**: Follow `<category>/<metric>` pattern, publish JSON payloads with `timestamp`, `value`, `unit` fields.**Docker Permission Denied**:

- Ensure `/var/run/docker.sock` is mounted

---- Run with `privileged: true` in docker-compose



## Development Workflows**MQTT Connection Fails**:

- Verify mosquitto container is running: `docker ps`

### Local Development Stack- Check network: `docker network inspect zemfyre-net`

- Test connection: `mosquitto_pub -h localhost -t test -m "hello"`

```bash

# Start services---

docker-compose -f docker-compose.dev.yml up -d

## Grafana Dashboard Customization

# Build & start device agent separately

cd agent**Access**: `http://<pi-ip>:3000` (default: admin/admin)

npm run build


- Update dashboard variables: `POST /grafana/dashboards/:uid/variables/:varName`

# Access services- Modify alert thresholds: `POST /grafana/update-alert-threshold`

http://localhost:1880   # Node-RED- Requires `GRAFANA_API_TOKEN` environment variable

http://localhost:3000   # Grafana (admin/admin)

http://localhost:48484  # Device API**Configuration**: `grafana/provisioning/` for datasources and dashboards

```

---

**Port Mapping** (`.env` file):

```bash## Critical Conventions

GRAFANA_PORT_EXT=53000    # External → 3000 internal

NODERED_PORT_EXT=51880### Service Communication

INFLUXDB_PORT_EXT=58086- **Always use container names** for inter-service URLs (not `localhost`)

```- Example: `http://influxdb:8086` not `http://localhost:8086`

- Exception: Host-networked containers (application-manager uses `network_mode: host`)

**Pattern**: External ports use `5xxxx` range to avoid conflicts, internal ports are standard.

### Environment Variables

### Testing Device Agent- Defined in `docker-compose.dev.yml` with `${VAR:-default}` syntax

- Override with `.env` file in project root

```bash- Application manager reads from container environment

cd agent

### Volume Mounts

# Unit tests- Persistent data in named volumes: `application-manager-data`, etc.

npm test- Configuration mounted as bind mounts: `./mosquitto/config:/mosquitto/config`



# API endpoint test### Port Allocation Pattern

curl http://localhost:48484/v2/device- Internal ports: Standard (1883, 3000, 8086, etc.)

- External ports: 5xxxx range for non-standard mappings to avoid conflicts

# Deploy test container- Example: Grafana internally on 3000, externally on 53000

npx tsx quick-start.ts

```---



**Integration Tests**: See `agent/test/` directory for examples. Use `ContainerManager` in simulated mode (`new ContainerManager(false)`) for tests without Docker.## Documentation Structure



---- **README.md** - Main project documentation

- **SENSOR.md** - Hardware setup and sensor CLI

## Remote Access (SSH Reverse Tunnel)- **application-manager/README.md** - Container orchestration guide

- **application-manager/docs/** - Detailed feature documentation:

**Feature**: Optional SSH reverse tunnel for accessing devices behind NAT/firewall.  - `LIVEPUSH.md` - Hot-reload development

  - `PROVISIONING.md` - Device identity system

**Setup Flow** (see `bin/install.sh::setup_remote_access()`):  - `LOGGING.md` - Multi-backend logging

1. Generate ED25519 SSH key on device  - `MQTT-USAGE.md` - MQTT integration

2. Copy public key to cloud server  - `METRICS.md` - System monitoring

3. Configure environment variables in `.env`

4. Device agent establishes reverse tunnel on startup---



**Environment Variables**:## When Editing Docker Compose

```bash

ENABLE_REMOTE_ACCESS=true1. **Port changes**: Update both internal and external port mappings

CLOUD_HOST=cloud.example.com2. **New service**: Add to `zemfyre-net` network for inter-service communication

SSH_TUNNEL_USER=tunnel3. **Environment variables**: Use `${VAR:-default}` pattern for flexibility

SSH_KEY_PATH=/app/data/ssh/id_rsa4. **Volumes**: Named volumes for persistence, bind mounts for config

```5. **Health checks**: Not currently implemented but recommended for production



**Tunnel Manager** (`agent/src/remote-access/ssh-tunnel.ts`):---

- Auto-reconnect on failure

- Health checks via `process.kill(pid, 0)`## Platform-Specific Notes

- SSH key permission validation (must be 600)

**Target Hardware**: Raspberry Pi 3+ (ARM64), also supports x86_64

**Access Device**: From cloud server: `curl http://localhost:48484/v2/device`

**PowerShell Commands** (Windows development):

---- Use `docker-compose` not `docker compose` (hyphenated version)

- Serial connection via PuTTY (see SENSOR.md)

## Common Pitfalls & Solutions

**Ansible Deployment**: Linux/Mac for running `./ansible/run.sh`

### 1. Docker Image Tag Mismatch

---

**Symptom**: `manifest for iotistic/agent:latest-x86 not found`

## Quick Reference: Most Common Commands

**Root Cause**: `DEVICE_TYPE` environment variable not set or incorrect.

```bash

**Fix**: Check `bin/install.sh::set_device_type()` logic and ensure `DEVICE_TYPE` is exported before calling `upgrade_containers.sh`.# Start development stack

docker-compose -f docker-compose.dev.yml up -d

### 2. Architecture Detection in CI

# Build application manager

**Symptom**: CI builds/pulls wrong architecture images.cd application-manager && npm run build



**Root Cause**: `uname -m` returns x86_64 on GitHub Actions runners even when building ARM.# Start application manager dev server

cd application-manager  npm run dev

**Fix**: Always set `TARGET_ARCH` environment variable in CI workflows, rely on it instead of `uname -m`.

# Deploy via Ansible

### 3. Ansible Docker Repository Errorscd ansible && ./run.sh



**Symptom**: `E:Malformed entry 1 in list file /etc/apt/sources.list.d/docker.list`# View logs

docker-compose logs -f application-manager

**Fix**: Use Docker's official convenience script (`curl -fsSL https://get.docker.com | sh`) instead of manual apt repository setup. See `ansible/roles/system/tasks/main.yml`.docker-compose logs -f nodered



### 4. Service Can't Connect to MQTT# Rebuild single service

docker-compose up -d --build <service-name>

**Symptom**: Connection refused to `localhost:1883`

# Stop everything

**Fix**: Use container name `mosquitto` instead of `localhost`. Only the device agent (with `network_mode: host`) should use localhost.docker-compose down



---# Check container health

docker ps

## Quick Command Referencedocker stats

```

```bash

# Install on Raspberry Pi---

curl -sSL https://raw.githubusercontent.com/dsamborschi/zemfyre-sensor/master/bin/install.sh | bash

This project emphasizes **modularity** (microservices), **configurability** (environment variables), and **developer experience** (livepush, comprehensive logging, clear APIs). When making changes, preserve these patterns and always test in the full Docker stack context.

# Local development
docker-compose -f docker-compose.dev.yml up -d
cd agent && npm run dev

# Deploy via Ansible (from control machine)
cd ansible
./run.sh

# View logs
docker-compose logs -f device-agent
docker logs -f <container-name>

# Rebuild service
docker-compose up -d --build <service-name>

# Device API
curl http://localhost:48484/v2/device
curl http://localhost:48484/v2/applications

# Update containers
cd ~/iotistic
DEVICE_TYPE=pi4 DOCKER_TAG=latest ./bin/upgrade_containers.sh
```

---

## Key Files to Understand

**Installation & Deployment**:
- `bin/install.sh` - Main installation script with CI/hardware detection
- `bin/upgrade_containers.sh` - Container update logic with envsubst
- `docker-compose.yml.tmpl` - Service definitions template
- `ansible/deploy.yml` - Ansible playbook entry point

**Device Agent (Container Orchestration)**:
- `agent/src/supervisor.ts` - Main orchestrator initialization
- `agent/src/container-manager.ts` - Docker operations core
- `agent/src/device-api/` - HTTP API for remote management
- `agent/src/provisioning/device-manager.ts` - Device identity system
- `agent/src/jobs/job-manager.ts` - Background job scheduler

**Build System**:
- `.github/workflows/build-device-agent.yml` - Multi-arch agent builds
- `.github/workflows/test-full-installation.yml` - End-to-end CI tests

**Configuration**:
- `.env` - Local environment overrides (gitignored)
- `mosquitto/config/mosquitto.conf` - MQTT broker config
- `grafana/provisioning/` - Grafana datasources & dashboards

---

## Architecture Philosophy

1. **Modularity**: Each service is independently deployable, communicates via well-defined APIs
2. **Multi-Platform**: ARM6/7/64 and x86_64 support via architecture-aware image tagging
3. **Configuration over Code**: Use environment variables and templates for deployment-time decisions
4. **Self-Contained**: Minimal external dependencies, install script handles everything
5. **Developer Experience**: Local dev mirrors production, comprehensive logging, clear error messages

When making changes, preserve these patterns and test across architectures (use CI workflows).
