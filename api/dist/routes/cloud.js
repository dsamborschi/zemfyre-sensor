"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const connection_1 = require("../db/connection");
const models_1 = require("../db/models");
const provisioning_keys_1 = require("../utils/provisioning-keys");
const audit_logger_1 = require("../utils/audit-logger");
const event_sourcing_1 = require("../services/event-sourcing");
const event_sourcing_2 = __importDefault(require("../config/event-sourcing"));
exports.router = express_1.default.Router();
const eventPublisher = new event_sourcing_1.EventPublisher();
const provisioningLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many provisioning attempts from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    handler: async (req, res) => {
        await (0, audit_logger_1.logAuditEvent)({
            eventType: audit_logger_1.AuditEventType.RATE_LIMIT_EXCEEDED,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            severity: audit_logger_1.AuditSeverity.WARNING,
            details: { endpoint: '/api/v1/device/register' }
        });
        res.status(429).json({
            error: 'Too many requests',
            message: 'Too many provisioning attempts from this IP, please try again later'
        });
    }
});
const keyExchangeLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: 'Too many key exchange attempts, please try again later'
});
exports.router.post('/api/v1/provisioning-keys', async (req, res) => {
    try {
        const { fleetId, maxDevices = 100, expiresInDays = 365, description } = req.body;
        if (!fleetId || typeof fleetId !== 'string') {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'fleetId is required and must be a string'
            });
        }
        if (maxDevices && (typeof maxDevices !== 'number' || maxDevices < 1 || maxDevices > 10000)) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'maxDevices must be a number between 1 and 10000'
            });
        }
        if (expiresInDays && (typeof expiresInDays !== 'number' || expiresInDays < 1 || expiresInDays > 3650)) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'expiresInDays must be a number between 1 and 3650 (10 years)'
            });
        }
        console.log(`🔑 Creating provisioning key for fleet: ${fleetId}`);
        const { id, key } = await (0, provisioning_keys_1.createProvisioningKey)(fleetId, maxDevices, expiresInDays, description, 'api-admin');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
        console.log(`✅ Provisioning key created: ${id}`);
        res.status(201).json({
            id,
            key,
            fleetId,
            maxDevices,
            expiresAt: expiresAt.toISOString(),
            description,
            warning: 'Store this key securely - it cannot be retrieved again!'
        });
    }
    catch (error) {
        console.error('❌ Error creating provisioning key:', error);
        res.status(500).json({
            error: 'Failed to create provisioning key',
            message: error.message
        });
    }
});
exports.router.get('/api/v1/provisioning-keys', async (req, res) => {
    try {
        const { fleetId } = req.query;
        if (!fleetId || typeof fleetId !== 'string') {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'fleetId query parameter is required'
            });
        }
        console.log(`📋 Listing provisioning keys for fleet: ${fleetId}`);
        const keys = await (0, provisioning_keys_1.listProvisioningKeys)(fleetId);
        const sanitizedKeys = keys.map(k => ({
            id: k.id,
            fleet_id: k.fleet_id,
            description: k.description,
            max_devices: k.max_devices,
            devices_provisioned: k.devices_provisioned,
            expires_at: k.expires_at,
            is_active: k.is_active,
            created_at: k.created_at,
            created_by: k.created_by,
            last_used_at: k.last_used_at,
        }));
        res.json({
            fleet_id: fleetId,
            count: sanitizedKeys.length,
            keys: sanitizedKeys
        });
    }
    catch (error) {
        console.error('❌ Error listing provisioning keys:', error);
        res.status(500).json({
            error: 'Failed to list provisioning keys',
            message: error.message
        });
    }
});
exports.router.delete('/api/v1/provisioning-keys/:keyId', async (req, res) => {
    try {
        const { keyId } = req.params;
        const { reason } = req.body;
        if (!keyId) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'keyId is required'
            });
        }
        console.log(`🚫 Revoking provisioning key: ${keyId}`);
        await (0, provisioning_keys_1.revokeProvisioningKey)(keyId, reason);
        console.log(`✅ Provisioning key revoked: ${keyId}`);
        res.json({
            status: 'ok',
            message: 'Provisioning key revoked',
            keyId,
            reason
        });
    }
    catch (error) {
        console.error('❌ Error revoking provisioning key:', error);
        res.status(500).json({
            error: 'Failed to revoke provisioning key',
            message: error.message
        });
    }
});
exports.router.post('/api/v1/device/register', provisioningLimiter, async (req, res) => {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    let provisioningKeyRecord = null;
    try {
        const { uuid, deviceName, deviceType, deviceApiKey, applicationId, macAddress, osVersion, supervisorVersion } = req.body;
        const provisioningApiKey = req.headers.authorization?.replace('Bearer ', '');
        if (!uuid || !deviceName || !deviceType || !deviceApiKey) {
            await (0, audit_logger_1.logAuditEvent)({
                eventType: audit_logger_1.AuditEventType.PROVISIONING_FAILED,
                ipAddress,
                userAgent,
                severity: audit_logger_1.AuditSeverity.WARNING,
                details: { reason: 'Missing required fields', uuid: uuid?.substring(0, 8) }
            });
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'uuid, deviceName, deviceType, and deviceApiKey are required'
            });
        }
        if (!provisioningApiKey) {
            await (0, audit_logger_1.logAuditEvent)({
                eventType: audit_logger_1.AuditEventType.PROVISIONING_FAILED,
                deviceUuid: uuid,
                ipAddress,
                userAgent,
                severity: audit_logger_1.AuditSeverity.WARNING,
                details: { reason: 'Missing provisioning API key' }
            });
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Provisioning API key required in Authorization header'
            });
        }
        await (0, audit_logger_1.checkProvisioningRateLimit)(ipAddress);
        console.log('🔐 Validating provisioning key...');
        const keyValidation = await (0, provisioning_keys_1.validateProvisioningKey)(provisioningApiKey, ipAddress);
        if (!keyValidation.valid) {
            await (0, audit_logger_1.logProvisioningAttempt)(ipAddress, uuid, null, false, keyValidation.error, userAgent);
            return res.status(401).json({
                error: 'Invalid provisioning key',
                message: keyValidation.error
            });
        }
        provisioningKeyRecord = keyValidation.keyRecord;
        console.log('✅ Provisioning key validated for fleet:', provisioningKeyRecord.fleet_id);
        await (0, audit_logger_1.logAuditEvent)({
            eventType: audit_logger_1.AuditEventType.PROVISIONING_STARTED,
            deviceUuid: uuid,
            ipAddress,
            userAgent,
            severity: audit_logger_1.AuditSeverity.INFO,
            details: {
                deviceName,
                deviceType,
                fleetId: provisioningKeyRecord.fleet_id
            }
        });
        let device = await models_1.DeviceModel.getByUuid(uuid);
        if (device) {
            console.log('⚠️  Device already registered, preventing duplicate registration');
            await (0, audit_logger_1.logAuditEvent)({
                eventType: audit_logger_1.AuditEventType.PROVISIONING_FAILED,
                deviceUuid: uuid,
                ipAddress,
                severity: audit_logger_1.AuditSeverity.WARNING,
                details: { reason: 'Device already registered', existingDeviceId: device.id }
            });
            await (0, audit_logger_1.logProvisioningAttempt)(ipAddress, uuid, provisioningKeyRecord.id, false, 'Device already registered', userAgent);
            return res.status(409).json({
                error: 'Device registration failed',
                message: 'This device is already registered'
            });
        }
        device = await models_1.DeviceModel.getOrCreate(uuid);
        console.log('✅ New device created');
        const deviceApiKeyHash = await bcrypt_1.default.hash(deviceApiKey, 10);
        console.log('🔒 Device API key hashed for secure storage');
        device = await models_1.DeviceModel.update(uuid, {
            device_name: deviceName,
            device_type: deviceType,
            provisioning_state: 'registered',
            status: 'online',
            mac_address: macAddress,
            os_version: osVersion,
            supervisor_version: supervisorVersion,
            device_api_key_hash: deviceApiKeyHash,
            fleet_id: provisioningKeyRecord.fleet_id,
            provisioned_by_key_id: provisioningKeyRecord.id,
            provisioned_at: new Date(),
            is_online: true,
            is_active: true
        });
        console.log(`✅ Device metadata stored: ${deviceName} (${deviceType}) - State: registered, Status: online`);
        await (0, provisioning_keys_1.incrementProvisioningKeyUsage)(provisioningKeyRecord.id);
        await eventPublisher.publish('device.provisioned', 'device', uuid, {
            device_name: deviceName,
            device_type: deviceType,
            fleet_id: provisioningKeyRecord.fleet_id,
            provisioned_at: new Date().toISOString(),
            ip_address: ipAddress,
            mac_address: macAddress,
            os_version: osVersion,
            supervisor_version: supervisorVersion
        }, {
            metadata: {
                user_agent: userAgent,
                provisioning_key_id: provisioningKeyRecord.id,
                endpoint: '/api/v1/device/register'
            }
        });
        await (0, audit_logger_1.logAuditEvent)({
            eventType: audit_logger_1.AuditEventType.DEVICE_REGISTERED,
            deviceUuid: uuid,
            ipAddress,
            userAgent,
            severity: audit_logger_1.AuditSeverity.INFO,
            details: {
                deviceId: device.id,
                deviceName,
                deviceType,
                fleetId: provisioningKeyRecord.fleet_id
            }
        });
        await (0, audit_logger_1.logProvisioningAttempt)(ipAddress, uuid, provisioningKeyRecord.id, true, undefined, userAgent);
        const response = {
            id: device.id,
            uuid: device.uuid,
            deviceName: deviceName,
            deviceType: deviceType,
            applicationId: applicationId,
            fleetId: provisioningKeyRecord.fleet_id,
            createdAt: device.created_at.toISOString(),
        };
        console.log('✅ Device registered successfully:', response.id);
        res.status(200).json(response);
    }
    catch (error) {
        console.error('❌ Error registering device:', error);
        await (0, audit_logger_1.logAuditEvent)({
            eventType: audit_logger_1.AuditEventType.PROVISIONING_FAILED,
            ipAddress,
            userAgent,
            severity: audit_logger_1.AuditSeverity.ERROR,
            details: { error: error.message }
        });
        await (0, audit_logger_1.logProvisioningAttempt)(ipAddress, req.body.uuid, provisioningKeyRecord?.id || null, false, error.message, userAgent);
        res.status(500).json({
            error: 'Failed to register device',
            message: error.message
        });
    }
});
exports.router.post('/api/v1/device/:uuid/key-exchange', keyExchangeLimiter, async (req, res) => {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    try {
        const { uuid } = req.params;
        const { deviceApiKey } = req.body;
        const authKey = req.headers.authorization?.replace('Bearer ', '');
        if (!deviceApiKey || !authKey) {
            await (0, audit_logger_1.logAuditEvent)({
                eventType: audit_logger_1.AuditEventType.KEY_EXCHANGE_FAILED,
                deviceUuid: uuid,
                ipAddress,
                userAgent,
                severity: audit_logger_1.AuditSeverity.WARNING,
                details: { reason: 'Missing credentials' }
            });
            return res.status(400).json({
                error: 'Missing credentials',
                message: 'deviceApiKey required in body and Authorization header'
            });
        }
        if (deviceApiKey !== authKey) {
            await (0, audit_logger_1.logAuditEvent)({
                eventType: audit_logger_1.AuditEventType.KEY_EXCHANGE_FAILED,
                deviceUuid: uuid,
                ipAddress,
                userAgent,
                severity: audit_logger_1.AuditSeverity.WARNING,
                details: { reason: 'Key mismatch between body and header' }
            });
            return res.status(401).json({
                error: 'Key mismatch',
                message: 'deviceApiKey in body must match Authorization header'
            });
        }
        console.log('🔑 Key exchange request for device:', uuid.substring(0, 8) + '...');
        const device = await models_1.DeviceModel.getByUuid(uuid);
        if (!device) {
            await (0, audit_logger_1.logAuditEvent)({
                eventType: audit_logger_1.AuditEventType.KEY_EXCHANGE_FAILED,
                deviceUuid: uuid,
                ipAddress,
                userAgent,
                severity: audit_logger_1.AuditSeverity.WARNING,
                details: { reason: 'Device not found' }
            });
            return res.status(404).json({
                error: 'Device not found',
                message: `Device ${uuid} not registered`
            });
        }
        if (!device.device_api_key_hash) {
            await (0, audit_logger_1.logAuditEvent)({
                eventType: audit_logger_1.AuditEventType.KEY_EXCHANGE_FAILED,
                deviceUuid: uuid,
                ipAddress,
                userAgent,
                severity: audit_logger_1.AuditSeverity.ERROR,
                details: { reason: 'No API key hash stored for device' }
            });
            return res.status(500).json({
                error: 'Configuration error',
                message: 'Device API key not configured'
            });
        }
        const keyMatches = await bcrypt_1.default.compare(deviceApiKey, device.device_api_key_hash);
        if (!keyMatches) {
            await (0, audit_logger_1.logAuditEvent)({
                eventType: audit_logger_1.AuditEventType.AUTHENTICATION_FAILED,
                deviceUuid: uuid,
                ipAddress,
                userAgent,
                severity: audit_logger_1.AuditSeverity.WARNING,
                details: { reason: 'Invalid device API key' }
            });
            return res.status(401).json({
                error: 'Authentication failed',
                message: 'Invalid device API key'
            });
        }
        console.log('✅ Key exchange successful - device API key verified');
        await (0, audit_logger_1.logAuditEvent)({
            eventType: audit_logger_1.AuditEventType.KEY_EXCHANGE_SUCCESS,
            deviceUuid: uuid,
            ipAddress,
            userAgent,
            severity: audit_logger_1.AuditSeverity.INFO,
            details: { deviceName: device.device_name }
        });
        res.json({
            status: 'ok',
            message: 'Key exchange successful',
            device: {
                id: device.id,
                uuid: device.uuid,
                deviceName: device.device_name,
            }
        });
    }
    catch (error) {
        console.error('❌ Error during key exchange:', error);
        await (0, audit_logger_1.logAuditEvent)({
            eventType: audit_logger_1.AuditEventType.KEY_EXCHANGE_FAILED,
            deviceUuid: req.params.uuid,
            ipAddress,
            userAgent,
            severity: audit_logger_1.AuditSeverity.ERROR,
            details: { error: error.message }
        });
        res.status(500).json({
            error: 'Key exchange failed',
            message: error.message
        });
    }
});
exports.router.get('/api/v1/device/:uuid/state', async (req, res) => {
    try {
        const { uuid } = req.params;
        const ifNoneMatch = req.headers['if-none-match'];
        await models_1.DeviceModel.getOrCreate(uuid);
        const targetState = await models_1.DeviceTargetStateModel.get(uuid);
        console.log(`📡 Device ${uuid.substring(0, 8)}... polling for target state`);
        if (!targetState) {
            console.log('   No target state found - returning empty');
            const emptyState = { [uuid]: { apps: {} } };
            const etag = Buffer.from(JSON.stringify(emptyState))
                .toString('base64')
                .substring(0, 32);
            return res.set('ETag', etag).json(emptyState);
        }
        const etag = models_1.DeviceTargetStateModel.generateETag(targetState);
        console.log(`   Version: ${targetState.version}, Updated: ${targetState.updated_at}`);
        console.log(`   Generated ETag: ${etag}`);
        console.log(`   Client ETag:    ${ifNoneMatch || 'none'}`);
        console.log(`   Apps in DB: ${JSON.stringify(Object.keys(targetState.apps || {}))}`);
        if (ifNoneMatch && ifNoneMatch === etag) {
            console.log('   ✅ ETags match - returning 304 Not Modified');
            return res.status(304).end();
        }
        console.log('   🎯 ETags differ - sending new state');
        const response = {
            [uuid]: {
                apps: typeof targetState.apps === 'string'
                    ? JSON.parse(targetState.apps)
                    : targetState.apps
            }
        };
        res.set('ETag', etag).json(response);
    }
    catch (error) {
        console.error('Error getting device state:', error);
        res.status(500).json({
            error: 'Failed to get device state',
            message: error.message
        });
    }
});
exports.router.post('/api/v1/device/:uuid/logs', async (req, res) => {
    try {
        const { uuid } = req.params;
        const logs = req.body;
        console.log(`📥 Received logs from device ${uuid.substring(0, 8)}...`);
        await models_1.DeviceModel.getOrCreate(uuid);
        if (Array.isArray(logs)) {
            await models_1.DeviceLogsModel.store(uuid, logs);
            console.log(`   Stored ${logs.length} log entries`);
        }
        res.json({ status: 'ok', received: logs.length || 0 });
    }
    catch (error) {
        console.error('Error storing logs:', error);
        res.status(500).json({
            error: 'Failed to process logs',
            message: error.message
        });
    }
});
exports.router.patch('/api/v1/device/state', async (req, res) => {
    try {
        const stateReport = req.body;
        for (const uuid in stateReport) {
            const deviceState = stateReport[uuid];
            console.log(`📥 Received state report from device ${uuid.substring(0, 8)}...`);
            await models_1.DeviceModel.getOrCreate(uuid);
            await models_1.DeviceCurrentStateModel.update(uuid, deviceState.apps || {}, deviceState.config || {}, {
                ip_address: deviceState.ip_address,
                mac_address: deviceState.mac_address,
                os_version: deviceState.os_version,
                supervisor_version: deviceState.supervisor_version,
                uptime: deviceState.uptime,
            });
            const oldState = await models_1.DeviceCurrentStateModel.get(uuid);
            const stateChanged = !oldState || !(0, event_sourcing_1.objectsAreEqual)(oldState.apps, deviceState.apps);
            if (event_sourcing_2.default.shouldPublishStateUpdate(stateChanged)) {
                await eventPublisher.publish('current_state.updated', 'device', uuid, {
                    apps: deviceState.apps || {},
                    config: deviceState.config || {},
                    system_info: {
                        ip_address: deviceState.ip_address || deviceState.local_ip,
                        mac_address: deviceState.mac_address,
                        os_version: deviceState.os_version,
                        supervisor_version: deviceState.supervisor_version,
                        uptime: deviceState.uptime,
                        cpu_usage: deviceState.cpu_usage,
                        memory_usage: deviceState.memory_usage,
                        storage_usage: deviceState.storage_usage
                    },
                    apps_count: Object.keys(deviceState.apps || {}).length,
                    reported_at: new Date().toISOString(),
                    changed_from: oldState ? {
                        apps_count: Object.keys(oldState.apps || {}).length
                    } : null
                }, {
                    metadata: {
                        ip_address: req.ip,
                        endpoint: '/api/v1/device/state',
                        change_detection: stateChanged ? 'apps_changed' : 'no_change',
                        config_mode: event_sourcing_2.default.PUBLISH_STATE_UPDATES
                    }
                });
            }
            const updateFields = {};
            if (deviceState.ip_address)
                updateFields.ip_address = deviceState.ip_address;
            if (deviceState.local_ip)
                updateFields.ip_address = deviceState.local_ip;
            if (deviceState.mac_address)
                updateFields.mac_address = deviceState.mac_address;
            if (deviceState.os_version)
                updateFields.os_version = deviceState.os_version;
            if (deviceState.supervisor_version)
                updateFields.supervisor_version = deviceState.supervisor_version;
            if (Object.keys(updateFields).length > 0) {
                await models_1.DeviceModel.update(uuid, updateFields);
            }
            if (deviceState.cpu_usage !== undefined ||
                deviceState.memory_usage !== undefined ||
                deviceState.storage_usage !== undefined) {
                await models_1.DeviceMetricsModel.record(uuid, {
                    cpu_usage: deviceState.cpu_usage,
                    cpu_temp: deviceState.cpu_temp,
                    memory_usage: deviceState.memory_usage,
                    memory_total: deviceState.memory_total,
                    storage_usage: deviceState.storage_usage,
                    storage_total: deviceState.storage_total,
                });
            }
        }
        res.json({ status: 'ok' });
    }
    catch (error) {
        console.error('Error processing state report:', error);
        res.status(500).json({
            error: 'Failed to process state report',
            message: error.message
        });
    }
});
exports.router.get('/api/v1/devices', async (req, res) => {
    try {
        const isOnline = req.query.online === 'true' ? true :
            req.query.online === 'false' ? false :
                undefined;
        const devices = await models_1.DeviceModel.list({ isOnline });
        const enhancedDevices = await Promise.all(devices.map(async (device) => {
            const targetState = await models_1.DeviceTargetStateModel.get(device.uuid);
            const currentState = await models_1.DeviceCurrentStateModel.get(device.uuid);
            return {
                uuid: device.uuid,
                device_name: device.device_name,
                device_type: device.device_type,
                provisioning_state: device.provisioning_state,
                status: device.status,
                is_online: device.is_online,
                last_connectivity_event: device.last_connectivity_event,
                ip_address: device.ip_address,
                os_version: device.os_version,
                supervisor_version: device.supervisor_version,
                cpu_usage: device.cpu_usage,
                cpu_temp: device.cpu_temp,
                memory_usage: device.memory_usage,
                memory_total: device.memory_total,
                storage_usage: device.storage_usage,
                storage_total: device.storage_total,
                target_apps_count: targetState ? Object.keys(targetState.apps || {}).length : 0,
                current_apps_count: currentState ? Object.keys(currentState.apps || {}).length : 0,
                last_reported: currentState?.reported_at,
                created_at: device.created_at,
            };
        }));
        res.json({
            count: enhancedDevices.length,
            devices: enhancedDevices,
        });
    }
    catch (error) {
        console.error('Error listing devices:', error);
        res.status(500).json({
            error: 'Failed to list devices',
            message: error.message
        });
    }
});
exports.router.get('/api/v1/devices/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        const device = await models_1.DeviceModel.getByUuid(uuid);
        if (!device) {
            return res.status(404).json({
                error: 'Device not found',
                message: `Device ${uuid} not found`
            });
        }
        const targetState = await models_1.DeviceTargetStateModel.get(uuid);
        const currentState = await models_1.DeviceCurrentStateModel.get(uuid);
        res.json({
            device,
            target_state: targetState ? {
                apps: typeof targetState.apps === 'string' ? JSON.parse(targetState.apps) : targetState.apps,
                config: typeof targetState.config === 'string' ? JSON.parse(targetState.config) : targetState.config,
                version: targetState.version,
                updated_at: targetState.updated_at,
            } : { apps: {}, config: {} },
            current_state: currentState ? {
                apps: typeof currentState.apps === 'string' ? JSON.parse(currentState.apps) : currentState.apps,
                config: typeof currentState.config === 'string' ? JSON.parse(currentState.config) : currentState.config,
                system_info: typeof currentState.system_info === 'string' ? JSON.parse(currentState.system_info) : currentState.system_info,
                reported_at: currentState.reported_at,
            } : null,
        });
    }
    catch (error) {
        console.error('Error getting device:', error);
        res.status(500).json({
            error: 'Failed to get device',
            message: error.message
        });
    }
});
exports.router.get('/api/v1/devices/:uuid/target-state', async (req, res) => {
    try {
        const { uuid } = req.params;
        const targetState = await models_1.DeviceTargetStateModel.get(uuid);
        res.json({
            uuid,
            apps: targetState ?
                (typeof targetState.apps === 'string' ? JSON.parse(targetState.apps) : targetState.apps) :
                {},
            config: targetState ?
                (typeof targetState.config === 'string' ? JSON.parse(targetState.config) : targetState.config) :
                {},
            version: targetState?.version,
            updated_at: targetState?.updated_at,
        });
    }
    catch (error) {
        console.error('Error getting target state:', error);
        res.status(500).json({
            error: 'Failed to get target state',
            message: error.message
        });
    }
});
exports.router.post('/api/v1/devices/:uuid/target-state', async (req, res) => {
    try {
        const { uuid } = req.params;
        const { apps, config } = req.body;
        if (!apps || typeof apps !== 'object') {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Body must contain apps object'
            });
        }
        const oldTargetState = await models_1.DeviceTargetStateModel.get(uuid);
        const targetState = await models_1.DeviceTargetStateModel.set(uuid, apps, config || {});
        console.log(`🎯 Target state updated for device ${uuid.substring(0, 8)}...`);
        console.log(`   Apps: ${Object.keys(apps).length}, Version: ${targetState.version}`);
        await eventPublisher.publish('target_state.updated', 'device', uuid, {
            new_state: { apps, config },
            old_state: oldTargetState ? {
                apps: typeof oldTargetState.apps === 'string' ? JSON.parse(oldTargetState.apps) : oldTargetState.apps,
                config: typeof oldTargetState.config === 'string' ? JSON.parse(oldTargetState.config) : oldTargetState.config
            } : { apps: {}, config: {} },
            version: targetState.version,
            apps_added: Object.keys(apps).filter(appId => !oldTargetState?.apps?.[appId]),
            apps_removed: oldTargetState ? Object.keys(oldTargetState.apps || {}).filter(appId => !apps[appId]) : [],
            apps_count: Object.keys(apps).length
        }, {
            metadata: {
                ip_address: req.ip,
                user_agent: req.headers['user-agent'],
                endpoint: '/api/v1/devices/:uuid/target-state'
            }
        });
        res.json({
            status: 'ok',
            message: 'Target state updated',
            uuid,
            version: targetState.version,
            apps,
            config,
        });
    }
    catch (error) {
        console.error('Error setting target state:', error);
        res.status(500).json({
            error: 'Failed to set target state',
            message: error.message
        });
    }
});
exports.router.get('/api/v1/devices/:uuid/current-state', async (req, res) => {
    try {
        const { uuid } = req.params;
        const currentState = await models_1.DeviceCurrentStateModel.get(uuid);
        if (!currentState) {
            return res.status(404).json({
                error: 'No state reported yet',
                message: `Device ${uuid} has not reported its state yet`
            });
        }
        res.json({
            apps: typeof currentState.apps === 'string' ? JSON.parse(currentState.apps) : currentState.apps,
            config: typeof currentState.config === 'string' ? JSON.parse(currentState.config) : currentState.config,
            system_info: typeof currentState.system_info === 'string' ? JSON.parse(currentState.system_info) : currentState.system_info,
            reported_at: currentState.reported_at,
        });
    }
    catch (error) {
        console.error('Error getting current state:', error);
        res.status(500).json({
            error: 'Failed to get current state',
            message: error.message
        });
    }
});
exports.router.delete('/api/v1/devices/:uuid/target-state', async (req, res) => {
    try {
        const { uuid } = req.params;
        await models_1.DeviceTargetStateModel.clear(uuid);
        console.log(`🧹 Cleared target state for device ${uuid.substring(0, 8)}...`);
        res.json({
            status: 'ok',
            message: 'Target state cleared',
        });
    }
    catch (error) {
        console.error('Error clearing target state:', error);
        res.status(500).json({
            error: 'Failed to clear target state',
            message: error.message
        });
    }
});
exports.router.get('/api/v1/devices/:uuid/logs', async (req, res) => {
    try {
        const { uuid } = req.params;
        const serviceName = req.query.service;
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const logs = await models_1.DeviceLogsModel.get(uuid, {
            serviceName,
            limit,
            offset,
        });
        res.json({
            count: logs.length,
            logs,
        });
    }
    catch (error) {
        console.error('Error getting logs:', error);
        res.status(500).json({
            error: 'Failed to get logs',
            message: error.message
        });
    }
});
exports.router.get('/api/v1/devices/:uuid/metrics', async (req, res) => {
    try {
        const { uuid } = req.params;
        const limit = parseInt(req.query.limit) || 100;
        const metrics = await models_1.DeviceMetricsModel.getRecent(uuid, limit);
        res.json({
            count: metrics.length,
            metrics,
        });
    }
    catch (error) {
        console.error('Error getting metrics:', error);
        res.status(500).json({
            error: 'Failed to get metrics',
            message: error.message
        });
    }
});
exports.router.patch('/api/v1/devices/:uuid/active', async (req, res) => {
    try {
        const { uuid } = req.params;
        const { is_active } = req.body;
        if (typeof is_active !== 'boolean') {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'is_active must be a boolean (true or false)'
            });
        }
        const device = await models_1.DeviceModel.getByUuid(uuid);
        if (!device) {
            return res.status(404).json({
                error: 'Device not found',
                message: `Device ${uuid} not found`
            });
        }
        const updatedDevice = await models_1.DeviceModel.update(uuid, { is_active });
        const action = is_active ? 'enabled' : 'disabled';
        console.log(`${is_active ? '✅' : '🚫'} Device ${action}: ${device.device_name || uuid.substring(0, 8) + '...'}`);
        await eventPublisher.publish(is_active ? 'device.online' : 'device.offline', 'device', uuid, {
            device_name: device.device_name,
            device_type: device.device_type,
            previous_state: device.is_active,
            new_state: is_active,
            reason: is_active ? 'administratively enabled' : 'administratively disabled',
            changed_at: new Date().toISOString()
        }, {
            metadata: {
                ip_address: req.ip,
                user_agent: req.headers['user-agent'],
                endpoint: '/api/v1/devices/:uuid/active'
            }
        });
        await (0, audit_logger_1.logAuditEvent)({
            eventType: is_active ? audit_logger_1.AuditEventType.DEVICE_REGISTERED : audit_logger_1.AuditEventType.DEVICE_OFFLINE,
            deviceUuid: uuid,
            severity: audit_logger_1.AuditSeverity.INFO,
            details: {
                action: `device_${action}`,
                deviceName: device.device_name,
                previousState: device.is_active,
                newState: is_active
            }
        });
        res.json({
            status: 'ok',
            message: `Device ${action}`,
            device: {
                uuid: updatedDevice.uuid,
                device_name: updatedDevice.device_name,
                is_active: updatedDevice.is_active,
                is_online: updatedDevice.is_online
            }
        });
    }
    catch (error) {
        console.error('Error updating device active status:', error);
        res.status(500).json({
            error: 'Failed to update device status',
            message: error.message
        });
    }
});
exports.router.delete('/api/v1/devices/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        const device = await models_1.DeviceModel.getByUuid(uuid);
        if (!device) {
            return res.status(404).json({
                error: 'Device not found',
                message: `Device ${uuid} not found`
            });
        }
        await models_1.DeviceModel.delete(uuid);
        console.log(`🗑️  Deleted device ${uuid.substring(0, 8)}...`);
        res.json({
            status: 'ok',
            message: 'Device deleted',
        });
    }
    catch (error) {
        console.error('Error deleting device:', error);
        res.status(500).json({
            error: 'Failed to delete device',
            message: error.message
        });
    }
});
exports.router.get('/api/v1/admin/heartbeat', async (req, res) => {
    try {
        const heartbeatMonitor = await Promise.resolve().then(() => __importStar(require('../services/heartbeat-monitor')));
        const config = heartbeatMonitor.default.getConfig();
        res.json({
            status: 'ok',
            heartbeat: config
        });
    }
    catch (error) {
        console.error('Error getting heartbeat config:', error);
        res.status(500).json({
            error: 'Failed to get heartbeat configuration',
            message: error.message
        });
    }
});
exports.router.post('/api/v1/admin/heartbeat/check', async (req, res) => {
    try {
        console.log('🔍 Manual heartbeat check triggered');
        const heartbeatMonitor = await Promise.resolve().then(() => __importStar(require('../services/heartbeat-monitor')));
        await heartbeatMonitor.default.checkNow();
        res.json({
            status: 'ok',
            message: 'Heartbeat check completed'
        });
    }
    catch (error) {
        console.error('Error during manual heartbeat check:', error);
        res.status(500).json({
            error: 'Failed to perform heartbeat check',
            message: error.message
        });
    }
});
exports.router.post('/api/v1/applications', async (req, res) => {
    try {
        const { appName, slug, description, defaultConfig } = req.body;
        if (!appName || typeof appName !== 'string') {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'appName is required and must be a string'
            });
        }
        if (!slug || typeof slug !== 'string') {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'slug is required and must be a string (URL-safe identifier)'
            });
        }
        if (defaultConfig && typeof defaultConfig !== 'object') {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'defaultConfig must be an object'
            });
        }
        const existingApp = await (0, connection_1.query)('SELECT id, app_name FROM applications WHERE slug = $1', [slug]);
        if (existingApp.rows.length > 0) {
            return res.status(409).json({
                error: 'Conflict',
                message: `Application with slug "${slug}" already exists (ID: ${existingApp.rows[0].id})`
            });
        }
        const idResult = await (0, connection_1.query)("SELECT nextval('global_app_id_seq') as nextval");
        const appId = idResult.rows[0].nextval;
        const result = await (0, connection_1.query)(`INSERT INTO applications (id, app_name, slug, description, default_config)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`, [
            appId,
            appName,
            slug,
            description || '',
            JSON.stringify(defaultConfig || { services: [] })
        ]);
        const app = result.rows[0];
        await (0, connection_1.query)(`INSERT INTO app_service_ids (entity_type, entity_id, entity_name, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5)`, [
            'app',
            appId,
            appName,
            JSON.stringify({ slug, description }),
            req.headers['x-user-id'] || 'system'
        ]);
        console.log(`✅ Created application template: ${appName} (ID: ${appId}, slug: ${slug})`);
        res.status(201).json({
            appId: app.id,
            appName: app.app_name,
            slug: app.slug,
            description: app.description,
            defaultConfig: typeof app.default_config === 'string'
                ? JSON.parse(app.default_config)
                : app.default_config,
            createdAt: app.created_at
        });
    }
    catch (error) {
        console.error('Error creating application template:', error);
        res.status(500).json({
            error: 'Failed to create application template',
            message: error.message
        });
    }
});
exports.router.get('/api/v1/applications', async (req, res) => {
    try {
        const { search } = req.query;
        let sql = 'SELECT * FROM applications WHERE 1=1';
        const params = [];
        if (search && typeof search === 'string') {
            params.push(`%${search}%`);
            sql += ` AND (app_name ILIKE $${params.length} OR description ILIKE $${params.length})`;
        }
        sql += ' ORDER BY id DESC';
        const result = await (0, connection_1.query)(sql, params);
        const applications = result.rows.map(app => ({
            appId: app.id,
            appName: app.app_name,
            slug: app.slug,
            description: app.description,
            defaultConfig: typeof app.default_config === 'string'
                ? JSON.parse(app.default_config)
                : app.default_config,
            createdAt: app.created_at,
            modifiedAt: app.modified_at
        }));
        res.json({
            count: applications.length,
            applications
        });
    }
    catch (error) {
        console.error('Error listing applications:', error);
        res.status(500).json({
            error: 'Failed to list applications',
            message: error.message
        });
    }
});
exports.router.get('/api/v1/applications/:appId', async (req, res) => {
    try {
        const appId = parseInt(req.params.appId);
        if (isNaN(appId)) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'appId must be a number'
            });
        }
        const result = await (0, connection_1.query)('SELECT * FROM applications WHERE id = $1', [appId]);
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Not found',
                message: `Application with ID ${appId} not found`
            });
        }
        const app = result.rows[0];
        res.json({
            appId: app.id,
            appName: app.app_name,
            slug: app.slug,
            description: app.description,
            defaultConfig: typeof app.default_config === 'string'
                ? JSON.parse(app.default_config)
                : app.default_config,
            createdAt: app.created_at,
            modifiedAt: app.modified_at
        });
    }
    catch (error) {
        console.error('Error getting application:', error);
        res.status(500).json({
            error: 'Failed to get application',
            message: error.message
        });
    }
});
exports.router.patch('/api/v1/applications/:appId', async (req, res) => {
    try {
        const appId = parseInt(req.params.appId);
        const { appName, description, defaultConfig } = req.body;
        if (isNaN(appId)) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'appId must be a number'
            });
        }
        const updates = [];
        const params = [];
        let paramIndex = 1;
        if (appName !== undefined) {
            params.push(appName);
            updates.push(`app_name = $${paramIndex++}`);
        }
        if (description !== undefined) {
            params.push(description);
            updates.push(`description = $${paramIndex++}`);
        }
        if (defaultConfig !== undefined) {
            params.push(JSON.stringify(defaultConfig));
            updates.push(`default_config = $${paramIndex++}`);
        }
        updates.push(`modified_at = CURRENT_TIMESTAMP`);
        if (updates.length === 1) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'At least one field must be provided for update'
            });
        }
        params.push(appId);
        const sql = `UPDATE applications SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
        const result = await (0, connection_1.query)(sql, params);
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Not found',
                message: `Application with ID ${appId} not found`
            });
        }
        const app = result.rows[0];
        console.log(`✅ Updated application template: ${app.app_name} (ID: ${appId})`);
        res.json({
            appId: app.id,
            appName: app.app_name,
            slug: app.slug,
            description: app.description,
            defaultConfig: typeof app.default_config === 'string'
                ? JSON.parse(app.default_config)
                : app.default_config,
            modifiedAt: app.modified_at
        });
    }
    catch (error) {
        console.error('Error updating application:', error);
        res.status(500).json({
            error: 'Failed to update application',
            message: error.message
        });
    }
});
exports.router.delete('/api/v1/applications/:appId', async (req, res) => {
    try {
        const appId = parseInt(req.params.appId);
        if (isNaN(appId)) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'appId must be a number'
            });
        }
        const devicesUsing = await (0, connection_1.query)(`SELECT device_uuid, apps 
       FROM device_target_state 
       WHERE apps::text LIKE $1`, [`%"appId":${appId}%`]);
        if (devicesUsing.rows.length > 0) {
            return res.status(409).json({
                error: 'Conflict',
                message: `Cannot delete application: ${devicesUsing.rows.length} device(s) are using this app`,
                devicesAffected: devicesUsing.rows.map(r => r.device_uuid)
            });
        }
        const result = await (0, connection_1.query)('DELETE FROM applications WHERE id = $1 RETURNING app_name', [appId]);
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Not found',
                message: `Application with ID ${appId} not found`
            });
        }
        console.log(`🗑️  Deleted application template: ${result.rows[0].app_name} (ID: ${appId})`);
        res.json({
            status: 'ok',
            message: 'Application template deleted',
            appId
        });
    }
    catch (error) {
        console.error('Error deleting application:', error);
        res.status(500).json({
            error: 'Failed to delete application',
            message: error.message
        });
    }
});
exports.router.post('/api/v1/devices/:uuid/apps', async (req, res) => {
    try {
        const { uuid } = req.params;
        const { appId, services } = req.body;
        if (!appId || typeof appId !== 'number') {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'appId is required and must be a number'
            });
        }
        if (!services || !Array.isArray(services)) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'services is required and must be an array'
            });
        }
        const appResult = await (0, connection_1.query)('SELECT * FROM applications WHERE id = $1', [appId]);
        if (appResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Not found',
                message: `Application ${appId} not found in catalog`
            });
        }
        const app = appResult.rows[0];
        const device = await models_1.DeviceModel.getByUuid(uuid);
        if (!device) {
            return res.status(404).json({
                error: 'Not found',
                message: `Device ${uuid} not found`
            });
        }
        const currentTarget = await models_1.DeviceTargetStateModel.get(uuid);
        const currentApps = currentTarget?.apps || {};
        const servicesWithIds = await Promise.all(services.map(async (service, index) => {
            const idResult = await (0, connection_1.query)("SELECT nextval('global_service_id_seq') as nextval");
            const serviceId = idResult.rows[0].nextval;
            await (0, connection_1.query)(`INSERT INTO app_service_ids (entity_type, entity_id, entity_name, metadata, created_by)
           VALUES ($1, $2, $3, $4, $5)`, [
                'service',
                serviceId,
                service.serviceName,
                JSON.stringify({
                    appId,
                    appName: app.app_name,
                    imageName: service.image
                }),
                req.headers['x-user-id'] || 'system'
            ]);
            return {
                serviceId,
                serviceName: service.serviceName,
                imageName: service.image,
                config: {
                    ...(service.ports && { ports: service.ports }),
                    ...(service.environment && { environment: service.environment }),
                    ...(service.volumes && { volumes: service.volumes }),
                    ...(service.config || {})
                }
            };
        }));
        const newApps = {
            ...currentApps,
            [appId]: {
                appId,
                appName: app.app_name,
                services: servicesWithIds
            }
        };
        await models_1.DeviceTargetStateModel.set(uuid, newApps, currentTarget?.config || {});
        console.log(`🚀 Deployed app ${appId} (${app.app_name}) to device ${uuid.substring(0, 8)}...`);
        console.log(`   Services: ${servicesWithIds.map(s => s.serviceName).join(', ')}`);
        res.status(201).json({
            status: 'ok',
            message: 'Application deployed to device',
            deviceUuid: uuid,
            appId,
            appName: app.app_name,
            services: servicesWithIds
        });
    }
    catch (error) {
        console.error('Error deploying application:', error);
        res.status(500).json({
            error: 'Failed to deploy application',
            message: error.message
        });
    }
});
exports.router.patch('/api/v1/devices/:uuid/apps/:appId', async (req, res) => {
    try {
        const { uuid, appId: appIdStr } = req.params;
        const { services } = req.body;
        const appId = parseInt(appIdStr);
        if (isNaN(appId)) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'appId must be a number'
            });
        }
        if (!services || !Array.isArray(services)) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'services is required and must be an array'
            });
        }
        const currentTarget = await models_1.DeviceTargetStateModel.get(uuid);
        if (!currentTarget) {
            return res.status(404).json({
                error: 'Not found',
                message: `Device ${uuid} has no target state`
            });
        }
        const currentApps = currentTarget.apps || {};
        if (!currentApps[appId]) {
            return res.status(404).json({
                error: 'Not found',
                message: `App ${appId} not deployed on device ${uuid}`
            });
        }
        const servicesWithIds = await Promise.all(services.map(async (service) => {
            const idResult = await (0, connection_1.query)("SELECT nextval('global_service_id_seq') as nextval");
            const serviceId = idResult.rows[0].nextval;
            return {
                serviceId,
                serviceName: service.serviceName,
                imageName: service.image,
                config: {
                    ...(service.ports && { ports: service.ports }),
                    ...(service.environment && { environment: service.environment }),
                    ...(service.volumes && { volumes: service.volumes }),
                    ...(service.config || {})
                }
            };
        }));
        currentApps[appId].services = servicesWithIds;
        await models_1.DeviceTargetStateModel.set(uuid, currentApps, currentTarget.config || {});
        console.log(`✅ Updated app ${appId} on device ${uuid.substring(0, 8)}...`);
        res.json({
            status: 'ok',
            message: 'Application updated on device',
            deviceUuid: uuid,
            appId,
            services: servicesWithIds
        });
    }
    catch (error) {
        console.error('Error updating application:', error);
        res.status(500).json({
            error: 'Failed to update application',
            message: error.message
        });
    }
});
exports.router.delete('/api/v1/devices/:uuid/apps/:appId', async (req, res) => {
    try {
        const { uuid, appId: appIdStr } = req.params;
        const appId = parseInt(appIdStr);
        if (isNaN(appId)) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'appId must be a number'
            });
        }
        const currentTarget = await models_1.DeviceTargetStateModel.get(uuid);
        if (!currentTarget) {
            return res.status(404).json({
                error: 'Not found',
                message: `Device ${uuid} has no target state`
            });
        }
        const currentApps = currentTarget.apps || {};
        if (!currentApps[appId]) {
            return res.status(404).json({
                error: 'Not found',
                message: `App ${appId} not deployed on device ${uuid}`
            });
        }
        const appName = currentApps[appId].appName;
        delete currentApps[appId];
        await models_1.DeviceTargetStateModel.set(uuid, currentApps, currentTarget.config || {});
        console.log(`🗑️  Removed app ${appId} (${appName}) from device ${uuid.substring(0, 8)}...`);
        res.json({
            status: 'ok',
            message: 'Application removed from device',
            deviceUuid: uuid,
            appId,
            appName
        });
    }
    catch (error) {
        console.error('Error removing application:', error);
        res.status(500).json({
            error: 'Failed to remove application',
            message: error.message
        });
    }
});
exports.router.post('/api/v1/apps/next-id', async (req, res) => {
    try {
        const { appName, metadata } = req.body;
        if (!appName || typeof appName !== 'string') {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'appName is required and must be a string'
            });
        }
        const idResult = await (0, connection_1.query)("SELECT nextval('global_app_id_seq') as nextval");
        const appId = idResult.rows[0].nextval;
        await (0, connection_1.query)(`INSERT INTO app_service_ids (entity_type, entity_id, entity_name, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (entity_type, entity_id) DO UPDATE SET
         entity_name = $3,
         metadata = $4`, [
            'app',
            appId,
            appName,
            metadata ? JSON.stringify(metadata) : '{}',
            req.headers['x-user-id'] || 'system'
        ]);
        console.log(`✅ Generated app ID ${appId} for "${appName}"`);
        res.json({
            appId,
            appName,
            metadata: metadata || {}
        });
    }
    catch (error) {
        console.error('Error generating app ID:', error);
        res.status(500).json({
            error: 'Failed to generate app ID',
            message: error.message
        });
    }
});
exports.router.post('/api/v1/services/next-id', async (req, res) => {
    try {
        const { serviceName, appId, imageName, metadata } = req.body;
        if (!serviceName || typeof serviceName !== 'string') {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'serviceName is required and must be a string'
            });
        }
        if (!appId || typeof appId !== 'number') {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'appId is required and must be a number'
            });
        }
        const idResult = await (0, connection_1.query)("SELECT nextval('global_service_id_seq') as nextval");
        const serviceId = idResult.rows[0].nextval;
        const fullMetadata = {
            appId,
            ...(imageName && { imageName }),
            ...(metadata || {})
        };
        await (0, connection_1.query)(`INSERT INTO app_service_ids (entity_type, entity_id, entity_name, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (entity_type, entity_id) DO UPDATE SET
         entity_name = $3,
         metadata = $4`, [
            'service',
            serviceId,
            serviceName,
            JSON.stringify(fullMetadata),
            req.headers['x-user-id'] || 'system'
        ]);
        console.log(`✅ Generated service ID ${serviceId} for "${serviceName}" (app ${appId})`);
        res.json({
            serviceId,
            serviceName,
            appId,
            imageName,
            metadata: fullMetadata
        });
    }
    catch (error) {
        console.error('Error generating service ID:', error);
        res.status(500).json({
            error: 'Failed to generate service ID',
            message: error.message
        });
    }
});
exports.router.get('/api/v1/apps-services/registry', async (req, res) => {
    try {
        const { type } = req.query;
        let sql = 'SELECT * FROM app_service_ids WHERE 1=1';
        const params = [];
        if (type === 'app' || type === 'service') {
            params.push(type);
            sql += ` AND entity_type = $${params.length}`;
        }
        sql += ' ORDER BY entity_id DESC';
        const result = await (0, connection_1.query)(sql, params);
        res.json({
            count: result.rows.length,
            items: result.rows.map(row => ({
                id: row.id,
                type: row.entity_type,
                entityId: row.entity_id,
                name: row.entity_name,
                metadata: row.metadata,
                createdBy: row.created_by,
                createdAt: row.created_at
            }))
        });
    }
    catch (error) {
        console.error('Error fetching app/service registry:', error);
        res.status(500).json({
            error: 'Failed to fetch registry',
            message: error.message
        });
    }
});
exports.router.get('/api/v1/apps-services/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        if (type !== 'app' && type !== 'service') {
            return res.status(400).json({
                error: 'Invalid type',
                message: 'type must be "app" or "service"'
            });
        }
        const entityId = parseInt(id);
        if (isNaN(entityId)) {
            return res.status(400).json({
                error: 'Invalid ID',
                message: 'id must be a number'
            });
        }
        const result = await (0, connection_1.query)('SELECT * FROM app_service_ids WHERE entity_type = $1 AND entity_id = $2', [type, entityId]);
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Not found',
                message: `${type} with ID ${entityId} not found`
            });
        }
        const row = result.rows[0];
        res.json({
            id: row.id,
            type: row.entity_type,
            entityId: row.entity_id,
            name: row.entity_name,
            metadata: row.metadata,
            createdBy: row.created_by,
            createdAt: row.created_at
        });
    }
    catch (error) {
        console.error('Error fetching app/service:', error);
        res.status(500).json({
            error: 'Failed to fetch app/service',
            message: error.message
        });
    }
});
exports.default = exports.router;
//# sourceMappingURL=cloud.js.map