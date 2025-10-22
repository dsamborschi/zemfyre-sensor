# Sensor Simulator - Standalone Docker Compose

This file runs **only** the sensor simulator, designed for use with a **local agent** (running on your Windows machine, not in Docker).

## 🎯 Purpose

Use this when:
- ✅ Running agent locally in VS Code (debugging)
- ✅ Agent needs to access sensor sockets on Windows filesystem
- ✅ Want to test sensor publish feature without containerized agent

## 🚀 Quick Start

### 1. Start the Simulator

```powershell
# From project root
docker-compose -f docker-compose.simulator.yml up -d

# View logs
docker-compose -f docker-compose.simulator.yml logs -f
```

### 2. Verify Sockets Created

```powershell
ls sensor-simulator\sockets\

# Expected output:
# sensor1.sock
# sensor2.sock
# sensor3.sock
```

### 3. Update Your Agent Configuration

In `.vscode/launch.json` (Debug Agent):

```json
{
  "name": "Debug Agent",
  "env": {
    "ENABLE_SENSOR_PUBLISH": "true",
    "MQTT_BROKER": "mqtt://localhost:5883",
    "SENSOR_PUBLISH_CONFIG": "{\"sensors\":[{\"name\":\"sensor1\",\"addr\":\"../sensor-simulator/sockets/sensor1.sock\",\"eomDelimiter\":\"\\\\n\",\"mqttTopic\":\"sensor/data\",\"bufferSize\":100,\"bufferTimeMs\":1000},{\"name\":\"sensor2\",\"addr\":\"../sensor-simulator/sockets/sensor2.sock\",\"eomDelimiter\":\"\\\\n\",\"mqttTopic\":\"sensor/data\",\"bufferSize\":100,\"bufferTimeMs\":1000},{\"name\":\"sensor3\",\"addr\":\"../sensor-simulator/sockets/sensor3.sock\",\"eomDelimiter\":\"\\\\n\",\"mqttTopic\":\"sensor/data\",\"bufferSize\":100,\"bufferTimeMs\":1000}]}"
  }
}
```

**Key Path:** `../sensor-simulator/sockets/sensor1.sock` (relative to agent folder)

### 4. Start Agent

Press **F5** in VS Code or:

```powershell
cd agent
npm run dev
```

## ⚙️ Configuration

All settings via `.env` file:

```bash
# .env
SIM_NUM_SENSORS=3                # Number of sensors
SIM_PUBLISH_INTERVAL_MS=60000    # Publish every 60 seconds
SIM_ENABLE_FAILURES=true         # Random failures enabled
SIM_FAILURE_CHANCE=0.05          # 5% failure chance
SIM_RECONNECT_DELAY_MS=10000     # Recovery delay
SIM_LOG_LEVEL=info               # debug/info/warn/error
```

## 📊 Volume Mapping

```yaml
volumes:
  - ./sensor-simulator/sockets:/tmp/sensors
```

**Inside container:** `/tmp/sensors/sensor1.sock`  
**On Windows:** `C:\Users\Dan\Iotistic-sensor\sensor-simulator\sockets\sensor1.sock`  
**Agent accesses:** `../sensor-simulator/sockets/sensor1.sock` (relative path)

## 🛑 Stop Simulator

```powershell
# Stop
docker-compose -f docker-compose.simulator.yml stop

# Stop and remove
docker-compose -f docker-compose.simulator.yml down

# Stop and remove volumes (clears sockets)
docker-compose -f docker-compose.simulator.yml down -v
```

## 🔧 Useful Commands

```powershell
# Restart simulator
docker-compose -f docker-compose.simulator.yml restart

# Rebuild and restart
docker-compose -f docker-compose.simulator.yml up -d --build

# View logs with timestamps
docker-compose -f docker-compose.simulator.yml logs -f --timestamps

# Check running status
docker-compose -f docker-compose.simulator.yml ps
```

## 🧪 Testing

### Test Socket Connection

```powershell
# View socket files
ls sensor-simulator\sockets\

# Check if simulator is running
docker ps | grep sensor-simulator
```

### Test with Node.js Script

Create `test-socket.js`:

```javascript
const net = require('net');
const path = require('path');

const socketPath = path.join(__dirname, 'sensor-simulator/sockets/sensor1.sock');
console.log('Connecting to:', socketPath);

const client = net.connect(socketPath, () => {
  console.log('✅ Connected!');
});

client.on('data', (data) => {
  console.log('📡 Data:', data.toString());
});

client.on('error', (err) => {
  console.error('❌ Error:', err.message);
});
```

Run:
```powershell
node test-socket.js
```

## 📋 Network Setup

The simulator uses the `Iotistic-net` bridge network, allowing it to communicate with other services like MQTT broker if needed.

```yaml
networks:
  Iotistic-net:
    driver: bridge
```

Make sure MQTT (mosquitto) is also on this network if running in Docker:

```powershell
# Start MQTT broker (if needed)
docker-compose -f docker-compose.dev.yml up -d mosquitto
```

## 🔍 Troubleshooting

### Problem: Sockets not created

```powershell
# Check simulator logs
docker-compose -f docker-compose.simulator.yml logs

# Verify directory exists
ls sensor-simulator\sockets\

# Recreate directory
mkdir -Force sensor-simulator\sockets
```

### Problem: Permission denied

```powershell
# Give permissions to socket directory
icacls sensor-simulator\sockets /grant Everyone:F /T
```

### Problem: Old sockets exist

```powershell
# Stop simulator
docker-compose -f docker-compose.simulator.yml stop

# Remove old sockets
rm sensor-simulator\sockets\*.sock

# Restart
docker-compose -f docker-compose.simulator.yml up -d
```

## 📚 Related Files

- `docker-compose.dev.yml` - Main dev stack (agent + all services)
- `sensor-simulator/README.md` - Simulator documentation
- `sensor-simulator/QUICKSTART.md` - Quick start guide
- `sensor-simulator/LOCAL-AGENT-SETUP.md` - Detailed local agent setup

## 🎯 Use Cases

| Scenario | Docker Compose File | Agent Location |
|----------|-------------------|----------------|
| **Local debugging** | `docker-compose.simulator.yml` | VS Code (local) |
| **Full stack dev** | `docker-compose.dev.yml` | Docker container |
| **Production** | `docker-compose.yml` | Docker container |

---

**Ready to start!** 🚀

```powershell
docker-compose -f docker-compose.simulator.yml up -d
```
