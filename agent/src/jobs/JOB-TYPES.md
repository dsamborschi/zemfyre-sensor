# Job Types in AWS IoT Jobs

## 1. One-Time Jobs (Current Implementation) ✅

**Default behavior** - jobs execute once and report completion.

```json
{
  "jobId": "update-config-001",
  "operation": "update-configuration",
  "steps": [
    {
      "name": "download-config",
      "type": "runHandler",
      "input": {
        "handler": "download-file",
        "args": ["https://example.com/config.json", "/etc/myapp/config.json"]
      },
      "runAsUser": "root"
    }
  ]
}
```

**Characteristics:**
- ✅ Execute once when received
- ✅ Report SUCCEEDED/FAILED status
- ✅ Simple and reliable
- ✅ Most common use case (90%+ of jobs)

## 2. Recurring Jobs (Enhancement)

Jobs that execute on a schedule until stopped or max executions reached.

```json
{
  "executionType": "recurring",
  "schedule": {
    "type": "interval",
    "intervalMinutes": 60
  },
  "maxExecutions": 24,
  "steps": [...]
}
```

**Use Cases:**
- Health checks every hour
- Log rotation daily
- Monitoring data collection
- Periodic maintenance tasks

## 3. Continuous Jobs (Enhancement)

Long-running jobs that execute continuously with progress reporting.

```json
{
  "executionType": "continuous", 
  "maxDurationMinutes": 1440,
  "reportProgress": true,
  "progressIntervalSeconds": 300,
  "steps": [...]
}
```

**Use Cases:**
- Real-time data streaming
- Continuous monitoring
- Long-running data processing
- Service daemons

## 4. Implementation Approaches

### AWS IoT Native (One-Time Only)
```
Cloud → AWS IoT Jobs → Device → Execute → Report → Complete
```

### Device-Side Scheduling (Recurring/Continuous)
```
Cloud → Send Job Definition → Device Scheduler → Multiple Executions
```

### Hybrid Approach
```
Cloud → Multiple One-Time Jobs (scheduled from cloud)
```

## 5. When to Use Each Type

| Job Type | Best For | AWS IoT Support | Implementation |
|----------|----------|-----------------|----------------|
| **One-Time** | Updates, config changes, reboots | ✅ Native | Standard Jobs API |
| **Recurring** | Health checks, maintenance | ❌ Device-side | Custom scheduler |
| **Continuous** | Monitoring, streaming | ❌ Device-side | Custom engine |

## 6. Current Status

Our Node.js implementation supports:

- ✅ **One-Time Jobs**: Complete implementation with all samples
- 🚧 **Recurring Jobs**: Enhanced engine available (requires node-cron)
- 🚧 **Continuous Jobs**: Enhanced engine available (basic implementation)

## 7. Recommendation

**For most use cases, stick with one-time jobs because:**

1. **AWS Native**: Full AWS IoT support and monitoring
2. **Reliable**: Well-tested and proven pattern
3. **Simple**: Easier to debug and manage
4. **Scalable**: Cloud can orchestrate multiple jobs
5. **Flexible**: Can chain jobs for complex workflows

**Use recurring/continuous only when:**
- Device must operate autonomously for extended periods
- Network connectivity is intermittent
- Local scheduling is more efficient than cloud orchestration