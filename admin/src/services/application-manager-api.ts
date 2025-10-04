/**
 * Application Manager API Service
 *
 * This service provides endpoint definitions for the Application Manager API.
 * The Application Manager orchestrates Docker containers and manages application deployments.
 *
 * Architecture:
 * - Applications contain one or more Services
 * - Services are Docker containers that run your application code
 * - Each application has a unique appId and can have multiple service instances
 */

const defaultApiUrl = import.meta.env.VITE_APP_MANAGER_API || 'http://localhost:3002/api/v1'

/**
 * Current API URL - can be changed for multi-device support
 */
let currentApiUrl = defaultApiUrl

/**
 * Set the API URL for communicating with a specific device
 * @param url - Full API URL including protocol and path
 */
export function setApiUrl(url: string): void {
  currentApiUrl = url
}

/**
 * Get the current API URL
 */
export function getApiUrl(): string {
  return currentApiUrl
}

/**
 * Reset API URL to default value
 */
export function resetApiUrl(): void {
  currentApiUrl = defaultApiUrl
}

export const applicationManagerApi = {
  // ==================== State Management ====================

  /**
   * Get current and target state of all applications
   * Returns: { current: ApplicationState, target: TargetState }
   */
  getState: () => `${currentApiUrl}/state`,

  /**
   * Set target state for applications
   * POST body: { apps: { [appId]: AppConfig } }
   */
  setTargetState: () => `${currentApiUrl}/state/target`,

  /**
   * Apply target state (reconcile current state with target)
   * POST - triggers deployment/updates
   */
  applyState: () => `${currentApiUrl}/state/apply`,

  // ==================== Application Management ====================

  /**
   * Get all deployed applications
   * Returns: Array of applications with their services
   */
  getAllApps: () => `${currentApiUrl}/apps`,

  /**
   * Get specific application by ID
   * Returns: Application details with all services
   */
  getApp: (appId: number) => `${currentApiUrl}/apps/${appId}`,

  /**
   * Create or update an application
   * POST/PUT body: AppConfig with services array
   */
  setApp: (appId: number) => `${currentApiUrl}/apps/${appId}`,

  /**
   * Remove/undeploy an application and all its services
   * DELETE - stops and removes all services
   */
  removeApp: (appId: number) => `${currentApiUrl}/apps/${appId}`,

  // ==================== Device Management ====================

  /**
   * Get device information (UUID, provisioning status, etc.)
   */
  getDevice: () => `${currentApiUrl}/device`,

  /**
   * Check if device is provisioned
   * Returns: { provisioned: boolean }
   */
  getDeviceStatus: () => `${currentApiUrl}/device/provisioned`,

  /**
   * Provision device locally (set name and type)
   * POST body: { deviceName: string, deviceType: string }
   */
  provisionDevice: () => `${currentApiUrl}/device/provision`,

  /**
   * Register device with remote API
   * POST body: { apiEndpoint: string, deviceName: string, deviceType: string }
   */
  registerDevice: () => `${currentApiUrl}/device/register`,

  /**
   * Update device information
   * PATCH body: { deviceName?: string, apiEndpoint?: string }
   */
  updateDevice: () => `${currentApiUrl}/device`,

  /**
   * Reset device (unprovision)
   * POST - clears deviceId, apiKey, marks as unprovisioned
   */
  resetDevice: () => `${currentApiUrl}/device/reset`,

  // ==================== Metrics & Monitoring ====================

  /**
   * Get system metrics (CPU, memory, disk, network)
   * Returns: System resource utilization data
   */
  getSystemMetrics: () => `${currentApiUrl}/metrics/system`,

  /**
   * Get Docker-specific metrics
   * Returns: Container resource usage, image info
   */
  getDockerMetrics: () => `${currentApiUrl}/metrics/docker`,

  /**
   * Get application manager logs
   * Query params: ?limit=100&since=timestamp
   */
  getLogs: (params?: { limit?: number; since?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : ''
    return `${currentApiUrl}/logs${query}`
  },

  // ==================== Status & Health ====================

  /**
   * Get application manager status
   * Returns: { status: string, version: string, uptime: number }
   */
  getStatus: () => `${currentApiUrl}/status`,
}

export default applicationManagerApi
