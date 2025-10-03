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

const managerApiUrl = import.meta.env.VITE_APP_MANAGER_API || 'http://localhost:3002/api/v1'

export const applicationManagerApi = {
  // ==================== State Management ====================

  /**
   * Get current and target state of all applications
   * Returns: { current: ApplicationState, target: TargetState }
   */
  getState: () => `${managerApiUrl}/state`,

  /**
   * Set target state for applications
   * POST body: { apps: { [appId]: AppConfig } }
   */
  setTargetState: () => `${managerApiUrl}/state/target`,

  /**
   * Apply target state (reconcile current state with target)
   * POST - triggers deployment/updates
   */
  applyState: () => `${managerApiUrl}/state/apply`,

  // ==================== Application Management ====================

  /**
   * Get all deployed applications
   * Returns: Array of applications with their services
   */
  getAllApps: () => `${managerApiUrl}/apps`,

  /**
   * Get specific application by ID
   * Returns: Application details with all services
   */
  getApp: (appId: number) => `${managerApiUrl}/apps/${appId}`,

  /**
   * Create or update an application
   * POST/PUT body: AppConfig with services array
   */
  setApp: (appId: number) => `${managerApiUrl}/apps/${appId}`,

  /**
   * Remove/undeploy an application and all its services
   * DELETE - stops and removes all services
   */
  removeApp: (appId: number) => `${managerApiUrl}/apps/${appId}`,

  // ==================== Device Management ====================

  /**
   * Get device information (UUID, provisioning status, etc.)
   */
  getDevice: () => `${managerApiUrl}/device`,

  /**
   * Check if device is provisioned
   * Returns: { provisioned: boolean }
   */
  getDeviceStatus: () => `${managerApiUrl}/device/provisioned`,

  /**
   * Provision device locally (set name and type)
   * POST body: { deviceName: string, deviceType: string }
   */
  provisionDevice: () => `${managerApiUrl}/device/provision`,

  /**
   * Register device with remote API
   * POST body: { apiEndpoint: string, deviceName: string, deviceType: string }
   */
  registerDevice: () => `${managerApiUrl}/device/register`,

  /**
   * Update device information
   * PATCH body: { deviceName?: string, apiEndpoint?: string }
   */
  updateDevice: () => `${managerApiUrl}/device`,

  /**
   * Reset device (unprovision)
   * POST - clears deviceId, apiKey, marks as unprovisioned
   */
  resetDevice: () => `${managerApiUrl}/device/reset`,

  // ==================== Metrics & Monitoring ====================

  /**
   * Get system metrics (CPU, memory, disk, network)
   * Returns: System resource utilization data
   */
  getSystemMetrics: () => `${managerApiUrl}/metrics/system`,

  /**
   * Get Docker-specific metrics
   * Returns: Container resource usage, image info
   */
  getDockerMetrics: () => `${managerApiUrl}/metrics/docker`,

  /**
   * Get application manager logs
   * Query params: ?limit=100&since=timestamp
   */
  getLogs: (params?: { limit?: number; since?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : ''
    return `${managerApiUrl}/logs${query}`
  },

  // ==================== Status & Health ====================

  /**
   * Get application manager status
   * Returns: { status: string, version: string, uptime: number }
   */
  getStatus: () => `${managerApiUrl}/status`,
}

export default applicationManagerApi
