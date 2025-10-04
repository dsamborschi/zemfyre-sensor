<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useApplicationManagerStore } from '../../stores/application-manager'
import type { Application, ServiceConfig } from '../../data/pages/applications'

const applicationStore = useApplicationManagerStore()

// Deployment dialog state
const showDeployDialog = ref(false)
const showEditDialog = ref(false)
const isEditMode = ref(false)
const editingAppId = ref<number | null>(null)

// Service details dialog state
const showServiceDetailsDialog = ref(false)
const selectedService = ref<ServiceConfig | null>(null)
const selectedServiceApp = ref<Application | null>(null)
const serviceDetailsTab = ref('details')
const serviceLogs = ref<string[]>([])
const consoleCommand = ref('')
const consoleOutput = ref<string[]>([])
const isLoadingLogs = ref(false)
const isExecutingCommand = ref(false)
const isEditingServiceDetails = ref(false)
const editedService = ref<ServiceConfig | null>(null)
const editPortInput = ref('')
const editEnvKeyInput = ref('')
const editEnvValueInput = ref('')

const newApplication = ref<Application>({
  appId: 0,
  appName: '',
  services: [],
})

// Services array for the application
const services = ref<ServiceConfig[]>([])

// Current service being edited
const currentServiceIndex = ref(0)

// Service form state (for the currently selected service)
const newService = ref<ServiceConfig>({
  serviceId: 1,
  serviceName: '',
  imageName: '',
  appId: 0,
  appName: '',
  config: {
    image: '',
    ports: [],
    environment: {},
  },
})

// Form inputs for ports and environment
const portInput = ref('')
const envKeyInput = ref('')
const envValueInput = ref('')

// Popular Docker images
const popularImages = [
  { text: 'NGINX (Web Server)', value: 'nginx:alpine' },
  { text: 'NGINX (Latest)', value: 'nginx:latest' },
  { text: 'PostgreSQL 16', value: 'postgres:16-alpine' },
  { text: 'PostgreSQL (Latest)', value: 'postgres:latest' },
  { text: 'MySQL 8', value: 'mysql:8' },
  { text: 'MySQL (Latest)', value: 'mysql:latest' },
  { text: 'Redis (Alpine)', value: 'redis:alpine' },
  { text: 'Redis (Latest)', value: 'redis:latest' },
  { text: 'MongoDB 7', value: 'mongo:7' },
  { text: 'MongoDB (Latest)', value: 'mongo:latest' },
  { text: 'Node.js 20 (Alpine)', value: 'node:20-alpine' },
  { text: 'Node.js (Latest)', value: 'node:latest' },
  { text: 'Python 3.12 (Slim)', value: 'python:3.12-slim' },
  { text: 'Python (Latest)', value: 'python:latest' },
  { text: 'Apache HTTP Server', value: 'httpd:alpine' },
  { text: 'Traefik (Proxy)', value: 'traefik:latest' },
  { text: 'InfluxDB 2', value: 'influxdb:2-alpine' },
  { text: 'Grafana', value: 'grafana/grafana:latest' },
  { text: 'Mosquitto (MQTT)', value: 'eclipse-mosquitto:latest' },
  { text: 'RabbitMQ', value: 'rabbitmq:3-management-alpine' },
  { text: 'Elasticsearch', value: 'elasticsearch:8.11.0' },
  { text: 'MariaDB', value: 'mariadb:latest' },
  { text: 'Memcached', value: 'memcached:alpine' },
]

onMounted(async () => {
  await applicationStore.initialize()
})

const refreshData = async () => {
  await applicationStore.refresh()
}

const resetServiceForm = () => {
  newService.value = {
    serviceId: services.value.length + 1,
    serviceName: '',
    imageName: '',
    appId: newApplication.value.appId,
    appName: newApplication.value.appName,
    config: {
      image: '',
      ports: [],
      environment: {},
    },
  }
  portInput.value = ''
  envKeyInput.value = ''
  envValueInput.value = ''
}

const openDeployDialog = () => {
  isEditMode.value = false
  editingAppId.value = null
  // Reset form
  newApplication.value = {
    appId: Date.now(), // Generate unique ID
    appName: '',
    services: [],
  }
  services.value = []
  currentServiceIndex.value = 0
  resetServiceForm()
  showDeployDialog.value = true
}

const openEditDialog = (app: Application) => {
  isEditMode.value = true
  editingAppId.value = app.appId

  // Load application data into form
  newApplication.value = {
    appId: app.appId,
    appName: app.appName,
    services: [],
    status: app.status,
    createdAt: app.createdAt,
  }

  // Load services
  services.value = app.services.map((service, index) => ({
    ...service,
    serviceId: index + 1,
  }))

  currentServiceIndex.value = -1
  resetServiceForm()
  showEditDialog.value = true
}

const addService = () => {
  if (!newService.value.serviceName || !newService.value.imageName) {
    return
  }

  // Set service config image to match imageName
  newService.value.config.image = newService.value.imageName
  newService.value.appName = newApplication.value.appName
  newService.value.appId = newApplication.value.appId

  // Add to services array
  services.value.push({ ...newService.value })

  // Reset form for next service
  resetServiceForm()
}

const removeService = (index: number) => {
  services.value.splice(index, 1)
  // Re-index service IDs
  services.value.forEach((service, idx) => {
    service.serviceId = idx + 1
  })
}

const editService = (index: number) => {
  currentServiceIndex.value = index
  newService.value = { ...services.value[index] }
}

const updateService = () => {
  if (currentServiceIndex.value >= 0 && currentServiceIndex.value < services.value.length) {
    services.value[currentServiceIndex.value] = { ...newService.value }
    resetServiceForm()
    currentServiceIndex.value = -1
  }
}

const isEditingService = computed(() => {
  return currentServiceIndex.value >= 0 && currentServiceIndex.value < services.value.length
})

const addPort = () => {
  if (portInput.value && !newService.value.config.ports?.includes(portInput.value)) {
    if (!newService.value.config.ports) {
      newService.value.config.ports = []
    }
    newService.value.config.ports.push(portInput.value)
    portInput.value = ''
  }
}

const removePort = (port: string) => {
  if (newService.value.config.ports) {
    newService.value.config.ports = newService.value.config.ports.filter((p) => p !== port)
  }
}

const addEnvironmentVariable = () => {
  if (envKeyInput.value && envValueInput.value) {
    if (!newService.value.config.environment) {
      newService.value.config.environment = {}
    }
    newService.value.config.environment[envKeyInput.value] = envValueInput.value
    envKeyInput.value = ''
    envValueInput.value = ''
  }
}

const removeEnvironmentVariable = (key: string) => {
  if (newService.value.config.environment) {
    delete newService.value.config.environment[key]
  }
}

const cancelCurrentServiceEdit = () => {
  resetServiceForm()
  currentServiceIndex.value = -1
}

const cancelApplicationEdit = () => {
  showEditDialog.value = false
  isEditMode.value = false
}

const deployApplication = async () => {
  try {
    if (services.value.length === 0) {
      alert('Please add at least one service to the application')
      return
    }

    // Add all services to application
    newApplication.value.services = services.value

    await applicationStore.deployNewApplication(newApplication.value)
    showDeployDialog.value = false
  } catch (error) {
    console.error('Deployment failed:', error)
  }
}

const updateApplication = async () => {
  try {
    if (services.value.length === 0) {
      alert('Please add at least one service to the application')
      return
    }

    // Update services in application
    newApplication.value.services = services.value

    await applicationStore.updateExistingApplication(newApplication.value)
    showEditDialog.value = false
    isEditMode.value = false
    editingAppId.value = null
  } catch (error) {
    console.error('Update failed:', error)
  }
}

const removeApplication = async (appId: number) => {
  if (confirm('Are you sure you want to remove this application and all its services?')) {
    try {
      await applicationStore.removeExistingApplication(appId)
    } catch (error) {
      console.error('Failed to remove application:', error)
    }
  }
}

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

const environmentEntries = computed(() => {
  return Object.entries(newService.value.config.environment || {})
})

const openServiceDetails = (service: ServiceConfig, app: Application) => {
  selectedService.value = service
  selectedServiceApp.value = app
  serviceDetailsTab.value = 'details'
  serviceLogs.value = []
  consoleOutput.value = []
  consoleCommand.value = ''
  isEditingServiceDetails.value = false
  editedService.value = null
  editPortInput.value = ''
  editEnvKeyInput.value = ''
  editEnvValueInput.value = ''
  showServiceDetailsDialog.value = true
}

const fetchServiceLogs = async () => {
  if (!selectedService.value) return

  isLoadingLogs.value = true
  try {
    // Simulate fetching logs - replace with actual API call
    await new Promise((resolve) => setTimeout(resolve, 500))
    serviceLogs.value = [
      `[${new Date().toISOString()}] Service ${selectedService.value.serviceName} started`,
      `[${new Date().toISOString()}] Container ID: ${Math.random().toString(36).substring(7)}`,
      `[${new Date().toISOString()}] Image: ${selectedService.value.imageName}`,
      `[${new Date().toISOString()}] Status: Running`,
      `[${new Date().toISOString()}] Memory usage: 45.2 MB`,
      `[${new Date().toISOString()}] CPU usage: 2.3%`,
      `[${new Date().toISOString()}] Network: eth0 connected`,
      `[${new Date().toISOString()}] Listening on configured ports...`,
    ]
  } catch (error) {
    serviceLogs.value = [`Error fetching logs: ${error}`]
  } finally {
    isLoadingLogs.value = false
  }
}

const executeConsoleCommand = async () => {
  if (!consoleCommand.value.trim() || !selectedService.value) return

  isExecutingCommand.value = true
  const cmd = consoleCommand.value
  consoleOutput.value.push(`$ ${cmd}`)

  try {
    // Simulate command execution - replace with actual SSH/exec API call
    await new Promise((resolve) => setTimeout(resolve, 300))

    // Mock responses based on command
    if (cmd.includes('ls')) {
      consoleOutput.value.push('bin  etc  lib  usr  var')
    } else if (cmd.includes('ps')) {
      consoleOutput.value.push('PID   USER     TIME  COMMAND')
      consoleOutput.value.push('1     root     0:00  /bin/sh')
    } else if (cmd.includes('pwd')) {
      consoleOutput.value.push('/app')
    } else {
      consoleOutput.value.push(`Command executed: ${cmd}`)
    }
  } catch (error) {
    consoleOutput.value.push(`Error: ${error}`)
  } finally {
    consoleCommand.value = ''
    isExecutingCommand.value = false
  }
}

const clearConsole = () => {
  consoleOutput.value = []
}

const restartService = async () => {
  if (!selectedService.value) return

  if (confirm(`Are you sure you want to restart ${selectedService.value.serviceName}?`)) {
    try {
      // Simulate restart - replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1000))
      alert(`Service ${selectedService.value.serviceName} restarted successfully`)
    } catch (error) {
      alert(`Failed to restart service: ${error}`)
    }
  }
}

const stopService = async () => {
  if (!selectedService.value) return

  if (confirm(`Are you sure you want to stop ${selectedService.value.serviceName}?`)) {
    try {
      // Simulate stop - replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1000))
      alert(`Service ${selectedService.value.serviceName} stopped successfully`)
    } catch (error) {
      alert(`Failed to stop service: ${error}`)
    }
  }
}

const enableServiceEdit = () => {
  if (!selectedService.value) return

  // Create a deep copy of the service for editing
  editedService.value = JSON.parse(JSON.stringify(selectedService.value))
  isEditingServiceDetails.value = true
  serviceDetailsTab.value = 'details'
}

const cancelServiceEdit = () => {
  editedService.value = null
  isEditingServiceDetails.value = false
  editPortInput.value = ''
  editEnvKeyInput.value = ''
  editEnvValueInput.value = ''
}

const addEditPort = () => {
  if (editPortInput.value && editedService.value) {
    if (!editedService.value.config.ports) {
      editedService.value.config.ports = []
    }
    editedService.value.config.ports.push(editPortInput.value)
    editPortInput.value = ''
  }
}

const removeEditPort = (port: string) => {
  if (editedService.value && editedService.value.config.ports) {
    editedService.value.config.ports = editedService.value.config.ports.filter((p) => p !== port)
  }
}

const addEditEnvironmentVariable = () => {
  if (editEnvKeyInput.value && editEnvValueInput.value && editedService.value) {
    if (!editedService.value.config.environment) {
      editedService.value.config.environment = {}
    }
    editedService.value.config.environment[editEnvKeyInput.value] = editEnvValueInput.value
    editEnvKeyInput.value = ''
    editEnvValueInput.value = ''
  }
}

const removeEditEnvironmentVariable = (key: string) => {
  if (editedService.value && editedService.value.config.environment) {
    delete editedService.value.config.environment[key]
  }
}

const saveServiceChanges = async () => {
  if (!editedService.value || !selectedServiceApp.value) return

  try {
    // Find the application and update the service
    const app = selectedServiceApp.value
    const serviceIndex = app.services.findIndex((s) => s.serviceId === editedService.value!.serviceId)

    if (serviceIndex !== -1) {
      // Update the service in the application
      app.services[serviceIndex] = { ...editedService.value }

      // Update the application
      await applicationStore.updateExistingApplication(app)

      // Update local references
      selectedService.value = { ...editedService.value }
      isEditingServiceDetails.value = false
      editedService.value = null

      alert('Service updated successfully!')
    }
  } catch (error) {
    console.error('Failed to update service:', error)
    alert('Failed to update service. Please try again.')
  }
}
</script>

<template>
  <h1 class="page-title">
    Application Manager
  </h1>

  <!-- Error Display -->
  <VaAlert
    v-if="applicationStore.error"
    color="danger"
    class="mb-4"
    closeable
    @close="applicationStore.clearError()"
  >
    {{ applicationStore.error }}
  </VaAlert>

  <!-- Summary Cards -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
    <VaCard>
      <VaCardContent>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">
              Total Applications
            </p>
            <p class="text-3xl font-bold">
              {{ applicationStore.totalApplications }}
            </p>
          </div>
          <VaIcon
            name="deployed_code"
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
              Total Services
            </p>
            <p class="text-3xl font-bold">
              {{ applicationStore.totalServices }}
            </p>
          </div>
          <VaIcon
            name="dns"
            size="large"
            color="info"
          />
        </div>
      </VaCardContent>
    </VaCard>

    <VaCard>
      <VaCardContent>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">
              Running Applications
            </p>
            <p class="text-3xl font-bold">
              {{ applicationStore.runningApplications.length }}
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
  </div>

  <!-- System Metrics -->
  <VaCard v-if="applicationStore.systemMetrics" class="mb-6">
    <VaCardTitle>
      <div class="flex items-center justify-between">
        <span>System Metrics</span>
        <div class="flex items-center gap-4 text-sm">
          <span class="text-gray-600">{{ applicationStore.systemMetrics.hostname }}</span>
          <VaBadge v-if="applicationStore.systemMetrics.is_undervolted" color="warning" text="Undervolted" />
          <span class="text-gray-500">Uptime: {{ applicationStore.systemMetrics.uptime_formatted }}</span>
        </div>
      </div>
    </VaCardTitle>
    <VaCardContent>
      <!-- Performance Metrics -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div>
          <p class="text-sm text-gray-600">CPU Usage</p>
          <VaProgressBar :model-value="applicationStore.systemMetrics.cpu_usage" color="primary">
            {{ applicationStore.systemMetrics.cpu_usage.toFixed(1) }}%
          </VaProgressBar>
        </div>
        <div>
          <p class="text-sm text-gray-600">CPU Temperature</p>
          <VaProgressBar
            :model-value="(applicationStore.systemMetrics.cpu_temp / 85) * 100"
            :color="applicationStore.systemMetrics.cpu_temp > 70 ? 'danger' : applicationStore.systemMetrics.cpu_temp > 60 ? 'warning' : 'success'"
          >
            {{ applicationStore.systemMetrics.cpu_temp }}°C
          </VaProgressBar>
        </div>
        <div>
          <p class="text-sm text-gray-600">Memory Usage</p>
          <VaProgressBar :model-value="applicationStore.systemMetrics.memory_percent" color="info">
            {{ applicationStore.systemMetrics.memory_percent.toFixed(1) }}%
          </VaProgressBar>
        </div>
        <div>
          <p class="text-sm text-gray-600">Storage Usage</p>
          <VaProgressBar :model-value="applicationStore.systemMetrics.storage_percent" color="warning">
            {{ applicationStore.systemMetrics.storage_percent.toFixed(1) }}%
          </VaProgressBar>
        </div>
      </div>

      <!-- Detailed Information -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="p-3 bg-gray-50 rounded">
          <p class="text-xs text-gray-600 mb-1">CPU Cores</p>
          <p class="text-xl font-bold">{{ applicationStore.systemMetrics.cpu_cores }}</p>
        </div>
        <div class="p-3 bg-gray-50 rounded">
          <p class="text-xs text-gray-600 mb-1">Memory</p>
          <p class="text-xl font-bold">
            {{ applicationStore.systemMetrics.memory_usage }} MB / {{ applicationStore.systemMetrics.memory_total }} MB
          </p>
        </div>
        <div class="p-3 bg-gray-50 rounded">
          <p class="text-xs text-gray-600 mb-1">Storage</p>
          <p class="text-xl font-bold">
            {{ applicationStore.systemMetrics.storage_usage }} MB / {{ applicationStore.systemMetrics.storage_total }} MB
          </p>
        </div>
      </div>
    </VaCardContent>
  </VaCard>

  <!-- Actions -->
  <div class="flex gap-2 mb-4">
    <VaButton
      :disabled="applicationStore.isDeploying"
      @click="openDeployDialog"
    >
      <VaIcon
        name="add"
        class="mr-2"
      />
      Deploy Application
    </VaButton>
    <VaButton
      preset="secondary"
      :loading="applicationStore.isLoading"
      @click="refreshData"
    >
      <VaIcon
        name="refresh"
        class="mr-2"
      />
      Refresh
    </VaButton>
    <VaButton
      preset="secondary"
      @click="applicationStore.fetchSystemMetrics()"
    >
      <VaIcon
        name="monitoring"
        class="mr-2"
      />
      Update Metrics
    </VaButton>
  </div>

  <!-- Applications List -->
  <VaCard>
    <VaCardTitle>Deployed Applications</VaCardTitle>
    <VaCardContent>
      <div
        v-if="applicationStore.isLoadingApplications"
        class="text-center py-8"
      >
        <VaProgressCircle indeterminate />
        <p class="mt-4">
          Loading applications...
        </p>
      </div>

      <div
        v-else-if="applicationStore.applications.length === 0"
        class="text-center py-8"
      >
        <VaIcon
          name="deployed_code"
          size="large"
          color="secondary"
          class="mb-4"
        />
        <p class="text-gray-600">
          No applications deployed yet
        </p>
        <VaButton
          class="mt-4"
          @click="openDeployDialog"
        >
          Deploy Your First Application
        </VaButton>
      </div>

      <div
        v-else
        class="space-y-4"
      >
        <VaCard
          v-for="app in applicationStore.applications"
          :key="app.appId"
          outlined
        >
          <VaCardTitle>
            <div class="flex items-start justify-between w-full">
              <div class="flex flex-col gap-2">
                <div class="flex items-center gap-2">
                  <VaIcon
                    name="apps"
                    size="small"
                  />
                  <span class="font-semibold text-lg">{{ app.appName }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <VaBadge
                    :text="`ID: ${app.appId}`"
                    color="secondary"
                  />
                  <VaBadge
                    v-if="app.status"
                    :text="app.status"
                    :color="getStatusColor(app.status)"
                  />
                </div>
              </div>
              <div class="flex gap-2 ml-auto">
                <VaButton
                  preset="plain"
                  icon="edit"
                  @click="openEditDialog(app)"
                />
                <VaButton
                  preset="plain"
                  icon="delete"
                  color="danger"
                  @click="removeApplication(app.appId)"
                />
              </div>
            </div>
          </VaCardTitle>
          <VaCardContent>
            <p class="text-sm text-gray-600 mb-2">
              Services ({{ app.services.length }})
            </p>
            <div class="space-y-2">
              <div
                v-for="service in app.services"
                :key="service.serviceId"
                class="p-3 bg-gray-50 rounded flex items-center justify-between hover:bg-gray-100 transition-colors cursor-pointer"
                @click="openServiceDetails(service, app)"
              >
                <div class="flex-1">
                  <p class="font-semibold">
                    {{ service.serviceName }}
                  </p>
                  <p class="text-sm text-gray-600">
                    {{ service.imageName }}
                  </p>
                  <div
                    v-if="service.config.ports && service.config.ports.length > 0"
                    class="mt-1"
                  >
                    <VaChip
                      v-for="port in service.config.ports"
                      :key="port"
                      size="small"
                      color="primary"
                      class="mr-1"
                    >
                      {{ port }}
                    </VaChip>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <VaBadge
                    :text="`Service ${service.serviceId}`"
                    color="info"
                  />
                  <VaIcon
                    name="arrow_forward"
                    size="small"
                    color="secondary"
                  />
                </div>
              </div>
            </div>
          </VaCardContent>
        </VaCard>
      </div>
    </VaCardContent>
  </VaCard>

  <!-- Deploy Application Modal -->
  <VaModal
    v-model="showDeployDialog"
    title="Deploy New Application"
    size="large"
    hide-default-actions
    :before-close="() => !applicationStore.isDeploying"
  >
    <div class="space-y-4">
      <!-- Application Details -->
      <div>
        <h3 class="text-lg font-semibold mb-2">
          Application Details
        </h3>
        <VaInput
          v-model="newApplication.appName"
          label="Application Name"
          placeholder="e.g., web-stack"
        />
      </div>

      <VaDivider />

      <!-- Added Services List -->
      <div v-if="services.length > 0">
        <h3 class="text-lg font-semibold mb-2">
          Services in Application ({{ services.length }})
        </h3>
        <div class="space-y-2 mb-4">
          <VaCard
            v-for="(service, index) in services"
            :key="index"
            outlined
            class="p-3"
          >
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <p class="font-semibold">
                  {{ service.serviceName }}
                </p>
                <p class="text-sm text-gray-600">
                  {{ service.imageName }}
                </p>
                <div
                  v-if="service.config.ports && service.config.ports.length > 0"
                  class="mt-1"
                >
                  <VaChip
                    v-for="port in service.config.ports"
                    :key="port"
                    size="small"
                    color="primary"
                    class="mr-1"
                  >
                    {{ port }}
                  </VaChip>
                </div>
              </div>
              <div class="flex gap-2">
                <VaButton
                  preset="plain"
                  icon="edit"
                  size="small"
                  @click="editService(index)"
                />
                <VaButton
                  preset="plain"
                  icon="delete"
                  color="danger"
                  size="small"
                  @click="removeService(index)"
                />
              </div>
            </div>
          </VaCard>
        </div>
      </div>

      <!-- Service Configuration -->
      <div>
        <h3 class="text-lg font-semibold mb-2">
          {{ isEditingService ? 'Edit Service' : 'Add New Service' }}
        </h3>
        <div class="grid grid-cols-1 gap-4">
          <VaInput
            v-model="newService.serviceName"
            label="Service Name"
            placeholder="e.g., nginx"
          />
          <VaSelect
            v-model="newService.imageName"
            label="Docker Image"
            placeholder="Select an image or type custom"
            :options="popularImages"
            searchable
            allow-create
          />
        </div>
      </div>

      <!-- Port Mappings -->
      <div>
        <h3 class="text-sm font-semibold mb-2">
          Port Mappings
        </h3>
        <div class="flex gap-2 mb-2">
          <VaInput
            v-model="portInput"
            placeholder="e.g., 8080:80"
            style="flex: 1"
            @keyup.enter="addPort"
          />
          <VaButton
            size="small"
            @click="addPort"
          >
            Add Port
          </VaButton>
        </div>
        <div
          v-if="newService.config.ports && newService.config.ports.length > 0"
          class="flex gap-2 flex-wrap"
        >
          <VaChip
            v-for="port in newService.config.ports"
            :key="port"
            closeable
            color="primary"
            @update:modelValue="removePort(port)"
          >
            {{ port }}
          </VaChip>
        </div>
      </div>

      <!-- Environment Variables -->
      <div>
        <h3 class="text-sm font-semibold mb-2">
          Environment Variables
        </h3>
        <div class="flex gap-2 mb-2">
          <VaInput
            v-model="envKeyInput"
            placeholder="Key"
            style="flex: 1"
          />
          <VaInput
            v-model="envValueInput"
            placeholder="Value"
            style="flex: 1"
            @keyup.enter="addEnvironmentVariable"
          />
          <VaButton
            size="small"
            @click="addEnvironmentVariable"
          >
            Add
          </VaButton>
        </div>
        <div
          v-if="environmentEntries.length > 0"
          class="space-y-1"
        >
          <div
            v-for="[key, value] in environmentEntries"
            :key="key"
            class="flex items-center justify-between p-2 bg-gray-50 rounded"
          >
            <span class="text-sm"><strong>{{ key }}</strong>: {{ value }}</span>
            <VaButton
              preset="plain"
              icon="close"
              size="small"
              @click="removeEnvironmentVariable(key)"
            />
          </div>
        </div>
      </div>

      <!-- Add/Update Service Button -->
      <div class="flex gap-2 mb-6">
        <VaButton
          v-if="isEditingService"
          color="success"
          @click="updateService"
        >
          <VaIcon
            name="check"
            class="mr-2"
          />
          Update Service
        </VaButton>
        <VaButton
          v-else
          :disabled="!newService.serviceName || !newService.imageName"
          @click="addService"
        >
          <VaIcon
            name="add"
            class="mr-2"
          />
          Add Service to Application
        </VaButton>
        <VaButton
          v-if="isEditingService"
          preset="secondary"
          @click="cancelCurrentServiceEdit"
        >
          Cancel Edit
        </VaButton>
      </div>
    </div>

    <template #footer>
      <div class="flex gap-3 justify-end">
        <VaButton
          preset="secondary"
          :disabled="applicationStore.isDeploying"
          @click="showDeployDialog = false"
        >
          Cancel
        </VaButton>
        <VaButton
          :loading="applicationStore.isDeploying"
          :disabled="services.length === 0"
          @click="deployApplication"
        >
          Deploy Application ({{ services.length }} service{{ services.length !== 1 ? 's' : '' }})
        </VaButton>
      </div>
    </template>
  </VaModal>

  <!-- Edit Application Modal -->
  <VaModal
    v-model="showEditDialog"
    title="Edit Application"
    size="large"
    hide-default-actions
    :before-close="() => !applicationStore.isDeploying"
  >
    <div class="space-y-4">
      <!-- Application Details -->
      <div>
        <h3 class="text-lg font-semibold mb-2">
          Application Details
        </h3>
        <VaInput
          v-model="newApplication.appName"
          label="Application Name"
          placeholder="e.g., web-stack"
        />
        <div class="mt-2 text-sm text-gray-600">
          Application ID: {{ newApplication.appId }}
        </div>
      </div>

      <VaDivider />

      <!-- Added Services List -->
      <div v-if="services.length > 0">
        <h3 class="text-lg font-semibold mb-2">
          Services in Application ({{ services.length }})
        </h3>
        <div class="space-y-2 mb-4">
          <VaCard
            v-for="(service, index) in services"
            :key="index"
            outlined
            class="p-3"
          >
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <p class="font-semibold">
                  {{ service.serviceName }}
                </p>
                <p class="text-sm text-gray-600">
                  {{ service.imageName }}
                </p>
                <div
                  v-if="service.config.ports && service.config.ports.length > 0"
                  class="mt-1"
                >
                  <VaChip
                    v-for="port in service.config.ports"
                    :key="port"
                    size="small"
                    color="primary"
                    class="mr-1"
                  >
                    {{ port }}
                  </VaChip>
                </div>
              </div>
              <div class="flex gap-2">
                <VaButton
                  preset="plain"
                  icon="edit"
                  size="small"
                  @click="editService(index)"
                />
                <VaButton
                  preset="plain"
                  icon="delete"
                  color="danger"
                  size="small"
                  @click="removeService(index)"
                />
              </div>
            </div>
          </VaCard>
        </div>
      </div>

      <!-- Service Configuration -->
      <div>
        <h3 class="text-lg font-semibold mb-2">
          {{ isEditingService ? 'Edit Service' : 'Add New Service' }}
        </h3>
        <div class="grid grid-cols-1 gap-4">
          <VaInput
            v-model="newService.serviceName"
            label="Service Name"
            placeholder="e.g., nginx"
          />
          <VaSelect
            v-model="newService.imageName"
            label="Docker Image"
            placeholder="Select an image or type custom"
            :options="popularImages"
            searchable
            allow-create
          />
        </div>
      </div>

      <!-- Port Mappings -->
      <div>
        <h3 class="text-sm font-semibold mb-2">
          Port Mappings
        </h3>
        <div class="flex gap-2 mb-2">
          <VaInput
            v-model="portInput"
            placeholder="e.g., 8080:80"
            style="flex: 1"
            @keyup.enter="addPort"
          />
          <VaButton
            size="small"
            @click="addPort"
          >
            Add Port
          </VaButton>
        </div>
        <div
          v-if="newService.config.ports && newService.config.ports.length > 0"
          class="flex gap-2 flex-wrap"
        >
          <VaChip
            v-for="port in newService.config.ports"
            :key="port"
            closeable
            color="primary"
            @update:modelValue="removePort(port)"
          >
            {{ port }}
          </VaChip>
        </div>
      </div>

      <!-- Environment Variables -->
      <div>
        <h3 class="text-sm font-semibold mb-2">
          Environment Variables
        </h3>
        <div class="flex gap-2 mb-2">
          <VaInput
            v-model="envKeyInput"
            placeholder="Key"
            style="flex: 1"
          />
          <VaInput
            v-model="envValueInput"
            placeholder="Value"
            style="flex: 1"
            @keyup.enter="addEnvironmentVariable"
          />
          <VaButton
            size="small"
            @click="addEnvironmentVariable"
          >
            Add
          </VaButton>
        </div>
        <div
          v-if="environmentEntries.length > 0"
          class="space-y-1"
        >
          <div
            v-for="[key, value] in environmentEntries"
            :key="key"
            class="flex items-center justify-between p-2 bg-gray-50 rounded"
          >
            <span class="text-sm"><strong>{{ key }}</strong>: {{ value }}</span>
            <VaButton
              preset="plain"
              icon="close"
              size="small"
              @click="removeEnvironmentVariable(key)"
            />
          </div>
        </div>
      </div>

      <!-- Add/Update Service Button -->
      <div class="flex gap-2 mb-6">
        <VaButton
          v-if="isEditingService"
          color="success"
          @click="updateService"
        >
          <VaIcon
            name="check"
            class="mr-2"
          />
          Update Service
        </VaButton>
        <VaButton
          v-else
          :disabled="!newService.serviceName || !newService.imageName"
          @click="addService"
        >
          <VaIcon
            name="add"
            class="mr-2"
          />
          Add Service to Application
        </VaButton>
        <VaButton
          v-if="isEditingService"
          preset="secondary"
          @click="cancelCurrentServiceEdit"
        >
          Cancel Edit
        </VaButton>
      </div>
    </div>

    <template #footer>
      <div class="flex gap-3 justify-end">
        <VaButton
          preset="secondary"
          :disabled="applicationStore.isDeploying"
          @click="cancelApplicationEdit"
        >
          Cancel
        </VaButton>
        <VaButton
          :loading="applicationStore.isDeploying"
          :disabled="services.length === 0"
          color="primary"
          @click="updateApplication"
        >
          <VaIcon
            name="save"
            class="mr-2"
          />
          Update Application ({{ services.length }} service{{ services.length !== 1 ? 's' : '' }})
        </VaButton>
      </div>
    </template>
  </VaModal>

  <!-- Service Details Dialog -->
  <VaModal
    v-model="showServiceDetailsDialog"
    :title="selectedService ? `${selectedService.serviceName} - Service Details` : 'Service Details'"
    size="large"
    hide-default-actions
  >
    <div v-if="selectedService && selectedServiceApp">
      <!-- Service Header Info -->
      <div class="mb-4 p-4 bg-gray-50 rounded-lg">
        <div class="flex items-center justify-between mb-2">
          <div>
            <h3 class="text-lg font-semibold">
              {{ selectedService.serviceName }}
            </h3>
            <p class="text-sm text-gray-600">
              {{ selectedService.imageName }}
            </p>
          </div>
          <div class="flex gap-2">
            <VaButton
              v-if="!isEditingServiceDetails"
              size="small"
              preset="secondary"
              color="primary"
              @click="enableServiceEdit"
            >
              <VaIcon
                name="edit"
                size="small"
                class="mr-1"
              />
              Edit
            </VaButton>
            <VaButton
              v-if="!isEditingServiceDetails"
              size="small"
              preset="secondary"
              @click="restartService"
            >
              <VaIcon
                name="restart_alt"
                size="small"
                class="mr-1"
              />
              Restart
            </VaButton>
            <VaButton
              v-if="!isEditingServiceDetails"
              size="small"
              preset="secondary"
              color="danger"
              @click="stopService"
            >
              <VaIcon
                name="stop"
                size="small"
                class="mr-1"
              />
              Stop
            </VaButton>
          </div>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <VaBadge
            text="Running"
            color="success"
          />
          <VaBadge
            :text="`App: ${selectedServiceApp.appName}`"
            color="primary"
          />
          <VaBadge
            :text="`Service ID: ${selectedService.serviceId}`"
            color="info"
          />
        </div>
      </div>

      <!-- Tabs -->
      <VaTabs
        v-model="serviceDetailsTab"
        class="mb-4"
      >
        <template #tabs>
          <VaTab name="details">
            <VaIcon
              name="info"
              size="small"
              class="mr-1"
            />
            Details
          </VaTab>
          <VaTab name="logs">
            <VaIcon
              name="description"
              size="small"
              class="mr-1"
            />
            Logs
          </VaTab>
          <VaTab name="console">
            <VaIcon
              name="terminal"
              size="small"
              class="mr-1"
            />
            Console
          </VaTab>
        </template>
      </VaTabs>

      <!-- Tab Content -->
      <div class="min-h-[400px]">
        <!-- Details Tab -->
        <div
          v-if="serviceDetailsTab === 'details'"
          class="space-y-4"
        >
          <!-- View Mode -->
          <template v-if="!isEditingServiceDetails">
            <div>
              <h4 class="font-semibold mb-2">
                Image Information
              </h4>
              <div class="p-3 bg-gray-50 rounded">
                <p class="text-sm">
                  <strong>Image:</strong> {{ selectedService.imageName }}
                </p>
                <p class="text-sm mt-1">
                  <strong>Service Name:</strong> {{ selectedService.serviceName }}
                </p>
                <p class="text-sm mt-1">
                  <strong>App ID:</strong> {{ selectedService.appId }}
                </p>
              </div>
            </div>

            <div v-if="selectedService.config.ports && selectedService.config.ports.length > 0">
              <h4 class="font-semibold mb-2">
                Port Mappings
              </h4>
              <div class="flex flex-wrap gap-2">
                <VaChip
                  v-for="port in selectedService.config.ports"
                  :key="port"
                  color="primary"
                >
                  {{ port }}
                </VaChip>
              </div>
            </div>

            <div
              v-if="selectedService.config.environment && Object.keys(selectedService.config.environment).length > 0"
            >
              <h4 class="font-semibold mb-2">
                Environment Variables
              </h4>
              <div class="space-y-2">
                <div
                  v-for="[key, value] in Object.entries(selectedService.config.environment)"
                  :key="key"
                  class="p-2 bg-gray-50 rounded flex justify-between items-center"
                >
                  <span class="font-mono text-sm font-semibold">{{ key }}</span>
                  <span class="font-mono text-sm text-gray-600">{{ value }}</span>
                </div>
              </div>
            </div>

            <div v-if="selectedService.config.volumes && selectedService.config.volumes.length > 0">
              <h4 class="font-semibold mb-2">
                Volumes
              </h4>
              <div class="space-y-2">
                <div
                  v-for="volume in selectedService.config.volumes"
                  :key="volume"
                  class="p-2 bg-gray-50 rounded font-mono text-sm"
                >
                  {{ volume }}
                </div>
              </div>
            </div>
          </template>

          <!-- Edit Mode -->
          <template v-else-if="editedService">
            <div>
              <h4 class="font-semibold mb-2">
                Service Information
              </h4>
              <div class="grid grid-cols-1 gap-4">
                <VaInput
                  v-model="editedService.serviceName"
                  label="Service Name"
                />
                <VaSelect
                  v-model="editedService.imageName"
                  label="Docker Image"
                  :options="popularImages"
                  searchable
                  placeholder="Select or type image name"
                />
              </div>
            </div>

            <VaDivider />

            <div>
              <h4 class="font-semibold mb-2">
                Port Mappings
              </h4>
              <div
                v-if="editedService.config.ports && editedService.config.ports.length > 0"
                class="mb-3"
              >
                <div class="flex flex-wrap gap-2">
                  <VaChip
                    v-for="port in editedService.config.ports"
                    :key="port"
                    color="primary"
                    closeable
                    @update:modelValue="removeEditPort(port)"
                  >
                    {{ port }}
                  </VaChip>
                </div>
              </div>
              <div class="flex gap-2">
                <VaInput
                  v-model="editPortInput"
                  placeholder="e.g., 8080:80"
                  class="flex-1"
                  @keyup.enter="addEditPort"
                />
                <VaButton
                  :disabled="!editPortInput"
                  @click="addEditPort"
                >
                  <VaIcon name="add" />
                </VaButton>
              </div>
            </div>

            <VaDivider />

            <div>
              <h4 class="font-semibold mb-2">
                Environment Variables
              </h4>
              <div
                v-if="editedService.config.environment && Object.keys(editedService.config.environment).length > 0"
                class="space-y-2 mb-3"
              >
                <div
                  v-for="[key, value] in Object.entries(editedService.config.environment)"
                  :key="key"
                  class="p-2 bg-gray-50 rounded flex justify-between items-center"
                >
                  <div class="flex-1">
                    <span class="font-mono text-sm font-semibold">{{ key }}</span>
                    <span class="mx-2">=</span>
                    <span class="font-mono text-sm text-gray-600">{{ value }}</span>
                  </div>
                  <VaButton
                    preset="plain"
                    icon="close"
                    size="small"
                    @click="removeEditEnvironmentVariable(key)"
                  />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <VaInput
                  v-model="editEnvKeyInput"
                  placeholder="Key"
                  @keyup.enter="addEditEnvironmentVariable"
                />
                <div class="flex gap-2">
                  <VaInput
                    v-model="editEnvValueInput"
                    placeholder="Value"
                    class="flex-1"
                    @keyup.enter="addEditEnvironmentVariable"
                  />
                  <VaButton
                    :disabled="!editEnvKeyInput || !editEnvValueInput"
                    @click="addEditEnvironmentVariable"
                  >
                    <VaIcon name="add" />
                  </VaButton>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Logs Tab -->
        <div v-if="serviceDetailsTab === 'logs'">
          <div class="flex justify-between items-center mb-3">
            <h4 class="font-semibold">
              Service Logs
            </h4>
            <VaButton
              size="small"
              :loading="isLoadingLogs"
              @click="fetchServiceLogs"
            >
              <VaIcon
                name="refresh"
                size="small"
                class="mr-1"
              />
              Refresh Logs
            </VaButton>
          </div>

          <div class="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm h-96 overflow-y-auto">
            <div
              v-if="serviceLogs.length === 0"
              class="text-gray-500"
            >
              Click "Refresh Logs" to load service logs...
            </div>
            <div v-else>
              <div
                v-for="(log, index) in serviceLogs"
                :key="index"
                class="mb-1"
              >
                {{ log }}
              </div>
            </div>
          </div>
        </div>

        <!-- Console Tab -->
        <div v-if="serviceDetailsTab === 'console'">
          <div class="flex justify-between items-center mb-3">
            <h4 class="font-semibold">
              Interactive Console (SSH)
            </h4>
            <VaButton
              size="small"
              preset="secondary"
              @click="clearConsole"
            >
              <VaIcon
                name="delete_sweep"
                size="small"
                class="mr-1"
              />
              Clear
            </VaButton>
          </div>

          <div class="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm h-80 overflow-y-auto mb-3">
            <div
              v-if="consoleOutput.length === 0"
              class="text-gray-500"
            >
              Enter a command below to execute in the container...
            </div>
            <div v-else>
              <div
                v-for="(line, index) in consoleOutput"
                :key="index"
                class="mb-1"
              >
                {{ line }}
              </div>
            </div>
          </div>

          <div class="flex gap-2">
            <VaInput
              v-model="consoleCommand"
              placeholder="Enter command (e.g., ls, ps, pwd)..."
              class="flex-1"
              :disabled="isExecutingCommand"
              @keyup.enter="executeConsoleCommand"
            >
              <template #prepend>
                <span class="text-green-400 font-mono">$</span>
              </template>
            </VaInput>
            <VaButton
              :loading="isExecutingCommand"
              :disabled="!consoleCommand.trim()"
              @click="executeConsoleCommand"
            >
              <VaIcon
                name="play_arrow"
                class="mr-1"
              />
              Execute
            </VaButton>
          </div>

          <div class="mt-3 p-3 bg-blue-50 rounded text-sm">
            <VaIcon
              name="info"
              size="small"
              color="info"
              class="mr-1"
            />
            <strong>Note:</strong> Commands are executed inside the container. Common commands: ls, ps, pwd, cat, grep,
            top
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-3">
        <VaButton
          v-if="isEditingServiceDetails"
          preset="secondary"
          @click="cancelServiceEdit"
        >
          Cancel
        </VaButton>
        <VaButton
          v-if="isEditingServiceDetails"
          color="primary"
          @click="saveServiceChanges"
        >
          <VaIcon
            name="save"
            class="mr-1"
          />
          Save Changes
        </VaButton>
        <VaButton
          v-if="!isEditingServiceDetails"
          preset="secondary"
          @click="showServiceDetailsDialog = false"
        >
          Close
        </VaButton>
      </div>
    </template>
  </VaModal>
</template>

<style scoped>
.page-title {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 1.5rem;
}

/* Custom scrollbar for console/logs */
.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: #1a1a1a;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #4a4a4a;
  border-radius: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #5a5a5a;
}
</style>
