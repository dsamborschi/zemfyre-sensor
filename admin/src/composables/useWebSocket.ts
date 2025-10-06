/**
 * WebSocket Composable
 * ====================
 * 
 * Generic WebSocket connection handler with auto-reconnection
 * Provides reactive connection state and message handling
 */

import { ref, onUnmounted } from 'vue'

export interface WebSocketOptions {
  url: string
  autoReconnect?: boolean
  reconnectInterval?: number
  maxReconnectAttempts?: number
  debug?: boolean
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface WebSocketMessage {
  type: string
  data?: any
  message?: string
  timestamp: string
}

export function useWebSocket(options: WebSocketOptions) {
  const {
    url,
    autoReconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
    debug = false,
  } = options

  // Reactive state
  const status = ref<ConnectionStatus>('disconnected')
  const lastMessage = ref<WebSocketMessage | null>(null)
  const error = ref<string | null>(null)
  const reconnectAttempts = ref(0)

  // Internal state
  let ws: WebSocket | null = null
  let reconnectTimeout: NodeJS.Timeout | null = null
  let isManualClose = false

  // Message handlers
  const messageHandlers: Map<string, Set<(data: any) => void>> = new Map()

  /**
   * Log debug messages if debug mode is enabled
   */
  function log(...args: any[]) {
    if (debug) {
      console.log('[WebSocket]', ...args)
    }
  }

  /**
   * Connect to WebSocket server
   */
  function connect() {
    if (ws?.readyState === WebSocket.OPEN) {
      log('Already connected')
      return
    }

    if (ws?.readyState === WebSocket.CONNECTING) {
      log('Connection already in progress')
      return
    }

    log('Connecting to', url)
    status.value = 'connecting'
    error.value = null
    isManualClose = false

    try {
      ws = new WebSocket(url)

      ws.onopen = () => {
        log('Connected')
        status.value = 'connected'
        error.value = null
        reconnectAttempts.value = 0
      }

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          lastMessage.value = message
          log('Received message:', message.type)

          // Call registered handlers for this message type
          const handlers = messageHandlers.get(message.type)
          if (handlers) {
            handlers.forEach(handler => {
              try {
                handler(message.data)
              } catch (err) {
                console.error('[WebSocket] Handler error:', err)
              }
            })
          }

          // Call wildcard handlers (listening to all messages)
          const wildcardHandlers = messageHandlers.get('*')
          if (wildcardHandlers) {
            wildcardHandlers.forEach(handler => {
              try {
                handler(message)
              } catch (err) {
                console.error('[WebSocket] Wildcard handler error:', err)
              }
            })
          }
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err)
        }
      }

      ws.onerror = (event) => {
        log('Error:', event)
        status.value = 'error'
        error.value = 'WebSocket connection error'
      }

      ws.onclose = (event) => {
        log('Disconnected:', event.code, event.reason)
        status.value = 'disconnected'
        ws = null

        // Auto-reconnect if enabled and not manually closed
        if (autoReconnect && !isManualClose && reconnectAttempts.value < maxReconnectAttempts) {
          const delay = Math.min(
            reconnectInterval * Math.pow(1.5, reconnectAttempts.value),
            30000 // Max 30 seconds
          )
          log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.value + 1}/${maxReconnectAttempts})`)
          
          reconnectTimeout = setTimeout(() => {
            reconnectAttempts.value++
            connect()
          }, delay)
        } else if (reconnectAttempts.value >= maxReconnectAttempts) {
          error.value = 'Max reconnection attempts reached'
          log('Max reconnection attempts reached')
        }
      }
    } catch (err) {
      log('Connection error:', err)
      status.value = 'error'
      error.value = err instanceof Error ? err.message : 'Connection failed'
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  function disconnect() {
    log('Disconnecting')
    isManualClose = true
    
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }

    if (ws) {
      ws.close()
      ws = null
    }

    status.value = 'disconnected'
    reconnectAttempts.value = 0
  }

  /**
   * Send a message to the server
   */
  function send(type: string, data?: any) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Cannot send message: not connected')
      return false
    }

    try {
      const message = { type, data, timestamp: new Date().toISOString() }
      ws.send(JSON.stringify(message))
      log('Sent message:', type)
      return true
    } catch (err) {
      console.error('[WebSocket] Failed to send message:', err)
      return false
    }
  }

  /**
   * Register a message handler for a specific message type
   * @param messageType - The message type to listen for, or '*' for all messages
   * @param handler - The handler function to call when a message of this type is received
   * @returns A function to unregister the handler
   */
  function on(messageType: string, handler: (data: any) => void): () => void {
    if (!messageHandlers.has(messageType)) {
      messageHandlers.set(messageType, new Set())
    }
    messageHandlers.get(messageType)!.add(handler)
    log(`Registered handler for message type: ${messageType}`)

    // Return unsubscribe function
    return () => {
      const handlers = messageHandlers.get(messageType)
      if (handlers) {
        handlers.delete(handler)
        log(`Unregistered handler for message type: ${messageType}`)
      }
    }
  }

  /**
   * Subscribe to a channel (send subscribe message to server)
   */
  function subscribe(channel: string) {
    return send('subscribe', { channel })
  }

  /**
   * Unsubscribe from a channel (send unsubscribe message to server)
   */
  function unsubscribe(channel: string) {
    return send('unsubscribe', { channel })
  }

  /**
   * Send a ping message to keep connection alive
   */
  function ping() {
    return send('ping')
  }

  // Cleanup on unmount
  onUnmounted(() => {
    log('Component unmounted, cleaning up')
    disconnect()
  })

  return {
    // State
    status,
    lastMessage,
    error,
    reconnectAttempts,

    // Methods
    connect,
    disconnect,
    send,
    on,
    subscribe,
    unsubscribe,
    ping,

    // Computed
    isConnected: () => status.value === 'connected',
    isConnecting: () => status.value === 'connecting',
    isDisconnected: () => status.value === 'disconnected',
    hasError: () => status.value === 'error',
  }
}

export default useWebSocket
