/**
 * Device Management Types
 * 
 * Defines the structure for managing multiple IoT devices
 * Each device represents a Raspberry Pi or similar device running the application-manager
 */

export interface Device {
  // Core identification
  id: string                    // Unique device identifier (UUID or custom ID)
  name: string                  // User-friendly device name
  
  // Cloud API fields (optional - for cloud-managed devices)
  uuid?: string                 // Cloud API device UUID
  device_name?: string          // Cloud API device name
  device_type?: string          // Cloud API device type (e.g., "pi4", "x86")
  provisioning_state?: string   // Cloud API provisioning state
  is_online?: boolean           // Cloud API online status
  is_active?: boolean           // Cloud API active flag
  last_connectivity_event?: string // Cloud API last connectivity change
  ip_address?: string           // Cloud API IP address
  mac_address?: string          // Cloud API MAC address
  os_version?: string           // Cloud API OS version
  supervisor_version?: string   // Cloud API supervisor version
  cpu_usage?: number            // Cloud API CPU usage
  cpu_temp?: number             // Cloud API CPU temperature
  memory_usage?: number         // Cloud API memory usage in MB
  memory_total?: number         // Cloud API total memory in MB
  storage_usage?: number        // Cloud API storage usage in MB
  storage_total?: number        // Cloud API total storage in MB
  target_apps_count?: number    // Cloud API target apps count
  current_apps_count?: number   // Cloud API current apps count
  last_reported?: string        // Cloud API last report timestamp
  created_at?: string           // Cloud API creation timestamp
  
  // Legacy/direct connection fields
  hostname: string              // Network hostname or IP address
  apiUrl: string                // Full API URL (e.g., http://192.168.1.100:3002/api/v1)
  status: 'online' | 'offline' | 'unknown'  // Connection status
  lastSeen?: string             // ISO timestamp of last successful connection
  deviceType?: string           // Device model (e.g., "Raspberry Pi 4")
  location?: string             // Physical location
  description?: string          // Optional notes
  isDefault?: boolean           // Whether this is the default device
  createdAt: string             // ISO timestamp when added
  updatedAt?: string            // ISO timestamp of last update
  metrics?: DeviceMetrics       // System metrics (CPU, RAM, Disk)
  managerStatus?: ApplicationManagerStatus  // Application manager status
  applications?: DeviceApplication[]  // Deployed applications
}

export interface ProcessInfo {
  pid: number                   // Process ID
  name: string                  // Process name
  cpu: number                   // CPU usage percentage
  mem: number                   // Memory usage percentage
  command: string               // Full command line
}

export interface DeviceMetrics {
  cpu_usage: number             // CPU usage percentage (0-100)
  memory_percent: number        // Memory usage percentage (0-100)
  storage_percent: number       // Storage usage percentage (0-100)
  cpu_temp?: number             // CPU temperature in Celsius
  hostname?: string             // Device hostname
  uptime?: number               // Uptime in seconds
  top_processes?: ProcessInfo[] // Top processes by CPU/memory usage
  network_interfaces?: NetworkInterface[] // List of network interfaces
}

export interface NetworkInterface {
  name: string;
  ip4?: string;
  ip6?: string;
  mac?: string;
  type?: string;
  default?: boolean;
  virtual?: boolean;
  operstate?: string;
}

export interface DeviceConnectionTest {
  success: boolean
  latency?: number              // Response time in ms
  error?: string                // Error message if failed
  version?: string              // Application manager version
}

export interface AddDeviceRequest {
  name: string
  hostname: string
  port?: number                 // Default: 3002
  protocol?: 'http' | 'https'   // Default: http
  location?: string
  description?: string
}

export interface DeviceStats {
  totalDevices: number
  onlineDevices: number
  offlineDevices: number
  lastSyncTime?: string
}

export interface ApplicationManagerStatus {
  isApplying: boolean
  currentApps: number
  targetApps: number
  currentServices: number
  targetServices: number
  isReconciling: boolean
  lastError?: string | null
}

export interface DeviceApplication {
  appId: number
  appName: string
  services: DeviceService[]
}

export interface DeviceService {
  serviceId: number
  serviceName: string
  imageName: string
  status?: string
  containerId?: string
}

/**
 * Helper: Convert Cloud API device to UI Device format
 */
export function cloudDeviceToDevice(cloudDevice: any): Device {
  return {
    // Map cloud API fields to UI format
    id: cloudDevice.uuid,
    name: cloudDevice.device_name || 'Unnamed Device',
    hostname: cloudDevice.ip_address || '',
    apiUrl: '', // Cloud API managed
    status: cloudDevice.is_online ? 'online' : 'offline',
    lastSeen: cloudDevice.last_reported || cloudDevice.last_connectivity_event,
    deviceType: cloudDevice.device_type,
    createdAt: cloudDevice.created_at,
    
    // Include all cloud API fields
    uuid: cloudDevice.uuid,
    device_name: cloudDevice.device_name,
    device_type: cloudDevice.device_type,
    provisioning_state: cloudDevice.provisioning_state,
    is_online: cloudDevice.is_online,
    is_active: cloudDevice.is_active,
    last_connectivity_event: cloudDevice.last_connectivity_event,
    ip_address: cloudDevice.ip_address,
    mac_address: cloudDevice.mac_address,
    os_version: cloudDevice.os_version,
    supervisor_version: cloudDevice.supervisor_version,
    cpu_usage: cloudDevice.cpu_usage,
    cpu_temp: cloudDevice.cpu_temp,
    memory_usage: cloudDevice.memory_usage,
    memory_total: cloudDevice.memory_total,
    storage_usage: cloudDevice.storage_usage,
    storage_total: cloudDevice.storage_total,
    target_apps_count: cloudDevice.target_apps_count,
    current_apps_count: cloudDevice.current_apps_count,
    last_reported: cloudDevice.last_reported,
    created_at: cloudDevice.created_at,
    
    // Compute metrics if available
    metrics: cloudDevice.cpu_usage !== undefined ? {
      cpu_usage: cloudDevice.cpu_usage || 0,
      memory_percent: cloudDevice.memory_total 
        ? Math.round((cloudDevice.memory_usage / cloudDevice.memory_total) * 100) 
        : 0,
      storage_percent: cloudDevice.storage_total
        ? Math.round((cloudDevice.storage_usage / cloudDevice.storage_total) * 100)
        : 0,
      cpu_temp: cloudDevice.cpu_temp,
      hostname: cloudDevice.device_name,
    } : undefined,
  }
}

/**
 * Helper: Calculate memory percentage
 */
export function calculateMemoryPercent(memUsage?: number, memTotal?: number): number {
  if (!memUsage || !memTotal || memTotal === 0) return 0
  return Math.round((memUsage / memTotal) * 100)
}

/**
 * Helper: Calculate storage percentage
 */
export function calculateStoragePercent(storageUsage?: number, storageTotal?: number): number {
  if (!storageUsage || !storageTotal || storageTotal === 0) return 0
  return Math.round((storageUsage / storageTotal) * 100)
}
