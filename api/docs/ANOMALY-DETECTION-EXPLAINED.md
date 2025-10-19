# Anomaly Detection Algorithm - Deep Dive

## 🧮 How Anomalies Are Calculated

The system uses **Z-Score (Standard Score)** method for statistical anomaly detection. This is a robust, well-established technique used in many monitoring systems.

---

## 📊 Step-by-Step Calculation

### Step 1: Collect Historical Data
```typescript
// From device_shadow_history table
const timeSeries = [
  { timestamp: "2025-10-18T00:00:00Z", value: 45.2 },
  { timestamp: "2025-10-18T00:01:00Z", value: 48.9 },
  { timestamp: "2025-10-18T00:02:00Z", value: 42.1 },
  // ... more data points
];
```

### Step 2: Calculate Mean (Average)
```typescript
const values = [45.2, 48.9, 42.1, 50.5, 46.8, 98.3, 43.2, ...];
const mean = values.reduce((sum, val) => sum + val, 0) / values.length;

// Example: mean = 45.7
```

### Step 3: Calculate Standard Deviation
```typescript
// Standard deviation measures how spread out the values are
const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
const stdDev = Math.sqrt(variance);

// Example: stdDev = 12.3
```

**What this means:**
- Low standard deviation (< 5): Values are tightly clustered around the mean
- Medium standard deviation (5-15): Normal variation
- High standard deviation (> 15): Values are widely spread

### Step 4: Calculate Z-Score for Each Point
```typescript
// Z-score = (value - mean) / stdDev
for (const point of timeSeries) {
  const zScore = (point.value - mean) / stdDev;
  point.zScore = zScore;
}
```

**Z-Score Interpretation:**
- **Z = 0**: Value is exactly at the mean
- **Z = 1**: Value is 1 standard deviation above mean
- **Z = -1**: Value is 1 standard deviation below mean
- **Z = 2**: Value is 2 standard deviations above mean (unusual)
- **Z = 3**: Value is 3 standard deviations above mean (very rare)
- **Z > 3**: Extreme outlier (99.7% of normal data falls within ±3σ)

### Step 5: Identify Anomalies
```typescript
const threshold = 2.5; // Default threshold

const anomalies = timeSeries.filter(point => {
  return Math.abs(point.zScore) > threshold;
});
```

### Step 6: Classify Severity
```typescript
for (const anomaly of anomalies) {
  if (Math.abs(anomaly.zScore) > 3) {
    anomaly.severity = 'critical';  // Very rare event (0.3% probability)
  } else {
    anomaly.severity = 'warning';   // Unusual event (1-5% probability)
  }
}
```

---

## 🎯 Real Example with Numbers

### Sample Data (CPU Usage over 24 hours)
```
Data Points: 144 (one per 10 minutes)
Values: [45, 42, 48, 50, 46, 43, 98, 44, 47, 45, ..., 92, 43]
```

### Calculation:
```typescript
// Step 1: Calculate statistics
mean = 45.7%
stdDev = 12.3

// Step 2: Analyze each point
Point 1: value=45,  zScore=(45-45.7)/12.3 = -0.06  → Normal
Point 2: value=42,  zScore=(42-45.7)/12.3 = -0.30  → Normal
Point 7: value=98,  zScore=(98-45.7)/12.3 =  4.25  → CRITICAL ANOMALY!
Point 8: value=44,  zScore=(44-45.7)/12.3 = -0.14  → Normal
...

// Step 3: Results
Total anomalies: 5
Critical (Z > 3): 2
Warning (Z > 2.5): 3
```

### Why Point 7 is an Anomaly:
```
Value: 98%
Mean:  45.7%
Z-Score: 4.25

This means: The value is 4.25 standard deviations above normal.
Probability: Only ~0.001% of measurements should be this high.
Deviation: (98 - 45.7) / 45.7 = 115% higher than average
```

---

## 🎚️ Threshold Tuning

The `threshold` parameter controls sensitivity:

| Threshold | Probability | Use Case |
|-----------|-------------|----------|
| **1.0** | ~32% of data falls outside | Very sensitive - too many false positives |
| **1.5** | ~13% of data falls outside | High sensitivity - good for tight tolerances |
| **2.0** | ~5% of data falls outside | Moderate sensitivity - catches most unusual events |
| **2.5** ⭐ | ~1.2% of data falls outside | **Default - good balance** |
| **3.0** | ~0.3% of data falls outside | Low sensitivity - only extreme outliers |
| **4.0** | ~0.006% of data falls outside | Very low - only catastrophic events |

### Examples:

**Tight Control (threshold=1.5)**
```powershell
# Manufacturing: Catch small deviations
.\Get-DeviceHistory.ps1 -DeviceUuid "YOUR_UUID" -Field "equipment.motor.rpm" -CheckAnomalies -Threshold 1.5
```

**Normal Monitoring (threshold=2.5)** - DEFAULT
```powershell
# General server monitoring
.\Get-DeviceHistory.ps1 -DeviceUuid "YOUR_UUID" -Field "system.cpuUsage" -CheckAnomalies
```

**Only Critical Events (threshold=3.5)**
```powershell
# Only catastrophic failures
.\Get-DeviceHistory.ps1 -DeviceUuid "YOUR_UUID" -Field "system.diskUsagePercent" -CheckAnomalies -Threshold 3.5
```

---

## 📈 Visual Representation

```
                            ANOMALY!
                               ↓
    100 |                      *
     90 |                           
     80 |              * (Warning)
     70 |        
     60 | Mean + 3σ ─────────────────────────  (Critical threshold)
     50 | Mean + 2.5σ ───────────────────────  (Default threshold)
     40 | Mean ═══════════════════════════════  (45.7%)
     30 | Mean - 2.5σ ───────────────────────
     20 |
     10 |
      0 |___________________________________
            Time →
```

---

## 🧪 Why Z-Score Method?

### ✅ Advantages:
1. **Scale-Independent**: Works for any metric (CPU %, memory GB, temperature °C)
2. **Statistical Foundation**: Based on normal distribution (bell curve)
3. **Interpretable**: Z-score directly tells you "how unusual" a value is
4. **Adjustable**: Single threshold parameter to tune sensitivity
5. **Fast**: Simple calculation, no training required
6. **Context-Aware**: Automatically adapts to your baseline

### ❌ Limitations:
1. **Assumes Normal Distribution**: Works best when data follows bell curve
2. **Requires History**: Needs at least 10 data points (we enforce this)
3. **Not Adaptive**: Uses entire history, doesn't weight recent data
4. **Symmetric**: Treats high and low anomalies equally
5. **No Seasonality**: Doesn't account for daily/weekly patterns

---

## 🔬 Advanced Concepts

### When Z-Score Works Well:
- **System metrics** (CPU, memory, disk) - usually normally distributed
- **Response times** - often follow normal distribution
- **Error rates** - when errors are random
- **Temperature** - environmental sensors

### When Z-Score May Struggle:
- **Metrics with trends** (continuously growing disk usage)
- **Seasonal patterns** (high CPU during business hours)
- **Bimodal distributions** (two distinct operating modes)
- **Heavy-tailed distributions** (occasional extreme spikes are normal)

### Example - Seasonal Pattern Problem:
```
Business Hours (9AM-5PM): CPU avg = 70%
Off Hours (5PM-9AM):      CPU avg = 20%

Problem: 70% CPU at 2PM is normal, but flagged as anomaly
         because overall mean is 45%

Solution: Use time-windowed analysis or separate baselines
```

---

## 🛠️ Implementation in Code

Here's the exact algorithm from `api/src/routes/digital-twin.ts`:

```typescript
// 1. Calculate mean and standard deviation
const values = timeSeries.map(point => point.value);
const mean = values.reduce((a, b) => a + b, 0) / values.length;
const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
const stdDev = Math.sqrt(variance);

// 2. Calculate Z-score for each point
const anomalies = timeSeries
  .map(point => {
    const zScore = (point.value - mean) / stdDev;
    const isAnomaly = Math.abs(zScore) > threshold;
    return {
      timestamp: point.timestamp,
      value: point.value,
      zScore,
      isAnomaly,
      severity: isAnomaly 
        ? (Math.abs(zScore) > 3 ? 'critical' : 'warning')
        : 'normal'
    };
  })
  .filter(point => point.isAnomaly);

// 3. Calculate statistics
const anomalyStats = {
  total: anomalies.length,
  critical: anomalies.filter(a => a.severity === 'critical').length,
  warning: anomalies.filter(a => a.severity === 'warning').length,
  percentage: (anomalies.length / timeSeries.length * 100).toFixed(2)
};
```

---

## 📊 Response Format Explained

```json
{
  "statistics": {
    "dataPoints": 142,      // How many historical points analyzed
    "mean": 45.7,           // Average value
    "stdDev": 12.3,         // Standard deviation (spread)
    "min": 12.5,            // Lowest value seen
    "max": 98.3             // Highest value seen
  },
  "anomalyDetection": {
    "threshold": 2.5,       // Z-score threshold used
    "method": "Z-score",    // Algorithm name
    "detected": {
      "total": 5,           // Total anomalies found
      "critical": 2,        // Z-score > 3 (very rare)
      "warning": 3,         // Z-score > threshold but < 3
      "percentage": "3.52"  // What % of data points are anomalies
    }
  },
  "anomalies": [
    {
      "timestamp": "2025-10-17T14:23:00.000Z",
      "value": 98.3,        // Actual metric value
      "zScore": 4.28,       // How many std deviations from mean
      "severity": "critical",
      "deviation": "115%"   // % difference from mean
    }
  ]
}
```

---

## 🎓 Practical Tips

### 1. Choose the Right Threshold
```powershell
# Start with default
.\Get-DeviceHistory.ps1 -DeviceUuid "UUID" -CheckAnomalies

# Too many anomalies? Increase threshold
.\Get-DeviceHistory.ps1 -DeviceUuid "UUID" -CheckAnomalies -Threshold 3

# Missing real issues? Decrease threshold
.\Get-DeviceHistory.ps1 -DeviceUuid "UUID" -CheckAnomalies -Threshold 2
```

### 2. Need More Data
```powershell
# Expand time window for better statistics
.\Get-DeviceHistory.ps1 -DeviceUuid "UUID" -CheckAnomalies -Hours 168  # 7 days
```

### 3. Focus on Specific Time Periods
```powershell
# Analyze only business hours
$from = "2025-10-18T09:00:00Z"  # 9 AM
$to = "2025-10-18T17:00:00Z"    # 5 PM
curl "http://localhost:4002/api/v1/devices/UUID/twin/anomalies?field=system.cpuUsage&from=$from&to=$to"
```

### 4. Different Thresholds for Different Metrics
```powershell
# CPU: More tolerance (things spike)
.\Get-DeviceHistory.ps1 -DeviceUuid "UUID" -Field "system.cpuUsage" -CheckAnomalies -Threshold 3

# Disk: Less tolerance (should be stable)
.\Get-DeviceHistory.ps1 -DeviceUuid "UUID" -Field "system.diskUsagePercent" -CheckAnomalies -Threshold 2

# Temperature: Very tight tolerance (safety critical)
.\Get-DeviceHistory.ps1 -DeviceUuid "UUID" -Field "sensors.temperature" -CheckAnomalies -Threshold 1.5
```

---

## 🔮 Future Enhancements (Possible Phase 5)

1. **Adaptive Thresholds**: Learn normal ranges per time of day
2. **Trend Detection**: Detect gradual increases over time
3. **Seasonal Patterns**: Account for daily/weekly cycles
4. **Multi-Metric Correlation**: Detect anomalies in combinations
5. **ML-Based Detection**: LSTM/Isolation Forest for complex patterns
6. **Exponential Smoothing**: Weight recent data more heavily
7. **Change Point Detection**: Identify when behavior fundamentally changes

---

## 📚 References

- [Z-Score (Wikipedia)](https://en.wikipedia.org/wiki/Standard_score)
- [Normal Distribution](https://en.wikipedia.org/wiki/Normal_distribution)
- [Anomaly Detection Techniques](https://en.wikipedia.org/wiki/Anomaly_detection)

---

## 🎯 Quick Reference

**Formula:**
```
Z-Score = (Value - Mean) / Standard Deviation
```

**Anomaly if:**
```
|Z-Score| > Threshold (default: 2.5)
```

**Severity:**
```
|Z-Score| > 3.0  → Critical
|Z-Score| > 2.5  → Warning
|Z-Score| ≤ 2.5  → Normal
```

**Probability:**
```
Z < 1.0:  68.27% of data
Z < 2.0:  95.45% of data
Z < 2.5:  98.76% of data
Z < 3.0:  99.73% of data
```

---

Need help tuning thresholds for your specific use case? Just ask! 🚀
