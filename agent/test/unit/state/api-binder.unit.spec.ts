/**
 * Unit Tests for ApiBinder - State Management
 * Tests REAL ApiBinder class with mocked external dependencies
 * 
 * What we test: Real ApiBinder methods (pollTargetState, reportCurrentState, etc.)
 * What we mock: fetch (API calls), ContainerManager, DeviceManager, system-metrics
 */

import { ApiBinder } from '../../../src/api-binder';

// Mock fetch globally
global.fetch = jest.fn();

// Mock system-metrics module
jest.mock('../../../src/system-metrics', () => ({
  getSystemMetrics: jest.fn().mockResolvedValue({
    cpu_usage: 45.2,
    memory_usage: 2048,
    memory_total: 4096,
    uptime: 86400,
    network_interfaces: [],
  }),
}));

describe('ApiBinder - State Management (Real Code)', () => {
  let apiBinder: ApiBinder;
  let mockContainerManager: any;
  let mockDeviceManager: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock ContainerManager
    mockContainerManager = {
      setTarget: jest.fn().mockResolvedValue(undefined),
      getCurrentState: jest.fn().mockResolvedValue({
        apps: { 1: { appId: 1, appName: 'mosquitto', services: [] } },
        config: { mqtt: { broker: 'localhost' } },
      }),
      getTargetState: jest.fn().mockReturnValue({
        apps: {},
        config: {},
      }),
      on: jest.fn(),
    };
    
    // Mock DeviceManager
    mockDeviceManager = {
      getDeviceInfo: jest.fn().mockReturnValue({
        uuid: 'test-device-uuid-1234',
        provisioned: true,
        osVersion: '11.0',
        agentVersion: '1.0.0',
      }),
    };

    // Create REAL ApiBinder instance
    apiBinder = new ApiBinder(
      mockContainerManager,
      mockDeviceManager,
      {
        cloudApiEndpoint: 'http://localhost:4002',
        pollInterval: 60000,
        reportInterval: 10000,
        metricsInterval: 300000,
        apiTimeout: 30000,
      }
    );
  });

  describe('getTargetState() - Public Method', () => {
    it('should return current target state', () => {
      const state = apiBinder.getTargetState();
      
      expect(state).toBeDefined();
      expect(state.apps).toBeDefined();
    });
  });

  describe('Target State Polling - Internal Logic', () => {
    it('should fetch new target state with config from API', async () => {
      // Arrange
      const mockResponse = {
        'test-device-uuid-1234': {
          apps: {
            '1': { appId: 1, appName: 'mosquitto' },
          },
          config: {
            mqtt: { broker: 'localhost', port: 1883 },
            features: { enableCloudJobs: true },
          },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name === 'etag' ? 'new-etag-123' : null),
        },
        json: async () => mockResponse,
      });

      // Act - Call private method via type casting (for testing only)
      await (apiBinder as any).pollTargetState();

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4002/api/v1/device/test-device-uuid-1234/state',
        expect.objectContaining({
          headers: expect.any(Object),
        })
      );
      
      expect(mockContainerManager.setTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          apps: mockResponse['test-device-uuid-1234'].apps,
          config: mockResponse['test-device-uuid-1234'].config,
        })
      );
    });

    it('should handle 304 Not Modified (no state change)', async () => {
      // Arrange - Simulate existing ETag
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 304,
        headers: { get: () => null },
      });

      // Act
      await (apiBinder as any).pollTargetState();

      // Assert - setTarget should NOT be called on 304
      expect(mockContainerManager.setTarget).not.toHaveBeenCalled();
    });

    it('should handle empty target state', async () => {
      // Arrange
      const mockResponse = {
        'test-device-uuid-1234': {
          apps: {},
          config: {},
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name === 'etag' ? 'empty-etag' : null),
        },
        json: async () => mockResponse,
      });

      // Act
      await (apiBinder as any).pollTargetState();

      // Assert
      expect(mockContainerManager.setTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          apps: {},
          config: {},
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      // Arrange
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      // Act & Assert - Should throw error
      await expect((apiBinder as any).pollTargetState()).rejects.toThrow(
        'Network error'
      );
    });

    it('should send If-None-Match header with existing ETag', async () => {
      // Arrange - Set existing ETag
      (apiBinder as any).targetStateETag = 'existing-etag-456';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 304,
        headers: { get: () => null },
      });

      // Act
      await (apiBinder as any).pollTargetState();

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'if-none-match': 'existing-etag-456',
          }),
        })
      );
    });
  });

  describe('Current State Reporting - Internal Logic', () => {
    it('should report current state with apps and config', async () => {
      // Arrange
      mockDeviceManager.getDeviceInfo.mockReturnValue({
        uuid: 'test-device-uuid-1234',
        provisioned: true,
        osVersion: '11.0',
        agentVersion: '1.0.0',
      });

      mockContainerManager.getCurrentState.mockResolvedValueOnce({
        apps: {
          1: { appId: 1, appName: 'mosquitto', services: [] },
        },
        config: {
          mqtt: { broker: 'localhost' },
          features: { enableCloudJobs: true },
        },
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      });

      // Force report time to be old enough
      (apiBinder as any).lastReportTime = 0;

      // Act
      await (apiBinder as any).reportCurrentState();

      // Assert
      expect(mockContainerManager.getCurrentState).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4002/api/v1/device/state',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      // Verify config was included in request body
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      expect(requestBody['test-device-uuid-1234'].config).toEqual({
        mqtt: { broker: 'localhost' },
        features: { enableCloudJobs: true },
      });
      expect(requestBody['test-device-uuid-1234'].apps).toBeDefined();
    });

    it('should not report if device is not provisioned', async () => {
      // Arrange
      mockDeviceManager.getDeviceInfo.mockReturnValue({
        uuid: 'test-device-uuid-1234',
        provisioned: false, // Not provisioned
        osVersion: '11.0',
        agentVersion: '1.0.0',
      });

      // Act
      await (apiBinder as any).reportCurrentState();

      // Assert - Should not call fetch or getCurrentState
      expect(mockContainerManager.getCurrentState).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle empty config in state report', async () => {
      // Arrange
      mockContainerManager.getCurrentState.mockResolvedValueOnce({
        apps: { 1: { appId: 1, appName: 'mosquitto' } },
        config: undefined, // No config
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      });

      (apiBinder as any).lastReportTime = 0;

      // Act
      await (apiBinder as any).reportCurrentState();

      // Assert
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      expect(requestBody['test-device-uuid-1234'].config).toBeUndefined();
    });
  });

  describe('State Change Detection', () => {
    it('should detect config changes when polling', async () => {
      // Arrange - Initial state
      (apiBinder as any).targetState = {
        apps: { 1: { appId: 1, appName: 'mosquitto' } },
        config: {},
      };

      // New state with config
      const mockResponse = {
        'test-device-uuid-1234': {
          apps: { 1: { appId: 1, appName: 'mosquitto' } },
          config: {
            mqtt: { broker: 'cloud.example.com' },
          },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name === 'etag' ? 'new-etag' : null),
        },
        json: async () => mockResponse,
      });

      // Act
      await (apiBinder as any).pollTargetState();

      // Assert - Should have called setTarget with new state
      expect(mockContainerManager.setTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          config: { mqtt: { broker: 'cloud.example.com' } },
        })
      );
    });

    it('should not trigger update when state is identical', async () => {
      // Arrange - Set existing state
      const existingState = {
        apps: { 1: { appId: 1, appName: 'mosquitto' } },
        config: { mqtt: { broker: 'localhost' } },
      };
      (apiBinder as any).targetState = existingState;
      (apiBinder as any).targetStateETag = 'existing-etag';

      // Mock same state response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name === 'etag' ? 'existing-etag' : null),
        },
        json: async () => ({
          'test-device-uuid-1234': existingState,
        }),
      });

      // Act
      await (apiBinder as any).pollTargetState();

      // Assert - setTarget should NOT be called (state unchanged)
      expect(mockContainerManager.setTarget).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout errors', async () => {
      // Arrange
      const timeoutError = new Error('Timeout');
      timeoutError.name = 'AbortError';
      (global.fetch as jest.Mock).mockRejectedValueOnce(timeoutError);

      // Act & Assert
      await expect((apiBinder as any).pollTargetState()).rejects.toThrow();
    });

    it('should handle malformed API responses', async () => {
      // Arrange
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => null, // Invalid response
      });

      // Act & Assert - Should handle gracefully
      await expect((apiBinder as any).pollTargetState()).rejects.toThrow();
    });
  });

  describe('Integration - Complete Config Lifecycle', () => {
    it('should handle fetch -> store -> report cycle', async () => {
      // Step 1: Fetch target state with config
      const targetStateResponse = {
        'test-device-uuid-1234': {
          apps: { 1: { appId: 1, appName: 'mosquitto' } },
          config: {
            mqtt: { broker: 'localhost', port: 1883 },
            features: { enableCloudJobs: true },
          },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: (name: string) => (name === 'etag' ? 'etag-1' : null) },
        json: async () => targetStateResponse,
      });

      await (apiBinder as any).pollTargetState();

      // Step 2: Verify setTarget was called
      expect(mockContainerManager.setTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          config: targetStateResponse['test-device-uuid-1234'].config,
        })
      );

      // Step 3: Mock getCurrentState to return same config
      mockContainerManager.getCurrentState.mockResolvedValueOnce({
        apps: targetStateResponse['test-device-uuid-1234'].apps,
        config: targetStateResponse['test-device-uuid-1234'].config,
      });

      // Step 4: Report current state
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      });

      (apiBinder as any).lastReportTime = 0;
      await (apiBinder as any).reportCurrentState();

      // Step 5: Verify config was reported back
      const reportCall = (global.fetch as jest.Mock).mock.calls[1];
      const reportBody = JSON.parse(reportCall[1].body);
      expect(reportBody['test-device-uuid-1234'].config).toEqual(
        targetStateResponse['test-device-uuid-1234'].config
      );
    });
  });
});
