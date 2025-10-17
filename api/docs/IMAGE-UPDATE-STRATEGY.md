# Docker Image Update Strategy - Implementation Plan

## Overview

Implement automated fleet-wide updates when new Docker images are released, with safety mechanisms and rollout strategies.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Registry (Hub)                         │
│                                                                  │
│  New image pushed: myapp:v2.0                                   │
│         ↓                                                        │
│  Webhook triggered                                               │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Zemfyre API Server                            │
│                                                                  │
│  POST /api/v1/webhooks/docker-registry                          │
│         ↓                                                        │
│  1. Parse webhook payload                                       │
│  2. Find all devices using this image                           │
│  3. Apply update policy (staged, manual, auto)                  │
│  4. Update target state for affected devices                    │
│  5. Publish image.update events                                 │
│  6. Monitor rollout progress                                    │
│  7. Rollback if health checks fail                              │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Device Agents (Fleet)                         │
│                                                                  │
│  GET /api/v1/device/:uuid/state (polling with ETag)            │
│         ↓                                                        │
│  Detect target state change (new image version)                 │
│         ↓                                                        │
│  Pull new image: myapp:v2.0                                     │
│         ↓                                                        │
│  Stop old container                                             │
│         ↓                                                        │
│  Start new container                                            │
│         ↓                                                        │
│  Report health status to API                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

### 1. Image Update Policies Table
```sql
CREATE TABLE image_update_policies (
  id SERIAL PRIMARY KEY,
  image_pattern VARCHAR(255) NOT NULL,  -- e.g., 'iotistic/app:*'
  update_strategy VARCHAR(50) NOT NULL, -- 'auto', 'staged', 'manual', 'scheduled'
  
  -- Staged rollout settings
  staged_batches INTEGER DEFAULT 3,     -- Number of batches (e.g., 10%, 50%, 100%)
  batch_delay_minutes INTEGER DEFAULT 30, -- Wait time between batches
  
  -- Health check settings
  health_check_enabled BOOLEAN DEFAULT true,
  health_check_timeout_seconds INTEGER DEFAULT 300,
  auto_rollback BOOLEAN DEFAULT true,
  
  -- Scheduling
  maintenance_window_start TIME,        -- e.g., '02:00:00' (2 AM)
  maintenance_window_end TIME,          -- e.g., '04:00:00' (4 AM)
  
  -- Filters
  fleet_id VARCHAR(255),                -- Limit to specific fleet
  device_tags JSONB,                    -- Only devices with these tags
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_image_pattern ON image_update_policies(image_pattern);
```

### 2. Image Rollouts Table
```sql
CREATE TABLE image_rollouts (
  id SERIAL PRIMARY KEY,
  rollout_id VARCHAR(255) UNIQUE NOT NULL,
  
  -- Image info
  image_name VARCHAR(255) NOT NULL,
  old_tag VARCHAR(100),
  new_tag VARCHAR(100) NOT NULL,
  
  -- Rollout settings
  strategy VARCHAR(50) NOT NULL,
  total_devices INTEGER NOT NULL,
  
  -- Progress tracking
  status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, completed, failed, rolled_back
  current_batch INTEGER DEFAULT 0,
  updated_devices INTEGER DEFAULT 0,
  failed_devices INTEGER DEFAULT 0,
  healthy_devices INTEGER DEFAULT 0,
  
  -- Timestamps
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Metadata
  triggered_by VARCHAR(100),            -- 'webhook', 'manual', 'scheduled'
  webhook_payload JSONB,
  error_message TEXT
);

CREATE INDEX idx_rollout_status ON image_rollouts(status);
CREATE INDEX idx_rollout_image ON image_rollouts(image_name, new_tag);
```

### 3. Device Rollout Status Table
```sql
CREATE TABLE device_rollout_status (
  id SERIAL PRIMARY KEY,
  rollout_id VARCHAR(255) REFERENCES image_rollouts(rollout_id),
  device_uuid VARCHAR(255) NOT NULL,
  
  -- Update progress
  batch_number INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending, updating, completed, failed, rolled_back
  
  -- Health tracking
  old_image_tag VARCHAR(100),
  new_image_tag VARCHAR(100),
  health_check_passed BOOLEAN,
  health_check_details JSONB,
  
  -- Timestamps
  update_started_at TIMESTAMP,
  update_completed_at TIMESTAMP,
  health_checked_at TIMESTAMP,
  
  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);

CREATE INDEX idx_device_rollout ON device_rollout_status(rollout_id, device_uuid);
CREATE INDEX idx_device_status ON device_rollout_status(status);
```

## Implementation Files

### File Structure
```
api/src/
├── routes/
│   └── webhooks.ts          (NEW - Docker registry webhooks)
├── services/
│   ├── image-update-manager.ts  (NEW - Core update logic)
│   ├── rollout-strategies.ts    (NEW - Staged, auto, manual)
│   └── health-checker.ts        (NEW - Verify app health)
├── jobs/
│   └── rollout-monitor.ts   (NEW - Background job to monitor rollouts)
└── utils/
    └── image-matcher.ts     (NEW - Match image patterns)
```

## Update Strategies

### 1. Automatic (Immediate)
```typescript
// All devices updated immediately
// Use for: Dev environments, non-critical apps
{
  strategy: 'auto',
  health_check_enabled: true,
  auto_rollback: true
}
```

### 2. Staged Rollout (Recommended for Production)
```typescript
// Update in batches: 10% → 50% → 100%
// Wait 30 minutes between batches
// Monitor health, rollback if failures
{
  strategy: 'staged',
  staged_batches: 3,  // [10%, 50%, 100%]
  batch_delay_minutes: 30,
  health_check_enabled: true,
  auto_rollback: true
}
```

### 3. Manual Approval
```typescript
// Admin must approve each update
// Use for: Critical infrastructure
{
  strategy: 'manual',
  health_check_enabled: true
}
```

### 4. Scheduled (Maintenance Window)
```typescript
// Update only during maintenance window
// Use for: Production systems with downtime requirements
{
  strategy: 'scheduled',
  maintenance_window_start: '02:00:00',
  maintenance_window_end: '04:00:00',
  health_check_enabled: true
}
```

## Webhook Integration

### Docker Hub Webhook Payload
```json
{
  "push_data": {
    "pushed_at": 1697568000,
    "tag": "v2.0.1"
  },
  "repository": {
    "repo_name": "iotistic/myapp",
    "namespace": "iotistic",
    "name": "myapp"
  }
}
```

### GitHub Container Registry Webhook
```json
{
  "action": "published",
  "package": {
    "name": "myapp",
    "package_version": {
      "version": "v2.0.1",
      "container_metadata": {
        "tag": {
          "name": "v2.0.1"
        }
      }
    }
  },
  "registry": {
    "url": "ghcr.io"
  }
}
```

## Event Sourcing Integration

### New Event Types
```typescript
// Image update events
'image.webhook_received'      // Webhook received from registry
'image.update_available'      // New version detected
'image.rollout_started'       // Rollout initiated
'image.rollout_batch_started' // Batch N started
'image.rollout_batch_completed' // Batch N completed
'image.rollout_completed'     // All devices updated
'image.rollout_failed'        // Rollout failed
'image.rollback_started'      // Rollback initiated
'image.rollback_completed'    // Rollback finished

// Device-level events
'device.image_update_scheduled' // Device added to rollout
'device.image_pulling'          // Pulling new image
'device.image_pulled'           // Image pull complete
'device.container_updating'     // Stopping/starting containers
'device.update_completed'       // Update successful
'device.update_failed'          // Update failed
'device.health_check_passed'    // Health check OK
'device.health_check_failed'    // Health check failed
'device.rolled_back'            // Reverted to old version
```

## Safety Mechanisms

### 1. Health Checks
```typescript
interface HealthCheck {
  type: 'http' | 'tcp' | 'container_running' | 'custom';
  endpoint?: string;           // For HTTP checks
  expected_status?: number;    // 200, 204, etc.
  timeout_seconds: number;
  retry_count: number;
  interval_seconds: number;
}

// Example: HTTP health check
{
  type: 'http',
  endpoint: 'http://localhost:8080/health',
  expected_status: 200,
  timeout_seconds: 30,
  retry_count: 3,
  interval_seconds: 10
}
```

### 2. Automatic Rollback
```typescript
// If health check fails, rollback automatically
async function checkAndRollback(rolloutId: string, deviceUuid: string) {
  const health = await performHealthCheck(deviceUuid);
  
  if (!health.passed) {
    await rollbackDevice(deviceUuid, rolloutId);
    await eventPublisher.publish('device.rolled_back', ...);
    
    // If too many failures, pause rollout
    const failureRate = await getFailureRate(rolloutId);
    if (failureRate > 0.2) { // 20% failure threshold
      await pauseRollout(rolloutId);
      await notifyAdmins(rolloutId, 'High failure rate detected');
    }
  }
}
```

### 3. Rollout Pausing
```typescript
// Pause rollout if issues detected
POST /api/v1/rollouts/:rolloutId/pause
POST /api/v1/rollouts/:rolloutId/resume
POST /api/v1/rollouts/:rolloutId/cancel
POST /api/v1/rollouts/:rolloutId/rollback-all
```

## API Endpoints

### Webhook Endpoint
```typescript
POST /api/v1/webhooks/docker-registry
Body: { push_data: {...}, repository: {...} }
Response: { rollout_id, status, affected_devices }
```

### Policy Management
```typescript
GET    /api/v1/image-policies
POST   /api/v1/image-policies
GET    /api/v1/image-policies/:id
PUT    /api/v1/image-policies/:id
DELETE /api/v1/image-policies/:id
```

### Rollout Management
```typescript
GET    /api/v1/rollouts                    // List all rollouts
GET    /api/v1/rollouts/:rolloutId         // Get rollout details
POST   /api/v1/rollouts/:rolloutId/pause   // Pause rollout
POST   /api/v1/rollouts/:rolloutId/resume  // Resume rollout
POST   /api/v1/rollouts/:rolloutId/cancel  // Cancel rollout
POST   /api/v1/rollouts/:rolloutId/rollback-all  // Rollback all devices

GET    /api/v1/rollouts/:rolloutId/devices // Get device statuses
```

### Manual Trigger
```typescript
POST /api/v1/images/trigger-update
Body: {
  image: "iotistic/myapp:v2.0.1",
  strategy: "staged",
  filters: {
    fleet_id: "production",
    device_tags: ["region:us-east"]
  }
}
```

## Next Steps

1. **Phase 1: Core Infrastructure**
   - Database migrations
   - Webhook endpoint
   - Image update manager service
   - Event sourcing integration

2. **Phase 2: Update Strategies**
   - Automatic updates
   - Staged rollouts
   - Health checking
   - Rollback logic

3. **Phase 3: Monitoring & UI**
   - Rollout dashboard
   - Real-time progress tracking
   - Admin notifications
   - Grafana dashboards

4. **Phase 4: Advanced Features**
   - A/B testing
   - Blue-green deployments
   - Canary deployments
   - Custom health checks

## Configuration Example

```typescript
// config/image-updates.ts
export const ImageUpdateConfig = {
  // Default strategy
  DEFAULT_STRATEGY: 'staged',
  
  // Staged rollout defaults
  STAGED_BATCHES: [0.1, 0.5, 1.0], // 10%, 50%, 100%
  BATCH_DELAY_MINUTES: 30,
  
  // Health check defaults
  HEALTH_CHECK_TIMEOUT: 300,      // 5 minutes
  HEALTH_CHECK_RETRIES: 3,
  HEALTH_CHECK_INTERVAL: 30,      // 30 seconds
  
  // Failure thresholds
  MAX_FAILURE_RATE: 0.2,          // Pause if >20% fail
  MAX_CONSECUTIVE_FAILURES: 3,
  
  // Rollback settings
  AUTO_ROLLBACK: true,
  ROLLBACK_TIMEOUT: 600,          // 10 minutes
  
  // Webhook security
  WEBHOOK_SECRET: process.env.DOCKER_WEBHOOK_SECRET,
  ALLOWED_REGISTRIES: [
    'hub.docker.com',
    'ghcr.io',
    'registry.example.com'
  ]
};
```

Would you like me to implement any specific part of this system first? I'd recommend starting with:

1. **Webhook endpoint** + basic rollout creation
2. **Automatic strategy** (simplest)
3. **Staged rollout strategy** (most useful)
4. **Health checks** + rollback logic

Let me know which part you want to tackle first!
