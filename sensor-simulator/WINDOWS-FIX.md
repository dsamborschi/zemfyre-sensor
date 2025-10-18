# Unix Socket Windows Fix - Run Simulator Locally

## 🔴 The Problem

Unix domain sockets created inside a **Linux Docker container** cannot be accessed by **Windows processes**, even with bind mounts. Windows doesn't have native Unix socket support for cross-boundary communication.

**Error you saw:**
```
connect EACCES ../sensor-simulator/sockets/sensor2.sock
```

## ✅ The Solution: Run Simulator Locally on Windows

Instead of running the simulator in Docker, run it directly as a Node.js process on Windows. Node.js on Windows can create Unix-style sockets that work with other Windows Node.js processes.

## 🚀 Quick Fix Steps

### 1. Stop Docker Simulator

```powershell
docker-compose -f docker-compose.simulator.yml down
```

### 2. Start Simulator Locally

```powershell
cd sensor-simulator
.\run-local.ps1
```

**OR manually:**

```powershell
cd sensor-simulator
node simulator.js
```

### 3. Start Agent in VS Code

Press **F5** to start the agent.

## ✅ Expected Output

**Simulator (in PowerShell terminal):**
```
🚀 Starting Sensor Simulator...
Configuration: {
  "numSensors": 3,
  "socketDir": "./sockets",
  ...
}
✅ Sensor Simulator Started Successfully!
📡 [sensor1] Socket listening: ./sockets/sensor1.sock
📡 [sensor2] Socket listening: ./sockets/sensor2.sock
📡 [sensor3] Socket listening: ./sockets/sensor3.sock
📡 [sensor1] Client connected
📡 [sensor1] Published: {"sensor_name":"sensor1",...}
```

**Agent (VS Code Debug Console):**
```
[SensorPublish] Starting sensor 'sensor1'
[SensorPublish] Connected to ../sensor-simulator/sockets/sensor1.sock
[SensorPublish] Received data from sensor1
[SensorPublish] Published to MQTT: sensor/data
```

## 🎯 Why This Works

```
Before (Doesn't Work):
┌─────────────────────────┐      ┌──────────────────┐
│ Linux Container         │      │ Windows Process  │
│                         │      │                  │
│ Simulator creates       │      │ Agent tries to   │
│ Linux Unix socket  ────┼──X───│ connect          │
│                         │      │                  │
└─────────────────────────┘      └──────────────────┘
        ❌ Can't cross boundary

After (Works):
┌──────────────────────────────────────────────────┐
│             Windows OS                           │
│                                                  │
│  Simulator (Node.js)  ←──Unix Socket──→  Agent  │
│      creates socket                    reads it  │
│                                                  │
└──────────────────────────────────────────────────┘
        ✅ Same OS, same filesystem
```

## 📋 Configuration

The `run-local.ps1` script sets these defaults:

```powershell
$env:NUM_SENSORS = "3"
$env:SOCKET_DIR = "./sockets"
$env:PUBLISH_INTERVAL_MS = "60000"     # 60 seconds
$env:ENABLE_FAILURES = "true"
$env:FAILURE_CHANCE = "0.05"           # 5%
$env:LOG_LEVEL = "info"
```

**To customize**, edit `run-local.ps1` before running.

## 🛑 Stopping

**Simulator**: Press `Ctrl+C` in the PowerShell window

**Agent**: Click red square in VS Code debug toolbar

## 🔄 Alternative: Use WSL2

If you have WSL2 installed, you can run both agent and simulator in WSL:

```bash
# In WSL2
cd /mnt/c/Users/Dan/zemfyre-sensor/sensor-simulator
npm install
node simulator.js

# In another WSL2 terminal
cd /mnt/c/Users/Dan/zemfyre-sensor/agent
npm run dev
```

This works because WSL2 has full Linux Unix socket support.

## 📚 Summary

| Approach | Simulator | Agent | Unix Sockets Work? |
|----------|-----------|-------|-------------------|
| **Docker + Windows** | Docker (Linux) | Windows | ❌ No |
| **Windows + Windows** | Windows | Windows | ✅ Yes |
| **WSL2 + WSL2** | WSL2 (Linux) | WSL2 (Linux) | ✅ Yes |

**Recommended for you:** Run both simulator and agent **locally on Windows** (no Docker needed for local dev).

---

## 🚀 Quick Start Command

```powershell
# Terminal 1: Start simulator
cd c:\Users\Dan\zemfyre-sensor\sensor-simulator
.\run-local.ps1

# VS Code: Start agent (F5)
```

**That's it!** 🎉
