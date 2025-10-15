/**
 * Pure Unit Tests for DeviceManager
 * 
 * These tests mock ALL external dependencies (database, network, file system)
 * and test only the business logic of the DeviceManager class.
 * 
 * Run with: npm run test:unit
 */

// Mock uuid before importing anything
jest.mock('uuid', () => ({
  v4: jest.fn(() => '12345678-1234-4234-8234-123456789abc'),
  validate: jest.fn(() => true)
}));

// Mock database query builder
const mockQueryBuilder = {
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  first: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  del: jest.fn(),
  limit: jest.fn(),  // limit() will be configured per test to return the promise
};

// Mock the database module
jest.mock('../../src/db', () => ({
  models: jest.fn(() => mockQueryBuilder),
  getKnex: jest.fn(),
  initialized: jest.fn(),
  transaction: jest.fn(),
  upsertModel: jest.fn(),
}));

// Mock global fetch to prevent network calls in unit tests
global.fetch = jest.fn().mockRejectedValue(new Error('fetch should not be called in unit tests'));

import { DeviceManager } from '../../src/provisioning/device-manager';

describe('DeviceManager - UUID Generation (Unit)', () => {
  let deviceManager: DeviceManager;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Configure mock database to return no existing device (new device)
    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.limit.mockResolvedValue([]);  // No existing device - limit returns promise
    mockQueryBuilder.insert.mockResolvedValue([1]);
    mockQueryBuilder.update.mockResolvedValue(1);
    
    deviceManager = new DeviceManager();
  });

  it('should generate valid UUIDv4', async () => {
    await deviceManager.initialize();
    const deviceInfo = deviceManager.getDeviceInfo();
    
    // UUIDv4 regex pattern
    const uuidv4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(deviceInfo.uuid).toMatch(uuidv4Pattern);
  });

  it('should generate 64-character hex deviceApiKey', async () => {
    await deviceManager.initialize();
    const deviceInfo = deviceManager.getDeviceInfo();
    
    expect(deviceInfo.deviceApiKey).toHaveLength(64);
    expect(deviceInfo.deviceApiKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should mark device as not provisioned initially', async () => {
    await deviceManager.initialize();
    expect(deviceManager.isProvisioned()).toBe(false);
  });
});

describe('DeviceManager - State Management (Unit)', () => {
  let deviceManager: DeviceManager;
  const mockDeviceData = {
    id: 1,
    uuid: '12345678-1234-4234-8234-123456789abc',
    deviceApiKey: 'a'.repeat(64),
    provisioned: false,
    deviceId: null,
    provisioningApiKey: null,
    apiEndpoint: null,
    deviceName: null,
    deviceType: null,
    applicationId: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Configure mock database to return existing device
    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.limit.mockResolvedValue([mockDeviceData]);  // Existing device - limit returns promise
    mockQueryBuilder.update.mockResolvedValue(1);
    
    deviceManager = new DeviceManager();
  });

  it('should load existing device from database', async () => {
    await deviceManager.initialize();
    const deviceInfo = deviceManager.getDeviceInfo();
    
    expect(deviceInfo.uuid).toBe(mockDeviceData.uuid);
    expect(deviceInfo.deviceApiKey).toBe(mockDeviceData.deviceApiKey);
  });

  it('should detect provisioned state correctly', async () => {
    // Configure mock to return provisioned device (must have provisioning_api_key to be considered provisioned)
    mockQueryBuilder.limit.mockResolvedValue([{
      uuid: '12345678-1234-4234-8234-123456789abc',
      device_id: 42,
      device_api_key: 'test-key',
      device_name: 'Test Device',
      provisioned: 1,
      provisioning_api_key: 'prov-key', // This is key for isProvisioned() to return true
      api_endpoint: 'http://test.com'
    }]);
    
    const provisionedManager = new DeviceManager();
    await provisionedManager.initialize();
    
    expect(provisionedManager.isProvisioned()).toBe(true);
  });
});

describe('DeviceManager - Validation Logic (Unit)', () => {
  let deviceManager: DeviceManager;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Configure mock database
    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.limit.mockResolvedValue([]);  // limit returns promise
    mockQueryBuilder.insert.mockResolvedValue([1]);
    mockQueryBuilder.update.mockResolvedValue(1);
    
    deviceManager = new DeviceManager();
    await deviceManager.initialize();
  });

  it('should reject provisioning without provisioningApiKey', async () => {
    await expect(deviceManager.provision({
      provisioningApiKey: undefined as any,
      apiEndpoint: 'http://test.com',
      deviceName: 'Test',
      deviceType: 'pi4'
    })).rejects.toThrow('provisioningApiKey is required for device provisioning');
  });

  it('should reject provisioning without apiEndpoint', async () => {
    await expect(deviceManager.provision({
      provisioningApiKey: 'a'.repeat(64),
      apiEndpoint: undefined as any,
      deviceName: 'Test',
      deviceType: 'pi4'
    })).rejects.toThrow();
  });

  it('should reject provisioning without deviceName', async () => {
    await expect(deviceManager.provision({
      provisioningApiKey: 'a'.repeat(64),
      apiEndpoint: 'http://test.com',
      deviceName: undefined as any,
      deviceType: 'pi4'
    })).rejects.toThrow();
  });
});

describe('DeviceManager - Data Transformation (Unit)', () => {
  let deviceManager: DeviceManager;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Configure mock database
    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.limit.mockResolvedValue([]);  // limit returns promise
    mockQueryBuilder.insert.mockResolvedValue([1]);
    mockQueryBuilder.update.mockResolvedValue(1);
    
    deviceManager = new DeviceManager();
    await deviceManager.initialize();
  });

  it('should sanitize device info output (no sensitive data leak)', () => {
    const deviceInfo = deviceManager.getDeviceInfo();
    
    // Should have public fields
    expect(deviceInfo).toHaveProperty('uuid');
    expect(deviceInfo).toHaveProperty('provisioned');
    
    // deviceApiKey should be present (used for auth)
    expect(deviceInfo).toHaveProperty('deviceApiKey');
    
    // provisioningApiKey should not be present after provisioning
    if (deviceInfo.provisioned) {
      expect(deviceInfo.provisioningApiKey).toBeUndefined();
    }
  });

  it('should update device name correctly', async () => {
    const newName = 'Updated Device Name';
    await deviceManager.updateDeviceName(newName);
    
    const deviceInfo = deviceManager.getDeviceInfo();
    expect(deviceInfo.deviceName).toBe(newName);
  });

  it('should update API endpoint correctly', async () => {
    const newEndpoint = 'http://newcloud.example.com';
    await deviceManager.updateAPIEndpoint(newEndpoint);
    
    const deviceInfo = deviceManager.getDeviceInfo();
    expect(deviceInfo.apiEndpoint).toBe(newEndpoint);
  });
});

describe('DeviceManager - Reset Logic (Unit)', () => {
  let deviceManager: DeviceManager;
  const mockProvisionedDevice = {
    uuid: '12345678-1234-4234-8234-123456789abc',
    device_api_key: 'a'.repeat(64),
    provisioned: 1, // SQLite boolean
    device_id: 42,
    provisioning_api_key: 'prov-key', // Required for isProvisioned() to return true
    api_endpoint: 'http://cloud.example.com',
    device_name: 'My Device',
    device_type: 'pi4',
    application_id: 'app-123',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Configure mock database to return provisioned device
    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.limit.mockResolvedValue([mockProvisionedDevice]);  // limit returns promise
    mockQueryBuilder.update.mockResolvedValue(1);
    
    deviceManager = new DeviceManager();
    await deviceManager.initialize();
  });

  it('should preserve UUID and deviceApiKey after reset', async () => {
    const beforeReset = deviceManager.getDeviceInfo();
    const originalUuid = beforeReset.uuid;
    const originalApiKey = beforeReset.deviceApiKey;
    
    await deviceManager.reset();
    
    const afterReset = deviceManager.getDeviceInfo();
    expect(afterReset.uuid).toBe(originalUuid);
    expect(afterReset.deviceApiKey).toBe(originalApiKey);
  });

  it('should clear provisioning status after reset', async () => {
    expect(deviceManager.isProvisioned()).toBe(true);
    
    await deviceManager.reset();
    
    expect(deviceManager.isProvisioned()).toBe(false);
  });

  it('should clear deviceId after reset', async () => {
    await deviceManager.reset();
    
    const afterReset = deviceManager.getDeviceInfo();
    expect(afterReset.deviceId).toBeUndefined();
  });

  it('should clear provisioningApiKey after reset', async () => {
    await deviceManager.reset();
    
    const afterReset = deviceManager.getDeviceInfo();
    expect(afterReset.provisioningApiKey).toBeUndefined();
  });
});
