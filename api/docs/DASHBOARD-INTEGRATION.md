# Dashboard Integration Guide

**Digital Twin + Anomaly Detection for Real-Time Dashboards**

This guide shows how to use the Digital Twin API endpoints to build real-time monitoring dashboards with anomaly detection.

---

## 🎯 Quick Start: Dashboard Data Endpoints

### 1. Fleet Overview Dashboard

```typescript
// GET /api/v1/fleet/health
// Perfect for: Main dashboard overview card

fetch('http://localhost:4002/api/v1/fleet/health')
  .then(res => res.json())
  .then(data => {
    console.log(`Total Devices: ${data.totalDevices}`);
    console.log(`Online: ${data.onlineDevices}`);
    console.log(`Fleet CPU: ${data.aggregateMetrics.avgCpuUsage}%`);
    console.log(`Fleet Memory: ${data.aggregateMetrics.avgMemoryUsed} MB`);
  });

// Response:
{
  "totalDevices": 5,
  "onlineDevices": 4,
  "offlineDevices": 1,
  "aggregateMetrics": {
    "avgCpuUsage": 45.2,
    "avgMemoryUsed": 512.3,
    "avgDiskUsed": 2048.7,
    "totalCpuUsage": 226.0,
    "totalMemoryUsed": 2561.5
  }
}
```

### 2. Device List with Alerts

```typescript
// GET /api/v1/fleet/alerts
// Perfect for: Alert sidebar, notification panel

fetch('http://localhost:4002/api/v1/fleet/alerts')
  .then(res => res.json())
  .then(data => {
    data.alerts.forEach(alert => {
      console.log(`🚨 ${alert.deviceName}: ${alert.alerts.join(', ')}`);
    });
  });

// Response:
{
  "totalAlerts": 3,
  "alerts": [
    {
      "deviceUuid": "46b68204-9806-43c5-8d19-18b1f53e3b8a",
      "deviceName": "pi-sensor-01",
      "alerts": ["High CPU Usage: 95.2%", "Low Memory: 50 MB remaining"]
    }
  ]
}
```

### 3. Real-Time Anomaly Detection

```typescript
// GET /api/v1/devices/:uuid/twin/anomalies
// Perfect for: Time-series charts with anomaly markers

const deviceUuid = "46b68204-9806-43c5-8d19-18b1f53e3b8a";
const hours = 24;
const from = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
const to = new Date().toISOString();

fetch(`http://localhost:4002/api/v1/devices/${deviceUuid}/twin/anomalies?field=system.cpuUsage&from=${from}&to=${to}&threshold=2.5`)
  .then(res => res.json())
  .then(data => {
    // Use for chart visualization
    console.log(`Mean CPU: ${data.statistics.mean}%`);
    console.log(`Anomalies: ${data.anomalyDetection.detected.total}`);
    
    // Mark anomalies on chart
    data.anomalies.forEach(anomaly => {
      console.log(`Spike at ${anomaly.timestamp}: ${anomaly.value}%`);
    });
  });
```

### 4. Historical Trends

```typescript
// GET /api/v1/devices/:uuid/twin/history
// Perfect for: Time-series charts, trend analysis

fetch(`http://localhost:4002/api/v1/devices/${deviceUuid}/twin/history?field=system.cpuUsage&from=${from}&to=${to}&limit=500`)
  .then(res => res.json())
  .then(data => {
    // Chart.js, Recharts, or any charting library
    const chartData = data.data.map(point => ({
      x: new Date(point.timestamp),
      y: point.value
    }));
    
    console.log(`Min: ${data.statistics.min}%`);
    console.log(`Max: ${data.statistics.max}%`);
    console.log(`Avg: ${data.statistics.average}%`);
  });
```

---

## 📊 Dashboard Components Examples

### Component 1: Fleet Health Card

```typescript
// React Component Example
import { useEffect, useState } from 'react';

interface FleetHealth {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  aggregateMetrics: {
    avgCpuUsage: number;
    avgMemoryUsed: number;
    avgDiskUsed: number;
  };
}

export function FleetHealthCard() {
  const [health, setHealth] = useState<FleetHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('http://localhost:4002/api/v1/fleet/health');
        const data = await res.json();
        setHealth(data);
      } catch (error) {
        console.error('Failed to fetch fleet health:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
    
    // Refresh every 60 seconds
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!health) return <div>Error loading fleet health</div>;

  return (
    <div className="fleet-health-card">
      <h2>Fleet Overview</h2>
      
      <div className="metric-grid">
        <div className="metric">
          <span className="label">Total Devices</span>
          <span className="value">{health.totalDevices}</span>
        </div>
        
        <div className="metric">
          <span className="label">Online</span>
          <span className="value online">{health.onlineDevices}</span>
        </div>
        
        <div className="metric">
          <span className="label">Offline</span>
          <span className="value offline">{health.offlineDevices}</span>
        </div>
        
        <div className="metric">
          <span className="label">Avg CPU</span>
          <span className="value">{health.aggregateMetrics.avgCpuUsage.toFixed(1)}%</span>
        </div>
        
        <div className="metric">
          <span className="label">Avg Memory</span>
          <span className="value">{(health.aggregateMetrics.avgMemoryUsed / 1024).toFixed(1)} GB</span>
        </div>
      </div>
    </div>
  );
}
```

### Component 2: Anomaly Chart (Chart.js)

```typescript
// React + Chart.js Example
import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface AnomalyChartProps {
  deviceUuid: string;
  field?: string;
  hours?: number;
}

export function AnomalyChart({ deviceUuid, field = 'system.cpuUsage', hours = 24 }: AnomalyChartProps) {
  const [chartData, setChartData] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const from = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const to = new Date().toISOString();

      try {
        // Fetch history
        const historyRes = await fetch(
          `http://localhost:4002/api/v1/devices/${deviceUuid}/twin/history?field=${field}&from=${from}&to=${to}&limit=500`
        );
        const historyData = await historyRes.json();

        // Fetch anomalies
        const anomalyRes = await fetch(
          `http://localhost:4002/api/v1/devices/${deviceUuid}/twin/anomalies?field=${field}&from=${from}&to=${to}&threshold=2.5`
        );
        const anomalyData = await anomalyRes.json();

        // Prepare chart data
        const timestamps = historyData.data.map((p: any) => new Date(p.timestamp));
        const values = historyData.data.map((p: any) => p.value);

        // Find anomaly points
        const anomalyPoints = anomalyData.anomalies.map((a: any) => {
          const index = historyData.data.findIndex(
            (p: any) => new Date(p.timestamp).getTime() === new Date(a.timestamp).getTime()
          );
          return index >= 0 ? { x: timestamps[index], y: a.value } : null;
        }).filter(Boolean);

        setChartData({
          labels: timestamps,
          datasets: [
            {
              label: field,
              data: values,
              borderColor: 'rgb(59, 130, 246)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              tension: 0.1,
              pointRadius: 0,
              borderWidth: 2
            },
            {
              label: 'Anomalies',
              data: anomalyPoints,
              borderColor: 'rgb(239, 68, 68)',
              backgroundColor: 'rgb(239, 68, 68)',
              pointRadius: 8,
              pointHoverRadius: 10,
              showLine: false,
              type: 'scatter'
            },
            {
              label: 'Mean',
              data: Array(timestamps.length).fill(anomalyData.statistics.mean),
              borderColor: 'rgb(34, 197, 94)',
              borderDash: [5, 5],
              borderWidth: 1,
              pointRadius: 0
            },
            {
              label: 'Upper Threshold',
              data: Array(timestamps.length).fill(
                anomalyData.statistics.mean + 2.5 * anomalyData.statistics.stdDev
              ),
              borderColor: 'rgb(234, 179, 8)',
              borderDash: [2, 2],
              borderWidth: 1,
              pointRadius: 0
            }
          ]
        });
      } catch (error) {
        console.error('Failed to fetch chart data:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [deviceUuid, field, hours]);

  if (!chartData) return <div>Loading chart...</div>;

  return (
    <div className="anomaly-chart">
      <Line
        data={chartData}
        options={{
          responsive: true,
          plugins: {
            legend: {
              position: 'top' as const,
            },
            title: {
              display: true,
              text: `${field} - Last ${hours} Hours`
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  if (context.dataset.label === 'Anomalies') {
                    return `Anomaly: ${context.parsed.y.toFixed(2)}`;
                  }
                  return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}`;
                }
              }
            }
          },
          scales: {
            x: {
              type: 'time',
              time: {
                unit: 'hour'
              }
            },
            y: {
              beginAtZero: true
            }
          }
        }}
      />
    </div>
  );
}
```

### Component 3: Alert Panel

```typescript
// React Alert Panel with Auto-Refresh
import { useEffect, useState } from 'react';

interface Alert {
  deviceUuid: string;
  deviceName: string;
  alerts: string[];
  lastUpdated: string;
  status: string;
}

export function AlertPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await fetch('http://localhost:4002/api/v1/fleet/alerts');
        const data = await res.json();
        setAlerts(data.alerts);
      } catch (error) {
        console.error('Failed to fetch alerts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();
    
    // Refresh every 30 seconds (alerts are more urgent)
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div>Loading alerts...</div>;

  return (
    <div className="alert-panel">
      <h2>Active Alerts ({alerts.length})</h2>
      
      {alerts.length === 0 ? (
        <div className="no-alerts">
          ✅ All systems normal
        </div>
      ) : (
        <div className="alert-list">
          {alerts.map(alert => (
            <div key={alert.deviceUuid} className="alert-item">
              <div className="alert-header">
                <span className="device-name">🚨 {alert.deviceName}</span>
                <span className="status-badge">{alert.status}</span>
              </div>
              
              <ul className="alert-messages">
                {alert.alerts.map((msg, idx) => (
                  <li key={idx} className="alert-message">
                    {msg}
                  </li>
                ))}
              </ul>
              
              <div className="alert-footer">
                <span className="timestamp">
                  Last updated: {new Date(alert.lastUpdated).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Component 4: Device Grid with Anomaly Indicators

```typescript
// React Device Grid
import { useEffect, useState } from 'react';

interface Device {
  deviceUuid: string;
  deviceName: string;
  status: string;
  reported: {
    system: {
      cpuUsage: number;
      memoryUsed: number;
      diskUsed: number;
    };
  };
  hasAnomalies?: boolean;
  anomalyCount?: number;
}

export function DeviceGrid() {
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        // Fetch all devices
        const res = await fetch('http://localhost:4002/api/v1/fleet/twins?limit=50');
        const data = await res.json();

        // Check for anomalies for each device
        const devicesWithAnomalies = await Promise.all(
          data.devices.map(async (device: Device) => {
            try {
              const from = new Date(Date.now() - 3600000).toISOString(); // Last hour
              const anomalyRes = await fetch(
                `http://localhost:4002/api/v1/devices/${device.deviceUuid}/twin/anomalies?field=system.cpuUsage&from=${from}&threshold=2.5`
              );
              const anomalyData = await anomalyRes.json();
              
              return {
                ...device,
                hasAnomalies: anomalyData.anomalyDetection.detected.total > 0,
                anomalyCount: anomalyData.anomalyDetection.detected.total
              };
            } catch {
              return device;
            }
          })
        );

        setDevices(devicesWithAnomalies);
      } catch (error) {
        console.error('Failed to fetch devices:', error);
      }
    };

    fetchDevices();
    const interval = setInterval(fetchDevices, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="device-grid">
      {devices.map(device => (
        <div 
          key={device.deviceUuid} 
          className={`device-card ${device.hasAnomalies ? 'has-anomalies' : ''}`}
        >
          {device.hasAnomalies && (
            <div className="anomaly-badge">
              🚨 {device.anomalyCount} anomalies
            </div>
          )}
          
          <h3>{device.deviceName}</h3>
          
          <div className="status-indicator" data-status={device.status}>
            {device.status === 'online' ? '🟢' : '🔴'} {device.status}
          </div>
          
          <div className="metrics">
            <div className="metric">
              <span className="label">CPU</span>
              <span className="value">{device.reported.system.cpuUsage.toFixed(1)}%</span>
            </div>
            
            <div className="metric">
              <span className="label">Memory</span>
              <span className="value">
                {(device.reported.system.memoryUsed / 1024).toFixed(1)} GB
              </span>
            </div>
            
            <div className="metric">
              <span className="label">Disk</span>
              <span className="value">
                {(device.reported.system.diskUsed / 1024).toFixed(1)} GB
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## 🚀 Real-Time Updates

### WebSocket Alternative (Polling Pattern)

Since the API uses HTTP (not WebSocket yet), use polling for real-time updates:

```typescript
// Custom React Hook for Auto-Refresh
import { useEffect, useState, useCallback } from 'react';

export function useAutoRefresh<T>(
  fetchFn: () => Promise<T>,
  intervalMs: number = 60000
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const result = await fetchFn();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, intervalMs);
    return () => clearInterval(interval);
  }, [refresh, intervalMs]);

  return { data, loading, error, refresh };
}

// Usage:
function MyDashboard() {
  const { data: health, loading } = useAutoRefresh(
    async () => {
      const res = await fetch('http://localhost:4002/api/v1/fleet/health');
      return res.json();
    },
    30000 // Refresh every 30 seconds
  );

  if (loading) return <div>Loading...</div>;
  
  return <FleetHealthCard health={health} />;
}
```

### Suggested Refresh Intervals

```typescript
// Recommended polling intervals
const REFRESH_INTERVALS = {
  CRITICAL_ALERTS: 10000,   // 10 seconds
  FLEET_HEALTH: 30000,      // 30 seconds
  DEVICE_LIST: 60000,       // 1 minute
  HISTORICAL_CHARTS: 300000 // 5 minutes
};
```

---

## 📱 Complete Dashboard Example (Next.js)

```typescript
// pages/dashboard/index.tsx
import { useState } from 'react';
import { FleetHealthCard } from '@/components/FleetHealthCard';
import { AlertPanel } from '@/components/AlertPanel';
import { DeviceGrid } from '@/components/DeviceGrid';
import { AnomalyChart } from '@/components/AnomalyChart';

export default function Dashboard() {
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  return (
    <div className="dashboard">
      <header>
        <h1>IoT Fleet Dashboard</h1>
      </header>

      {/* Top Row: Fleet Overview */}
      <div className="dashboard-row">
        <FleetHealthCard />
        <AlertPanel />
      </div>

      {/* Middle Row: Device Grid */}
      <div className="dashboard-row">
        <DeviceGrid onDeviceSelect={setSelectedDevice} />
      </div>

      {/* Bottom Row: Detailed Charts */}
      {selectedDevice && (
        <div className="dashboard-row">
          <div className="chart-container">
            <AnomalyChart 
              deviceUuid={selectedDevice} 
              field="system.cpuUsage" 
              hours={24} 
            />
          </div>
          
          <div className="chart-container">
            <AnomalyChart 
              deviceUuid={selectedDevice} 
              field="system.memoryUsed" 
              hours={24} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 🎨 Styling Tips

### CSS for Anomaly Indicators

```css
/* Alert colors */
.has-anomalies {
  border-left: 4px solid #ef4444;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.anomaly-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background: #ef4444;
  color: white;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
}

/* Status colors */
.status-online { color: #22c55e; }
.status-offline { color: #ef4444; }
.status-warning { color: #eab308; }

/* Chart anomaly points */
.chartjs-render-monitor .anomaly-point {
  fill: #ef4444;
  stroke: #dc2626;
  stroke-width: 2;
}
```

---

## 🔧 Performance Optimization

### 1. Batch API Calls

```typescript
// Instead of individual calls per device
async function fetchDevicesWithAnomalies() {
  // Single call for all devices
  const devices = await fetch('/api/v1/fleet/twins').then(r => r.json());
  
  // Batch anomaly checks
  const anomalyPromises = devices.devices.map(device =>
    fetch(`/api/v1/devices/${device.deviceUuid}/twin/anomalies?hours=1`)
      .then(r => r.json())
      .catch(() => ({ anomalyDetection: { detected: { total: 0 } } }))
  );
  
  const anomalies = await Promise.all(anomalyPromises);
  
  return devices.devices.map((device, idx) => ({
    ...device,
    anomalyCount: anomalies[idx].anomalyDetection.detected.total
  }));
}
```

### 2. Caching Strategy

```typescript
// Simple cache with TTL
const cache = new Map<string, { data: any; expires: number }>();

async function fetchWithCache(url: string, ttlMs: number = 60000) {
  const cached = cache.get(url);
  
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  
  const data = await fetch(url).then(r => r.json());
  cache.set(url, { data, expires: Date.now() + ttlMs });
  
  return data;
}

// Usage:
const health = await fetchWithCache('/api/v1/fleet/health', 30000);
```

### 3. Incremental Loading

```typescript
// Load critical data first, then details
function DashboardWithIncrementalLoad() {
  const [fleetHealth, setFleetHealth] = useState(null);
  const [devices, setDevices] = useState([]);
  const [anomalies, setAnomalies] = useState({});

  useEffect(() => {
    // Priority 1: Fleet health (fast)
    fetch('/api/v1/fleet/health')
      .then(r => r.json())
      .then(setFleetHealth);

    // Priority 2: Device list (medium)
    fetch('/api/v1/fleet/twins')
      .then(r => r.json())
      .then(data => setDevices(data.devices));

    // Priority 3: Anomalies (slow, can be lazy)
    setTimeout(() => {
      // Load anomalies in background
    }, 1000);
  }, []);

  return (
    <>
      {fleetHealth && <FleetHealthCard health={fleetHealth} />}
      {devices.length > 0 && <DeviceGrid devices={devices} />}
    </>
  );
}
```

---

## 📊 Dashboard Variants

### 1. Executive Dashboard (High-Level)
- Fleet health card
- Total devices online/offline
- Average metrics across fleet
- Critical alerts only
- Refresh: 60 seconds

### 2. Operations Dashboard (Detailed)
- All devices grid
- Real-time anomaly charts
- All alerts panel
- Historical trends
- Refresh: 30 seconds

### 3. Device Detail View
- Single device focus
- Multi-metric charts (CPU, memory, disk, temperature)
- Anomaly timeline
- Historical comparison
- Refresh: 10 seconds

### 4. Alert Dashboard (Incident Response)
- Critical alerts at top
- Anomaly detection for all metrics
- Recent anomalies timeline
- Device status indicators
- Refresh: 10 seconds

---

## 🚀 Advanced Features

### 1. Anomaly Heatmap

```typescript
// Show anomaly frequency across devices and time
function AnomalyHeatmap() {
  // Fetch anomalies for all devices
  // Display as grid: devices (y-axis) x time (x-axis)
  // Color intensity = anomaly count
}
```

### 2. Predictive Analytics

```typescript
// Use historical data to predict future values
function PredictiveChart({ deviceUuid, field }) {
  // Fetch 7 days of history
  // Calculate trend line
  // Extrapolate next 24 hours
  // Show confidence interval
}
```

### 3. Multi-Device Comparison

```typescript
// Compare same metric across multiple devices
function ComparisonChart({ deviceUuids, field }) {
  // Fetch history for all devices
  // Overlay on same chart
  // Show which device has most anomalies
}
```

---

## 🔗 API Endpoints Summary for Dashboards

| Endpoint | Use Case | Refresh Rate | Data Size |
|----------|----------|--------------|-----------|
| `/fleet/health` | Overview card | 30-60s | Small (~1 KB) |
| `/fleet/alerts` | Alert panel | 10-30s | Small (~5 KB) |
| `/fleet/twins` | Device list | 60s | Medium (~50 KB) |
| `/devices/:id/twin` | Single device | 30s | Small (~2 KB) |
| `/devices/:id/twin/history` | Charts | 5min | Large (~200 KB) |
| `/devices/:id/twin/anomalies` | Anomaly overlay | 60s | Medium (~20 KB) |

---

## 💡 Best Practices

1. **Staggered Refresh**: Don't refresh all components at once
   ```typescript
   useEffect(() => {
     const offset = Math.random() * 5000; // Random 0-5s offset
     const timer = setTimeout(() => {
       fetchData();
       setInterval(fetchData, 60000);
     }, offset);
     return () => clearTimeout(timer);
   }, []);
   ```

2. **Error Handling**: Always show stale data if fetch fails
   ```typescript
   const [data, setData] = useState(null);
   const [lastGoodData, setLastGoodData] = useState(null);
   
   fetchData()
     .then(newData => {
       setData(newData);
       setLastGoodData(newData);
     })
     .catch(err => {
       console.error(err);
       // Keep showing lastGoodData
     });
   ```

3. **Loading States**: Show skeleton/spinner only on first load
   ```typescript
   const [isFirstLoad, setIsFirstLoad] = useState(true);
   
   if (isFirstLoad && loading) {
     return <Skeleton />;
   }
   
   // Show data with subtle refresh indicator
   return (
     <>
       {loading && <RefreshSpinner />}
       <Data data={data} />
     </>
   );
   ```

4. **Responsive Design**: Adapt chart complexity based on screen size
   ```typescript
   const isMobile = window.innerWidth < 768;
   const dataLimit = isMobile ? 50 : 500; // Fewer points on mobile
   ```

---

## 🎯 Summary

**Yes, this API is perfect for dashboards!** You can:

✅ Build real-time monitoring dashboards  
✅ Visualize anomalies on time-series charts  
✅ Show fleet health and device status  
✅ Display alerts and notifications  
✅ Create historical trend analysis  
✅ Implement predictive analytics  

**Next Steps:**
1. Choose your framework (React, Vue, Next.js, etc.)
2. Install charting library (Chart.js, Recharts, D3.js, etc.)
3. Copy the component examples above
4. Customize styling to match your brand
5. Deploy and monitor!

Need help with a specific framework or feature? Let me know! 🚀
