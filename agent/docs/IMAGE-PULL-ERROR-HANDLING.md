# Docker Image Pull Error Handling Analysis

## Current State: ❌ NO GRACEFUL HANDLING

### What Happens Now When Image Pull Fails

```typescript
// In applyTargetState() - Line 436-491
public async applyTargetState(options: { saveState?: boolean } = {}): Promise<void> {
  try {
    const steps = this.calculateSteps();
    
    for (let i = 0; i < steps.length; i++) {
      await this.executeStep(step);  // ❌ If image pull fails here, ENTIRE reconciliation stops
    }
    
  } catch (error) {
    console.error('Error applying state:', error);
    throw error;  // ❌ Error bubbles up, reconciliation aborted
  } finally {
    this.isApplyingState = false;
  }
}
```

**Problem**: If `downloadImage` step fails (network error, invalid image, etc.), the **entire reconciliation loop stops**:
- ❌ No retry logic
- ❌ No error state tracking
- ❌ No reporting to cloud API
- ❌ Other services that could start successfully won't start
- ❌ Agent just logs error and stops

---

## Kubernetes Comparison: ✅ GRACEFUL HANDLING

### How K8s Handles Image Pull Failures

```yaml
# Pod Status with Image Pull Error
apiVersion: v1
kind: Pod
metadata:
  name: nodered
spec:
  containers:
  - name: nodered
    image: nodered/node-red:latest-invalid  # Invalid image
status:
  phase: Pending                            # Pod stuck in Pending
  conditions:
  - type: PodScheduled
    status: "True"
  - type: ContainersReady
    status: "False"                         # Containers NOT ready
    reason: ContainersNotReady
  containerStatuses:
  - name: nodered
    ready: false
    restartCount: 0
    state:
      waiting:
        reason: ImagePullBackOff            # ✅ Clear error state
        message: "Back-off pulling image 'nodered/node-red:latest-invalid'"
    lastState: {}
    image: nodered/node-red:latest-invalid
    imageID: ""
```

**Kubernetes Behavior**:
1. ✅ **Marks pod status** as `Pending` with reason `ImagePullBackOff`
2. ✅ **Retries with exponential backoff**: 10s → 20s → 40s → ... → 5min (max)
3. ✅ **Other pods continue** to start (failure isolated to one pod)
4. ✅ **Status visible** in `kubectl get pods` and `kubectl describe pod`
5. ✅ **Events logged** for troubleshooting
6. ✅ **Eventually succeeds** if image becomes available or gets fixed

**Key States**:
- `ErrImagePull` - Initial failure
- `ImagePullBackOff` - Retry with backoff
- `CrashLoopBackOff` - Container starts but crashes repeatedly

---

## Proposed Enhancement for Iotistic Agent

### 1. Service-Level Error State Tracking

**Add to SimpleService interface**:

```typescript
// agent/src/compose/container-manager.ts
export interface SimpleService {
  serviceId: number;
  serviceName: string;
  appId: number;
  appName: string;
  imageName: string;
  containerId?: string;
  config: ServiceConfig;
  
  // ✅ NEW: Error tracking
  status?: 'pending' | 'running' | 'stopped' | 'error';
  error?: {
    type: 'ImagePullBackOff' | 'ErrImagePull' | 'StartFailure' | 'CrashLoopBackOff';
    message: string;
    timestamp: string;
    retryCount: number;
    nextRetry?: string;  // ISO timestamp of next retry
  };
}
```

### 2. Retry Logic with Exponential Backoff

**Add RetryManager class**:

```typescript
// agent/src/compose/retry-manager.ts
export class RetryManager {
  private retryState = new Map<string, {
    count: number;
    nextRetry: Date;
    lastError: string;
  }>();
  
  private readonly MAX_RETRIES = 10;
  private readonly BACKOFF_INTERVALS = [
    10 * 1000,    // 10s
    20 * 1000,    // 20s
    40 * 1000,    // 40s
    80 * 1000,    // 1m 20s
    160 * 1000,   // 2m 40s
    300 * 1000,   // 5m (max)
  ];
  
  /**
   * Check if we should retry an operation
   */
  public shouldRetry(key: string): boolean {
    const state = this.retryState.get(key);
    if (!state) return true;  // First attempt
    
    if (state.count >= this.MAX_RETRIES) {
      return false;  // Max retries exceeded
    }
    
    return new Date() >= state.nextRetry;
  }
  
  /**
   * Record a failure and calculate next retry time
   */
  public recordFailure(key: string, error: string): void {
    const state = this.retryState.get(key) || { count: 0, nextRetry: new Date(), lastError: '' };
    
    state.count++;
    state.lastError = error;
    
    // Calculate backoff interval
    const backoffIndex = Math.min(state.count - 1, this.BACKOFF_INTERVALS.length - 1);
    const backoffMs = this.BACKOFF_INTERVALS[backoffIndex];
    
    state.nextRetry = new Date(Date.now() + backoffMs);
    
    this.retryState.set(key, state);
    
    console.log(`⏰ Retry scheduled for ${key}: attempt ${state.count} in ${backoffMs / 1000}s`);
  }
  
  /**
   * Record a success (clears retry state)
   */
  public recordSuccess(key: string): void {
    this.retryState.delete(key);
  }
  
  /**
   * Get retry state for reporting
   */
  public getState(key: string) {
    return this.retryState.get(key);
  }
}
```

### 3. Enhanced executeStep with Error Handling

**Update container-manager.ts**:

```typescript
private retryManager = new RetryManager();

private async executeStep(step: SimpleStep): Promise<void> {
  const stepKey = this.getStepKey(step);
  
  try {
    switch (step.action) {
      case 'downloadImage':
        // Check if we should retry this image
        if (!this.retryManager.shouldRetry(stepKey)) {
          console.log(`⏭️  Skipping ${step.imageName} (max retries exceeded)`);
          this.markServiceAsError(step.appId, step.imageName, 'ImagePullBackOff', 'Max retries exceeded');
          return;  // ✅ Skip but don't fail entire reconciliation
        }
        
        try {
          await this.downloadImage(step.imageName);
          this.retryManager.recordSuccess(stepKey);  // ✅ Clear retry state
        } catch (error: any) {
          console.error(`❌ Failed to pull image ${step.imageName}:`, error.message);
          this.retryManager.recordFailure(stepKey, error.message);
          this.markServiceAsError(step.appId, step.imageName, 'ImagePullBackOff', error.message);
          throw error;  // ✅ Re-throw to stop current service but not entire reconciliation
        }
        break;
        
      case 'startContainer':
        try {
          const containerId = await this.startContainer(step.service);
          this.addServiceToCurrentState(step.appId, step.service, containerId);
          this.markServiceAsRunning(step.appId, step.service.serviceId);  // ✅ Track success
          await this.attachLogsToContainer(containerId, step.service);
        } catch (error: any) {
          console.error(`❌ Failed to start ${step.service.serviceName}:`, error.message);
          this.markServiceAsError(step.appId, step.service.serviceId, 'StartFailure', error.message);
          throw error;
        }
        break;
        
      // ... other cases
    }
  } catch (error: any) {
    // ✅ Log error but don't bubble up - allow other steps to continue
    console.error(`⚠️  Step failed: ${step.action}`, error.message);
    // Error already tracked in markServiceAsError
  }
}

/**
 * Generate unique key for retry tracking
 */
private getStepKey(step: SimpleStep): string {
  switch (step.action) {
    case 'downloadImage':
      return `image:${step.imageName}`;
    case 'startContainer':
      return `service:${step.appId}:${step.service.serviceId}`;
    default:
      return `${step.action}:${step.appId}`;
  }
}

/**
 * Mark service as having an error
 */
private markServiceAsError(
  appId: number, 
  serviceIdOrImage: number | string, 
  errorType: string, 
  message: string
): void {
  const app = this.currentState.apps[appId];
  if (!app) return;
  
  // Find service by ID or image name
  const service = typeof serviceIdOrImage === 'number'
    ? app.services.find(s => s.serviceId === serviceIdOrImage)
    : app.services.find(s => s.imageName === serviceIdOrImage);
    
  if (service) {
    const retryState = this.retryManager.getState(
      typeof serviceIdOrImage === 'number' 
        ? `service:${appId}:${serviceIdOrImage}`
        : `image:${serviceIdOrImage}`
    );
    
    service.status = 'error';
    service.error = {
      type: errorType as any,
      message,
      timestamp: new Date().toISOString(),
      retryCount: retryState?.count || 0,
      nextRetry: retryState?.nextRetry?.toISOString(),
    };
  }
}

/**
 * Mark service as running successfully
 */
private markServiceAsRunning(appId: number, serviceId: number): void {
  const app = this.currentState.apps[appId];
  if (!app) return;
  
  const service = app.services.find(s => s.serviceId === serviceId);
  if (service) {
    service.status = 'running';
    delete service.error;  // Clear any previous errors
  }
}
```

### 4. Enhanced applyTargetState - Continue on Failure

**Update reconciliation loop**:

```typescript
public async applyTargetState(options: { saveState?: boolean } = {}): Promise<void> {
  const { saveState = true } = options;
  
  if (this.isApplyingState) {
    console.log('Already applying state, skipping...');
    return;
  }

  this.isApplyingState = true;

  try {
    console.log('\n' + '='.repeat(80));
    console.log('RECONCILING STATE');
    console.log('='.repeat(80));

    const steps = this.calculateSteps();

    if (steps.length === 0) {
      console.log('No changes needed - system is in desired state!');
      return;
    }

    console.log(`\nGenerated ${steps.length} step(s):\n`);
    
    // ✅ NEW: Track failures but continue
    const failures: Array<{ step: SimpleStep; error: any }> = [];

    // Execute steps sequentially, but don't stop on first failure
    console.log('\nExecuting steps...\n');
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      console.log(`[${i + 1}/${steps.length}] ${step.action}...`);
      
      try {
        await this.executeStep(step);
        console.log(`  ✅ Done`);
      } catch (error: any) {
        console.error(`  ❌ Failed:`, error.message);
        failures.push({ step, error });
        // ✅ Continue to next step instead of stopping
      }
    }

    // Report summary
    console.log('\n' + '='.repeat(80));
    if (failures.length === 0) {
      console.log('✅ State reconciliation complete - all services healthy!');
    } else {
      console.log(`⚠️  State reconciliation complete with ${failures.length} failure(s):`);
      failures.forEach(({ step, error }) => {
        console.log(`   - ${step.action}: ${error.message}`);
      });
      console.log('\n💡 Failed services will be retried in next reconciliation cycle');
    }
    console.log('='.repeat(80) + '\n');

    // Save current state snapshot (includes error states)
    if (saveState) {
      await this.saveCurrentStateToDB();
    }

    this.emit('state-applied', { 
      success: failures.length === 0,
      failures 
    });
    
  } catch (error) {
    console.error('❌ Critical error during reconciliation:', error);
    throw error;
  } finally {
    this.isApplyingState = false;
  }
}
```

### 5. Cloud API Reporting

**Add to api-binder.ts**:

```typescript
/**
 * Report current state including error states
 */
async reportCurrentState(state: DeviceStateReport): Promise<void> {
  // State now includes service.status and service.error
  // Cloud API can display these in the dashboard
  
  const payload = {
    uuid: this.deviceUuid,
    state: {
      ...state,
      // Include error summary
      errors: this.extractErrors(state),
    },
    timestamp: new Date().toISOString(),
  };
  
  await this.httpClient.patch(`/devices/${this.deviceUuid}/state`, payload);
}

/**
 * Extract error summary from state
 */
private extractErrors(state: DeviceStateReport): Array<ServiceError> {
  const errors: Array<ServiceError> = [];
  
  const device = state[this.deviceUuid];
  if (!device?.apps) return errors;
  
  for (const app of Object.values(device.apps)) {
    for (const service of app.services) {
      if (service.status === 'error' && service.error) {
        errors.push({
          appId: app.appId,
          appName: app.appName,
          serviceId: service.serviceId,
          serviceName: service.serviceName,
          imageName: service.imageName,
          errorType: service.error.type,
          errorMessage: service.error.message,
          retryCount: service.error.retryCount,
          nextRetry: service.error.nextRetry,
        });
      }
    }
  }
  
  return errors;
}
```

---

## Implementation Checklist

### Phase 1: Core Error Handling ✅
- [ ] Add `status` and `error` fields to `SimpleService` interface
- [ ] Create `RetryManager` class with exponential backoff
- [ ] Update `executeStep()` to catch and track errors
- [ ] Add `markServiceAsError()` and `markServiceAsRunning()` helpers
- [ ] Update `applyTargetState()` to continue on failures

### Phase 2: Enhanced Reporting 📊
- [ ] Update `api-binder.ts` to report error states
- [ ] Add error summary extraction
- [ ] Update cloud API to accept and store error states
- [ ] Add database columns for service errors

### Phase 3: Dashboard Visibility 🖥️
- [ ] Update device dashboard to show service errors
- [ ] Add error badges (similar to K8s pod status)
- [ ] Show retry countdown timers
- [ ] Add "Force Retry" button for manual intervention

### Phase 4: Alerting 🔔
- [ ] Emit alerts when service fails to start
- [ ] Send notification after max retries exceeded
- [ ] Create webhook for image pull failures

---

## Expected Behavior After Enhancement

### Scenario: Invalid Image Tag

**Before** (Current Behavior):
```
[1/3] downloadImage...
    Pulling image: nodered/node-red:latest-invalid
❌ Error applying state: Error: (HTTP code 404) no such image - manifest unknown
❌ STOPS HERE - mosquitto and influxdb won't start
```

**After** (Enhanced Behavior):
```
[1/3] downloadImage...
    Pulling image: nodered/node-red:latest-invalid
❌ Failed to pull image nodered/node-red:latest-invalid: manifest unknown
⏰ Retry scheduled: attempt 1 in 10s
✅ Marked service 'nodered' as ImagePullBackOff

[2/3] downloadImage...
    Pulling image: eclipse-mosquitto:2.0
✅ Successfully pulled image
✅ Done

[3/3] startContainer...
    Starting container: mosquitto
✅ Container started: abc123456789
✅ Done

⚠️  State reconciliation complete with 1 failure(s):
   - downloadImage: manifest unknown
💡 Failed services will be retried in next reconciliation cycle

=================================================================================
Auto-reconciliation in 30s...
```

**Next Cycle (30s later)**:
```
[1/2] downloadImage...
⏭️  Skipping nodered/node-red:latest-invalid (retry in 5s)

[2/2] noop...
✅ Done

⚠️  State reconciliation complete with 1 failure(s):
   - downloadImage: manifest unknown (retry 1/10)
```

**After Admin Fixes Image Tag** (via cloud portal):
```
[1/2] downloadImage...
    Pulling image: nodered/node-red:latest
✅ Successfully pulled image
✅ Cleared retry state

[2/2] startContainer...
    Starting container: nodered
✅ Container started: def456789abc
✅ Done

✅ State reconciliation complete - all services healthy!
```

---

## Database Schema Updates

**Add to device_state table**:

```sql
-- api/database/migrations/XXX_add_service_error_tracking.sql

ALTER TABLE device_state
ADD COLUMN service_errors JSONB DEFAULT '[]';

-- Index for quick error lookups
CREATE INDEX idx_device_state_service_errors 
ON device_state USING GIN (service_errors);

-- Example service_errors structure:
-- [
--   {
--     "appId": 1001,
--     "serviceId": 2,
--     "serviceName": "nodered",
--     "errorType": "ImagePullBackOff",
--     "message": "manifest unknown",
--     "retryCount": 3,
--     "nextRetry": "2025-10-24T10:35:00Z"
--   }
-- ]
```

---

## Benefits of K8s-Style Error Handling

1. **Resilience**: One failing service doesn't block others
2. **Visibility**: Clear error states reported to cloud
3. **Self-Healing**: Automatic retry with backoff
4. **Troubleshooting**: Error history and retry counts visible
5. **User Experience**: Dashboard shows exactly what's wrong
6. **Operational Excellence**: Matches industry-standard K8s behavior

---

## References

- **Kubernetes Image Pull Policies**: https://kubernetes.io/docs/concepts/containers/images/
- **Pod Lifecycle**: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
- **Exponential Backoff**: Standard retry pattern (Google SRE Book)
- **Balena Supervisor**: Similar retry logic in balena-supervisor

---

## Next Steps

1. **Review this document** with team
2. **Prioritize Phase 1** (core error handling)
3. **Create implementation tasks** in project tracker
4. **Estimate effort**: ~3-4 days for full implementation
5. **Test on Raspberry Pi** with intentionally broken images

**Questions?** See `agent/docs/` or ask in team chat!
