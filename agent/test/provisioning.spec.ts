/**
 * Unit tests for device provisioning with two-phase authentication
 * 
 * Tests cover:
 * - Device initialization
 * - UUID and key generation
 * - Two-phase provisioning flow
 * - Key exchange mechanism
 * - Error handling
 * - Database persistence
 * 
 * Run with: npm test
 */

import { DeviceManager } from '../src/provisioning/device-manager';
import { getKnex } from '../src/db';
import type { ProvisioningConfig } from '../src/provisioning/types';

const db = getKnex();

describe('DeviceManager - Initialization', () => {
  let deviceManager: DeviceManager;

  beforeEach(async () => {
    // Clean database before each test
    await db('device').del();
    
    // Create fresh DeviceManager instance
    deviceManager = new DeviceManager();
    
    // Clear fetch mock
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(async () => {
    // Ensure database is clean
    await db('device').del();
  });

  it('should create new device with UUID and deviceApiKey on first initialization', async () => {
    await deviceManager.initialize();
    
    const deviceInfo = deviceManager.getDeviceInfo();
    
    expect(deviceInfo.uuid).toBeDefined();
    expect(deviceInfo.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(deviceInfo.deviceApiKey).toBeDefined();
    expect(deviceInfo.deviceApiKey).toHaveLength(64); // 32 bytes in hex
    expect(deviceInfo.provisioned).toBe(false);
    expect(deviceInfo.deviceId).toBeUndefined();
  });

  it('should load existing device from database on subsequent initialization', async () => {
    // First initialization
    await deviceManager.initialize();
    const firstDeviceInfo = deviceManager.getDeviceInfo();
    
    // Create new manager instance and initialize
    const secondManager = new DeviceManager();
    await secondManager.initialize();
    const secondDeviceInfo = secondManager.getDeviceInfo();
    
    // Should load same UUID and deviceApiKey
    expect(secondDeviceInfo.uuid).toBe(firstDeviceInfo.uuid);
    expect(secondDeviceInfo.deviceApiKey).toBe(firstDeviceInfo.deviceApiKey);
  });

  it('should persist device to database', async () => {
    await deviceManager.initialize();
    const deviceInfo = deviceManager.getDeviceInfo();
    
    // Query database directly
    const rows = await db('device').select('*');
    expect(rows).toHaveLength(1);
    expect(rows[0].uuid).toBe(deviceInfo.uuid);
    expect(rows[0].deviceApiKey).toBe(deviceInfo.deviceApiKey);
  });

  it('should check if device is provisioned', async () => {
    await deviceManager.initialize();
    expect(deviceManager.isProvisioned()).toBe(false);
  });
});

describe('DeviceManager - Two-Phase Provisioning', () => {
  let deviceManager: DeviceManager;
  let mockProvisioningConfig: ProvisioningConfig;

  const mockProvisioningApiKey = 'a'.repeat(64);
  const mockCloudUrl = 'https://5eeb2cea-372f-44bf-b399-14bfd8d191ca.mock.pstmn.io';

  beforeEach(async () => {
    // Clean database
    await db('device').del();
    
    deviceManager = new DeviceManager();
    await deviceManager.initialize();
    
    mockProvisioningConfig = {
      provisioningApiKey: mockProvisioningApiKey,
      apiEndpoint: mockCloudUrl,
      deviceName: 'Test Device',
      deviceType: 'raspberry-pi',
      applicationId: 123,
      macAddress: '00:11:22:33:44:55',
      osVersion: 'RaspberryPi OS 11',
      supervisorVersion: '1.0.0'
    };
    
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(async () => {
    await db('device').del();
  });

  it('should require provisioningApiKey for provisioning', async () => {
    const invalidConfig = {
      ...mockProvisioningConfig,
      provisioningApiKey: undefined as any
    };
    
    await expect(deviceManager.provision(invalidConfig))
      .rejects.toThrow('Provisioning API key is required');
  });

  it('should generate deviceApiKey if not present', async () => {
    const deviceInfo = deviceManager.getDeviceInfo();
    
    // Clear deviceApiKey from database
    await db('device')
      .where({ uuid: deviceInfo.uuid })
      .update({ deviceApiKey: null });
    
    // Reload device
    const freshManager = new DeviceManager();
    await freshManager.initialize();
    
    // Mock successful API responses
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 42,
          uuid: deviceInfo.uuid,
          deviceName: 'Test Device',
          deviceType: 'raspberry-pi',
          applicationId: 'app-123',
          createdAt: new Date().toISOString()
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'ok',
          message: 'Device key validated successfully'
        })
      });
    
    await freshManager.provision(mockProvisioningConfig);
    
    const updatedInfo = freshManager.getDeviceInfo();
    expect(updatedInfo.deviceApiKey).toBeDefined();
    expect(updatedInfo.deviceApiKey).toHaveLength(64);
  });

  it('should complete full provisioning flow successfully', async () => {
    const deviceInfo = deviceManager.getDeviceInfo();
    
    // Mock Phase 1: Registration
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 42,
        uuid: deviceInfo.uuid,
        deviceName: 'Test Device',
        deviceType: 'raspberry-pi',
        applicationId: 'app-123',
        createdAt: new Date().toISOString()
      })
    });
    
    // Mock Phase 2: Key Exchange
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ok',
        message: 'Device key validated successfully'
      })
    });
    
    const result = await deviceManager.provision(mockProvisioningConfig);
    
    expect(result.provisioned).toBe(true);
    expect(result.deviceId).toBe(42);
    expect(result.uuid).toBe(deviceInfo.uuid);
    expect(result.deviceApiKey).toBe(deviceInfo.deviceApiKey);
    expect(result.provisioningApiKey).toBeUndefined(); // Should be removed
    
    // Verify database
    const rows = await db('device').select('*');
    expect(rows[0].deviceId).toBe(42);
    expect(rows[0].provisioned).toBe(true);
    expect(rows[0].provisioningApiKey).toBeNull();
  });

  it('should call registration endpoint with correct payload', async () => {
    const deviceInfo = deviceManager.getDeviceInfo();
    
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 42,
          uuid: deviceInfo.uuid,
          deviceName: 'Test Device',
          deviceType: 'raspberry-pi',
          applicationId: 'app-123',
          createdAt: new Date().toISOString()
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' })
      });
    
    await deviceManager.provision(mockProvisioningConfig);
    
    // Check first call (registration)
    expect(global.fetch).toHaveBeenCalledTimes(2);
    
    const firstCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(firstCall[0]).toBe(`${mockCloudUrl}/api/v1/device/register`);
    expect(firstCall[1].method).toBe('POST');
    expect(firstCall[1].headers['Authorization']).toBe(`Bearer ${mockProvisioningApiKey}`);
    
    const requestBody = JSON.parse(firstCall[1].body);
    expect(requestBody.uuid).toBe(deviceInfo.uuid);
    expect(requestBody.deviceName).toBe('Test Device');
    expect(requestBody.deviceType).toBe('raspberry-pi');
    expect(requestBody.deviceApiKey).toBe(deviceInfo.deviceApiKey);
    expect(requestBody.applicationId).toBe('app-123');
    expect(requestBody.macAddress).toBe('00:11:22:33:44:55');
  });

  it('should call key-exchange endpoint with deviceApiKey', async () => {
    const deviceInfo = deviceManager.getDeviceInfo();
    
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 42,
          uuid: deviceInfo.uuid,
          deviceName: 'Test Device',
          deviceType: 'raspberry-pi',
          applicationId: 'app-123',
          createdAt: new Date().toISOString()
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' })
      });
    
    await deviceManager.provision(mockProvisioningConfig);
    
    // Check second call (key exchange)
    const secondCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(secondCall[0]).toBe(`${mockCloudUrl}/api/v1/device/${deviceInfo.uuid}/key-exchange`);
    expect(secondCall[1].method).toBe('POST');
    expect(secondCall[1].headers['Authorization']).toBe(`Bearer ${deviceInfo.deviceApiKey}`);
    
    const requestBody = JSON.parse(secondCall[1].body);
    expect(requestBody.deviceApiKey).toBe(deviceInfo.deviceApiKey);
  });

  it('should remove provisioningApiKey after successful provisioning', async () => {
    const deviceInfo = deviceManager.getDeviceInfo();
    
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 42,
          uuid: deviceInfo.uuid,
          deviceName: 'Test Device',
          deviceType: 'raspberry-pi',
          applicationId: 'app-123',
          createdAt: new Date().toISOString()
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' })
      });
    
    await deviceManager.provision(mockProvisioningConfig);
    
    const updatedInfo = deviceManager.getDeviceInfo();
    expect(updatedInfo.provisioningApiKey).toBeUndefined();
    
    // Check database
    const rows = await db('device').select('*');
    expect(rows[0].provisioningApiKey).toBeNull();
  });

  it('should handle registration API errors', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized'
    });
    
    await expect(deviceManager.provision(mockProvisioningConfig))
      .rejects.toThrow('Registration failed: 401 Unauthorized');
  });

  it('should handle key-exchange API errors', async () => {
    const deviceInfo = deviceManager.getDeviceInfo();
    
    // Mock successful registration
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 42,
        uuid: deviceInfo.uuid,
        deviceName: 'Test Device',
        deviceType: 'raspberry-pi',
        applicationId: 'app-123',
        createdAt: new Date().toISOString()
      })
    });
    
    // Mock failed key exchange
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized'
    });
    
    await expect(deviceManager.provision(mockProvisioningConfig))
      .rejects.toThrow('Key exchange failed: 401 Unauthorized');
  });

  it('should handle network errors during registration', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    
    await expect(deviceManager.provision(mockProvisioningConfig))
      .rejects.toThrow('Network error');
  });

  it('should handle network errors during key exchange', async () => {
    const deviceInfo = deviceManager.getDeviceInfo();
    
    // Mock successful registration
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 42,
        uuid: deviceInfo.uuid,
        deviceName: 'Test Device',
        deviceType: 'raspberry-pi',
        applicationId: 'app-123',
        createdAt: new Date().toISOString()
      })
    });
    
    // Mock network error on key exchange
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Connection timeout'));
    
    await expect(deviceManager.provision(mockProvisioningConfig))
      .rejects.toThrow('Connection timeout');
  });
});

describe('DeviceManager - Device Reset', () => {
  let deviceManager: DeviceManager;

  beforeEach(async () => {
    await db('device').del();
    deviceManager = new DeviceManager();
    await deviceManager.initialize();
  });

  afterEach(async () => {
    await db('device').del();
  });

  it('should reset provisioning while preserving UUID and deviceApiKey', async () => {
    const originalInfo = deviceManager.getDeviceInfo();
    const originalUuid = originalInfo.uuid;
    const originalApiKey = originalInfo.deviceApiKey;
    
    // Mock provisioning first
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 42,
          uuid: originalUuid,
          deviceName: 'Test Device',
          deviceType: 'raspberry-pi',
          applicationId: 'app-123',
          createdAt: new Date().toISOString()
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' })
      });
    
    await deviceManager.provision({
      provisioningApiKey: 'a'.repeat(64),
      apiEndpoint: 'http://cloud.example.com',
      deviceName: 'Test Device',
      deviceType: 'raspberry-pi'
    });
    
    // Reset
    await deviceManager.reset();
    
    const resetInfo = deviceManager.getDeviceInfo();
    expect(resetInfo.uuid).toBe(originalUuid);
    expect(resetInfo.deviceApiKey).toBe(originalApiKey);
    expect(resetInfo.provisioned).toBe(false);
    expect(resetInfo.deviceId).toBeUndefined();
    expect(resetInfo.provisioningApiKey).toBeUndefined();
  });

  it('should clear server-assigned fields on reset', async () => {
    // Provision first
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 42,
          uuid: deviceManager.getDeviceInfo().uuid,
          deviceName: 'Test Device',
          deviceType: 'raspberry-pi',
          applicationId: 'app-123',
          createdAt: new Date().toISOString()
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' })
      });
    
    await deviceManager.provision({
      provisioningApiKey: 'a'.repeat(64),
      apiEndpoint: 'http://cloud.example.com',
      deviceName: 'Test Device',
      deviceType: 'raspberry-pi',
      applicationId: 123
    });
    
    await deviceManager.reset();
    
    // Check database
    const rows = await db('device').select('*');
    expect(rows[0].deviceId).toBeNull();
    expect(rows[0].provisioned).toBe(false);
    expect(rows[0].applicationId).toBeNull();
  });

  it('should allow re-provisioning after reset', async () => {
    const deviceInfo = deviceManager.getDeviceInfo();
    
    // First provision
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 42,
          uuid: deviceInfo.uuid,
          deviceName: 'Test Device',
          deviceType: 'raspberry-pi',
          applicationId: 'app-123',
          createdAt: new Date().toISOString()
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' })
      });
    
    await deviceManager.provision({
      provisioningApiKey: 'a'.repeat(64),
      apiEndpoint: 'http://cloud.example.com',
      deviceName: 'Test Device',
      deviceType: 'raspberry-pi'
    });
    
    // Reset
    await deviceManager.reset();
    
    // Provision again
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 99,
          uuid: deviceInfo.uuid,
          deviceName: 'Test Device 2',
          deviceType: 'raspberry-pi',
          applicationId: 'app-456',
          createdAt: new Date().toISOString()
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' })
      });
    
    const result = await deviceManager.provision({
      provisioningApiKey: 'b'.repeat(64),
      apiEndpoint: 'http://cloud.example.com',
      deviceName: 'Test Device 2',
      deviceType: 'raspberry-pi'
    });
    
    expect(result.provisioned).toBe(true);
    expect(result.deviceId).toBe(99);
  });

  it('should handle reset when device is not provisioned', async () => {
    await expect(deviceManager.reset()).resolves.not.toThrow();
    expect(deviceManager.isProvisioned()).toBe(false);
  });
});

describe('DeviceManager - Updates', () => {
  let deviceManager: DeviceManager;

  beforeEach(async () => {
    await db('device').del();
    deviceManager = new DeviceManager();
    await deviceManager.initialize();
  });

  afterEach(async () => {
    await db('device').del();
  });

  it('should update device name', async () => {
    await deviceManager.updateDeviceName('New Device Name');
    
    const deviceInfo = deviceManager.getDeviceInfo();
    expect(deviceInfo.deviceName).toBe('New Device Name');
    
    // Check database
    const rows = await db('device').select('*');
    expect(rows[0].deviceName).toBe('New Device Name');
  });

  it('should update API endpoint', async () => {
    await deviceManager.updateAPIEndpoint('http://newcloud.example.com');
    
    const deviceInfo = deviceManager.getDeviceInfo();
    expect(deviceInfo.apiEndpoint).toBe('http://newcloud.example.com');
    
    // Check database
    const rows = await db('device').select('*');
    expect(rows[0].apiEndpoint).toBe('http://newcloud.example.com');
  });
});

describe('DeviceManager - Fetch Device', () => {
  let deviceManager: DeviceManager;
  const mockCloudUrl = 'http://cloud.example.com';

  beforeEach(async () => {
    await db('device').del();
    deviceManager = new DeviceManager();
    await deviceManager.initialize();
    await deviceManager.updateAPIEndpoint(mockCloudUrl);
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(async () => {
    await db('device').del();
  });

  it('should fetch device info from cloud API', async () => {
    const deviceInfo = deviceManager.getDeviceInfo();
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 42,
        uuid: deviceInfo.uuid,
        deviceName: 'Cloud Device',
        deviceType: 'raspberry-pi',
        applicationId: 'app-123',
        status: 'active'
      })
    });
    
    const cloudDevice = await deviceManager.fetchDevice(mockCloudUrl, deviceInfo.uuid!, deviceInfo.deviceApiKey!);
    
    expect(cloudDevice).toBeDefined();
    expect(cloudDevice!.id).toBe(42);
    expect(cloudDevice!.uuid).toBe(deviceInfo.uuid);
    expect(cloudDevice!.deviceName).toBe('Cloud Device');
    
    // Check API call
    expect(global.fetch).toHaveBeenCalledWith(
      `${mockCloudUrl}/api/v1/device/${deviceInfo.uuid}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Authorization': `Bearer ${deviceInfo.deviceApiKey}`
        })
      })
    );
  });

  it('should return null for 404 responses', async () => {
    const deviceInfo = deviceManager.getDeviceInfo();
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });
    
    const result = await deviceManager.fetchDevice(mockCloudUrl, deviceInfo.uuid!, deviceInfo.deviceApiKey!);
    expect(result).toBeNull();
  });

  it('should throw error for other API errors', async () => {
    const deviceInfo = deviceManager.getDeviceInfo();
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    });
    
    await expect(deviceManager.fetchDevice(mockCloudUrl, deviceInfo.uuid!, deviceInfo.deviceApiKey!))
      .rejects.toThrow('Failed to fetch device: 500 Internal Server Error');
  });
});
