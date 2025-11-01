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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const device_state_1 = __importDefault(require("./routes/device-state"));
const provisioning_1 = __importDefault(require("./routes/provisioning"));
const devices_1 = __importDefault(require("./routes/devices"));
const admin_1 = __importDefault(require("./routes/admin"));
const apps_1 = __importDefault(require("./routes/apps"));
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const rollouts_1 = __importDefault(require("./routes/rollouts"));
const image_registry_1 = __importDefault(require("./routes/image-registry"));
const device_jobs_1 = __importDefault(require("./routes/device-jobs"));
const scheduled_jobs_1 = __importDefault(require("./routes/scheduled-jobs"));
const rotation_1 = __importDefault(require("./routes/rotation"));
const digital_twin_1 = __importDefault(require("./routes/digital-twin"));
const mqtt_monitor_1 = __importDefault(require("./routes/mqtt-monitor"));
const events_1 = __importDefault(require("./routes/events"));
const mqtt_broker_1 = __importDefault(require("./routes/mqtt-broker"));
const sensors_1 = __importDefault(require("./routes/sensors"));
const protocol_devices_1 = require("./routes/protocol-devices");
const traffic_1 = require("./routes/traffic");
const traffic_logger_1 = require("./middleware/traffic-logger");
const traffic_flush_service_1 = require("./services/traffic-flush-service");
const entities_1 = require("./routes/entities");
const relationships_1 = require("./routes/relationships");
const graph_1 = require("./routes/graph");
const rollout_monitor_1 = require("./jobs/rollout-monitor");
const job_scheduler_1 = require("./services/job-scheduler");
const connection_1 = __importDefault(require("./db/connection"));
const mqtt_1 = require("./mqtt");
const rotation_scheduler_1 = require("./services/rotation-scheduler");
const shadow_retention_1 = require("./services/shadow-retention");
const housekeeper_1 = require("./housekeeper");
const mqtt_monitor_2 = require("./routes/mqtt-monitor");
const mqtt_monitor_3 = require("./services/mqtt-monitor");
const mqtt_database_service_1 = require("./services/mqtt-database-service");
const license_validator_1 = require("./services/license-validator");
const license_1 = __importDefault(require("./routes/license"));
const billing_1 = __importDefault(require("./routes/billing"));
const API_VERSION = process.env.API_VERSION || 'v1';
const API_BASE = `/api/${API_VERSION}`;
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3002;
const housekeeper = (0, housekeeper_1.createHousekeeper)();
app.use((0, cors_1.default)({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4002'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-API-Key']
}));
app.use(express_1.default.json({
    limit: '10mb',
    inflate: true
}));
app.use(express_1.default.urlencoded({
    limit: '10mb',
    extended: true,
    inflate: true
}));
app.use(traffic_logger_1.trafficLogger);
app.use((req, res, next) => {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] ➡️  ${req.method} ${req.path}`);
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const responseTimestamp = new Date().toISOString();
        console.log(`[${responseTimestamp}] ⬅️  ${res.statusCode} ${req.method} ${req.path} - ${duration}ms`);
    });
    next();
});
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Iotistic Unified API',
        version: '2.0.0',
        apiVersion: API_VERSION,
        apiBase: API_BASE,
        documentation: '/api/docs'
    });
});
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});
const docs_1 = require("./docs");
(0, docs_1.setupApiDocs)(app, API_BASE);
app.use(`${API_BASE}/auth`, auth_1.default);
app.use(`${API_BASE}/users`, users_1.default);
app.use(API_BASE, license_1.default);
app.use(`${API_BASE}/billing`, billing_1.default);
app.use(API_BASE, provisioning_1.default);
app.use(API_BASE, devices_1.default);
app.use(API_BASE, admin_1.default);
app.use(API_BASE, apps_1.default);
app.use(API_BASE, device_state_1.default);
app.use(`${API_BASE}/webhooks`, webhooks_1.default);
app.use(API_BASE, rollouts_1.default);
app.use(API_BASE, image_registry_1.default);
app.use(API_BASE, device_jobs_1.default);
app.use(API_BASE, scheduled_jobs_1.default);
app.use(API_BASE, rotation_1.default);
app.use(API_BASE, digital_twin_1.default);
app.use(`${API_BASE}/mqtt-monitor`, mqtt_monitor_1.default);
app.use(API_BASE, events_1.default);
app.use(`${API_BASE}/mqtt`, mqtt_broker_1.default);
app.use(API_BASE, sensors_1.default);
app.use(API_BASE, protocol_devices_1.router);
app.use(API_BASE, traffic_1.router);
app.use(`${API_BASE}/entities`, (0, entities_1.createEntitiesRouter)(connection_1.default.pool));
app.use(`${API_BASE}/relationships`, (0, relationships_1.createRelationshipsRouter)(connection_1.default.pool));
app.use(`${API_BASE}/graph`, (0, graph_1.createGraphRouter)(connection_1.default.pool));
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: `Route ${req.method} ${req.path} not found`,
        hint: 'See /api/docs for available endpoints'
    });
});
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});
async function startServer() {
    console.log('🚀 Initializing Iotistic Unified API...\n');
    let mqttMonitor = null;
    try {
        const db = await Promise.resolve().then(() => __importStar(require('./db/connection')));
        const connected = await db.testConnection();
        if (!connected) {
            console.error('❌ Failed to connect to PostgreSQL database');
            process.exit(1);
        }
        await db.initializeSchema();
        console.log('✅ PostgreSQL database initialized successfully\n');
        const { initializeMqttAdmin } = await Promise.resolve().then(() => __importStar(require('./services/mqtt-bootstrap')));
        await initializeMqttAdmin();
    }
    catch (error) {
        console.error('❌ Database initialization error:', error);
        process.exit(1);
    }
    try {
        console.log('🔐 Initializing license validator...');
        const licenseValidator = license_validator_1.LicenseValidator.getInstance();
        await licenseValidator.init();
    }
    catch (error) {
        console.error('⚠️  License validator initialization failed:', error);
    }
    try {
        const heartbeatMonitor = await Promise.resolve().then(() => __importStar(require('./services/heartbeat-monitor')));
        heartbeatMonitor.default.start();
    }
    catch (error) {
        console.error(' Failed to start heartbeat monitor:', error);
    }
    try {
        const rolloutMonitor = (0, rollout_monitor_1.getRolloutMonitor)(connection_1.default.pool);
        rolloutMonitor.start();
        console.log('✅ Rollout Monitor started');
    }
    catch (error) {
        console.error('⚠️  Failed to start rollout monitor:', error);
    }
    try {
        await job_scheduler_1.jobScheduler.start();
        console.log('✅ Job Scheduler started');
    }
    catch (error) {
        console.error('⚠️  Failed to start job scheduler:', error);
    }
    try {
        await housekeeper.initialize();
    }
    catch (error) {
        console.error('⚠️  Failed to start housekeeper:', error);
    }
    try {
        (0, traffic_flush_service_1.startTrafficFlushService)();
        console.log('✅ Traffic flush service started');
    }
    catch (error) {
        console.error('⚠️  Failed to start traffic flush service:', error);
    }
    try {
        const { getMqttJobsSubscriber } = await Promise.resolve().then(() => __importStar(require('./services/mqtt-jobs-subscriber')));
        const subscriber = getMqttJobsSubscriber();
        await subscriber.initialize();
        console.log('✅ MQTT Jobs Subscriber started (listening for device job updates)');
    }
    catch (error) {
        console.error('⚠️  Failed to start MQTT Jobs Subscriber:', error);
    }
    try {
        await (0, mqtt_1.initializeMqtt)();
    }
    catch (error) {
        console.error('⚠️  Failed to initialize MQTT:', error);
    }
    try {
        (0, rotation_scheduler_1.initializeSchedulers)();
        console.log('✅ API key rotation schedulers started');
    }
    catch (error) {
        console.error('⚠️  Failed to start rotation schedulers:', error);
    }
    try {
        (0, shadow_retention_1.startRetentionScheduler)();
        console.log('✅ Shadow history retention scheduler started');
    }
    catch (error) {
        console.error('⚠️  Failed to start retention scheduler:', error);
    }
    let mqttDbService = null;
    if (process.env.MQTT_MONITOR_ENABLED !== 'false') {
        try {
            const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
            const username = process.env.MQTT_USERNAME;
            const password = process.env.MQTT_PASSWORD;
            const persistToDatabase = true;
            if (persistToDatabase) {
                mqttDbService = new mqtt_database_service_1.MQTTDatabaseService(connection_1.default.pool);
                console.log('✅ MQTT Monitor database persistence enabled');
            }
            mqttMonitor = new mqtt_monitor_3.MQTTMonitorService({
                brokerUrl,
                username,
                password,
                topicTreeEnabled: true,
                metricsEnabled: true,
                schemaGenerationEnabled: true,
                persistToDatabase,
                dbSyncInterval: parseInt(process.env.MQTT_DB_SYNC_INTERVAL || '30000')
            }, mqttDbService);
            mqttMonitor.on('connected', () => {
                console.log('✅ MQTT Monitor connected to broker at', brokerUrl);
            });
            mqttMonitor.on('error', (error) => {
                console.error('⚠️  MQTT Monitor error:', error);
            });
            await mqttMonitor.start();
            (0, mqtt_monitor_2.setMonitorInstance)(mqttMonitor, mqttDbService);
            console.log('✅ MQTT Monitor Service started');
        }
        catch (error) {
            console.error('⚠️  Failed to start MQTT Monitor:', error);
        }
    }
    else {
        console.log('ℹ️  MQTT Monitor disabled via MQTT_MONITOR_ENABLED=false');
    }
    const server = app.listen(PORT, () => {
        console.log('='.repeat(80));
        console.log('☁️  Iotistic Unified API Server');
        console.log('='.repeat(80));
        console.log(`Server running on http://localhost:${PORT}`);
        console.log('='.repeat(80) + '\n');
    });
    process.on('SIGTERM', async () => {
        console.log('\nSIGTERM received, shutting down gracefully...');
        try {
            if (mqttMonitor) {
                await mqttMonitor.stop();
                console.log('✅ MQTT Monitor stopped');
            }
        }
        catch (error) {
        }
        try {
            await (0, mqtt_1.shutdownMqtt)();
        }
        catch (error) {
        }
        try {
            (0, rotation_scheduler_1.shutdownSchedulers)();
        }
        catch (error) {
        }
        try {
            (0, shadow_retention_1.stopRetentionScheduler)();
        }
        catch (error) {
        }
        try {
            await housekeeper.shutdown();
        }
        catch (error) {
        }
        try {
            const heartbeatMonitor = await Promise.resolve().then(() => __importStar(require('./services/heartbeat-monitor')));
            heartbeatMonitor.default.stop();
        }
        catch (error) {
        }
        try {
            const { imageMonitor } = await Promise.resolve().then(() => __importStar(require('./services/image-monitor')));
            imageMonitor.stop();
        }
        catch (error) {
        }
        try {
            job_scheduler_1.jobScheduler.stop();
        }
        catch (error) {
        }
        try {
            const { getMqttJobsSubscriber } = await Promise.resolve().then(() => __importStar(require('./services/mqtt-jobs-subscriber')));
            const subscriber = getMqttJobsSubscriber();
            await subscriber.stop();
            console.log('✅ MQTT Jobs Subscriber stopped');
        }
        catch (error) {
        }
        try {
            await (0, traffic_flush_service_1.stopTrafficFlushService)();
            console.log('✅ Traffic flush service stopped');
        }
        catch (error) {
        }
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
    process.on('SIGINT', async () => {
        console.log('\nSIGINT received, shutting down gracefully...');
        try {
            if (mqttMonitor) {
                await mqttMonitor.stop();
                console.log('✅ MQTT Monitor stopped');
            }
        }
        catch (error) {
        }
        try {
            await (0, mqtt_1.shutdownMqtt)();
        }
        catch (error) {
        }
        try {
            (0, rotation_scheduler_1.shutdownSchedulers)();
        }
        catch (error) {
        }
        try {
            (0, shadow_retention_1.stopRetentionScheduler)();
        }
        catch (error) {
        }
        try {
            await housekeeper.shutdown();
        }
        catch (error) {
        }
        try {
            const heartbeatMonitor = await Promise.resolve().then(() => __importStar(require('./services/heartbeat-monitor')));
            heartbeatMonitor.default.stop();
        }
        catch (error) {
        }
        try {
            const { imageMonitor } = await Promise.resolve().then(() => __importStar(require('./services/image-monitor')));
            imageMonitor.stop();
        }
        catch (error) {
        }
        try {
            job_scheduler_1.jobScheduler.stop();
        }
        catch (error) {
        }
        try {
            const { getMqttJobsSubscriber } = await Promise.resolve().then(() => __importStar(require('./services/mqtt-jobs-subscriber')));
            const subscriber = getMqttJobsSubscriber();
            await subscriber.stop();
            console.log('✅ MQTT Jobs Subscriber stopped');
        }
        catch (error) {
        }
        try {
            await (0, traffic_flush_service_1.stopTrafficFlushService)();
            console.log('✅ Traffic flush service stopped');
        }
        catch (error) {
        }
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
}
startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
exports.default = app;
//# sourceMappingURL=index.js.map