# Modbus Sensor Integration Guide

This document provides a complete guide for integrating Modbus devices with the IoT platform using the custom Modbus adapter and existing sensor-publish system.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Flow](#data-flow)
3. [Modbus Adapter](#modbus-adapter)
4. [Sensor-Publish Integration](#sensor-publish-integration)
5. [Configuration](#configuration)
6. [Windows Compatibility](#windows-compatibility)
7. [Testing and Validation](#testing-and-validation)
8. [Troubleshooting](#troubleshooting)

## Architecture Overview

The Modbus integration supports two architectural approaches: a direct adapter approach and an independent agent services approach.

### Current Implementation: Direct Adapter

The current Modbus integration consists of two main components:

1. **Modbus Adapter** (`modbus-adapter/`) - Connects to Modbus devices and writes data to Unix sockets/Named Pipes
2. **Sensor-Publish** (`agent/src/sensor-publish/`) - Reads from sockets, batches data, and publishes to MQTT

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Modbus Device  │───▶│  Modbus Adapter │───▶│  Unix Socket    │───▶│ Sensor-Publish  │
│  (TCP/RTU/ASCII)│    │  (TypeScript)   │    │  /Named Pipe    │    │  (Agent)        │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
                                                                              │
                                                                              ▼
                                                                     ┌─────────────────┐
                                                                     │   MQTT Broker   │
                                                                     │  (Mosquitto)    │
                                                                     └─────────────────┘
```

### Recommended: Independent Agent Services Architecture

For production deployments and multi-protocol support, the recommended approach is independent protocol agent services:

```
┌─────────────────────────────────────────────────────────────┐
│                    IoT Platform Architecture                 │
├─────────────────────────────────────────────────────────────┤
│  Main Agent (48484)              │  Protocol Agents         │
│  ├── Container Management        │  ├── Modbus (48485)      │
│  ├── Device Provisioning        │  ├── CAN (48486)         │
│  ├── System Monitoring          │  ├── OPC-UA (48487)      │
│  ├── Cloud Communication        │  └── DNP3 (48488)        │
│  └── Sensor-Publish System      │                           │
├─────────────────────────────────────────────────────────────┤
│                    Data Flow                                │
│  Protocol Agents → Unix Sockets → Sensor-Publish → MQTT    │
├─────────────────────────────────────────────────────────────┤
│                   Management APIs                           │
│  Main:    http://localhost:48484/v2/device                 │
│  Modbus:  http://localhost:48485/api/modbus/devices        │
│  CAN:     http://localhost:48486/api/can/interfaces        │
│  OPC-UA:  http://localhost:48487/api/opcua/servers         │
└─────────────────────────────────────────────────────────────┘
```

#### Port Allocation Strategy
```
Main Agent (Container Orchestrator):  48484
Modbus Agent:                        48485  
CAN Agent:                           48486
OPC-UA Agent:                        48487
DNP3 Agent:                          48488
BACnet Agent:                        48489
```

#### Multi-Protocol Data Flow
```
Modbus Devices → Modbus Agent (48485) → /tmp/modbus.sock → Sensor-Publish → MQTT
CAN Bus        → CAN Agent (48486)    → /tmp/can.sock    → Sensor-Publish → MQTT  
OPC-UA Servers → OPC-UA Agent (48487) → /tmp/opcua.sock  → Sensor-Publish → MQTT
```

#### Service Architecture Benefits

1. **Microservices Pattern**: Each protocol is an independent service
2. **Scalability**: Scale protocol agents based on device load
3. **Fault Isolation**: Protocol issues don't affect main agent
4. **Development Independence**: Teams can work on different protocols
5. **Deployment Flexibility**: Deploy only needed protocol agents
6. **API Consistency**: Uniform REST API across all protocols
7. **Resource Optimization**: Right-size each service for its workload

## Data Flow

### 1. Modbus Data Collection
- Adapter connects to Modbus devices (TCP, RTU, or ASCII)
- Reads holding registers, input registers, coils, and discrete inputs
- Supports multiple devices and register ranges
- Configurable polling intervals per device

### 2. Data Formatting
- Raw Modbus data converted to structured format
- Two output formats supported:
  - **CSV**: `device,register,value,unit,quality,timestamp`
  - **JSON**: Structured object with device grouping

### 3. Socket Communication
- **Linux/Unix**: Unix domain sockets (`/tmp/modbus.sock`)
- **Windows**: Named Pipes (`\\.\pipe\modbus`)
- Non-blocking writes with client management
- Automatic reconnection handling

### 4. Sensor-Publish Processing
- Connects to socket using `net.createConnection()`
- Reads streaming data into internal buffer
- Parses messages using configurable delimiters (default: newline)
- Batches messages based on size/time thresholds
- Publishes to MQTT as JSON arrays

### 5. MQTT Publishing
- Topic pattern: `iot/device/${uuid}/sensor/${topic}`
- Payload format:
```json
{
  "sensor": "modbus-sensor",
  "timestamp": "2025-10-27T10:30:15Z",
  "messages": [
    "device_001,temperature,23.5,°C,good,2025-10-27T10:30:00Z",
    "device_001,humidity,65.2,%,good,2025-10-27T10:30:00Z"
  ]
}
```

## Modbus Adapter

### Features
- **Protocol Support**: Modbus TCP, RTU, ASCII
- **Register Types**: Holding registers, input registers, coils, discrete inputs
- **Multi-Device**: Connect to multiple Modbus devices simultaneously
- **Data Validation**: Zod schema validation for all configurations
- **Error Handling**: Comprehensive error handling and retry logic
- **Logging**: Structured logging with configurable levels
- **Windows Compatible**: Native Named Pipes support

### Directory Structure
```
modbus-adapter/
├── src/
│   ├── index.ts              # CLI entry point and main coordination
│   ├── types.ts              # TypeScript schemas and types
│   ├── modbus-client.ts      # Modbus protocol communication
│   ├── socket-server.ts      # Socket server for data distribution
│   ├── modbus-adapter.ts     # Main coordinator
│   ├── config-loader.ts      # Configuration management
│   └── logger.ts             # Logging implementation
├── config/
│   ├── example.json          # Example configuration
│   └── windows.json          # Windows-specific configuration
├── package.json
├── tsconfig.json
└── README.md
```

### Installation
```bash
cd modbus-adapter
npm install
npm run build
```

### Usage
```bash
# Validate configuration
node dist/index.js --validate-config config/example.json

# Run adapter
node dist/index.js --config config/example.json

# Windows
node dist/index.js --config config/windows.json
```

## Sensor-Publish Integration

### Expected Data Format

Sensor-publish expects **simple string messages** separated by configurable delimiters:

```
device_001,temperature,23.5,°C,good,2025-10-27T10:30:00Z
device_001,humidity,65.2,%,good,2025-10-27T10:30:00Z
device_002,pressure,1013.25,hPa,good,2025-10-27T10:30:00Z
```

### Configuration Schema

```typescript
export const SensorConfigSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional().default(true),
  addr: z.string(),                    // Socket path
  addrPollSec: z.number().optional().default(10),
  publishInterval: z.number().optional().default(30000),
  bufferTimeMs: z.number().optional().default(0),
  bufferSize: z.number().optional().default(0),
  bufferCapacity: z.number().optional().default(128 * 1024),
  eomDelimiter: z.string(),            // End-of-message delimiter
  mqttTopic: z.string(),
  mqttHeartbeatTopic: z.string().optional(),
  heartbeatTimeSec: z.number().optional().default(300)
});
```

### Processing Logic

1. **Socket Connection**: Uses `net.createConnection(this.config.addr)`
2. **Buffer Management**: Accumulates incoming data in internal buffer
3. **Message Parsing**: Splits buffer using regex delimiter: `new RegExp(this.config.eomDelimiter, 'g')`
4. **Batching**: Collects messages until size/time threshold reached
5. **MQTT Publishing**: Publishes batched messages as JSON arrays

## Configuration

### Modbus Adapter Configuration

#### Linux/Unix Configuration (`config/example.json`)
```json
{
  "devices": [
    {
      "name": "device_001",
      "connection": {
        "type": "tcp",
        "host": "192.168.1.100",
        "port": 502,
        "unitId": 1
      },
      "registers": {
        "holdingRegisters": [
          {
            "name": "temperature",
            "address": 40001,
            "count": 1,
            "unit": "°C",
            "scaleFactor": 0.1
          },
          {
            "name": "humidity",
            "address": 40002,
            "count": 1,
            "unit": "%",
            "scaleFactor": 0.1
          }
        ]
      },
      "pollIntervalMs": 5000
    }
  ],
  "socketServer": {
    "socketPath": "/tmp/modbus.sock",
    "dataFormat": "csv",
    "includeTimestamp": true,
    "delimiter": "\n"
  },
  "logging": {
    "level": "info"
  }
}
```

#### Windows Configuration (`config/windows.json`)
```json
{
  "devices": [
    {
      "name": "device_001",
      "connection": {
        "type": "tcp",
        "host": "192.168.1.100",
        "port": 502,
        "unitId": 1
      },
      "registers": {
        "holdingRegisters": [
          {
            "name": "temperature",
            "address": 40001,
            "count": 1,
            "unit": "°C",
            "scaleFactor": 0.1
          }
        ]
      },
      "pollIntervalMs": 5000
    }
  ],
  "socketServer": {
    "socketPath": "\\\\.\\pipe\\modbus",
    "dataFormat": "csv",
    "includeTimestamp": true,
    "delimiter": "\n"
  },
  "logging": {
    "level": "info"
  }
}
```

### Agent Sensor-Publish Configuration

Add to your agent's target state JSON:

#### Linux/Unix
```json
{
  "sensors": [
    {
      "name": "modbus-sensor",
      "enabled": true,
      "addr": "/tmp/modbus.sock",
      "eomDelimiter": "\n",
      "mqttTopic": "sensors/modbus",
      "publishInterval": 30000,
      "bufferTimeMs": 5000,
      "bufferSize": 10,
      "addrPollSec": 10,
      "heartbeatTimeSec": 300
    }
  ]
}
```

#### Windows
```json
{
  "sensors": [
    {
      "name": "modbus-sensor",
      "enabled": true,
      "addr": "\\\\.\\pipe\\modbus",
      "eomDelimiter": "\n",
      "mqttTopic": "sensors/modbus",
      "publishInterval": 30000,
      "bufferTimeMs": 5000,
      "bufferSize": 10,
      "addrPollSec": 10,
      "heartbeatTimeSec": 300
    }
  ]
}
```

## Windows Compatibility

### Named Pipes vs Unix Sockets

| Platform | IPC Mechanism | Path Format | Example |
|----------|---------------|-------------|---------|
| Linux/Unix | Unix Domain Sockets | `/path/to/socket` | `/tmp/modbus.sock` |
| Windows | Named Pipes | `\\.\pipe\name` | `\\.\pipe\modbus` |

### Implementation Details

The Modbus adapter automatically detects the platform and uses appropriate socket mechanisms:

```typescript
// Cross-platform socket creation
const server = process.platform === 'win32' 
  ? net.createServer() // Named Pipes
  : net.createServer(); // Unix Domain Sockets

// Platform-specific socket path handling
const socketPath = process.platform === 'win32'
  ? '\\\\.\\pipe\\modbus'
  : '/tmp/modbus.sock';
```

### Windows-Specific Considerations

1. **Permissions**: Named Pipes typically don't require special permissions
2. **Path Format**: Must use `\\.\pipe\` prefix for Named Pipes
3. **File System**: No socket files created in file system
4. **Process Communication**: Works across different user sessions

## Testing and Validation

### 1. Configuration Validation
```bash
# Validate Modbus adapter config
cd modbus-adapter
node dist/index.js --validate-config config/example.json
```

### 2. Modbus Connection Testing
```bash
# Test Modbus connectivity
node dist/index.js --config config/example.json --test-connection
```

### 3. Socket Communication Testing

#### Linux/Unix
```bash
# Terminal 1: Start Modbus adapter
cd modbus-adapter
node dist/index.js --config config/example.json

# Terminal 2: Test socket connection
nc -U /tmp/modbus.sock
```

#### Windows PowerShell
```powershell
# Terminal 1: Start Modbus adapter
cd modbus-adapter
node dist/index.js --config config/windows.json

# Terminal 2: Test Named Pipe (requires custom tool or script)
# Named Pipes testing is more complex on Windows
```

### 4. End-to-End Testing

1. **Start MQTT Broker**: Ensure Mosquitto is running
2. **Start Agent**: Configure and run the agent with sensor-publish
3. **Start Modbus Adapter**: Run with appropriate configuration
4. **Monitor MQTT**: Subscribe to sensor topics to verify data flow

```bash
# Monitor MQTT messages
mosquitto_sub -t "iot/device/+/sensor/modbus"
```

### 5. Expected Data Flow Verification

**CSV Output from Modbus Adapter**:
```
device_001,temperature,23.5,°C,good,2025-10-27T10:30:00Z
device_001,humidity,65.2,%,good,2025-10-27T10:30:00Z
```

**MQTT Payload from Sensor-Publish**:
```json
{
  "sensor": "modbus-sensor",
  "timestamp": "2025-10-27T10:30:15Z",
  "messages": [
    "device_001,temperature,23.5,°C,good,2025-10-27T10:30:00Z",
    "device_001,humidity,65.2,%,good,2025-10-27T10:30:00Z"
  ]
}
```

## Troubleshooting

### Common Issues

#### 1. Socket Connection Failures

**Symptoms**:
- "ENOENT: no such file or directory" (Unix)
- "ENOENT: pipe not found" (Windows)

**Solutions**:
- Verify Modbus adapter is running and socket server started
- Check socket path configuration matches between adapter and sensor-publish
- Ensure permissions on socket file (Unix)
- Verify Named Pipe name format (Windows)

#### 2. Modbus Connection Issues

**Symptoms**:
- "Connection refused" errors
- Timeout errors
- Invalid response errors

**Solutions**:
- Verify Modbus device IP/port accessibility
- Check unit ID configuration
- Validate register addresses and types
- Test with Modbus testing tools (ModbusPoll, QModMaster)

#### 3. Data Format Mismatches

**Symptoms**:
- No MQTT messages despite socket connection
- Malformed MQTT payloads
- Parsing errors in sensor-publish logs

**Solutions**:
- Ensure Modbus adapter uses `"dataFormat": "csv"`
- Verify delimiter configuration (`"\n"`)
- Check eomDelimiter in sensor-publish config matches adapter output
- Monitor socket data format with debugging tools

#### 4. Windows-Specific Issues

**Symptoms**:
- "Path not found" errors
- Permission denied on Named Pipes

**Solutions**:
- Use correct Named Pipe format: `\\\\.\\pipe\\name`
- Run with appropriate permissions
- Check Windows firewall settings
- Verify Named Pipe creation in Process Monitor

### Debugging Commands

#### Check Socket Status (Linux)
```bash
# List open sockets
ss -l | grep modbus

# Check file permissions
ls -la /tmp/modbus.sock
```

#### Check Named Pipes (Windows)
```powershell
# List Named Pipes
Get-ChildItem \\.\pipe\

# Process Monitor for Named Pipe activity
# Use ProcMon.exe to monitor Named Pipe creation/access
```

#### MQTT Debugging
```bash
# Subscribe to all sensor topics
mosquitto_sub -v -t "iot/device/+/sensor/+"

# Monitor specific Modbus sensor
mosquitto_sub -v -t "iot/device/+/sensor/modbus"

# Check MQTT broker logs
docker logs mosquitto-container
```

#### Application Logs
```bash
# Modbus adapter logs (console output)
node dist/index.js --config config/example.json

# Agent logs (check agent log files)
tail -f /path/to/agent/logs/sensor-publish.log
```

### Performance Considerations

1. **Polling Intervals**: Balance between data freshness and system load
2. **Buffer Settings**: Configure appropriate buffer sizes for your data volume
3. **Socket Buffer**: Monitor socket buffer usage to prevent data loss
4. **MQTT QoS**: Choose appropriate QoS level for reliability vs performance
5. **Batch Sizes**: Optimize batch sizes for your use case

### Security Considerations

1. **Socket Permissions**: Restrict access to socket files (Unix)
2. **Network Security**: Secure Modbus TCP connections
3. **MQTT Authentication**: Use MQTT authentication and authorization
4. **Process Isolation**: Run services with minimal required privileges
5. **Data Encryption**: Consider encryption for sensitive data transmission

---

## Independent Agent Services Implementation

For production deployments and multi-protocol support, consider implementing independent protocol agent services. This section covers the migration path from the current adapter approach to a microservices architecture.

### Service Design Pattern

Each protocol agent follows the same design pattern established by the main agent:

```
protocol-agent/
├── src/
│   ├── index.ts              # Main entry point
│   ├── device-api/           # REST API (port 4848X)
│   │   ├── index.ts
│   │   ├── middleware/
│   │   └── routes/
│   │       ├── devices.ts    # GET /api/{protocol}/devices
│   │       ├── config.ts     # PUT /api/{protocol}/config
│   │       └── status.ts     # GET /api/{protocol}/status
│   ├── protocol/             # Protocol-specific implementation
│   │   ├── client.ts
│   │   ├── coordinator.ts
│   │   └── types.ts
│   ├── socket-server.ts      # Unix socket output (reused)
│   └── config-loader.ts      # Configuration management (reused)
```

### API Consistency Across Protocols

Each protocol agent exposes a consistent REST API pattern:

```typescript
// Common API endpoints for all protocol agents
GET    /api/{protocol}/devices      # List connected devices
GET    /api/{protocol}/status       # Connection status  
PUT    /api/{protocol}/config       # Update configuration
GET    /api/{protocol}/health       # Health check
POST   /api/{protocol}/scan         # Discover devices
DELETE /api/{protocol}/devices/{id} # Remove device
```

#### Modbus Agent API Examples
```bash
# List Modbus devices
curl http://localhost:48485/api/modbus/devices

# Get connection status
curl http://localhost:48485/api/modbus/status

# Update configuration
curl -X PUT http://localhost:48485/api/modbus/config \
  -H "Content-Type: application/json" \
  -d '{"devices": [...]}'

# Scan for new devices
curl -X POST http://localhost:48485/api/modbus/scan \
  -d '{"startAddress": 1, "endAddress": 247}'
```

### Container Orchestration

Each protocol agent can be deployed as an independent container:

```yaml
# docker-compose.yml
version: '3.8'
services:
  # Main agent (container orchestrator)
  agent:
    image: iotistic/agent:latest
    ports: ["48484:48484"]
    volumes: 
      - /tmp:/tmp
      - ./configs/agent.json:/config/agent.json
    
  # Protocol agents
  modbus-agent:
    image: iotistic/modbus-agent:latest
    ports: ["48485:48485"] 
    volumes: 
      - /tmp:/tmp
      - ./configs/modbus.json:/config/modbus.json
    environment:
      - PROTOCOL_AGENT_PORT=48485
      - SOCKET_PATH=/tmp/modbus.sock
    
  can-agent:
    image: iotistic/can-agent:latest
    ports: ["48486:48486"]
    volumes: 
      - /tmp:/tmp
      - ./configs/can.json:/config/can.json
    devices:
      - /dev/can0:/dev/can0
    environment:
      - PROTOCOL_AGENT_PORT=48486
      - SOCKET_PATH=/tmp/can.sock

  opcua-agent:
    image: iotistic/opcua-agent:latest
    ports: ["48487:48487"]
    volumes:
      - /tmp:/tmp
      - ./configs/opcua.json:/config/opcua.json
    environment:
      - PROTOCOL_AGENT_PORT=48487
      - SOCKET_PATH=/tmp/opcua.sock
```

### Service Discovery and Management

The main agent can discover and manage protocol agents:

```typescript
// Main agent service discovery
export class ProtocolAgentManager {
  private agents = new Map<string, ProtocolAgent>();

  async discoverAgents(): Promise<void> {
    const knownPorts = [48485, 48486, 48487, 48488, 48489];
    
    for (const port of knownPorts) {
      try {
        const response = await fetch(`http://localhost:${port}/api/health`);
        if (response.ok) {
          const agentInfo = await response.json();
          this.agents.set(agentInfo.protocol, {
            protocol: agentInfo.protocol,
            port,
            status: 'online',
            lastSeen: new Date()
          });
        }
      } catch (error) {
        // Agent not available
      }
    }
  }

  async getProtocolStatus(protocol: string): Promise<any> {
    const agent = this.agents.get(protocol);
    if (!agent) return null;
    
    try {
      const response = await fetch(`http://localhost:${agent.port}/api/${protocol}/status`);
      return await response.json();
    } catch (error) {
      return { status: 'offline', error: error.message };
    }
  }
}
```

### Migration Steps

#### Step 1: Extract Modbus Agent
```bash
# Create modbus-agent from existing modbus-adapter
cp -r modbus-adapter modbus-agent
cd modbus-agent

# Add device-api layer
mkdir -p src/device-api/{routes,middleware}

# Copy device-api structure from main agent
cp -r ../agent/src/device-api/* src/device-api/

# Update package.json
npm init --scope=@iotistic modbus-agent
```

#### Step 2: Add REST API Layer
```typescript
// src/device-api/routes/modbus.ts
import express from 'express';
import { ModbusAdapter } from '../../modbus-adapter';

const router = express.Router();

router.get('/devices', async (req, res) => {
  const devices = await modbusAdapter.getDevices();
  res.json(devices);
});

router.get('/status', async (req, res) => {
  const status = await modbusAdapter.getStatus();
  res.json(status);
});

router.put('/config', async (req, res) => {
  await modbusAdapter.updateConfig(req.body);
  res.json({ success: true });
});

export default router;
```

#### Step 3: Update Main Agent Sensor Configuration
```json
{
  "sensors": [
    {
      "name": "modbus-data",
      "addr": "/tmp/modbus.sock",
      "eomDelimiter": "\n", 
      "mqttTopic": "sensors/modbus",
      "agentPort": 48485,
      "agentProtocol": "modbus"
    },
    {
      "name": "can-data", 
      "addr": "/tmp/can.sock",
      "eomDelimiter": "\n",
      "mqttTopic": "sensors/can",
      "agentPort": 48486,
      "agentProtocol": "can"
    }
  ]
}
```

#### Step 4: Health Monitoring Integration
```typescript
// Main agent monitors protocol agents
export class ProtocolAgentHealthCheck {
  async checkProtocolAgents(): Promise<HealthStatus[]> {
    const agents = await this.protocolManager.discoverAgents();
    const healthChecks = [];
    
    for (const [protocol, agent] of agents) {
      try {
        const status = await fetch(`http://localhost:${agent.port}/api/health`);
        healthChecks.push({
          service: `${protocol}-agent`,
          status: status.ok ? 'healthy' : 'unhealthy',
          port: agent.port,
          lastCheck: new Date()
        });
      } catch (error) {
        healthChecks.push({
          service: `${protocol}-agent`,
          status: 'offline',
          port: agent.port,
          error: error.message,
          lastCheck: new Date()
        });
      }
    }
    
    return healthChecks;
  }
}
```

### Benefits Summary

The independent agent services architecture provides:

1. **Fault Isolation**: Protocol-specific failures don't affect other protocols or the main agent
2. **Scalability**: Each protocol agent can be scaled independently based on device load
3. **Development Velocity**: Teams can work on different protocols without conflicts
4. **Deployment Flexibility**: Deploy only the protocol agents needed for your environment
5. **Resource Optimization**: Right-size container resources for each protocol's requirements
6. **Monitoring Granularity**: Protocol-specific metrics and health monitoring
7. **Version Independence**: Update protocol agents independently without system-wide downtime

This architecture maintains the same data flow through the sensor-publish system while providing better operational characteristics for production deployments.

---

## Summary

This integration guide covers both the direct adapter approach for simple deployments and the independent agent services architecture for production environments. The Modbus adapter provides a solid foundation that can be extended to support additional industrial protocols while maintaining a consistent data flow to your IoT platform.

Key benefits:
- **Cross-platform compatibility** (Linux, Unix, Windows)
- **Multiple Modbus protocol support** (TCP, RTU, ASCII)
- **Flexible data formatting** (CSV, JSON)
- **Robust error handling** and reconnection logic
- **Seamless integration** with existing IoT platform components
- **Comprehensive logging** and debugging capabilities
- **Scalable architecture** supporting multiple protocols

The system is designed to be reliable, maintainable, and easily configurable for various industrial IoT scenarios.