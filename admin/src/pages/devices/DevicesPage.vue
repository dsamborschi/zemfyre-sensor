<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useDevicesStore } from '../../stores/devices'
import { useModal, useToast } from 'vuestic-ui'
import type { AddDeviceRequest } from '../../data/types/device'

const devicesStore = useDevicesStore()
const { confirm } = useModal()

// Add device dialog state
const showAddDialog = ref(false)
const newDevice = ref<AddDeviceRequest>({
  name: '',
  hostname: '',
  port: 3002,
  protocol: 'http',
  location: '',
  description: '',
})

// Track which devices are applying state
const applyingDevices = ref<Set<string>>(new Set())

// Reset form
const resetForm = () => {
  newDevice.value = {
    name: '',
    hostname: '',
    port: 3002,
    protocol: 'http',
    location: '',
    description: '',
  }
}

// Add device
const addDevice = async () => {
  try {
    await devicesStore.addDevice(newDevice.value)
    showAddDialog.value = false
    resetForm()
  } catch (error) {
    console.error('Failed to add device:', error)
  }
}

// Cancel add dialog
const cancelAddDialog = () => {
  showAddDialog.value = false
  resetForm()
}

// Copy install command to clipboard
const copyInstallCommand = async () => {
  try {
    await navigator.clipboard.writeText("bash <(curl -H 'Cache-Control: no-cache' -sL --proto '=https' https://scripts.iotistic.ca/install)")
    useToast().init({ message: 'Command copied to clipboard', color: 'success' })
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

// Check if device needs state to be applied
const needsApply = (device: any) => {
  if (!device.managerStatus) return false
  return device.managerStatus.currentApps !== device.managerStatus.targetApps ||
         device.managerStatus.currentServices !== device.managerStatus.targetServices
}

// Reconcile device state
const reconcileState = async (deviceId: string, deviceName: string) => {
  const device = devicesStore.devices.find(d => d.id === deviceId)
  if (!device) return

  applyingDevices.value.add(deviceId)
  
  try {
    console.log(`[DevicesPage] Reconciling state for ${deviceName}...`)
    const response = await fetch(`${device.apiUrl}/state/apply`, {
      method: 'POST',
      signal: AbortSignal.timeout(30000) // 30 second timeout
    })
    
    if (response.ok) {
      useToast().init({ 
        message: `State reconciled successfully for ${deviceName}`, 
        color: 'success' 
      })
      
      // Refresh device status after a short delay to get updated state
      setTimeout(() => {
        devicesStore.refreshDeviceStatus(deviceId)
      }, 2000)
    } else {
      const errorText = await response.text()
      throw new Error(`Failed to reconcile: ${response.status} - ${errorText}`)
    }
  } catch (error: any) {
    console.error(`[DevicesPage] Failed to reconcile state for ${deviceName}:`, error)
    useToast().init({ 
      message: `Failed to reconcile: ${error.message}`, 
      color: 'danger' 
    })
  } finally {
    applyingDevices.value.delete(deviceId)
  }
}

// Switch device
const setActiveDevice = (deviceId: string) => {
  devicesStore.setActiveDevice(deviceId)
}

// Remove device
const confirmRemoveDevice = async (deviceId: string, deviceName: string) => {
  const agreed = await confirm({
    maxWidth: '380px',
    message: `Are you sure you want to remove device "${deviceName}"?`,
    title: 'Remove Device',
    size: 'small',
  })
  
  if (agreed) {
    devicesStore.removeDevice(deviceId)
  }
}

// Get status color
const getStatusColor = (status: string) => {
  switch (status) {
    case 'online':
      return 'success'
    case 'offline':
      return 'danger'
    default:
      return 'secondary'
  }
}

// Refresh all devices
const refreshDevices = async () => {
  await devicesStore.refreshAllDevicesStatus()
}

// ==================== Auto-Refresh Functionality ====================

const autoRefreshEnabled = ref(true)
const autoRefreshInterval = ref(10000) // 10 seconds for devices (less frequent)
let refreshTimer: NodeJS.Timeout | null = null

const performAutoRefresh = async () => {
  // Don't refresh if disabled or during active editing
  if (!autoRefreshEnabled.value || showAddDialog.value) return
  if (applyingDevices.value.size > 0) return // Don't refresh during state reconciliation
  
  try {
    await devicesStore.refreshAllDevicesStatus()
  } catch (error) {
    console.error('Auto-refresh failed:', error)
  }
}

const startAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
  
  refreshTimer = setInterval(performAutoRefresh, autoRefreshInterval.value)
}

const stopAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

// Pause auto-refresh when page is hidden
const handleVisibilityChange = () => {
  if (document.hidden) {
    stopAutoRefresh()
  } else {
    startAutoRefresh()
    performAutoRefresh() // Immediate refresh when coming back
  }
}

// Initialize auto-refresh on mount
onMounted(async () => {
  await devicesStore.initialize()
  
  if (autoRefreshEnabled.value) {
    startAutoRefresh()
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
})

// Cleanup on unmount
onUnmounted(() => {
  stopAutoRefresh()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

// Toggle auto-refresh
const toggleAutoRefresh = () => {
  autoRefreshEnabled.value = !autoRefreshEnabled.value
  if (autoRefreshEnabled.value) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
}
</script>

<template>
  <div class="devices-page">
    <!-- Page Header with Title and Actions -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="page-title mb-0">Device Manager</h1>
      <VaButton icon="add" @click="showAddDialog = true"> Add Device </VaButton>
    </div>

    <!-- Page Actions -->
    <VaCard class="mb-4">
      <VaCardContent>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="stat-item">
              <VaIcon name="devices" size="small" color="primary" />
              <span class="stat-label">Total Devices:</span>
              <span class="stat-value">{{ devicesStore.stats.totalDevices }}</span>
            </div>
            <div class="stat-item">
              <VaIcon name="check_circle" size="small" color="success" />
              <span class="stat-label">Online:</span>
              <span class="stat-value">{{ devicesStore.stats.onlineDevices }}</span>
            </div>
            <div class="stat-item">
              <VaIcon name="cancel" size="small" color="danger" />
              <span class="stat-label">Offline:</span>
              <span class="stat-value">{{ devicesStore.stats.offlineDevices }}</span>
            </div>
          </div>
          <div class="flex gap-2 items-center">
            <VaButton preset="secondary" icon="refresh" :loading="devicesStore.isLoading" @click="refreshDevices">
              Refresh
            </VaButton>
            
            <!-- Auto-Refresh Toggle -->
            <div class="flex items-center gap-2 ml-4">
              <VaSwitch
                v-model="autoRefreshEnabled"
                size="small"
                @update:modelValue="toggleAutoRefresh"
              />
              <span class="text-sm text-gray-600">
                Auto-refresh ({{ (autoRefreshInterval / 1000).toFixed(0) }}s)
              </span>
            </div>
          </div>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Active Device Detailed Metrics -->
    <VaCard v-if="devicesStore.activeDevice && devicesStore.activeDevice.status === 'online' && devicesStore.activeDevice.metrics" class="mb-6">
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
              {{ Math.floor(devicesStore.activeDevice.metrics.uptime / 3600) }}h {{ Math.floor((devicesStore.activeDevice.metrics.uptime % 3600) / 60) }}m uptime
            </span>
          </div>
        </div>
      </VaCardTitle>
      <VaCardContent>
        <!-- Performance Metrics -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <p class="text-sm text-gray-600">CPU Usage</p>
            <VaProgressBar :model-value="devicesStore.activeDevice.metrics.cpu_usage" color="primary">
              {{ devicesStore.activeDevice.metrics.cpu_usage.toFixed(1) }}%
            </VaProgressBar>
          </div>
          <div v-if="devicesStore.activeDevice.metrics.cpu_temp">
            <p class="text-sm text-gray-600">CPU Temperature</p>
            <VaProgressBar
              :model-value="(devicesStore.activeDevice.metrics.cpu_temp / 85) * 100"
              :color="devicesStore.activeDevice.metrics.cpu_temp > 70 ? 'danger' : devicesStore.activeDevice.metrics.cpu_temp > 60 ? 'warning' : 'success'"
            >
              {{ devicesStore.activeDevice.metrics.cpu_temp }}°C
            </VaProgressBar>
          </div>
          <div>
            <p class="text-sm text-gray-600">Memory Usage</p>
            <VaProgressBar :model-value="devicesStore.activeDevice.metrics.memory_percent" color="info">
              {{ devicesStore.activeDevice.metrics.memory_percent.toFixed(1) }}%
            </VaProgressBar>
          </div>
          <div>
            <p class="text-sm text-gray-600">Storage Usage</p>
            <VaProgressBar :model-value="devicesStore.activeDevice.metrics.storage_percent" color="warning">
              {{ devicesStore.activeDevice.metrics.storage_percent.toFixed(1) }}%
            </VaProgressBar>
          </div>
        </div>

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
      </VaCardContent>
    </VaCard>

    <!-- Devices Grid -->
    <div v-if="devicesStore.hasDevices" class="devices-grid">
      <VaCard
        v-for="device in devicesStore.devices"
        :key="device.id"
        :class="['device-card', { active: device.id === devicesStore.activeDeviceId }]"
      >
        <VaCardContent>
          <!-- Device Header -->
          <div class="flex items-start justify-between mb-3">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <VaBadge :color="getStatusColor(device.status)" dot />
                <h3 class="device-name">{{ device.name }}</h3>
              </div>
              <p class="device-hostname">{{ device.hostname }}</p>
            </div>
            <VaButton
              v-if="!device.isDefault"
              preset="plain"
              icon="delete"
              size="small"
              color="danger"
              @click.stop="confirmRemoveDevice(device.id, device.name)"
            />
          </div>

          <!-- System Metrics -->
          <div v-if="device.status === 'online'" class="metrics-section mb-3">
            <div v-if="device.metrics" class="metrics-grid">
              <div class="metric-item">
                <span class="metric-value-large">{{ Math.round(device.metrics.cpu_usage || 0) }}%</span>
                <span class="metric-label">CPU</span>
              </div>
              <div class="metric-item">
                <span class="metric-value-large">{{ Math.round(device.metrics.memory_percent || 0) }}%</span>
                <span class="metric-label">RAM</span>
              </div>
              <div class="metric-item">
                <span class="metric-value-large">{{ Math.round(device.metrics.storage_percent || 0) }}%</span>
                <span class="metric-label">Disk</span>
              </div>
            </div>
            <div v-else class="text-sm text-gray-500">
              <VaIcon name="refresh" size="small" /> Loading metrics...
            </div>
          </div>

          <!-- Device Info -->
          <div class="device-info">
            <div class="info-row">
              <VaIcon name="link" size="small" />
              <span class="info-label">API URL:</span>
              <span class="info-value">{{ device.apiUrl }}</span>
            </div>
            <div v-if="device.location" class="info-row">
              <VaIcon name="location_on" size="small" />
              <span class="info-label">Location:</span>
              <span class="info-value">{{ device.location }}</span>
            </div>
            <div v-if="device.deviceType" class="info-row">
              <VaIcon name="devices_other" size="small" />
              <span class="info-label">Type:</span>
              <span class="info-value">{{ device.deviceType }}</span>
            </div>
            <div v-if="device.description" class="info-row">
              <VaIcon name="description" size="small" />
              <span class="info-label">Description:</span>
              <span class="info-value">{{ device.description }}</span>
            </div>
            <div v-if="device.lastSeen" class="info-row">
              <VaIcon name="access_time" size="small" />
              <span class="info-label">Last Seen:</span>
              <span class="info-value">{{ new Date(device.lastSeen).toLocaleString() }}</span>
            </div>
          </div>

          <!-- Manager Status -->
          <div v-if="device.managerStatus" class="manager-status mt-4">
            <div class="status-header">
              <VaIcon name="settings" size="small" />
              <span class="status-title">Application Manager</span>
            </div>
            <div class="status-grid">
              <div class="status-item">
                <span class="status-label">Apps:</span>
                <span class="status-value">{{ device.managerStatus.currentApps }}</span>
              </div>
              <div class="status-item">
                <span class="status-label">Services:</span>
                <span class="status-value">{{ device.managerStatus.currentServices }}</span>
              </div>
              <div class="status-item">
                <span class="status-label">Applying:</span>
                <VaBadge :text="device.managerStatus.isApplying ? 'YES' : 'NO'" :color="device.managerStatus.isApplying ? 'warning' : 'success'" />
              </div>
              <div class="status-item">
                <span class="status-label">Reconciling:</span>
                <VaBadge :text="device.managerStatus.isReconciling ? 'YES' : 'NO'" :color="device.managerStatus.isReconciling ? 'info' : 'success'" />
              </div>
            </div>
            <div v-if="device.managerStatus.lastError" class="status-error">
              <VaIcon name="error" size="small" color="danger" />
              <span class="error-text">{{ device.managerStatus.lastError }}</span>
            </div>
            
            <!-- Reconcile Button -->
            <div v-if="needsApply(device)" class="apply-state-section">
              <VaButton
                size="small"
                preset="secondary"
                :loading="applyingDevices.has(device.id)"
                @click="reconcileState(device.id, device.name)"
              >
                <VaIcon name="sync" size="small" />
                Reconcile
              </VaButton>
            </div>
          </div>

          <!-- Device Actions -->
          <div class="mt-4 flex gap-2">
            <VaButton
              v-if="device.id !== devicesStore.activeDeviceId"
              size="small"
              preset="secondary"
              @click="setActiveDevice(device.id)"
            >
              <VaIcon name="power_settings_new" size="small" class="mr-1" />
              Set Active
            </VaButton>
            <VaBadge v-else color="success" text="Active Device" />
          </div>
        </VaCardContent>
      </VaCard>
    </div>

    <!-- Empty State -->
    <VaCard v-else class="empty-state-card">
      <VaCardContent>
        <div class="empty-state">
          <VaIcon name="devices" size="64px" color="secondary" />
          <h3 class="text-xl font-semibold mt-4">No Devices Added Yet</h3>
          <p class="text-gray-600 mt-2">Add your first device to start managing your IoT infrastructure</p>
          <VaButton class="mt-4" @click="showAddDialog = true">
            <VaIcon name="add" class="mr-2" />
            Add Your First Device
          </VaButton>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Add Device Modal -->
    <VaModal v-model="showAddDialog" size="medium" title="Add New Device" hide-default-actions>
      <VaForm class="space-y-4">
        <VaInput v-model="newDevice.name" label="Device Name *" placeholder="e.g., Raspberry Pi - Kitchen" required />

        <VaInput v-model="newDevice.hostname" label="Hostname/IP Address *" placeholder="e.g., 192.168.1.100" required />

        <div class="grid grid-cols-2 gap-4">
          <VaInput v-model.number="newDevice.port" label="Port" placeholder="3002" type="number" />

          <VaSelect v-model="newDevice.protocol" label="Protocol" :options="['http', 'https']" />
        </div>

        <VaInput v-model="newDevice.location" label="Location" placeholder="e.g., Kitchen, Office" />

        <VaTextarea
          v-model="newDevice.description"
          label="Description"
          placeholder="Additional notes about this device"
          :min-rows="3"
        />

        <VaDivider />

        <!-- Installation Instructions -->
        <div class="install-instructions">
          <div class="flex items-center gap-2 mb-2">
            <VaIcon name="terminal" size="small" color="primary" />
            <span class="font-semibold text-sm">Device Setup Required</span>
          </div>
          <p class="text-sm text-gray-600 mb-2">
            Before adding this device, ensure the Iotistic agent is installed. Run this command on your device:
          </p>
          <VaInput
            model-value="bash <(curl -H 'Cache-Control: no-cache' -sL --proto '=https' https://scripts.iotistic.ca/install)"
            readonly
            class="mb-2"
          >
            <template #appendInner>
              <VaButton
                preset="plain"
                icon="content_copy"
                size="small"
                @click="copyInstallCommand"
              />
            </template>
          </VaInput>
        </div>

        <VaDivider />

        <div class="text-sm text-gray-600">
          <VaIcon name="info" size="small" class="mr-1" />
          <span>The device will be tested for connectivity after adding.</span>
        </div>
      </VaForm>

      <template #footer>
        <div class="flex gap-3 justify-end">
          <VaButton preset="secondary" @click="cancelAddDialog"> Cancel </VaButton>
          <VaButton :disabled="!newDevice.name || !newDevice.hostname" :loading="devicesStore.isLoading" @click="addDevice">
            <VaIcon name="add" class="mr-1" />
            Add Device
          </VaButton>
        </div>
      </template>
    </VaModal>
  </div>
</template>

<style scoped>
.devices-page {
  padding: 1rem;
}

.page-title {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 1.5rem;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.stat-label {
  font-size: 0.875rem;
  color: #666;
}

.stat-value {
  font-size: 1rem;
  font-weight: bold;
}

.devices-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1rem;
}

.device-card {
  transition: all 0.2s;
  border: 2px solid transparent;
}

.device-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.device-card.active {
  border-color: var(--va-primary);
  box-shadow: 0 4px 16px rgba(66, 133, 244, 0.2);
}

.device-name {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.device-hostname {
  font-size: 0.875rem;
  color: #666;
  margin: 0;
}

.device-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 8px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.info-label {
  font-weight: 500;
  color: #666;
}

.info-value {
  color: #333;
  flex: 1;
  word-break: break-all;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  text-align: center;
}

.empty-state-card {
  margin-top: 2rem;
}

.metrics-section {
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 8px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.metric-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.metric-value {
  font-size: 0.75rem;
  font-weight: 600;
  color: #333;
}

.metric-value-large {
  font-size: 1.5rem;
  font-weight: 700;
  color: #333;
}

.metric-label {
  font-size: 0.75rem;
  color: #666;
  font-weight: 500;
}

.space-y-4 > * + * {
  margin-top: 1rem;
}

.manager-status {
  padding: 0.75rem;
  background: #f0f4ff;
  border-radius: 8px;
  border: 1px solid #d0deff;
}

.status-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.status-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--va-primary);
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-label {
  font-size: 0.75rem;
  color: #666;
  font-weight: 500;
}

.status-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--va-primary);
}

.status-error {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem;
  background: #fff3f3;
  border-left: 3px solid var(--va-danger);
  border-radius: 4px;
  margin-top: 0.75rem;
}

.error-text {
  font-size: 0.75rem;
  color: var(--va-danger);
  font-weight: 500;
  word-break: break-word;
  flex: 1;
}

.apply-state-section {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #d0deff;
}

.apply-hint {
  font-size: 0.75rem;
  color: #666;
  font-style: italic;
}
</style>
