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

const formatMB = (mb: number): string => {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`
  }
  return `${mb.toFixed(0)} MB`
}

const getProgressColor = (percent: number): string => {
  if (percent >= 90) return 'danger'
  if (percent >= 75) return 'warning'
  return 'success'
}

const getTempColor = (temp: number): string => {
  if (temp >= 70) return 'danger'
  if (temp >= 60) return 'warning'
  return 'success'
}
</script>

<template>
  <VaCard>
    <VaCardTitle class="flex items-center justify-between">
      <span>System Metrics</span>
      <div class="flex items-center gap-2">
        <VaBadge v-if="applicationStore.systemMetrics?.is_undervolted" text="Undervolted" color="warning" />
        <VaBadge text="Live" color="success" />
      </div>
    </VaCardTitle>
    <VaCardContent>
      <div v-if="applicationStore.systemMetrics" class="space-y-6">
        <!-- System Info -->
        <div class="flex items-center justify-between text-sm text-gray-600">
          <span>{{ applicationStore.systemMetrics.hostname }}</span>
          <span>Uptime: {{ applicationStore.systemMetrics.uptime_formatted }}</span>
        </div>

        <!-- CPU Usage Section -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <VaIcon name="memory" size="small" />
              <span class="font-semibold">CPU Usage</span>
            </div>
            <span class="text-sm font-bold">{{ applicationStore.systemMetrics.cpu_usage.toFixed(1) }}%</span>
          </div>
          <VaProgressBar
            :model-value="applicationStore.systemMetrics.cpu_usage"
            :color="getProgressColor(applicationStore.systemMetrics.cpu_usage)"
            size="large"
          />
          <div class="text-xs text-gray-600 mt-1">{{ applicationStore.systemMetrics.cpu_cores }} cores available</div>
        </div>

        <!-- CPU Temperature Section -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <VaIcon name="device_thermostat" size="small" />
              <span class="font-semibold">CPU Temperature</span>
            </div>
            <span class="text-sm font-bold">{{ applicationStore.systemMetrics.cpu_temp }}°C</span>
          </div>
          <VaProgressBar
            :model-value="(applicationStore.systemMetrics.cpu_temp / 85) * 100"
            :color="getTempColor(applicationStore.systemMetrics.cpu_temp)"
            size="large"
          />
          <div class="text-xs text-gray-600 mt-1">Normal operating range: 0-85°C</div>
        </div>

        <!-- Memory Section -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <VaIcon name="storage" size="small" />
              <span class="font-semibold">Memory</span>
            </div>
            <span class="text-sm font-bold">{{ applicationStore.systemMetrics.memory_percent.toFixed(1) }}%</span>
          </div>
          <VaProgressBar
            :model-value="applicationStore.systemMetrics.memory_percent"
            :color="getProgressColor(applicationStore.systemMetrics.memory_percent)"
            size="large"
          />
          <div class="text-xs text-gray-600 mt-1">
            {{ formatMB(applicationStore.systemMetrics.memory_usage) }} /
            {{ formatMB(applicationStore.systemMetrics.memory_total) }}
          </div>
        </div>

        <!-- Disk Section -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <VaIcon name="sd_card" size="small" />
              <span class="font-semibold">Disk Space</span>
            </div>
            <span class="text-sm font-bold">{{ applicationStore.systemMetrics.storage_percent.toFixed(1) }}%</span>
          </div>
          <VaProgressBar
            :model-value="applicationStore.systemMetrics.storage_percent"
            :color="getProgressColor(applicationStore.systemMetrics.storage_percent)"
            size="large"
          />
          <div class="text-xs text-gray-600 mt-1">
            {{ formatMB(applicationStore.systemMetrics.storage_usage) }} /
            {{ formatMB(applicationStore.systemMetrics.storage_total) }}
          </div>
        </div>

        <!-- Circular Gauges Grid -->
        <div class="grid grid-cols-4 gap-4 pt-6 border-t">
          <div class="flex flex-col items-center">
            <VaProgressCircle
              :model-value="applicationStore.systemMetrics.cpu_usage"
              :color="getProgressColor(applicationStore.systemMetrics.cpu_usage)"
              :thickness="0.1"
              size="large"
            >
              <div class="flex flex-col items-center justify-center p-2">
                <span class="text-2xl font-bold leading-none"
                  >{{ applicationStore.systemMetrics.cpu_usage.toFixed(0) }}%</span
                >
              </div>
            </VaProgressCircle>
            <span class="text-sm font-semibold text-gray-700 mt-3">CPU</span>
          </div>

          <div class="flex flex-col items-center">
            <VaProgressCircle
              :model-value="(applicationStore.systemMetrics.cpu_temp / 85) * 100"
              :color="getTempColor(applicationStore.systemMetrics.cpu_temp)"
              :thickness="0.1"
              size="large"
            >
              <div class="flex flex-col items-center justify-center p-2">
                <span class="text-2xl font-bold leading-none">{{ applicationStore.systemMetrics.cpu_temp }}°</span>
              </div>
            </VaProgressCircle>
            <span class="text-sm font-semibold text-gray-700 mt-3">Temp</span>
          </div>

          <div class="flex flex-col items-center">
            <VaProgressCircle
              :model-value="applicationStore.systemMetrics.memory_percent"
              :color="getProgressColor(applicationStore.systemMetrics.memory_percent)"
              :thickness="0.1"
              size="large"
            >
              <div class="flex flex-col items-center justify-center p-2">
                <span class="text-2xl font-bold leading-none"
                  >{{ applicationStore.systemMetrics.memory_percent.toFixed(0) }}%</span
                >
              </div>
            </VaProgressCircle>
            <span class="text-sm font-semibold text-gray-700 mt-3">Memory</span>
          </div>

          <div class="flex flex-col items-center">
            <VaProgressCircle
              :model-value="applicationStore.systemMetrics.storage_percent"
              :color="getProgressColor(applicationStore.systemMetrics.storage_percent)"
              :thickness="0.1"
              size="large"
            >
              <div class="flex flex-col items-center justify-center p-2">
                <span class="text-2xl font-bold leading-none"
                  >{{ applicationStore.systemMetrics.storage_percent.toFixed(0) }}%</span
                >
              </div>
            </VaProgressCircle>
            <span class="text-sm font-semibold text-gray-700 mt-3">Disk</span>
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
