# System Metrics Enhancements - Complete ✅

## Overview

Extended the system metrics functionality to include **top 10 processes** by CPU/memory usage and updated the admin UI to display them in the device manager.

---

## Backend Changes ✅

### File: `application-manager/src/system-metrics.ts`

#### 1. Added ProcessInfo Interface
```typescript
export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
  command: string;
}
```

#### 2. Extended SystemMetrics Interface
```typescript
export interface SystemMetrics {
  // ... existing metrics
  
  // Process info (NEW)
  top_processes: ProcessInfo[];
  
  // Timestamp
  timestamp: Date;
}
```

#### 3. Added getTopProcesses() Function
```typescript
export async function getTopProcesses(): Promise<ProcessInfo[]> {
  try {
    const processes = await systeminformation.processes();
    
    // Filter out kernel threads and system processes with 0 CPU/memory
    const userProcesses = processes.list.filter(proc => 
      (proc.cpu > 0 || proc.mem > 0) && proc.name !== ''
    );
    
    // Sort by combined CPU and memory score (weighted)
    // CPU gets 60% weight, memory gets 40% weight
    const sortedProcesses = userProcesses.sort((a, b) => {
      const scoreA = (a.cpu * 0.6) + (a.mem * 0.4);
      const scoreB = (b.cpu * 0.6) + (b.mem * 0.4);
      return scoreB - scoreA;
    });
    
    // Take top 10
    const topProcs = sortedProcesses.slice(0, 10);
    
    // Format for our interface
    return topProcs.map(proc => ({
      pid: proc.pid,
      name: proc.name,
      cpu: Math.round(proc.cpu * 10) / 10, // Round to 1 decimal
      mem: Math.round(proc.mem * 10) / 10, // Round to 1 decimal
      command: proc.command || proc.name,
    }));
  } catch (error) {
    console.error('Failed to get top processes:', error);
    return [];
  }
}
```

#### 4. Updated getSystemMetrics()
Added `top_processes` to the parallel fetch and return object:

```typescript
export async function getSystemMetrics(): Promise<SystemMetrics> {
  const [
    // ... existing metrics
    topProcesses, // NEW
  ] = await Promise.all([
    // ... existing calls
    getTopProcesses(), // NEW
  ]);

  return {
    // ... existing metrics
    
    // Processes (NEW)
    top_processes: topProcesses,
    
    timestamp: new Date(),
  };
}
```

**Build Status**: ✅ TypeScript compilation successful

---

## Frontend Changes ✅

### File: `admin/src/pages/devices/DevicesPage.vue`

#### 1. Updated Card Title (Simplified)
**Before**:
```vue
<VaCardTitle>
  <div class="flex flex-col gap-2">
    <span>System Metrics</span>
    <div class="flex items-center gap-4 text-sm font-normal">
      <span class="text-gray-700">
        <VaIcon name="devices" size="small" class="mr-1" />
        {{ devicesStore.activeDevice.name }}
      </span>
      <span v-if="devicesStore.activeDevice.metrics.hostname" class="text-gray-600">
        <VaIcon name="dns" size="small" class="mr-1" />
        {{ devicesStore.activeDevice.metrics.hostname }}
      </span>
      <span v-if="devicesStore.activeDevice.metrics.uptime" class="text-gray-500">
        <VaIcon name="schedule" size="small" class="mr-1" />
        {{ ... uptime ... }}
      </span>
    </div>
  </div>
</VaCardTitle>
```

**After**:
```vue
<VaCardTitle>
  <div class="flex items-center gap-4">
    <span class="text-gray-700">
      <VaIcon name="devices" size="small" class="mr-1" />
      {{ devicesStore.activeDevice.name }}
    </span>
    <span v-if="devicesStore.activeDevice.metrics.uptime" class="text-gray-500">
      <VaIcon name="schedule" size="small" class="mr-1" />
      {{ Math.floor(devicesStore.activeDevice.metrics.uptime / 3600) }}h {{ Math.floor((devicesStore.activeDevice.metrics.uptime % 3600) / 60) }}m uptime
    </span>
  </div>
</VaCardTitle>
```

**Changes**:
- ❌ Removed "System Metrics" title
- ❌ Removed hostname display
- ✅ Kept device name with device icon
- ✅ Kept uptime with schedule icon
- Simplified layout from vertical to horizontal

#### 2. Added Top Processes Section
After the performance metrics (CPU, Memory, Storage progress bars), added:

```vue
<!-- Top Processes Section -->
<div v-if="devicesStore.activeDevice.metrics.top_processes && devicesStore.activeDevice.metrics.top_processes.length > 0" class="mt-6">
  <h3 class="text-lg font-semibold mb-3 flex items-center gap-2">
    <VaIcon name="list" />
    Top Processes
  </h3>
  <div class="overflow-x-auto">
    <table class="min-w-full divide-y divide-gray-200">
      <thead>
        <tr class="bg-gray-50">
          <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            PID
          </th>
          <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Process
          </th>
          <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            CPU %
          </th>
          <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Memory %
          </th>
          <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Command
          </th>
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-200">
        <tr
          v-for="process in devicesStore.activeDevice.metrics.top_processes"
          :key="process.pid"
          class="hover:bg-gray-50"
        >
          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-900 font-mono">
            {{ process.pid }}
          </td>
          <td class="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
            {{ process.name }}
          </td>
          <td class="px-4 py-2 whitespace-nowrap text-sm">
            <VaChip
              :color="process.cpu > 50 ? 'danger' : process.cpu > 25 ? 'warning' : 'success'"
              size="small"
            >
              {{ process.cpu.toFixed(1) }}%
            </VaChip>
          </td>
          <td class="px-4 py-2 whitespace-nowrap text-sm">
            <VaChip
              :color="process.mem > 20 ? 'danger' : process.mem > 10 ? 'warning' : 'info'"
              size="small"
            >
              {{ process.mem.toFixed(1) }}%
            </VaChip>
          </td>
          <td class="px-4 py-2 text-sm text-gray-600 font-mono truncate max-w-xs" :title="process.command">
            {{ process.command }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

**Features**:
- **Color-coded CPU chips**: 
  - Green (success): < 25%
  - Yellow (warning): 25-50%
  - Red (danger): > 50%
- **Color-coded Memory chips**:
  - Blue (info): < 10%
  - Yellow (warning): 10-20%
  - Red (danger): > 20%
- **Hover effect**: Rows highlight on hover
- **Truncated commands**: Long commands are truncated with ellipsis, full text on hover
- **Monospace font**: PID and command use monospace for readability

**Build Status**: ✅ Vite build successful + Hot reload working

---

## UI Layout Summary

### Active Device Metrics Card

**Card Title (Simplified)**:
```
[device icon] Device Name    [clock icon] 24h 35m uptime
```

**Card Content**:
1. **Performance Metrics** (3 progress bars)
   - CPU Usage (blue)
   - CPU Temperature (color-coded: green/yellow/red)
   - Memory Usage (blue/info)
   - Storage Usage (yellow/warning)

2. **Top Processes** (NEW - table view)
   - PID (monospace)
   - Process name
   - CPU % (color-coded chip)
   - Memory % (color-coded chip)
   - Command (truncated, monospace)

---

## Process Scoring Algorithm

Processes are ranked by a **weighted score**:
- **CPU usage**: 60% weight
- **Memory usage**: 40% weight

**Formula**: `score = (cpu * 0.6) + (mem * 0.4)`

**Rationale**: CPU usage typically indicates more immediate performance impact, while memory usage indicates resource consumption. The 60/40 split balances both concerns.

**Filtering**:
- Excludes processes with 0% CPU and 0% memory
- Excludes processes with empty names (kernel threads)
- Returns top 10 after sorting

---

## Testing

### Backend Test
```bash
cd application-manager
npm run build
```
✅ TypeScript compilation successful

### Frontend Test
```bash
cd admin
npm run build
```
✅ Vite build successful

### Development Server
```bash
cd admin
npm run dev
```
✅ Hot reload working - changes applied automatically

---

## Example Output

### SystemMetrics JSON (new field)
```json
{
  "cpu_usage": 45.2,
  "memory_percent": 68.5,
  "top_processes": [
    {
      "pid": 1234,
      "name": "node",
      "cpu": 32.5,
      "mem": 12.3,
      "command": "node /app/dist/index.js"
    },
    {
      "pid": 5678,
      "name": "docker",
      "cpu": 8.2,
      "mem": 5.1,
      "command": "dockerd"
    }
    // ... up to 10 processes
  ]
}
```

### UI Display
```
┌─────────────────────────────────────────────────────────┐
│ [📱] Raspberry Pi 4    [🕐] 24h 35m uptime              │
├─────────────────────────────────────────────────────────┤
│ CPU Usage:  ████████░░░░░░░░ 45.2%                      │
│ Temperature: ████████████░░░ 62°C                       │
│ Memory:     █████████████░░░ 68.5%                      │
│ Storage:    ██████░░░░░░░░░░ 35.2%                      │
│                                                          │
│ 📋 Top Processes                                        │
│ ┌─────┬──────────┬────────┬─────────┬─────────────────┐│
│ │ PID │ Process  │ CPU %  │ Mem %   │ Command         ││
│ ├─────┼──────────┼────────┼─────────┼─────────────────┤│
│ │1234 │ node     │ [32.5] │ [12.3]  │ node /app/...   ││
│ │5678 │ docker   │ [ 8.2] │ [ 5.1]  │ dockerd         ││
│ └─────┴──────────┴────────┴─────────┴─────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

## Files Modified

### Backend
- ✅ `application-manager/src/system-metrics.ts` - Added process collection

### Frontend
- ✅ `admin/src/pages/devices/DevicesPage.vue` - Added process table display + simplified header

---

## Known Considerations

1. **Performance**: `systeminformation.processes()` can be resource-intensive on systems with many processes. The function filters and sorts efficiently.

2. **Update Frequency**: Processes are fetched at the same interval as other metrics (typically every 30-60 seconds via device polling).

3. **Kernel Threads**: Filtered out automatically (0% CPU/memory and empty names).

4. **Long Commands**: Truncated in UI with ellipsis, full command shown on hover via `title` attribute.

5. **Empty List**: If no processes match criteria, the section won't render (via `v-if` check).

---

## Success Criteria Met ✅

- [x] Backend collects top 10 processes by CPU/memory
- [x] Processes sorted by weighted score (60% CPU, 40% memory)
- [x] Frontend displays processes in clean table format
- [x] Color-coded chips for quick visual identification
- [x] Removed "System Metrics" title from card
- [x] Removed hostname display
- [x] Kept device name and uptime in simplified header
- [x] TypeScript compilation passes
- [x] Vite build successful
- [x] Hot reload working in dev mode

**Status**: Implementation complete and ready for use! 🎉
