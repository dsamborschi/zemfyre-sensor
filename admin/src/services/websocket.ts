/**
 * Metrics WebSocket Service
 * ==========================
 * 
 * Type-safe WebSocket client for system metrics
 * Handles connection, reconnection, and metrics updates
 */

import { ref, computed } from 'vue'
import { useWebSocket } from '../composables/useWebSocket'
import type { Device } from '../data/types/device'

export interface MetricsWebSocketOptions {
  url?: string
  autoConnect?: boolean
  onMetricsUpdate?: (metrics: Device) => void
  onError?: (error: string) => void
  debug?: boolean
}

export function useMetricsWebSocket(options: MetricsWebSocketOptions = {}) {
  // Use environment variable for dev, or device IP for production
  const defaultUrl = `ws://192.168.2.30:3002/ws/metrics`
  
  const {
    url = defaultUrl,
    autoConnect = true,
    onMetricsUpdate,
    onError,
    debug = false,
  } = options

  // Latest metrics data
  const latestMetrics = ref<Device | null>(null)
  const lastUpdateTime = ref<Date | null>(null)
  const updateCount = ref(0)

  // Initialize WebSocket
  const ws = useWebSocket({
    url,
    autoReconnect: true,
    reconnectInterval: 3000,
    maxReconnectAttempts: 10,
    debug,
  })

  // Register metrics message handler
  const unsubscribeMetrics = ws.on('metrics', (data: any) => {
    if (debug) {
      console.log('[MetricsWS] Received metrics update:', data)
    }

    // Transform backend metrics to Device format
    // Convert WebSocket URL to HTTP API URL
    const apiUrl = url
      .replace('/ws/metrics', '/api/v1')
      .replace(/^ws:/, 'http:')
      .replace(/^wss:/, 'https:')
    
    const device: Device = {
      id: data.hostname || 'local',
      name: data.hostname || 'Local Device',
      hostname: data.hostname || 'localhost',
      apiUrl,
      status: 'online',
      lastSeen: new Date(data.timestamp).toISOString(),
      deviceType: 'Raspberry Pi',
      createdAt: new Date().toISOString(),
      
      // Metrics
      metrics: {
        cpu_usage: data.cpu_usage || 0,
        memory_percent: data.memory_percent || 0,
        storage_percent: data.storage_percent || 0,
        cpu_temp: data.cpu_temp,
        hostname: data.hostname,
        uptime: data.uptime || 0,
        top_processes: data.top_processes || [],
        network_interfaces: data.network_interfaces || [],
      },
      
      // Applications (preserved from existing data)
      applications: latestMetrics.value?.applications || [],
    }

    latestMetrics.value = device
    lastUpdateTime.value = new Date()
    updateCount.value++

    // Call optional callback
    if (onMetricsUpdate) {
      onMetricsUpdate(device)
    }
  })

  // Register connected message handler
  const unsubscribeConnected = ws.on('connected', (data: any) => {
    if (debug) {
      console.log('[MetricsWS] Connected with client ID:', data.clientId)
    }
  })

  // Register error message handler
  const unsubscribeError = ws.on('error', (data: any) => {
    const errorMessage = data?.message || 'Unknown WebSocket error'
    console.error('[MetricsWS] Server error:', errorMessage)
    
    if (onError) {
      onError(errorMessage)
    }
  })

  // Auto-connect if enabled
  if (autoConnect) {
    ws.connect()
  }

  // Computed properties
  const isConnected = computed(() => ws.status.value === 'connected')
  const isConnecting = computed(() => ws.status.value === 'connecting')
  const connectionStatus = computed(() => ws.status.value)
  const hasMetrics = computed(() => latestMetrics.value !== null)
  
  // Update frequency (updates per minute)
  const updateFrequency = computed(() => {
    if (updateCount.value === 0 || !lastUpdateTime.value) return 0
    const elapsedMinutes = (Date.now() - lastUpdateTime.value.getTime()) / 60000
    return elapsedMinutes > 0 ? Math.round(updateCount.value / elapsedMinutes) : 0
  })

  /**
   * Cleanup function to unregister all handlers
   */
  function cleanup() {
    unsubscribeMetrics()
    unsubscribeConnected()
    unsubscribeError()
    ws.disconnect()
  }

  return {
    // State
    latestMetrics,
    lastUpdateTime,
    updateCount,
    connectionStatus,
    isConnected,
    isConnecting,
    hasMetrics,
    updateFrequency,
    reconnectAttempts: ws.reconnectAttempts,
    error: ws.error,

    // Methods
    connect: ws.connect,
    disconnect: ws.disconnect,
    cleanup,

    // Raw WebSocket (for advanced usage)
    ws,
  }
}

export default useMetricsWebSocket
