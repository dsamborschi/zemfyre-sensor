<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useApplicationManagerStore } from '../../../../stores/application-manager'
import { VaCard, VaCardTitle, VaCardContent, VaProgressBar, VaProgressCircle, VaBadge } from 'vuestic-ui'

const applicationStore = useApplicationManagerStore()
const refreshInterval = ref<NodeJS.Timeout | null>(null)

onMounted(async () => {
  // Initial fetch
  await applicationStore.fetchSystemMetrics()
  
  // Auto-refresh every 5 seconds
  refreshInterval.value = setInterval(() => {
    applicationStore.fetchSystemMetrics()
  }, 5000)
})

onUnmounted(() => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
  }
})

const formatBytes = (bytes: number): string => {
  return `${(bytes / 1024).toFixed(1)} GB`
}

const getProgressColor = (percent: number): string => {
  if (percent >= 90) return 'danger'
  if (percent >= 75) return 'warning'
  return 'success'
}
</script>

<template>
  <VaCard>
    <VaCardTitle class="flex items-center justify-between">
      <span>System Metrics</span>
      <VaBadge text="Live" color="success" />
    </VaCardTitle>
    <VaCardContent>
      <div v-if="applicationStore.systemMetrics" class="space-y-6">
        <!-- CPU Section -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <VaIcon name="memory" size="small" />
              <span class="font-semibold">CPU Usage</span>
            </div>
            <span class="text-sm font-bold">{{ applicationStore.systemMetrics.cpu.usage.toFixed(1) }}%</span>
          </div>
          <VaProgressBar
            :model-value="applicationStore.systemMetrics.cpu.usage"
            :color="getProgressColor(applicationStore.systemMetrics.cpu.usage)"
            size="large"
          />
          <div class="text-xs text-gray-600 mt-1">
            {{ applicationStore.systemMetrics.cpu.cores }} cores available
          </div>
        </div>

        <!-- Memory Section -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <VaIcon name="storage" size="small" />
              <span class="font-semibold">Memory</span>
            </div>
            <span class="text-sm font-bold">{{ applicationStore.systemMetrics.memory.usedPercent.toFixed(1) }}%</span>
          </div>
          <VaProgressBar
            :model-value="applicationStore.systemMetrics.memory.usedPercent"
            :color="getProgressColor(applicationStore.systemMetrics.memory.usedPercent)"
            size="large"
          />
          <div class="text-xs text-gray-600 mt-1">
            {{ formatBytes(applicationStore.systemMetrics.memory.used) }} / 
            {{ formatBytes(applicationStore.systemMetrics.memory.total) }}
          </div>
        </div>

        <!-- Disk Section -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <VaIcon name="sd_card" size="small" />
              <span class="font-semibold">Disk Space</span>
            </div>
            <span class="text-sm font-bold">{{ applicationStore.systemMetrics.disk.usedPercent.toFixed(1) }}%</span>
          </div>
          <VaProgressBar
            :model-value="applicationStore.systemMetrics.disk.usedPercent"
            :color="getProgressColor(applicationStore.systemMetrics.disk.usedPercent)"
            size="large"
          />
          <div class="text-xs text-gray-600 mt-1">
            {{ formatBytes(applicationStore.systemMetrics.disk.used) }} / 
            {{ formatBytes(applicationStore.systemMetrics.disk.total) }}
          </div>
        </div>

        <!-- Circular Gauges Grid -->
        <div class="grid grid-cols-3 gap-6 pt-6 border-t">
          <div class="flex flex-col items-center">
            <VaProgressCircle
              :model-value="applicationStore.systemMetrics.cpu.usage"
              :color="getProgressColor(applicationStore.systemMetrics.cpu.usage)"
              :thickness="0.1"
              size="large"
            >
              <div class="flex flex-col items-center justify-center p-2">
                <span class="text-2xl font-bold leading-none">{{ applicationStore.systemMetrics.cpu.usage.toFixed(0) }}%</span>
              </div>
            </VaProgressCircle>
            <span class="text-sm font-semibold text-gray-700 mt-3">CPU</span>
          </div>
          
          <div class="flex flex-col items-center">
            <VaProgressCircle
              :model-value="applicationStore.systemMetrics.memory.usedPercent"
              :color="getProgressColor(applicationStore.systemMetrics.memory.usedPercent)"
              :thickness="0.1"
              size="large"
            >
              <div class="flex flex-col items-center justify-center p-2">
                <span class="text-2xl font-bold leading-none">{{ applicationStore.systemMetrics.memory.usedPercent.toFixed(0) }}%</span>
              </div>
            </VaProgressCircle>
            <span class="text-sm font-semibold text-gray-700 mt-3">Memory</span>
          </div>
          
          <div class="flex flex-col items-center">
            <VaProgressCircle
              :model-value="applicationStore.systemMetrics.disk.usedPercent"
              :color="getProgressColor(applicationStore.systemMetrics.disk.usedPercent)"
              :thickness="0.1"
              size="large"
            >
              <div class="flex flex-col items-center justify-center p-2">
                <span class="text-2xl font-bold leading-none">{{ applicationStore.systemMetrics.disk.usedPercent.toFixed(0) }}%</span>
              </div>
            </VaProgressCircle>
            <span class="text-sm font-semibold text-gray-700 mt-3">Disk</span>
          </div>
        </div>

        <!-- Network Stats (if available) -->
        <div v-if="applicationStore.systemMetrics.network" class="pt-4 border-t">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <VaIcon name="arrow_downward" size="small" color="info" />
                <span class="text-sm font-semibold">Received</span>
              </div>
              <div class="text-lg font-bold">
                {{ formatBytes(applicationStore.systemMetrics.network.bytesReceived) }}
              </div>
            </div>
            <div>
              <div class="flex items-center gap-2 mb-1">
                <VaIcon name="arrow_upward" size="small" color="warning" />
                <span class="text-sm font-semibold">Sent</span>
              </div>
              <div class="text-lg font-bold">
                {{ formatBytes(applicationStore.systemMetrics.network.bytesSent) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div v-else class="flex flex-col items-center justify-center py-8">
        <VaProgressCircle indeterminate />
        <p class="mt-4 text-gray-600">Loading system metrics...</p>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<style scoped>
.space-y-6 > * + * {
  margin-top: 1.5rem;
}
</style>
