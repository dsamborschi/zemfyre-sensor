# Modbus to Unix Socket Adapter

A robust Modbus sensor adapter that reads data from Modbus devices (TCP, RTU, ASCII) and forwards it to Unix domain sockets for integration with your existing sensor-publish system.

## ✨ Features

- **Multiple Modbus Protocols**: TCP, RTU, ASCII support
- **Flexible Data Types**: INT16, UINT16, INT32, UINT32, FLOAT32, BOOLEAN, STRING
- **Unix Socket Output**: Compatible with existing sensor-publish infrastructure
- **Real-time Monitoring**: Device status tracking and error handling
- **Configurable Polling**: Per-device polling intervals
- **Auto-reconnection**: Automatic retry on connection failures
- **Multiple Output Formats**: JSON and CSV data formats
- **TypeScript**: Full type safety and validation

## 🚀 Quick Start

### Installation

```bash
cd modbus-adapter
npm install
```

### Generate Example Configuration

```bash
npm run dev -- --example-config config/example.json
```

### Run with Configuration

```bash
# Development mode
npm run dev -- --config config/modbus.json

# Production mode
npm run build
npm start -- --config config/modbus.json
```

## 📁 Configuration

### Example Configuration File

```json
{
  "devices": [
    {
      "name": "temperature-sensor",
      "slaveId": 1,
      "connection": {
        "type": "tcp",
        "host": "192.168.1.100",
        "port": 502,
        "timeout": 5000,
        "retryAttempts": 3,
        "retryDelay": 1000
      },
      "registers": [
        {
          "name": "temperature",
          "address": 40001,
          "functionCode": 3,
          "dataType": "float32",
          "count": 2,
          "endianness": "big",
          "scale": 0.1,
          "offset": 0,
          "unit": "°C",
          "description": "Temperature reading"
        }
      ],
      "pollInterval": 5000,
      "enabled": true
    }
  ],
  "output": {
    "socketPath": "/tmp/sensors/modbus.sock",
    "dataFormat": "json",
    "delimiter": "\n",
    "includeTimestamp": true,
    "includeDeviceName": true
  },
  "logging": {
    "level": "info",
    "enableConsole": true,
    "enableFile": false
  }
}
```

### Connection Types

#### TCP Connection
```json
{
  "type": "tcp",
  "host": "192.168.1.100",
  "port": 502,
  "timeout": 5000
}
```

#### RTU Connection
```json
{
  "type": "rtu",
  "serialPort": "/dev/ttyUSB0",
  "baudRate": 9600,
  "dataBits": 8,
  "stopBits": 1,
  "parity": "none",
  "timeout": 5000
}
```

#### ASCII Connection
```json
{
  "type": "ascii",
  "serialPort": "/dev/ttyUSB0",
  "baudRate": 9600,
  "dataBits": 8,
  "stopBits": 1,
  "parity": "none",
  "timeout": 5000
}
```

### Register Configuration

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Register identifier |
| `address` | number | Modbus register address |
| `functionCode` | 1\|2\|3\|4 | Modbus function code |
| `dataType` | string | Data interpretation type |
| `count` | number | Number of registers to read |
| `endianness` | 'big'\|'little' | Byte order for multi-register types |
| `scale` | number | Scaling factor |
| `offset` | number | Offset value |
| `unit` | string | Unit of measurement |

### Function Codes

| Code | Description |
|------|-------------|
| 1 | Read Coils |
| 2 | Read Discrete Inputs |
| 3 | Read Holding Registers |
| 4 | Read Input Registers |

### Data Types

| Type | Description | Registers |
|------|-------------|-----------|
| `int16` | Signed 16-bit integer | 1 |
| `uint16` | Unsigned 16-bit integer | 1 |
| `int32` | Signed 32-bit integer | 2 |
| `uint32` | Unsigned 32-bit integer | 2 |
| `float32` | 32-bit floating point | 2 |
| `boolean` | Boolean value | 1 |
| `string` | ASCII string | Variable |

## 🔌 Integration with Sensor-Publish

The adapter outputs data to Unix sockets in a format compatible with your existing sensor-publish system:

### JSON Output Format
```json
{
  "timestamp": "2025-01-15T14:30:45.123Z",
  "devices": {
    "temperature-sensor": {
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

### CSV Output Format
```csv
temperature-sensor,temperature,23.5,°C,good,2025-01-15T14:30:45.120Z
temperature-sensor,humidity,65.2,%,good,2025-01-15T14:30:45.120Z
```

### Agent Configuration

Update your agent's sensor-publish configuration to include the Modbus socket:

```json
{
  "sensors": [
    {
      "name": "modbus-sensors",
      "addr": "/tmp/sensors/modbus.sock",
      "eomDelimiter": "\\n",
      "mqttTopic": "sensor/modbus",
      "bufferSize": 100,
      "bufferTimeMs": 1000
    }
  ]
}
```

## 📊 Monitoring

### Device Status

The adapter provides real-time device status monitoring:

```typescript
const adapter = new ModbusAdapter(config, logger);
const statuses = adapter.getDeviceStatuses();

statuses.forEach(status => {
  console.log(`${status.deviceName}: ${status.connected ? 'Connected' : 'Disconnected'}`);
  console.log(`Last poll: ${status.lastPoll}`);
  console.log(`Errors: ${status.errorCount}`);
});
```

### Event Monitoring

```typescript
adapter.on('device-connected', (deviceName) => {
  console.log(`Device ${deviceName} connected`);
});

adapter.on('device-error', (deviceName, error) => {
  console.log(`Device ${deviceName} error: ${error.message}`);
});

adapter.on('data-received', (deviceName, dataPoints) => {
  console.log(`Received ${dataPoints.length} data points from ${deviceName}`);
});
```

## 🔧 CLI Usage

```bash
# Generate example config
./modbus-adapter --example-config config.json

# Validate configuration
./modbus-adapter --validate-config config.json

# Run with config file
./modbus-adapter --config config.json --log-level debug

# Run with environment variable
export MODBUS_ADAPTER_CONFIG='{"devices":[...]}'
./modbus-adapter
```

## 🐳 Docker Integration

### Dockerfile Example

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY config/ ./config/

EXPOSE 502
CMD ["node", "dist/index.js", "--config", "config/modbus.json"]
```

### Docker Compose Integration

```yaml
services:
  modbus-adapter:
    build: ./modbus-adapter
    volumes:
      - ./config/modbus.json:/app/config/modbus.json:ro
      - sensor-sockets:/tmp/sensors
    networks:
      - iotistic-net
    restart: unless-stopped

  agent:
    depends_on:
      - modbus-adapter
    volumes:
      - sensor-sockets:/tmp/sensors
    environment:
      SENSOR_PUBLISH_CONFIG: |
        {
          "sensors": [
            {
              "name": "modbus-sensors",
              "addr": "/tmp/sensors/modbus.sock",
              "eomDelimiter": "\\n",
              "mqttTopic": "sensor/modbus"
            }
          ]
        }

volumes:
  sensor-sockets:

networks:
  iotistic-net:
    driver: bridge
```

## 🔧 Development

### Build

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### Testing

```bash
npm test
```

### Watch Mode

```bash
npm run watch
```

## 📝 Examples

### Industrial Temperature Monitor

```json
{
  "devices": [
    {
      "name": "furnace-temp",
      "slaveId": 1,
      "connection": {
        "type": "tcp",
        "host": "192.168.1.10",
        "port": 502
      },
      "registers": [
        {
          "name": "temperature",
          "address": 40001,
          "functionCode": 3,
          "dataType": "int16",
          "scale": 0.1,
          "unit": "°C"
        }
      ],
      "pollInterval": 1000
    }
  ]
}
```

### Environmental Monitoring Station

```json
{
  "devices": [
    {
      "name": "weather-station",
      "slaveId": 2,
      "connection": {
        "type": "rtu",
        "serialPort": "/dev/ttyUSB0",
        "baudRate": 9600
      },
      "registers": [
        {
          "name": "temperature",
          "address": 30001,
          "functionCode": 4,
          "dataType": "float32",
          "count": 2,
          "unit": "°C"
        },
        {
          "name": "humidity",
          "address": 30003,
          "functionCode": 4,
          "dataType": "float32",
          "count": 2,
          "unit": "%"
        },
        {
          "name": "pressure",
          "address": 30005,
          "functionCode": 4,
          "dataType": "uint32",
          "count": 2,
          "scale": 0.001,
          "unit": "bar"
        }
      ],
      "pollInterval": 5000
    }
  ]
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/dsamborschi/zemfyre-sensor/issues)
- Documentation: See `docs/` directory
- Examples: See `examples/` directory