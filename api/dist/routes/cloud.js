"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const models_1 = require("../db/models");
const provisioning_keys_1 = require("../utils/provisioning-keys");
const audit_logger_1 = require("../utils/audit-logger");
exports.router = express_1.default.Router();
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
        const ifNoneMatch = req.headers['If-None-Match'];
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
        const targetState = await models_1.DeviceTargetStateModel.set(uuid, apps, config || {});
        console.log(`🎯 Target state updated for device ${uuid.substring(0, 8)}...`);
        console.log(`   Apps: ${Object.keys(apps).length}, Version: ${targetState.version}`);
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
exports.default = exports.router;
//# sourceMappingURL=cloud.js.map