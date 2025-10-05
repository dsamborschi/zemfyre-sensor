<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { useApplicationManagerStore } from '../../stores/application-manager'
import { useDevicesStore } from '../../stores/devices'
import { useModal, useToast } from 'vuestic-ui'
import type { Application, ServiceConfig, LogEntry } from '../../data/pages/applications'
import { applyState, getServiceLogs, executeContainerCommand } from '../../data/pages/applications'
import { applicationManagerApi } from '../../services/application-manager-api'

const applicationStore = useApplicationManagerStore()
const devicesStore = useDevicesStore()
const { confirm } = useModal()
const { init: notify } = useToast()

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
const serviceLogs = ref<LogEntry[]>([])
const consoleCommand = ref('')
const consoleOutput = ref<string[]>([])
const vulnerabilities = ref<any[]>([])
const loadingVulnerabilities = ref(false)
const vulnerabilityError = ref<string | null>(null)
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
  { text: 'BusyBox (Minimal)', value: 'busybox:latest' },
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
    // Normalize services - ensure imageName is a string
    const normalizedServices = services.value.map(service => ({
      ...service,
      imageName: typeof service.imageName === 'object' && service.imageName !== null 
        ? (service.imageName as any).value 
        : service.imageName,
      config: {
        ...service.config,
        image: typeof service.imageName === 'object' && service.imageName !== null 
          ? (service.imageName as any).value 
          : service.imageName,
      }
    }))

    // Add normalized services to application
    newApplication.value.services = normalizedServices

    await applicationStore.deployNewApplication(newApplication.value)
    showDeployDialog.value = false
  } catch (error) {
    console.error('Deployment failed:', error)
  }
}

const updateApplication = async () => {
  try {
    // Normalize services - ensure imageName is a string
    const normalizedServices = services.value.map(service => ({
      ...service,
      imageName: typeof service.imageName === 'object' && service.imageName !== null 
        ? (service.imageName as any).value 
        : service.imageName,
      config: {
        ...service.config,
        image: typeof service.imageName === 'object' && service.imageName !== null 
          ? (service.imageName as any).value 
          : service.imageName,
      }
    }))

    // Update services in application
    newApplication.value.services = normalizedServices

    await applicationStore.updateExistingApplication(newApplication.value)
    showEditDialog.value = false
    isEditMode.value = false
    editingAppId.value = null
  } catch (error) {
    console.error('Update failed:', error)
  }
}

const removeApplication = async (appId: number) => {
  const agreed = await confirm({
    maxWidth: '380px',
    message: 'Are you sure you want to remove this application and all its services?',
    title: 'Remove Application',
    size: 'small',
  })
  
  if (agreed) {
    try {
      await applicationStore.removeExistingApplication(appId)
      notify({
        message: 'Application removed successfully',
        color: 'success',
      })
    } catch (error) {
      console.error('Failed to remove application:', error)
      notify({
        message: 'Failed to remove application',
        color: 'danger',
      })
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
    // Fetch logs from API using containerId if available, otherwise use serviceId
    const filter: any = {
      limit: 100,
      sourceType: 'container'
    }
    
    if ((selectedService.value as any).containerId) {
      filter.containerId = (selectedService.value as any).containerId
    } else if (selectedService.value.serviceId) {
      filter.serviceId = selectedService.value.serviceId
    } else if (selectedService.value.serviceName) {
      filter.serviceName = selectedService.value.serviceName
    }
    
    const logs = await getServiceLogs(filter)
    serviceLogs.value = logs
  } catch (error) {
    console.error('Error fetching logs:', error)
    serviceLogs.value = []
  } finally {
    isLoadingLogs.value = false
  }
}

// Auto-fetch logs when logs tab is selected
watch(serviceDetailsTab, (newTab) => {
  if (newTab === 'logs' && selectedService.value && serviceLogs.value.length === 0) {
    fetchServiceLogs()
  }
  
  // Auto-scan vulnerabilities when vulnerabilities tab is selected
  if (newTab === 'vulnerabilities' && selectedService.value && vulnerabilities.value.length === 0) {
    scanImageVulnerabilities(selectedService.value.imageName)
  }
})

const executeConsoleCommand = async () => {
  if (!consoleCommand.value.trim() || !selectedService.value) return

  // Check if container is running
  if (!selectedService.value.containerId) {
    consoleOutput.value.push(`Error: No container ID available for ${selectedService.value.serviceName}`)
    return
  }

  if (selectedService.value.status?.toLowerCase() !== 'running') {
    consoleOutput.value.push(`Error: Container is not running (status: ${selectedService.value.status})`)
    return
  }

  isExecutingCommand.value = true
  const cmd = consoleCommand.value
  consoleOutput.value.push(`$ ${cmd}`)

  try {
    // Execute command via API
    const result = await executeContainerCommand(selectedService.value.containerId, cmd)
    
    if (result.output) {
      // Split output by lines and add each line
      const lines = result.output.trim().split('\n')
      lines.forEach(line => {
        consoleOutput.value.push(line)
      })
    }
    
    if (!result.success) {
      consoleOutput.value.push(`[Exit code: ${result.exitCode}]`)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    consoleOutput.value.push(`Error: ${errorMessage}`)
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

  const agreed = await confirm({
    maxWidth: '380px',
    message: `Are you sure you want to restart ${selectedService.value.serviceName}?`,
    title: 'Restart Service',
    size: 'small',
  })
  
  if (agreed) {
    try {
      // Simulate restart - replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1000))
      notify({
        message: `Service ${selectedService.value.serviceName} restarted successfully`,
        color: 'success',
      })
    } catch (error) {
      notify({
        message: `Failed to restart service: ${error}`,
        color: 'danger',
      })
    }
  }
}

const stopService = async () => {
  if (!selectedService.value) return

  const agreed = await confirm({
    maxWidth: '380px',
    message: `Are you sure you want to stop ${selectedService.value.serviceName}?`,
    title: 'Stop Service',
    size: 'small',
  })
  
  if (agreed) {
    try {
      // Simulate stop - replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1000))
      notify({
        message: `Service ${selectedService.value.serviceName} stopped successfully`,
        color: 'success',
      })
    } catch (error) {
      notify({
        message: `Failed to stop service: ${error}`,
        color: 'danger',
      })
    }
  }
}

const enableServiceEdit = () => {
  if (!selectedService.value) return

  // Create a deep copy of the service for editing with enhanced config
  const serviceToEdit = JSON.parse(JSON.stringify(selectedService.value))
  
  // Merge with enhanced config to get full configuration including ports
  if (enhancedServiceConfig.value) {
    serviceToEdit.config = JSON.parse(JSON.stringify(enhancedServiceConfig.value))
  }
  
  editedService.value = serviceToEdit
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
    // Get the app from TARGET state (not current state) to update configuration
    const targetApps = applicationStore.currentState?.target?.apps || {}
    const targetApp = targetApps[selectedServiceApp.value.appId]
    
    if (!targetApp) {
      notify({
        message: 'Application not found in target state. Cannot update.',
        color: 'warning',
      })
      return
    }
    
    // Create a copy of the target app to modify
    const appToUpdate = JSON.parse(JSON.stringify(targetApp))
    
    // Find and update the service
    const serviceIndex = appToUpdate.services.findIndex(
      (s: ServiceConfig) => s.serviceId === editedService.value!.serviceId
    )

    if (serviceIndex !== -1) {
      // Update the service in the application with edited values
      appToUpdate.services[serviceIndex] = { ...editedService.value }

      // Update the application in target state
      await applicationStore.updateExistingApplication(appToUpdate)
      
      // Refresh state to get updated data
      await applicationStore.fetchState()

      // Update local references
      selectedService.value = { ...editedService.value }
      isEditingServiceDetails.value = false
      editedService.value = null

      notify({
        message: 'Service updated successfully in target state. Click "Apply Changes" to deploy.',
        color: 'success',
      })
    }
  } catch (error) {
    console.error('Failed to update service:', error)
    notify({
      message: 'Failed to update service. Please try again.',
      color: 'danger',
    })
  }
}

// Computed property to get deployed applications from current state
const deployedApplications = computed(() => {
  if (!applicationStore.currentState) return []
  
  const currentApps = applicationStore.currentState.current?.apps || {}
  
  // Convert the apps object to an array
  return Object.values(currentApps)
})

// Computed property to count running applications
// An application is considered "running" if at least one of its services is running
const runningApplicationsCount = computed(() => {
  return deployedApplications.value.filter(app => {
    // Check if the app has at least one running service
    return app.services?.some((service: any) => 
      service.status?.toLowerCase() === 'running'
    )
  }).length
})

// Computed property to get pending applications (in target but not in current)
const pendingApplications = computed(() => {
  if (!applicationStore.currentState) return []
  
  const currentApps = applicationStore.currentState.current?.apps || {}
  const targetApps = applicationStore.currentState.target?.apps || {}
  
  // Find apps that are in target but not in current (or differ from current)
  const pending: Application[] = []
  
  for (const [appIdStr, targetApp] of Object.entries(targetApps)) {
    const appId = Number(appIdStr)
    const currentApp = currentApps[appId]
    
    // If app doesn't exist in current state, it's pending
    if (!currentApp) {
      pending.push(targetApp)
    }
  }
  
  return pending
})

// Reconciliation status tracking
const reconciliationStatus = ref<{ status: string; message: string; timestamp: number } | null>(null)
const isReconciling = ref(false)
const reconciliationDetails = ref<{
  isReconciling: boolean
  lastError: string | null
  currentApps: number
  targetApps: number
  currentServices: number
  targetServices: number
} | null>(null)

// Per-service reconciliation status
const serviceReconciliationStatus = ref<{
  [appId: number]: {
    appName: string
    services: {
      [serviceId: number]: {
        serviceName: string
        status: 'in-sync' | 'needs-update' | 'missing' | 'extra'
        reason?: string
      }
    }
  }
} | null>(null)

let statusPollTimer: NodeJS.Timeout | null = null

// Fetch reconciliation status from API
const fetchReconciliationStatus = async () => {
  try {
    // Fetch global status
    const statusResponse = await fetch(applicationManagerApi.getStatus())
    if (statusResponse.ok) {
      const statusData = await statusResponse.json()
      reconciliationDetails.value = {
        isReconciling: statusData.isReconciling || statusData.isApplying,
        lastError: statusData.lastError,
        currentApps: statusData.currentApps || 0,
        targetApps: statusData.targetApps || 0,
        currentServices: statusData.currentServices || 0,
        targetServices: statusData.targetServices || 0,
      }
      
      // If reconciling, refresh state to show progress
      if (reconciliationDetails.value.isReconciling) {
        await applicationStore.fetchState()
      }
    }

    // Fetch per-service reconciliation status
    const reconciliationResponse = await fetch(applicationManagerApi.getReconciliation())
    if (reconciliationResponse.ok) {
      const reconciliationData = await reconciliationResponse.json()
      serviceReconciliationStatus.value = reconciliationData.status
    }
  } catch (error) {
    console.error('Failed to fetch reconciliation status:', error)
  }
}

// Helper to get service reconciliation status
const getServiceStatus = (appId: number, serviceId: number) => {
  return serviceReconciliationStatus.value?.[appId]?.services?.[serviceId] || null
}

// Helper to check if an app has any services that need updates
const appNeedsUpdate = (appId: number) => {
  const appStatus = serviceReconciliationStatus.value?.[appId]
  if (!appStatus) return false
  
  return Object.values(appStatus.services).some(
    (service) => service.status === 'needs-update' || service.status === 'missing' || service.status === 'extra'
  )
}

// Helper to get app-level reconciliation summary
const getAppReconciliationSummary = (appId: number) => {
  const appStatus = serviceReconciliationStatus.value?.[appId]
  if (!appStatus) return null
  
  const services = Object.values(appStatus.services)
  const needsUpdate = services.filter(s => s.status === 'needs-update').length
  const missing = services.filter(s => s.status === 'missing').length
  const extra = services.filter(s => s.status === 'extra').length
  const inSync = services.filter(s => s.status === 'in-sync').length
  
  if (inSync === services.length) return { status: 'in-sync', text: 'All In Sync', color: 'success' }
  if (needsUpdate > 0) return { status: 'needs-update', text: `${needsUpdate} Need${needsUpdate > 1 ? '' : 's'} Update`, color: 'warning' }
  if (missing > 0) return { status: 'missing', text: `${missing} Missing`, color: 'info' }
  if (extra > 0) return { status: 'extra', text: `${extra} Extra`, color: 'danger' }
  
  return null
}

// Start polling for reconciliation status
const startStatusPolling = () => {
  if (statusPollTimer) return
  
  fetchReconciliationStatus()
  statusPollTimer = setInterval(() => {
    fetchReconciliationStatus()
  }, 2000) // Poll every 2 seconds
}

// Stop polling
const stopStatusPolling = () => {
  if (statusPollTimer) {
    clearInterval(statusPollTimer)
    statusPollTimer = null
  }
}

// Start polling when component mounts
onMounted(() => {
  startStatusPolling()
})

// Cleanup on unmount
onUnmounted(() => {
  stopStatusPolling()
})

// Apply pending application
const applyPendingApp = async (appId: number) => {
  try {
    isReconciling.value = true
    reconciliationStatus.value = null
    
    const result = await applyState()
    reconciliationStatus.value = {
      status: result.status,
      message: result.message,
      timestamp: Date.now()
    }
    
    // Auto-hide status after 10 seconds
    setTimeout(() => {
      if (reconciliationStatus.value && reconciliationStatus.value.timestamp === reconciliationStatus.value.timestamp) {
        reconciliationStatus.value = null
      }
    }, 10000)
    
    // Refresh data after a short delay to allow reconciliation to start
    setTimeout(async () => {
      await refreshData()
      isReconciling.value = false
    }, 2000)
  } catch (error) {
    console.error('Failed to apply pending application:', error)
    reconciliationStatus.value = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to apply pending application',
      timestamp: Date.now()
    }
    isReconciling.value = false
  }
}

// Clear target state (emergency reset)
const clearTargetState = async () => {
  const agreed = await confirm({
    maxWidth: '480px',
    message: 'Are you sure you want to CLEAR the entire target state?\n\nThis will:\n• Remove all pending applications from target state\n• Allow you to start fresh if something went wrong\n• NOT affect currently running containers (current state)\n\nYou will need to apply state after clearing to stop containers.',
    title: 'Clear Target State',
    size: 'small',
  })
  
  if (!agreed) return
  
  try {
    isReconciling.value = true
    reconciliationStatus.value = null
    
    // Set target state to empty
    const response = await fetch(devicesStore.activeDeviceApiUrl + '/state/target', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apps: {} })
    })
    
    if (!response.ok) {
      throw new Error(`Failed to clear target state: ${response.statusText}`)
    }
    
    reconciliationStatus.value = {
      status: 'success',
      message: 'Target state cleared successfully',
      timestamp: Date.now()
    }
    
    // Refresh data
    await refreshData()
    isReconciling.value = false
  } catch (error) {
    console.error('Failed to clear target state:', error)
    reconciliationStatus.value = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to clear target state',
      timestamp: Date.now()
    }
    isReconciling.value = false
    notify({
      message: 'Failed to clear target state. Check console for details.',
      color: 'danger',
    })
  }
}

// Check if active device is offline
const isActiveDeviceOffline = computed(() => {
  return devicesStore.activeDevice?.status === 'offline'
})

// Check if reconciliation is in progress (flexible for multiple states)
const isReconciliationInProgress = computed(() => {
  if (!reconciliationStatus.value) return false
  
  const inProgressStates = ['started', 'starting', 'in-progress', 'in_progress', 'pending', 'reconciling', 'deploying']
  return inProgressStates.includes(reconciliationStatus.value.status.toLowerCase())
})

// Check if application actions should be disabled
const isApplicationActionsDisabled = computed(() => {
  return isActiveDeviceOffline.value || isReconciling.value || isReconciliationInProgress.value
})

// Computed property to get enhanced service config by merging target state
const enhancedServiceConfig = computed(() => {
  if (!selectedService.value || !selectedServiceApp.value) return null
  
  // Show the actual current state configuration (what's running now)
  // This matches what's displayed on the service card
  return selectedService.value.config
})

// Helper function to get status color
const getServiceStatusColor = (status?: string) => {
  if (!status) return 'secondary'
  const statusLower = status.toLowerCase()
  
  if (statusLower === 'running') return 'success'
  if (statusLower === 'stopped' || statusLower === 'exited') return 'danger'
  if (statusLower === 'restarting' || statusLower === 'starting') return 'warning'
  if (statusLower === 'paused') return 'info'
  
  return 'secondary'
}

// Helper function to format status text
const getServiceStatusText = (status?: string) => {
  if (!status) return 'Unknown'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

// Helper function to get severity color
const getSeverityColor = (severity: string) => {
  const severityLower = severity.toLowerCase()
  if (severityLower === 'critical') return 'danger'
  if (severityLower === 'high') return 'warning'
  if (severityLower === 'medium') return 'info'
  if (severityLower === 'low') return 'secondary'
  return 'secondary'
}

// Scan image for vulnerabilities using mock data (replace with real API)
const scanImageVulnerabilities = async (imageName: string) => {
  loadingVulnerabilities.value = true
  vulnerabilityError.value = null
  vulnerabilities.value = []

  try {
    // For demo purposes, generate mock vulnerability data
    // In production, integrate with Trivy, Grype, or Docker Scout API
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500))

    // Mock data based on image name
    const mockVulnerabilities = [
      {
        id: 'CVE-2025-7783',
        severity: 'CRITICAL',
        package: 'npm / form-data / 2.3.3',
        fixable: true,
      },
      {
        id: 'CVE-2024-21538',
        severity: 'HIGH',
        package: 'npm / cross-spawn / 7.0.3',
        fixable: true,
      },
      {
        id: 'CVE-2025-9086',
        severity: 'HIGH',
        package: 'apk / alpine/curl / 8.12.1-r1',
        fixable: false,
      },
      {
        id: 'CVE-2025-5399',
        severity: 'HIGH',
        package: 'apk / alpine/curl / 8.12.1-r1',
        fixable: false,
      },
      {
        id: 'CVE-2025-9230',
        severity: 'HIGH',
        package: 'apk / alpine/openssl / 3.3.3-r0',
        fixable: true,
      },
      {
        id: 'CVE-2025-59375',
        severity: 'HIGH',
        package: 'apk / alpine/expat / 2.7.0-r0',
        fixable: false,
      },
      {
        id: 'CVE-2025-4947',
        severity: 'MEDIUM',
        package: 'apk / alpine/curl / 8.12.1-r1',
        fixable: false,
      },
      {
        id: 'CVE-2025-9231',
        severity: 'MEDIUM',
        package: 'apk / alpine/openssl / 3.3.3-r0',
        fixable: true,
      },
      {
        id: 'CVE-2023-26136',
        severity: 'MEDIUM',
        package: 'npm / tough-cookie / 2.5.0',
        fixable: true,
      },
      {
        id: 'CVE-2023-28155',
        severity: 'LOW',
        package: 'npm / request / 2.88.2',
        fixable: false,
      },
    ]

    // Filter vulnerabilities based on image name for variation
    if (imageName.includes('nginx') || imageName.includes('alpine')) {
      vulnerabilities.value = mockVulnerabilities.filter(v => v.package.includes('apk'))
    } else if (imageName.includes('node')) {
      vulnerabilities.value = mockVulnerabilities.filter(v => v.package.includes('npm'))
    } else {
      vulnerabilities.value = mockVulnerabilities
    }

  } catch (error) {
    console.error('Error scanning vulnerabilities:', error)
    vulnerabilityError.value = 'Failed to scan for vulnerabilities. Please try again.'
  } finally {
    loadingVulnerabilities.value = false
  }
}

// ==================== Auto-Refresh Functionality ====================

const autoRefreshEnabled = ref(true)
const autoRefreshInterval = ref(5000) // 5 seconds
let refreshTimer: NodeJS.Timeout | null = null

const performAutoRefresh = async () => {
  // Don't refresh if disabled, offline, or during active editing
  if (!autoRefreshEnabled.value || isActiveDeviceOffline.value) return
  if (showDeployDialog.value || showEditDialog.value || isEditingServiceDetails.value) return
  if (applicationStore.isDeploying || isReconciling.value) return
  
  try {
    // Refresh state and applications
    await applicationStore.fetchState()
    // Optionally refresh metrics less frequently
    if (Math.random() > 0.7) { // 30% of the time
      await applicationStore.fetchSystemMetrics()
    }
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

// Pause auto-refresh when page is hidden (tab switching, minimize)
const handleVisibilityChange = () => {
  if (document.hidden) {
    stopAutoRefresh()
  } else {
    startAutoRefresh()
    performAutoRefresh() // Immediate refresh when coming back
  }
}

// Initialize auto-refresh on mount
onMounted(() => {
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
  <!-- Page Header with Title and Actions -->
  <div class="flex items-center justify-between mb-6">
    <h1 class="page-title mb-0">
      Application Manager
    </h1>
    <VaButton
      :disabled="applicationStore.isDeploying || isActiveDeviceOffline"
      @click="openDeployDialog"
    >
      <VaIcon
        name="add"
        class="mr-2"
      />
      Add Application
    </VaButton>
  </div>

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

  <!-- Reconciliation Status Banner -->
  <VaAlert
    v-if="reconciliationDetails && reconciliationDetails.isReconciling"
    color="info"
    class="mb-4"
  >
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <VaProgressCircle
          indeterminate
          size="small"
        />
        <div>
          <div class="font-semibold">
            Reconciliation in Progress
          </div>
          <div class="text-sm">
            Updating containers: {{ reconciliationDetails.currentServices }} current → {{ reconciliationDetails.targetServices }} target
          </div>
        </div>
      </div>
      <VaBadge
        text="Syncing..."
        color="info"
      />
    </div>
  </VaAlert>

  <!-- Reconciliation Error -->
  <VaAlert
    v-if="reconciliationDetails && reconciliationDetails.lastError && !reconciliationDetails.isReconciling"
    color="warning"
    class="mb-4"
    closeable
    @close="reconciliationDetails.lastError = null"
  >
    <div class="flex items-center gap-2">
      <VaIcon name="error" />
      <div>
        <div class="font-semibold">
          Last Reconciliation Error
        </div>
        <div class="text-sm">
          {{ reconciliationDetails.lastError }}
        </div>
      </div>
    </div>
  </VaAlert>

  <!-- Summary Cards -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    <VaCard>
      <VaCardContent>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">
              Total Applications
            </p>
            <p class="text-3xl font-bold">
              {{ deployedApplications.length }}
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
              {{ deployedApplications.reduce((sum, app) => sum + app.services.length, 0) }}
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
              {{ runningApplicationsCount }}
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
              Pending Applications
            </p>
            <p class="text-3xl font-bold">
              {{ pendingApplications.length }}
            </p>
          </div>
          <VaIcon
            name="schedule"
            size="large"
            color="secondary"
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
  <div class="flex gap-2 mb-4 items-center">
    <VaButton
      v-if="pendingApplications.length > 0"
      color="danger"
      preset="plain"
      :disabled="isActiveDeviceOffline || isReconciling"
      @click="clearTargetState"
    >
      <VaIcon
        name="clear_all"
        class="mr-2"
      />
      Clear Target State
    </VaButton>
    
    <!-- Refresh and Auto-Refresh Toggle -->
    <div class="ml-auto flex gap-2 items-center">
      <VaButton
        preset="secondary"
        icon="refresh"
        :loading="applicationStore.isLoading"
        @click="refreshData"
      >
        Refresh
      </VaButton>
      
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

  <!-- Applications List -->
  <VaCard>
    <VaCardTitle>Deployed Applications</VaCardTitle>
    <VaCardContent>
      <!-- Offline Device Message -->
      <div
        v-if="isActiveDeviceOffline"
        class="text-center py-8"
      >
        <VaIcon
          name="cloud_off"
          size="large"
          color="danger"
          class="mb-4"
        />
        <p class="text-xl font-semibold mb-2">
          Device is Offline
        </p>
        <p class="text-gray-600 mb-4">
          The selected device is currently offline. Application management features will become available once the device comes online.
        </p>
        <VaButton
          color="secondary"
          @click="refreshData"
        >
          <VaIcon name="refresh" class="mr-2" />
          Check Connection
        </VaButton>
      </div>

      <div
        v-else-if="applicationStore.isLoadingApplications"
        class="text-center py-8"
      >
        <VaProgressCircle indeterminate />
        <p class="mt-4">
          Loading applications...
        </p>
      </div>

      <div
        v-else-if="deployedApplications.length === 0"
        class="text-center py-8 flex flex-col items-center"
      >
        <div class="flex justify-center items-center mb-4" style="width: 48px; height: 48px;">
          <VaIcon
            name="inbox"
            color="secondary"
            size="48px"
          />
        </div>
        <p class="text-gray-600">
          No active applications yet
        </p>
        <VaButton
          v-if="pendingApplications.length === 0"
          class="mt-4"
          @click="openDeployDialog"
        >
          Deploy Your First Application
        </VaButton>
        <p v-else class="text-sm text-gray-500 mt-4">
          You have {{ pendingApplications.length }} pending application{{ pendingApplications.length > 1 ? 's' : '' }} waiting to be deployed below
        </p>
      </div>

      <div
        v-else
        class="space-y-4"
      >
        <VaCard
          v-for="app in deployedApplications"
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
                  <!-- App-level reconciliation status -->
                  <VaBadge
                    v-if="getAppReconciliationSummary(app.appId)"
                    :text="getAppReconciliationSummary(app.appId).text"
                    :color="getAppReconciliationSummary(app.appId).color"
                  />
                </div>
              </div>
              <div v-if="!isActiveDeviceOffline" class="flex gap-2 ml-auto">
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
                    v-if="service.config && service.config.ports && service.config.ports.length > 0"
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
                    v-if="service.status"
                    :text="getServiceStatusText(service.status)"
                    :color="getServiceStatusColor(service.status)"
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

  <!-- Pending Applications (Target State Not Applied) -->
  <VaCard v-if="pendingApplications.length > 0" class="mt-6" style="background-color: #f8f9fa; border: 1px solid #dee2e6;">
    <VaCardTitle>
      <div class="flex items-center justify-between">
        <span>Pending Applications</span>
        <VaBadge :text="`${pendingApplications.length} awaiting deployment`" color="info" />
      </div>
    </VaCardTitle>
    <VaCardContent>
      <VaAlert v-if="isActiveDeviceOffline" color="danger" class="mb-4" border="left">
        <p>These applications are configured but cannot be deployed while the device is offline. Please wait for the device to come online.</p>
      </VaAlert>
      <VaAlert v-else color="info" class="mb-4" border="left">
        <p>These applications are configured but not yet deployed. Click "Apply Now" to deploy them.</p>
      </VaAlert>

      <div class="space-y-4">
        <VaCard
          v-for="app in pendingApplications"
          :key="app.appId"
          outlined
          style="border-color: #ced4da; background-color: #ffffff;"
        >
          <VaCardTitle>
            <div class="flex items-start justify-between w-full">
              <div class="flex flex-col gap-2">
                <div class="flex items-center gap-2">
                  <VaIcon
                    name="schedule"
                    size="small"
                    color="secondary"
                  />
                  <span class="font-semibold text-lg">{{ app.appName }}</span>
                  <VaBadge text="Not Deployed" color="info" outline />
                </div>
                <div class="flex items-center gap-2">
                  <VaBadge
                    :text="`ID: ${app.appId}`"
                    color="secondary"
                  />
                </div>
              </div>
              <div class="flex gap-3 ml-auto items-center">
                <div v-if="reconciliationStatus" class="flex items-center gap-2">
                  <VaIcon
                    v-if="isReconciliationInProgress"
                    name="autorenew"
                    class="va-icon-spin"
                    color="info"
                    size="small"
                  />
                  <VaIcon
                    v-else-if="reconciliationStatus.status === 'error' || reconciliationStatus.status === 'failed'"
                    name="error"
                    color="danger"
                    size="small"
                  />
                  <VaIcon
                    v-else
                    name="check_circle"
                    color="success"
                    size="small"
                  />
                  <span
                    class="text-sm"
                    :class="{
                      'text-blue-600': isReconciliationInProgress,
                      'text-red-600': reconciliationStatus.status === 'error' || reconciliationStatus.status === 'failed',
                      'text-green-600': !isReconciliationInProgress && reconciliationStatus.status !== 'error' && reconciliationStatus.status !== 'failed'
                    }"
                  >
                    {{ reconciliationStatus.message }}
                  </span>
                </div>
                <VaButton
                  color="primary"
                  :disabled="isApplicationActionsDisabled"
                  :loading="isReconciling || isReconciliationInProgress"
                  @click="applyPendingApp(app.appId)"
                >
                  <VaIcon v-if="!isReconciling && !isReconciliationInProgress" name="play_arrow" class="mr-1" />
                  {{ isReconciliationInProgress ? 'Deploying...' : isReconciling ? 'Applying...' : 'Apply Now' }}
                </VaButton>
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
                class="p-3 rounded flex items-center justify-between"
                style="background-color: #f1f3f5;"
              >
                <div class="flex-1">
                  <p class="font-semibold">
                    {{ service.serviceName }}
                  </p>
                  <p class="text-sm text-gray-600">
                    {{ typeof service.imageName === 'object' && service.imageName !== null ? (service.imageName as any).value : service.imageName }}
                  </p>
                  <div
                    v-if="service.config && service.config.ports && service.config.ports.length > 0"
                    class="mt-1"
                  >
                    <VaChip
                      v-for="port in service.config.ports"
                      :key="port"
                      size="small"
                      color="secondary"
                      outline
                      class="mr-1"
                    >
                      {{ port }}
                    </VaChip>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <VaBadge
                    :text="`Service ${service.serviceId}`"
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

  <!-- Add Application Modal -->
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
                  v-if="service.config && service.config.ports && service.config.ports.length > 0"
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
            text-by="text"
            value-by="value"
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
          @click="deployApplication"
        >
          Add Application ({{ services.length }} service{{ services.length !== 1 ? 's' : '' }})
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
                  v-if="service.config && service.config.ports && service.config.ports.length > 0"
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
            text-by="text"
            value-by="value"
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
            :text="getServiceStatusText(selectedService.status)"
            :color="getServiceStatusColor(selectedService.status)"
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
          <VaTab name="vulnerabilities">
            <VaIcon
              name="security"
              size="small"
              class="mr-1"
            />
            Vulnerabilities
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
                  <strong>Image:</strong> {{ selectedService?.imageName || 'N/A' }}
                </p>
                <p class="text-sm mt-1">
                  <strong>Service Name:</strong> {{ selectedService?.serviceName || 'N/A' }}
                </p>
                <p class="text-sm mt-1">
                  <strong>App ID:</strong> {{ selectedService?.appId || 'N/A' }}
                </p>
              </div>
            </div>

            <div v-if="enhancedServiceConfig && enhancedServiceConfig.ports && enhancedServiceConfig.ports.length > 0">
              <h4 class="font-semibold mb-2">
                Port Mappings
              </h4>
              <div class="flex flex-wrap gap-2">
                <VaChip
                  v-for="port in enhancedServiceConfig.ports"
                  :key="port"
                  color="primary"
                >
                  {{ port }}
                </VaChip>
              </div>
            </div>

            <div
              v-if="enhancedServiceConfig && enhancedServiceConfig.environment && Object.keys(enhancedServiceConfig.environment).length > 0"
            >
              <h4 class="font-semibold mb-2">
                Environment Variables
              </h4>
              <div class="space-y-2">
                <div
                  v-for="[key, value] in Object.entries(enhancedServiceConfig.environment)"
                  :key="key"
                  class="p-2 bg-gray-50 rounded flex justify-between items-center"
                >
                  <span class="font-mono text-sm font-semibold">{{ key }}</span>
                  <span class="font-mono text-sm text-gray-600">{{ value }}</span>
                </div>
              </div>
            </div>

            <div v-if="enhancedServiceConfig && enhancedServiceConfig.volumes && enhancedServiceConfig.volumes.length > 0">
              <h4 class="font-semibold mb-2">
                Volumes
              </h4>
              <div class="space-y-2">
                <div
                  v-for="volume in enhancedServiceConfig.volumes"
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
            text-by="text"
            value-by="value"
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

          <div class="bg-gray-900 text-gray-300 p-4 rounded font-mono text-sm h-96 overflow-y-auto">
            <div
              v-if="serviceLogs.length === 0 && !isLoadingLogs"
              class="text-gray-500"
            >
              Click "Refresh Logs" to load service logs...
            </div>
            <div
              v-else-if="isLoadingLogs"
              class="text-gray-500"
            >
              Loading logs...
            </div>
            <div v-else>
              <div
                v-for="(log, index) in serviceLogs"
                :key="index"
                class="mb-1"
              >
                <span
                  :class="{
                    'text-red-400': log.level === 'error',
                    'text-yellow-400': log.level === 'warn',
                    'text-blue-400': log.level === 'debug',
                    'text-green-400': log.level === 'info'
                  }"
                >
                  [{{ new Date(log.timestamp).toISOString() }}]
                </span>
                <span class="text-gray-400 ml-2">[{{ log.level.toUpperCase() }}]</span>
                <span class="ml-2">{{ log.message }}</span>
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

        <!-- Vulnerabilities Tab -->
        <div v-if="serviceDetailsTab === 'vulnerabilities'">
          <div
            v-if="loadingVulnerabilities"
            class="flex justify-center items-center py-8"
          >
            <VaProgressCircle indeterminate />
            <span class="ml-3">Scanning for vulnerabilities...</span>
          </div>

          <div
            v-else-if="vulnerabilityError"
            class="p-4 bg-red-50 text-red-700 rounded"
          >
            <VaIcon
              name="error"
              class="mr-2"
            />
            {{ vulnerabilityError }}
          </div>

          <div
            v-else-if="vulnerabilities.length === 0"
            class="text-center py-8"
          >
            <VaIcon
              name="verified_user"
              size="large"
              color="success"
              class="mb-2"
            />
            <p class="text-lg font-semibold text-gray-700">
              No vulnerabilities found
            </p>
            <p class="text-sm text-gray-500 mt-1">
              This image appears to be secure
            </p>
          </div>

          <div
            v-else
            class="space-y-4"
          >
            <!-- Vulnerability Summary -->
            <div class="grid grid-cols-4 gap-4">
              <div class="p-4 bg-red-50 rounded text-center">
                <div class="text-2xl font-bold text-red-700">
                  {{ vulnerabilities.filter(v => v.severity === 'CRITICAL').length }}
                </div>
                <div class="text-sm text-red-600">
                  Critical
                </div>
              </div>
              <div class="p-4 bg-orange-50 rounded text-center">
                <div class="text-2xl font-bold text-orange-700">
                  {{ vulnerabilities.filter(v => v.severity === 'HIGH').length }}
                </div>
                <div class="text-sm text-orange-600">
                  High
                </div>
              </div>
              <div class="p-4 bg-yellow-50 rounded text-center">
                <div class="text-2xl font-bold text-yellow-700">
                  {{ vulnerabilities.filter(v => v.severity === 'MEDIUM').length }}
                </div>
                <div class="text-sm text-yellow-600">
                  Medium
                </div>
              </div>
              <div class="p-4 bg-blue-50 rounded text-center">
                <div class="text-2xl font-bold text-blue-700">
                  {{ vulnerabilities.filter(v => v.severity === 'LOW').length }}
                </div>
                <div class="text-sm text-blue-600">
                  Low
                </div>
              </div>
            </div>

            <!-- Vulnerability List -->
            <div
              class="overflow-y-auto"
              style="max-height: 400px;"
            >
              <table class="w-full text-sm">
                <thead class="bg-gray-100 sticky top-0">
                  <tr>
                    <th class="p-2 text-left">
                      CVE ID
                    </th>
                    <th class="p-2 text-left">
                      Severity
                    </th>
                    <th class="p-2 text-left">
                      Package
                    </th>
                    <th class="p-2 text-left">
                      Fixable
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="vuln in vulnerabilities"
                    :key="vuln.id"
                    class="border-b hover:bg-gray-50"
                  >
                    <td class="p-2">
                      <a
                        :href="`https://nvd.nist.gov/vuln/detail/${vuln.id}`"
                        target="_blank"
                        class="text-blue-600 hover:underline"
                      >
                        {{ vuln.id }}
                      </a>
                    </td>
                    <td class="p-2">
                      <VaBadge
                        :text="vuln.severity"
                        :color="getSeverityColor(vuln.severity)"
                        size="small"
                      />
                    </td>
                    <td class="p-2 font-mono text-xs">
                      {{ vuln.package }}
                    </td>
                    <td class="p-2">
                      <VaIcon
                        v-if="vuln.fixable"
                        name="check_circle"
                        color="success"
                        size="small"
                      />
                      <VaIcon
                        v-else
                        name="cancel"
                        color="danger"
                        size="small"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
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
