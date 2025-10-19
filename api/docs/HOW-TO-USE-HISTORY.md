# Digital Twin History & Anomaly Detection - Quick Start Guide

## 🚀 Quick Usage Examples

### Prerequisites
- API server running (Debug API terminal)
- Device UUID: Replace `YOUR_DEVICE_UUID` with your actual device UUID

```bash
# Find your device UUID
curl http://localhost:4002/api/v1/devices
```

---

## 📊 1. View Historical Shadow Data

### Get Complete History (Last 7 Days)
```bash
curl http://localhost:4002/api/v1/devices/YOUR_DEVICE_UUID/twin/history
```

**Returns**: Complete shadow snapshots with all fields

### Get Last 24 Hours of History
```bash
$from = (Get-Date).AddDays(-1).ToString("yyyy-MM-ddTHH:mm:ssZ")
$to = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")

curl "http://localhost:4002/api/v1/devices/YOUR_DEVICE_UUID/twin/history?from=$from&to=$to"
```

### Get Last 10 Records
```bash
curl "http://localhost:4002/api/v1/devices/YOUR_DEVICE_UUID/twin/history?limit=10"
```

---

## 📈 2. Track Specific Metrics Over Time

### CPU Usage History with Statistics
```bash
curl "http://localhost:4002/api/v1/devices/YOUR_DEVICE_UUID/twin/history?field=system.cpuUsage"
```

**Response Example**:
```json
{
  "deviceUuid": "...",
  "field": "system.cpuUsage",
  "count": 142,
  "statistics": {
    "count": 142,
    "min": 12.5,
    "max": 98.3,
    "average": 45.7,
    "latest": 52.1
  },
  "data": [
    { "timestamp": "2025-10-18T00:02:00.000Z", "value": 52.1 },
    { "timestamp": "2025-10-18T00:01:00.000Z", "value": 48.9 }
  ]
}
```

### Memory Usage Trends
```bash
curl "http://localhost:4002/api/v1/devices/YOUR_DEVICE_UUID/twin/history?field=system.memoryUsagePercent"
```

### Disk Usage Over Time
```bash
curl "http://localhost:4002/api/v1/devices/YOUR_DEVICE_UUID/twin/history?field=system.diskUsagePercent"
```

### Health Status Changes
```bash
curl "http://localhost:4002/api/v1/devices/YOUR_DEVICE_UUID/twin/history?field=health.status"
```

---

## 🔍 3. Detect Anomalies

### Find CPU Usage Anomalies
```bash
curl "http://localhost:4002/api/v1/devices/YOUR_DEVICE_UUID/twin/anomalies?field=system.cpuUsage"
```

**Response Example**:
```json
{
  "deviceUuid": "...",
  "field": "system.cpuUsage",
  "statistics": {
    "dataPoints": 142,
    "mean": 45.7,
    "stdDev": 12.3,
    "min": 12.5,
    "max": 98.3
  },
  "anomalyDetection": {
    "threshold": 2.5,
    "method": "Z-score",
    "detected": {
      "total": 5,
      "critical": 2,
      "warning": 3,
      "percentage": "3.52"
    }
  },
  "anomalies": [
    {
      "timestamp": "2025-10-17T14:23:00.000Z",
      "value": 98.3,
      "zScore": 4.28,
      "severity": "critical",
      "deviation": "115%"
    }
  ]
}
```

### More Sensitive Detection (Lower Threshold)
```bash
# threshold=2 will detect more anomalies (default is 2.5)
curl "http://localhost:4002/api/v1/devices/YOUR_DEVICE_UUID/twin/anomalies?field=system.cpuUsage&threshold=2"
```

### Memory Anomalies
```bash
curl "http://localhost:4002/api/v1/devices/YOUR_DEVICE_UUID/twin/anomalies?field=system.memoryUsagePercent"
```

### Disk Usage Anomalies
```bash
curl "http://localhost:4002/api/v1/devices/YOUR_DEVICE_UUID/twin/anomalies?field=system.diskUsagePercent"
```

---

## 💡 4. Practical Use Cases

### Use Case 1: Compare Performance Before/After Deployment
```powershell
# Before deployment (yesterday)
$from = (Get-Date).AddDays(-1).AddHours(-2).ToString("yyyy-MM-ddTHH:mm:ssZ")
$to = (Get-Date).AddDays(-1).ToString("yyyy-MM-ddTHH:mm:ssZ")
curl "http://localhost:4002/api/v1/devices/YOUR_DEVICE_UUID/twin/history?field=system.cpuUsage&from=$from&to=$to"

# After deployment (today)
$from = (Get-Date).AddHours(-2).ToString("yyyy-MM-ddTHH:mm:ssZ")
$to = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
curl "http://localhost:4002/api/v1/devices/YOUR_DEVICE_UUID/twin/history?field=system.cpuUsage&from=$from&to=$to"

# Compare the averages!
```

### Use Case 2: Find Peak Usage Times
```powershell
# Get last 24 hours with all data points
curl "http://localhost:4002/api/v1/devices/YOUR_DEVICE_UUID/twin/history?field=system.cpuUsage&limit=1440"

# Look for max value in statistics
```

### Use Case 3: Predictive Maintenance Alert
```powershell
# Check for disk usage anomalies
$response = Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/YOUR_DEVICE_UUID/twin/anomalies?field=system.diskUsagePercent"

if ($response.anomalyDetection.detected.total -gt 0) {
    Write-Host "⚠️  ALERT: Disk usage anomalies detected!" -ForegroundColor Yellow
    Write-Host "   Critical: $($response.anomalyDetection.detected.critical)" -ForegroundColor Red
    Write-Host "   Warning: $($response.anomalyDetection.detected.warning)" -ForegroundColor Yellow
    
    # Send notification, create ticket, etc.
}
```

### Use Case 4: Generate Performance Report
```powershell
# Get statistics for multiple metrics
$uuid = "YOUR_DEVICE_UUID"

$cpu = Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$uuid/twin/history?field=system.cpuUsage"
$memory = Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$uuid/twin/history?field=system.memoryUsagePercent"
$disk = Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$uuid/twin/history?field=system.diskUsagePercent"

Write-Host "`n📊 Device Performance Report" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "CPU Usage:" -ForegroundColor Yellow
Write-Host "  Average: $($cpu.statistics.average)%" -ForegroundColor Gray
Write-Host "  Min: $($cpu.statistics.min)%" -ForegroundColor Green
Write-Host "  Max: $($cpu.statistics.max)%" -ForegroundColor Red
Write-Host "`nMemory Usage:" -ForegroundColor Yellow
Write-Host "  Average: $($memory.statistics.average)%" -ForegroundColor Gray
Write-Host "  Min: $($memory.statistics.min)%" -ForegroundColor Green
Write-Host "  Max: $($memory.statistics.max)%" -ForegroundColor Red
Write-Host "`nDisk Usage:" -ForegroundColor Yellow
Write-Host "  Average: $($disk.statistics.average)%" -ForegroundColor Gray
Write-Host "  Min: $($disk.statistics.min)%" -ForegroundColor Green
Write-Host "  Max: $($disk.statistics.max)%" -ForegroundColor Red
```

---

## 🎯 5. PowerShell Helper Script

Save this as `Get-DeviceHistory.ps1`:

```powershell
param(
    [Parameter(Mandatory=$true)]
    [string]$DeviceUuid,
    
    [Parameter(Mandatory=$false)]
    [string]$Field = "system.cpuUsage",
    
    [Parameter(Mandatory=$false)]
    [int]$Hours = 24,
    
    [Parameter(Mandatory=$false)]
    [switch]$CheckAnomalies
)

$API_BASE = "http://localhost:4002/api/v1"

if ($CheckAnomalies) {
    Write-Host "`n🔍 Checking for anomalies in $Field..." -ForegroundColor Cyan
    $response = Invoke-RestMethod -Uri "$API_BASE/devices/$DeviceUuid/twin/anomalies?field=$Field"
    
    Write-Host "`n📊 Statistics:" -ForegroundColor Yellow
    Write-Host "   Data Points: $($response.statistics.dataPoints)"
    Write-Host "   Mean: $($response.statistics.mean)"
    Write-Host "   Std Dev: $($response.statistics.stdDev)"
    
    Write-Host "`n⚠️  Anomalies Detected:" -ForegroundColor Yellow
    Write-Host "   Total: $($response.anomalyDetection.detected.total)"
    Write-Host "   Critical: $($response.anomalyDetection.detected.critical)" -ForegroundColor Red
    Write-Host "   Warning: $($response.anomalyDetection.detected.warning)" -ForegroundColor Yellow
    Write-Host "   Percentage: $($response.anomalyDetection.detected.percentage)%"
    
    if ($response.anomalies.Count -gt 0) {
        Write-Host "`n🔴 Anomaly Details:" -ForegroundColor Red
        foreach ($anomaly in $response.anomalies | Select-Object -First 5) {
            Write-Host "   $($anomaly.timestamp): $($anomaly.value) (Z-score: $($anomaly.zScore), Deviation: $($anomaly.deviation))" -ForegroundColor Gray
        }
    }
} else {
    $from = (Get-Date).AddHours(-$Hours).ToString("yyyy-MM-ddTHH:mm:ssZ")
    
    Write-Host "`n📈 Fetching history for $Field (last $Hours hours)..." -ForegroundColor Cyan
    $response = Invoke-RestMethod -Uri "$API_BASE/devices/$DeviceUuid/twin/history?field=$Field&from=$from"
    
    Write-Host "`n📊 Statistics:" -ForegroundColor Yellow
    Write-Host "   Count: $($response.statistics.count)"
    Write-Host "   Average: $($response.statistics.average)"
    Write-Host "   Min: $($response.statistics.min)" -ForegroundColor Green
    Write-Host "   Max: $($response.statistics.max)" -ForegroundColor Red
    Write-Host "   Latest: $($response.statistics.latest)"
    
    Write-Host "`n📋 Recent Values (last 5):" -ForegroundColor Yellow
    foreach ($point in $response.data | Select-Object -First 5) {
        Write-Host "   $($point.timestamp): $($point.value)" -ForegroundColor Gray
    }
}
```

**Usage**:
```powershell
# Get CPU history for last 24 hours
.\Get-DeviceHistory.ps1 -DeviceUuid "YOUR_UUID" -Field "system.cpuUsage" -Hours 24

# Check for memory anomalies
.\Get-DeviceHistory.ps1 -DeviceUuid "YOUR_UUID" -Field "system.memoryUsagePercent" -CheckAnomalies

# Get disk usage for last week
.\Get-DeviceHistory.ps1 -DeviceUuid "YOUR_UUID" -Field "system.diskUsagePercent" -Hours 168
```

---

## 🗄️ 6. Direct Database Queries

If you want to query the database directly:

```sql
-- View recent history
SELECT 
    device_uuid,
    timestamp,
    reported_state->'system'->>'cpuUsage' as cpu_usage,
    reported_state->'system'->>'memoryUsagePercent' as memory_usage,
    reported_state->'health'->>'status' as health_status
FROM device_shadow_history
WHERE device_uuid = 'YOUR_UUID'
ORDER BY timestamp DESC
LIMIT 10;

-- Count history records per device
SELECT 
    device_uuid,
    COUNT(*) as record_count,
    MIN(timestamp) as oldest_record,
    MAX(timestamp) as newest_record
FROM device_shadow_history
GROUP BY device_uuid;

-- Find high CPU usage periods
SELECT 
    device_uuid,
    timestamp,
    (reported_state->'system'->>'cpuUsage')::float as cpu_usage
FROM device_shadow_history
WHERE device_uuid = 'YOUR_UUID'
  AND (reported_state->'system'->>'cpuUsage')::float > 80
ORDER BY timestamp DESC;
```

---

## 🔔 7. Automated Monitoring Script

Save as `Monitor-Devices.ps1` for continuous monitoring:

```powershell
$API_BASE = "http://localhost:4002/api/v1"

while ($true) {
    Clear-Host
    Write-Host "🔍 Device Monitoring Dashboard" -ForegroundColor Cyan
    Write-Host "================================`n" -ForegroundColor Cyan
    
    # Get all devices
    $devices = Invoke-RestMethod -Uri "$API_BASE/devices"
    
    foreach ($device in $devices.devices) {
        $uuid = $device.uuid
        
        # Check for anomalies
        try {
            $anomalies = Invoke-RestMethod -Uri "$API_BASE/devices/$uuid/twin/anomalies?field=system.cpuUsage" -ErrorAction SilentlyContinue
            
            if ($anomalies.anomalyDetection.detected.total -gt 0) {
                Write-Host "⚠️  $($device.name): $($anomalies.anomalyDetection.detected.total) CPU anomalies detected!" -ForegroundColor Yellow
            } else {
                Write-Host "✅ $($device.name): Normal" -ForegroundColor Green
            }
        } catch {
            Write-Host "⏳ $($device.name): Collecting data..." -ForegroundColor Gray
        }
    }
    
    Write-Host "`n⏰ Last check: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Gray
    Write-Host "   Refreshing in 60 seconds..." -ForegroundColor Gray
    
    Start-Sleep -Seconds 60
}
```

---

## 📚 Available Fields

You can track history/anomalies for any field in the shadow state:

```
system.cpuUsage                    - CPU usage percentage
system.memoryUsed                  - Memory used (GB)
system.memoryTotal                 - Total memory (GB)
system.memoryUsagePercent          - Memory usage percentage
system.diskUsed                    - Disk used (GB)
system.diskTotal                   - Total disk (GB)
system.diskUsagePercent            - Disk usage percentage
system.cpuTemp                     - CPU temperature (if available)
system.uptime                      - System uptime

health.status                      - Health status (healthy/degraded/critical)
connectivity.mqttConnected         - MQTT connection status
connectivity.cloudConnected        - Cloud connection status
```

---

## 🎓 Pro Tips

1. **Start with history to understand patterns**
   ```bash
   curl "http://localhost:4002/api/v1/devices/YOUR_UUID/twin/history?field=system.cpuUsage&limit=100"
   ```

2. **Use anomaly detection for alerting**
   - Set up periodic checks (every 5-15 minutes)
   - Alert on critical anomalies only
   - Lower threshold during known stable periods

3. **Combine with fleet endpoints**
   ```bash
   # Check fleet health, then investigate specific devices with history
   curl http://localhost:4002/api/v1/fleet/alerts
   # For each alert, check history to understand the issue
   ```

4. **Export data for external analysis**
   ```powershell
   $data = Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/YOUR_UUID/twin/history?field=system.cpuUsage&limit=1000"
   $data.data | Export-Csv -Path "cpu-history.csv" -NoTypeInformation
   ```

---

Need help with a specific use case? Just ask! 🚀
