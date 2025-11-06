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
const logger_1 = __importDefault(require("./utils/logger"));
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const device_state_1 = __importDefault(require("./routes/device-state"));
const device_logs_1 = __importDefault(require("./routes/device-logs"));
const device_metrics_1 = __importDefault(require("./routes/device-metrics"));
const provisioning_1 = __importDefault(require("./routes/provisioning"));
const devices_1 = __importDefault(require("./routes/devices"));
const admin_1 = __importDefault(require("./routes/admin"));
const apps_1 = __importDefault(require("./routes/apps"));
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const image_registry_1 = __importDefault(require("./routes/image-registry"));
const device_jobs_1 = __importDefault(require("./routes/device-jobs"));
const scheduled_jobs_1 = __importDefault(require("./routes/scheduled-jobs"));
const rotation_1 = __importDefault(require("./routes/rotation"));
const digital_twin_1 = __importDefault(require("./routes/digital-twin"));
const mqtt_monitor_1 = __importDefault(require("./routes/mqtt-monitor"));
const events_1 = __importDefault(require("./routes/events"));
const mqtt_broker_1 = __importDefault(require("./routes/mqtt-broker"));
const sensors_1 = __importDefault(require("./routes/sensors"));
const device_sensors_1 = require("./routes/device-sensors");
const traffic_1 = require("./routes/traffic");
const housekeeper_1 = __importStar(require("./routes/housekeeper"));
const dashboard_layouts_1 = __importDefault(require("./routes/dashboard-layouts"));
const mosquitto_auth_1 = __importDefault(require("./routes/mosquitto-auth"));
const traffic_logger_1 = require("./middleware/traffic-logger");
const traffic_flush_service_1 = require("./services/traffic-flush-service");
const entities_1 = require("./routes/entities");
const relationships_1 = require("./routes/relationships");
const graph_1 = require("./routes/graph");
const job_scheduler_1 = require("./services/job-scheduler");
const connection_1 = __importDefault(require("./db/connection"));
const mqtt_1 = require("./mqtt");
const rotation_scheduler_1 = require("./services/rotation-scheduler");
const shadow_retention_1 = require("./services/shadow-retention");
const housekeeper_2 = require("./housekeeper");
const mqtt_monitor_2 = require("./routes/mqtt-monitor");
const mqtt_monitor_3 = require("./services/mqtt-monitor");
const license_validator_1 = require("./services/license-validator");
const license_1 = __importDefault(require("./routes/license"));
const billing_1 = __importDefault(require("./routes/billing"));
const websocket_manager_1 = require("./services/websocket-manager");
const API_VERSION = process.env.API_VERSION || 'v1';
const API_BASE = `/api/${API_VERSION}`;
const MQTT_MONITOR_ENABLED = process.env.MQTT_MONITOR_ENABLED === 'true';
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3002;
const housekeeper = (0, housekeeper_2.createHousekeeper)();
app.use((0, cors_1.default)({
    origin: ['http://localhost:5173', 'http://localhost:3001', 'http://localhost:3000', 'http://localhost:4002'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-API-Key']
}));
app.options('*', (0, cors_1.default)());
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
    logger_1.default.debug(`${req.method} ${req.path}`, {
        method: req.method,
        path: req.path,
        query: req.query,
        ip: req.ip
    });
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
        logger_1.default[logLevel](`${res.statusCode} ${req.method} ${req.path} - ${duration}ms`);
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
app.use('/mosquitto-auth', mosquitto_auth_1.default);
app.use(`${API_BASE}/billing`, billing_1.default);
app.use(API_BASE, provisioning_1.default);
app.use(API_BASE, devices_1.default);
app.use(API_BASE, admin_1.default);
app.use(API_BASE, apps_1.default);
app.use(API_BASE, device_state_1.default);
app.use(API_BASE, device_logs_1.default);
app.use(API_BASE, device_metrics_1.default);
app.use(`${API_BASE}/webhooks`, webhooks_1.default);
app.use(API_BASE, image_registry_1.default);
app.use(API_BASE, device_jobs_1.default);
app.use(API_BASE, scheduled_jobs_1.default);
app.use(API_BASE, rotation_1.default);
app.use(API_BASE, digital_twin_1.default);
app.use(`${API_BASE}/mqtt-monitor`, mqtt_monitor_1.default);
app.use(API_BASE, events_1.default);
app.use(`${API_BASE}/mqtt`, mqtt_broker_1.default);
app.use(API_BASE, sensors_1.default);
app.use(API_BASE, device_sensors_1.router);
app.use(API_BASE, traffic_1.router);
app.use(`${API_BASE}/housekeeper`, housekeeper_1.default);
app.use(`${API_BASE}/dashboard-layouts`, dashboard_layouts_1.default);
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
    logger_1.default.error('Server error', {
        error: err.message,
        stack: err.stack,
        method: req.method,
        path: req.path
    });
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});
async function startServer() {
    logger_1.default.info('Initializing Iotistic Unified API...');
    let mqttMonitor = null;
    try {
        const db = await Promise.resolve().then(() => __importStar(require('./db/connection')));
        const connected = await db.testConnection();
        if (!connected) {
            logger_1.default.error('Failed to connect to PostgreSQL database');
            process.exit(1);
        }
        await db.initializeSchema();
        logger_1.default.info('PostgreSQL database initialized successfully');
        const { initializeMqttAdmin } = await Promise.resolve().then(() => __importStar(require('./services/mqtt-bootstrap')));
        await initializeMqttAdmin();
    }
    catch (error) {
        logger_1.default.error('Database initialization error', { error });
        process.exit(1);
    }
    try {
        const { SystemConfig } = await Promise.resolve().then(() => __importStar(require('./config/system-config')));
        await SystemConfig.load();
        logger_1.default.info('System configuration loaded successfully');
    }
    catch (error) {
        logger_1.default.error('Failed to load system configuration', { error });
        process.exit(1);
    }
    try {
        logger_1.default.info('Initializing license validator...');
        const licenseValidator = license_validator_1.LicenseValidator.getInstance();
        await licenseValidator.init();
    }
    catch (error) {
        logger_1.default.warn('License validator initialization failed', { error });
    }
    try {
        const heartbeatMonitor = await Promise.resolve().then(() => __importStar(require('./services/heartbeat-monitor')));
        heartbeatMonitor.default.start();
        logger_1.default.info('Heartbeat monitor started');
    }
    catch (error) {
        logger_1.default.warn('Failed to start heartbeat monitor', { error });
    }
    try {
        await job_scheduler_1.jobScheduler.start();
        logger_1.default.info('Job scheduler started');
    }
    catch (error) {
        logger_1.default.warn('Failed to start job scheduler', { error });
    }
    try {
        await housekeeper.initialize();
        (0, housekeeper_1.setHousekeeperInstance)(housekeeper);
        logger_1.default.info('Housekeeper started');
    }
    catch (error) {
        logger_1.default.warn('Failed to start housekeeper', { error });
    }
    try {
        (0, traffic_flush_service_1.startTrafficFlushService)();
        logger_1.default.info('Traffic flush service started');
    }
    catch (error) {
        logger_1.default.warn('Failed to start traffic flush service', { error });
    }
    try {
        const { getMqttJobsSubscriber } = await Promise.resolve().then(() => __importStar(require('./services/mqtt-jobs-subscriber')));
        const subscriber = getMqttJobsSubscriber();
        await subscriber.initialize();
        logger_1.default.info('MQTT Jobs Subscriber started');
    }
    catch (error) {
        logger_1.default.warn('Failed to start MQTT Jobs Subscriber', { error });
    }
    try {
        const { redisClient } = await Promise.resolve().then(() => __importStar(require('./redis/client')));
        await redisClient.connect();
        logger_1.default.info('Redis client connected');
    }
    catch (error) {
        logger_1.default.warn('Failed to initialize Redis', { error });
    }
    try {
        const { startMetricsBatchWorker } = await Promise.resolve().then(() => __importStar(require('./workers/metrics-batch-worker')));
        await startMetricsBatchWorker();
        logger_1.default.info('Metrics batch worker started');
    }
    catch (error) {
        logger_1.default.warn('Failed to start metrics batch worker', { error });
    }
    (async () => {
        try {
            await (0, mqtt_1.initializeMqtt)();
        }
        catch (error) {
            logger_1.default.warn('Failed to initialize MQTT', { error });
            retryMqttInitialization();
        }
    })();
    try {
        (0, rotation_scheduler_1.initializeSchedulers)();
        logger_1.default.info('API key rotation schedulers started');
    }
    catch (error) {
        logger_1.default.warn('Failed to start rotation schedulers', { error });
    }
    if (MQTT_MONITOR_ENABLED) {
        const mqttMonitorBundle = await mqtt_monitor_3.MQTTMonitorService.initialize(connection_1.default.pool);
        if (mqttMonitorBundle.instance) {
            (0, mqtt_monitor_2.setMonitorInstance)(mqttMonitorBundle.instance, mqttMonitorBundle.dbService);
            websocket_manager_1.websocketManager.setMqttMonitor(mqttMonitorBundle.instance);
            logger_1.default.info('MQTT Monitor started');
        }
    }
    else {
        logger_1.default.info('MQTT Monitor disabled via MQTT_MONITOR_ENABLED=false');
    }
    const server = app.listen(PORT, () => {
        logger_1.default.info('='.repeat(80));
        logger_1.default.info('☁️  Iotistic Unified API Server');
        logger_1.default.info('='.repeat(80));
        logger_1.default.info(`Server running on http://localhost:${PORT}`);
        logger_1.default.info('='.repeat(80));
    });
    try {
        websocket_manager_1.websocketManager.initialize(server);
        logger_1.default.info(`WebSocket Server initialized (ws://localhost:${PORT}/ws)`);
        await websocket_manager_1.websocketManager.initializeRedis();
    }
    catch (error) {
        logger_1.default.warn('Failed to initialize WebSocket server', { error });
    }
    process.on('SIGTERM', async () => {
        logger_1.default.info('SIGTERM received, shutting down gracefully...');
        const forceCloseTimeout = setTimeout(() => {
            logger_1.default.warn('Forcefully closing server after timeout');
            process.exit(1);
        }, 10000);
        try {
            websocket_manager_1.websocketManager.shutdown();
            logger_1.default.info('WebSocket Server stopped');
        }
        catch (error) {
        }
        try {
            const { stopMetricsBatchWorker } = await Promise.resolve().then(() => __importStar(require('./workers/metrics-batch-worker')));
            await stopMetricsBatchWorker();
        }
        catch (error) {
        }
        try {
            const { redisClient } = await Promise.resolve().then(() => __importStar(require('./redis/client')));
            await redisClient.disconnect();
        }
        catch (error) {
        }
        try {
            if (mqttMonitor) {
                await mqttMonitor.stop();
                logger_1.default.info('MQTT Monitor stopped');
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
            logger_1.default.info('MQTT Jobs Subscriber stopped');
        }
        catch (error) {
        }
        try {
            await (0, traffic_flush_service_1.stopTrafficFlushService)();
            logger_1.default.info('Traffic flush service stopped');
        }
        catch (error) {
        }
        server.close(() => {
            logger_1.default.info('Server closed');
            clearTimeout(forceCloseTimeout);
            process.exit(0);
        });
    });
    process.on('SIGINT', async () => {
        logger_1.default.info('SIGINT received, shutting down gracefully...');
        const forceCloseTimeout = setTimeout(() => {
            logger_1.default.warn('Forcefully closing server after timeout');
            process.exit(1);
        }, 10000);
        try {
            websocket_manager_1.websocketManager.shutdown();
            logger_1.default.info('WebSocket Server stopped');
        }
        catch (error) {
        }
        try {
            const { stopMetricsBatchWorker } = await Promise.resolve().then(() => __importStar(require('./workers/metrics-batch-worker')));
            await stopMetricsBatchWorker();
        }
        catch (error) {
        }
        try {
            const { redisClient } = await Promise.resolve().then(() => __importStar(require('./redis/client')));
            await redisClient.disconnect();
        }
        catch (error) {
        }
        try {
            if (mqttMonitor) {
                await mqttMonitor.stop();
                logger_1.default.info('MQTT Monitor stopped');
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
            logger_1.default.info('MQTT Jobs Subscriber stopped');
        }
        catch (error) {
        }
        try {
            await (0, traffic_flush_service_1.stopTrafficFlushService)();
            logger_1.default.info('Traffic flush service stopped');
        }
        catch (error) {
        }
        server.close(() => {
            logger_1.default.info('Server closed');
            clearTimeout(forceCloseTimeout);
            process.exit(0);
        });
    });
    process.on('disconnect', async () => {
        logger_1.default.info('Debugger disconnected, shutting down...');
        const forceCloseTimeout = setTimeout(() => {
            logger_1.default.warn('Forcefully closing server after debugger disconnect timeout');
            process.exit(1);
        }, 3000);
        server.close(() => {
            clearTimeout(forceCloseTimeout);
            process.exit(0);
        });
    });
}
async function retryMqttInitialization(intervalMs = 15000) {
    const { initializeMqtt } = await Promise.resolve().then(() => __importStar(require('./mqtt')));
    const interval = setInterval(async () => {
        try {
            await initializeMqtt();
            logger_1.default.info('MQTT reconnected successfully');
            clearInterval(interval);
        }
        catch (err) {
            logger_1.default.warn('MQTT still unavailable', { error: err?.message || err });
        }
    }, intervalMs);
}
startServer().catch((error) => {
    logger_1.default.error('Failed to start server', { error });
    process.exit(1);
});
exports.default = app;
//# sourceMappingURL=index.js.map