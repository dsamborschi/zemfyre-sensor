# Database Write Optimization Analysis

## Problem Identified

The system is currently saving state to the database **unnecessarily frequently**, leading to:
- 🔴 **Disk I/O overhead** (SQLite writes every reconciliation)
- 🔴 **Database bloat** (stateSnapshot table grows indefinitely)
- 🔴 **No value gained** (state doesn't change between reconciliations)

---

## Root Causes

### 1. Auto-Reconciliation Loop
**Location**: `agent/src/compose/container-manager.ts:1354-1373`

```typescript
public startAutoReconciliation(intervalMs: number = 30000): void {
  this.reconciliationInterval = setInterval(async () => {
    if (this.useRealDocker && !this.isApplyingState) {
      console.log('🔄 Auto-reconciliation check...');
      try {
        await this.applyTargetState();  // ⚠️ Calls this every 30s
      } catch (error) {
        console.error('Auto-reconciliation error:', error);
      }
    }
  }, intervalMs);
}
```

**Default Interval**: 30 seconds (from `supervisor.ts` line 44-47)

### 2. Unnecessary Database Writes

**On every reconciliation** (`applyTargetState()`), line 396:
```typescript
// Save current state snapshot after successful reconciliation
await this.saveCurrentStateToDB();  // ⚠️ INSERT every 30s
```

**On every state sync** (`syncStateFromDocker()`), line 334:
```typescript
// Save the synced current state to database
await this.saveCurrentStateToDB();  // ⚠️ INSERT every time
```

**Problem**: `saveCurrentStateToDB()` does an **INSERT** (line 178-186):
```typescript
private async saveCurrentStateToDB(): Promise<void> {
  try {
    await db.models('stateSnapshot').insert({  // ⚠️ Always INSERT, never UPDATE
      type: 'current',
      state: JSON.stringify(this.currentState),
    });
  } catch (error) {
    console.error('Failed to save current state to DB:', error);
  }
}
```

This means:
- Every 30 seconds → new row inserted
- After 1 hour: **120 rows**
- After 1 day: **2,880 rows**
- After 1 week: **20,160 rows**

---

## Impact Assessment

### Current Behavior
- ⚠️ **Disk writes**: Every 30 seconds
- ⚠️ **Database growth**: ~3,000 rows per day
- ⚠️ **No benefit**: State doesn't actually change between reconciliations

### Why It's Problematic
1. **SD Card Wear** (Raspberry Pi): Frequent writes shorten SD card lifespan
2. **Database Bloat**: stateSnapshot table grows unbounded
3. **Performance**: SQLite has to scan more rows over time
4. **No Recovery Value**: Old snapshots aren't used for anything

---

## Recommended Optimizations

### Option 1: Only Write on State Change ✅ **BEST**

**Change**: Only save to DB if state actually changed

```typescript
private lastSavedState: string = '';

private async saveCurrentStateToDB(): Promise<void> {
  try {
    const stateJson = JSON.stringify(this.currentState);
    
    // Skip if state hasn't changed
    if (stateJson === this.lastSavedState) {
      return;
    }
    
    this.lastSavedState = stateJson;
    
    // UPSERT instead of INSERT
    const existing = await db.models('stateSnapshot')
      .where({ type: 'current' })
      .first();
    
    if (existing) {
      await db.models('stateSnapshot')
        .where({ type: 'current' })
        .update({
          state: stateJson,
          createdAt: new Date(),
        });
    } else {
      await db.models('stateSnapshot').insert({
        type: 'current',
        state: stateJson,
      });
    }
  } catch (error) {
    console.error('Failed to save current state to DB:', error);
  }
}
```

**Benefits**:
- ✅ No writes if nothing changed
- ✅ Only 1 row per state type (current/target)
- ✅ Significant reduction in disk I/O

---

### Option 2: Remove Auto-Reconciliation Database Writes

**Change**: Don't save state after every auto-reconciliation

```typescript
public async applyTargetState(saveToDb: boolean = true): Promise<void> {
  // ... existing reconciliation logic ...
  
  // Only save if explicitly requested
  if (saveToDb) {
    await this.saveCurrentStateToDB();
  }
  
  this.emit('state-applied');
}
```

Then in auto-reconciliation:
```typescript
await this.applyTargetState(false);  // Don't save on auto-reconciliation
```

**Benefits**:
- ✅ Reduces writes by 95%+
- ✅ Still saves on manual updates

---

### Option 3: Increase Reconciliation Interval

**Change**: Reduce frequency of reconciliation checks

Current: 30 seconds → Recommended: 5 minutes (300,000ms)

```typescript
private readonly RECONCILIATION_INTERVAL = parseInt(
  process.env.RECONCILIATION_INTERVAL_MS || '300000',  // 5 minutes
  10
);
```

**Benefits**:
- ✅ 10x fewer checks (from 2,880/day to 288/day)
- ⚠️ Slower to detect container failures

---

### Option 4: Remove Database Persistence Entirely ⚡ **RADICAL**

**Question**: Do you even need to persist state to the database?

**When is stateSnapshot used?**
1. On startup: Load previous state
2. During operation: Track changes

**Alternative**: Store state only in memory
- On restart, query Docker directly (`syncStateFromDocker()`)
- No database writes needed at all

**Benefits**:
- ✅ Zero disk I/O
- ✅ Simpler code
- ⚠️ State lost on crash (but can rebuild from Docker)

---

## Recommended Solution: Combine Options 1 + 2

### Implementation

**1. Change `saveCurrentStateToDB()` to UPSERT only on change:**

```typescript
private lastSavedState: string = '';

private async saveCurrentStateToDB(): Promise<void> {
  try {
    const stateJson = JSON.stringify(this.currentState);
    
    // Skip if unchanged
    if (stateJson === this.lastSavedState) {
      console.log('  State unchanged, skipping DB write');
      return;
    }
    
    console.log('  State changed, saving to DB');
    this.lastSavedState = stateJson;
    
    // Delete old snapshots and insert new
    await db.models('stateSnapshot')
      .where({ type: 'current' })
      .delete();
    
    await db.models('stateSnapshot').insert({
      type: 'current',
      state: stateJson,
    });
  } catch (error) {
    console.error('Failed to save current state to DB:', error);
  }
}
```

**2. Make `applyTargetState()` not save on auto-reconciliation:**

```typescript
public async applyTargetState(options: { saveState?: boolean } = {}): Promise<void> {
  const { saveState = true } = options;
  
  // ... existing reconciliation logic ...
  
  // Only save if state actually changed AND saveState is true
  if (saveState) {
    await this.saveCurrentStateToDB();
  }
}
```

**3. Update auto-reconciliation to skip saves:**

```typescript
this.reconciliationInterval = setInterval(async () => {
  if (this.useRealDocker && !this.isApplyingState) {
    console.log('🔄 Auto-reconciliation check...');
    try {
      await this.applyTargetState({ saveState: false });  // Don't save
    } catch (error) {
      console.error('Auto-reconciliation error:', error);
    }
  }
}, intervalMs);
```

---

## Expected Impact

### Before Optimization
- **Writes per day**: ~2,880 (every 30s)
- **Database rows**: Growing unbounded
- **Disk I/O**: Constant writes

### After Optimization
- **Writes per day**: ~10-50 (only on actual changes)
- **Database rows**: 2 (1 for current, 1 for target)
- **Disk I/O**: 99% reduction

---

## Additional Cleanup: Remove Old Snapshots

Since old snapshots aren't used, add a migration to clean them up:

```javascript
// Migration: 20250105000000_cleanup_old_snapshots.js
export async function up(knex) {
  // Keep only the latest snapshot per type
  const latestCurrent = await knex('stateSnapshot')
    .where({ type: 'current' })
    .orderBy('id', 'desc')
    .first();
  
  const latestTarget = await knex('stateSnapshot')
    .where({ type: 'target' })
    .orderBy('id', 'desc')
    .first();
  
  // Delete all except latest
  const idsToKeep = [latestCurrent?.id, latestTarget?.id].filter(Boolean);
  
  if (idsToKeep.length > 0) {
    await knex('stateSnapshot')
      .whereNotIn('id', idsToKeep)
      .delete();
  }
  
  console.log('✅ Cleaned up old state snapshots');
}
```

---

## Environment Variables

Add configuration flexibility:

```bash
# .env
RECONCILIATION_INTERVAL_MS=300000  # 5 minutes (default: 30000)
SAVE_STATE_ON_RECONCILE=false      # Don't save on auto-reconcile
```

---

## Summary

**Problem**: System writes to database every 30 seconds regardless of whether state changed

**Solution**: 
1. ✅ Only write when state actually changes
2. ✅ Don't write on auto-reconciliation (only on manual updates)
3. ✅ Keep max 2 rows in stateSnapshot table

**Impact**: 
- 🔥 **99% reduction** in disk writes
- 🔥 **Constant database size** (2 rows instead of thousands)
- 🔥 **Longer SD card life** on Raspberry Pi

**Effort**: ~1 hour to implement and test

---

## Next Steps

1. Implement Option 1 + 2 (recommended)
2. Add migration to clean up old snapshots
3. Test on development machine
4. Deploy to device
5. Monitor disk I/O improvement

Would you like me to implement these optimizations?
