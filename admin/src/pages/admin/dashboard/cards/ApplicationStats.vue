<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useApplicationManagerStore } from '../../../../stores/device-manager'
import { VaCard, VaCardTitle, VaCardContent, VaIcon, VaBadge } from 'vuestic-ui'

const applicationStore = useApplicationManagerStore()

onMounted(async () => {
  await applicationStore.fetchApplications()
})

const stats = ref([
  {
    title: 'Total Applications',
    value: () => applicationStore.totalApplications,
    icon: 'apps',
    color: 'primary',
  },
  {
    title: 'Total Services',
    value: () => applicationStore.totalServices,
    icon: 'dns',
    color: 'info',
  },
  {
    title: 'Running',
    value: () => applicationStore.runningApplications.length,
    icon: 'check_circle',
    color: 'success',
  },
])
</script>

<template>
  <VaCard>
    <VaCardTitle>Application Manager</VaCardTitle>
    <VaCardContent>
      <div class="grid grid-cols-3 gap-4">
        <div v-for="stat in stats" :key="stat.title" class="text-center">
          <div class="flex justify-center mb-2">
            <VaIcon :name="stat.icon" :color="stat.color" size="2rem" />
          </div>
          <div class="text-3xl font-bold mb-1">{{ stat.value() }}</div>
          <div class="text-sm text-gray-600">{{ stat.title }}</div>
        </div>
      </div>

      <div v-if="applicationStore.deviceInfo" class="mt-6 pt-4 border-t">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm text-gray-600">Device Status</div>
            <div class="font-semibold">{{ applicationStore.deviceInfo.deviceName || 'Unnamed Device' }}</div>
          </div>
          <VaBadge
            :text="applicationStore.isDeviceProvisioned ? 'Provisioned' : 'Not Provisioned'"
            :color="applicationStore.isDeviceProvisioned ? 'success' : 'warning'"
          />
        </div>
      </div>
    </VaCardContent>
  </VaCard>
</template>
