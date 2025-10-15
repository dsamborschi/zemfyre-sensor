/**
 * Cloud API Service
 * 
 * Provides a unified interface for managing devices through the Cloud API.
 * The Cloud API is device-centric - all operations are scoped to a specific device UUID.
 * 
 * Architecture:
 * - Cloud API runs on port 4002
 * - Each device has a unique UUID
 * - Devices self-provision and report state
 * - All operations use /api/v1/devices/:uuid/* endpoints
 */

const CLOUD_API_URL = import.meta.env.VITE_CLOUD_API_URL || 'http://localhost:4002'

/**
 * CloudDevice - Device as returned by Cloud API
 */
export interface CloudDevice {
  uuid: string
  device_name: string
  device_type: string
  provisioning_state: string
  is_online: boolean
  is_active: boolean
  last_connectivity_event?: string
  ip_address?: string
  mac_address?: string
  os_version?: string
  supervisor_version?: string
  cpu_usage?: number
  cpu_temp?: number
  memory_usage?: number
  memory_total?: number
  storage_usage?: number
  storage_total?: number
  target_apps_count: number
  current_apps_count: number
  last_reported?: string
  created_at: string
}

/**
 * CloudDeviceList - Response from list devices endpoint
 */
export interface CloudDeviceList {
  count: number
  devices: CloudDevice[]
}

/**
 * TargetState - Desired state configuration
 */
export interface TargetState {
  uuid: string
  apps: {
    [appId: string]: {
      appId: string
      name: string
      services: {
        [serviceId: string]: {
          image: string
          environment?: { [key: string]: string }
          ports?: string[]
          volumes?: string[]
          restart?: string
          privileged?: boolean
          network_mode?: string
          command?: string
        }
      }
    }
  }
  updated_at: string
}

/**
 * CurrentState - Last reported state from device
 */
export interface CurrentState {
  uuid: string
  apps: {
    [appId: string]: {
      appId: string
      name: string
      services: {
        [serviceId: string]: {
          status: string
          containerId?: string
          image: string
        }
      }
    }
  }
  metrics?: {
    cpu_usage?: number
    memory_usage?: number
    storage_usage?: number
  }
  reported_at: string
}

/**
 * Cloud API client
 */
class CloudApiService {
  private baseUrl: string

  constructor(baseUrl: string = CLOUD_API_URL) {
    this.baseUrl = baseUrl
  }

  /**
   * List all devices
   */
  async listDevices(): Promise<CloudDeviceList> {
    const response = await fetch(`${this.baseUrl}/api/v1/devices`)
    if (!response.ok) {
      throw new Error(`Failed to list devices: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Get specific device by UUID
   */
  async getDevice(uuid: string): Promise<CloudDevice> {
    const response = await fetch(`${this.baseUrl}/api/v1/devices/${uuid}`)
    if (!response.ok) {
      throw new Error(`Failed to get device ${uuid}: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Delete a device
   */
  async deleteDevice(uuid: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v1/devices/${uuid}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw new Error(`Failed to delete device ${uuid}: ${response.statusText}`)
    }
  }

  /**
   * Get target state for device
   */
  async getTargetState(uuid: string): Promise<TargetState> {
    const response = await fetch(`${this.baseUrl}/api/v1/devices/${uuid}/target-state`)
    if (!response.ok) {
      throw new Error(`Failed to get target state for ${uuid}: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Set target state for device
   */
  async setTargetState(uuid: string, state: Partial<TargetState>): Promise<TargetState> {
    const response = await fetch(`${this.baseUrl}/api/v1/devices/${uuid}/target-state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state),
    })
    if (!response.ok) {
      throw new Error(`Failed to set target state for ${uuid}: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Get current state for device (last reported)
   */
  async getCurrentState(uuid: string): Promise<CurrentState> {
    const response = await fetch(`${this.baseUrl}/api/v1/devices/${uuid}/current-state`)
    if (!response.ok) {
      throw new Error(`Failed to get current state for ${uuid}: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Clear target state (remove all apps)
   */
  async clearTargetState(uuid: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v1/devices/${uuid}/target-state`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw new Error(`Failed to clear target state for ${uuid}: ${response.statusText}`)
    }
  }

  /**
   * Get device logs
   */
  async getLogs(uuid: string, options?: { lines?: number; since?: string }): Promise<string[]> {
    const params = new URLSearchParams()
    if (options?.lines) params.append('lines', options.lines.toString())
    if (options?.since) params.append('since', options.since)

    const url = `${this.baseUrl}/api/v1/devices/${uuid}/logs${params.toString() ? '?' + params.toString() : ''}`
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Failed to get logs for ${uuid}: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Get device metrics
   */
  async getMetrics(uuid: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/devices/${uuid}/metrics`)
    if (!response.ok) {
      throw new Error(`Failed to get metrics for ${uuid}: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Get API status
   */
  async getStatus(): Promise<{ status: string; devices_online: number; devices_total: number }> {
    const response = await fetch(`${this.baseUrl}/api/v1/status`)
    if (!response.ok) {
      throw new Error(`Failed to get API status: ${response.statusText}`)
    }
    return response.json()
  }
}

// Export singleton instance
const cloudApi = new CloudApiService()
export default cloudApi
