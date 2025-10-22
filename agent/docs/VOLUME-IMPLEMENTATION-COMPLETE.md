# Volume Implementation - Complete ✅

## Overview

Successfully implemented full volume support for the Iotistic Sensor container orchestration system, following the same pattern as network management. Volumes are now fully integrated across backend orchestration and frontend UI.

## Implementation Summary

### Phase 1: Setup & Labels ✅
**Status**: Complete  
**Build**: ✅ TypeScript compilation successful

#### Files Relocated
- `src/volume.ts` → `src/compose/volume.ts` (164 lines)
- `src/volume-manager.ts` → `src/compose/volume-manager.ts` (112 lines)

#### Label Namespace Updated
- Changed from `io.balena.*` to `iotistic.*`
- Labels: `iotistic.managed`, `iotistic.app-id`, `iotistic.app-uuid`
- Added to `lib/constants.ts`: `defaultVolumeLabels = { 'iotistic.managed': 'true' }`

#### Type Definitions Added
**In `src/compose/types.ts`**:
```typescript
export type LabelObject = Record<string, string>

export interface VolumeConfig {
  driver: string
  driverOpts: Record<string, string>
  labels: LabelObject
}

export interface ComposeVolumeConfig {
  driver: string
  driver_opts: Record<string, string>
  labels: LabelObject
}

export interface Volume {
  name: string
  appId: number
  appUuid: string
  config: VolumeConfig
  create: () => Promise<void>
  remove: () => Promise<void>
}
```

#### Error Classes
**Created `src/compose/errors.ts`**:
```typescript
export class ResourceRecreationAttemptError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResourceRecreationAttemptError'
  }
}
```

#### Log Types
**Added to `src/lib/log-types.ts`**:
- `createVolume`
- `createVolumeError`
- `removeVolume`
- `removeVolumeError`

---

### Phase 2: Backend Volume Reconciliation ✅
**Status**: Complete  
**Build**: ✅ TypeScript compilation successful

#### SimpleStep Type Extended
**In `src/container-manager.ts` (line ~73)**:
```typescript
export type SimpleStep =
  | { action: 'downloadImage'; appId: number; imageName: string }
  | { action: 'createVolume'; appId: number; volumeName: string }
  | { action: 'createNetwork'; appId: number; networkName: string }
  // ... other actions
  | { action: 'removeNetwork'; appId: number; networkName: string }
  | { action: 'removeVolume'; appId: number; volumeName: string }
  | { action: 'noop' }
```

#### Reconciliation Method Added
**In `src/container-manager.ts` (line ~445, 66 lines)**:
```typescript
private reconcileVolumesForApp(
  appId: number,
  currentApp: SimpleApp | undefined,
  targetApp: SimpleApp | undefined,
): SimpleStep[] {
  const steps: SimpleStep[] = []

  // Collect all volume names from current and target services
  const currentVolumes = new Set<string>()
  const targetVolumes = new Set<string>()

  if (currentApp) {
    for (const service of currentApp.services) {
      if (service.config.volumes) {
        for (const volume of service.config.volumes) {
          // Only track named volumes (format: "volumeName:/path")
          // Skip bind mounts (format: "/host/path:/container/path")
          if (!volume.startsWith('/')) {
            const volumeName = volume.split(':')[0]
            currentVolumes.add(volumeName)
          }
        }
      }
    }
  }

  if (targetApp) {
    for (const service of targetApp.services) {
      if (service.config.volumes) {
        for (const volume of service.config.volumes) {
          // Only track named volumes
          if (!volume.startsWith('/')) {
            const volumeName = volume.split(':')[0]
            targetVolumes.add(volumeName)
          }
        }
      }
    }
  }

  // Volumes to create (in target but not in current)
  for (const volumeName of targetVolumes) {
    if (!currentVolumes.has(volumeName)) {
      steps.push({ action: 'createVolume', appId, volumeName })
    }
  }

  // Volumes to remove (in current but not in target)
  for (const volumeName of currentVolumes) {
    if (!targetVolumes.has(volumeName)) {
      steps.push({ action: 'removeVolume', appId, volumeName })
    }
  }

  return steps
}
```

#### calculateSteps() Integration
**Volume Create Steps** (line ~527, before networks):
```typescript
const volumeCreateSteps = this.reconcileVolumesForApp(appId, currentApp, targetApp)
  .filter((step) => step.action === 'createVolume')
steps.push(...volumeCreateSteps)
```

**Volume Remove Steps** (line ~568, after networks):
```typescript
const volumeRemoveSteps = this.reconcileVolumesForApp(appId, currentApp, targetApp)
  .filter((step) => step.action === 'removeVolume')
steps.push(...volumeRemoveSteps)
```

**Order of Operations**:
1. Download images
2. **Create volumes** ← New
3. Create networks
4. Stop old containers
5. Remove old containers
6. Start new containers
7. Remove old networks
8. **Remove old volumes** ← New

#### executeStep() Switch Cases
**In `src/container-manager.ts` (line ~782)**:
```typescript
case 'createVolume':
  await this.createVolume(step.appId, step.volumeName)
  break

case 'removeVolume':
  await this.removeVolume(step.appId, step.volumeName)
  break
```

#### Execution Methods
**In `src/container-manager.ts` (lines ~895-929)**:
```typescript
private async createVolume(appId: number, volumeName: string): Promise<void> {
  if (this.useRealDocker) {
    const { Volume } = await import('./compose/volume.js')
    const appUuid = String(appId)

    const volume = Volume.fromComposeObject(
      volumeName,
      appId,
      appUuid,
      {
        driver: 'local',
        labels: {
          'iotistic.managed': 'true',
          'iotistic.app-id': String(appId),
        },
      },
    )

    await volume.create()
    console.log(`✅ Created volume: ${volumeName} (${appId}_${volumeName})`)
  } else {
    console.log(`    [SIMULATED] Creating volume: ${volumeName} for app ${appId}`)
    await this.sleep(50)
  }
}

private async removeVolume(appId: number, volumeName: string): Promise<void> {
  if (this.useRealDocker) {
    const { Volume } = await import('./compose/volume.js')
    const appUuid = String(appId)

    const volume = Volume.fromComposeObject(
      volumeName,
      appId,
      appUuid,
      {},
    )

    await volume.remove()
    console.log(`✅ Removed volume: ${volumeName} (${appId}_${volumeName})`)
  } else {
    console.log(`    [SIMULATED] Removing volume: ${volumeName} for app ${appId}`)
    await this.sleep(50)
  }
}
```

---

### Phase 3: Frontend Volume UI ✅
**Status**: Complete  
**Build**: ✅ Vite build successful  
**File**: `admin/src/pages/applications/ApplicationsPage.vue`

#### Refs Added (line ~67)
```typescript
const volumeInput = ref('')
const editVolumeInput = ref('')
```

#### Reset Function Updated (line ~123)
```typescript
volumeInput.value = ''
editVolumeInput.value = ''
```

#### Volume Functions (lines ~270-320)
```typescript
const addVolume = () => {
  const volume = volumeInput.value.trim()
  if (volume && !newService.value.config.volumes?.includes(volume)) {
    // Validate volume format: volumeName:/path or /host/path:/container/path
    if (!/^([a-zA-Z0-9_-]+:\/|\/)/.test(volume)) {
      return // Invalid volume format, silently ignore
    }
    if (!newService.value.config.volumes) {
      newService.value.config.volumes = []
    }
    newService.value.config.volumes.push(volume)
    volumeInput.value = ''
  }
}

const removeVolume = (volume: string) => {
  if (newService.value.config.volumes) {
    newService.value.config.volumes = newService.value.config.volumes.filter((v) => v !== volume)
  }
}

const addEditVolume = () => {
  const volume = editVolumeInput.value.trim()
  if (!volume) return
  
  if (!/^([a-zA-Z0-9_-]+:\/|\/)/.test(volume)) {
    notify({ message: 'Volume must be in format "volumeName:/path" or "/host/path:/container/path"', color: 'danger' })
    return
  }
  
  if (editedService.value) {
    if (!editedService.value.config.volumes) {
      editedService.value.config.volumes = []
    }
    if (!editedService.value.config.volumes.includes(volume)) {
      editedService.value.config.volumes.push(volume)
      editVolumeInput.value = ''
    }
  }
}

const removeEditVolume = (volume: string) => {
  if (editedService.value && editedService.value.config.volumes) {
    editedService.value.config.volumes = editedService.value.config.volumes.filter((v) => v !== volume)
  }
}
```

#### UI Sections Added

**1. Deploy Modal - Volumes Section** (after Networks, ~40 lines):
```vue
<!-- Volumes -->
<div>
  <h3 class="text-sm font-semibold mb-2">
    Volumes
  </h3>
  <div class="flex gap-2 mb-2">
    <VaInput
      v-model="volumeInput"
      placeholder="e.g., data:/var/lib/data or /host/path:/container/path"
      style="flex: 1"
      @keyup.enter="addVolume"
    />
    <VaButton size="small" @click="addVolume">
      Add Volume
    </VaButton>
  </div>
  <div
    v-if="newService.config.volumes && newService.config.volumes.length > 0"
    class="flex gap-2 flex-wrap"
  >
    <VaChip
      v-for="volume in newService.config.volumes"
      :key="volume"
      closeable
      color="warning"
      @update:modelValue="removeVolume(volume)"
    >
      {{ volume }}
    </VaChip>
  </div>
  <div class="text-sm text-gray-600 mt-2">
    Volumes persist data across container restarts. Use "volumeName:/path" for named volumes or "/host/path:/container/path" for bind mounts.
  </div>
</div>
```

**2. Service Cards - Volume Chips** (after network chips):
```vue
<div
  v-if="service.config && service.config.volumes && service.config.volumes.length > 0"
  class="mt-1"
>
  <VaChip
    v-for="volume in service.config.volumes"
    :key="volume"
    size="small"
    color="warning"
    class="mr-1"
  >
    {{ volume }}
  </VaChip>
</div>
```

**3. Details View - Volume Chips** (after networks):
```vue
<div v-if="enhancedServiceConfig && enhancedServiceConfig.volumes && enhancedServiceConfig.volumes.length > 0">
  <h4 class="font-semibold mb-2">
    Volumes
  </h4>
  <div class="flex flex-wrap gap-2">
    <VaChip
      v-for="volume in enhancedServiceConfig.volumes"
      :key="volume"
      color="warning"
    >
      {{ volume }}
    </VaChip>
  </div>
</div>
```

**4. Edit Mode - Volume Section** (after Networks, ~45 lines):
```vue
<div>
  <h4 class="font-semibold mb-2">
    Volumes
  </h4>
  <div
    v-if="editedService.config.volumes && editedService.config.volumes.length > 0"
    class="mb-3"
  >
    <div class="flex flex-wrap gap-2">
      <VaChip
        v-for="volume in editedService.config.volumes"
        :key="volume"
        color="warning"
        closeable
        @update:modelValue="removeEditVolume(volume)"
      >
        {{ volume }}
      </VaChip>
    </div>
  </div>
  <div class="flex gap-2">
    <VaInput
      v-model="editVolumeInput"
      placeholder="e.g., data:/var/lib/data or /host/path:/container/path"
      class="flex-1"
      @keyup.enter="addEditVolume"
    />
    <VaButton
      :disabled="!editVolumeInput"
      @click="addEditVolume"
    >
      <VaIcon name="add" />
    </VaButton>
  </div>
  <div class="text-xs text-gray-600 mt-2">
    Volumes persist data across container restarts. Use "volumeName:/path" for named volumes or "/host/path:/container/path" for bind mounts.
  </div>
</div>
```

#### Color Scheme
- **Ports**: Blue (`color="primary"`)
- **Networks**: Green (`color="success"`)
- **Volumes**: Orange/Yellow (`color="warning"`) ← New

---

## Volume Format & Behavior

### Named Volumes
**Format**: `volumeName:/container/path`
- Example: `data:/var/lib/data`
- Docker volume name: `{appId}_{volumeName}` (e.g., `1759606743039_data`)
- Managed by application-manager
- Labeled with `iotistic.managed=true`
- Reconciled (created/removed) automatically

### Bind Mounts
**Format**: `/host/path:/container/path`
- Example: `/opt/config:/etc/app/config`
- Direct host filesystem access
- **NOT reconciled** by application-manager (skipped in reconciliation)
- User manages host directory

### Volume Lifecycle
1. **Deploy service with volume** → `createVolume` step added
2. **Apply state** → Docker volume created with labels
3. **Container starts** → Volume mounted at specified path
4. **Data persists** → Survives container restarts/recreations
5. **Remove service** → `removeVolume` step added
6. **Apply state** → Docker volume removed

---

## Testing Checklist

### Backend Testing
- [ ] Deploy service with named volume (e.g., `postgres:latest` with `pgdata:/var/lib/postgresql/data`)
- [ ] Verify volume created: `docker volume ls --filter label=iotistic.managed=true`
- [ ] Inspect volume labels: `docker volume inspect {appId}_{volumeName}`
- [ ] Check container mounts: `docker inspect <container> | grep -A 10 Mounts`
- [ ] Write data to volume (e.g., database records)
- [ ] Remove and redeploy service → verify data persists
- [ ] Remove service completely → verify volume cleaned up

### Frontend Testing
- [ ] Open Deploy Service modal
- [ ] Add volume: `data:/var/lib/data` → verify orange chip appears
- [ ] Remove volume chip → verify removed
- [ ] Test bind mount format: `/opt/config:/etc/config` → verify accepted
- [ ] Test invalid format (e.g., `nocolon`) → verify silently ignored
- [ ] Deploy service → verify volume appears in service card
- [ ] Open service details → verify volume shown in Details View
- [ ] Edit service → verify volume appears in Edit Mode
- [ ] Add/remove volumes in Edit Mode → verify updates apply

### Edge Cases
- [ ] Deploy service with multiple volumes
- [ ] Mix named volumes and bind mounts in same service
- [ ] Update service config without changing volumes → verify no volume reconciliation
- [ ] Update service to add volume → verify `createVolume` step
- [ ] Update service to remove volume → verify `removeVolume` step
- [ ] Two services share same volume name → verify {appId} prefix prevents collision

---

## Known Limitations

1. **Bind Mounts Not Reconciled**: Paths starting with `/` are treated as bind mounts and skipped in reconciliation. Host directories must be manually managed.

2. **Volume Driver Options**: Currently hardcoded to `driver: 'local'`. No UI for advanced driver options (NFS, cloud storage, etc.).

3. **Volume Labels**: Labels are set at creation time. Changing labels requires volume recreation.

4. **Orphan Volume Cleanup**: Removed via reconciliation but no automatic cleanup of abandoned volumes from crashed apps.

5. **Volume Inspection**: No UI for browsing volume contents or checking disk usage.

---

## Files Modified

### Backend (TypeScript)
- ✅ `application-manager/src/compose/volume.ts` (164 lines) - Volume class
- ✅ `application-manager/src/compose/volume-manager.ts` (112 lines) - CRUD operations
- ✅ `application-manager/src/compose/types.ts` - Type definitions
- ✅ `application-manager/src/compose/errors.ts` (NEW) - Error classes
- ✅ `application-manager/src/container-manager.ts` - Orchestration logic
- ✅ `application-manager/src/lib/constants.ts` - Default labels
- ✅ `application-manager/src/lib/log-types.ts` - Log event types

### Frontend (Vue/TypeScript)
- ✅ `admin/src/pages/applications/ApplicationsPage.vue` - Complete UI

---

## Build Status

### Backend
```bash
cd application-manager
npm run build
```
**Result**: ✅ No TypeScript errors

### Frontend
```bash
cd admin
npm run build
```
**Result**: ✅ Vite build successful (only deprecation warnings from dependencies)

---

## Next Steps

1. **Testing** (Phase 4)
   - End-to-end volume deployment test
   - Data persistence verification
   - Reconciliation edge cases
   - Multi-volume scenarios

2. **Documentation** (Phase 5)
   - User guide for volume usage
   - Docker volume best practices
   - Troubleshooting guide
   - Volume backup/restore procedures

3. **Enhancements** (Future)
   - Volume driver options UI
   - Volume inspection/browser
   - Volume backup/restore API
   - Disk usage monitoring
   - Volume migration tools

---

## Success Criteria Met ✅

- [x] Backend volume reconciliation integrated
- [x] Frontend UI with orange volume chips
- [x] Named volumes tracked and labeled
- [x] Bind mounts properly skipped
- [x] Volume create before containers
- [x] Volume remove after containers
- [x] TypeScript compilation passes
- [x] Vue build successful
- [x] Follows network implementation pattern
- [x] Consistent UI/UX across all views

**Status**: Implementation complete and ready for testing! 🎉
