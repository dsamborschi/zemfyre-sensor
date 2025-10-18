# BME688 Sensor Simulator

Simulates multiple BME688 environmental sensors writing data to Unix domain sockets. Perfect for testing the sensor publish feature without physical hardware.

## Features

- ✅ Generates realistic BME688 sensor data (temperature, humidity, pressure, gas resistance)
- ✅ Supports multiple sensors with independent data streams
- ✅ Unix domain socket communication
- ✅ Simulates sensor failures and automatic recovery
- ✅ Configurable via environment variables
- ✅ JSON or CSV output formats
- ✅ Realistic data drift and noise

## Quick Start

### With Docker Compose

```bash
# Start simulator with agent
docker-compose -f docker-compose.dev.yml up sensor-simulator agent

# View logs
docker-compose logs -f sensor-simulator
```

### Standalone

```bash
# Install dependencies
npm install

# Run simulator
node simulator.js

# Or with custom config
NUM_SENSORS=5 PUBLISH_INTERVAL_MS=30000 node simulator.js
```

## Configuration

All settings are configurable via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `NUM_SENSORS` | `3` | Number of simulated sensors |
| `SOCKET_DIR` | `/tmp/sensors` | Directory for Unix sockets |
| `PUBLISH_INTERVAL_MS` | `60000` | Data publish interval (1 minute) |
| `ENABLE_FAILURES` | `true` | Enable random sensor failures |
| `FAILURE_CHANCE` | `0.05` | Failure probability per interval (5%) |
| `RECONNECT_DELAY_MS` | `10000` | Delay before recovery (10 seconds) |
| `DATA_FORMAT` | `json` | Output format: `json` or `csv` |
| `EOM_DELIMITER` | `\n` | End-of-message delimiter |
| `LOG_LEVEL` | `info` | Logging level: `debug`, `info`, `warn`, `error` |

## Data Format

### JSON (Default)

```json
{"sensor_name":"sensor1","temperature":23.45,"humidity":45.67,"pressure":1013.25,"gas_resistance":245678,"timestamp":"2025-10-18T10:30:00.000Z"}
```

### CSV

```csv
sensor1,23.45,45.67,1013.25,245678,2025-10-18T10:30:00.000Z
```

## Socket Paths

Sockets are created at:
- `/tmp/sensors/sensor1.sock`
- `/tmp/sensors/sensor2.sock`
- `/tmp/sensors/sensor3.sock`
- ... (up to `NUM_SENSORS`)

## Testing Connection

```bash
# Connect to socket with netcat
nc -U /tmp/sensors/sensor1.sock

# Or with socat
socat - UNIX-CONNECT:/tmp/sensors/sensor1.sock
```

## Integration with Agent

Update your agent's `SENSOR_PUBLISH_CONFIG`:

```json
{
  "sensors": [
    {
      "name": "sensor1",
      "addr": "/tmp/sensors/sensor1.sock",
      "eomDelimiter": "\\n",
      "mqttTopic": "sensor/data",
      "bufferSize": 100,
      "bufferTimeMs": 1000
    },
    {
      "name": "sensor2",
      "addr": "/tmp/sensors/sensor2.sock",
      "eomDelimiter": "\\n",
      "mqttTopic": "sensor/data",
      "bufferSize": 100,
      "bufferTimeMs": 1000
    },
    {
      "name": "sensor3",
      "addr": "/tmp/sensors/sensor3.sock",
      "eomDelimiter": "\\n",
      "mqttTopic": "sensor/data",
      "bufferSize": 100,
      "bufferTimeMs": 1000
    }
  ]
}
```

## Failure Simulation

When `ENABLE_FAILURES=true`:
- Random failures occur with `FAILURE_CHANCE` probability each interval
- Sensor goes offline (socket closes)
- All clients disconnected
- After `RECONNECT_DELAY_MS`, sensor automatically recovers
- Socket reopens and data flow resumes

Example log during failure:
```
2025-10-18T10:30:00.000Z ⚠️  [sensor2] ⚠️  SIMULATED FAILURE - Sensor offline
2025-10-18T10:30:10.000Z 📡 [sensor2] ♻️  Recovering from failure...
2025-10-18T10:30:10.125Z 📡 [sensor2] Socket listening: /tmp/sensors/sensor2.sock
2025-10-18T10:30:10.126Z 📡 [sensor2] ✅ Recovery successful
```

## Sensor Data Characteristics

- **Temperature**: 20-30°C with realistic drift and noise
- **Humidity**: 40-60% RH with variations
- **Pressure**: 1000-1030 hPa with atmospheric changes
- **Gas Resistance**: 100k-300k Ω (VOC/air quality indicator)
- **Drift**: Slow changes over time to simulate real environmental conditions
- **Noise**: Small random variations on each reading

## Troubleshooting

### Socket Permission Denied
```bash
# Ensure socket directory is writable
chmod 777 /tmp/sensors
```

### Socket Already in Use
```bash
# Remove stale socket files
rm /tmp/sensors/*.sock
```

### No Data Received
```bash
# Check if simulator is running
docker-compose ps sensor-simulator

# View logs
docker-compose logs sensor-simulator

# Verify socket exists
ls -la /tmp/sensors/
```

## Development

```bash
# Install nodemon for hot reload
npm install

# Run in dev mode
npm run dev

# Build Docker image
docker build -t sensor-simulator .

# Run container
docker run -v sensor-sockets:/tmp/sensors sensor-simulator
```

## Architecture

```
┌─────────────────────────────────────┐
│     Sensor Simulator Container      │
│                                     │
│  ┌──────────┐  ┌──────────┐        │
│  │ Sensor 1 │  │ Sensor 2 │  ...   │
│  └────┬─────┘  └────┬─────┘        │
│       │             │               │
│       ▼             ▼               │
│  sensor1.sock  sensor2.sock         │
└───────┬─────────────┬───────────────┘
        │             │
        │  Shared Volume
        ▼             ▼
┌───────┴─────────────┴───────────────┐
│         Agent Container             │
│                                     │
│  Reads from Unix sockets            │
│  Publishes to MQTT                  │
└─────────────────────────────────────┘
```

## License

MIT
