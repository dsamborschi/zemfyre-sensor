# Volume Backend Implementation - Complete ✅

## Status: Phase 2 Complete - Backend Fully Implemented

**Date Completed**: January 2025
**Build Status**: ✅ TypeScript compilation successful

---

## What Was Implemented

### Phase 1: Volume Setup & Labels ✅
All foundational files and configuration completed:

1. **File Structure**:
   - `src/compose/volume.ts` (~164 lines) - Volume class with iotistic.* labels
   - `src/compose/volume-manager.ts` (~112 lines) - CRUD operations
   - `src/compose/types.ts` - VolumeConfig, ComposeVolumeConfig, Volume interfaces
   - `src/compose/errors.ts` - ResourceRecreationAttemptError
   - Removed old `src/volume.ts` and `src/volume-manager.ts` files

2. **Label Namespace Update**:
   - Changed from `io.balena.*` to `iotistic.*`
   - Labels: `iotistic.managed`, `iotistic.app-id`, `iotistic.app-uuid`
   - Added `defaultVolumeLabels` to `lib/constants.ts`

3. **Log Types**:
   - Added to `lib/log-types.ts`: createVolume, createVolumeError, removeVolume, removeVolumeError

### Phase 2: Backend Volume Reconciliation ✅
Complete integration into `container-manager.ts`:

#### 1. SimpleStep Type Extended (lines 71-90)
```typescript
export type SimpleStep =
	| { action: 'createVolume'; appId: number; volumeName: string }
	| { action: 'removeVolume'; appId: number; volumeName: string }
	| ... // other actions
```

#### 2. Volume Reconciliation Logic (lines 445-507)
Added `reconcileVolumesForApp()` method after `reconcileNetworksForApp()`:
- Extracts volume names from `service.config.volumes`
- Parses "volumeName:/path" format
- **Skips bind mounts** (paths starting with `/`)
- Compares current vs target Sets
- Generates createVolume/removeVolume steps

**Key Feature**: Only manages named volumes, ignores bind mounts.

#### 3. Step Calculation Integration
**Volume Create Phase** (line ~533 in calculateSteps):
```typescript
const volumeCreateSteps = this.reconcileVolumesForApp(
	appId,
	currentApps[appId],
	targetApp,
).filter((step) => step.action === 'createVolume');
steps.push(...volumeCreateSteps);
```
- **Order**: Volumes created BEFORE networks and containers

**Volume Remove Phase** (line ~574 in calculateSteps):
```typescript
const volumeRemoveSteps = this.reconcileVolumesForApp(
	appId,
	currentApps[appId],
	targetApp,
).filter((step) => step.action === 'removeVolume');
steps.push(...volumeRemoveSteps);
```
- **Order**: Volumes removed AFTER containers and networks

#### 4. Step Execution Switch Cases (lines 782-788)
```typescript
case 'createVolume':
	await this.createVolume(step.appId, step.volumeName);
	break;

case 'removeVolume':
	await this.removeVolume(step.appId, step.volumeName);
	break;
```

#### 5. Volume Execution Methods (lines 895-929)
**createVolume()** - Creates Docker volume with labels:
```typescript
private async createVolume(appId: number, volumeName: string): Promise<void> {
	if (this.useRealDocker) {
		const { Volume } = await import('./compose/volume.js');
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
		console.log(`✅ Created volume: ${volumeName} (${appId}_${volumeName})`);
	} else {
		console.log(`[SIMULATED] Creating volume: ${volumeName} for app ${appId}`);
	}
}
```

**removeVolume()** - Removes Docker volume:
```typescript
private async removeVolume(appId: number, volumeName: string): Promise<void> {
	if (this.useRealDocker) {
		const { Volume } = await import('./compose/volume.js');
		// ... creates Volume object and calls remove()
	} else {
		console.log(`[SIMULATED] Removing volume: ${volumeName} for app ${appId}`);
	}
}
```

---

## Volume Naming Convention

**Input Format**: `"volumeName:/container/path"`
- Example: `"data:/var/lib/data"`

**Docker Volume Name**: `{appId}_{volumeName}`
- Example: App ID 1759606743039 with volume "data" → `1759606743039_data`

**Bind Mounts**: Skipped in reconciliation
- Format: `"/host/path:/container/path"` (starts with `/`)
- Not created/managed by application-manager

---

## Build Verification

```bash
cd application-manager
npm run build
```

**Result**: ✅ TypeScript compilation successful with no errors

All volume types properly defined and integrated.

---

## Architecture Patterns

### Reconciliation Lifecycle
1. **Volume Create** → Network Create → Container Start
2. Container Stop → Network Remove → **Volume Remove**

### Label-Based Management
- All managed volumes have `iotistic.managed: "true"`
- Filtering uses `iotistic.app-id` to identify app ownership
- Cleanup operations query Docker for volumes with these labels

### Simulated vs Real Mode


---

## Files Modified

### New Files Created
1. `src/compose/volume.ts` - Volume class implementation
2. `src/compose/volume-manager.ts` - Volume CRUD wrapper
3. `src/compose/errors.ts` - Error classes

### Modified Files
1. `src/container-manager.ts` - Complete volume reconciliation (6 changes)
2. `src/compose/types.ts` - Volume interfaces
3. `src/lib/constants.ts` - defaultVolumeLabels
4. `src/lib/log-types.ts` - Volume log events

### Deleted Files
1. ~~`src/volume.ts`~~ (moved to compose/)
2. ~~`src/volume-manager.ts`~~ (moved to compose/)

---

## Testing Status

### Backend Implementation: ✅ Complete
- Type definitions verified
- Build successful
- All imports resolved
- Reconciliation logic integrated

### Frontend Implementation: ⏹️ Not Started
- Next phase: Add UI to admin web app
- Will use orange/yellow chips (color="warning")
- Pattern: Identical to network UI implementation

### End-to-End Testing: ⏹️ Not Started
- Deploy service with volume
- Verify Docker volume creation with labels
- Test data persistence
- Test volume cleanup

---

## Next Steps

### Phase 3: Frontend Volume UI
Implement in `admin/main.js` (ApplicationsPage.vue component):

1. **Add Refs** (2 lines):
   - `volumeInput` - for Deploy modal
   - `editVolumeInput` - for Edit mode

2. **Reset Functions** (2 lines):
   - Reset volume inputs in `resetServiceForm()`

3. **Volume Functions** (~80 lines):
   - `addVolume()` - Add volume to new service
   - `removeVolume()` - Remove volume from new service
   - `addEditVolume()` - Add volume to existing service
   - `removeEditVolume()` - Remove volume from existing service

4. **UI Sections**:
   - Deploy modal: Volumes section after Networks (~30 lines)
   - Service cards: Orange volume chips - 2 locations (~15 lines each)
   - Details View mode: Read-only volume display (~15 lines)
   - Details Edit mode: Editable volume management (~35 lines)

5. **Styling**:
   - Use `color="warning"` for orange/yellow volume chips
   - Match network UI pattern (green chips)

### Phase 4: Testing
1. Deploy test service: `{ volumes: ["data:/var/lib/data"] }`
2. Verify: `docker volume ls | grep iotistic.managed`
3. Inspect labels: `docker volume inspect 1759606743039_data`
4. Check container mount: `docker inspect <container> | grep -A 10 Mounts`
5. Test persistence: Stop/start container, verify data remains
6. Test cleanup: Remove service, verify volume deleted

### Phase 5: Documentation
- Complete user guide for volume configuration
- Document bind mount vs named volume differences
- Add troubleshooting section
- Update main README.md

---

## Known Limitations

1. **No Volume Driver Configuration**: Currently hardcoded to `driver: 'local'`
   - Future: Support NFS, CIFS, custom drivers

2. **No Volume Options**: Driver options not configurable
   - Future: Add support for driver-specific options

3. **No Volume Backup**: No automated backup/restore
   - Manual backup: `docker run --rm -v volume:/data -v $(pwd):/backup alpine tar czf /backup/data.tar.gz /data`

4. **Bind Mount Detection**: Simple check (starts with `/`)
   - May not catch all edge cases (e.g., Windows paths)

5. **No Volume Migration**: Can't move volumes between apps
   - Would require new appId in volume name

---

## Success Criteria Met ✅

- [x] Volume files in correct location (src/compose/)
- [x] Label namespace updated (iotistic.*)
- [x] Type definitions complete
- [x] SimpleStep type extended
- [x] reconcileVolumesForApp() implemented
- [x] calculateSteps() integrated
- [x] executeStep() cases added
- [x] createVolume() method implemented
- [x] removeVolume() method implemented
- [x] TypeScript compilation successful
- [x] No import errors
- [x] Follows network implementation pattern

**Phase 2 Backend: 100% Complete** ✅

---

## References

- Network implementation: `src/compose/network.ts`, `src/compose/network-manager.ts`
- Original Balena Supervisor volume code (adapted with iotistic labels)
- Docker volume API: `dockerode` library
- Frontend pattern: ApplicationsPage.vue network UI
