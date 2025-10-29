# Modbus Adapter Integration Guide

## 🎯 Overview

This guide shows how to integrate the Modbus adapter with your existing Iotistic sensor-publish system.

## 🏗️ Architecture

```
Modbus Devices → Modbus Adapter → Unix Socket → Agent Sensor-Publish → MQTT → Cloud
```

## 📋 Integration Steps

### 1. Install Modbus Adapter

```bash
cd modbus-adapter
npm install
npm run build
```

### 2. Configure Modbus Devices

Create `config/modbus.json`:

```json
{
  "devices": [
    {
      "name": "bme688-modbus",
      "slaveId": 1,
      "connection": {
        "type": "tcp",
        "host": "192.168.1.100",
        "port": 502
      },
      "registers": [
        {
          "name": "temperature",
          "address": 40001,
          "functionCode": 3,
          "dataType": "float32",
          "count": 2,
          "unit": "°C"
        },
        {
          "name": "humidity", 
          "address": 40003,
          "functionCode": 3,
          "dataType": "float32",
          "count": 2,
          "unit": "%"
        },
        {
          "name": "pressure",
          "address": 40005,
          "functionCode": 3,
          "dataType": "float32",
          "count": 2,
          "unit": "hPa"
        },
        {
          "name": "gas_resistance",
          "address": 40007,
          "functionCode": 3,
          "dataType": "uint32",
          "count": 2,
          "unit": "Ω"
        }
      ],
      "pollInterval": 5000
    }
  ],
  "output": {
    "socketPath": "/tmp/sensors/modbus.sock",
    "dataFormat": "json",
    "delimiter": "\n"
  }
}
```

### 3. Update Agent Configuration

Add Modbus socket to your agent's sensor-publish configuration:

```json
{
  "sensors": [
    {
      "name": "modbus-sensors",
      "addr": "/tmp/sensors/modbus.sock",
      "eomDelimiter": "\\n",
      "mqttTopic": "sensor/modbus",
      "bufferSize": 50,
      "bufferTimeMs": 5000,
      "qos": 1
    }
  ]
}
```

### 4. Update Docker Compose

Modify your `docker-compose.yml` to include the Modbus adapter:

```yaml
version: '3.8'

services:
  modbus-adapter:
    build: ./modbus-adapter
    container_name: modbus-adapter
    volumes:
      - ./modbus-adapter/config:/app/config:ro
      - sensor-sockets:/tmp/sensors
    environment:
      - LOG_LEVEL=info
    networks:
      - iotistic-net
    restart: unless-stopped

  agent:
    image: iotistic/agent:latest
    depends_on:
      - modbus-adapter
      - mosquitto
    volumes:
      - sensor-sockets:/tmp/sensors
    environment:
      - ENABLE_SENSOR_PUBLISH=true
      - MQTT_BROKER=mqtt://mosquitto:1883
      - SENSOR_PUBLISH_CONFIG={"sensors":[{"name":"modbus-sensors","addr":"/tmp/sensors/modbus.sock","eomDelimiter":"\\n","mqttTopic":"sensor/modbus","bufferSize":50,"bufferTimeMs":5000}]}
    networks:
      - iotistic-net
    restart: unless-stopped

  mosquitto:
    image: eclipse-mosquitto:2.0
    ports:
      - "1883:1883"
    networks:
      - iotistic-net

volumes:
  sensor-sockets:

networks:
  iotistic-net:
    driver: bridge
```

### 5. Expected Data Flow

#### Modbus Adapter Output
```json
{
  "timestamp": "2025-01-15T14:30:45.123Z",
  "devices": {
    "bme688-modbus": {
      "temperature": {
        "value": 23.5,
        "unit": "°C",
        "quality": "good",
        "timestamp": "2025-01-15T14:30:45.120Z"
      },
      "humidity": {
        "value": 65.2,
        "unit": "%",
        "quality": "good",
        "timestamp": "2025-01-15T14:30:45.120Z"
      }
    }
  }
}
```

#### Agent MQTT Publish
```json
{
  "sensorId": "modbus-sensors",
  "timestamp": "2025-01-15T14:30:45.125Z",
  "messageCount": 1,
  "messages": [
    "{\"timestamp\":\"2025-01-15T14:30:45.123Z\",\"devices\":{\"bme688-modbus\":{\"temperature\":{\"value\":23.5,\"unit\":\"°C\",\"quality\":\"good\"}}}}"
  ]
}
```

## 🚀 Deployment

### Development Mode

```bash
# Terminal 1: Start services
docker-compose up -d mosquitto

# Terminal 2: Start Modbus adapter
cd modbus-adapter
npm run dev -- --config config/modbus.json

# Terminal 3: Start agent
cd ../agent
npm run dev
```

### Production Mode

```bash
# Build and start all services
docker-compose up -d
```

## 🔧 Configuration Examples

### Serial RTU Device

```json
{
  "devices": [
    {
      "name": "serial-sensor",
      "slaveId": 1,
      "connection": {
        "type": "rtu",
        "serialPort": "/dev/ttyUSB0",
        "baudRate": 9600,
        "dataBits": 8,
        "stopBits": 1,
        "parity": "none"
      },
      "registers": [
        {
          "name": "temperature",
          "address": 30001,
          "functionCode": 4,
          "dataType": "int16",
          "scale": 0.1,
          "unit": "°C"
        }
      ],
      "pollInterval": 10000
    }
  ]
}
```

### Multiple Devices

```json
{
  "devices": [
    {
      "name": "temperature-controller",
      "slaveId": 1,
      "connection": {
        "type": "tcp",
        "host": "192.168.1.100",
        "port": 502
      },
      "registers": [
        {
          "name": "setpoint",
          "address": 40001,
          "functionCode": 3,
          "dataType": "float32",
          "count": 2,
          "unit": "°C"
        },
        {
          "name": "actual_temp",
          "address": 40003,
          "functionCode": 3,
          "dataType": "float32", 
          "count": 2,
          "unit": "°C"
        }
      ],
      "pollInterval": 2000
    },
    {
      "name": "flow-meter",
      "slaveId": 2,
      "connection": {
        "type": "tcp",
        "host": "192.168.1.101",
        "port": 502
      },
      "registers": [
        {
          "name": "flow_rate",
          "address": 30001,
          "functionCode": 4,
          "dataType": "uint32",
          "count": 2,
          "scale": 0.001,
          "unit": "L/min"
        }
      ],
      "pollInterval": 5000
    }
  ]
}
```

## 📊 Monitoring & Troubleshooting

### Check Socket Connection

```bash
# List active sockets
ss -x | grep modbus

# Monitor socket data
nc -U /tmp/sensors/modbus.sock

# Check if socket file exists
ls -la /tmp/sensors/
```

### Check Modbus Communication

```bash
# Test TCP connection
telnet 192.168.1.100 502

# Check serial device
ls -la /dev/ttyUSB*

# View adapter logs
docker logs modbus-adapter -f
```

### Agent Integration Check

```bash
# Check agent logs
docker logs iotistic-agent -f

# Check MQTT messages
mosquitto_sub -h localhost -t "sensor/modbus"

# Verify sensor-publish feature
curl http://localhost:48484/v2/features/sensor-publish/status
```

## 🔍 Testing

### Mock Modbus Server

```bash
cd modbus-adapter
node test.js
```

This creates a mock Modbus TCP server on port 5020 for testing.

### Integration Test

```bash
# Start all services
docker-compose up -d

# Check modbus adapter health
curl http://localhost:8080/health  # if health endpoint added

# Monitor data flow
mosquitto_sub -h localhost -t "sensor/modbus" -v
```

## 🛠️ Common Issues

### Permission Denied on Serial Port

```bash
# Add user to dialout group
sudo usermod -a -G dialout $USER

# Set permissions
sudo chmod 666 /dev/ttyUSB0
```

### Socket File Not Created

- Check adapter logs for errors
- Verify directory permissions
- Ensure no other process is using the socket path

### Modbus Connection Failed

- Verify network connectivity
- Check device IP and port
- Confirm Modbus settings (slave ID, function codes)
- Test with Modbus client tools

### Agent Not Reading Socket

- Verify socket path in agent config
- Check agent sensor-publish logs
- Ensure delimiter matches (`\\n`)
- Verify agent has read permissions

## 📈 Performance Tuning

### Polling Intervals

- Slower devices: 10-30 seconds
- Fast sensors: 1-5 seconds
- Balance between data freshness and system load

### Buffer Settings

```json
{
  "bufferSize": 100,     // Messages per batch
  "bufferTimeMs": 5000   // Time-based batching
}
```

### Connection Timeouts

```json
{
  "timeout": 5000,       // Connection timeout
  "retryAttempts": 3,    // Retry count
  "retryDelay": 1000     // Delay between retries
}
```

This integration provides a robust bridge between Modbus devices and your existing sensor-publish infrastructure!