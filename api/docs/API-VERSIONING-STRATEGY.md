# API Versioning Strategy

## Current Implementation

### Centralized Version Control (✅ Implemented)

```typescript
// In src/index.ts
const API_VERSION = process.env.API_VERSION || 'v1';
const API_BASE = `/api/${API_VERSION}`;
```

**Benefits:**
- Single source of truth for API version
- Easy to switch all routes: change `API_VERSION` or set `API_VERSION=v2` env var
- Works for routes that use the centralized mount pattern

**Usage:**
```typescript
app.use(API_BASE, rolloutRoutes);           // → /api/v1/rollouts/...
app.use(`${API_BASE}/webhooks`, webhookRoutes); // → /api/v1/webhooks/...
```

---

## Current Route Patterns

### ✅ Routes Using Centralized Versioning (Good)
These routes **don't** define `/api/v1` in their router files:

- `rolloutRoutes` → Mounted at `API_BASE`
- `imageRegistryRoutes` → Mounted at `API_BASE`
- `deviceJobsRoutes` → Mounted at `API_BASE`
- `scheduledJobsRoutes` → Mounted at `API_BASE`
- `webhookRoutes` → Mounted at `${API_BASE}/webhooks`

**Example (correct pattern):**
```typescript
// routes/rollouts.ts
router.get('/rollouts', ...) // No /api/v1 prefix
router.post('/rollouts', ...)
```

### ⚠️ Routes with Hardcoded Versioning (Needs Refactoring)
These routes **do** define `/api/v1` in their router files:

- `provisioningRoutes` → Defines routes like `/api/v1/provisioning-keys`
- `devicesRoutes` → Defines routes like `/api/v1/devices`
- `adminRoutes` → Defines routes like `/api/v1/admin/heartbeat`
- `appsRoutes` → Defines routes like `/api/v1/applications`
- `deviceStateRoutes` → Defines routes like `/api/v1/device/:uuid/state`

**Example (needs refactoring):**
```typescript
// routes/devices.ts (current - hardcoded)
router.get('/api/v1/devices', ...) // ❌ Version hardcoded

// routes/devices.ts (recommended - flexible)
router.get('/devices', ...)        // ✅ Version from mount point
```

---

## Recommended Refactoring Path

### Option 1: Quick Fix - Environment Variable Override
**Pros:** No code changes needed  
**Cons:** Still hardcoded in route files

Set environment variable:
```bash
API_VERSION=v2 npm start
```

But routes with hardcoded `/api/v1` still use v1! This only affects centralized routes.

### Option 2: Refactor Routes (Recommended)
**Pros:** True centralized versioning, future-proof  
**Cons:** Requires editing 5 route files

**Steps:**

1. **Update route files** to remove `/api/v1` prefix:

```typescript
// Before: routes/devices.ts
router.get('/api/v1/devices', ...)
router.get('/api/v1/devices/:uuid', ...)

// After: routes/devices.ts
router.get('/devices', ...)
router.get('/devices/:uuid', ...)
```

2. **Update index.ts** to mount with version:

```typescript
// Instead of:
app.use(devicesRoutes); // Routes define /api/v1/devices internally

// Do this:
app.use(API_BASE, devicesRoutes); // Mount at /api/v1, routes define /devices
```

3. **Files to refactor:**
   - `src/routes/provisioning.ts`
   - `src/routes/devices.ts`
   - `src/routes/admin.ts`
   - `src/routes/apps.ts`
   - `src/routes/device-state.ts`

### Option 3: Folder-Based Versioning (Industry Standard)

**Structure:**
```
src/
├── routes/
│   ├── v1/
│   │   ├── devices.ts
│   │   ├── apps.ts
│   │   ├── admin.ts
│   │   └── ...
│   └── v2/
│       ├── devices.ts    # New v2 implementation
│       ├── apps.ts       # New v2 implementation
│       └── ...
├── index.ts
```

**Mount both versions simultaneously:**
```typescript
// src/index.ts
import devicesV1 from './routes/v1/devices';
import devicesV2 from './routes/v2/devices';

app.use('/api/v1', devicesV1);
app.use('/api/v2', devicesV2);
```

**Benefits:**
- Support multiple API versions simultaneously
- Gradual migration path for clients
- Clear separation of version-specific logic
- Can deprecate old versions gracefully

**When to use:**
- When introducing breaking changes
- When you need to support legacy clients
- When API v1 and v2 have different business logic

---

## Migration Strategy Comparison

| Approach | Complexity | Flexibility | Breaking Changes | Best For |
|----------|-----------|-------------|------------------|----------|
| **Current (Mixed)** | Low | Low | None | Status quo |
| **Centralized Constant** | Low | Medium | None | Single version at a time |
| **Refactored Routes** | Medium | High | None (backward compatible) | Clean architecture |
| **Folder-Based** | High | Very High | None (supports both) | Multiple versions |

---

## Recommended Action Plan

### Phase 1: Quick Win (Already Done ✅)
- [x] Add `API_VERSION` and `API_BASE` constants
- [x] Update centralized routes to use `API_BASE`
- [x] Add version info to root endpoint

### Phase 2: Refactor Existing Routes (Optional)
- [ ] Refactor `provisioning.ts` to remove `/api/v1` prefix
- [ ] Refactor `devices.ts` to remove `/api/v1` prefix
- [ ] Refactor `admin.ts` to remove `/api/v1` prefix
- [ ] Refactor `apps.ts` to remove `/api/v1` prefix
- [ ] Refactor `device-state.ts` to remove `/api/v1` prefix
- [ ] Update `index.ts` mounts to use `API_BASE`

### Phase 3: Future-Proof (When v2 is needed)
- [ ] Create `src/routes/v1/` folder
- [ ] Move all current routes to `v1/`
- [ ] Create `src/routes/v2/` folder
- [ ] Implement v2 routes with breaking changes
- [ ] Mount both versions in `index.ts`
- [ ] Add deprecation warnings to v1 endpoints

---

## Environment Variable Usage

```bash
# Development
API_VERSION=v1 npm run dev

# Production
API_VERSION=v1 npm start

# Testing v2 (future)
API_VERSION=v2 npm run dev
```

---

## Real-World Examples

### Stripe API (Folder-Based)
```
/v1/customers
/v1/charges
/v2/customers  # New features
/v2/charges    # Breaking changes
```

### Twitter API (Date-Based Versioning)
```
/2/tweets      # v2 released
/1.1/statuses  # Legacy v1.1
```

### GitHub API (Header-Based)
```
Accept: application/vnd.github.v3+json
```

---

## Current Status Summary

✅ **Implemented:**
- Centralized `API_VERSION` constant
- Environment variable override support
- Half of routes use centralized versioning

⚠️ **Mixed State:**
- 5 routes still have hardcoded `/api/v1`
- 5 routes use centralized mounting

🎯 **Recommendation:**
For your use case (single active version, easy switching), **Option 2 (Refactor Routes)** is ideal. This gives you:
- One-line version change capability
- Clean, maintainable code
- No breaking changes
- Easy migration to folder-based when needed

Would you like me to proceed with Phase 2 refactoring?
