<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDevicesStore } from '../../stores/devices'
import { useToast } from 'vuestic-ui'
import type { AddDeviceRequest } from '../../data/types/device'

const devicesStore = useDevicesStore()

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

onMounted(async () => {
  await devicesStore.initialize()
})

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

// Switch device
const setActiveDevice = (deviceId: string) => {
  devicesStore.setActiveDevice(deviceId)
}

// Remove device
const confirmRemoveDevice = (deviceId: string, deviceName: string) => {
  if (confirm(`Are you sure you want to remove device "${deviceName}"?`)) {
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
</script>

<template>
  <div class="devices-page">
    <h1 class="page-title">Device Manager</h1>

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
          <div class="flex gap-2">
            <VaButton preset="secondary" icon="refresh" :loading="devicesStore.isLoading" @click="refreshDevices">
              Refresh
            </VaButton>
            <VaButton icon="add" @click="showAddDialog = true"> Add Device </VaButton>
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
</style>
