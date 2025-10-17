# Image Registry & Rollout Integration Guide

## Overview

This guide explains how the **Image Registry** (approved images system) integrates with the **Rollout System** (image update automation) to provide secure, controlled deployments across your IoT fleet.

---

## Architecture Flow

```
┌─────────────────────┐
│  Docker Hub/GHCR    │  
│  Webhook            │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Webhook Handler (/api/v1/webhooks/docker-registry)             │
│                                                                  │
│  1. Parse webhook payload (image name + tag)                    │
│  2. Find matching image_update_policy                           │
│  3. ✨ NEW: Check approval status in image registry             │
│     - Skip for internal images (iotistic/*)                     │
│     - Verify image exists in `images` table                     │
│     - Check approval_status = 'approved'                        │
│     - Verify tag exists in `image_tags` table                   │
│     - Check tag is not deprecated                               │
│  4. Create rollout if approved                                  │
│  5. Start rollout (update device target states)                 │
└─────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Rollout Monitor (30s interval)                                 │
│                                                                  │
│  - Monitors rollout progress                                    │
│  - Advances batches (staged rollouts)                           │
│  - Checks device health after updates                           │
│  - Triggers auto-rollback if failures exceed threshold          │
└─────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Devices                                                         │
│                                                                  │
│  - Poll for target state (ETag caching)                         │
│  - Download and deploy new image                                │
│  - Report current state + health metrics                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Integration Points

### 1. Webhook Approval Check

**Location**: `src/routes/webhooks.ts` (lines ~185-280)

**Logic**:

```typescript
// 1. Determine if image is internal (iotistic/*) or public
const isInternalImage = imageName.startsWith('iotistic/');

if (!isInternalImage) {
  // 2. Check if image exists and is approved
  const approvalCheck = await pool.query(
    `SELECT id, approval_status FROM images 
     WHERE image_name = $1 AND registry = $2`,
    [baseImageName, registry]
  );

  // 3. Reject if not found or not approved
  if (!approvalCheck.rows[0] || approvalCheck.rows[0].approval_status !== 'approved') {
    // Create approval request
    // Return 403 Forbidden
  }

  // 4. Check if specific tag exists and is not deprecated
  const tagCheck = await pool.query(
    `SELECT id, is_deprecated FROM image_tags 
     WHERE image_id = $1 AND tag = $2`,
    [imageId, tag]
  );

  // 5. Auto-add new tags for approved images
  // 6. Reject if tag is deprecated
}

// 7. Proceed with rollout creation
```

**Approval Outcomes**:

| Scenario | Action | HTTP Status | Database Action |
|----------|--------|-------------|-----------------|
| Internal image (iotistic/*) | ✅ Skip check, proceed | 200 OK | Create rollout |
| Image not in registry | ⛔ Create approval request | 403 Forbidden | Insert `image_approval_requests` |
| Image status = pending/rejected | ⛔ Reject deployment | 403 Forbidden | None |
| Image approved, tag not found | ⚠️ Auto-add tag, proceed | 200 OK | Insert `image_tags`, create rollout |
| Image approved, tag deprecated | ⛔ Reject deployment | 403 Forbidden | None |
| Image approved, tag exists | ✅ Proceed | 200 OK | Create rollout |

---

## Deployment Workflows

### Workflow 1: Internal Image (iotistic/agent)

```bash
# CI/CD pushes new image
docker push iotistic/agent:v2.1.0

# Docker Hub sends webhook
POST /api/v1/webhooks/docker-registry
{
  "repository": {"repo_name": "iotistic/agent"},
  "push_data": {"tag": "v2.1.0"}
}

# Webhook handler:
# ✅ Detects internal image → skip approval check
# ✅ Creates rollout immediately
# ✅ Updates device target states

# Result: Deployment starts within seconds
```

---

### Workflow 2: Approved Public Image (redis:7.5-alpine)

**Pre-requisite**: Admin has already approved redis via API

```bash
# Admin approved redis beforehand
POST /api/v1/images
{
  "image_name": "redis",
  "category": "database",
  "description": "Redis in-memory data store"
}

POST /api/v1/images/1/tags
{
  "tag": "7.5-alpine",
  "is_recommended": true
}

# Docker Hub webhook arrives
POST /api/v1/webhooks/docker-registry
{
  "repository": {"repo_name": "redis"},
  "push_data": {"tag": "7.5-alpine"}
}

# Webhook handler:
# ✅ Checks registry: redis exists, status=approved
# ✅ Checks tag: 7.5-alpine exists, not deprecated
# ✅ Creates rollout
# ✅ Updates device target states

# Result: Deployment proceeds
```

---

### Workflow 3: New Tag for Approved Image (redis:7.6-alpine)

```bash
# Docker Hub webhook for new tag
POST /api/v1/webhooks/docker-registry
{
  "repository": {"repo_name": "redis"},
  "push_data": {"tag": "7.6-alpine"}
}

# Webhook handler:
# ✅ Checks registry: redis exists, status=approved
# ⚠️  Tag 7.6-alpine not found in image_tags
# ✅ Auto-adds tag with is_recommended=false
# ✅ Creates rollout
# ✅ Updates device target states

# Result: Deployment proceeds, admin can review tag later
```

---

### Workflow 4: Unapproved Image (portainer/portainer-ce)

```bash
# Docker Hub webhook for unknown image
POST /api/v1/webhooks/docker-registry
{
  "repository": {"repo_name": "portainer/portainer-ce"},
  "push_data": {"tag": "latest"}
}

# Webhook handler:
# ⛔ Checks registry: portainer-ce NOT FOUND
# 📝 Creates approval request in image_approval_requests
# ⛔ Returns 403 Forbidden

# Response:
{
  "error": "Image not approved",
  "message": "Image 'portainer/portainer-ce' is not in the approved registry",
  "action_required": "Admin must approve this image before deployment"
}

# Result: Deployment blocked, admin notified
```

**Admin Action Required**:

```bash
# Admin reviews and approves
POST /api/v1/images
{
  "image_name": "portainer-ce",
  "namespace": "portainer",
  "category": "management"
}

POST /api/v1/images/10/tags
{
  "tag": "latest"
}

# Future webhooks will now succeed
```

---

### Workflow 5: Deprecated Tag (redis:6-alpine)

```bash
# Admin marks old tag as deprecated
PUT /api/v1/images/1/tags/8
{
  "is_deprecated": true
}

# Docker Hub webhook arrives (e.g., security patch)
POST /api/v1/webhooks/docker-registry
{
  "repository": {"repo_name": "redis"},
  "push_data": {"tag": "6-alpine"}
}

# Webhook handler:
# ✅ Checks registry: redis exists, status=approved
# ✅ Checks tag: 6-alpine exists
# ⛔ Tag is deprecated
# ⛔ Returns 403 Forbidden

# Response:
{
  "error": "Tag deprecated",
  "message": "Tag '6-alpine' for image 'redis' is marked as deprecated"
}

# Result: Deployment blocked, forces use of newer versions
```

---

## Configuration

### Image Update Policy

Create policy to enable automatic updates:

```sql
INSERT INTO image_update_policies (
  image_pattern,
  update_strategy,
  batch_size,
  batch_delay_minutes,
  enabled
) VALUES (
  'redis:*',           -- Match all redis tags
  'staged',            -- Gradual rollout
  3,                   -- 3 devices per batch
  5,                   -- 5 min between batches
  true
);
```

### Approved Image

Add image to registry:

```bash
POST /api/v1/images
{
  "image_name": "redis",
  "registry": "docker.io",
  "namespace": "library",
  "description": "Redis in-memory data store",
  "category": "database",
  "is_official": true
}
```

### Approved Tags

Add specific versions:

```bash
POST /api/v1/images/1/tags
{
  "tag": "7-alpine",
  "is_recommended": true,
  "architecture": "amd64"
}
```

---

## Security Benefits

### Before Integration (No Registry)

❌ **Any** Docker Hub webhook could trigger deployments  
❌ No control over which public images are deployed  
❌ No tag versioning control  
❌ Difficult to prevent deprecated/vulnerable versions  

### After Integration (With Registry)

✅ Only **approved** images can be deployed  
✅ Admin controls which public images are available  
✅ Tag-level control (recommended, deprecated)  
✅ Audit trail for all approvals  
✅ Automatic approval requests for review  
✅ Internal images (iotistic/*) bypass for speed  

---

## Database Schema Integration

### Tables Used

1. **`images`** - Approved images registry
2. **`image_tags`** - Approved tags per image
3. **`image_approval_requests`** - Pending approvals
4. **`image_update_policies`** - Rollout policies (existing)
5. **`image_update_rollouts`** - Active rollouts (existing)
6. **`device_target_state`** - Device configurations (existing)

### Foreign Key Relationships

```
images (1) ──< (N) image_tags
                   └─ Used for tag validation in webhook

image_update_policies ──> (triggers) ──> image_update_rollouts
                                         └─ Created after approval check
```

---

## API Endpoints Reference

### Image Registry Management

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/images` | GET | List approved images |
| `/api/v1/images/:id` | GET | Get image details with tags |
| `/api/v1/images` | POST | Add new approved image |
| `/api/v1/images/:id` | PUT | Update image details |
| `/api/v1/images/:id` | DELETE | Remove image |
| `/api/v1/images/:id/tags` | POST | Add tag to image |
| `/api/v1/images/:id/tags/:tagId` | PUT | Update tag (deprecate, recommend) |
| `/api/v1/images/:id/tags/:tagId` | DELETE | Remove tag |
| `/api/v1/images/categories` | GET | List categories |

### Webhook (Integration Point)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/webhooks/docker-registry` | POST | **Receive webhooks + check approvals** |

### Rollouts (Downstream)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/rollouts` | GET | List rollouts |
| `/api/v1/rollouts/:id` | GET | Get rollout details |
| `/api/v1/rollouts/:id/pause` | POST | Pause rollout |
| `/api/v1/rollouts/:id/resume` | POST | Resume rollout |
| `/api/v1/rollouts/:id/cancel` | POST | Cancel rollout |

---

## Monitoring & Observability

### Event Stream

All actions publish events for monitoring:

```typescript
// Image approved
'image.registry.added'

// Tag added
'image.tag.added'

// Webhook received
'image.webhook_received'

// Approval check passed
'image.webhook_approved'

// Approval check failed
'image.webhook_rejected'

// Rollout created
'image.rollout_created'

// Rollout progressed
'image.rollout_batch_completed'
```

### Logs

Look for these log patterns:

```
[Webhook] Checking approval status for public image: redis
[Webhook] ✅ Image approved for deployment: redis:7.5-alpine
[Webhook] ⚠️  Image not found in approved registry: unknown-image
[Webhook] ⚠️  Tag not found in approved list: 7.6-alpine
[Webhook] ✅ Auto-added tag 7.6-alpine to approved image redis
```

---

## Troubleshooting

### Issue: Webhook Rejected (403 Forbidden)

**Symptom**:
```json
{
  "error": "Image not approved",
  "message": "Image 'xyz' is not in the approved registry"
}
```

**Resolution**:
1. Check if image exists: `GET /api/v1/images?search=xyz`
2. Add image if missing: `POST /api/v1/images`
3. Add required tags: `POST /api/v1/images/:id/tags`
4. Retry webhook or wait for next push

---

### Issue: Tag Auto-Added but Rollout Failed

**Symptom**: Tag created but rollout not starting

**Possible Causes**:
1. No matching `image_update_policy`
2. Policy is disabled
3. No devices match filters

**Resolution**:
```sql
-- Check policy exists and is enabled
SELECT * FROM image_update_policies 
WHERE image_pattern LIKE '%redis%';

-- Check devices match
SELECT COUNT(*) FROM device_target_state;
```

---

### Issue: Internal Image Rejected

**Symptom**: `iotistic/agent` webhook returns 403

**Cause**: Internal image check logic broken

**Resolution**: Verify namespace detection:
```typescript
const isInternalImage = 
  imageName.startsWith('iotistic/') || 
  imageName.startsWith('ghcr.io/dsamborschi/');
```

---

## Performance Considerations

### Webhook Response Time

- **Without approval check**: ~50-100ms
- **With approval check**: ~150-250ms (2-3 DB queries)
- **Impact**: Negligible, webhooks are async

### Database Indexes

Ensure these indexes exist (created by migration):

```sql
CREATE INDEX idx_images_name ON images(image_name);
CREATE INDEX idx_images_status ON images(approval_status);
CREATE INDEX idx_image_tags_image_id ON image_tags(image_id);
CREATE INDEX idx_image_tags_tag ON image_tags(tag);
```

### Caching Opportunities

For high-traffic webhooks, consider caching:

```typescript
// Cache approved images for 5 minutes
const approvedImagesCache = new NodeCache({ stdTTL: 300 });
```

---

## Future Enhancements

### Phase 1 (Current) ✅
- [x] Database schema for approved images
- [x] CRUD API for image management
- [x] Webhook integration with approval checks
- [x] Auto-add tags for approved images
- [x] Deprecation enforcement

### Phase 2 (Planned)
- [ ] Admin UI for approval workflow
- [ ] Email notifications for approval requests
- [ ] Bulk approve operations
- [ ] Tag auto-discovery from Docker Hub API
- [ ] Security vulnerability scanning integration
- [ ] Multi-architecture tag support

### Phase 3 (Future)
- [ ] RBAC - different admin roles
- [ ] Image mirroring to private registry
- [ ] Automated testing before approval
- [ ] Compliance rules (only allow LTS versions)
- [ ] Cost tracking per image

---

## Testing the Integration

### Test 1: Approved Image Deployment

```powershell
# Ensure redis is approved
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/images/1" -Method Get

# Send webhook
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/webhooks/docker-registry" `
  -Method POST `
  -Body (@{
    repository = @{ repo_name = "redis" }
    push_data = @{ tag = "7.5-alpine" }
  } | ConvertTo-Json) `
  -ContentType "application/json"

# Expected: 200 OK, rollout created
```

### Test 2: Unapproved Image Rejection

```powershell
# Send webhook for unapproved image
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/webhooks/docker-registry" `
  -Method POST `
  -Body (@{
    repository = @{ repo_name = "memcached" }
    push_data = @{ tag = "latest" }
  } | ConvertTo-Json) `
  -ContentType "application/json"

# Expected: 403 Forbidden, approval request created

# Check approval request
docker exec -i iotistic-postgres psql -U postgres -d iotistic \
  -c "SELECT * FROM image_approval_requests WHERE image_name='memcached';"
```

### Test 3: Internal Image Bypass

```powershell
# Send webhook for internal image
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/webhooks/docker-registry" `
  -Method POST `
  -Body (@{
    repository = @{ repo_name = "iotistic/agent" }
    push_data = @{ tag = "v2.1.0" }
  } | ConvertTo-Json) `
  -ContentType "application/json"

# Expected: 200 OK, no approval check, rollout created
```

---

## Summary

The integration provides **secure, controlled deployments** by:

1. ✅ Validating all public images against approved registry
2. ✅ Auto-creating approval requests for unknown images
3. ✅ Enforcing tag deprecation policies
4. ✅ Bypassing checks for internal images (speed)
5. ✅ Auto-adding new tags for approved images (convenience)
6. ✅ Maintaining full audit trail via events

**Result**: Admins control the supply chain while maintaining automation speed.
