import { defineStore } from 'pinia'
import {
  getApplications,
  getApplication,
  getApplicationState,
  deployApplication,
  updateApplication,
  removeApplication,
  getSystemMetrics,
  getDeviceInfo,
  type Application,
  type ApplicationState,
  type SystemMetrics,
  type DeviceInfo,
} from '../data/pages/applications'

// ============================================================================
// MOCK DATA FOR DEVELOPMENT
// ============================================================================
const USE_MOCK_DATA = false // Set to false when API is available

const MOCK_APPLICATIONS: Application[] = [
  {
    appId: 1001,
    appName: 'web-stack',
    status: 'running',
    createdAt: '2025-10-01T10:30:00Z',
    services: [
      {
        serviceId: 1,
        serviceName: 'nginx',
        imageName: 'nginx:alpine',
        appId: 1001,
        appName: 'web-stack',
        config: {
          image: 'nginx:alpine',
          ports: ['8080:80', '8443:443'],
          environment: {
            NGINX_HOST: 'localhost',
            NGINX_PORT: '80',
          },
        },
      },
      {
        serviceId: 2,
        serviceName: 'redis',
        imageName: 'redis:alpine',
        appId: 1001,
        appName: 'web-stack',
        config: {
          image: 'redis:alpine',
          ports: ['6379:6379'],
          environment: {
            REDIS_PASSWORD: 'secret123',
          },
        },
      },
    ],
  },
  {
    appId: 1002,
    appName: 'database-cluster',
    status: 'running',
    createdAt: '2025-10-02T14:20:00Z',
    services: [
      {
        serviceId: 3,
        serviceName: 'postgres',
        imageName: 'postgres:16-alpine',
        appId: 1002,
        appName: 'database-cluster',
        config: {
          image: 'postgres:16-alpine',
          ports: ['5432:5432'],
          environment: {
            POSTGRES_USER: 'admin',
            POSTGRES_PASSWORD: 'admin123',
            POSTGRES_DB: 'myapp',
          },
          volumes: ['postgres-data:/var/lib/postgresql/data'],
        },
      },
    ],
  },
  {
    appId: 1003,
    appName: 'monitoring-stack',
    status: 'running',
    createdAt: '2025-10-03T09:15:00Z',
    services: [
      {
        serviceId: 4,
        serviceName: 'grafana',
        imageName: 'grafana/grafana:latest',
        appId: 1003,
        appName: 'monitoring-stack',
        config: {
          image: 'grafana/grafana:latest',
          ports: ['3000:3000'],
          environment: {
            GF_SECURITY_ADMIN_PASSWORD: 'admin',
          },
        },
      },
      {
        serviceId: 5,
        serviceName: 'influxdb',
        imageName: 'influxdb:2-alpine',
        appId: 1003,
        appName: 'monitoring-stack',
        config: {
          image: 'influxdb:2-alpine',
          ports: ['8086:8086'],
          environment: {
            INFLUXDB_DB: 'metrics',
          },
          volumes: ['influxdb-data:/var/lib/influxdb2'],
        },
      },
    ],
  },
]

const MOCK_METRICS: SystemMetrics = {
  cpu: { usage: 45.8, cores: 4 },
  memory: { total: 8192, used: 3584, free: 4608, usedPercent: 43.75 },
  disk: { total: 51200, used: 18432, free: 32768, usedPercent: 36.0 },
  network: { bytesReceived: 1073741824, bytesSent: 536870912 },
}

const MOCK_DEVICE_INFO: DeviceInfo = {
  uuid: 'mock-device-uuid-12345',
  deviceId: 'raspberrypi-dev-001',
  deviceName: 'Development Pi',
  deviceType: 'Raspberry Pi 4',
  provisioned: true,
  apiEndpoint: 'http://localhost:3002/api/v1',
  registeredAt: '2025-10-01T08:00:00Z',
}

// Simulate API delay
const mockDelay = (ms: number = 500) => new Promise((resolve) => setTimeout(resolve, ms))

export const useApplicationManagerStore = defineStore('applicationManager', {
  state: () => ({
    applications: [] as Application[],
    currentApplication: null as Application | null,
    currentState: null as ApplicationState | null,
    systemMetrics: null as SystemMetrics | null,
    deviceInfo: null as DeviceInfo | null,
    isLoadingApplications: false,
    isLoadingState: false,
    isLoadingMetrics: false,
    isDeploying: false,
    error: null as string | null,
    lastError: null as { message: string; timestamp: Date } | null,
  }),

  getters: {
    getApplicationById: (state) => (appId: number) => state.applications.find((app) => app.appId === appId),
    totalApplications: (state) => state.applications.length,
    totalServices: (state) => state.applications.reduce((total, app) => total + app.services.length, 0),
    runningApplications: (state) => state.applications.filter((app) => app.status === 'running'),
    isDeviceProvisioned: (state) => state.deviceInfo?.provisioned ?? false,
    isLoading: (state) =>
      state.isLoadingApplications || state.isLoadingState || state.isLoadingMetrics || state.isDeploying,
  },

  actions: {
    async fetchApplications() {
      this.isLoadingApplications = true
      this.error = null
      try {
        if (USE_MOCK_DATA) {
          await mockDelay()
          this.applications = [...MOCK_APPLICATIONS]
        } else {
          this.applications = await getApplications()
        }
      } catch (error: any) {
        this.error = error.message
        this.lastError = { message: error.message, timestamp: new Date() }
        console.error('Failed to fetch applications:', error)
        throw error
      } finally {
        this.isLoadingApplications = false
      }
    },

    async fetchApplication(appId: number) {
      this.isLoadingApplications = true
      this.error = null
      try {
        this.currentApplication = await getApplication(appId)
      } catch (error: any) {
        this.error = error.message
        this.lastError = { message: error.message, timestamp: new Date() }
        console.error(`Failed to fetch application ${appId}:`, error)
        throw error
      } finally {
        this.isLoadingApplications = false
      }
    },

    async fetchState() {
      this.isLoadingState = true
      this.error = null
      try {
        this.currentState = await getApplicationState()
      } catch (error: any) {
        this.error = error.message
        this.lastError = { message: error.message, timestamp: new Date() }
        console.error('Failed to fetch application state:', error)
        throw error
      } finally {
        this.isLoadingState = false
      }
    },

    async deployNewApplication(application: Application) {
      this.isDeploying = true
      this.error = null
      try {
        if (USE_MOCK_DATA) {
          await mockDelay(1000)
          this.applications.push({ ...application, status: 'running', createdAt: new Date().toISOString() })
        } else {
          await deployApplication(application)
          await this.fetchApplications()
        }
        return true
      } catch (error: any) {
        this.error = error.message
        this.lastError = { message: error.message, timestamp: new Date() }
        console.error('Failed to deploy application:', error)
        throw error
      } finally {
        this.isDeploying = false
      }
    },

    async updateExistingApplication(application: Application) {
      this.isDeploying = true
      this.error = null
      try {
        await updateApplication(application)
        await this.fetchApplications()
        return true
      } catch (error: any) {
        this.error = error.message
        this.lastError = { message: error.message, timestamp: new Date() }
        console.error('Failed to update application:', error)
        throw error
      } finally {
        this.isDeploying = false
      }
    },

    async removeExistingApplication(appId: number) {
      this.isDeploying = true
      this.error = null
      try {
        if (USE_MOCK_DATA) {
          await mockDelay(800)
          this.applications = this.applications.filter((app) => app.appId !== appId)
        } else {
          const success = await removeApplication(appId)
          if (success) this.applications = this.applications.filter((app) => app.appId !== appId)
        }
        return true
      } catch (error: any) {
        this.error = error.message
        this.lastError = { message: error.message, timestamp: new Date() }
        console.error('Failed to remove application:', error)
        throw error
      } finally {
        this.isDeploying = false
      }
    },

    async fetchSystemMetrics() {
      this.isLoadingMetrics = true
      this.error = null
      try {
        if (USE_MOCK_DATA) {
          await mockDelay(300)
          const variation = () => Math.random() * 10 - 5
          this.systemMetrics = {
            cpu: {
              usage: Math.max(0, Math.min(100, MOCK_METRICS.cpu.usage + variation())),
              cores: MOCK_METRICS.cpu.cores,
            },
            memory: {
              ...MOCK_METRICS.memory,
              usedPercent: Math.max(0, Math.min(100, MOCK_METRICS.memory.usedPercent + variation())),
            },
            disk: {
              ...MOCK_METRICS.disk,
              usedPercent: Math.max(0, Math.min(100, MOCK_METRICS.disk.usedPercent + variation())),
            },
            network: MOCK_METRICS.network,
          }
        } else {
          this.systemMetrics = await getSystemMetrics()
        }
      } catch (error: any) {
        this.error = error.message
        this.lastError = { message: error.message, timestamp: new Date() }
        console.error('Failed to fetch system metrics:', error)
        throw error
      } finally {
        this.isLoadingMetrics = false
      }
    },

    async fetchDeviceInfo() {
      this.error = null
      try {
        if (USE_MOCK_DATA) {
          await mockDelay(200)
          this.deviceInfo = { ...MOCK_DEVICE_INFO }
        } else {
          this.deviceInfo = await getDeviceInfo()
        }
      } catch (error: any) {
        this.error = error.message
        this.lastError = { message: error.message, timestamp: new Date() }
        console.error('Failed to fetch device info:', error)
        throw error
      }
    },

    async initialize() {
      try {
        await Promise.all([this.fetchApplications(), this.fetchDeviceInfo()])
      } catch (error) {
        console.error('Failed to initialize application manager store:', error)
      }
    },

    clearError() {
      this.error = null
    },

    async refresh() {
      await Promise.all([this.fetchApplications(), this.fetchState(), this.fetchSystemMetrics()])
    },
  },
})
