/**
 * Device Management Types
 * 
 * Defines the structure for managing multiple IoT devices
 * Each device represents a Raspberry Pi or similar device running the application-manager
 */

export interface Device {
  id: string                    // Unique device identifier (UUID or custom ID)
  name: string                  // User-friendly device name
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
