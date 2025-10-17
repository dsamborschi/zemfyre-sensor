# Image Update System - Quick Start Guide

## 🚀 Quick Start (5 minutes)

### 1. Create Your First Policy

```bash
cd C:\Users\Dan\zemfyre-sensor\api
npx ts-node scripts/test-image-updates.ts
```

This creates a test policy for `iotistic/myapp:*` images.

### 2. Start the API Server

```bash
npm run dev
```

Server starts on `http://localhost:3001`

### 3. Test the Webhook

```bash
# Windows PowerShell
curl -X POST http://localhost:3001/api/v1/webhooks/docker-registry `
  -H "Content-Type: application/json" `
  -d '{\"repository\": {\"repo_name\": \"iotistic/myapp\"}, \"push_data\": {\"tag\": \"v2.0.1\"}}'

# Or use bash/WSL
curl -X POST http://localhost:3001/api/v1/webhooks/docker-registry \
  -H "Content-Type: application/json" \
  -d '{"repository": {"repo_name": "iotistic/myapp"}, "push_data": {"tag": "v2.0.1"}}'
```

### 4. Monitor the Rollout

```bash
# View active rollouts
npx ts-node -e "
import pool from './src/db/connection';
(async () => {
  const result = await pool.pool.query('SELECT * FROM active_rollouts');
  console.table(result.rows);
  await pool.close();
})();
"
```

## 📋 Common Commands

### Create Policy (SQL)

```sql
INSERT INTO image_update_policies (
  image_pattern,
  update_strategy,
  staged_batches,
  batch_delay_minutes,
  health_check_enabled,
  auto_rollback_enabled,
  enabled
) VALUES (
  'iotistic/nodered:*',
  'staged',
  3,
  30,
  true,
  true,
  true
);
```

### View Rollouts

```sql
-- Active rollouts
SELECT * FROM active_rollouts;

-- All rollouts
SELECT 
  rollout_id,
  image_name,
  old_tag || ' → ' || new_tag as update,
  strategy,
  status,
  total_devices,
  updated_devices,
  failed_devices,
  created_at
FROM image_rollouts
ORDER BY created_at DESC;

-- Device statuses
SELECT 
  d.device_name,
  drs.batch_number,
  drs.status,
  drs.old_image_tag || ' → ' || COALESCE(drs.new_image_tag, 'pending') as update,
  drs.scheduled_at
FROM device_rollout_status drs
JOIN devices d ON drs.device_uuid = d.uuid
WHERE drs.rollout_id = 'your-rollout-id'
ORDER BY drs.batch_number, d.device_name;
```

### Update Policy

```sql
-- Pause all updates for an image
UPDATE image_update_policies
SET enabled = false
WHERE image_pattern = 'iotistic/myapp:*';

-- Change strategy
UPDATE image_update_policies
SET update_strategy = 'manual',
    batch_delay_minutes = 60
WHERE image_pattern = 'iotistic/myapp:*';
```

## 🔍 Monitoring Queries

### Rollout Progress

```sql
SELECT 
  image_name,
  new_tag,
  status,
  ROUND((updated_devices::float / NULLIF(total_devices, 0) * 100), 1) as progress_pct,
  updated_devices || '/' || total_devices as devices_updated,
  ROUND(failure_rate * 100, 1) || '%' as failure_rate,
  current_batch || '/' || jsonb_array_length(batch_sizes) as batch_progress
FROM image_rollouts
WHERE status IN ('in_progress', 'paused')
ORDER BY created_at DESC;
```

### Failed Devices

```sql
SELECT 
  d.device_name,
  ir.image_name,
  ir.new_tag,
  drs.error_message,
  drs.retry_count,
  drs.failed_at
FROM device_rollout_status drs
JOIN devices d ON drs.device_uuid = d.uuid
JOIN image_rollouts ir ON drs.rollout_id = ir.rollout_id
WHERE drs.status = 'failed'
ORDER BY drs.failed_at DESC;
```

### Recent Events

```sql
SELECT 
  event_type,
  message,
  event_data,
  timestamp
FROM rollout_events
ORDER BY timestamp DESC
LIMIT 20;
```

## 🎯 Update Strategies

### Auto Strategy
- Updates all devices immediately
- No batches
- Use for: Non-critical services, dev environments

```sql
UPDATE image_update_policies
SET update_strategy = 'auto'
WHERE image_pattern = 'iotistic/dev-*';
```

### Staged Strategy (Recommended)
- Updates in batches: 10% → 50% → 100%
- Delays between batches
- Use for: Production services

```sql
UPDATE image_update_policies
SET update_strategy = 'staged',
    staged_batches = 3,
    batch_delay_minutes = 30
WHERE image_pattern = 'iotistic/production-*';
```

### Manual Strategy (Coming in Phase 2)
- Creates rollout but waits for admin approval
- Use for: Critical services

### Scheduled Strategy (Coming in Phase 2)
- Updates during maintenance windows
- Use for: Services with strict uptime requirements

## 🔧 Troubleshooting

### Webhook Not Triggering Rollout

1. Check policy exists and is enabled:
```sql
SELECT * FROM image_update_policies WHERE enabled = true;
```

2. Check pattern matches:
```sql
SELECT 'iotistic/myapp:v2.0.1' ~ image_pattern as matches,
       image_pattern
FROM image_update_policies;
```

3. Check for devices using the image:
```sql
SELECT 
  d.device_name,
  ts.state->>'image' as image,
  ts.state->>'tag' as tag
FROM devices d
JOIN device_target_state ts ON d.uuid = ts.device_uuid
WHERE ts.state->>'image' = 'iotistic/myapp';
```

### Rollout Stuck

Check rollout status:
```sql
SELECT 
  rollout_id,
  status,
  current_batch,
  updated_devices,
  failed_devices,
  failure_rate
FROM image_rollouts
WHERE status = 'paused' OR status = 'in_progress';
```

Check when last device was scheduled:
```sql
SELECT 
  MAX(scheduled_at) as last_scheduled,
  NOW() - MAX(scheduled_at) as time_since
FROM device_rollout_status
WHERE rollout_id = 'your-rollout-id';
```

### View Logs

```sql
SELECT 
  event_type,
  device_uuid,
  message,
  event_data,
  timestamp
FROM rollout_events
WHERE rollout_id = 'your-rollout-id'
ORDER BY timestamp DESC;
```

## 📡 Webhook Setup

### Docker Hub

1. Go to your Docker Hub repository
2. Click "Webhooks" tab
3. Add webhook:
   - Name: `Zemfyre Rollout`
   - URL: `https://your-domain.com/api/v1/webhooks/docker-registry`
   - Secret: (optional, set in `DOCKER_WEBHOOK_SECRET` env var)

### GitHub Container Registry (GHCR)

1. Go to repository settings
2. Navigate to Webhooks
3. Add webhook:
   - Payload URL: `https://your-domain.com/api/v1/webhooks/docker-registry`
   - Content type: `application/json`
   - Secret: (optional)
   - Events: Select "Package published"

## 🔐 Security

### Enable Webhook Signature Verification

```bash
# .env file
DOCKER_WEBHOOK_SECRET=your-random-secret-here
```

The system will verify webhook signatures using HMAC SHA-256.

### Test Webhook Endpoint

```bash
curl http://localhost:3001/api/v1/webhooks/docker-registry/test
```

## 📊 Example Workflow

```bash
# 1. Developer pushes new image
docker push iotistic/myapp:v2.0.1

# 2. Docker Hub fires webhook automatically
#    → API receives webhook
#    → Creates rollout
#    → Starts staged deployment

# 3. Monitor progress
watch -n 5 "psql -c 'SELECT * FROM active_rollouts'"

# 4. Devices poll and update
#    Batch 1 (10%) updates immediately
#    Wait 30 minutes
#    Batch 2 (50%) updates
#    Wait 30 minutes
#    Batch 3 (100%) updates

# 5. Rollout complete!
```

## 🎓 Next Steps

Ready for Phase 2? Implement:
- Health checks after each batch
- Automatic rollback on failures
- Background rollout monitor
- Admin API endpoints

See `docs/IMAGE-UPDATE-PROGRESS.md` for the roadmap!
