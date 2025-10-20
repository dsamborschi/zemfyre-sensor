# Tag Approval Workflow

## Overview

This document describes the complete workflow for discovering, approving, and deploying Docker image tags.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Tag Lifecycle Workflow                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. DISCOVERY (Automated)                                           │
│     ├─ Image Monitor polls Docker Hub every 60 minutes             │
│     ├─ Finds most recent new tag                                   │
│     └─ Creates pending request in image_approval_requests          │
│         └─ Stores: image_id, tag_name, metadata (digest, etc.)    │
│                                                                      │
│  2. REVIEW (Manual)                                                 │
│     ├─ Admin reviews pending requests                              │
│     ├─ Checks metadata: digest, architectures, last_updated       │
│     └─ Approves or rejects                                         │
│         └─ UPDATE image_approval_requests SET status='approved'    │
│                                                                      │
│  3. ACTIVATION (Automated)                                          │
│     ├─ Trigger: POST /api/v1/images/approvals/:id/process         │
│     ├─ Transfers data: approval_requests → image_tags             │
│     └─ Stores: tag, digest, metadata, last_updated                │
│         └─ Tag now available for rollouts                          │
│                                                                      │
│  4. DEPLOYMENT (Manual/Automated)                                   │
│     ├─ Admin creates rollout with approved tag                     │
│     ├─ Devices pull new tag                                        │
│     └─ Rollout Monitor tracks progress                            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Database Tables

### 1. `images` - Approved Base Images
```sql
- id (PK)
- image_name (e.g., "redis", "nginx")
- registry
- approval_status
- watch_for_updates (BOOLEAN)  -- Enable monitoring
- last_checked_at              -- Last Docker Hub poll
```

### 2. `image_approval_requests` - Pending Tag Approvals
```sql
- id (PK)
- image_id (FK → images)
- image_name
- tag_name (e.g., "7.2-alpine")
- status ('pending', 'approved', 'rejected')
- metadata (JSONB)
  {
    "digest": "sha256:...",
    "last_updated": "2025-10-17T...",
    "architectures": ["amd64", "arm64"],
    "source": "image_monitor"
  }
- requested_at
- reviewed_at
- reviewed_by
```

### 3. `image_tags` - Approved Tags Ready for Deployment
```sql
- id (PK)
- image_id (FK → images)
- tag (e.g., "7.2-alpine")
- digest (SHA256)
- architecture
- last_updated (Docker Hub timestamp)
- metadata (JSONB)
  {
    "architectures": ["amd64", "arm64", "arm/v7"],
    "auto_detected": true,
    "source": "image_monitor"
  }
- is_recommended
- is_deprecated
```

## Workflow Steps

### Step 1: Automated Discovery

**Service**: `ImageMonitorService` (`api/src/services/image-monitor.ts`)

**Frequency**: Every 60 minutes

**Process**:
```typescript
1. Query images WHERE watch_for_updates = true
2. For each image:
   a. Fetch tags from Docker Hub API
   b. Sort by last_updated DESC
   c. Find most recent NEW tag (not in image_tags)
   d. Create approval request:
      INSERT INTO image_approval_requests
      (image_id, tag_name, metadata, status)
      VALUES (?, ?, ?, 'pending')
```

**Output**: Pending approval request with full metadata

### Step 2: Manual Review

**UI**: Admin Panel → Approvals Page

**Admin Actions**:
- View pending requests
- Inspect metadata:
  - Digest (image fingerprint)
  - Architectures supported
  - Last updated timestamp
  - Auto-detected vs manual
- Approve or reject with notes

**Database Update**:
```sql
UPDATE image_approval_requests
SET status = 'approved',
    reviewed_by = 'admin@example.com',
    reviewed_at = NOW()
WHERE id = ?
```

### Step 3: Activation (Transfer to image_tags)

**Trigger Options**:

**Option A**: Manual API Call
```bash
POST /api/v1/images/approvals/:id/process
```

**Option B**: Automatic (webhook/background job)
```javascript
// After approval status changes to 'approved'
await processApprovedTag(approvalRequestId);
```

**Process** (see `api/process-approved-tag.js`):
```javascript
1. Read approval_requests WHERE id = ? AND status = 'approved'
2. Extract metadata
3. INSERT INTO image_tags (
     image_id,
     tag,
     digest,
     architecture,
     last_updated,
     metadata
   ) VALUES (...)
4. For multi-arch images, create one row per architecture
5. Mark approval_request as processed
```

### Step 4: Deployment

**Prerequisites**: Tag must exist in `image_tags`

**Rollout Creation**:
```sql
INSERT INTO rollouts (image_id, tag, target_devices, strategy)
VALUES (1, '7.2-alpine', '{uuid1, uuid2}', 'canary')
```

**Device Update**:
- Devices poll for target_state
- Download new image: `redis:7.2-alpine`
- Restart containers
- Report status

## API Endpoints

### Monitoring Control
```
GET    /api/v1/images/monitor/status        - Monitor status
POST   /api/v1/images/:id/check             - Manual trigger check
PUT    /api/v1/images/:id/monitoring        - Enable/disable monitoring
POST   /api/v1/images/monitor/trigger       - Check all images now
```

### Approval Workflow
```
GET    /api/v1/images/approvals              - List pending approvals
GET    /api/v1/images/approvals/:id          - Get approval details
POST   /api/v1/images/approvals/:id/approve  - Approve tag
POST   /api/v1/images/approvals/:id/reject   - Reject tag
POST   /api/v1/images/approvals/:id/process  - Transfer to image_tags
```

### Image & Tag Management
```
GET    /api/v1/images                         - List approved images
GET    /api/v1/images/:id/tags                - List available tags
POST   /api/v1/images/:id/tags/recommended    - Mark tag as recommended
POST   /api/v1/images/:id/tags/deprecated     - Mark tag as deprecated
```

## Example: Complete Flow

### 1. Image Monitor discovers new Redis tag
```
[ImageMonitor] Found 100 new tags for redis
[ImageMonitor] Creating approval request for most recent: redis:7.2.5-alpine
[ImageMonitor] ✅ Created approval request for redis:7.2.5-alpine
```

**Database state**:
```sql
-- image_approval_requests
id=123, image_id=5, tag_name='7.2.5-alpine', status='pending'
metadata={
  "digest": "sha256:abc123...",
  "architectures": ["amd64", "arm64"],
  "last_updated": "2025-10-17T10:30:00Z",
  "source": "image_monitor"
}
```

### 2. Admin reviews and approves
```bash
curl -X POST http://localhost:4002/api/v1/images/approvals/123/approve \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"notes": "Security patches included"}'
```

**Database state**:
```sql
-- image_approval_requests
id=123, status='approved', reviewed_by='admin@example.com'
```

### 3. Process approval (transfer to image_tags)
```bash
node process-approved-tag.js 123
```

**Output**:
```
Processing approved tag: redis:7.2.5-alpine
✅ Added redis:7.2.5-alpine to image_tags
   ✅ Added architecture variant: arm64
✅ Successfully processed approval request 123
```

**Database state**:
```sql
-- image_tags (2 rows created - one per architecture)
id=501, image_id=5, tag='7.2.5-alpine', architecture='amd64', 
  digest='sha256:abc123...', last_updated='2025-10-17 10:30:00',
  metadata='{"architectures":["amd64"],"source":"image_monitor"}'

id=502, image_id=5, tag='7.2.5-alpine', architecture='arm64', 
  digest='sha256:abc123...', last_updated='2025-10-17 10:30:00',
  metadata='{"architectures":["arm64"],"source":"image_monitor"}'
```

### 4. Create rollout with approved tag
```bash
curl -X POST http://localhost:4002/api/v1/rollouts \
  -d '{
    "image": "redis",
    "tag": "7.2.5-alpine",
    "devices": ["device-uuid-1", "device-uuid-2"],
    "strategy": "canary"
  }'
```

**Devices receive update**:
```
Device polls: GET /api/v1/device/{uuid}/state
Response: { apps: { redis: { image: "redis:7.2.5-alpine" } } }
Device pulls image and restarts
```

## Benefits of This Architecture

✅ **Separation of Concerns**
- `images`: Registry-level (which images are allowed)
- `image_tags`: Version-level (which specific versions are available)
- `image_approval_requests`: Workflow-level (pending approvals)

✅ **Audit Trail**
- Every tag has metadata showing when/how it was discovered
- Approval history preserved in approval_requests
- Can track who approved what and when

✅ **Flexibility**
- Multi-architecture support (one tag, multiple arch rows)
- Rich metadata storage in JSONB
- Can query by digest, architecture, source, etc.

✅ **Scalability**
- Indexes on critical fields (metadata GIN, last_updated)
- Efficient queries for "show me latest tags"
- Can handle thousands of tags per image

## Migration Applied

Migration 010 enhanced `image_tags` with:
- `metadata` JSONB column (GIN indexed)
- `last_updated` TIMESTAMP column (indexed DESC)

This allows storing Docker Hub metadata alongside approved tags.
