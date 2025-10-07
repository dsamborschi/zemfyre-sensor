# Network Integration Plan for Application Manager

## Executive Summary
Add Docker network support to the simplified container-manager to allow services to connect via custom networks (like Balena Supervisor), enabling multi-container applications with proper service discovery and isolation.

## Current State Analysis

### What We Have
1. **Simplified Container Manager** (`container-manager.ts`)
   - ✅ Manages containers without commit/step logic
   - ✅ Supports: ports, volumes, environment, restart policies
   - ✅ Uses `SimpleService` and `SimpleApp` models
   - ✅ Real Docker integration via `docker-manager.ts`
   - ❌ **No network support**

2. **Balena Network Files** (copied from supervisor)
   - `network.ts` - Network class with full Docker network config
   - `network-manager.ts` - CRUD operations for networks
   - ⚠️ **Dependencies on Balena-specific code** (needs adaptation)

3. **Admin Web App** (`ApplicationsPage.vue`)
   - ✅ UI for ports, environment, volumes
   - ❌ No UI for networks

### What's Missing
1. Network field in `SimpleService` interface
2. Network reconciliation in container-manager
3. Network creation/deletion steps
4. Network UI in admin panel
5. Error handling classes
6. Constants/utilities adaptations

---

## Implementation Plan

### **Phase 1: Adapt Balena Network Code** ⭐ START HERE

#### Step 1.1: Create Error Classes
**File**: `application-manager/src/errors.ts` (new file)
```typescript
export class InvalidNetworkNameError extends Error {
  constructor(name: string) {
    super(`Invalid network name: ${name}`);
    this.name = 'InvalidNetworkNameError';
  }
}

export class ResourceRecreationAttemptError extends Error {
  constructor(resourceType: string, resourceName: string) {
    super(`Cannot recreate ${resourceType}: ${resourceName} (requires manual intervention)`);
    this.name = 'ResourceRecreationAttemptError';
  }
}
```

#### Step 1.2: Create Missing Dependencies
**File**: `application-manager/src/lib/docker-utils.ts` (new file)
```typescript
import Docker from 'dockerode';

export const docker = new Docker({ socketPath: '/var/run/docker.sock' });
```

**File**: `application-manager/src/lib/errors.ts` (new file)
```typescript
export class InternalInconsistencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InternalInconsistencyError';
  }
}

export function isNotFoundError(error: any): boolean {
  return error?.statusCode === 404 || error?.code === 'ENOENT';
}
```

**File**: `application-manager/src/lib/supervisor-console.ts` (new file)
```typescript
// Simple logger wrapper
export default {
  debug: (...args: any[]) => console.log('[DEBUG]', ...args),
  info: (...args: any[]) => console.log('[INFO]', ...args),
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
};
```

**File**: `application-manager/src/logging/index.ts` (update existing)
```typescript
// Add to existing logging
export function logSystemEvent(type: string, data: any) {
  console.log(`[SYSTEM_EVENT] ${type}:`, JSON.stringify(data));
}
```

**File**: `application-manager/src/lib/log-types.ts` (new file)
```typescript
export = {
  createNetwork: 'Network created',
  createNetworkError: 'Failed to create network',
  removeNetwork: 'Network removed',
  removeNetworkError: 'Failed to remove network',
};
```

**File**: `application-manager/src/compose/utils.ts` (new file)
```typescript
import _ from 'lodash';

export function normalizeLabels(labels: Record<string, any>): Record<string, string> {
  return _.mapValues(labels, (value) => String(value));
}
```

**File**: `application-manager/src/compose/types.ts` (new file)
```typescript
export interface ComposeNetworkConfig {
  driver?: string;
  driver_opts?: Record<string, string>;
  enable_ipv6?: boolean;
  internal?: boolean;
  ipam?: {
    driver?: string;
    config?: Array<{
      subnet?: string;
      gateway?: string;
      ip_range?: string;
      aux_addresses?: Record<string, string>;
    }>;
    options?: Record<string, string>;
  };
  labels?: Record<string, string>;
  config_only?: boolean;
}

export interface NetworkConfig {
  driver: string;
  ipam: {
    driver: string;
    config: Array<{
      subnet?: string;
      gateway?: string;
      ipRange?: string;
      auxAddress?: Record<string, string>;
    }>;
    options: Record<string, string>;
  };
  enableIPv6: boolean;
  internal: boolean;
  labels: Record<string, string>;
  options: Record<string, string>;
  configOnly: boolean;
}

export interface NetworkInspectInfo {
  Name: string;
  Id: string;
  Driver: string;
  EnableIPv6: boolean;
  IPAM: {
    Driver: string;
    Config: Array<{
      Subnet?: string;
      Gateway?: string;
      IPRange?: string;
      AuxAddress?: Record<string, string>;
    }>;
    Options?: Record<string, string>;
  };
  Internal: boolean;
  Options: Record<string, string>;
  Labels: Record<string, string>;
  ConfigOnly: boolean;
}

export interface Network {
  appId: number;
  appUuid?: string;
  name: string;
  config: NetworkConfig;
}
```

#### Step 1.3: Simplify Network Files
**Update**: `application-manager/src/network.ts`
- Remove `lib/constants` dependency (hardcode or skip supervisor network)
- Change `../lib/*` imports to `./lib/*`
- Change `./utils` to `./compose/utils`
- Change `./types` to `./compose/types`
- Remove `./errors` import, add local errors

**Update**: `application-manager/src/network-manager.ts`
- Remove supervisor network functions (not needed for simplified version)
- Remove `constants` dependency
- Change imports to local paths
- Simplify `getAll()` to use `'iotistic.supervised'` label

---

### **Phase 2: Integrate Networks into Container Manager**

#### Step 2.1: Update SimpleService Interface
**File**: `application-manager/src/container-manager.ts`
```typescript
export interface SimpleService {
  serviceId: number;
  serviceName: string;
  imageName: string;
  appId: number;
  appName: string;
  
  config: {
    image: string;
    environment?: Record<string, string>;
    ports?: string[];
    volumes?: string[];
    networkMode?: string;
    networks?: string[]; // NEW: List of network names to connect to
    restart?: string;
    labels?: Record<string, string>;
  };
  
  containerId?: string;
  status?: string;
}
```

#### Step 2.2: Add Network Steps
**File**: `application-manager/src/container-manager.ts`
```typescript
export type SimpleStep =
  | { action: 'downloadImage'; appId: number; imageName: string }
  | { action: 'createNetwork'; appId: number; networkName: string }  // NEW
  | { action: 'removeNetwork'; appId: number; networkName: string }   // NEW
  | { action: 'stopContainer'; appId: number; serviceId: number; containerId: string }
  | { action: 'removeContainer'; appId: number; serviceId: number; containerId: string }
  | { action: 'startContainer'; appId: number; service: SimpleService }
  | { action: 'noop' };
```

#### Step 2.3: Network Reconciliation Logic
**File**: `application-manager/src/container-manager.ts`
Add new method:
```typescript
private async reconcileNetworks(
  currentApp: SimpleApp | undefined,
  targetApp: SimpleApp
): Promise<SimpleStep[]> {
  const steps: SimpleStep[] = [];
  
  // Extract all unique networks from target services
  const targetNetworks = new Set<string>();
  for (const service of targetApp.services) {
    if (service.config.networks) {
      service.config.networks.forEach(net => targetNetworks.add(net));
    }
  }
  
  // Extract networks from current services
  const currentNetworks = new Set<string>();
  if (currentApp) {
    for (const service of currentApp.services) {
      if (service.config.networks) {
        service.config.networks.forEach(net => currentNetworks.add(net));
      }
    }
  }
  
  // Networks to create (in target but not in current)
  for (const networkName of targetNetworks) {
    if (!currentNetworks.has(networkName)) {
      steps.push({
        action: 'createNetwork',
        appId: targetApp.appId,
        networkName,
      });
    }
  }
  
  // Networks to remove (in current but not in target)
  for (const networkName of currentNetworks) {
    if (!targetNetworks.has(networkName)) {
      steps.push({
        action: 'removeNetwork',
        appId: targetApp.appId,
        networkName,
      });
    }
  }
  
  return steps;
}
```

#### Step 2.4: Update computeSteps()
**File**: `application-manager/src/container-manager.ts`
```typescript
private computeSteps(current: SimpleState, target: SimpleState): SimpleStep[] {
  const steps: SimpleStep[] = [];
  
  // ... existing app reconciliation logic ...
  
  // NEW: Network reconciliation (do this BEFORE container steps)
  for (const targetApp of Object.values(target.apps)) {
    const currentApp = current.apps[targetApp.appId];
    const networkSteps = await this.reconcileNetworks(currentApp, targetApp);
    steps.push(...networkSteps);
  }
  
  // ... existing container reconciliation ...
  
  return steps;
}
```

#### Step 2.5: Add Network Execution Steps
**File**: `application-manager/src/container-manager.ts`
```typescript
private async executeStep(step: SimpleStep): Promise<void> {
  switch (step.action) {
    case 'createNetwork':
      await this.createNetwork(step.appId, step.networkName);
      break;
    
    case 'removeNetwork':
      await this.removeNetwork(step.appId, step.networkName);
      break;
    
    // ... existing cases ...
  }
}

private async createNetwork(appId: number, networkName: string): Promise<void> {
  console.log(`  ⚙️ Creating network: ${networkName} for app ${appId}`);
  
  if (this.useRealDocker) {
    const { Network } = await import('./network');
    const network = Network.fromComposeObject(
      networkName,
      appId,
      `app-${appId}`, // appUuid
      { driver: 'bridge' } // Default config
    );
    
    const networkManager = await import('./network-manager');
    await networkManager.create(network);
  } else {
    console.log(`    [SIMULATED] Network created: ${networkName}`);
  }
}

private async removeNetwork(appId: number, networkName: string): Promise<void> {
  console.log(`  ⚙️ Removing network: ${networkName} for app ${appId}`);
  
  if (this.useRealDocker) {
    const { Network } = await import('./network');
    const network = Network.fromComposeObject(
      networkName,
      appId,
      `app-${appId}`,
      { driver: 'bridge' }
    );
    
    const networkManager = await import('./network-manager');
    await networkManager.remove(network);
  } else {
    console.log(`    [SIMULATED] Network removed: ${networkName}`);
  }
}
```

#### Step 2.6: Update Docker Manager to Connect Containers to Networks
**File**: `application-manager/src/docker-manager.ts`
```typescript
async startContainer(service: SimpleService): Promise<string> {
  // ... existing container creation ...
  
  // 7. Connect to custom networks (if specified)
  if (service.config.networks && service.config.networks.length > 0) {
    for (const networkName of service.config.networks) {
      const dockerNetworkName = `${service.appId}_${networkName}`;
      try {
        const network = this.docker.getNetwork(dockerNetworkName);
        await network.connect({ Container: containerId });
        console.log(`    Connected to network: ${networkName}`);
      } catch (error: any) {
        console.warn(`    Failed to connect to network ${networkName}:`, error.message);
      }
    }
  }
  
  return containerId;
}
```

---

### **Phase 3: Add Network UI to Admin Panel**

#### Step 3.1: Update Service Config UI
**File**: `admin/src/pages/applications/ApplicationsPage.vue`

Add networks array to newService:
```typescript
const newService = ref<ServiceConfig>({
  serviceId: 0,
  serviceName: '',
  imageName: '',
  appId: 0,
  appName: '',
  config: {
    image: '',
    ports: [],
    environment: {},
    volumes: [],
    networks: [], // NEW
  },
})
```

Add network input state:
```typescript
// Form inputs for networks
const networkInput = ref('')

// Add network
const addNetwork = () => {
  if (networkInput.value && !newService.value.config.networks?.includes(networkInput.value)) {
    if (!newService.value.config.networks) {
      newService.value.config.networks = []
    }
    newService.value.config.networks.push(networkInput.value)
    networkInput.value = ''
  }
}

// Remove network
const removeNetwork = (network: string) => {
  if (newService.value.config.networks) {
    newService.value.config.networks = newService.value.config.networks.filter((n) => n !== network)
  }
}
```

#### Step 3.2: Add Networks Section to Service Dialog
**File**: `admin/src/pages/applications/ApplicationsPage.vue`

Add after Volumes section:
```vue
<!-- Networks -->
<div class="mb-4">
  <label class="va-input-label">Networks</label>
  <div class="flex gap-2 mb-2">
    <VaInput
      v-model="networkInput"
      placeholder="e.g., backend, frontend"
      @keyup.enter="addNetwork"
      class="flex-1"
    />
    <VaButton @click="addNetwork">Add</VaButton>
  </div>
  <div class="flex flex-wrap gap-2">
    <VaChip
      v-for="network in newService.config.networks"
      :key="network"
      closeable
      @update:model-value="removeNetwork(network)"
    >
      {{ network }}
    </VaChip>
  </div>
  <p class="text-sm text-gray-600 mt-2">
    Custom Docker networks for service isolation and discovery
  </p>
</div>
```

#### Step 3.3: Display Networks in Service Details
Add to service card display:
```vue
<div v-if="service.config.networks && service.config.networks.length > 0" class="mt-2">
  <p class="text-xs text-gray-600 mb-1">Networks:</p>
  <VaChip
    v-for="network in service.config.networks"
    :key="network"
    size="small"
    color="info"
    class="mr-1"
  >
    <VaIcon name="hub" size="small" class="mr-1" />
    {{ network }}
  </VaChip>
</div>
```

---

### **Phase 4: Testing & Validation**

#### Test Cases

1. **Single Network Test**
   ```typescript
   // Service A and B on same network "backend"
   serviceA.config.networks = ['backend']
   serviceB.config.networks = ['backend']
   // Expected: Both can communicate via service names
   ```

2. **Multi-Network Test**
   ```typescript
   // API server on both frontend and backend
   api.config.networks = ['frontend', 'backend']
   web.config.networks = ['frontend']
   db.config.networks = ['backend']
   // Expected: web→api works, web→db fails, api→db works
   ```

3. **Network Cleanup Test**
   ```typescript
   // Remove service using network
   // Expected: Network deleted when no containers use it
   ```

4. **Network Recreation Test**
   ```typescript
   // Change network config (e.g., subnet)
   // Expected: Error thrown (requires manual recreation)
   ```

---

## File Checklist

### New Files to Create
- [ ] `application-manager/src/errors.ts`
- [ ] `application-manager/src/lib/docker-utils.ts`
- [ ] `application-manager/src/lib/errors.ts`
- [ ] `application-manager/src/lib/supervisor-console.ts`
- [ ] `application-manager/src/lib/log-types.ts`
- [ ] `application-manager/src/compose/utils.ts`
- [ ] `application-manager/src/compose/types.ts`

### Files to Update
- [ ] `application-manager/src/network.ts` (simplify imports)
- [ ] `application-manager/src/network-manager.ts` (simplify imports)
- [ ] `application-manager/src/container-manager.ts` (add network steps)
- [ ] `application-manager/src/docker-manager.ts` (connect to networks)
- [ ] `application-manager/src/logging/index.ts` (add logSystemEvent)
- [ ] `admin/src/pages/applications/ApplicationsPage.vue` (add network UI)

### Configuration Files
- [ ] `application-manager/tsconfig.json` (add new paths if needed)
- [ ] `application-manager/package.json` (ensure dockerode types)

---

## Implementation Order

### Priority 1 (Backend - Core Functionality)
1. Create all missing dependency files (errors, utils, types)
2. Update network.ts and network-manager.ts imports
3. Add networks field to SimpleService interface
4. Add network reconciliation to container-manager
5. Update docker-manager to connect containers

### Priority 2 (Backend - Testing)
6. Test network creation/deletion
7. Test container network connection
8. Test network cleanup on service removal

### Priority 3 (Frontend)
9. Add network UI to service dialog
10. Add network display to service cards
11. Test full workflow: create service → assign network → deploy

---

## Migration Strategy

### For Existing Deployments
1. **Backward Compatible**: Services without networks continue to work
2. **Default Behavior**: No networks = bridge mode (current behavior)
3. **Gradual Adoption**: Add networks one service at a time

### Example Migration
```typescript
// Before (current)
service: {
  config: {
    ports: ['8080:80'],
    environment: { DB_HOST: '192.168.1.100' }
  }
}

// After (with networks)
service: {
  config: {
    ports: ['8080:80'],
    networks: ['backend'],
    environment: { DB_HOST: 'postgres' } // Now uses DNS!
  }
}
```

---

## Expected Benefits

1. **Service Discovery**: Services can find each other by name (e.g., `http://api:3000`)
2. **Network Isolation**: Frontend and backend networks separated
3. **Security**: Services only communicate on designated networks
4. **Flexibility**: Multiple networks per service (API gateway pattern)
5. **Balena Compatibility**: Similar network model to Balena's ecosystem

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Breaking existing deployments | High | Backward compatible - networks optional |
| Network name conflicts | Medium | Use appId prefix (e.g., `1001_backend`) |
| Circular dependencies | Medium | Import network modules dynamically |
| Docker network bugs | Medium | Comprehensive error handling + logging |
| UI complexity | Low | Progressive disclosure - collapse by default |

---

## Timeline Estimate

- **Phase 1** (Dependencies): 2-3 hours
- **Phase 2** (Backend Integration): 4-5 hours
- **Phase 3** (Frontend UI): 2-3 hours
- **Phase 4** (Testing): 3-4 hours
- **Total**: ~12-15 hours of development

---

## Success Criteria

✅ Networks can be created/deleted via API
✅ Containers connect to specified networks
✅ Services can communicate via DNS names
✅ Networks clean up when unused
✅ UI allows network configuration
✅ Backward compatible with existing deployments
✅ Reconciliation detects network changes
✅ Documentation updated

---

## Next Steps

1. Review this plan
2. Decide on scope (full implementation vs. MVP)
3. Start with Phase 1 (create dependency files)
4. Test each phase incrementally
5. Update documentation as you go

---

## Questions to Address

1. **Network driver support**: Start with `bridge` only, or support `host`, `overlay`?
2. **IPAM config**: Allow custom subnets/gateways in UI?
3. **Network options**: Expose driver_opts in UI?
4. **Multi-app networks**: Should networks be app-scoped or global?
5. **Supervisor network**: Skip it for simplified version?

**Recommendation**: Start with MVP (bridge networks, no IPAM config, app-scoped), expand later.
