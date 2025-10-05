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

// Edit device dialog state
const showEditDialog = ref(false)
const editingDeviceId = ref<string | null>(null)
const editDevice = ref<AddDeviceRequest>({
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

// Open edit dialog
const openEditDialog = () => {
  const device = devicesStore.activeDevice
  if (!device) return
  
  editingDeviceId.value = device.id
  editDevice.value = {
    name: device.name,
    hostname: device.hostname,
    port: parseInt(device.apiUrl.split(':').pop()?.split('/')[0] || '3002'),
    protocol: device.apiUrl.startsWith('https') ? 'https' : 'http',
    location: device.location || '',
    description: device.description || '',
  }
  showEditDialog.value = true
}

// Save edited device
const saveEditDevice = async () => {
  if (!editingDeviceId.value) return
  
  try {
    await devicesStore.updateDevice(editingDeviceId.value, editDevice.value)
    showEditDialog.value = false
    editingDeviceId.value = null
    useToast().init({ message: 'Device updated successfully', color: 'success' })
  } catch (error: any) {
    console.error('Failed to update device:', error)
    useToast().init({ message: `Failed to update device: ${error.message}`, color: 'danger' })
  }
}

// Cancel edit dialog
const cancelEditDialog = () => {
  showEditDialog.value = false
  editingDeviceId.value = null
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

// Refresh single device
const refreshDevice = async (deviceId: string) => {
  try {
    await devicesStore.refreshDeviceStatus(deviceId)
    useToast().init({ 
      message: 'Device refreshed successfully', 
      color: 'success' 
    })
  } catch (error: any) {
    useToast().init({ 
      message: `Failed to refresh device: ${error.message}`, 
      color: 'danger' 
    })
  }
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
    <div class="flex gap-4">
   

      <!-- Main Content -->
      <div class="device-main-content">
        <!-- Page Header -->
        <div class="mb-6">
          <h1 class="page-title mb-0">Device Manager</h1>
        </div>

        <!-- Summary Cards -->
        <div v-if="devicesStore.hasDevices" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <VaCard>
        <VaCardContent>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">
                Total Devices
              </p>
              <p class="text-3xl font-bold">
                {{ devicesStore.stats.totalDevices }}
              </p>
            </div>
            <VaIcon
              name="devices"
              size="large"
              color="primary"
            />
          </div>
        </VaCardContent>
      </VaCard>

      <VaCard>
        <VaCardContent>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">
                Online Devices
              </p>
              <p class="text-3xl font-bold">
                {{ devicesStore.stats.onlineDevices }}
              </p>
            </div>
            <VaIcon
              name="check_circle"
              size="large"
              color="success"
            />
          </div>
        </VaCardContent>
      </VaCard>

      <VaCard>
        <VaCardContent>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">
                Offline Devices
              </p>
              <p class="text-3xl font-bold">
                {{ devicesStore.stats.offlineDevices }}
              </p>
            </div>
            <VaIcon
              name="cancel"
              size="large"
              color="danger"
            />
          </div>
        </VaCardContent>
      </VaCard>
    </div>

        <!-- Refresh Controls -->
        <div v-if="devicesStore.hasDevices" class="flex gap-2 items-center justify-end mb-6">
          <VaButton preset="secondary" icon="refresh" :loading="devicesStore.isLoading" @click="refreshDevices">
            Refresh
          </VaButton>
          <div class="flex items-center gap-2">
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

        <!-- Device Cards Grid -->
        <div v-if="devicesStore.activeDevice" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          
          <!-- Device Info Card -->
          <VaCard class="device-card">
            <VaCardContent>
              <div class="flex items-center gap-2 mb-4">
                <VaIcon name="info" color="primary" />
                <h3 class="text-lg font-semibold">General Info</h3>
              </div>
              
              <div class="flex items-center gap-2 mb-3">
                <VaBadge :color="getStatusColor(devicesStore.activeDevice.status)" dot />
                <div>
                  <h4 class="font-semibold">{{ devicesStore.activeDevice.name }}</h4>
                  <p class="text-sm text-gray-600">{{ devicesStore.activeDevice.hostname }}</p>
                </div>
              </div>

              <div class="space-y-2">
                <div class="info-row">
                  <VaIcon name="link" size="small" />
                  <span class="info-label">API URL:</span>
                  <span class="info-value text-xs">{{ devicesStore.activeDevice.apiUrl }}</span>
                </div>
                <div v-if="devicesStore.activeDevice.location" class="info-row">
                  <VaIcon name="location_on" size="small" />
                  <span class="info-label">Location:</span>
                  <span class="info-value">{{ devicesStore.activeDevice.location }}</span>
                </div>
                <div v-if="devicesStore.activeDevice.deviceType" class="info-row">
                  <VaIcon name="devices_other" size="small" />
                  <span class="info-label">Type:</span>
                  <span class="info-value">{{ devicesStore.activeDevice.deviceType }}</span>
                </div>
                <div v-if="devicesStore.activeDevice.description" class="info-row">
                  <VaIcon name="description" size="small" />
                  <span class="info-label">Description:</span>
                  <span class="info-value">{{ devicesStore.activeDevice.description }}</span>
                </div>
                <div v-if="devicesStore.activeDevice.lastSeen" class="info-row">
                  <VaIcon name="access_time" size="small" />
                  <span class="info-label">Last Seen:</span>
                  <span class="info-value text-xs">{{ new Date(devicesStore.activeDevice.lastSeen).toLocaleString() }}</span>
                </div>
              </div>

              <!-- Device Actions -->
              <div class="mt-4 pt-3 border-t flex gap-2">
                <VaButton
                  size="small"
                  preset="secondary"
                  @click="openEditDialog"
                >
                  <VaIcon name="edit" size="small" class="mr-1" />
                  Edit
                </VaButton>
              </div>
            </VaCardContent>
          </VaCard>

          <!-- System Metrics Card -->
          <VaCard class="device-card">
            <VaCardContent>
              <div class="flex items-center gap-2 mb-4">
                <VaIcon name="speed" color="primary" />
                <h3 class="text-lg font-semibold">Telemetry</h3>
              </div>

          <!-- System Metrics -->
          <div v-if="devicesStore.activeDevice.status === 'online'" class="metrics-section mb-3">
            <div v-if="devicesStore.activeDevice.metrics" class="metrics-grid">
              <div class="metric-item">
                <span class="metric-value-large">{{ Math.round(devicesStore.activeDevice.metrics.cpu_usage || 0) }}%</span>
                <span class="metric-label">CPU</span>
              </div>
              <div class="metric-item">
                <span class="metric-value-large">{{ Math.round(devicesStore.activeDevice.metrics.memory_percent || 0) }}%</span>
                <span class="metric-label">RAM</span>
              </div>
              <div class="metric-item">
                <span class="metric-value-large">{{ Math.round(devicesStore.activeDevice.metrics.storage_percent || 0) }}%</span>
                <span class="metric-label">Disk</span>
              </div>
            </div>
            <div v-else class="text-sm text-gray-500">
              <VaIcon name="refresh" size="small" /> Loading metrics...
            </div>

            <!-- Detailed Metrics Section -->
            <div v-if="devicesStore.activeDevice.metrics" class="mt-4">
              <div class="space-y-3">
                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-xs text-gray-600">CPU Usage</span>
                      <span class="text-xs font-medium">{{ devicesStore.activeDevice.metrics.cpu_usage.toFixed(1) }}%</span>
                    </div>
                    <VaProgressBar :model-value="devicesStore.activeDevice.metrics.cpu_usage" color="primary" size="small" />
                  </div>
                  <div v-if="devicesStore.activeDevice.metrics.cpu_temp">
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-xs text-gray-600">CPU Temperature</span>
                      <span class="text-xs font-medium">{{ devicesStore.activeDevice.metrics.cpu_temp }}°C</span>
                    </div>
                    <VaProgressBar
                      :model-value="(devicesStore.activeDevice.metrics.cpu_temp / 85) * 100"
                      :color="devicesStore.activeDevice.metrics.cpu_temp > 70 ? 'danger' : devicesStore.activeDevice.metrics.cpu_temp > 60 ? 'warning' : 'success'"
                      size="small"
                    />
                  </div>
                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-xs text-gray-600">Memory Usage</span>
                      <span class="text-xs font-medium">{{ devicesStore.activeDevice.metrics.memory_percent.toFixed(1) }}%</span>
                    </div>
                    <VaProgressBar :model-value="devicesStore.activeDevice.metrics.memory_percent" color="info" size="small" />
                  </div>
                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-xs text-gray-600">Storage Usage</span>
                      <span class="text-xs font-medium">{{ devicesStore.activeDevice.metrics.storage_percent.toFixed(1) }}%</span>
                    </div>
                    <VaProgressBar :model-value="devicesStore.activeDevice.metrics.storage_percent" color="warning" size="small" />
                  </div>
                  <div v-if="devicesStore.activeDevice.metrics.uptime">
                    <div class="flex items-center justify-between">
                      <span class="text-xs text-gray-600">Uptime</span>
                      <span class="text-xs font-medium">
                        {{ Math.floor(devicesStore.activeDevice.metrics.uptime / 3600) }}h {{ Math.floor((devicesStore.activeDevice.metrics.uptime % 3600) / 60) }}m
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </VaCardContent>
          </VaCard>

          <!-- Top Processes Card -->
          <VaCard v-if="devicesStore.activeDevice.status === 'online' && devicesStore.activeDevice.metrics?.top_processes && devicesStore.activeDevice.metrics.top_processes.length > 0" class="device-card">
            <VaCardContent>
              <div class="flex items-center gap-2 mb-4">
                <VaIcon name="list" color="primary" />
                <h3 class="text-lg font-semibold">Top Processes</h3>
              </div>
                <div class="overflow-x-auto">
                  <table class="min-w-full text-xs">
                    <thead>
                      <tr class="bg-gray-50">
                        <th class="px-2 py-1 text-left text-xs font-medium text-gray-500">PID</th>
                        <th class="px-2 py-1 text-left text-xs font-medium text-gray-500">Process</th>
                        <th class="px-2 py-1 text-left text-xs font-medium text-gray-500">CPU</th>
                        <th class="px-2 py-1 text-left text-xs font-medium text-gray-500">Mem</th>
                      </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-100">
                      <tr
                        v-for="process in devicesStore.activeDevice.metrics.top_processes.slice(0, 5)"
                        :key="process.pid"
                        class="hover:bg-gray-50"
                      >
                        <td class="px-2 py-1 text-gray-900">{{ process.pid }}</td>
                        <td class="px-2 py-1 text-gray-900 font-medium max-w-[100px] truncate" :title="process.name">
                          {{ process.name }}
                        </td>
                        <td class="px-2 py-1">
                          <VaChip
                            size="small"
                            :color="process.cpu > 50 ? 'danger' : process.cpu > 25 ? 'warning' : 'success'"
                          >
                            {{ process.cpu.toFixed(1) }}%
                          </VaChip>
                        </td>
                        <td class="px-2 py-1">
                          <VaChip
                            size="small"
                            :color="process.mem > 20 ? 'danger' : process.mem > 10 ? 'warning' : 'info'"
                          >
                            {{ process.mem.toFixed(1) }}%
                          </VaChip>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
            </VaCardContent>
          </VaCard>

          <!-- Application Manager Status Card -->
          <VaCard v-if="devicesStore.activeDevice.managerStatus" class="device-card">
            <VaCardContent>
              <div class="flex items-center gap-2 mb-4">
                <VaIcon name="settings" color="primary" />
                <h3 class="text-lg font-semibold">Applications</h3>
              </div>
            <div class="status-grid">
              <div class="status-item">
                <span class="status-label">Apps:</span>
                <span class="status-value">{{ devicesStore.activeDevice.managerStatus.currentApps }}</span>
              </div>
              <div class="status-item">
                <span class="status-label">Services:</span>
                <span class="status-value">{{ devicesStore.activeDevice.managerStatus.currentServices }}</span>
              </div>
              <div class="status-item">
                <span class="status-label">Applying:</span>
                <VaBadge :text="devicesStore.activeDevice.managerStatus.isApplying ? 'YES' : 'NO'" :color="devicesStore.activeDevice.managerStatus.isApplying ? 'warning' : 'success'" />
              </div>
              <div class="status-item">
                <span class="status-label">Reconciling:</span>
                <VaBadge :text="devicesStore.activeDevice.managerStatus.isReconciling ? 'YES' : 'NO'" :color="devicesStore.activeDevice.managerStatus.isReconciling ? 'info' : 'success'" />
              </div>
            </div>
            <div v-if="devicesStore.activeDevice.managerStatus.lastError" class="status-error">
              <VaIcon name="error" size="small" color="danger" />
              <span class="error-text">{{ devicesStore.activeDevice.managerStatus.lastError }}</span>
            </div>
            
            <!-- Reconcile Button -->
            <div v-if="needsApply(devicesStore.activeDevice)" class="apply-state-section">
              <VaButton
                size="small"
                preset="secondary"
                :loading="applyingDevices.has(devicesStore.activeDevice.id)"
                @click="reconcileState(devicesStore.activeDevice.id, devicesStore.activeDevice.name)"
              >
                <VaIcon name="sync" size="small" />
                Reconcile
              </VaButton>
            </div>
            </VaCardContent>
          </VaCard>

        </div><!-- Close device cards grid -->

        <!-- Empty State -->
        <div v-else class="empty-state-container">
        <VaCard class="empty-state-card">
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
    </div><!-- Close empty-state-container -->

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

    <!-- Edit Device Modal -->
    <VaModal v-model="showEditDialog" size="medium" title="Edit Device" hide-default-actions>
      <VaForm class="space-y-4">
        <VaInput v-model="editDevice.name" label="Device Name *" placeholder="e.g., Raspberry Pi - Kitchen" required />

        <VaInput v-model="editDevice.hostname" label="Hostname/IP Address *" placeholder="e.g., 192.168.1.100" required />

        <div class="grid grid-cols-2 gap-4">
          <VaInput v-model.number="editDevice.port" label="Port" placeholder="3002" type="number" />

          <VaSelect v-model="editDevice.protocol" label="Protocol" :options="['http', 'https']" />
        </div>

        <VaInput v-model="editDevice.location" label="Location" placeholder="e.g., Kitchen, Office" />

        <VaTextarea
          v-model="editDevice.description"
          label="Description"
          placeholder="Additional notes about this device"
          :min-rows="3"
        />

        <VaDivider />

        <div class="text-sm text-gray-600">
          <VaIcon name="info" size="small" class="mr-1" />
          <span>Changes will be saved immediately.</span>
        </div>
      </VaForm>

      <template #footer>
        <div class="flex gap-3 justify-end">
          <VaButton preset="secondary" @click="cancelEditDialog"> Cancel </VaButton>
          <VaButton :disabled="!editDevice.name || !editDevice.hostname" :loading="devicesStore.isLoading" @click="saveEditDevice">
            <VaIcon name="save" class="mr-1" />
            Save Changes
          </VaButton>
        </div>
      </template>
    </VaModal>
      </div><!-- Close device-main-content -->
    </div><!-- Close flex gap-4 -->
  </div><!-- Close devices-page -->
</template>

<style scoped>
.devices-page {
  padding: 1rem;
}

/* Sidebar Styles */
.device-sidebar {
  width: 280px;
  min-width: 280px;
  border-right: 1px solid #e0e0e0;
  background: #f8f9fa;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 120px);
}

.sidebar-header {
  padding: 1rem;
  border-bottom: 1px solid #e0e0e0;
  background: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.device-list {
  flex: 1;
  overflow-y: auto;
}

.device-list-item {
  padding: 0.75rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid #e0e0e0;
  transition: all 0.2s;
  position: relative;
  background: white;
}

.device-list-item:hover {
  background: #e8eaf6;
}

.device-list-item.active {
  background: #3f51b5;
  color: white;
  border-left: 4px solid #303f9f;
}

.device-list-item.active .device-list-name,
.device-list-item.active .device-list-hostname {
  color: white;
}

.device-list-name {
  font-weight: 600;
  font-size: 0.875rem;
  color: #333;
}

.device-list-hostname {
  font-size: 0.75rem;
  color: #666;
  display: block;
  margin-top: 0.25rem;
}

.delete-btn {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  transition: opacity 0.2s;
}

.device-list-item:hover .delete-btn {
  opacity: 1;
}

.sidebar-empty {
  padding: 2rem 1rem;
  text-align: center;
  color: #666;
}

.device-main-content {
  flex: 1;
  min-width: 0;
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
