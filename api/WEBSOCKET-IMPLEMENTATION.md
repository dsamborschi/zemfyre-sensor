# WebSocket API Implementation Guide

This file contains the code you need to add to your API server to support real-time WebSocket connections for device metrics.

## Required Dependencies

Add to `api/package.json`:
```json
{
  "dependencies": {
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.10"
  }
}
```

Run: `npm install`

## 1. Create WebSocket Manager Service

Create: `api/src/services/websocket-manager.ts`

```typescript
import { WebSocket, WebSocketServer } from 'ws';
import { Server as HTTPServer } from 'http';
import { parse as parseUrl } from 'url';
import { knex } from '../database';

interface DeviceClient {
  ws: WebSocket;
  deviceUuid: string;
  subscriptions: Set<string>;
  lastActivity: number;
}

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, DeviceClient> = new Map();
  private deviceClients: Map<string, Set<WebSocket>> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  initialize(server: HTTPServer) {
    this.wss = new WebSocketServer({ 
      noServer: true,
      path: '/api/v1/devices/:uuid/ws'
    });

    // Handle HTTP upgrade requests
    server.on('upgrade', (request, socket, head) => {
      const { pathname } = parseUrl(request.url || '', true);
      
      // Extract device UUID from path: /api/v1/devices/{uuid}/ws
      const match = pathname?.match(/\/api\/v1\/devices\/([^/]+)\/ws/);
      
      if (match && match[1]) {
        const deviceUuid = match[1];
        
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.handleConnection(ws, deviceUuid);
        });
      } else {
        socket.destroy();
      }
    });

    console.log('[WebSocket] Manager initialized');
  }

  private handleConnection(ws: WebSocket, deviceUuid: string) {
    console.log(`[WebSocket] Client connected to device: ${deviceUuid}`);

    const client: DeviceClient = {
      ws,
      deviceUuid,
      subscriptions: new Set(),
      lastActivity: Date.now(),
    };

    this.clients.set(ws, client);
    
    // Track device clients
    if (!this.deviceClients.has(deviceUuid)) {
      this.deviceClients.set(deviceUuid, new Set());
    }
    this.deviceClients.get(deviceUuid)!.add(ws);

    // Handle messages from client
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(client, message);
      } catch (error) {
        console.error('[WebSocket] Error parsing message:', error);
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      console.log(`[WebSocket] Client disconnected from device: ${deviceUuid}`);
      this.handleDisconnect(ws, client);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
    });

    // Send initial connection confirmation
    this.send(ws, {
      type: 'connected',
      data: { deviceUuid, timestamp: new Date().toISOString() }
    });
  }

  private handleMessage(client: DeviceClient, message: any) {
    client.lastActivity = Date.now();

    switch (message.type) {
      case 'subscribe':
        if (Array.isArray(message.channels)) {
          message.channels.forEach((channel: string) => {
            client.subscriptions.add(channel);
            console.log(`[WebSocket] Client subscribed to: ${channel} for device ${client.deviceUuid}`);
          });
          
          // Start sending data for subscribed channels
          this.startDataStreams(client);
        }
        break;

      case 'unsubscribe':
        if (Array.isArray(message.channels)) {
          message.channels.forEach((channel: string) => {
            client.subscriptions.delete(channel);
            console.log(`[WebSocket] Client unsubscribed from: ${channel}`);
          });
        }
        break;

      case 'ping':
        this.send(client.ws, { type: 'pong', data: { timestamp: new Date().toISOString() } });
        break;
    }
  }

  private async startDataStreams(client: DeviceClient) {
    const { deviceUuid, subscriptions } = client;

    // System Info - every 30 seconds
    if (subscriptions.has('system-info')) {
      this.sendSystemInfo(client);
      const intervalKey = `${deviceUuid}-system-info`;
      if (!this.intervals.has(intervalKey)) {
        const interval = setInterval(() => this.sendSystemInfo(client), 30000);
        this.intervals.set(intervalKey, interval);
      }
    }

    // Processes - every 60 seconds
    if (subscriptions.has('processes')) {
      this.sendProcesses(client);
      const intervalKey = `${deviceUuid}-processes`;
      if (!this.intervals.has(intervalKey)) {
        const interval = setInterval(() => this.sendProcesses(client), 60000);
        this.intervals.set(intervalKey, interval);
      }
    }

    // Metrics History - every 30 seconds
    if (subscriptions.has('history')) {
      this.sendMetricsHistory(client);
      const intervalKey = `${deviceUuid}-history`;
      if (!this.intervals.has(intervalKey)) {
        const interval = setInterval(() => this.sendMetricsHistory(client), 30000);
        this.intervals.set(intervalKey, interval);
      }
    }

    // Network Interfaces - every 30 seconds
    if (subscriptions.has('network-interfaces')) {
      this.sendNetworkInterfaces(client);
      const intervalKey = `${deviceUuid}-network-interfaces`;
      if (!this.intervals.has(intervalKey)) {
        const interval = setInterval(() => this.sendNetworkInterfaces(client), 30000);
        this.intervals.set(intervalKey, interval);
      }
    }
  }

  private async sendSystemInfo(client: DeviceClient) {
    try {
      const result = await knex('device_state_records')
        .where({ device_uuid: client.deviceUuid })
        .orderBy('recorded_at', 'desc')
        .first();

      if (result) {
        this.send(client.ws, {
          type: 'system-info',
          data: {
            os: result.os_version,
            architecture: result.architecture,
            uptime: result.uptime,
            hostname: result.hostname,
            ipAddress: result.ip_address,
            macAddress: result.mac_address,
          }
        });
      }
    } catch (error) {
      console.error('[WebSocket] Error fetching system info:', error);
    }
  }

  private async sendProcesses(client: DeviceClient) {
    try {
      const result = await knex('device_state_records')
        .where({ device_uuid: client.deviceUuid })
        .orderBy('recorded_at', 'desc')
        .first();

      if (result?.top_processes) {
        this.send(client.ws, {
          type: 'processes',
          data: {
            top_processes: result.top_processes
          }
        });
      }
    } catch (error) {
      console.error('[WebSocket] Error fetching processes:', error);
    }
  }

  private async sendMetricsHistory(client: DeviceClient) {
    try {
      const metrics = await knex('device_metrics')
        .where({ device_uuid: client.deviceUuid })
        .orderBy('recorded_at', 'desc')
        .limit(30);

      if (metrics.length > 0) {
        const reversed = metrics.reverse();
        
        const cpuData = reversed.map(m => ({
          time: new Date(m.recorded_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          value: Math.round(parseFloat(m.cpu_usage) || 0)
        }));

        const memData = reversed.map(m => ({
          time: new Date(m.recorded_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          used: Math.round((parseFloat(m.memory_usage) || 0) / 1024 / 1024),
          available: Math.round(((parseFloat(m.memory_total) || 0) - (parseFloat(m.memory_usage) || 0)) / 1024 / 1024)
        }));

        const netData = reversed.map(m => ({
          time: new Date(m.recorded_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          download: m.network_rx || 0,
          upload: m.network_tx || 0
        }));

        this.send(client.ws, {
          type: 'history',
          data: {
            cpu: cpuData,
            memory: memData,
            network: netData
          }
        });
      }
    } catch (error) {
      console.error('[WebSocket] Error fetching metrics history:', error);
    }
  }

  private async sendNetworkInterfaces(client: DeviceClient) {
    try {
      const result = await knex('device_state_records')
        .where({ device_uuid: client.deviceUuid })
        .orderBy('recorded_at', 'desc')
        .first();

      if (result?.network_interfaces) {
        this.send(client.ws, {
          type: 'network-interfaces',
          data: {
            interfaces: result.network_interfaces
          }
        });
      }
    } catch (error) {
      console.error('[WebSocket] Error fetching network interfaces:', error);
    }
  }

  private handleDisconnect(ws: WebSocket, client: DeviceClient) {
    // Remove from clients map
    this.clients.delete(ws);

    // Remove from device clients
    const deviceSet = this.deviceClients.get(client.deviceUuid);
    if (deviceSet) {
      deviceSet.delete(ws);
      if (deviceSet.size === 0) {
        this.deviceClients.delete(client.deviceUuid);
        
        // Clear intervals for this device
        ['system-info', 'processes', 'history', 'network-interfaces'].forEach(channel => {
          const intervalKey = `${client.deviceUuid}-${channel}`;
          const interval = this.intervals.get(intervalKey);
          if (interval) {
            clearInterval(interval);
            this.intervals.delete(intervalKey);
          }
        });
      }
    }
  }

  private send(ws: WebSocket, message: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // Broadcast to all clients of a specific device
  broadcast(deviceUuid: string, message: any) {
    const clients = this.deviceClients.get(deviceUuid);
    if (clients) {
      clients.forEach(ws => {
        this.send(ws, message);
      });
    }
  }

  // Get count of connected clients
  getClientCount(deviceUuid?: string): number {
    if (deviceUuid) {
      return this.deviceClients.get(deviceUuid)?.size || 0;
    }
    return this.clients.size;
  }
}

export const websocketManager = new WebSocketManager();
```

## 2. Initialize WebSocket Server

Update: `api/src/index.ts` or `api/src/server.ts`

```typescript
import { websocketManager } from './services/websocket-manager';

// After creating your Express app and HTTP server
const app = express();
const server = createServer(app);

// Initialize WebSocket manager
websocketManager.initialize(server);

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/api/v1/devices/:uuid/ws`);
});
```

## 3. Testing WebSocket Connection

You can test the WebSocket endpoint using:

```javascript
// In browser console or Node.js
const ws = new WebSocket('ws://localhost:4002/api/v1/devices/YOUR-DEVICE-UUID/ws');

ws.onopen = () => {
  console.log('Connected!');
  
  // Subscribe to channels
  ws.send(JSON.stringify({
    type: 'subscribe',
    channels: ['metrics', 'processes', 'system-info', 'history', 'network-interfaces']
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

ws.onerror = (error) => {
  console.error('Error:', error);
};

ws.onclose = () => {
  console.log('Disconnected');
};
```

## Benefits of WebSocket Implementation

✅ **Real-time Updates**: Instant data push from server to client
✅ **Reduced HTTP Overhead**: Single persistent connection vs multiple polling requests
✅ **Lower Latency**: No HTTP request/response roundtrips
✅ **Server Efficiency**: Push updates only when data changes
✅ **Auto-reconnection**: Client automatically reconnects on disconnect
✅ **Subscription Model**: Clients only receive data they subscribe to

## Message Types

### Client → Server
- `subscribe`: Subscribe to channels (metrics, processes, etc.)
- `unsubscribe`: Unsubscribe from channels
- `ping`: Heartbeat check

### Server → Client
- `connected`: Connection established
- `system-info`: OS, architecture, uptime data
- `processes`: Top processes list
- `history`: CPU, memory, network historical data
- `network-interfaces`: Network interface status
- `pong`: Heartbeat response

## Notes

- Each device UUID gets its own WebSocket endpoint
- Multiple dashboard users can connect to the same device
- Intervals are shared per device (not per client) for efficiency
- Auto-cleanup when all clients disconnect from a device
- Data refresh rates: system-info (30s), processes (60s), history (30s), network-interfaces (30s)
