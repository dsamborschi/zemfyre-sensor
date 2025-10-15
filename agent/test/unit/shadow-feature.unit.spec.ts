/**
 * Unit tests for Shadow Feature
 */

import { ShadowFeature } from '../../src/shadow/shadow-feature';
import { ShadowConfig, MqttConnection, Logger } from '../../src/shadow/types';
import { EventEmitter } from 'events';

// Mock MQTT Connection
class MockMqttConnection extends EventEmitter implements MqttConnection {
  private subscriptions: Map<string, (topic: string, payload: Buffer) => void> = new Map();
  public publishedMessages: Array<{ topic: string; payload: string; qos?: number }> = [];
  
  async publish(topic: string, payload: string | Buffer, qos?: 0 | 1 | 2): Promise<void> {
    this.publishedMessages.push({
      topic,
      payload: payload.toString(),
      qos
    });
  }
  
  async subscribe(
    topic: string,
    qos?: 0 | 1 | 2,
    handler?: (topic: string, payload: Buffer) => void
  ): Promise<void> {
    if (handler) {
      this.subscriptions.set(topic, handler);
    }
  }
  
  async unsubscribe(topic: string): Promise<void> {
    this.subscriptions.delete(topic);
  }
  
  isConnected(): boolean {
    return true;
  }
  
  // Test helper to simulate incoming message
  simulateMessage(topic: string, payload: Record<string, any>): void {
    const handler = this.subscriptions.get(topic);
    if (handler) {
      handler(topic, Buffer.from(JSON.stringify(payload)));
    }
  }
}

// Mock Logger
class MockLogger implements Logger {
  debug = jest.fn();
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

describe('ShadowFeature', () => {
  let shadowFeature: ShadowFeature;
  let mockMqtt: MockMqttConnection;
  let mockLogger: MockLogger;
  let config: ShadowConfig;
  const deviceUuid = 'test-device-uuid-001';

  beforeEach(() => {
    mockMqtt = new MockMqttConnection();
    mockLogger = new MockLogger();
    
    config = {
      enabled: true,
      shadowName: 'test-shadow',
      syncOnDelta: true,
      enableFileMonitor: false,
    };
    
    shadowFeature = new ShadowFeature(
      config,
      mockMqtt,
      mockLogger,
      deviceUuid
    );
  });

  afterEach(async () => {
    if (shadowFeature) {
      await shadowFeature.stop();
    }
  });

  describe('initialization', () => {
    it('should create shadow feature with valid config', () => {
      expect(shadowFeature).toBeDefined();
      expect(shadowFeature.getName()).toBe('Shadow');
    });

    it('should throw error for invalid config (missing shadow name)', () => {
      const invalidConfig = { ...config, shadowName: '' };
      
      expect(() => {
        new ShadowFeature(invalidConfig, mockMqtt, mockLogger, deviceUuid);
      }).toThrow('Shadow name is required');
    });

    it('should throw error for invalid publish interval', () => {
      const invalidConfig = { ...config, publishInterval: 500 }; // Less than 1000ms
      
      expect(() => {
        new ShadowFeature(invalidConfig, mockMqtt, mockLogger, deviceUuid);
      }).toThrow('Publish interval must be at least 1000ms');
    });
  });

  describe('start and stop', () => {
    it('should subscribe to shadow topics on start', async () => {
      await shadowFeature.start();
      
      // Check that update topic was published (default shadow data)
      const updateMessages = mockMqtt.publishedMessages.filter(
        m => m.topic.includes('/update') && !m.topic.includes('/accepted') && !m.topic.includes('/rejected')
      );
      
      expect(updateMessages.length).toBeGreaterThan(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Shadow feature started successfully')
      );
    });

    it('should emit started event', async () => {
      const startedHandler = jest.fn();
      shadowFeature.on('started', startedHandler);
      
      await shadowFeature.start();
      
      expect(startedHandler).toHaveBeenCalled();
    });

    it('should unsubscribe and stop cleanly', async () => {
      await shadowFeature.start();
      await shadowFeature.stop();
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Shadow feature stopped successfully')
      );
    });

    it('should emit stopped event', async () => {
      const stoppedHandler = jest.fn();
      shadowFeature.on('stopped', stoppedHandler);
      
      await shadowFeature.start();
      await shadowFeature.stop();
      
      expect(stoppedHandler).toHaveBeenCalled();
    });
  });

  describe('shadow updates', () => {
    beforeEach(async () => {
      await shadowFeature.start();
      mockMqtt.publishedMessages = []; // Clear initial messages
    });

    it('should publish shadow update with reported state', async () => {
      const state = { temperature: 25.5, humidity: 60 };
      
      await shadowFeature.updateShadow(state, true);
      
      const updateMessage = mockMqtt.publishedMessages.find(
        m => m.topic === `$iot/device/${deviceUuid}/shadow/name/${config.shadowName}/update`
      );
      
      expect(updateMessage).toBeDefined();
      const payload = JSON.parse(updateMessage!.payload);
      expect(payload.state.reported).toEqual(state);
      expect(payload.clientToken).toBeDefined();
    });

    it('should publish shadow update with desired state', async () => {
      const state = { mode: 'eco' };
      
      await shadowFeature.updateShadow(state, false);
      
      const updateMessage = mockMqtt.publishedMessages.find(
        m => m.topic === `$iot/device/${deviceUuid}/shadow/name/${config.shadowName}/update`
      );
      
      expect(updateMessage).toBeDefined();
      const payload = JSON.parse(updateMessage!.payload);
      expect(payload.state.desired).toEqual(state);
    });

    it('should handle update accepted response', async () => {
      const acceptedHandler = jest.fn();
      shadowFeature.on('update-accepted', acceptedHandler);
      
      const response = {
        state: { reported: { temperature: 25.5 } },
        version: 1,
        clientToken: 'test-token'
      };
      
      mockMqtt.simulateMessage(
        `$iot/device/${deviceUuid}/shadow/name/${config.shadowName}/update/accepted`,
        response
      );
      
      expect(acceptedHandler).toHaveBeenCalledWith(response);
      
      const stats = shadowFeature.getStats();
      expect(stats.updatesAccepted).toBe(1);
    });

    it('should handle update rejected response', async () => {
      const rejectedHandler = jest.fn();
      shadowFeature.on('update-rejected', rejectedHandler);
      
      const errorResponse = {
        code: 400,
        message: 'Invalid request',
        clientToken: 'test-token'
      };
      
      mockMqtt.simulateMessage(
        `$iot/device/${deviceUuid}/shadow/name/${config.shadowName}/update/rejected`,
        errorResponse
      );
      
      expect(rejectedHandler).toHaveBeenCalledWith(errorResponse);
      
      const stats = shadowFeature.getStats();
      expect(stats.updatesRejected).toBe(1);
      expect(stats.lastErrorCode).toBe(400);
      expect(stats.lastErrorMessage).toBe('Invalid request');
    });
  });

  describe('delta handling', () => {
    beforeEach(async () => {
      await shadowFeature.start();
      mockMqtt.publishedMessages = []; // Clear initial messages
    });

    it('should handle delta event', async () => {
      const deltaHandler = jest.fn();
      shadowFeature.on('delta-updated', deltaHandler);
      
      const deltaEvent = {
        state: { mode: 'eco', targetTemp: 22 },
        version: 2,
        clientToken: 'test-token'
      };
      
      mockMqtt.simulateMessage(
        `$iot/device/${deviceUuid}/shadow/name/${config.shadowName}/update/delta`,
        deltaEvent
      );
      
      expect(deltaHandler).toHaveBeenCalledWith(deltaEvent);
      
      const stats = shadowFeature.getStats();
      expect(stats.deltaEventsReceived).toBe(1);
    });

    it('should auto-sync on delta when enabled', async () => {
      const deltaEvent = {
        state: { mode: 'eco' },
        version: 2
      };
      
      mockMqtt.simulateMessage(
        `$iot/device/${deviceUuid}/shadow/name/${config.shadowName}/update/delta`,
        deltaEvent
      );
      
      // Wait a tick for async processing
      await new Promise(resolve => setImmediate(resolve));
      
      // Should publish update with reported state matching delta
      const updateMessage = mockMqtt.publishedMessages.find(
        m => m.topic === `$iot/device/${deviceUuid}/shadow/name/${config.shadowName}/update`
      );
      
      expect(updateMessage).toBeDefined();
      const payload = JSON.parse(updateMessage!.payload);
      expect(payload.state.reported).toEqual(deltaEvent.state);
    });

    it('should not auto-sync when disabled', async () => {
      // Create new feature with syncOnDelta disabled
      const noSyncConfig = { ...config, syncOnDelta: false };
      const noSyncShadow = new ShadowFeature(
        noSyncConfig,
        mockMqtt,
        mockLogger,
        deviceUuid
      );
      
      await noSyncShadow.start();
      mockMqtt.publishedMessages = []; // Clear initial messages
      
      const deltaEvent = {
        state: { mode: 'eco' },
        version: 2
      };
      
      mockMqtt.simulateMessage(
        `$iot/device/${deviceUuid}/shadow/name/${config.shadowName}/update/delta`,
        deltaEvent
      );
      
      // Wait a tick
      await new Promise(resolve => setImmediate(resolve));
      
      // Should NOT publish update
      const updateMessages = mockMqtt.publishedMessages.filter(
        m => m.topic === `$iot/device/${deviceUuid}/shadow/name/${config.shadowName}/update`
      );
      
      expect(updateMessages.length).toBe(0);
      
      await noSyncShadow.stop();
    });
  });

  describe('get shadow', () => {
    beforeEach(async () => {
      await shadowFeature.start();
      mockMqtt.publishedMessages = []; // Clear initial messages
    });

    it('should publish get shadow request', async () => {
      await shadowFeature.getShadow();
      
      const getMessage = mockMqtt.publishedMessages.find(
        m => m.topic === `$iot/device/${deviceUuid}/shadow/name/${config.shadowName}/get`
      );
      
      expect(getMessage).toBeDefined();
      const payload = JSON.parse(getMessage!.payload);
      expect(payload.clientToken).toBeDefined();
      
      const stats = shadowFeature.getStats();
      expect(stats.getRequestsSent).toBe(1);
    });

    it('should handle get accepted response', async () => {
      const acceptedHandler = jest.fn();
      shadowFeature.on('get-accepted', acceptedHandler);
      
      const document = {
        state: {
          desired: { mode: 'eco' },
          reported: { mode: 'normal' }
        },
        version: 5
      };
      
      mockMqtt.simulateMessage(
        `$iot/device/${deviceUuid}/shadow/name/${config.shadowName}/get/accepted`,
        document
      );
      
      expect(acceptedHandler).toHaveBeenCalledWith(document);
    });

    it('should handle get rejected response', async () => {
      const rejectedHandler = jest.fn();
      shadowFeature.on('get-rejected', rejectedHandler);
      
      const errorResponse = {
        code: 404,
        message: 'Shadow not found'
      };
      
      mockMqtt.simulateMessage(
        `$iot/device/${deviceUuid}/shadow/name/${config.shadowName}/get/rejected`,
        errorResponse
      );
      
      expect(rejectedHandler).toHaveBeenCalledWith(errorResponse);
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await shadowFeature.start();
    });

    it('should track statistics correctly', async () => {
      // Publish update
      await shadowFeature.updateShadow({ temp: 25 });
      
      // Simulate accepted
      mockMqtt.simulateMessage(
        `$iot/device/${deviceUuid}/shadow/name/${config.shadowName}/update/accepted`,
        { version: 1 }
      );
      
      // Simulate delta
      mockMqtt.simulateMessage(
        `$iot/device/${deviceUuid}/shadow/name/${config.shadowName}/update/delta`,
        { state: { temp: 26 }, version: 2 }
      );
      
      const stats = shadowFeature.getStats();
      expect(stats.updatesPublished).toBeGreaterThan(0);
      expect(stats.updatesAccepted).toBe(1);
      expect(stats.deltaEventsReceived).toBe(1);
      expect(stats.lastUpdateTime).toBeDefined();
      expect(stats.lastDeltaTime).toBeDefined();
    });
  });
});

