# Volume Implementation - Progress Report

## ✅ Phase 1: Setup & Label Namespace (COMPLETE)

### Completed:
1. ✅ **Moved volume files to correct location**  
   - Moved `volume.ts` and `volume-manager.ts` to `src/compose/` directory
   
2. ✅ **Fixed all imports and dependencies**  
   - Fixed relative import paths
   - Added `LabelObject` type to compose/types.ts
   - Created `compose/errors.ts` with `ResourceRecreationAttemptError`
   - Added volume log types to `lib/log-types.ts`
   - Added volume types to `compose/types.ts` (VolumeConfig, ComposeVolumeConfig, Volume interface)

3. ✅ **Updated label namespace**  
   - Changed `io.balena.app-uuid` → `iotistic.app-uuid`
   - Added `iotistic.managed` to label filters
   - Added `defaultVolumeLabels` to lib/constants.ts

4. ✅ **Build successful** - TypeScript compilation passes

## 📋 Phase 2: Backend - Volume Reconciliation (TODO)

### Implementation needed in `container-manager.ts`:

#### Step 1: Add SimpleStep volume actions (around line 65)
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

#### Step 2: Add reconcileVolumesForApp() method (after reconcileNetworksForApp ~line 430)
```typescript
private reconcileVolumesForApp(
	appId: number,
	currentApp?: SimpleApp,
	targetApp?: SimpleApp,
): SimpleStep[] {
	const steps: SimpleStep[] = [];
	
	// Get all unique volume names from services
	const currentVolumes = new Set<string>();
	const targetVolumes = new Set<string>();
	
	if (currentApp) {
		for (const service of currentApp.services) {
			if (service.config.volumes) {
				for (const vol of service.config.volumes) {
					const volumeName = vol.split(':')[0];
					if (!volumeName.startsWith('/')) {  // Skip bind mounts
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
	
	// Create volumes that are new
	for (const volumeName of targetVolumes) {
		if (!currentVolumes.has(volumeName)) {
			steps.push({ action: 'createVolume', appId, volumeName });
		}
	}
	
	// Remove volumes that are no longer needed
	for (const volumeName of currentVolumes) {
		if (!targetVolumes.has(volumeName)) {
			steps.push({ action: 'removeVolume', appId, volumeName });
		}
	}
	
	return steps;
}
```

#### Step 3: Update calculateSteps() (around line 463)
Add volume steps BEFORE networks:
```typescript
// === VOLUME STEPS (BEFORE NETWORKS) ===
const volumeCreateSteps = this.reconcileVolumesForApp(
	appId,
	currentApp,
	targetApp,
).filter((step) => step.action === 'createVolume');
steps.push(...volumeCreateSteps);

// === NETWORK STEPS (BEFORE CONTAINER STEPS) ===
// ... existing network code ...

// === CONTAINER STEPS ===
// ... existing container code ...

// === VOLUME CLEANUP (AFTER EVERYTHING) ===
const volumeRemoveSteps = this.reconcileVolumesForApp(
	appId,
	currentApp,
	targetApp,
).filter((step) => step.action === 'removeVolume');
steps.push(...volumeRemoveSteps);
```

#### Step 4: Add createVolume() and removeVolume() methods (around line 750)
```typescript
private async createVolume(appId: number, volumeName: string): Promise<void> {
	if (this.useRealDocker) {
		const { Volume } = await import('./compose/volume');
		const appUuid = String(appId);
		
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
		const { Volume } = await import('./compose/volume');
		const appUuid = String(appId);
		
		const volume = Volume.fromComposeObject(volumeName, appId, appUuid, {});
		await volume.remove();
		console.log(`    ✓ Removed volume: ${appId}_${volumeName}`);
	} else {
		console.log(`    [SIMULATED] Removing volume: ${appId}_${volumeName}`);
		await this.sleep(50);
	}
}
```

#### Step 5: Add volume cases to executeStep() (around line 680)
```typescript
case 'createVolume':
	await this.createVolume(step.appId, step.volumeName);
	break;

case 'removeVolume':
	await this.removeVolume(step.appId, step.volumeName);
	break;
```

## 📋 Phase 3: Frontend - Volume UI (TODO)

### Implementation needed in `admin/src/pages/applications/ApplicationsPage.vue`:

#### Step 1: Add refs (around line 70)
```typescript
const volumeInput = ref('')
const editVolumeInput = ref('')
```

#### Step 2: Reset refs (around line 125)
```typescript
volumeInput.value = ''
editVolumeInput.value = ''
```

#### Step 3: Add volume functions (after removeEditNetwork around line 270)
```typescript
const addVolume = () => {
  const volume = volumeInput.value.trim()
  if (!volume) return
  
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

#### Step 4: Add Volume UI in Deploy Modal (after Networks section ~line 1820)
- Input field with placeholder "e.g., data:/var/lib/data"
- Add Volume button
- Display chips with `color="warning"` (orange/yellow)
- Help text about persistent data

#### Step 5: Add Volume chips to service cards (~line 1475 and 1980)
- After network chips
- Use `color="warning"`

#### Step 6: Add Volumes to Service Details Modal
- View mode: Display volume chips (~line 2390)
- Edit mode: Full volume management (~line 2520)

## 🎨 Color Scheme
- **Ports**: Blue (`color="primary"`)
- **Networks**: Green (`color="success"`)
- **Volumes**: Orange/Yellow (`color="warning"`)

## 📝 Next Steps

1. **Implement backend volume reconciliation** (Phase 2)
   - All code snippets provided above
   - Add to container-manager.ts
   - Build and test

2. **Implement frontend volume UI** (Phase 3)
   - Add refs and functions
   - Add UI components in 3 locations
   - Build and test

3. **End-to-end testing**
   - Deploy service with volume
   - Verify Docker volume created with `iotistic.managed` label
   - Verify container mounts volume
   - Verify data persistence across container restart
   - Verify volume cleanup when service removed

## 📚 Documentation

See `VOLUME-IMPLEMENTATION-PLAN.md` for complete implementation details with all code snippets ready to copy-paste.

---

**Current Status**: Phase 1 complete, ready for Phase 2 backend implementation  
**Build Status**: ✅ Passing  
**Next Action**: Implement volume reconciliation in container-manager.ts
