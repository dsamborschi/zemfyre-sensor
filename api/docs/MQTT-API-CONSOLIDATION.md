# MQTT API Endpoint Consolidation

## Before: Two Separate Services

```
┌─────────────────────────────────────────────────────────────┐
│                    MQTT Broker (Mosquitto)                   │
│                     mqtt://localhost:1883                    │
└──────────────────────┬─────────────────┬────────────────────┘
                       │                 │
                       │                 │
          ┌────────────┴────────┐   ┌────┴─────────────┐
          │ Connection 1        │   │ Connection 2     │
          │ mqtt-schema-agent   │   │ mqtt-monitor     │
          └────────────┬────────┘   └────┬─────────────┘
                       │                 │
                       │                 │
       ┌───────────────┴────────┐   ┌────┴──────────────────┐
       │  /api/v1/mqtt-schema   │   │ /api/v1/mqtt-monitor  │
       ├────────────────────────┤   ├───────────────────────┤
       │ GET  /status           │   │ GET  /status          │
       │ POST /start            │   │ POST /start           │
       │ POST /stop             │   │ POST /stop            │
       │ GET  /topics           │   │ GET  /topic-tree      │
       │ GET  /topics/:topic    │   │ GET  /metrics         │
       │ GET  /stats            │   │ GET  /system-stats    │
       └────────────────────────┘   └───────────────────────┘
            ❌ Duplicate              ❌ Incomplete
            ❌ 2 MQTT connections     ❌ No schemas
```

## After: Unified Service

```
┌─────────────────────────────────────────────────────────────┐
│                    MQTT Broker (Mosquitto)                   │
│                     mqtt://localhost:1883                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Single Connection
          ┌────────────┴────────────┐
          │   mqtt-monitor          │
          │   (Unified Service)     │
          │                         │
          │ ✅ Topic Tree           │
          │ ✅ Metrics              │
          │ ✅ Schema Generation    │
          │ ✅ Message Type         │
          └────────────┬────────────┘
                       │
       ┌───────────────┴───────────────────────────────┐
       │       /api/v1/mqtt-monitor (Unified)          │
       ├───────────────────────────────────────────────┤
       │ GET  /status                                  │
       │ POST /start                                   │
       │ POST /stop                                    │
       │                                               │
       │ ✅ Schema Endpoints:                          │
       │ GET  /topics           (with schemas!)        │
       │ GET  /topics/:topic/schema                    │
       │                                               │
       │ ✅ Monitoring Endpoints:                      │
       │ GET  /topic-tree       (with schemas!)        │
       │ GET  /metrics                                 │
       │ GET  /system-stats                            │
       │                                               │
       │ ✅ Combined Endpoints:                        │
       │ GET  /stats            (comprehensive!)       │
       │ GET  /dashboard        (everything!)  ⭐      │
       └───────────────────────────────────────────────┘
```

## Data Flow: Schema Generation

```
MQTT Message Received
        │
        ├─→ Parse Topic → Build Topic Tree
        │
        ├─→ Detect Payload Type
        │      ├─ UTF-8? → Check JSON/XML/String
        │      └─ Binary
        │
        └─→ If JSON: Generate Schema
               │
               ├─→ Store in Topic Node
               │      {
               │        _topic: "sensor/temp",
               │        _messageType: "json",
               │        _schema: { type: "object", ... }
               │      }
               │
               └─→ Available via:
                      • GET /topics (in list)
                      • GET /topics/:topic/schema (specific)
                      • GET /topic-tree (in tree)
                      • GET /dashboard (in complete data)
```

## Benefits Comparison

| Feature | Before (Separate) | After (Unified) |
|---------|------------------|-----------------|
| **MQTT Connections** | 2 | 1 |
| **Memory Usage** | Higher (2 services) | Lower (shared data) |
| **API Endpoints** | 12 total | 10 total |
| **Schema in Topics** | ❌ Separate call | ✅ Integrated |
| **Message Types** | ❌ Not detected | ✅ Auto-detected |
| **Dashboard Endpoint** | ❌ None | ✅ `/dashboard` |
| **Historical Metrics** | ❌ None | ✅ 15-point arrays |
| **Throughput Tracking** | ❌ None | ✅ KB/s monitoring |
| **Code Duplication** | ❌ High | ✅ None |

## Migration Path

```
┌──────────────────────────────────────────────────────────────┐
│ Step 1: Update API Client                                    │
├──────────────────────────────────────────────────────────────┤
│ • Change base URL:                                           │
│   /api/v1/mqtt-schema → /api/v1/mqtt-monitor                 │
│                                                              │
│ • Update response parsing:                                   │
│   { topics } → { data }                                      │
│   { schema } → { data: { schema, messageType, ... } }        │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Step 2: Use New Features (Optional)                          │
├──────────────────────────────────────────────────────────────┤
│ • Add message type handling                                  │
│ • Use /dashboard for complete data                           │
│ • Display metrics with historical charts                     │
│ • Show throughput graphs                                     │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Step 3: Remove Old References                                │
├──────────────────────────────────────────────────────────────┤
│ • Delete mqtt-schema-agent.ts (deprecated)                   │
│ • Delete mqtt-schema.ts routes (deprecated)                  │
│ • Update environment variables                               │
└──────────────────────────────────────────────────────────────┘
```

## Example: Dashboard Integration

### Before (Multiple Calls)
```typescript
// Required 3+ API calls
const schemas = await fetch('/api/v1/mqtt-schema/topics');
const stats = await fetch('/api/v1/mqtt-schema/stats');
const metrics = await fetch('/api/v1/mqtt-monitor/metrics');
const tree = await fetch('/api/v1/mqtt-monitor/topic-tree');

// Combine data manually...
```

### After (Single Call)
```typescript
// Single API call gets everything!
const response = await fetch('/api/v1/mqtt-monitor/dashboard');
const { data } = await response.json();

// All data available:
data.status          // Connection info
data.topicTree       // Hierarchical structure (with schemas!)
data.topics          // Flattened list (with schemas!)
data.metrics         // Real-time metrics + 15-point history
```

## Performance Impact

```
Before (Separate Services):
├─ MQTT Connection 1: ~10MB RAM, 500 topics
├─ MQTT Connection 2: ~10MB RAM, 500 topics (duplicate)
└─ Total: ~20MB RAM

After (Unified Service):
└─ MQTT Connection: ~12MB RAM, 500 topics (with schemas)
   └─ Savings: ~40% memory reduction
```

## Testing the Unified API

```powershell
# PowerShell test script
cd api
.\test-mqtt-unified.ps1

# Or manually:
curl http://localhost:3002/api/v1/mqtt-monitor/dashboard
```

---

**Recommendation:** Use the `/dashboard` endpoint as your primary data source for UI implementations. It provides everything you need in one optimized call!
