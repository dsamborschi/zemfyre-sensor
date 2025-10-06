import { defineStore } from 'pinia'
import type { Device, DeviceConnectionTest, AddDeviceRequest, DeviceStats, DeviceApplication } from '../data/types/device'

const STORAGE_KEY = 'iotistic_devices'
const ACTIVE_DEVICE_KEY = 'iotistic_active_device'

/**
 * Test connection to a device's application manager API
 */
async function testDeviceConnection(apiUrl: string): Promise<DeviceConnectionTest> {
  try {
    const startTime = Date.now()
    const response = await fetch(`${apiUrl}/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    })
    
    const latency = Date.now() - startTime
    
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }
    
    const data = await response.json()
    return {
      success: true,
      latency,
      version: data.version || 'unknown',
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Connection failed',
    }
  }
}

export const useDevicesStore = defineStore('devices', {
  state: () => ({
    devices: [] as Device[],
    activeDeviceId: null as string | null,
    isLoading: false,
    error: null as string | null,
  }),

  getters: {
    /**
     * Get the currently active device
     */
    activeDevice: (state): Device | null => {
      if (!state.activeDeviceId) return null
      return state.devices.find(d => d.id === state.activeDeviceId) || null
    },

    /**
     * Get the API URL of the active device
     */
    activeDeviceApiUrl: (state): string => {
      const device = state.devices.find(d => d.id === state.activeDeviceId)
      return device?.apiUrl || import.meta.env.VITE_APP_MANAGER_API || 'http://localhost:3002/api/v1'
    },

    /**
     * Get online devices
     */
    onlineDevices: (state): Device[] => {
      return state.devices.filter(d => d.status === 'online')
    },

    /**
     * Get offline devices
     */
    offlineDevices: (state): Device[] => {
      return state.devices.filter(d => d.status === 'offline')
    },

    /**
     * Get device statistics
     */
    stats: (state): DeviceStats => {
      return {
        totalDevices: state.devices.length,
        onlineDevices: state.devices.filter(d => d.status === 'online').length,
        offlineDevices: state.devices.filter(d => d.status === 'offline').length,
      }
    },

    /**
     * Check if there are any devices
     */
    hasDevices: (state): boolean => {
      return state.devices.length > 0
    },
  },

  actions: {
    /**
     * Initialize devices from localStorage
     */
    async initialize() {
      try {
        // Load devices
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          this.devices = JSON.parse(stored)
        }

        // Load active device
        const activeId = localStorage.getItem(ACTIVE_DEVICE_KEY)
        if (activeId && this.devices.some(d => d.id === activeId)) {
          this.activeDeviceId = activeId
        } else if (this.devices.length > 0) {
          // Set first device as active if none selected
          this.activeDeviceId = this.devices[0].id
          this.saveActiveDevice()
        }

        // Add default localhost device if no devices exist
        if (this.devices.length === 0) {
          this.addDefaultDevice()
        }

        // Refresh all devices status and metrics
        console.log('[Devices] Initializing and refreshing all devices...')
        await this.refreshAllDevicesStatus()
      } catch (error) {
        console.error('Failed to initialize devices:', error)
        this.addDefaultDevice()
      }
    },

    /**
     * Add default localhost device
     */
    addDefaultDevice() {
      const defaultDevice: Device = {
        id: 'localhost',
        name: 'Local Device',
        hostname: 'localhost',
        apiUrl: 'http://localhost:3002/api/v1',
        status: 'unknown',
        deviceType: 'Development',
        isDefault: true,
        createdAt: new Date().toISOString(),
      }
      this.devices.push(defaultDevice)
      this.activeDeviceId = defaultDevice.id
      this.saveDevices()
      this.saveActiveDevice()
    },

    /**
     * Add a new device
     */
    async addDevice(request: AddDeviceRequest): Promise<Device> {
      this.isLoading = true
      this.error = null

      try {
        // Build API URL
        const protocol = request.protocol || 'http'
        const port = request.port || 3002
        const apiUrl = `${protocol}://${request.hostname}:${port}/api/v1`

        // Test connection
        const testResult = await testDeviceConnection(apiUrl)

        // Create device
        const device: Device = {
          id: `device-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          name: request.name,
          hostname: request.hostname,
          apiUrl,
          status: testResult.success ? 'online' : 'offline',
          lastSeen: testResult.success ? new Date().toISOString() : undefined,
          location: request.location,
          description: request.description,
          createdAt: new Date().toISOString(),
        }

        this.devices.push(device)
        this.saveDevices()

        // Set as active if it's the only device
        if (this.devices.length === 1) {
          this.setActiveDevice(device.id)
        }

        // Refresh device status to fetch metrics
        await this.refreshDeviceStatus(device.id)

        return device
      } catch (error: any) {
        this.error = error.message
        throw error
      } finally {
        this.isLoading = false
      }
    },

    /**
     * Update an existing device
     */
    async updateDevice(id: string, updates: Partial<Device>): Promise<void> {
      const index = this.devices.findIndex(d => d.id === id)
      if (index === -1) {
        throw new Error(`Device ${id} not found`)
      }

      this.devices[index] = {
        ...this.devices[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      }

      this.saveDevices()
    },

    /**
     * Remove a device
     */
    removeDevice(id: string): void {
      const index = this.devices.findIndex(d => d.id === id)
      if (index === -1) return

      this.devices.splice(index, 1)
      this.saveDevices()

      // If removed device was active, switch to another
      if (this.activeDeviceId === id) {
        this.activeDeviceId = this.devices.length > 0 ? this.devices[0].id : null
        this.saveActiveDevice()
      }
    },

    /**
     * Set the active device
     */
    setActiveDevice(id: string): void {
      const device = this.devices.find(d => d.id === id)
      if (!device) {
        console.error(`Device ${id} not found`)
        return
      }

      this.activeDeviceId = id
      this.saveActiveDevice()

      // Refresh connection status
      this.refreshDeviceStatus(id)
    },

    /**
     * Refresh connection status for a specific device
     */
    async refreshDeviceStatus(id: string): Promise<void> {
      const device = this.devices.find(d => d.id === id)
      if (!device) return

      const testResult = await testDeviceConnection(device.apiUrl)
      
      // If device is online, fetch metrics and manager status
      let metrics = undefined
      let managerStatus = undefined
      let applications = undefined
      if (testResult.success) {
        try {
          console.log(`[Devices] Fetching metrics for ${device.name} from ${device.apiUrl}/metrics`)
          const metricsResponse = await fetch(`${device.apiUrl}/metrics`, {
            signal: AbortSignal.timeout(5000)
          })
          if (metricsResponse.ok) {
            metrics = await metricsResponse.json()
            console.log(`[Devices] Metrics received for ${device.name}:`, metrics)
          } else {
            console.warn(`[Devices] Metrics request failed for ${device.name}: ${metricsResponse.status}`)
          }
        } catch (error) {
          console.error(`[Devices] Failed to fetch metrics for ${device.name}:`, error)
        }

        // Fetch application manager status
        try {
          console.log(`[Devices] Fetching manager status for ${device.name} from ${device.apiUrl}/status`)
          const statusResponse = await fetch(`${device.apiUrl}/status`, {
            signal: AbortSignal.timeout(5000)
          })
          if (statusResponse.ok) {
            managerStatus = await statusResponse.json()
            console.log(`[Devices] Manager status received for ${device.name}:`, managerStatus)
          } else {
            console.warn(`[Devices] Status request failed for ${device.name}: ${statusResponse.status}`)
          }
        } catch (error) {
          console.error(`[Devices] Failed to fetch manager status for ${device.name}:`, error)
        }

        // Fetch deployed applications
        try {
          console.log(`[Devices] Fetching applications for ${device.name} from ${device.apiUrl}/state/current`)
          const appsResponse = await fetch(`${device.apiUrl}/state/current`, {
            signal: AbortSignal.timeout(5000)
          })
          if (appsResponse.ok) {
            const currentState = await appsResponse.json()
            console.log(`[Devices] Raw API response for ${device.name}:`, currentState)
            console.log(`[Devices] Current apps object:`, currentState.current?.apps)
            // Convert apps object to array - API returns {current: {apps: {...}}, target: {apps: {...}}}
           applications = Object.values(currentState.current?.apps || {}) as DeviceApplication[] 
            console.log(`[Devices] Applications array after Object.values for ${device.name}:`, applications)
            console.log(`[Devices] Applications array length:`, applications.length)
          } else {
            console.warn(`[Devices] Applications request failed for ${device.name}: ${appsResponse.status}`)
          }
        } catch (error) {
          console.error(`[Devices] Failed to fetch applications for ${device.name}:`, error)
        }
      }
      
      await this.updateDevice(id, {
        status: testResult.success ? 'online' : 'offline',
        lastSeen: testResult.success ? new Date().toISOString() : device.lastSeen,
        metrics,
        managerStatus,
        applications,
      })
    },

    /**
     * Refresh status for all devices
     */
    async refreshAllDevicesStatus(): Promise<void> {
      this.isLoading = true
      try {
        const promises = this.devices.map(device => this.refreshDeviceStatus(device.id))
        await Promise.all(promises)
      } finally {
        this.isLoading = false
      }
    },

    /**
     * Save devices to localStorage
     */
    saveDevices(): void {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.devices))
      } catch (error) {
        console.error('Failed to save devices:', error)
      }
    },

    /**
     * Save active device to localStorage
     */
    saveActiveDevice(): void {
      try {
        if (this.activeDeviceId) {
          localStorage.setItem(ACTIVE_DEVICE_KEY, this.activeDeviceId)
        } else {
          localStorage.removeItem(ACTIVE_DEVICE_KEY)
        }
      } catch (error) {
        console.error('Failed to save active device:', error)
      }
    },

    /**
     * Clear error
     */
    clearError(): void {
      this.error = null
    },

    /**
     * Update device metrics from WebSocket
     * Merges incoming metrics with existing device data
     */
    updateDeviceMetrics(updatedDevice: Device): void {
      // Find existing device by hostname (WebSocket uses hostname as ID)
      const existingDevice = this.devices.find(d => d.hostname === updatedDevice.hostname)
      
      if (existingDevice) {
        // Update existing device with new metrics
        Object.assign(existingDevice, {
          ...updatedDevice,
          id: existingDevice.id, // Preserve original ID
          name: existingDevice.name, // Preserve user-set name
          apiUrl: existingDevice.apiUrl, // Preserve API URL
          location: existingDevice.location, // Preserve location
          description: existingDevice.description, // Preserve description
          isDefault: existingDevice.isDefault, // Preserve default flag
          createdAt: existingDevice.createdAt, // Preserve creation time
          lastSeen: updatedDevice.lastSeen || new Date().toISOString(),
          status: 'online',
        })
      } else {
        // If device doesn't exist, this is the local/default device
        // Add it as a temporary device (will be replaced on full refresh)
        console.log('[Devices] Adding local device from WebSocket:', updatedDevice)
        this.devices.push({
          ...updatedDevice,
          isDefault: true,
        })
      }
    },
  },
})
