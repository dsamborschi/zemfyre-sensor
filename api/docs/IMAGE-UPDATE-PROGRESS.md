# Image Update System - Implementation Progress

## ✅ Completed (Step 1/4)

### Database Schema
All tables created successfully:

1. **`image_update_policies`** - Defines update strategies per image
   - Auto, staged, manual, scheduled strategies
   - Health check configuration
   - Maintenance windows
   - Device filters (fleet_id, tags, specific UUIDs)

2. **`image_rollouts`** - Tracks each rollout
   - Progress tracking (updated, failed, healthy devices)
   - Failure rate monitoring
   - Batch management
   - Webhook payload storage

3. **`device_rollout_status`** - Per-device status
   - Batch assignment
   - Health check results
   - Timestamps for each step
   - Error tracking with retry logic

4. **`rollout_events`** - Detailed event log
   - All rollout lifecycle events
   - Device-specific events
   - Debugging information

5. **`active_rollouts` view** - Real-time rollout monitoring
   - Progress percentages
   - Device counts by status
   - Policy information

### Migration Files
- ✅ `007_add_image_update_management.sql` - Applied successfully
- ✅ `007_add_image_update_management.js` - Knex version (for reference)

## 🔄 Next Steps (Step 2/4)

### Core Services to Implement

1. **Image Update Manager** (`src/services/image-update-manager.ts`)
   - Find devices using specific image
   - Create rollout
   - Calculate batch sizes
   - Trigger updates

2. **Rollout Strategies** (`src/services/rollout-strategies.ts`)
   - AutoStrategy - Update all immediately
   - StagedStrategy - Batched rollout (10% → 50% → 100%)
   - ManualStrategy - Wait for admin approval
   - ScheduledStrategy - Maintenance window

3. **Health Checker** (`src/services/health-checker.ts`)
   - HTTP health checks
   - TCP port checks
   - Container running status
   - Custom health scripts

4. **Rollback Manager** (`src/services/rollback-manager.ts`)
   - Detect failures
   - Trigger automatic rollback
   - Update target state to old version
   - Track rollback progress

### API Endpoints to Create

1. **Webhook Endpoint** (`src/routes/webhooks.ts`)
   ```typescript
   POST /api/v1/webhooks/docker-registry
   // Receives notifications from Docker Hub/GHCR
   ```

2. **Policy Management**
   ```typescript
   GET    /api/v1/image-policies
   POST   /api/v1/image-policies
   PUT    /api/v1/image-policies/:id
   DELETE /api/v1/image-policies/:id
   ```

3. **Rollout Management**
   ```typescript
   GET  /api/v1/rollouts
   GET  /api/v1/rollouts/:rolloutId
   POST /api/v1/rollouts/:rolloutId/pause
   POST /api/v1/rollouts/:rolloutId/resume
   POST /api/v1/rollouts/:rolloutId/rollback-all
   ```

4. **Manual Trigger**
   ```typescript
   POST /api/v1/images/trigger-update
   // Manually trigger rollout for specific image
   ```

### Background Jobs

1. **Rollout Monitor** (`src/jobs/rollout-monitor.ts`)
   - Check rollout progress
   - Process next batch when ready
   - Monitor health checks
   - Trigger rollbacks if needed
   - Update statistics

2. **Health Check Job**
   - Periodic health checks for updated devices
   - Update device_rollout_status
   - Trigger rollback on failures

## 📋 Recommended Implementation Order

### Phase 1: Core Functionality (Today)
1. ✅ Database schema
2. ⏳ Image Update Manager service
3. ⏳ AutoStrategy (simplest - all devices immediately)
4. ⏳ Webhook endpoint
5. ⏳ Event sourcing integration

### Phase 2: Production Safety (Next)
6. ⏳ StagedStrategy implementation
7. ⏳ Health Checker service
8. ⏳ Rollback Manager
9. ⏳ Rollout Monitor job

### Phase 3: Advanced Features (Later)
10. ⏳ ManualStrategy
11. ⏳ ScheduledStrategy
12. ⏳ Admin UI/Dashboard
13. ⏳ Grafana panels

## 🎯 Test Scenario

Once basic implementation is complete, we'll test:

```bash
# 1. Create update policy
curl -X POST http://localhost:3001/api/v1/image-policies \
  -H "Content-Type: application/json" \
  -d '{
    "image_pattern": "iotistic/myapp:*",
    "update_strategy": "staged",
    "staged_batches": 3,
    "batch_delay_minutes": 5,
    "health_check_enabled": true
  }'

# 2. Simulate webhook (new image pushed)
curl -X POST http://localhost:3001/api/v1/webhooks/docker-registry \
  -H "Content-Type: application/json" \
  -d '{
    "repository": {"repo_name": "iotistic/myapp"},
    "push_data": {"tag": "v2.0.1"}
  }'

# 3. Monitor rollout
curl http://localhost:3001/api/v1/rollouts

# 4. Watch devices update in batches
# Devices poll target state, pull new image, restart
# Health checks verify success
# Next batch starts after delay

# 5. Automatic rollback if failures detected
```

## 📊 Expected Flow

```
1. Docker Hub: New image pushed → Webhook fired
                ↓
2. API: Webhook received → Find matching policy
                ↓
3. API: Create rollout → Calculate batches
                ↓
4. API: Update target state for Batch 1 (10%)
                ↓
5. Devices: Poll state → Pull image → Restart
                ↓
6. API: Run health checks → All pass ✅
                ↓
7. API: Wait 30 minutes → Update Batch 2 (50%)
                ↓
8. Devices: Poll state → Pull image → Restart
                ↓
9. API: Health check → 1 device fails ❌
                ↓
10. API: Rollback failed device automatically
                ↓
11. API: Continue if failure rate < 20%
                ↓
12. API: Update Batch 3 (100%)
                ↓
13. Rollout complete!
```

## 🔧 Configuration

Will be stored in `src/config/image-updates.ts`:

```typescript
export const ImageUpdateConfig = {
  DEFAULT_STRATEGY: 'staged',
  STAGED_BATCHES: [0.1, 0.5, 1.0],     // 10%, 50%, 100%
  BATCH_DELAY_MINUTES: 30,
  HEALTH_CHECK_TIMEOUT: 300,            // 5 minutes
  MAX_FAILURE_RATE: 0.2,                // Pause if >20% fail
  AUTO_ROLLBACK: true,
  WEBHOOK_SECRET: process.env.DOCKER_WEBHOOK_SECRET
};
```

---

**Ready to proceed with Phase 1?** Let me know and I'll start implementing:
1. Image Update Manager service
2. AutoStrategy
3. Webhook endpoint

This will give you a working system that can receive webhooks and update all devices immediately. Then we'll add staged rollouts and health checks in Phase 2.
