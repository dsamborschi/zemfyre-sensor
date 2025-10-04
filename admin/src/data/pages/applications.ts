/**
 * Application Manager Data Layer
 *
 * This module handles data operations for the Application Manager.
 * Applications contain Services (Docker containers).
 *
 * Key Concepts:
 * - Application: A logical grouping of services (e.g., "Web Stack", "Database Cluster")
 * - Service: A Docker container running specific software (e.g., "nginx", "postgres")
 * - State: Current vs Target state determines what actions are needed
 */

import { applicationManagerApi } from '../../services/application-manager-api'

// ==================== Type Definitions ====================

export interface ServiceConfig {
  serviceId: number
  serviceName: string
  imageName: string
  appId: number
  appName: string
  config: {
    image: string
    ports?: string[]
    environment?: Record<string, string>
    volumes?: string[]
    networks?: string[]
    restart?: string
    command?: string[]
    labels?: Record<string, string>
  }
}

export interface Application {
  appId: number
  appName: string
  services: ServiceConfig[]
  createdAt?: string
  status?: 'running' | 'stopped' | 'deploying' | 'error'
}

export interface ApplicationState {
  current: {
    apps: Record<number, Application>
  }
  target: {
    apps: Record<number, Application>
  }
}

export interface DeviceInfo {
  uuid: string
  deviceId?: string
  deviceName?: string
  deviceType?: string
  provisioned: boolean
  apiEndpoint?: string
  registeredAt?: string
}

export interface SystemMetrics {
  cpu_usage: number
  cpu_temp: number
  cpu_cores: number
  memory_usage: number
  memory_total: number
  memory_percent: number
  storage_usage: number
  storage_total: number
  storage_percent: number
  uptime: number
  uptime_formatted: string
  hostname: string
  is_undervolted: boolean
  timestamp: string
}

// ==================== Application Operations ====================

/**
 * Get all deployed applications with their services
 */
export const getApplications = async (): Promise<Application[]> => {
  const response = await fetch(applicationManagerApi.getAllApps())
  if (!response.ok) {
    throw new Error(`Failed to fetch applications: ${response.statusText}`)
  }
  const data = await response.json()
  return data.apps || []
}

/**
 * Get a specific application by ID
 */
export const getApplication = async (appId: number): Promise<Application> => {
  const response = await fetch(applicationManagerApi.getApp(appId))
  if (!response.ok) {
    throw new Error(`Failed to fetch application ${appId}: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Get current and target state
 */
export const getApplicationState = async (): Promise<ApplicationState> => {
  const response = await fetch(applicationManagerApi.getState())
  if (!response.ok) {
    throw new Error(`Failed to fetch application state: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Deploy a new application with its services
 *
 * Example:
 * ```
 * deployApplication({
 *   appId: 1001,
 *   appName: 'web-stack',
 *   services: [{
 *     serviceId: 1,
 *     serviceName: 'nginx',
 *     imageName: 'nginx:alpine',
 *     config: {
 *       image: 'nginx:alpine',
 *       ports: ['8080:80']
 *     }
 *   }]
 * })
 * ```
 */
export const deployApplication = async (application: Application): Promise<void> => {
  // Set target state
  const response = await fetch(applicationManagerApi.setTargetState(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apps: {
        [application.appId]: application,
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to deploy application: ${response.statusText}`)
  }

  // Apply state to trigger deployment
  await applyState()
}

/**
 * Update an existing application's configuration or services
 */
export const updateApplication = async (application: Application): Promise<void> => {
  const response = await fetch(applicationManagerApi.setApp(application.appId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(application),
  })

  if (!response.ok) {
    throw new Error(`Failed to update application: ${response.statusText}`)
  }

  // Don't auto-apply state - let user trigger reconciliation manually
  // This prevents conflicts when multiple updates are made in quick succession
  // await applyState()
}

/**
 * Remove an application and all its services
 */
export const removeApplication = async (appId: number): Promise<boolean> => {
  const response = await fetch(applicationManagerApi.removeApp(appId), {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error(`Failed to remove application: ${response.statusText}`)
  }

  // Don't auto-apply state - let user trigger reconciliation manually
  // await applyState()
  return true
}

/**
 * Apply state changes (reconcile current with target)
 * This triggers the actual deployment/update/removal of services
 */
export const applyState = async (): Promise<{ status: string; message: string }> => {
  const response = await fetch(applicationManagerApi.applyState(), {
    method: 'POST',
  })

  if (!response.ok) {
    // Handle 409 Conflict (already reconciling) gracefully
    if (response.status === 409) {
      const data = await response.json()
      throw new Error(data.message || 'State reconciliation is already in progress')
    }
    throw new Error(`Failed to apply state: ${response.statusText}`)
  }

  return await response.json()
}

// ==================== Service Operations ====================

/**
 * Add a service to an existing application
 */
export const addServiceToApplication = async (appId: number, service: ServiceConfig): Promise<void> => {
  const app = await getApplication(appId)
  app.services.push(service)
  await updateApplication(app)
}

/**
 * Remove a service from an application
 */
export const removeServiceFromApplication = async (appId: number, serviceId: number): Promise<void> => {
  const app = await getApplication(appId)
  app.services = app.services.filter((s) => s.serviceId !== serviceId)
  await updateApplication(app)
}

// ==================== Device Operations ====================

/**
 * Get device information
 */
export const getDeviceInfo = async (): Promise<DeviceInfo> => {
  const response = await fetch(applicationManagerApi.getDevice())
  if (!response.ok) {
    throw new Error(`Failed to fetch device info: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Check if device is provisioned
 */
export const getDeviceProvisionStatus = async (): Promise<boolean> => {
  const response = await fetch(applicationManagerApi.getDeviceStatus())
  if (!response.ok) {
    throw new Error(`Failed to fetch device status: ${response.statusText}`)
  }
  const data = await response.json()
  return data.provisioned
}

/**
 * Provision device
 */
export const provisionDevice = async (deviceName: string, deviceType: string): Promise<void> => {
  const response = await fetch(applicationManagerApi.provisionDevice(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceName, deviceType }),
  })

  if (!response.ok) {
    throw new Error(`Failed to provision device: ${response.statusText}`)
  }
}

// ==================== Metrics Operations ====================

/**
 * Get system resource metrics
 */
export const getSystemMetrics = async (): Promise<SystemMetrics> => {
  const response = await fetch(applicationManagerApi.getSystemMetrics())
  if (!response.ok) {
    throw new Error(`Failed to fetch system metrics: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Get Docker-specific metrics
 */
export const getDockerMetrics = async (): Promise<any> => {
  const response = await fetch(applicationManagerApi.getDockerMetrics())
  if (!response.ok) {
    throw new Error(`Failed to fetch Docker metrics: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Get application manager logs
 */
export const getManagerLogs = async (limit: number = 100): Promise<any[]> => {
  const response = await fetch(applicationManagerApi.getLogs({ limit }))
  if (!response.ok) {
    throw new Error(`Failed to fetch logs: ${response.statusText}`)
  }
  return response.json()
}

// ==================== Service Logs Operations ====================

export interface LogEntry {
  timestamp: number
  level: string
  message: string
  sourceType: string
  containerId?: string
  serviceId?: number
  serviceName?: string
}

export interface LogFilter {
  serviceId?: number
  serviceName?: string
  containerId?: string
  level?: string
  sourceType?: string
  since?: number
  until?: number
  limit?: number
}

/**
 * Get service/container logs with filtering
 */
export const getServiceLogs = async (filter: LogFilter): Promise<LogEntry[]> => {
  const queryParams = new URLSearchParams()
  
  if (filter.serviceId !== undefined) queryParams.append('serviceId', filter.serviceId.toString())
  if (filter.serviceName) queryParams.append('serviceName', filter.serviceName)
  if (filter.containerId) queryParams.append('containerId', filter.containerId)
  if (filter.level) queryParams.append('level', filter.level)
  if (filter.sourceType) queryParams.append('sourceType', filter.sourceType)
  if (filter.since) queryParams.append('since', filter.since.toString())
  if (filter.until) queryParams.append('until', filter.until.toString())
  if (filter.limit) queryParams.append('limit', filter.limit.toString())

  // Construct the API URL - use /api/v1/logs endpoint
  const baseUrl = applicationManagerApi.getStatus().replace('/status', '/logs')
  const url = queryParams.toString() ? `${baseUrl}?${queryParams.toString()}` : baseUrl
  
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch service logs: ${response.statusText}`)
  }
  
  const data = await response.json()
  return data.logs || []
}

export interface ExecResult {
  output: string
  exitCode: number
  success: boolean
}

/**
 * Execute a command in a container
 */
export const executeContainerCommand = async (
  containerId: string,
  command: string
): Promise<ExecResult> => {
  // Parse command string into array (simple split by spaces)
  // For more complex commands with quotes, you might need a proper parser
  const commandArray = command.trim().split(/\s+/)
  
  if (commandArray.length === 0) {
    throw new Error('Command cannot be empty')
  }

  // Construct the API URL - use /api/v1/containers/:containerId/exec endpoint
  const baseUrl = applicationManagerApi.getStatus().replace('/status', `/containers/${containerId}/exec`)
  
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      command: commandArray,
    }),
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(error.message || `Failed to execute command: ${response.statusText}`)
  }
  
  const data = await response.json()
  return {
    output: data.output || '',
    exitCode: data.exitCode || 0,
    success: data.success || false,
  }
}
