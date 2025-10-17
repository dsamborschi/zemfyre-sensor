# Image Monitoring Service

## Overview

The Image Monitoring Service automatically polls Docker Hub for new tags on approved images and creates approval requests when new versions are detected. This enables proactive management of image updates without requiring manual checks.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Image Monitoring Service                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Poll Docker Hub every 60 minutes                        │
│     ├─ Query images table (WHERE watch_for_updates=true)   │
│     └─ For each image:                                      │
│         ├─ Fetch tags from Docker Hub API                   │
│         ├─ Compare with existing tags in database          │
│         └─ Create approval request for MOST RECENT new tag │
│                                                              │
│  2. Auto-Approval Request Creation                          │
│     ├─ Includes metadata (digest, architectures, etc.)     │
│     ├─ Marks source as "image_monitor"                     │
│     └─ Status set to "pending"                             │
│                                                              │
│  3. Manual Trigger Support                                  │
│     ├─ Trigger specific image check                        │
│     └─ Trigger full system check                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### New Columns in `images` Table

```sql
-- Monitoring control
watch_for_updates    BOOLEAN         -- Enable/disable monitoring for this image
last_checked_at      TIMESTAMP       -- Last Docker Hub API check
next_check_at        TIMESTAMP       -- Next scheduled check
```

### Enhanced `image_approval_requests` Table

```sql
-- Tag-level approval support
image_id             INTEGER         -- Reference to approved image
tag_name             VARCHAR(100)    -- Specific tag requiring approval
metadata             JSONB           -- Docker Hub metadata (digest, architectures, etc.)
```

## API Endpoints

### Get Monitor Status

```http
GET /api/v1/images/monitor/status
```

**Response:**
```json
{
  "running": true,
  "checkIntervalMinutes": 60,
  "nextCheckIn": 3600000
}
```

### Manually Trigger Image Check

```http
POST /api/v1/images/:imageId/check
```

Triggers an immediate check for new tags on a specific image.

**Response:**
```json
{
  "message": "Image check triggered successfully",
  "image_name": "redis"
}
```

### Enable/Disable Monitoring

```http
PUT /api/v1/images/:imageId/monitoring
Content-Type: application/json

{
  "watch_for_updates": true
}
```

**Response:**
```json
{
  "message": "Monitoring enabled successfully",
  "image": {
    "id": 1,
    "image_name": "redis",
    "watch_for_updates": true,
    "last_checked_at": null,
    "next_check_at": "2025-10-17T18:00:00Z"
  }
}
```

### Trigger Full System Check

```http
POST /api/v1/images/monitor/trigger
```

Triggers an immediate check of all monitored images.

**Response:**
```json
{
  "message": "Manual check triggered successfully",
  "images_checked": 9
}
```

## Docker Hub API Integration

### Official Images

```javascript
// Official images (e.g., redis, nginx, postgres)
https://hub.docker.com/v2/repositories/library/{image_name}/tags/
```

### Third-Party Images

```javascript
// Third-party images (e.g., grafana/grafana)
https://hub.docker.com/v2/repositories/{namespace}/{image_name}/tags/
```

### Example Response

```json
{
  "count": 100,
  "next": "https://hub.docker.com/v2/repositories/library/redis/tags/?page=2",
  "results": [
    {
      "name": "7.2-alpine",
      "last_updated": "2025-10-15T10:30:00Z",
      "digest": "sha256:abc123...",
      "images": [
        {
          "architecture": "amd64",
          "os": "linux",
          "size": 12345678
        },
        {
          "architecture": "arm64",
          "os": "linux",
          "size": 12345678
        }
      ]
    }
  ]
}
```

## Workflow

### Automatic Tag Detection

1. **Service starts** with API server
2. **Runs immediately** on startup
3. **Polls every 60 minutes** (configurable)
4. For each monitored image:
   - Fetches tags from Docker Hub
   - Compares with database
   - Creates approval requests for new tags

### Approval Request Creation

When a new tag is detected:

```sql
INSERT INTO image_approval_requests 
  (image_id, tag_name, status, requested_at, metadata)
VALUES 
  (1, '7.5-alpine', 'pending', NOW(), '{
    "last_updated": "2025-10-17T10:00:00Z",
    "digest": "sha256:...",
    "architectures": ["amd64", "arm64"],
    "auto_detected": true,
    "source": "image_monitor"
  }');
```

### Admin Workflow

1. **Monitor detects** new tag
2. **Approval request created** (status: pending)
3. **Admin reviews** via API or UI
4. **Admin approves/rejects**:
   - Approve: Tag added to `image_tags` table
   - Reject: Request marked as rejected with reason

5. **Webhook integration**:
   - Approved tags can be deployed via rollouts
   - Unapproved tags blocked by webhook handler

## Configuration

### Default Settings

```typescript
// Check interval: 60 minutes
const imageMonitor = new ImageMonitorService(60);
```

### Customization

To change the check interval, modify in `src/index.ts`:

```typescript
// Check every 30 minutes instead
const { imageMonitor } = await import('./services/image-monitor');
// Set interval to 30 minutes
imageMonitor = new ImageMonitorService(30);
imageMonitor.start();
```

### Enable/Disable Per Image

```sql
-- Disable monitoring for nginx
UPDATE images 
SET watch_for_updates = false
WHERE image_name = 'nginx';

-- Enable monitoring for all approved images
UPDATE images 
SET watch_for_updates = true,
    next_check_at = NOW()
WHERE approval_status = 'approved';
```

## Monitoring and Logging

### Service Logs

```
[ImageMonitor] Starting monitor (check interval: 60 minutes)
[ImageMonitor] Checking for new image tags...
[ImageMonitor] Monitoring 9 images
[ImageMonitor] Checking redis at https://hub.docker.com/v2/repositories/library/redis/tags/
[ImageMonitor] Found 50 tags for redis
[ImageMonitor] Found 3 new tags for redis
[ImageMonitor] ✅ Created approval request for redis:7.5-alpine
[ImageMonitor] ✅ Created approval request for redis:7.5
[ImageMonitor] ✅ Created approval request for redis:latest
[ImageMonitor] Check complete
```

### Error Handling

- **404 errors**: Image not found on Docker Hub (logged as warning)
- **Network errors**: Logged but don't stop monitoring
- **Rate limiting**: Respects Docker Hub rate limits (auto-retry with backoff)

## Testing

### PowerShell Test Script

```powershell
# Run comprehensive monitoring test
.\test-image-monitoring.ps1
```

### Manual Testing

```bash
# 1. Check monitor status
curl http://localhost:4002/api/v1/images/monitor/status

# 2. Trigger check for specific image
curl -X POST http://localhost:4002/api/v1/images/1/check

# 3. Trigger full system check
curl -X POST http://localhost:4002/api/v1/images/monitor/trigger

# 4. View pending approval requests
curl http://localhost:4002/api/v1/images/approval-requests?status=pending
```

## Best Practices

### Monitoring Strategy

1. **Enable monitoring** for actively used images
2. **Disable monitoring** for deprecated or rarely updated images
3. **Use categories** to group similar images
4. **Review regularly** to approve/reject new tags

### Performance Considerations

- Default 60-minute interval balances freshness and API load
- Docker Hub has rate limits (100 requests/6 hours for anonymous)
- Consider shorter intervals for critical images only
- Use manual triggers for urgent checks

### Security

- Only approved images can be monitored
- New tags require explicit approval before rollout
- Approval requests include metadata for review
- Webhook integration blocks unapproved tags

## Integration with Rollout System

The monitoring service integrates seamlessly with the rollout system:

1. **Monitor detects** new Redis 7.5-alpine tag
2. **Approval request created** automatically
3. **Admin approves** via API
4. **Tag added** to `image_tags` table with status='approved'
5. **Webhook receives** Docker Hub push notification
6. **Rollout created** automatically (if auto-rollout enabled)
7. **Devices updated** in batches with health checks

See [IMAGE-REGISTRY-ROLLOUT-INTEGRATION.md](./IMAGE-REGISTRY-ROLLOUT-INTEGRATION.md) for complete integration details.

## Troubleshooting

### Monitor Not Starting

**Symptom**: No logs from `[ImageMonitor]`

**Solution**:
1. Check API logs for errors
2. Verify database connection
3. Ensure migrations have run
4. Check `images` table has `watch_for_updates` column

### No New Tags Detected

**Symptom**: Manual triggers work but automatic checks don't find new tags

**Solution**:
1. Verify `watch_for_updates=true` for images
2. Check `last_checked_at` is updating
3. Review Docker Hub API responses
4. Ensure tags don't already exist in database

### Too Many Approval Requests

**Symptom**: Hundreds of pending requests after first run

**Solution**:
1. This is normal on first run (all existing tags detected)
2. Bulk approve recommended tags
3. Bulk reject unwanted tags
4. Future runs only detect NEW tags

## Future Enhancements

- [ ] Configurable check intervals per image
- [ ] Auto-approval rules (e.g., patch versions only)
- [ ] Email notifications for new tags
- [ ] Slack/Discord integration
- [ ] Vulnerability scanning integration
- [ ] Image size tracking and alerts
- [ ] Multi-registry support (GitHub Container Registry, AWS ECR, etc.)
