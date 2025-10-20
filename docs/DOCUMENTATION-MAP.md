# 📂 Documentation Map

Quick visual reference for the Zemfyre Sensor documentation structure.

---

## 🗺️ Visual Structure

```
zemfyre-sensor/
│
├── README.md (project overview)
│
└── docs/
    │
    ├── 📖 README.md ★ START HERE
    ├── 📋 QUICK-REFERENCE.md
    ├── 📄 REORGANIZATION-SUMMARY.md
    │
    ├── 🔮 shadow/ (21 files)
    │   ├── README.md
    │   ├── SHADOW-IMPLEMENTATION.md
    │   ├── SHADOW-QUICK-START.md
    │   ├── SHADOW-MQTT-TOPIC-MAPPING.md
    │   ├── SHADOW-SENSOR-CONFIG.md
    │   └── ... (16 more)
    │
    ├── 🔌 mqtt/ (18 files)
    │   ├── INDEX.md
    │   ├── README.md
    │   ├── README-INDEX.md
    │   ├── QUICK-START.md
    │   ├── TESTING.md
    │   ├── INTEGRATION-COMPLETE.md
    │   └── ... (12 more)
    │
    ├── 🔐 security/ (4 files)
    │   ├── SECURITY-IMPLEMENTATION.md
    │   ├── SECURITY-QUICKSTART.md
    │   └── ...
    │
    ├── 📊 database/ (4 files)
    │   ├── DATABASE-WRITE-OPTIMIZATION.md
    │   ├── POSTGRES-SETUP.md
    │   └── ...
    │
    ├── 🐳 docker/ (6 files)
    │   ├── IMAGE-MONITORING-SERVICE.md
    │   ├── DOCKER-HUB-POLLING-SCHEDULE.md
    │   └── ...
    │
    ├── 🔧 provisioning/ (5 files)
    │   ├── PROVISIONING-SKIP-IMPLEMENTATION.md
    │   ├── PROVISIONING-SKIP-QUICK-REF.md
    │   └── ...
    │
    ├── 🌐 network/ (1 file)
    │   └── NETWORK-IMPLEMENTATION-COMPLETE.md
    │
    ├── 🔗 remote-access/ (3 files)
    │   ├── REMOTE-ACCESS.md
    │   ├── SSH-TUNNEL-IMPLEMENTATION.md
    │   └── ...
    │
    ├── 🤖 digital-twin/ (2 files)
    │   ├── DIGITAL-TWIN-PHASE2-COMPLETE.md
    │   └── DIGITAL-TWIN-VERIFICATION.md
    │
    ├── 🚀 ansible/ (2 files)
    │   ├── ANSIBLE-IDEMPOTENCY-FIX.md
    │   └── ANSIBLE-QUICK-FIX.md
    │
    ├── 🌐 api/ (5 files)
    │   ├── API-PROCESS-METRICS.md
    │   ├── CLOUD-API-MIGRATION.md
    │   └── ...
    │
    ├── 🛡️ vulnerabilities/ (2 files)
    │   ├── VULNERABILITY-SCANNING.md
    │   └── VULNERABILITY-FEATURE-SUMMARY.md
    │
    ├── ⚙️ agent-config/ (1 file)
    │   └── AGENT-CONFIG-UPDATED.md
    │
    ├── 📅 events/ (1 file)
    │   └── EVENT-TIMELINE-COMPLETE.md
    │
    └── 📡 sensor/ (2 files)
        ├── SENSOR.md
        └── SENSOR-SIMULATOR-COMPOSE.md
```

---

## 🎯 Navigation Paths

### Path 1: New User Setup
```
docs/README.md
    → sensor/SENSOR.md (hardware)
        → provisioning/PROVISIONING-SKIP-QUICK-REF.md
            → shadow/SHADOW-QUICK-START.md
                → mqtt/QUICK-START.md
```

### Path 2: MQTT Integration
```
docs/README.md
    → mqtt/INDEX.md
        → mqtt/QUICK-START.md
            → mqtt/TESTING.md
                → mqtt/INTEGRATION-COMPLETE.md
```

### Path 3: Security Setup
```
docs/README.md
    → security/SECURITY-QUICKSTART.md
        → vulnerabilities/VULNERABILITY-SCANNING.md
            → remote-access/REMOTE-ACCESS.md
```

### Path 4: Performance Optimization
```
docs/README.md
    → database/DATABASE-WRITE-OPTIMIZATION.md
        → api/API-PROCESS-METRICS.md
            → docker/IMAGE-MONITORING-SERVICE.md
```

---

## 🔍 Find Documentation By...

### By Feature
| Feature | Path |
|---------|------|
| Shadow | `docs/shadow/README.md` → 21 files |
| MQTT | `docs/mqtt/INDEX.md` → 18 files |
| Security | `docs/security/` → 4 files |
| Database | `docs/database/` → 4 files |

### By Task
| Task | Start Here |
|------|------------|
| Setup Device | `docs/sensor/SENSOR.md` |
| Configure Shadow | `docs/shadow/SHADOW-QUICK-START.md` |
| Integrate MQTT | `docs/mqtt/QUICK-START.md` |
| Secure System | `docs/security/SECURITY-QUICKSTART.md` |
| Optimize DB | `docs/database/DATABASE-WRITE-OPTIMIZATION.md` |
| Debug Issues | `docs/mqtt/MQTT-DEBUGGING-GUIDE.md` |

### By Component
| Component | Location |
|-----------|----------|
| Agent | `agent/docs/` |
| API | `docs/api/` |
| Dashboard | `dashboard/` |
| ML Service | `ml-service/` |
| Sensor Simulator | `sensor-simulator/` |

---

## 📊 File Distribution

```
Shadow        █████████████████████ 21 files (27%)
MQTT          ██████████████████ 18 files (23%)
Docker        ██████ 6 files (8%)
Provisioning  █████ 5 files (6%)
API           █████ 5 files (6%)
Security      ████ 4 files (5%)
Database      ████ 4 files (5%)
Remote Access ███ 3 files (4%)
Digital Twin  ██ 2 files (3%)
Ansible       ██ 2 files (3%)
Vulnerabilities ██ 2 files (3%)
Sensor        ██ 2 files (3%)
Network       █ 1 file (1%)
Agent Config  █ 1 file (1%)
Events        █ 1 file (1%)
```

---

## 🚀 Quick Access

### Most Important Files
1. `docs/README.md` - Main index
2. `docs/QUICK-REFERENCE.md` - Quick lookup
3. `docs/mqtt/QUICK-START.md` - MQTT overview
4. `docs/shadow/SHADOW-QUICK-START.md` - Shadow setup

### Most Used Categories
1. 🔮 Shadow (21 files)
2. 🔌 MQTT (18 files)
3. 🐳 Docker (6 files)
4. 🔧 Provisioning (5 files)

### Index Files
- `docs/README.md` - Main documentation index
- `docs/QUICK-REFERENCE.md` - Quick reference guide
- `docs/shadow/README.md` - Shadow documentation index
- `docs/mqtt/INDEX.md` - MQTT centralization index
- `docs/mqtt/README-INDEX.md` - MQTT navigation index

---

## 📱 Mobile-Friendly Summary

```
Start → docs/README.md
Quick → docs/QUICK-REFERENCE.md

Shadow → docs/shadow/README.md (21)
MQTT → docs/mqtt/INDEX.md (18)
Security → docs/security/ (4)
Docker → docs/docker/ (6)
```

---

**💡 Tip**: Bookmark `docs/README.md` and `docs/QUICK-REFERENCE.md` for easy access!

**📍 Current Location**: `docs/DOCUMENTATION-MAP.md`  
**🔙 Back to**: [Main Index](./README.md) | [Quick Reference](./QUICK-REFERENCE.md)
