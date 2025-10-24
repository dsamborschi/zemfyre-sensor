# Offline/No-Internet Resilience - Best Practices

## Industry Analysis: How IoT Platforms Handle Network Failures

### 1. **Balena Supervisor** (Open Source IoT Device Management)

**Philosophy**: "Device should continue operating normally when offline"

**Key Strategies**:
- ✅ **Local-first architecture**: All critical operations work offline
- ✅ **State persistence**: Target state cached in SQLite, survives restarts
- ✅ **Exponential backoff**: API polling backs off from 60s → 2min → 4min → max 15min
- ✅ **Graceful degradation**: Cloud features disabled, local features continue
- ✅ **Queue-based sync**: Actions queued locally, synced when connection returns
- ✅ **No cascading failures**: One service failure doesn't break others

**Implementation**:
```typescript
// Balena polling strategy
pollInterval = baseInterval * Math.pow(2, failureCount);
maxInterval = 15 * 60 * 1000; // 15 minutes
actualInterval = Math.min(pollInterval, maxInterval);
```

**What they DON'T do**:
- ❌ Don't retry failed operations immediately
- ❌ Don't block container operations waiting for cloud
- ❌ Don't kill services when cloud unreachable

---

### 2. **AWS IoT Greengrass** (Edge Runtime for AWS IoT)

**Philosophy**: "Edge should be autonomous and cloud-assisted"

**Key Strategies**:
- ✅ **Offline queue**: MQTT messages queued locally (configurable size: 2.5GB default)
- ✅ **Local lambda execution**: Code runs at edge without cloud
- ✅ **Shadow sync**: Device shadows cached locally, sync when online
- ✅ **Certificate-based retry**: Exponential backoff with jitter (1s → 128s)
- ✅ **Connection health monitoring**: Active keep-alive with fallback
- ✅ **Spooling to disk**: Failed operations persisted to disk queue

**Retry Strategy**:
```
Attempt 1: 1 second
Attempt 2: 2 seconds  
Attempt 3: 4 seconds
Attempt 4: 8 seconds
Attempt 5: 16 seconds
...
Max: 128 seconds (with random jitter ±30%)
```

**Queue Behavior**:
- FIFO queue for messages
- Oldest messages dropped when queue full
- Compression for efficient storage
- Automatic flush when connection restored

---

### 3. **Azure IoT Edge** (Microsoft's Edge Runtime)

**Philosophy**: "Extended offline operation is a feature, not a failure mode"

**Key Strategies**:
- ✅ **Extended offline mode**: Designed for days/weeks offline
- ✅ **Local storage**: Time-series data buffered locally (configurable retention)
- ✅ **Module-to-module routing**: Modules communicate offline via local broker
- ✅ **Automatic reconnection**: Built into IoT Hub SDK with intelligent retry
- ✅ **Health reporting**: Local health checks independent of cloud
- ✅ **Fallback configuration**: Load last-known-good config from disk

**Connection Resilience**:
```csharp
// Azure retry policy (exponential + jitter)
var retryPolicy = new ExponentialBackoff(
    retryCount: int.MaxValue,  // Infinite retries
    minBackoff: TimeSpan.FromSeconds(1),
    maxBackoff: TimeSpan.FromMinutes(5),
    deltaBackoff: TimeSpan.FromSeconds(2)
);
```

**Offline Features**:
- Local ML inference continues
- Data aggregation continues
- Alerts/rules evaluated locally
- Module updates queued for next connection

---

### 4. **AWS IoT Device Client** (Lightweight C++ client)

**Philosophy**: "Resilient by default, configurable for extremes"

**Key Strategies**:
- ✅ **Persistent sessions**: MQTT clean session = false (resume after reconnect)
- ✅ **QoS handling**: QoS 1 messages retried until acknowledged
- ✅ **Connection watchdog**: Detects stale connections, forces reconnect
- ✅ **Backpressure handling**: Rate limiting when network slow
- ✅ **Health metrics**: Track connection uptime, retry counts
- ✅ **Configurable limits**: Max queue size, max retry attempts

**Config Example**:
```json
{
  "mqtt": {
    "reconnect-min-timeout-sec": 1,
    "reconnect-max-timeout-sec": 128,
    "keep-alive-sec": 60,
    "ping-timeout-ms": 5000,
    "max-queued-messages": 10000
  }
}
```

---

## **Current Iotistic Agent Analysis**

### ✅ **What We Do Well**
1. **State Persistence**: Target state in SQLite (survives restarts)
2. **Exponential Backoff**: API polling backs off on errors (implemented)
3. **MQTT Auto-Reconnect**: `reconnectPeriod: 5000ms` in MQTT client
4. **Continue on Failure**: Container reconciliation continues despite failures
5. **Retry Manager**: K8s-style retry with exponential backoff for images
6. **Local Operations**: Container management works offline
7. **Health Checks**: Independent of cloud connectivity

### ❌ **What We're Missing**

#### **1. No Offline Queue for Cloud Operations**
**Problem**: If API binder fails to report state, data is lost (no retry)

**Example**:
```typescript
// Current: Report fails → data lost
await this.reportState(); // If this throws, metrics gone forever
```

**Solution**: Queue failed reports to disk:
```typescript
private reportQueue: StateReport[] = [];
private readonly MAX_QUEUE_SIZE = 1000;

async reportState() {
  try {
    await this.sendReport(currentState);
    await this.flushQueue(); // Send queued reports
  } catch (error) {
    this.queueReport(currentState); // Save to queue
  }
}
```

#### **2. No Connection State Tracking**
**Problem**: No visibility into online/offline status

**Solution**: Add connectivity monitor:
```typescript
interface ConnectionState {
  isOnline: boolean;
  lastSuccessfulPoll: number;
  lastSuccessfulReport: number;
  consecutiveFailures: number;
  offlineSince?: number;
}
```

#### **3. No Graceful Degradation Logic**
**Problem**: Features don't adapt to offline mode

**Solution**: Disable cloud-dependent features when offline:
```typescript
if (connectionState.offlineSince && Date.now() - connectionState.offlineSince > 5 * 60 * 1000) {
  // Offline for 5+ minutes
  console.log('📴 Entering offline mode');
  this.cloudJobsAdapter?.pause(); // Stop polling cloud jobs
  this.shadowFeature?.enableLocalMode(); // Use cached shadow
}
```

#### **4. No Metrics Buffering**
**Problem**: System metrics lost when cloud unreachable

**Solution**: Buffer metrics to disk:
```typescript
private metricsBuffer: SystemMetrics[] = [];
private readonly MAX_METRICS_BUFFER = 1000;

async collectMetrics() {
  const metrics = await systemMetrics.collect();
  this.metricsBuffer.push(metrics);
  
  if (this.isOnline) {
    await this.flushMetrics();
  }
}
```

#### **5. No Jitter in Backoff**
**Problem**: Multiple devices reconnect simultaneously (thundering herd)

**Solution**: Add random jitter:
```typescript
const baseInterval = this.config.pollInterval * Math.pow(2, this.pollErrors);
const jitter = Math.random() * 0.3; // ±30%
const interval = baseInterval * (1 + jitter);
```

#### **6. No Connection Health Reporting**
**Problem**: Can't diagnose connectivity issues from cloud

**Solution**: Report connection health:
```typescript
interface ConnectionHealth {
  status: 'online' | 'degraded' | 'offline';
  uptime: number;
  lastPollSuccess: number;
  lastReportSuccess: number;
  pollFailures: number;
  reportFailures: number;
}
```

---

## **Recommended Implementation Plan**

### **Phase 1: Connection State Management (High Priority)**

**Goal**: Track and expose connection status

```typescript
// agent/src/connection-monitor.ts
export class ConnectionMonitor {
  private state: ConnectionState;
  
  markSuccess(operation: 'poll' | 'report') {
    this.state.isOnline = true;
    this.state.consecutiveFailures = 0;
    this.state[`last${operation}Success`] = Date.now();
    delete this.state.offlineSince;
  }
  
  markFailure(operation: 'poll' | 'report') {
    this.state.consecutiveFailures++;
    if (this.state.consecutiveFailures >= 3 && !this.state.offlineSince) {
      this.state.isOnline = false;
      this.state.offlineSince = Date.now();
      this.emit('offline');
    }
  }
  
  isOnline(): boolean {
    return this.state.isOnline;
  }
  
  getOfflineDuration(): number {
    return this.state.offlineSince 
      ? Date.now() - this.state.offlineSince 
      : 0;
  }
}
```

**Integration**:
```typescript
// api-binder.ts
private connectionMonitor = new ConnectionMonitor();

async pollTargetState() {
  try {
    await this.fetchTargetState();
    this.connectionMonitor.markSuccess('poll');
  } catch (error) {
    this.connectionMonitor.markFailure('poll');
  }
}
```

---

### **Phase 2: Offline Queue (Medium Priority)**

**Goal**: Persist failed operations for retry when online

```typescript
// agent/src/offline-queue.ts
export class OfflineQueue<T> {
  private queue: T[] = [];
  private readonly maxSize: number;
  private readonly persistPath: string;
  
  constructor(maxSize: number, persistPath: string) {
    this.maxSize = maxSize;
    this.persistPath = persistPath;
    this.loadFromDisk();
  }
  
  enqueue(item: T): void {
    this.queue.push(item);
    if (this.queue.length > this.maxSize) {
      this.queue.shift(); // Drop oldest
    }
    this.saveToDisk();
  }
  
  async flush(sendFn: (item: T) => Promise<void>): Promise<void> {
    while (this.queue.length > 0) {
      const item = this.queue[0];
      await sendFn(item);
      this.queue.shift();
      this.saveToDisk();
    }
  }
  
  private async loadFromDisk() {
    // Load queue from SQLite or JSON file
  }
  
  private async saveToDisk() {
    // Save queue to disk
  }
}
```

**Usage**:
```typescript
// api-binder.ts
private stateQueue = new OfflineQueue<DeviceStateReport>(1000, './data/state-queue.json');

async reportState() {
  const report = await this.buildReport();
  
  try {
    await this.sendReport(report);
    await this.stateQueue.flush(r => this.sendReport(r)); // Flush queued
  } catch (error) {
    this.stateQueue.enqueue(report); // Queue for later
  }
}
```

---

### **Phase 3: Graceful Degradation (Low Priority)**

**Goal**: Adapt feature behavior based on connectivity

```typescript
// supervisor.ts
private connectionMonitor = ConnectionMonitor.getInstance();

private async handleConnectionState(state: ConnectionState) {
  if (state.isOnline) {
    console.log('✅ Connection restored');
    this.cloudJobsAdapter?.resume();
    this.shadowFeature?.enableCloudSync();
  } else if (this.connectionMonitor.getOfflineDuration() > 5 * 60 * 1000) {
    console.log('📴 Entering offline mode (5+ minutes offline)');
    this.cloudJobsAdapter?.pause();
    this.shadowFeature?.enableLocalMode();
  }
}
```

---

### **Phase 4: Add Jitter to Backoff (Low Priority)**

**Goal**: Prevent thundering herd on reconnect

```typescript
// api-binder.ts
private calculateBackoff(): number {
  const baseInterval = this.config.pollInterval * Math.pow(2, this.pollErrors - 1);
  const jitter = Math.random() * 0.3 * baseInterval; // ±30%
  const withJitter = baseInterval + jitter;
  const maxInterval = 15 * 60 * 1000; // 15 minutes
  return Math.min(withJitter, maxInterval);
}
```

---

## **Configuration Strategy**

Add offline resilience settings to config:

```json
{
  "config": {
    "features": { ... },
    "settings": {
      "reconciliationIntervalMs": 30000,
      "offline": {
        "enableQueue": true,
        "maxQueueSize": 1000,
        "maxOfflineMetricsBuffer": 500,
        "offlineThresholdSeconds": 300,
        "enableGracefulDegradation": true,
        "maxBackoffSeconds": 900,
        "enableJitter": true
      }
    }
  }
}
```

---

## **Summary: What to Implement First**

### **Priority 1: Connection State Tracking**
- Simple to implement
- High visibility into issues
- Foundation for other features
- **Effort**: 2-3 hours

### **Priority 2: Add Jitter to Existing Backoff**
- Prevents thundering herd
- One-line change to existing code
- **Effort**: 15 minutes

### **Priority 3: Offline Queue for State Reports**
- Prevents data loss
- Uses existing SQLite database
- **Effort**: 4-6 hours

### **Priority 4: Graceful Degradation**
- Nice-to-have, not critical
- Complex to test
- **Effort**: 8-10 hours

---

## **Best Practices Summary**

✅ **DO**:
- Persist everything important (state, config, queues)
- Use exponential backoff with jitter
- Continue local operations offline
- Track connection health metrics
- Queue failed operations to disk
- Make reconnection automatic and transparent
- Set reasonable max backoff (15 minutes typical)

❌ **DON'T**:
- Don't block critical operations waiting for cloud
- Don't retry immediately on failure
- Don't lose data when offline
- Don't cascade failures (isolate components)
- Don't retry forever without max backoff
- Don't hammer the API on reconnect (use jitter)

---

## **References**

- [Balena Supervisor Source](https://github.com/balena-os/balena-supervisor)
- [AWS IoT Greengrass Offline Operations](https://docs.aws.amazon.com/greengrass/v2/developerguide/offline-operations.html)
- [Azure IoT Edge Offline Capabilities](https://learn.microsoft.com/en-us/azure/iot-edge/offline-capabilities)
- [AWS IoT Device Client](https://github.com/awslabs/aws-iot-device-client)
- [MQTT Persistent Sessions](https://www.hivemq.com/blog/mqtt-essentials-part-7-persistent-session-queuing-messages/)
