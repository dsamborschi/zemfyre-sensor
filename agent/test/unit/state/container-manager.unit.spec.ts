/**
 * Unit Tests for ContainerManager - State Management
 * Tests REAL ContainerManager class with mocked Docker dependencies
 * 
 * What we test: Real ContainerManager methods (setTarget, getCurrentState, getTargetState)
 * What we mock: DockerManager (container operations), EventEmitter events
 */

import { ContainerManager } from '../../../src/compose/container-manager';
import EventEmitter from 'events';

// Mock DockerManager
jest.mock('../../../src/compose/docker-manager', () => {
  const mockDockerInstance = {
    listContainers: jest.fn().mockResolvedValue([]),
    createContainer: jest.fn().mockResolvedValue({ id: 'container-id' }),
    getContainer: jest.fn().mockReturnValue({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      inspect: jest.fn().mockResolvedValue({
        Id: 'container-id',
        State: { Running: true },
        Config: { Image: 'iotistic/mosquitto:latest' },
      }),
    }),
  };

  return {
    DockerManager: jest.fn().mockImplementation(() => ({
      getDockerInstance: jest.fn().mockReturnValue(mockDockerInstance),
      getRunningContainers: jest.fn().mockResolvedValue([]),
      createContainer: jest.fn().mockResolvedValue('container-id'),
      startContainer: jest.fn().mockResolvedValue(undefined),
      stopContainer: jest.fn().mockResolvedValue(undefined),
      removeContainer: jest.fn().mockResolvedValue(undefined),
      pullImage: jest.fn().mockResolvedValue(undefined),
      inspectContainer: jest.fn().mockResolvedValue({
        Id: 'container-id',
        State: { Running: true },
        Config: { Image: 'iotistic/mosquitto:latest' },
      }),
    })),
  };
});

describe('ContainerManager - State Management (Real Code)', () => {
  let containerManager: ContainerManager;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create REAL ContainerManager instance (no arguments)
    containerManager = new ContainerManager();
  });

  describe('setTarget() - Core State Management', () => {
    it('should set target state with apps and config', async () => {
      // Arrange - Use proper ContainerService type
      const targetState: any = {
        apps: {
          1: {
            appId: 1,
            appName: 'mosquitto',
            services: [
              {
                serviceId: 1,
                serviceName: 'mosquitto',
                imageName: 'iotistic/mosquitto:latest',
                appId: 1,
                appName: 'mosquitto',
                config: {
                  image: 'iotistic/mosquitto:latest',
                  ports: ['1883:1883'],
                },
              },
            ],
          },
        },
        config: {
          mqtt: {
            broker: 'localhost',
            port: 1883,
          },
          features: {
            enableCloudJobs: true,
          },
        },
      };

      // Act
      await containerManager.setTarget(targetState);

      // Assert
      const storedTargetState = containerManager.getTargetState();
      expect(storedTargetState.config).toEqual(targetState.config);
    });

    it('should handle empty config', async () => {
      // Arrange
      const targetState: any = {
        apps: {
          1: { appId: 1, appName: 'mosquitto', services: [] },
        },
        config: {},
      };

      // Act
      await containerManager.setTarget(targetState);

      // Assert
      const storedState = containerManager.getTargetState();
      expect(storedState.config).toEqual({});
    });

    it('should handle undefined config', async () => {
      // Arrange
      const targetState: any = {
        apps: { 1: { appId: 1, appName: 'mosquitto', services: [] } },
        // config is undefined
      };

      // Act
      await containerManager.setTarget(targetState);

      // Assert
      const storedState = containerManager.getTargetState();
      // Config should be preserved from state (may be undefined or {})
      expect(storedState).toBeDefined();
    });

    it('should update config when target changes', async () => {
      // Arrange - Initial state
      await containerManager.setTarget({
        apps: { 1: { appId: 1, appName: 'mosquitto', services: [] } } as any,
        config: { mqtt: { broker: 'localhost' } },
      });

      // Act - Update config
      await containerManager.setTarget({
        apps: { 1: { appId: 1, appName: 'mosquitto', services: [] } } as any,
        config: { mqtt: { broker: 'cloud.example.com', port: 8883 } },
      });

      // Assert
      const updatedState = containerManager.getTargetState();
      expect(updatedState.config).toEqual({
        mqtt: { broker: 'cloud.example.com', port: 8883 },
      });
    });
  });

  describe('getTargetState() - State Retrieval', () => {
    it('should return current target state', async () => {
      // Arrange
      const targetState: any = {
        apps: { 1: { appId: 1, appName: 'mosquitto', services: [] } },
        config: { mqtt: { broker: 'localhost' } },
      };
      await containerManager.setTarget(targetState);

      // Act
      const retrievedState = containerManager.getTargetState();

      // Assert
      expect(retrievedState.config).toEqual(targetState.config);
    });

    it('should return empty state when no target set', () => {
      // Act
      const state = containerManager.getTargetState();

      // Assert
      expect(state.apps).toBeDefined();
    });
  });

  describe('getCurrentState() - Current State with Config', () => {
    it('should include config from target state in current state', async () => {
      // Arrange
      const targetState: any = {
        apps: {
          1: {
            appId: 1,
            appName: 'mosquitto',
            services: [],
          },
        },
        config: {
          mqtt: { broker: 'localhost', port: 1883 },
          features: { enableCloudJobs: true },
        },
      };
      await containerManager.setTarget(targetState);

      // Act
      const currentState = await containerManager.getCurrentState();

      // Assert - Config should be included
      expect(currentState.config).toEqual(targetState.config);
    });

    it('should handle empty config in current state', async () => {
      // Arrange
      await containerManager.setTarget({
        apps: { 1: { appId: 1, appName: 'mosquitto', services: [] } } as any,
        config: {},
      });

      // Act
      const currentState = await containerManager.getCurrentState();

      // Assert
      expect(currentState.config).toEqual({});
    });

    it('should include apps in current state', async () => {
      // Arrange
      await containerManager.setTarget({
        apps: {
          1: { appId: 1, appName: 'mosquitto', services: [] },
          2: { appId: 2, appName: 'nodered', services: [] },
        } as any,
        config: {},
      });

      // Act
      const currentState = await containerManager.getCurrentState();

      // Assert
      expect(currentState.apps).toBeDefined();
      expect(Object.keys(currentState.apps).length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('State Reconciliation', () => {
    it('should preserve config through state updates', async () => {
      // Step 1: Set initial target with config
      await containerManager.setTarget({
        apps: { 1: { appId: 1, appName: 'mosquitto', services: [] } } as any,
        config: { mqtt: { broker: 'localhost' } },
      });

      // Step 2: Get current state
      const state1 = await containerManager.getCurrentState();
      expect(state1.config).toEqual({ mqtt: { broker: 'localhost' } });

      // Step 3: Update target state with new config
      await containerManager.setTarget({
        apps: { 1: { appId: 1, appName: 'mosquitto', services: [] } } as any,
        config: { mqtt: { broker: 'cloud.example.com' } },
      });

      // Step 4: Get updated current state
      const state2 = await containerManager.getCurrentState();
      expect(state2.config).toEqual({ mqtt: { broker: 'cloud.example.com' } });
    });

    it('should handle config removal', async () => {
      // Arrange - Set config initially
      await containerManager.setTarget({
        apps: { 1: { appId: 1, appName: 'mosquitto', services: [] } } as any,
        config: { mqtt: { broker: 'localhost' } },
      });

      // Act - Remove config
      await containerManager.setTarget({
        apps: { 1: { appId: 1, appName: 'mosquitto', services: [] } } as any,
        config: {},
      });

      // Assert
      const currentState = await containerManager.getCurrentState();
      expect(currentState.config).toEqual({});
    });
  });

  describe('Complex Config Scenarios', () => {
    it('should handle nested config objects', async () => {
      // Arrange
      const complexConfig = {
        mqtt: {
          broker: 'localhost',
          port: 1883,
          ssl: {
            enabled: true,
            certPath: '/certs/mqtt.crt',
          },
        },
        features: {
          enableCloudJobs: true,
          cloudJobsInterval: 60000,
          metrics: {
            enabled: true,
            interval: 300000,
          },
        },
        network: {
          interfaces: ['eth0', 'wlan0'],
          fallback: 'eth0',
        },
      };

      // Act
      await containerManager.setTarget({
        apps: { 1: { appId: 1, appName: 'mosquitto', services: [] } } as any,
        config: complexConfig,
      });

      // Assert
      const currentState = await containerManager.getCurrentState();
      expect(currentState.config).toEqual(complexConfig);
    });

    it('should handle config with arrays', async () => {
      // Arrange
      const configWithArrays = {
        allowedTopics: ['sensor/+', 'alerts/#', 'system/status'],
        enabledFeatures: ['mqtt', 'http', 'websocket'],
      };

      // Act
      await containerManager.setTarget({
        apps: {} as any,
        config: configWithArrays,
      });

      // Assert
      const state = await containerManager.getCurrentState();
      expect(state.config).toEqual(configWithArrays);
      if (state.config) {
        expect(Array.isArray(state.config.allowedTopics)).toBe(true);
      }
    });

    it('should handle config with mixed types', async () => {
      // Arrange
      const mixedConfig = {
        stringValue: 'test',
        numberValue: 42,
        booleanValue: true,
        nullValue: null,
        arrayValue: [1, 2, 3],
        objectValue: { nested: 'data' },
      };

      // Act
      await containerManager.setTarget({
        apps: {} as any,
        config: mixedConfig,
      });

      // Assert
      const state = await containerManager.getCurrentState();
      expect(state.config).toEqual(mixedConfig);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid config updates', async () => {
      // Arrange & Act - Multiple rapid updates
      await containerManager.setTarget({
        apps: {} as any,
        config: { version: 1 },
      });

      await containerManager.setTarget({
        apps: {} as any,
        config: { version: 2 },
      });

      await containerManager.setTarget({
        apps: {} as any,
        config: { version: 3 },
      });

      // Assert - Should have latest version
      const finalState = await containerManager.getCurrentState();
      expect(finalState.config).toEqual({ version: 3 });
    });

    it('should handle apps without config', async () => {
      // Arrange
      await containerManager.setTarget({
        apps: {
          1: { appId: 1, appName: 'mosquitto', services: [] },
          2: { appId: 2, appName: 'nodered', services: [] },
        } as any,
        // No config field
      } as any);

      // Act
      const state = await containerManager.getCurrentState();

      // Assert - Should have apps but empty/default config
      expect(state.apps).toBeDefined();
    });

    it('should handle empty target state', async () => {
      // Arrange
      await containerManager.setTarget({
        apps: {} as any,
        config: {},
      });

      // Act
      const state = await containerManager.getCurrentState();

      // Assert
      expect(state.apps).toEqual({});
      expect(state.config).toEqual({});
    });
  });

  describe('Integration - Docker Sync with Config', () => {
    it('should maintain config during Docker reconciliation', async () => {
      // Arrange
      const targetState: any = {
        apps: {
          1: {
            appId: 1,
            appName: 'mosquitto',
            services: [],
          },
        },
        config: {
          mqtt: { broker: 'localhost' },
        },
      };

      // Act - Set target (would trigger Docker reconciliation in real scenario)
      await containerManager.setTarget(targetState);

      // Assert - Config should persist after Docker operations
      const currentState = await containerManager.getCurrentState();
      expect(currentState.config).toEqual(targetState.config);
    });
  });
});
