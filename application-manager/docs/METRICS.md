# System Metrics Module

## Overview

Added hardware metrics monitoring to container-manager, inspired by balena-supervisor's system-info module.

## Installation

```bash
npm install
```

New dependency: `systeminformation@^5.23.5`

## API Endpoint

### GET /api/v1/metrics

Returns real-time system hardware metrics.

**Response Example:**

```json
{
  "cpu_usage": 45,
  "cpu_temp": 52,
  "cpu_cores": 4,
  "memory_usage": 512,
  "memory_total": 2048,
  "memory_percent": 25,
  "storage_usage": 1024,
  "storage_total": 16384,
  "storage_percent": 6,
  "uptime": 86400,
  "uptime_formatted": "1d",
  "hostname": "raspberry-pi",
  "is_undervolted": false,
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

## Features

### Metrics Collected

1. **CPU Metrics**
   - `cpu_usage`: Average CPU usage across all cores (0-100%)
   - `cpu_temp`: CPU temperature in Celsius (null if unavailable)
   - `cpu_cores`: Number of CPU cores

2. **Memory Metrics**
   - `memory_usage`: Used memory in MB (excluding cache/buffers)
   - `memory_total`: Total memory in MB
   - `memory_percent`: Memory usage percentage

3. **Storage Metrics**
   - `storage_usage`: Used storage in MB
   - `storage_total`: Total storage in MB
   - `storage_percent`: Storage usage percentage
   - Searches for `/data` partition first, falls back to root `/`

4. **System Info**
   - `uptime`: System uptime in seconds
   - `uptime_formatted`: Human-readable uptime (e.g., "1d 5h 30m")
   - `hostname`: System hostname

5. **Health Checks**
   - `is_undervolted`: Detects undervoltage on Raspberry Pi (via dmesg)

6. **Metadata**
   - `timestamp`: When metrics were collected

## Usage

### cURL

```bash
# Get metrics
curl http://localhost:3002/api/v1/metrics
```

### JavaScript/TypeScript

```typescript
import * as systemMetrics from './system-metrics';

// Get all metrics
const metrics = await systemMetrics.getSystemMetrics();

// Get individual metrics
const cpuUsage = await systemMetrics.getCpuUsage();
const memInfo = await systemMetrics.getMemoryInfo();
const temp = await systemMetrics.getCpuTemp();
```

## Implementation Details

### Based on Balena Supervisor

Adapted from: `balena-supervisor/src/lib/system-info.ts`

Key differences from balena:
- **Simplified**: Removed DMI decode, system ID detection
- **Focused**: Core metrics only (CPU, memory, storage, temp)
- **Standalone**: Works independently without balenaOS dependencies
- **Fast**: All metrics gathered in parallel using `Promise.all`

### Platform Support

- ✅ **Linux**: Full support (Raspberry Pi, Ubuntu, Debian, etc.)
- ✅ **macOS**: Partial support (no temp, no undervoltage)
- ✅ **Windows**: Partial support (no temp, no undervoltage)

### Performance

- Metrics gathered in **parallel** for speed
- Typical response time: **100-300ms**
- Safe to call frequently (e.g., every 30 seconds)

## Monitoring Dashboard

You can poll this endpoint to build a monitoring dashboard:

```typescript
// Poll metrics every 30 seconds
setInterval(async () => {
  const response = await fetch('http://localhost:3002/api/v1/metrics');
  const metrics = await response.json();
  
  console.log(`CPU: ${metrics.cpu_usage}% | Temp: ${metrics.cpu_temp}°C`);
  console.log(`Memory: ${metrics.memory_percent}%`);
  console.log(`Storage: ${metrics.storage_percent}%`);
}, 30000);
```

## Error Handling

If metrics collection fails (e.g., permissions issue), the endpoint returns:

```json
{
  "error": "Failed to get system metrics",
  "message": "..."
}
```

Individual metric functions return safe defaults on error:
- CPU: 0%
- Memory: 0 MB
- Temperature: null
- Undervoltage: false

## Future Enhancements

Potential additions:
- Network I/O metrics
- Disk I/O metrics
- Container-specific metrics (per-container CPU/memory)
- Metrics history/trending
- Alert thresholds

## Files Added

- `src/system-metrics.ts` - Core metrics module
- Updated `src/api/server.ts` - Added `/api/v1/metrics` endpoint
- Updated `package.json` - Added systeminformation dependency
