# Default Agent Behavior (No Target State)

## Overview

When a device is provisioned but **no target state is set in the cloud**, the agent operates with default fallback behavior.

---

## What Happens By Default

### 1. **Target State Polling** ✅ Active

```typescript
// Agent polls cloud every 10 seconds
pollInterval: 10000ms (10 seconds)
```

**API Response (No Target State):**
```json
{
  "<device-uuid>": {
    "apps": {},
    "config": {}
  }
}
```

### 2. **State Reporting** ✅ Active

```typescript
// Agent reports state every 10 seconds
reportInterval: 10000ms (10 seconds)
```

**What Gets Reported:**
```json
{
  "<device-uuid>": {
    "apps": {},           // Empty (no containers running)
    "config": {},         // Empty (no config set)
    "is_online": true     // Connection status
  }
}
```

### 3. **Metrics Reporting** ✅ Active (Every 5 Minutes)

```typescript
// Agent includes metrics in state report every 5 minutes
metricsInterval: 300000ms (5 minutes)
```

**Metrics Included:**
- `cpu_usage` - CPU utilization percentage
- `memory_usage` - RAM used (bytes)
- `memory_total` - Total RAM (bytes)
- `storage_usage` - Disk used (bytes)
- `storage_total` - Total disk (bytes)
- `temperature` - CPU temperature (°C)
- `uptime` - System uptime (seconds)
- `local_ip` - Primary IP address
- `os_version` - Operating system version (only if changed)
- `agent_version` - Agent version (only if changed)
- `top_processes` - Top 5 processes by CPU/memory

**Why 5 Minutes?**
- Balances visibility with bandwidth usage
- Reduces API load (12 reports/hour vs 360/hour)
- Sufficient for monitoring dashboards
- Can be overridden via target state config

---

## Timeline Example

```
T=0s:    Agent starts, provisions with cloud
T=5s:    First target state poll → empty state received
T=10s:   State report sent (no metrics yet)
T=15s:   Target state poll (304 Not Modified)
T=20s:   State report sent (no metrics yet)
T=300s:  State report sent WITH METRICS 📊
T=600s:  State report sent WITH METRICS 📊
```

---

## Why No Metrics Initially?

The agent follows this logic:

```typescript
const timeSinceLastMetrics = now - this.lastMetricsTime;
const includeMetrics = timeSinceLastMetrics >= this.config.metricsInterval;

if (includeMetrics) {
  // Collect and include metrics (CPU, memory, etc.)
  this.lastMetricsTime = now;
}
```

**Result:**
- First report at T=10s: No metrics (only 10s elapsed)
- First report at T=300s: **Includes metrics** (5 minutes elapsed)

---

## How to Enable Immediate Metrics

### Option 1: Set Target State with Config

Use the PowerShell script to set a default target state:

```powershell
cd api/scripts/state
./set-default-target-state.ps1 -DeviceUuid <uuid> -MetricsInterval 60
```

**Target State Created:**
```json
{
  "apps": {},
  "config": {
    "IOTISTIC_METRICS_ENABLED": "true",
    "IOTISTIC_METRICS_INTERVAL": "60",
    "IOTISTIC_LOG_LEVEL": "info",
    "IOTISTIC_HEARTBEAT_INTERVAL": "30"
  }
}
```

**Agent Response:**
- Polls target state within 10 seconds
- Applies new config
- **Reports metrics every 60 seconds** (instead of 300s)

### Option 2: Update Target State Manually

```powershell
# Via PowerShell
$targetState = @{
    apps = @{}
    config = @{
        IOTISTIC_METRICS_INTERVAL = "60"  # 60 seconds
    }
}

Invoke-RestMethod `
    -Uri "http://a18ada74.localhost/api/v1/devices/<uuid>/target-state" `
    -Method POST `
    -ContentType "application/json" `
    -Body ($targetState | ConvertTo-Json)
```

### Option 3: Environment Variable Override

```bash
# Start agent with custom metrics interval
METRICS_INTERVAL_MS=60000 npm run dev  # 60 seconds
```

---

## Default Configuration Summary

| Feature | Default State | Default Interval | Configurable Via |
|---------|--------------|------------------|------------------|
| **Target State Polling** | ✅ Enabled | 10s | `POLL_INTERVAL_MS` env var |
| **State Reporting** | ✅ Enabled | 10s | `REPORT_INTERVAL_MS` env var |
| **Metrics Reporting** | ✅ Enabled | 5min (300s) | `METRICS_INTERVAL_MS` env var or target state config |
| **Container Orchestration** | ✅ Enabled | Continuous | N/A |
| **MQTT Connection** | ✅ Enabled | Continuous | Provisioning response |
| **Cloud Logging** | ⚠️ Disabled | N/A | `ENABLE_CLOUD_LOGS=true` |
| **Sensor Publishing** | ⚠️ Disabled | N/A | `ENABLE_SENSOR_PUBLISH=true` |
| **Job Engine** | ⚠️ Disabled | N/A | `ENABLE_JOB_ENGINE=true` |
| **Digital Twin** | ⚠️ Disabled | N/A | `ENABLE_DIGITAL_TWIN=true` |

---

## Checking if Metrics Are Being Reported

### Via Agent Logs

Look for these log messages:

```
✅ Metrics should be visible:
[INFO] Reporting state to cloud { includeMetrics: true, reportSize: 12345 }

❌ Metrics not yet included:
[INFO] Reporting state to cloud { includeMetrics: false, reportSize: 512 }
```

### Via API Query

```powershell
# Get device current state
$response = Invoke-RestMethod `
    -Uri "http://a18ada74.localhost/api/v1/devices/<uuid>/current-state" `
    -Method GET

# Check if metrics are present
if ($response.cpu_usage) {
    Write-Host "✅ Metrics are being reported"
    Write-Host "  CPU: $($response.cpu_usage)%"
    Write-Host "  Memory: $([math]::Round($response.memory_usage / 1GB, 2))GB"
} else {
    Write-Host "⚠️ Metrics not yet reported (wait up to 5 minutes)"
}
```

### Via Dashboard

1. Open: `http://a18ada74.localhost`
2. Navigate to device details
3. Check "System Metrics" card:
   - If empty: Wait up to 5 minutes for first metrics report
   - If populated: Metrics are being reported successfully

---

## Bandwidth Optimization

The agent implements several optimizations to reduce data transfer:

### 1. **Diff-Based Reporting**

Only state changes are reported, not the full state every time:

```typescript
// State changes trigger immediate report
if (currentState !== previousState) {
  await sendReport(currentState);
}
```

### 2. **Static Field Caching**

Fields that rarely change are only sent when they change:

```typescript
// Only send if changed
if (osVersionChanged || firstReport) {
  report.os_version = deviceInfo.osVersion;
}
```

**Static fields:**
- `os_version` - Sent once, then only on change
- `agent_version` - Sent once, then only on change  
- `local_ip` - Sent once, then only on change

### 3. **ETag Caching**

Target state polling uses ETags to avoid downloading unchanged state:

```http
GET /api/v1/device/<uuid>/state
If-None-Match: "etag-hash-12345"

Response: 304 Not Modified (no body)
```

**Result:** ~99% of polls return 304 (empty response), saving bandwidth.

### 4. **Compression**

Large reports (>1KB) are gzipped before transmission:

```typescript
if (reportSize > 1024) {
  const compressed = await gzip(JSON.stringify(report));
  // 60-80% size reduction
}
```

---

## Troubleshooting

### Problem: No Metrics in Dashboard

**Symptoms:**
- Device shows as online
- State reports are being sent
- But CPU/memory charts are empty

**Diagnosis:**

1. **Check time elapsed since agent start:**
   ```bash
   # Agent logs show startup time
   grep "Agent initialized" agent.log
   # Calculate: Has 5 minutes elapsed?
   ```

2. **Check agent logs for metrics inclusion:**
   ```bash
   grep "includeMetrics" agent.log
   # Should see: includeMetrics: true after 5 minutes
   ```

3. **Check API for received metrics:**
   ```powershell
   $state = Invoke-RestMethod -Uri "http://a18ada74.localhost/api/v1/devices/<uuid>/current-state"
   $state | ConvertTo-Json -Depth 5
   # Look for cpu_usage, memory_usage, etc.
   ```

**Solutions:**

**A. Wait 5 Minutes**
- Metrics report every 5 minutes by default
- First metrics report comes at T=300s

**B. Set Faster Interval**
```powershell
./set-default-target-state.ps1 -DeviceUuid <uuid> -MetricsInterval 60
# Metrics will report every 60 seconds
```

**C. Force Immediate Report**
```bash
# Restart agent (triggers immediate report with metrics)
# Or wait for next 5-minute interval
```

### Problem: Metrics Stopped Reporting

**Possible Causes:**

1. **Agent offline:**
   ```bash
   # Check connection status
   grep "Connection status" agent.log
   # Should see: is_online: true
   ```

2. **API errors:**
   ```bash
   # Check for 4xx/5xx errors
   grep "Failed to send report" agent.log
   ```

3. **Metrics collection failure:**
   ```bash
   # Check for metrics errors
   grep "Failed to collect metrics" agent.log
   ```

**Solutions:**

```bash
# Restart agent
npm run dev

# Check API health
curl http://a18ada74.localhost/api/health

# Check MQTT connection
mosquitto_sub -h localhost -p 31567 -t '$SYS/#'
```

---

## Best Practices

### For Development

✅ **Use faster intervals for testing:**
```powershell
./set-default-target-state.ps1 -MetricsInterval 30
```

✅ **Enable debug logging:**
```bash
LOG_LEVEL=debug npm run dev
```

✅ **Monitor agent logs in real-time:**
```bash
tail -f agent.log | grep -E "Reporting|Polling|Metrics"
```

### For Production

✅ **Use default 5-minute intervals:**
- Balances visibility with API load
- Reduces bandwidth costs
- Sufficient for monitoring

✅ **Set target state with monitoring config:**
```json
{
  "config": {
    "IOTISTIC_METRICS_INTERVAL": "300",
    "IOTISTIC_LOG_LEVEL": "info",
    "IOTISTIC_HEARTBEAT_INTERVAL": "60"
  }
}
```

✅ **Enable cloud logging for critical devices:**
```json
{
  "config": {
    "IOTISTIC_CLOUD_LOGS_ENABLED": "true",
    "IOTISTIC_LOG_LEVEL": "warn"  // Only errors/warnings
  }
}
```

---

## Related Scripts

| Script | Purpose | Location |
|--------|---------|----------|
| `set-default-target-state.ps1` | Set initial target state with metrics config | `api/scripts/state/` |
| `update-target-state.ps1` | Update existing target state | `api/scripts/state/` |
| `get-device-state.ps1` | View current device state | `api/scripts/state/` |
| `create-provisioning-key.ps1` | Generate provisioning keys | `api/scripts/provisioning/` |

---

## Summary

**Key Takeaway:** Metrics reporting IS enabled by default, but you need to wait **5 minutes** for the first report.

**Quick Fix:** Use `set-default-target-state.ps1` to set a faster interval (e.g., 60 seconds) for immediate visibility during development.

**Production:** Default 5-minute interval is optimal for balancing monitoring needs with bandwidth/API load.
