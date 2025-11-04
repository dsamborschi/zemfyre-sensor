import { WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { URLSearchParams } from 'url';
import { DeviceModel, DeviceMetricsModel, DeviceLogsModel } from '../db/models';
import poolWrapper from '../db/connection';

interface WebSocketClient {
  ws: WebSocket;
  deviceUuid: string | null; // null for global connections (e.g., MQTT stats)
  subscriptions: Set<string>;
  intervals: Map<string, NodeJS.Timeout>;
  serviceName?: string; // For logs channel - which service to stream logs for
}

interface WebSocketMessage {
  type: string;
  deviceUuid?: string;
  channel?: string;
  data?: any;
  timestamp?: string;
  message?: string;
  serviceName?: string; // For logs channel - which service to filter logs by
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, WebSocketClient> = new Map();
  private deviceClients: Map<string, Set<WebSocket>> = new Map();
  private deviceIntervals: Map<string, Map<string, NodeJS.Timeout>> = new Map();
  private globalClients: Set<WebSocket> = new Set(); // Global connections for MQTT stats
  private globalIntervals: Map<string, NodeJS.Timeout> = new Map(); // Global intervals
  private mqttMonitor: any = null; // MQTTMonitorService instance

  setMqttMonitor(monitor: any): void {
    this.mqttMonitor = monitor;
    console.log('[WebSocket] MQTT Monitor instance set');
  }

  initialize(server: HTTPServer): void {
    this.wss = new WebSocketServer({ noServer: true });

    // Handle upgrade requests
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      
      if (url.pathname === '/ws') {
        const deviceUuid = url.searchParams.get('deviceUuid');
        const type = url.searchParams.get('type'); // 'device' or 'global'
        
        // Allow global connections (for MQTT stats) without deviceUuid
        if (!deviceUuid && type !== 'global') {
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          socket.destroy();
          return;
        }

        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          if (type === 'global') {
            this.handleGlobalConnection(ws);
          } else {
            this.handleConnection(ws, deviceUuid!);
          }
        });
      } else {
        socket.destroy();
      }
    });

    console.log('[WebSocket] Server initialized');
  }

  private handleConnection(ws: WebSocket, deviceUuid: string): void {
    console.log(`[WebSocket] Client connected for device: ${deviceUuid}`);
    console.log(`[WebSocket] Total clients: ${this.clients.size + 1}`);

    const client: WebSocketClient = {
      ws,
      deviceUuid,
      subscriptions: new Set(),
      intervals: new Map(),
    };

    this.clients.set(ws, client);

    // Track clients per device
    if (!this.deviceClients.has(deviceUuid)) {
      this.deviceClients.set(deviceUuid, new Set());
    }
    this.deviceClients.get(deviceUuid)!.add(ws);

    // Send welcome message
    this.send(ws, {
      type: 'connected',
      deviceUuid,
      message: 'WebSocket connection established',
    });

    ws.on('message', (data) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        console.log(`[WebSocket] Received message from client:`, message);
        this.handleMessage(client, message);
      } catch (error) {
        console.error('[WebSocket] Failed to parse message:', error);
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(client);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Connection error:', error);
      this.handleDisconnect(client);
    });
  }

  private handleGlobalConnection(ws: WebSocket): void {
    console.log(`[WebSocket] Global client connected (MQTT stats)`);
    console.log(`[WebSocket] Total clients: ${this.clients.size + 1}`);

    const client: WebSocketClient = {
      ws,
      deviceUuid: null, // Global connection
      subscriptions: new Set(),
      intervals: new Map(),
    };

    this.clients.set(ws, client);
    this.globalClients.add(ws);

    // Send welcome message
    this.send(ws, {
      type: 'connected',
      message: 'Global WebSocket connection established (MQTT stats)',
    });

    ws.on('message', (data) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        console.log(`[WebSocket] Received message from global client:`, message);
        this.handleGlobalMessage(client, message);
      } catch (error) {
        console.error('[WebSocket] Failed to parse message:', error);
      }
    });

    ws.on('close', () => {
      this.handleGlobalDisconnect(client);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Global connection error:', error);
      this.handleGlobalDisconnect(client);
    });
  }

  private handleGlobalMessage(client: WebSocketClient, message: WebSocketMessage): void {
    switch (message.type) {
      case 'subscribe':
        if (message.channel) {
          this.handleGlobalSubscribe(client, message.channel);
        }
        break;

      case 'unsubscribe':
        if (message.channel) {
          this.handleGlobalUnsubscribe(client, message.channel);
        }
        break;

      case 'ping':
        this.send(client.ws, { type: 'pong' });
        break;

      default:
        console.warn('[WebSocket] Unknown message type:', message.type);
    }
  }

  private handleGlobalSubscribe(client: WebSocketClient, channel: string): void {
    console.log(`[WebSocket] Global client subscribed to ${channel}`);
    
    client.subscriptions.add(channel);

    // Check if this is the first client subscribing to this global channel
    const hasOtherSubscribers = Array.from(this.globalClients).some(
      ws => ws !== client.ws && this.clients.get(ws)?.subscriptions.has(channel)
    );

    if (!hasOtherSubscribers) {
      this.startGlobalDataStream(channel);
    }

    // Send initial data immediately
    this.sendGlobalChannelData(channel);
  }

  private handleGlobalUnsubscribe(client: WebSocketClient, channel: string): void {
    console.log(`[WebSocket] Global client unsubscribed from ${channel}`);
    
    client.subscriptions.delete(channel);

    // Stop stream if no more clients are subscribed
    const hasOtherSubscribers = Array.from(this.globalClients).some(
      ws => this.clients.get(ws)?.subscriptions.has(channel)
    );

    if (!hasOtherSubscribers) {
      this.stopGlobalDataStream(channel);
    }
  }

  private handleGlobalDisconnect(client: WebSocketClient): void {
    console.log(`[WebSocket] Global client disconnected`);

    this.globalClients.delete(client.ws);
    this.clients.delete(client.ws);

    // Stop streams if no more subscribers
    client.subscriptions.forEach(channel => {
      const hasOtherSubscribers = Array.from(this.globalClients).some(
        ws => this.clients.get(ws)?.subscriptions.has(channel)
      );

      if (!hasOtherSubscribers) {
        this.stopGlobalDataStream(channel);
      }
    });

    console.log(`[WebSocket] Total clients: ${this.clients.size}`);
  }

  private handleMessage(client: WebSocketClient, message: WebSocketMessage): void {
    switch (message.type) {
      case 'subscribe':
        if (message.channel) {
          // For logs channel, store serviceName for filtering
          if (message.channel === 'logs' && message.serviceName) {
            client.serviceName = message.serviceName;
          }
          this.handleSubscribe(client, message.channel);
        }
        break;

      case 'unsubscribe':
        if (message.channel) {
          this.handleUnsubscribe(client, message.channel);
        }
        break;

      case 'ping':
        this.send(client.ws, { type: 'pong' });
        break;

      default:
        console.warn('[WebSocket] Unknown message type:', message.type);
    }
  }

  private handleSubscribe(client: WebSocketClient, channel: string): void {
    console.log(`[WebSocket] Client subscribed to ${channel} for device ${client.deviceUuid}`);
    
    client.subscriptions.add(channel);

    // Check if this is the first client subscribing to this channel for this device
    const deviceClients = this.deviceClients.get(client.deviceUuid);
    const isFirstSubscription = !Array.from(deviceClients || []).some(ws => {
      const otherClient = this.clients.get(ws);
      return otherClient !== client && otherClient?.subscriptions.has(channel);
    });

    // Start data streams if this is the first subscription
    if (isFirstSubscription) {
      this.startDataStream(client.deviceUuid, channel);
    }

    // Send initial data immediately
    this.sendChannelData(client.deviceUuid, channel);

    // Acknowledge subscription
    this.send(client.ws, {
      type: 'subscribed',
      channel,
      deviceUuid: client.deviceUuid,
    });
  }

  private handleUnsubscribe(client: WebSocketClient, channel: string): void {
    console.log(`[WebSocket] Client unsubscribed from ${channel} for device ${client.deviceUuid}`);
    
    client.subscriptions.delete(channel);

    // Check if any other clients are still subscribed to this channel for this device
    const deviceClients = this.deviceClients.get(client.deviceUuid);
    const hasOtherSubscribers = Array.from(deviceClients || []).some(ws => {
      const otherClient = this.clients.get(ws);
      return otherClient?.subscriptions.has(channel);
    });

    // Stop data stream if no more subscribers
    if (!hasOtherSubscribers) {
      this.stopDataStream(client.deviceUuid, channel);
    }

    // Acknowledge unsubscription
    this.send(client.ws, {
      type: 'unsubscribed',
      channel,
      deviceUuid: client.deviceUuid,
    });
  }

  private startDataStream(deviceUuid: string, channel: string): void {
    if (!this.deviceIntervals.has(deviceUuid)) {
      this.deviceIntervals.set(deviceUuid, new Map());
    }

    const intervals = this.deviceIntervals.get(deviceUuid)!;

    // Don't start if already running
    if (intervals.has(channel)) {
      return;
    }

    let intervalTime: number;
    switch (channel) {
      case 'system-info':
        intervalTime = 30000; // 30 seconds
        break;
      case 'processes':
        intervalTime = 60000; // 60 seconds
        break;
      case 'history':
        intervalTime = 30000; // 30 seconds
        break;
      case 'network-interfaces':
        intervalTime = 30000; // 30 seconds
        break;
      case 'logs':
        intervalTime = 2000; // 2 seconds for real-time logs
        break;
      default:
        console.warn(`[WebSocket] Unknown channel: ${channel}`);
        return;
    }

    const interval = setInterval(() => {
      this.sendChannelData(deviceUuid, channel);
    }, intervalTime);

    intervals.set(channel, interval);
    console.log(`[WebSocket] Started ${channel} stream for device ${deviceUuid} (interval: ${intervalTime}ms)`);
  }

  private stopDataStream(deviceUuid: string, channel: string): void {
    const intervals = this.deviceIntervals.get(deviceUuid);
    if (intervals?.has(channel)) {
      clearInterval(intervals.get(channel)!);
      intervals.delete(channel);
      console.log(`[WebSocket] Stopped ${channel} stream for device ${deviceUuid}`);

      // Clean up device intervals map if empty
      if (intervals.size === 0) {
        this.deviceIntervals.delete(deviceUuid);
      }
    }
  }

  private startGlobalDataStream(channel: string): void {
    // Don't start if already running
    if (this.globalIntervals.has(channel)) {
      return;
    }

    let intervalTime: number;
    switch (channel) {
      case 'mqtt-stats':
        intervalTime = 5000; // 5 seconds (same as HTTP polling)
        break;
      case 'mqtt-topics':
        intervalTime = 10000; // 10 seconds
        break;
      default:
        console.warn(`[WebSocket] Unknown global channel: ${channel}`);
        return;
    }

    const interval = setInterval(() => {
      this.sendGlobalChannelData(channel);
    }, intervalTime);

    this.globalIntervals.set(channel, interval);
    console.log(`[WebSocket] Started global ${channel} stream (interval: ${intervalTime}ms)`);
  }

  private stopGlobalDataStream(channel: string): void {
    if (this.globalIntervals.has(channel)) {
      clearInterval(this.globalIntervals.get(channel)!);
      this.globalIntervals.delete(channel);
      console.log(`[WebSocket] Stopped global ${channel} stream`);
    }
  }

  private async sendGlobalChannelData(channel: string): Promise<void> {
    try {
      let data: any;

      switch (channel) {
        case 'mqtt-stats':
          data = await this.fetchMqttStats();
          break;
        case 'mqtt-topics':
          data = await this.fetchMqttTopics();
          break;
        default:
          console.warn(`[WebSocket] Unknown global channel: ${channel}`);
          return;
      }

      if (data) {
        this.broadcastGlobal({
          type: channel,
          data,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error(`[WebSocket] Error fetching ${channel} data:`, error);
    }
  }

  private async fetchMqttStats(): Promise<any> {
    try {
      if (!this.mqttMonitor) {
        return null;
      }

      // Use same logic as HTTP endpoint /api/v1/mqtt-monitor/stats
      const status = this.mqttMonitor.getStatus();
      const metrics = this.mqttMonitor.getMetrics();
      const systemStats = this.mqttMonitor.getSystemStats();
      const topics = this.mqttMonitor.getFlattenedTopics();
      
      // Calculate schema statistics
      const topicsWithSchemas = topics.filter((t: any) => t.schema).length;
      const messageTypeBreakdown = topics.reduce((acc: any, t: any) => {
        if (t.messageType) {
          acc[t.messageType] = (acc[t.messageType] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);
      
      return {
        connected: status.connected,
        broker: status.broker || 'Not configured',
        uptime: status.uptime || 0,
        
        // Real-time metrics - extract current values from nested structure
        messageRate: {
          published: metrics.messageRate?.current?.published || 0,
          received: metrics.messageRate?.current?.received || 0,
          total: (metrics.messageRate?.current?.published || 0) + (metrics.messageRate?.current?.received || 0)
        },
        throughput: {
          inbound: metrics.throughput?.current?.inbound || 0,
          outbound: metrics.throughput?.current?.outbound || 0,
          total: (metrics.throughput?.current?.inbound || 0) + (metrics.throughput?.current?.outbound || 0)
        },
        clients: metrics.clients || 0,
        subscriptions: metrics.subscriptions || 0,
        retainedMessages: metrics.retainedMessages || 0,
        
        // Total messages
        totalMessagesSent: metrics.totalMessagesSent || 0,
        totalMessagesReceived: metrics.totalMessagesReceived || 0,
        
        // Topic statistics
        totalTopics: topics.length,
        topicsWithSchemas,
        schemasDetected: topicsWithSchemas,
        messageTypeBreakdown,
        
        // System stats ($SYS topics)
        systemStats: systemStats || {},
        
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[WebSocket] Error fetching MQTT stats:', error);
      return null;
    }
  }

  private async fetchMqttTopics(): Promise<any> {
    try {
      if (!this.mqttMonitor) {
        return null;
      }

      // Use same logic as HTTP endpoint /api/v1/mqtt-monitor/topics
      const topics = this.mqttMonitor.getFlattenedTopics();
      
      return {
        topics,
        count: topics.length,
      };
    } catch (error) {
      console.error('[WebSocket] Error fetching MQTT topics:', error);
      return null;
    }
  }

  private broadcastGlobal(message: WebSocketMessage): void {
    this.globalClients.forEach(ws => {
      const client = this.clients.get(ws);
      if (client && message.type && client.subscriptions.has(message.type)) {
        this.send(ws, message);
      }
    });
  }

  private async sendChannelData(deviceUuid: string, channel: string): Promise<void> {
    try {
      let data: any;

      // For logs channel, send data to each client individually based on their serviceName filter
      if (channel === 'logs') {
        const deviceClients = this.deviceClients.get(deviceUuid);
        if (deviceClients) {
          for (const ws of deviceClients) {
            const client = this.clients.get(ws);
            if (client?.subscriptions.has('logs')) {
              const logsData = await this.fetchLogs(deviceUuid, client.serviceName);
              if (logsData) {
                this.send(ws, {
                  type: 'logs',
                  deviceUuid,
                  data: logsData,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          }
        }
        return;
      }

      // For other channels, fetch once and broadcast to all
      switch (channel) {
        case 'system-info':
          data = await this.fetchSystemInfo(deviceUuid);
          break;
        case 'processes':
          data = await this.fetchProcesses(deviceUuid);
          break;
        case 'history':
          data = await this.fetchMetricsHistory(deviceUuid);
          break;
        case 'network-interfaces':
          data = await this.fetchNetworkInterfaces(deviceUuid);
          break;
        default:
          console.warn(`[WebSocket] Unknown channel: ${channel}`);
          return;
      }

      if (data) {
        this.broadcast(deviceUuid, {
          type: channel,
          deviceUuid,
          data,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error(`[WebSocket] Error fetching ${channel} data:`, error);
    }
  }

  private async fetchSystemInfo(deviceUuid: string): Promise<any> {
    try {
      const device = await DeviceModel.getByUuid(deviceUuid);
      if (!device) return null;

      return {
        os: device.os_version || 'Unknown',
        architecture: 'Unknown', // Not stored in DB yet
        uptime: 0, // Not stored in DB yet
        hostname: device.device_name || 'Unknown',
        ipAddress: device.ip_address || 'Unknown',
        macAddress: device.mac_address || 'Unknown',
      };
    } catch (error) {
      console.error('[WebSocket] Error fetching system info:', error);
      return null;
    }
  }

  private async fetchProcesses(deviceUuid: string): Promise<any> {
    try {
      const device = await DeviceModel.getByUuid(deviceUuid);
      if (!device) return null;

      return {
        top_processes: device.top_processes || [],
      };
    } catch (error) {
      console.error('[WebSocket] Error fetching processes:', error);
      return null;
    }
  }

  private async fetchMetricsHistory(deviceUuid: string): Promise<any> {
    try {
      // Use same model as HTTP endpoint /api/v1/devices/:uuid/metrics for consistency
      const metrics = await DeviceMetricsModel.getRecent(deviceUuid, 30);

      console.log(`[WebSocket] Fetched ${metrics.length} metrics rows for device ${deviceUuid}`);

      // Transform to dashboard format (same as original App.tsx HTTP polling logic)
      const cpu: Array<{ time: string; value: number }> = [];
      const memory: Array<{ time: string; used: number; available: number }> = [];
      const network: Array<{ time: string; download: number; upload: number }> = [];

      // Reverse to get chronological order (oldest first) - matches original behavior
      const metricsData = metrics.reverse();

      metricsData.forEach((m: any) => {
        const time = new Date(m.recorded_at).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });

        // CPU data
        cpu.push({
          time,
          value: Math.round(parseFloat(m.cpu_usage) || 0),
        });

        // Memory data (convert bytes to MB) - matches original App.tsx logic
        const memoryUsageMB = Math.round((parseFloat(m.memory_usage) || 0) / 1024 / 1024);
        const memoryTotalMB = (parseFloat(m.memory_total) || 0) / 1024 / 1024;
        const memoryAvailableMB = Math.round(memoryTotalMB - memoryUsageMB);
        
        memory.push({
          time,
          used: memoryUsageMB,
          available: memoryAvailableMB,
        });

        // Network history - placeholder for now since network metrics aren't stored yet
        // This matches the original App.tsx behavior
        network.push({
          time,
          download: 0,
          upload: 0,
        });
      });

      return { cpu, memory, network };
    } catch (error) {
      console.error('[WebSocket] Error fetching metrics history:', error);
      return null;
    }
  }

  private async fetchNetworkInterfaces(deviceUuid: string): Promise<any> {
    try {
      // Use same logic as HTTP endpoint /api/v1/devices/:uuid/network-interfaces
      const device = await DeviceModel.getByUuid(deviceUuid);
      if (!device) return null;

      let interfaces = [];
      
      if (device.network_interfaces) {
        // Parse if it's a string, otherwise use as-is
        const networkData = typeof device.network_interfaces === 'string' 
          ? JSON.parse(device.network_interfaces) 
          : device.network_interfaces;
        
        // Transform to dashboard format (matches HTTP endpoint exactly)
        interfaces = networkData.map((iface: any) => ({
          id: iface.name,
          name: iface.name,
          type: iface.type || 'ethernet',
          ipAddress: iface.ip4,
          ip4: iface.ip4,
          ip6: iface.ip6,
          mac: iface.mac,
          status: iface.operstate === 'up' ? 'connected' : 'disconnected',
          operstate: iface.operstate,
          default: iface.default,
          virtual: iface.virtual,
          // WiFi specific fields
          ...(iface.ssid && { ssid: iface.ssid }),
          ...(iface.signalLevel && { signal: iface.signalLevel }),
        }));
      } else if (device.ip_address) {
        // Fallback: Create a default interface based on device IP (matches HTTP endpoint)
        interfaces.push({
          id: 'eth0',
          name: 'eth0',
          type: 'ethernet',
          ipAddress: device.ip_address,
          ip4: device.ip_address,
          status: device.is_online ? 'connected' : 'disconnected',
          default: true,
          operstate: device.is_online ? 'up' : 'down',
        });
      }

      return { interfaces };
    } catch (error) {
      console.error('[WebSocket] Error fetching network interfaces:', error);
      return null;
    }
  }

  private async fetchLogs(deviceUuid: string, serviceName?: string): Promise<any> {
    try {
      // Fetch latest logs (limit to 50 per poll to avoid overwhelming the client)
      const logs = await DeviceLogsModel.get(deviceUuid, {
        serviceName,
        limit: 50,
        offset: 0,
      });

      console.log(`[WebSocket] Fetched ${logs.length} log entries for device ${deviceUuid}${serviceName ? ` service ${serviceName}` : ''}`);

      return { logs };
    } catch (error) {
      console.error('[WebSocket] Error fetching logs:', error);
      return null;
    }
  }

  private handleDisconnect(client: WebSocketClient): void {
    console.log(`[WebSocket] Client disconnected from device: ${client.deviceUuid}`);

    // Remove from device clients
    const deviceClients = this.deviceClients.get(client.deviceUuid);
    if (deviceClients) {
      deviceClients.delete(client.ws);
      
      // For each subscription, check if we should stop the stream
      client.subscriptions.forEach(channel => {
        const hasOtherSubscribers = Array.from(deviceClients).some(ws => {
          const otherClient = this.clients.get(ws);
          return otherClient?.subscriptions.has(channel);
        });

        if (!hasOtherSubscribers) {
          this.stopDataStream(client.deviceUuid, channel);
        }
      });

      // Clean up device clients map if empty
      if (deviceClients.size === 0) {
        this.deviceClients.delete(client.deviceUuid);
      }
    }

    // Clean up client intervals
    client.intervals.forEach(interval => clearInterval(interval));
    client.intervals.clear();

    // Remove from clients map
    this.clients.delete(client.ws);
  }

  private broadcast(deviceUuid: string, message: WebSocketMessage): void {
    const deviceClients = this.deviceClients.get(deviceUuid);
    if (!deviceClients) return;

    const channel = message.type;
    let sentCount = 0;

    deviceClients.forEach(ws => {
      const client = this.clients.get(ws);
      if (client?.subscriptions.has(channel) && ws.readyState === WebSocket.OPEN) {
        this.send(ws, message);
        sentCount++;
      }
    });

    if (sentCount > 0) {
      console.log(`[WebSocket] Broadcasted ${channel} to ${sentCount} client(s) for device ${deviceUuid}`);
    }
  }

  private send(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  shutdown(): void {
    console.log('[WebSocket] Shutting down...');

    // Clear all intervals
    this.deviceIntervals.forEach((intervals) => {
      intervals.forEach(interval => clearInterval(interval));
    });
    this.deviceIntervals.clear();

    // Close all connections
    this.clients.forEach((client) => {
      client.ws.close();
    });

    this.clients.clear();
    this.deviceClients.clear();

    if (this.wss) {
      this.wss.close();
    }

    console.log('[WebSocket] Shutdown complete');
  }
}

export const websocketManager = new WebSocketManager();
