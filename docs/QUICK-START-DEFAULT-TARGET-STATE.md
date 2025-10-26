# Quick Start: Testing Automatic Default Target State

## What's New?

Every device now automatically gets a default target state configuration during provisioning, based on your license plan features. No more manual configuration required!

## Test with New Device

### 1. Provision a New Device

```bash
# Using curl
curl -X POST http://localhost:3002/api/v1/device/register \
  -H "Content-Type: application/json" \
  -d '{
    "uuid": "test-device-$(date +%s)",
    "provisioningKey": "YOUR_PROVISIONING_KEY",
    "deviceName": "Test Device"
  }'
```

### 2. Verify Target State Created

**PowerShell**:
```powershell
# Connect to PostgreSQL
docker exec -it postgres psql -U postgres -d iotistic

# Check target state
SELECT 
  device_uuid,
  config->'settings'->>'metricsIntervalMs' as metrics_interval,
  config->'features'->>'enableCloudJobs' as cloud_jobs,
  config->'logging'->>'level' as log_level
FROM device_target_state
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result** (based on your license):
| Plan | Metrics Interval | Cloud Jobs | Log Level |
|------|-----------------|------------|-----------|
| Starter | 60000ms (1 min) | true | info |
| Professional | 30000ms (30s) | true | info |
| Enterprise | 10000ms (10s) | true | debug |

### 3. Watch Agent Poll Target State

```bash
# Watch API logs
docker logs -f api-container

# You should see within 10 seconds:
📡 Device abc123... polling for target state
   Version: 1, Updated: 2025-01-15T...
   🎯 ETags differ - sending new state
```

### 4. Verify Metrics Appear

- **Starter**: Within 60 seconds
- **Professional**: Within 30 seconds  
- **Enterprise**: Within 10 seconds

## Apply to Existing Devices

If you already have devices without target state:

```bash
# Navigate to API directory
cd api

# Run migration script
npm run apply-default-target-state
```

**Example Output**:
```
🔄 Starting default target state application...

📋 License: professional plan
   Subscription: active

📊 Found 3 device(s) without target state:

   Default Config:
   - Logging Level: info
   - Metrics Interval: 30000ms (30s)
   - Device Report Interval: 20000ms
   - Cloud Jobs: Enabled
   - Metrics Export: Disabled

   Processing: Office Sensor
      UUID: abc123...
      ✅ Target state created

✅ Summary:
   Total Devices: 3
   Success: 3
   Errors: 0

💡 Devices will receive new target state on next poll (within 10 seconds)
   Metrics should start appearing in dashboard within 30s
```

## Verify License Configuration

### Check Current License

```sql
SELECT 
  value->>'plan' as plan,
  value->'features'->>'hasApiAccess' as has_api_access,
  value->'features'->>'hasDedicatedPrometheus' as has_prometheus,
  value->'subscription'->>'status' as subscription_status
FROM system_config
WHERE key = 'license_data';
```

### Expected Feature Mapping

| License Feature | Agent Config | Description |
|----------------|--------------|-------------|
| `plan: "starter"` | `metricsIntervalMs: 60000` | 1-minute metrics |
| `plan: "professional"` | `metricsIntervalMs: 30000` | 30-second metrics |
| `plan: "enterprise"` | `metricsIntervalMs: 10000` | 10-second metrics |
| `hasDedicatedPrometheus: true` | `enableMetricsExport: true` | Prometheus export |

**Note**: `enableCloudJobs` is always enabled since API access is required for the system to function.

## Troubleshooting

### No Metrics Appearing

**Check 1**: Does device have target state?
```sql
SELECT COUNT(*) FROM device_target_state 
WHERE device_uuid = 'YOUR_DEVICE_UUID';
-- Should return 1
```

**Fix**: Run migration script
```bash
cd api && npm run apply-default-target-state
```

**Check 2**: What's the metrics interval?
```sql
SELECT config->'settings'->>'metricsIntervalMs' 
FROM device_target_state 
WHERE device_uuid = 'YOUR_DEVICE_UUID';
```

**Fix**: Wait for the interval period:
- 60000ms = 1 minute
- 30000ms = 30 seconds
- 10000ms = 10 seconds

### Wrong Configuration

**If enterprise customer but metrics slow**:

1. Check license in system_config
2. Run migration to regenerate config:
```bash
cd api && npm run apply-default-target-state
```

## Files Changed

| File | Purpose |
|------|---------|
| `api/src/services/default-target-state-generator.ts` | ✅ NEW - Generates config from license |
| `api/src/routes/provisioning.ts` | ✅ UPDATED - Auto-creates target state |
| `api/src/scripts/apply-default-target-state.ts` | ✅ NEW - Migration script |
| `api/package.json` | ✅ UPDATED - Added npm script |
| `docs/AUTOMATIC-DEFAULT-TARGET-STATE.md` | ✅ NEW - Full documentation |

## Next Steps

1. **Test new device provisioning** - Provision a device and verify target state created
2. **Run migration script** - Apply to existing devices: `npm run apply-default-target-state`
3. **Monitor metrics** - Verify dashboard shows metrics within expected interval
4. **Check audit logs** - Ensure no target state creation errors

## Full Documentation

See [AUTOMATIC-DEFAULT-TARGET-STATE.md](./AUTOMATIC-DEFAULT-TARGET-STATE.md) for complete details including:
- Architecture diagrams
- Configuration mapping tables
- Test procedures
- Monitoring queries
- Future enhancements
