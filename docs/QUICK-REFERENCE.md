# Documentation Quick Reference

**Last Updated**: October 20, 2025

---

## 📍 Where to Find Documentation

### By Topic

| Topic | Location | Files |
|-------|----------|-------|
| 🔮 **Shadow** | `docs/shadow/` | 21 |
| 🔌 **MQTT** | `docs/mqtt/` | 18 |
| 🔐 **Security** | `docs/security/` | 4 |
| 📊 **Database** | `docs/database/` | 4 |
| 🐳 **Docker** | `docs/docker/` | 6 |
| 🔧 **Provisioning** | `docs/provisioning/` | 5 |
| 🔗 **Remote Access** | `docs/remote-access/` | 3 |
| 🤖 **Digital Twin** | `docs/digital-twin/` | 2 |
| 🚀 **Ansible** | `docs/ansible/` | 2 |
| 🌐 **API** | `docs/api/` | 5 |
| 🛡️ **Vulnerabilities** | `docs/vulnerabilities/` | 2 |
| 🌐 **Network** | `docs/network/` | 1 |
| ⚙️ **Agent Config** | `docs/agent-config/` | 1 |
| 📅 **Events** | `docs/events/` | 1 |
| 📡 **Sensor** | `docs/sensor/` | 2 |

---

## 🎯 Common Tasks

### Setting Up a Device
1. `docs/sensor/SENSOR.md` - Hardware setup
2. `docs/provisioning/PROVISIONING-SKIP-QUICK-REF.md` - Provisioning
3. `docs/shadow/SHADOW-QUICK-START.md` - Shadow configuration

### MQTT Integration
1. `docs/mqtt/QUICK-START.md` - 2-minute overview
2. `docs/mqtt/TESTING.md` - Testing guide
3. `docs/mqtt/QUICK-REFERENCE.md` - Daily reference

### Security & Access
1. `docs/security/SECURITY-QUICKSTART.md` - Security setup
2. `docs/remote-access/REMOTE-ACCESS.md` - SSH tunneling
3. `docs/vulnerabilities/VULNERABILITY-SCANNING.md` - Scanning

### Database & Performance
1. `docs/database/DATABASE-WRITE-OPTIMIZATION.md` - Optimization
2. `docs/database/POSTGRES-SETUP.md` - PostgreSQL setup
3. `docs/api/API-PROCESS-METRICS.md` - Performance monitoring

### Docker & Containers
1. `docs/docker/IMAGE-MONITORING-SERVICE.md` - Image monitoring
2. `docs/docker/DOCKER-HUB-POLLING-SCHEDULE.md` - Update polling
3. `docs/docker/TAG-APPROVAL-WORKFLOW.md` - Tag management

---

## 📖 Must-Read Documents

### For Developers
- `docs/README.md` - Main documentation index
- `docs/mqtt/README.md` - MQTT centralization guide
- `docs/shadow/README.md` - Shadow implementation
- `agent/docs/mqtt/INDEX.md` - MQTT manager (agent-specific)

### For Operators
- `docs/provisioning/PROVISIONING-SKIP-QUICK-REF.md`
- `docs/remote-access/REMOTE-ACCESS-INSTALLATION.md`
- `docs/docker/DOCKER-HUB-POLLING-SCHEDULE.md`

### For Troubleshooting
- `docs/mqtt/MQTT-DEBUGGING-GUIDE.md`
- `docs/api/DEBUG-304-ISSUE.md`
- `docs/docker/CONSOLE-EXEC-GUIDE.md`

---

## 🔗 External References

### Component Documentation
- **Agent**: `agent/docs/` - Agent-specific documentation
- **Dashboard**: `dashboard/` - Dashboard documentation
- **Sensor Simulator**: `sensor-simulator/` - Simulator docs
- **ML Service**: `ml-service/` - ML documentation
- **API**: `api/` - API-specific documentation

### Configuration
- `.env.example` - Environment variables
- `docker-compose.dev.yml` - Development setup
- `docker-compose.yml.tmpl` - Production template

---

## 🆘 Quick Help

### "I need to..."

**Set up MQTT** → `docs/mqtt/QUICK-START.md`  
**Configure shadow** → `docs/shadow/SHADOW-QUICK-START.md`  
**Provision a device** → `docs/provisioning/PROVISIONING-SKIP-QUICK-REF.md`  
**Enable remote access** → `docs/remote-access/REMOTE-ACCESS.md`  
**Optimize database** → `docs/database/DATABASE-WRITE-OPTIMIZATION.md`  
**Monitor containers** → `docs/docker/IMAGE-MONITORING-SERVICE.md`  
**Secure the system** → `docs/security/SECURITY-QUICKSTART.md`  
**Debug MQTT** → `docs/mqtt/MQTT-DEBUGGING-GUIDE.md`  
**Understand shadow topics** → `docs/shadow/SHADOW-MQTT-TOPIC-MAPPING.md`  

---

## 📚 Documentation Hierarchy

```
docs/
├── README.md ← START HERE (main index)
├── QUICK-REFERENCE.md ← This file
├── REORGANIZATION-SUMMARY.md ← How docs are organized
│
├── shadow/
│   └── README.md ← Shadow index
├── mqtt/
│   ├── INDEX.md ← MQTT centralization index
│   └── README-INDEX.md ← MQTT navigation
└── [other categories]/
    └── (individual docs)
```

---

## 🎓 Learning Path

### Beginner
1. Read `docs/README.md` for overview
2. Follow `docs/sensor/SENSOR.md` for hardware
3. Complete `docs/provisioning/PROVISIONING-SKIP-QUICK-REF.md`
4. Try `docs/shadow/SHADOW-QUICK-START.md`

### Intermediate
1. Study `docs/mqtt/README.md` for MQTT centralization
2. Review `docs/security/SECURITY-IMPLEMENTATION.md`
3. Explore `docs/database/DATABASE-WRITE-OPTIMIZATION.md`
4. Learn `docs/docker/IMAGE-MONITORING-SERVICE.md`

### Advanced
1. Deep dive into `docs/shadow/SHADOW-IMPLEMENTATION.md`
2. Master `docs/mqtt/ARCHITECTURE-DIAGRAMS.md`
3. Implement `docs/digital-twin/DIGITAL-TWIN-PHASE2-COMPLETE.md`
4. Optimize with `docs/database/DATABASE-WRITE-OPTIMIZATION-COMPLETE.md`

---

**💡 Tip**: Use `docs/README.md` for comprehensive navigation with detailed descriptions of each category!
