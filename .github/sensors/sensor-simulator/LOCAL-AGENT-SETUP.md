# Running Sensor Simulator with Local Agent (Non-Containerized)

This guide explains how to use the sensor simulator when your **agent runs locally** (not in a container), such as when debugging in VS Code.

## 🎯 The Problem

When the agent runs locally:
- Agent is on Windows filesystem: `C:\Users\Dan\...`
- Simulator sockets are inside container: `/tmp/sensors/`
- **They can't communicate!** ❌

## ✅ Solution Options

### **Option 1: Bind Mount to Local Directory (Recommended for Windows)**

This makes the sockets accessible to your local agent via a Windows directory.

#### **1. Update docker-compose.dev.yml**

```yaml
sensor-simulator:
    volumes:
        # Comment out the named volume
        # - sensor-sockets:/tmp/sensors
        
        # Use bind mount instead
        - ./sensor-simulator/sockets:/tmp/sensors
```

#### **2. Create the local socket directory**

```powershell
# Create directory for sockets
mkdir sensor-simulator\sockets
```

#### **3. Update your agent launch configuration**

**VS Code `.vscode/launch.json`:**

```json
{
  "name": "Debug Agent",
  "env": {
    "ENABLE_SENSOR_PUBLISH": "true",
    "SENSOR_PUBLISH_CONFIG": "{\"sensors\":[{\"name\":\"sensor1\",\"addr\":\"./sensor-simulator/sockets/sensor1.sock\",\"eomDelimiter\":\"\\\\n\",\"mqttTopic\":\"sensor/data\",\"bufferSize\":100,\"bufferTimeMs\":1000}]}"
  }
}
```

**Note the path change:**
- ❌ Old: `/tmp/sensors/sensor1.sock` (inside container)
- ✅ New: `./sensor-simulator/sockets/sensor1.sock` (Windows filesystem)

#### **4. Start simulator and agent**

```powershell
# Start simulator with bind mount
docker-compose -f docker-compose.dev.yml up -d sensor-simulator

# Check sockets are created in Windows directory
ls sensor-simulator\sockets\

# Expected output:
# sensor1.sock
# sensor2.sock
# sensor3.sock

# Start agent in VS Code (F5) or:
cd agent
npm run dev
```

---

### **Option 2: Run Simulator Locally Too (Full Local Development)**

Run both simulator and agent outside Docker.

#### **1. Install Node.js dependencies**

```powershell
cd sensor-simulator
npm install
```

#### **2. Create local socket directory**

```powershell
# Create directory for sockets (Unix-style path for Node.js)
mkdir -p sockets

# Or Windows style
mkdir sockets
```

#### **3. Start simulator locally**

```powershell
# Set environment variables
$env:NUM_SENSORS=3
$env:SOCKET_DIR="./sockets"
$env:PUBLISH_INTERVAL_MS=60000
$env:LOG_LEVEL="debug"

# Run simulator
node simulator.js
```

#### **4. Update agent configuration**

```json
{
  "SENSOR_PUBLISH_CONFIG": "{\"sensors\":[{\"name\":\"sensor1\",\"addr\":\"../sensor-simulator/sockets/sensor1.sock\",\"eomDelimiter\":\"\\\\n\",\"mqttTopic\":\"sensor/data\"}]}"
}
```

#### **5. Start agent**

```powershell
cd agent
npm run dev
```

---

### **Option 3: Use Named Pipes (Windows Alternative)**

On Windows, you could use **named pipes** instead of Unix sockets. This requires modifying the simulator.

**Not implemented yet**, but could be added if needed. Named pipes work as `\\.\pipe\sensor1`.

---

## 🔍 Verification Steps

### **1. Check if sockets exist**

```powershell
# For Option 1 (bind mount)
ls sensor-simulator\sockets\

# For Option 2 (local simulator)
ls sensor-simulator\sockets\

# Expected output:
# sensor1.sock
# sensor2.sock
# sensor3.sock
```

### **2. Test socket connection**

**With WSL (if installed):**
```bash
# In WSL
nc -U /mnt/c/Users/Dan/Iotistic-sensor/sensor-simulator/sockets/sensor1.sock
```

**With Node.js test script:**

Create `test-socket.js`:
```javascript
const net = require('net');
const path = require('path');

const socketPath = path.join(__dirname, 'sensor-simulator/sockets/sensor1.sock');

const client = net.connect(socketPath, () => {
  console.log('✅ Connected to sensor socket!');
});

client.on('data', (data) => {
  console.log('📡 Received:', data.toString());
});

client.on('error', (err) => {
  console.error('❌ Connection error:', err.message);
});
```

Run it:
```powershell
node test-socket.js
```

### **3. Check agent logs**

Look for sensor connection messages:
```
[SensorPublish] Starting sensor 'sensor1'
[SensorPublish] Connecting to /path/to/sensor1.sock
[SensorPublish] Connected to sensor socket
[SensorPublish] Published: {"sensor_name":"sensor1",...}
```

---

## 🐛 Troubleshooting

### **Problem: "ENOENT: no such file or directory"**

**Cause:** Socket file doesn't exist or path is wrong.

**Fix:**
```powershell
# Verify simulator is running
docker-compose ps sensor-simulator

# Check socket directory
ls sensor-simulator\sockets\

# Verify path in agent config matches actual location
```

---

### **Problem: "EACCES: permission denied"**

**Cause:** Windows permissions issue.

**Fix:**
```powershell
# Give full permissions to sockets directory
icacls sensor-simulator\sockets /grant Everyone:F /T
```

---

### **Problem: "Socket already in use"**

**Cause:** Old socket file exists from previous run.

**Fix:**
```powershell
# Stop simulator
docker-compose stop sensor-simulator

# Delete old sockets
rm sensor-simulator\sockets\*.sock

# Restart simulator
docker-compose up -d sensor-simulator
```

---

### **Problem: Agent can't read from socket**

**Cause:** Windows vs Linux path format.

**Fix:** Use forward slashes in paths:
```json
// ✅ Good
"addr": "./sensor-simulator/sockets/sensor1.sock"

// ❌ Bad
"addr": ".\\sensor-simulator\\sockets\\sensor1.sock"
```

---

## 📋 Complete Example

### **docker-compose.dev.yml** (updated)

```yaml
sensor-simulator:
    build:
        context: ./sensor-simulator
    volumes:
        - ./sensor-simulator/sockets:/tmp/sensors  # Bind mount
```

### **.vscode/launch.json** (updated)

```json
{
  "name": "Debug Agent",
  "type": "node",
  "request": "launch",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "dev"],
  "cwd": "${workspaceFolder}/agent",
  "env": {
    "ENABLE_SENSOR_PUBLISH": "true",
    "MQTT_BROKER": "mqtt://localhost:5883",
    "SENSOR_PUBLISH_CONFIG": "{\"sensors\":[{\"name\":\"sensor1\",\"addr\":\"../sensor-simulator/sockets/sensor1.sock\",\"eomDelimiter\":\"\\\\n\",\"mqttTopic\":\"sensor/data\",\"bufferSize\":100,\"bufferTimeMs\":1000},{\"name\":\"sensor2\",\"addr\":\"../sensor-simulator/sockets/sensor2.sock\",\"eomDelimiter\":\"\\\\n\",\"mqttTopic\":\"sensor/data\",\"bufferSize\":100,\"bufferTimeMs\":1000},{\"name\":\"sensor3\",\"addr\":\"../sensor-simulator/sockets/sensor3.sock\",\"eomDelimiter\":\"\\\\n\",\"mqttTopic\":\"sensor/data\",\"bufferSize\":100,\"bufferTimeMs\":1000}]}"
  }
}
```

### **Commands**

```powershell
# 1. Create socket directory
mkdir sensor-simulator\sockets

# 2. Update docker-compose.dev.yml (use bind mount)

# 3. Start simulator
docker-compose -f docker-compose.dev.yml up -d sensor-simulator

# 4. Verify sockets created
ls sensor-simulator\sockets\

# 5. Start agent in VS Code (F5) or:
cd agent
npm run dev
```

---

## ✅ Success Indicators

When everything works correctly, you'll see:

**Simulator logs:**
```
✅ Sensor Simulator Started Successfully!
📡 [sensor1] Socket listening: /tmp/sensors/sensor1.sock
📡 [sensor1] Client connected
📡 [sensor1] Published: {"sensor_name":"sensor1",...}
```

**Agent logs:**
```
[SensorPublish] Starting sensor 'sensor1'
[SensorPublish] Connected to ../sensor-simulator/sockets/sensor1.sock
[SensorPublish] Received data from sensor1
[SensorPublish] Published to MQTT: sensor/data
```

**MQTT (if subscribed):**
```bash
mosquitto_sub -h localhost -p 5883 -t 'sensor/#' -v

# Output:
sensor/data {"sensor_name":"sensor1","temperature":23.45,...}
```

---

## 🎯 Recommended Setup

**For local development (Windows with VS Code):**

1. ✅ Use **Option 1** (bind mount to `./sensor-simulator/sockets`)
2. ✅ Run simulator in Docker
3. ✅ Run agent locally (VS Code debug)
4. ✅ Update agent config to use relative path: `../sensor-simulator/sockets/sensor1.sock`

This gives you:
- Simulator isolation (in Docker)
- Agent debugging (full VS Code features)
- Simple socket sharing (via bind mount)

---

## 📚 Related Documentation

- [QUICKSTART.md](QUICKSTART.md) - Basic setup (containerized agent)
- [README.md](README.md) - Full feature documentation
- [IMPLEMENTATION-COMPLETE.md](IMPLEMENTATION-COMPLETE.md) - Architecture overview
