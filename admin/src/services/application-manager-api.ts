/**
 * Application Manager API Service
 *
 * This service provides endpoint definitions for the Cloud API (multi-device).
 * The Cloud API manages multiple devices through device-centric endpoints.
 *
 * Architecture:
 * - Each device has a unique UUID
 * - Devices are managed via /api/v1/devices/:uuid endpoints
 * - Applications contain one or more Services
 * - Services are Docker containers that run your application code
 */

const defaultApiUrl = import.meta.env.VITE_APP_MANAGER_API || 'http://localhost:3002/api/v1'

/**
 * Current API URL - can be changed for multi-device support
 */
let currentApiUrl = defaultApiUrl

/**
 * Current device UUID - defaults to 'local'
 */
let currentDeviceUuid = 'local'

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
 * Set the device UUID to manage
 * @param uuid - Device UUID
 */
export function setDeviceUuid(uuid: string): void {
  currentDeviceUuid = uuid
}

/**
 * Get the current device UUID
 */
export function getDeviceUuid(): string {
  return currentDeviceUuid
}

/**
 * Reset API URL to default value
 */
export function resetApiUrl(): void {
  currentApiUrl = defaultApiUrl
}

export const applicationManagerApi = {
  // ==================== Device Management ====================

  /**
   * List all devices
   * Returns: { count: number, devices: Device[] }
   */
  listDevices: () => `${currentApiUrl}/devices`,

  /**
   * Get specific device info
   * Returns: Device with target_state and current_state
   */
  getDevice: () => `${currentApiUrl}/devices/${currentDeviceUuid}`,

  // ==================== State Management ====================

  /**
   * Get target state for device
   * Returns: { uuid, apps, updated_at }
   */
  getTargetState: () => `${currentApiUrl}/devices/${currentDeviceUuid}/target-state`,

  /**
   * Get current state for device (last reported)
   * Returns: Current state with apps and metrics
   */
  getCurrentState: () => `${currentApiUrl}/devices/${currentDeviceUuid}/current-state`,

  /**
   * Get current and target state (combined view)
   * Returns: { current: ApplicationState, target: TargetState }
   */
  getState: () => `${currentApiUrl}/devices/${currentDeviceUuid}`,

  /**
   * Set target state for device
   * POST body: { apps: { [appId]: AppConfig } }
   */
  setTargetState: () => `${currentApiUrl}/devices/${currentDeviceUuid}/target-state`,

  /**
   * Clear target state (stop all apps)
   * DELETE - removes all apps from target state
   */
  clearTargetState: () => `${currentApiUrl}/devices/${currentDeviceUuid}/target-state`,

  /**
   * Apply target state (reconcile current state with target)
   * POST - triggers deployment/updates (handled by device)
   */
  applyState: () => `${currentApiUrl}/devices/${currentDeviceUuid}/target-state`,

  // ==================== Application Management ====================

  /**
   * Get all deployed applications for device
   * Returns: Apps object from current state
   */
  getAllApps: () => `${currentApiUrl}/devices/${currentDeviceUuid}/current-state`,

  /**
   * Get specific application by ID
   * Returns: Application details with all services
   */
  getApp: (appId: number) => `${currentApiUrl}/devices/${currentDeviceUuid}/current-state`,

  /**
   * Create or update an application in target state
   * POST body: { apps: { [appId]: AppConfig } }
   */
  setApp: (appId: number) => `${currentApiUrl}/devices/${currentDeviceUuid}/target-state`,

  /**
   * Remove/undeploy an application
   * Updates target state to remove app
   */
  removeApp: (appId: number) => `${currentApiUrl}/devices/${currentDeviceUuid}/target-state`,

  // ==================== Metrics & Monitoring ====================

  /**
   * Get system metrics (CPU, memory, disk, network)
   * Returns: Metrics from device's last report
   */
  getSystemMetrics: () => `${currentApiUrl}/devices/${currentDeviceUuid}/current-state`,

  /**
   * Get device metrics (alias)
   * Returns: Same as current state with metrics
   */
  getMetrics: () => `${currentApiUrl}/devices/${currentDeviceUuid}/current-state`,

  // ==================== Status & Health ====================

  /**
   * Get cloud API status
   * Returns: { status, devices_online, devices_total }
   */
  getStatus: () => `${currentApiUrl}/../`,

  /**
   * Get device status and info
   * Returns: Device online status, last reported time
   */
  getDeviceStatus: () => `${currentApiUrl}/devices/${currentDeviceUuid}`,
}

export default applicationManagerApi
