# Iotistic Sensor Documentation

Comprehensive documentation for the Iotistic Sensor IoT platform.

---

## 📚 Documentation Structure

### 🔮 [Shadow](./shadow/)
AWS IoT Shadow implementation, MQTT topic mapping, configuration, and state management.

**Key Documents**:
- Shadow implementation guides
- MQTT topic fixes and mappings
- Sensor configuration integration
- State synchronization
- Quick start guides

### 🔐 [Security](./security/)
Security implementation, provisioning analysis, and authentication.

**Key Documents**:
- Security implementation guides
- Security quickstart
- Provisioning security analysis

### 🔌 [MQTT](./mqtt/)
MQTT centralization, connection management, topic conventions, and debugging.

**Key Documents**:
- MQTT centralization architecture
- Connection fixes and debugging
- Topic prefix and sensor topic fixes
- Topic convention comparison

### 📊 [Database](./database/)
Database optimization, state records, and PostgreSQL setup.

**Key Documents**:
- Write optimization guides
- State records explanation
- PostgreSQL setup

### 🐳 [Docker](./docker/)
Container management, image monitoring, and Docker Hub integration.

**Key Documents**:
- Docker repository fixes
- Hub polling schedule
- Container recreation fixes
- Image monitoring service
- Tag approval workflow
- Console exec guide

### 🔧 [Provisioning](./provisioning/)
Device provisioning workflows, skip implementations, and testing.

**Key Documents**:
- Provisioning skip implementation
- Flow diagrams
- Test checklists
- Quick reference guides

### 🌐 [Network](./network/)
Network implementation and configuration.

**Key Documents**:
- Network implementation complete

### 🔗 [Remote Access](./remote-access/)
SSH tunneling and remote device access.

**Key Documents**:
- Remote access setup
- SSH tunnel implementation
- Installation guides

### 🤖 [Digital Twin](./digital-twin/)
Digital twin implementation and verification.

**Key Documents**:
- Phase 2 completion
- Verification guides

### 🚀 [Ansible](./ansible/)
Ansible automation, idempotency fixes, and quick fixes.

**Key Documents**:
- Idempotency fixes
- Quick fix guides

### 🌐 [API](./api/)
API implementation, process metrics, and cloud migration.

**Key Documents**:
- API process metrics
- Cloud API migration
- Agent API version fixes
- Top process metrics implementation
- Debug guides (304 issue)

### 🛡️ [Vulnerabilities](./vulnerabilities/)
Vulnerability scanning and feature summaries.

**Key Documents**:
- Vulnerability scanning
- Feature summaries

### ⚙️ [Agent Configuration](./agent-config/)
Agent configuration updates and changes.

**Key Documents**:
- Configuration updates

### 📅 [Events](./events/)
Event timeline and tracking.

**Key Documents**:
- Event timeline completion

### 📡 [Sensor](./sensor/)
Sensor hardware setup, configuration, and simulator.

**Key Documents**:
- Sensor hardware guide
- Sensor simulator compose

---

## 🔍 Quick Navigation

### By Feature
- **Shadow**: [shadow/](./shadow/)
- **MQTT**: [mqtt/](./mqtt/)
- **Database**: [database/](./database/)
- **Security**: [security/](./security/)

### By Component
- **Agent**: See [agent/docs/](../agent/docs/)
- **API**: [api/](./api/)
- **Dashboard**: See [dashboard/docs/](../dashboard/docs/)
- **Admin Panel**: See [admin/docs/](../admin/docs/)
- **ML Service**: See [ml-service/docs/](../ml-service/docs/)
- **Sensor Simulator**: See [sensor-simulator/](../sensor-simulator/)

### By Task
- **Setup**: [provisioning/](./provisioning/), [remote-access/](./remote-access/)
- **Configuration**: [agent-config/](./agent-config/), [sensor/](./sensor/)
- **Troubleshooting**: [mqtt/](./mqtt/), [docker/](./docker/), [api/](./api/)
- **Security**: [security/](./security/), [vulnerabilities/](./vulnerabilities/)

---

## 📖 Reading Order for New Users

1. **Start Here**: `sensor/SENSOR.md` - Hardware setup
2. **Provisioning**: `provisioning/PROVISIONING-SKIP-QUICK-REF.md`
3. **Shadow**: `shadow/SHADOW-QUICK-START.md`
4. **MQTT**: `mqtt/` - Centralized MQTT documentation
5. **Security**: `security/SECURITY-QUICKSTART.md`
6. **Advanced**: Explore specific feature directories

---

## 🏗️ Project Structure

```
docs/
├── README.md (this file)
├── shadow/                    # AWS IoT Shadow
├── security/                  # Security & Auth
├── mqtt/                      # MQTT Communication
├── database/                  # Database & Persistence
├── docker/                    # Container Management
├── provisioning/              # Device Provisioning
├── network/                   # Network Configuration
├── remote-access/             # SSH & Remote Access
├── digital-twin/              # Digital Twin
├── ansible/                   # Ansible Automation
├── api/                       # API Documentation
├── vulnerabilities/           # Security Scanning
├── agent-config/              # Agent Configuration
├── events/                    # Event Timeline
└── sensor/                    # Sensor Hardware
```

---

## 🔗 Related Documentation

- **Agent Documentation**: [agent/docs/](../agent/docs/)
  - MQTT usage, logging, metrics, provisioning, sensor publish
- **Dashboard Documentation**: [dashboard/docs/](../dashboard/docs/)
  - Timeline components, integration, and fixes
- **Admin Panel Documentation**: [admin/docs/](../admin/docs/)
  - Multi-device management, Phase 3 implementation
- **ML Service Documentation**: [ml-service/docs/](../ml-service/docs/)
  - Machine learning training, setup, and quick start
- **Sensor Simulator**: [sensor-simulator/](../sensor-simulator/)
  - Local development and testing
- **API Documentation**: [api/](../api/)
  - API-specific implementation guides

---

## 🤝 Contributing

When adding new documentation:

1. Place files in the appropriate subdirectory
2. Use clear, descriptive filenames (e.g., `FEATURE-IMPLEMENTATION.md`)
3. Update this README with links to new documents
4. Include a summary at the top of each document

---

**Last Updated**: October 20, 2025  
**Organization**: Comprehensive reorganization of all .md files into topic-specific directories
