<script setup lang="ts">
import { ref } from 'vue'
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

// Switch device
const switchDevice = (deviceId: string) => {
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
</script>

<template>
  <div class="device-sidebar">
    <!-- Header -->
    <div class="sidebar-header">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Devices</h3>
        <div class="flex gap-2">
          <VaButton
            preset="plain"
            icon="refresh"
            size="small"
            :loading="devicesStore.isLoading"
            @click="refreshDevices"
          />
          <VaButton preset="plain" icon="add" size="small" @click="showAddDialog = true" />
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 gap-2 mb-4">
        <div class="stat-card">
          <VaIcon name="devices" size="small" color="primary" />
          <span class="stat-value">{{ devicesStore.stats.totalDevices }}</span>
          <span class="stat-label">Total</span>
        </div>
        <div class="stat-card">
          <VaIcon name="check_circle" size="small" color="success" />
          <span class="stat-value">{{ devicesStore.stats.onlineDevices }}</span>
          <span class="stat-label">Online</span>
        </div>
      </div>
    </div>

    <!-- Device List -->
    <div class="device-list">
      <VaCard
        v-for="device in devicesStore.devices"
        :key="device.id"
        :class="['device-card', { active: device.id === devicesStore.activeDeviceId }]"
        @click="switchDevice(device.id)"
      >
        <VaCardContent class="p-3">
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <VaBadge :color="getStatusColor(device.status)" dot />
                <span class="font-semibold text-sm truncate">{{ device.name }}</span>
              </div>
              <div class="text-xs text-gray-600 truncate">
                {{ device.hostname }}
              </div>
              <div v-if="device.location" class="text-xs text-gray-500 mt-1">
                <VaIcon name="location_on" size="12px" />
                {{ device.location }}
              </div>
            </div>
          </div>
        </VaCardContent>
      </VaCard>

      <!-- Empty State -->
      <div v-if="devicesStore.devices.length === 0" class="empty-state">
        <VaIcon name="devices" size="large" color="secondary" />
        <p class="text-sm text-gray-600 mt-2">No devices added yet</p>
        <VaButton size="small" class="mt-3" @click="showAddDialog = true"> Add Device </VaButton>
      </div>
    </div>

    <!-- Add Device Dialog -->
    <VaModal v-model="showAddDialog" title="Add New Device" size="medium" hide-default-actions>
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
          <VaButton preset="secondary" @click="cancelAddDialog">
            Cancel
          </VaButton>
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
.device-sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  background: #f8f9fa;
  border-right: 1px solid #e0e0e0;
}

.sidebar-header {
  flex-shrink: 0;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem;
  background: white;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: bold;
  margin-top: 0.25rem;
}

.stat-label {
  font-size: 0.75rem;
  color: #666;
  margin-top: 0.25rem;
}

.device-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-right: 0.25rem;
}

.device-card {
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.device-card:hover {
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.device-card.active {
  border-color: var(--va-primary);
  background: #fff;
  box-shadow: 0 2px 12px rgba(66, 133, 244, 0.2);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
}

.space-y-4 > * + * {
  margin-top: 1rem;
}
</style>
