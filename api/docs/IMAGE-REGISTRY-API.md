# Image Registry API Documentation

## Overview

The Image Registry API provides comprehensive management of approved Docker images and their tags. This allows administrators to control which public images (redis, postgres, nginx, etc.) are available for deployment across the IoT fleet.

**Base URL**: `http://localhost:4002/api/v1`

---

## Database Schema

### Tables

1. **`images`** - Registry of approved Docker images
   - `id` - Primary key
   - `image_name` - Image name (e.g., "redis", "postgres")
   - `registry` - Registry URL (default: "docker.io")
   - `namespace` - Namespace/organization (e.g., "library", "grafana")
   - `description` - Human-readable description
   - `category` - Category (database, web, runtime, monitoring, management)
   - `is_official` - Boolean flag for official images
   - `approval_status` - Status (pending, approved, rejected)
   - `approved_by` - Admin who approved
   - `approved_at` - Approval timestamp
   - `created_at`, `updated_at` - Timestamps

2. **`image_tags`** - Available tags/versions for each image
   - `id` - Primary key
   - `image_id` - Foreign key to images table
   - `tag` - Version tag (e.g., "7-alpine", "latest")
   - `digest` - SHA256 digest
   - `size_bytes` - Image size
   - `architecture` - Platform (amd64, arm64, etc.)
   - `os` - Operating system (linux, windows)
   - `pushed_at` - When tag was pushed to registry
   - `is_recommended` - Boolean (only one per image)
   - `is_deprecated` - Boolean flag
   - `security_scan_status` - Scan result
   - `vulnerabilities_count` - Number of vulnerabilities
   - `created_at`, `updated_at` - Timestamps

3. **`image_approval_requests`** - Workflow tracking
   - `id` - Primary key
   - `image_name` - Requested image
   - `registry` - Registry URL
   - `requested_by` - Who requested
   - `requested_at` - Request timestamp
   - `status` - Status (pending, approved, rejected)
   - `reviewed_by` - Admin who reviewed
   - `reviewed_at` - Review timestamp
   - `notes` - Review notes
   - `rejection_reason` - Reason if rejected

---

## API Endpoints

### 1. List All Images

**GET** `/images`

Returns all approved images with tag counts.

**Query Parameters**:
- `status` - Filter by approval status (pending, approved, rejected)
- `category` - Filter by category (database, web, runtime, etc.)
- `search` - Search in image name or description

**Response**:
```json
{
  "images": [
    {
      "id": 1,
      "image_name": "redis",
      "registry": "docker.io",
      "namespace": "library",
      "description": "Redis in-memory data structure store",
      "category": "database",
      "is_official": true,
      "approval_status": "approved",
      "approved_at": "2025-10-17T...",
      "created_at": "2025-10-17T...",
      "tag_count": 5
    }
  ],
  "total": 10
}
```

**Example**:
```powershell
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/images" -Method Get
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/images?category=database" -Method Get
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/images?search=redis" -Method Get
```

---

### 2. Get Image Details

**GET** `/images/:id`

Returns single image with all available tags.

**Response**:
```json
{
  "id": 1,
  "image_name": "redis",
  "registry": "docker.io",
  "description": "In-memory data structure store...",
  "category": "database",
  "approval_status": "approved",
  "tags": [
    {
      "id": 1,
      "tag": "7.5-alpine",
      "is_recommended": true,
      "is_deprecated": false,
      "architecture": "amd64",
      "os": "linux"
    },
    {
      "id": 2,
      "tag": "7.4-alpine",
      "is_recommended": false,
      "architecture": "amd64"
    }
  ]
}
```

**Example**:
```powershell
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/images/1" -Method Get
```

---

### 3. Get Categories

**GET** `/images/categories`

Returns list of all image categories with counts.

**Response**:
```json
{
  "categories": [
    { "category": "database", "count": 5 },
    { "category": "runtime", "count": 2 },
    { "category": "web", "count": 1 }
  ]
}
```

**Example**:
```powershell
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/images/categories" -Method Get
```

---

### 4. Add New Image

**POST** `/images`

Adds a new image to the approved registry.

**Request Body**:
```json
{
  "image_name": "portainer-ce",
  "registry": "docker.io",
  "namespace": "portainer",
  "description": "Lightweight container management UI",
  "category": "management",
  "is_official": false
}
```

**Response**: Returns created image object with `id`.

**Example**:
```powershell
$newImage = @{
  image_name = "portainer-ce"
  namespace = "portainer"
  description = "Container management UI"
  category = "management"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4002/api/v1/images" `
  -Method Post -Body $newImage -ContentType "application/json"
```

---

### 5. Update Image

**PUT** `/images/:id`

Updates image details (description, category, approval_status).

**Request Body**:
```json
{
  "description": "Updated description",
  "category": "database",
  "approval_status": "approved"
}
```

**Example**:
```powershell
$update = @{
  description = "In-memory data structure store, used as database, cache, and message broker"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4002/api/v1/images/1" `
  -Method Put -Body $update -ContentType "application/json"
```

---

### 6. Delete Image

**DELETE** `/images/:id`

Removes image from registry. Fails if image has active update policies.

**Response**:
```json
{
  "message": "Image deleted successfully",
  "image": { ... }
}
```

**Example**:
```powershell
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/images/10" -Method Delete
```

---

### 7. Add Tag to Image

**POST** `/images/:id/tags`

Adds a new tag/version to an image.

**Request Body**:
```json
{
  "tag": "7.5-alpine",
  "digest": "sha256:abc123...",
  "size_bytes": 45000000,
  "architecture": "amd64",
  "os": "linux",
  "is_recommended": false
}
```

**Behavior**: If `is_recommended: true`, automatically unmarks other tags as recommended (ensures only one recommended tag per image).

**Example**:
```powershell
$newTag = @{
  tag = "7.5-alpine"
  is_recommended = $false
  architecture = "amd64"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4002/api/v1/images/1/tags" `
  -Method Post -Body $newTag -ContentType "application/json"
```

---

### 8. Update Tag

**PUT** `/images/:imageId/tags/:tagId`

Updates tag details (recommended, deprecated, security status).

**Request Body**:
```json
{
  "is_recommended": true,
  "is_deprecated": false,
  "security_scan_status": "passed",
  "vulnerabilities_count": 0
}
```

**Behavior**: Setting `is_recommended: true` automatically unmarks other tags.

**Example**:
```powershell
$update = @{
  is_recommended = $true
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4002/api/v1/images/1/tags/5" `
  -Method Put -Body $update -ContentType "application/json"
```

---

### 9. Delete Tag

**DELETE** `/images/:imageId/tags/:tagId`

Removes a tag from an image.

**Response**:
```json
{
  "message": "Tag deleted successfully",
  "tag": { ... }
}
```

**Example**:
```powershell
Invoke-RestMethod -Uri "http://localhost:4002/api/v1/images/1/tags/3" -Method Delete
```

---

## Pre-Populated Data

The migration includes these official images:

| Image | Category | Tags |
|-------|----------|------|
| redis | database | 7-alpine (recommended), 7.2-alpine, 7.4-alpine, latest |
| postgres | database | - |
| nginx | web | - |
| node | runtime | - |
| python | runtime | - |
| mysql | database | - |
| mongo | database | - |
| influxdb | database | - |
| grafana/grafana | monitoring | - |

---

## Event Sourcing

All registry operations publish events:

- `image.registry.added` - New image added
- `image.registry.updated` - Image details updated
- `image.registry.deleted` - Image removed
- `image.tag.added` - New tag added

Events include actor, timestamp, and change details for audit trail.

---

## Integration with Webhook System

### Current State

The webhook system (`/api/v1/webhooks/docker-registry`) currently uses the `image_update_policies` table to determine which images to accept.

### Planned Integration

1. **Webhook Validation**: Before creating a rollout, check if image exists in `images` table with `approval_status = 'approved'`
2. **Tag Validation**: Verify the specific tag exists in `image_tags` table
3. **Rejection Flow**: If not approved, either:
   - Reject webhook immediately
   - Auto-create `image_approval_requests` entry for admin review
4. **iotistic/* Images**: Continue using existing webhook for iotistic namespace images (already approved in CI/CD)

### Example Integration

```typescript
// In webhooks.ts, before creating rollout:
const imageCheck = await pool.query(
  `SELECT i.id, i.approval_status 
   FROM images i
   WHERE i.image_name = $1 AND i.registry = $2`,
  [imageName, registry]
);

if (imageCheck.rows.length === 0 || imageCheck.rows[0].approval_status !== 'approved') {
  // Create approval request or reject
  return res.status(403).json({ 
    error: 'Image not approved',
    message: 'This image must be approved before deployment'
  });
}

// Check tag exists
const tagCheck = await pool.query(
  `SELECT id FROM image_tags 
   WHERE image_id = $1 AND tag = $2`,
  [imageCheck.rows[0].id, tag]
);

if (tagCheck.rows.length === 0) {
  return res.status(404).json({ 
    error: 'Tag not found',
    message: 'This tag is not in the approved tags list'
  });
}
```

---

## Testing

See `test-image-registry.ps1` for comprehensive test suite covering:

✅ List all images  
✅ Get image details with tags  
✅ Filter by category  
✅ Search functionality  
✅ Get categories list  
✅ Add new image  
✅ Add new tag  
✅ Update tag (mark as recommended)  
✅ Auto-unmark other recommended tags  

---

## Security Considerations

1. **Admin-Only Access**: Add authentication middleware to all POST/PUT/DELETE endpoints
2. **Image Validation**: Verify image exists in Docker Hub before approval
3. **Tag Verification**: Validate tags against registry before adding
4. **Audit Trail**: All changes logged via event sourcing
5. **Rate Limiting**: Consider rate limits on webhook endpoints

---

## Future Enhancements

1. **Approval Workflow UI**: Admin panel for reviewing approval requests
2. **Automated Security Scans**: Integration with Trivy/Clair for vulnerability scanning
3. **Tag Auto-Discovery**: Fetch available tags from Docker Hub API
4. **Multi-Architecture Support**: Track tags per architecture (arm64, amd64)
5. **Deprecation Warnings**: Alert when deprecated tags are deployed
6. **Usage Analytics**: Track which images/tags are most deployed

---

## Related Documentation

- [IMAGE-UPDATE-COMPLETE-FIX.md](./IMAGE-UPDATE-COMPLETE-FIX.md) - Image update system overview
- [DOCKERHUB-WEBHOOK-INTEGRATION.md](./DOCKERHUB-WEBHOOK-INTEGRATION.md) - Webhook integration guide
- Database migration: `database/migrations/008_add_image_registry.sql`
- API routes: `src/routes/image-registry.ts`
- Test script: `test-image-registry.ps1`
