# Volume Integration Implementation Plan

## Overview
Implement full Docker volume support following the same pattern as networks - backend reconciliation, Docker integration, and frontend UI.

## Phase 1: Backend - Label Namespace (✅ COMPLETE)

### Files Modified:
1. **volume.ts**
   - ✅ Changed `io.balena.app-uuid` → `iotistic.app-uuid`
   - ✅ Added `iotistic.managed` to omitSupervisorLabels filter

2. **lib/constants.ts**
   - ✅ Added `defaultVolumeLabels = { 'iotistic.managed': 'true' }`

## Phase 2: Backend - Volume Reconciliation

### Step 1: Add Volume Reconciliation Method to container-manager.ts

Add this method after `reconcileNetworksForApp()`:

```typescript
private reconcileVolumesForApp(
	appId: number,
	currentApp?: SimpleApp,
	targetApp?: SimpleApp,
): SimpleStep[] {
	const steps: SimpleStep[] = [];
	
	// Get all unique volume names referenced by services
	const currentVolumes = new Set<string>();
	const targetVolumes = new Set<string>();
	
	if (currentApp) {
		for (const service of currentApp.services) {
			if (service.config.volumes) {
				for (const vol of service.config.volumes) {
					// Extract volume name from format "volumeName:/path" or just "volumeName"
					const volumeName = vol.split(':')[0];
					if (!volumeName.startsWith('/')) {  // Skip bind mounts (absolute paths)
						currentVolumes.add(volumeName);
					}
				}
			}
		}
	}
	
	if (targetApp) {
		for (const service of targetApp.services) {
			if (service.config.volumes) {
				for (const vol of service.config.volumes) {
					const volumeName = vol.split(':')[0];
					if (!volumeName.startsWith('/')) {
						targetVolumes.add(volumeName);
					}
				}
			}
		}
	}
	
	// Volumes to create (in target but not in current)
	for (const volumeName of targetVolumes) {
		if (!currentVolumes.has(volumeName)) {
			steps.push({
				action: 'createVolume',
				appId,
				volumeName,
			});
		}
	}
	
	// Volumes to remove (in current but not in target)
	for (const volumeName of currentVolumes) {
		if (!targetVolumes.has(volumeName)) {
			steps.push({
				action: 'removeVolume',
				appId,
				volumeName,
			});
		}
	}
	
	return steps;
}
```

### Step 2: Update SimpleStep Type

Add volume actions to the SimpleStep type (around line 65):

```typescript
| {
		action: 'createVolume';
		appId: number;
		volumeName: string;
  }
| {
		action: 'removeVolume';
		appId: number;
		volumeName: string;
  }
```

### Step 3: Update calculateSteps()

Integrate volume steps (around line 463, similar to networks):

```typescript
// === VOLUME STEPS (BEFORE NETWORKS) ===
// Volumes must be created before networks/containers
const volumeCreateSteps = this.reconcileVolumesForApp(
	appId,
	currentApp,
	targetApp,
).filter((step) => step.action === 'createVolume');
steps.push(...volumeCreateSteps);

// === NETWORK STEPS (BEFORE CONTAINER STEPS) ===
const networkCreateSteps = this.reconcileNetworksForApp(
	appId,
	currentApp,
	targetApp,
).filter((step) => step.action === 'createNetwork');
steps.push(...networkCreateSteps);

// ... container steps ...

// === VOLUME CLEANUP (AFTER EVERYTHING) ===
const volumeRemoveSteps = this.reconcileVolumesForApp(
	appId,
	currentApp,
	targetApp,
).filter((step) => step.action === 'removeVolume');
steps.push(...volumeRemoveSteps);
```

### Step 4: Add Volume Execution Methods

Add these methods after network execution methods (around line 730):

```typescript
private async createVolume(appId: number, volumeName: string): Promise<void> {
	if (this.useRealDocker) {
		const { Volume } = await import('./volume');
		const appUuid = String(appId); // Use appId as uuid for simplicity
		
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
		);
		
		await volume.create();
		console.log(`    ✓ Created volume: ${appId}_${volumeName}`);
	} else {
		console.log(`    [SIMULATED] Creating volume: ${appId}_${volumeName}`);
		await this.sleep(50);
	}
}

private async removeVolume(appId: number, volumeName: string): Promise<void> {
	if (this.useRealDocker) {
		const { Volume } = await import('./volume');
		const appUuid = String(appId);
		
		const volume = Volume.fromComposeObject(
			volumeName,
			appId,
			appUuid,
			{},
		);
		
		await volume.remove();
		console.log(`    ✓ Removed volume: ${appId}_${volumeName}`);
	} else {
		console.log(`    [SIMULATED] Removing volume: ${appId}_${volumeName}`);
		await this.sleep(50);
	}
}
```

### Step 5: Add Volume Cases to executeStep()

Add to the switch statement (around line 680):

```typescript
case 'createVolume':
	await this.createVolume(step.appId, step.volumeName);
	break;

case 'removeVolume':
	await this.removeVolume(step.appId, step.volumeName);
	break;
```

## Phase 3: Frontend - Volume UI

### Step 1: Add Volume Refs and Functions (ApplicationsPage.vue)

Add after network refs (around line 70):

```typescript
const volumeInput = ref('')
const editVolumeInput = ref('')
```

Reset in resetServiceForm (around line 125):

```typescript
volumeInput.value = ''
editVolumeInput.value = ''
```

### Step 2: Add Volume Functions

Add after removeNetwork function (around line 270):

```typescript
const addVolume = () => {
  const volume = volumeInput.value.trim()
  if (!volume) return
  
  // Validate format: volumeName:/path or volumeName
  if (!/^[a-zA-Z0-9_-]+(:[\/a-zA-Z0-9_-]+)?$/.test(volume)) {
    notify({ message: 'Volume format: volumeName:/container/path', color: 'danger' })
    return
  }
  
  if (!newService.value.config.volumes) {
    newService.value.config.volumes = []
  }
  if (!newService.value.config.volumes.includes(volume)) {
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
  
  if (!/^[a-zA-Z0-9_-]+(:[\/a-zA-Z0-9_-]+)?$/.test(volume)) {
    notify({ message: 'Volume format: volumeName:/container/path', color: 'danger' })
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

### Step 3: Add Volume UI in Deploy Modal

Add after Networks section (around line 1820):

```vue
<!-- Volumes -->
<div>
  <h3 class="text-sm font-semibold mb-2">
    Volumes
  </h3>
  <div class="flex gap-2 mb-2">
    <VaInput
      v-model="volumeInput"
      placeholder="e.g., data:/var/lib/data"
      style="flex: 1"
      @keyup.enter="addVolume"
    />
    <VaButton
      size="small"
      @click="addVolume"
    >
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
    Named volumes for persistent data. Format: volumeName:/container/path
  </div>
</div>
```

### Step 4: Add Volume Chips to Service Cards

Add after network chips in service cards (around line 1475 and 1980):

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

### Step 5: Add Volumes to Service Details Modal

**View Mode** - Add after Networks section (around line 2355):

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

**Edit Mode** - Add after Networks section (around line 2495):

```vue
<VaDivider />

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
      placeholder="e.g., data:/var/lib/data"
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
    Named volumes persist data across container restarts. Format: volumeName:/container/path
  </div>
</div>
```

## Color Scheme

- **Ports**: Blue (`color="primary"`)
- **Networks**: Green (`color="success"`)
- **Volumes**: Orange/Yellow (`color="warning"`)

## Volume Format

- **Named Volume**: `volumeName:/container/path` → Creates Docker volume `{appId}_volumeName`
- **Bind Mount**: `/host/path:/container/path` → Direct host path mount (skipped in reconciliation)

## Testing

1. Add volume in UI: `data:/var/lib/data`
2. Deploy application
3. Verify volume created: `docker volume ls | grep iotistic.managed`
4. Verify volume labeled: `docker volume inspect {appId}_data`
5. Verify container uses volume: `docker inspect <container> | grep -A 10 Mounts`

## Next Steps

After implementation:
1. Build and test volume creation
2. Test volume persistence across container restarts
3. Test volume cleanup when service removed
4. Document volume best practices

---

**Status**: Ready for implementation  
**Estimated Time**: 30-45 minutes  
**Pattern**: Identical to network implementation
