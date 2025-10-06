<script setup lang="ts">
import { computed } from 'vue'
import type { Application, ServiceConfig } from '../../../data/pages/applications'

interface Props {
  app: Application
  isOffline?: boolean
  isPending?: boolean
  reconciliationSummary?: {
    status: string
    text: string
    color: string
  } | null
  reconciliationStatus?: any
  onServiceClick?: (service: ServiceConfig, app: Application) => void
  onEdit?: (app: Application) => void
  onDelete?: (appId: number) => void
  onReconcile?: () => void
}

const props = withDefaults(defineProps<Props>(), {
  isOffline: false,
  isPending: false,
  reconciliationSummary: null,
  reconciliationStatus: null,
})

const getStatusColor = (status?: string) => {
  switch (status) {
    case 'running':
      return 'success'
    case 'stopped':
      return 'danger'
    case 'deploying':
      return 'info'
    case 'error':
      return 'danger'
    default:
      return 'secondary'
  }
}

const getServiceStatusColor = (status?: string) => {
  if (!status) return 'secondary'
  const statusLower = status.toLowerCase()
  
  if (statusLower === 'running') return 'success'
  if (statusLower === 'stopped' || statusLower === 'exited') return 'danger'
  if (statusLower === 'restarting' || statusLower === 'starting') return 'warning'
  if (statusLower === 'paused') return 'info'
  
  return 'secondary'
}

const getServiceStatusText = (status?: string) => {
  if (!status) return 'Unknown'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

const getServiceStatus = (appId: number, serviceId: number) => {
  return props.reconciliationStatus?.[appId]?.services?.[serviceId] || null
}

const handleServiceClick = (service: ServiceConfig) => {
  if (props.onServiceClick && !props.isPending) {
    props.onServiceClick(service, props.app)
  }
}

const handleEdit = () => {
  if (props.onEdit) {
    props.onEdit(props.app)
  }
}

const handleDelete = () => {
  if (props.onDelete) {
    props.onDelete(props.app.appId)
  }
}

const handleReconcile = () => {
  if (props.onReconcile) {
    props.onReconcile()
  }
}

// Format image name (handle both string and object formats)
const formatImageName = (imageName: any): string => {
  return typeof imageName === 'object' && imageName !== null 
    ? (imageName as any).value 
    : imageName
}
</script>

<template>
  <VaCard
    outlined
    class="application-card"
    :style="isPending ? 'border-color: #ced4da; background-color: #ffffff;' : ''"
  >
    <VaCardContent>
      <!-- App Header -->
      <div class="flex items-start justify-between mb-3">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <VaBadge
              v-if="app.status || isPending"
              :color="isPending ? 'info' : getStatusColor(app.status)"
              dot
            />
            <h3 class="font-semibold text-lg">
              <VaIcon :name="isPending ? 'schedule' : 'apps'" size="small" class="mr-1" />
              {{ app.appName }}
            </h3>
          </div>
          <p class="text-sm text-gray-600">ID: {{ app.appId }}</p>
        </div>
        <VaButton
          v-if="!isOffline && !isPending"
          preset="plain"
          icon="delete"
          size="small"
          color="danger"
          @click.stop="handleDelete"
        />
      </div>

      <!-- Status Badges -->
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <VaBadge
          v-if="app.status"
          :text="app.status"
          :color="getStatusColor(app.status)"
        />
        <VaBadge
          v-if="isPending"
          text="Not Deployed"
          color="info"
          outline
        />
        <!-- App-level reconciliation status -->
        <VaBadge
          v-if="reconciliationSummary"
          :text="reconciliationSummary.text"
          :color="reconciliationSummary.color"
        />
      </div>

      <!-- Services Section -->
      <div class="border-t pt-3">
        <p class="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
          <VaIcon name="dns" size="small" />
          Services ({{ app.services.length }})
        </p>
        <div class="space-y-2">
          <div
            v-for="service in app.services"
            :key="service.serviceId"
            class="p-3 rounded flex items-center justify-between transition-colors"
            :class="isPending ? '' : 'bg-gray-50 hover:bg-gray-100 cursor-pointer'"
            :style="isPending ? 'background-color: #f1f3f5;' : ''"
            @click="handleServiceClick(service)"
          >
            <div class="flex-1">
              <p class="font-semibold">
                {{ service.serviceName }}
              </p>
              <p class="text-sm text-gray-600">
                {{ formatImageName(service.imageName) }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <VaBadge
                v-if="(service as any).status && !isPending"
                :text="getServiceStatusText((service as any).status)"
                :color="getServiceStatusColor((service as any).status)"
              />
              <!-- Reconciliation Status Badge -->
              <VaBadge
                v-if="getServiceStatus(app.appId, service.serviceId)"
                :text="getServiceStatus(app.appId, service.serviceId).status === 'in-sync' ? '✓ In Sync' : 
                       getServiceStatus(app.appId, service.serviceId).status === 'needs-update' ? '⟳ Needs Update' :
                       getServiceStatus(app.appId, service.serviceId).status === 'missing' ? '+ Missing' : '− Extra'"
                :color="getServiceStatus(app.appId, service.serviceId).status === 'in-sync' ? 'success' : 
                        getServiceStatus(app.appId, service.serviceId).status === 'needs-update' ? 'warning' :
                        getServiceStatus(app.appId, service.serviceId).status === 'missing' ? 'info' : 'danger'"
                :title="getServiceStatus(app.appId, service.serviceId).reason || ''"
              />
              <VaBadge
                :text="`Service ${service.serviceId}`"
                :color="isPending ? 'secondary' : 'info'"
              />
              <VaIcon
                v-if="!isPending"
                name="arrow_forward"
                size="small"
                color="secondary"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- App Actions -->
      <div v-if="!isOffline" class="mt-4 pt-3 border-t flex gap-2">
        <VaButton
          v-if="!isPending"
          size="small"
          preset="secondary"
          @click="handleEdit"
        >
          <VaIcon name="edit" size="small" class="mr-1" />
          Edit
        </VaButton>
        <VaButton
          v-if="reconciliationSummary && reconciliationSummary.status !== 'in-sync' && !isPending"
          size="small"
          preset="secondary"
          color="warning"
          @click="handleReconcile"
        >
          <VaIcon name="sync" size="small" class="mr-1" />
          Reconcile
        </VaButton>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<style scoped>
.application-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.application-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
</style>
