import { useEffect, useCallback } from 'react';
import { websocketService } from '@/services/websocket';

/**
 * Subscribe to WebSocket messages for a specific message type
 * Note: Connection is managed by useWebSocketConnection or useGlobalWebSocketConnection
 * For global subscriptions (MQTT stats, etc.), pass null as deviceUuid
 */
export function useWebSocket<T>(
  deviceUuid: string | null, // Kept for API compatibility, not used in subscription logic
  messageType: string,
  onMessage: (data: T) => void,
  enabled: boolean = true
) {
  const handleMessage = useCallback((data: T) => {
    onMessage(data);
  }, [onMessage]);

  useEffect(() => {
    if (!enabled) return;

    // Subscribe to message type regardless of deviceUuid
    // For global connections, deviceUuid will be null
    // Note: deviceUuid parameter kept for API compatibility with device-specific subscriptions
    const unsubscribe = websocketService.subscribe(messageType, handleMessage);

    // Cleanup on unmount or device change
    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageType, handleMessage, enabled]);
}

/**
 * Manage WebSocket connection lifecycle for a device
 * Should be called once per device at the top-level component
 */
export function useWebSocketConnection(deviceUuid: string | null) {
  useEffect(() => {
    if (!deviceUuid) {
      websocketService.disconnect();
      return;
    }

    // Connect to device
    websocketService.connect(deviceUuid);

    // Cleanup on unmount or device change
    return () => {
      websocketService.disconnect();
    };
  }, [deviceUuid]);
}

/**
 * Manage global WebSocket connection lifecycle (for MQTT stats, etc.)
 * Should be called once at the component that needs global data
 */
export function useGlobalWebSocketConnection() {
  useEffect(() => {
    // Connect to global WebSocket
    websocketService.connectGlobal();

    // Cleanup on unmount
    return () => {
      websocketService.disconnect();
    };
  }, []);
}
