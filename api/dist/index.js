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
const rollout_monitor_1 = require("./jobs/rollout-monitor");
const job_scheduler_1 = require("./services/job-scheduler");
const connection_1 = __importDefault(require("./db/connection"));
const mqtt_1 = require("./mqtt");
const rotation_scheduler_1 = require("./services/rotation-scheduler");
const API_VERSION = process.env.API_VERSION || 'v1';
const API_BASE = `/api/${API_VERSION}`;
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3002;
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ limit: '10mb', extended: true }));
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
        apiBase: API_BASE
    });
});
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
    try {
        const db = await Promise.resolve().then(() => __importStar(require('./db/connection')));
        const connected = await db.testConnection();
        if (!connected) {
            console.error('❌ Failed to connect to PostgreSQL database');
            process.exit(1);
        }
        await db.initializeSchema();
        console.log('✅ PostgreSQL database initialized successfully\n');
    }
    catch (error) {
        console.error('❌ Database initialization error:', error);
        process.exit(1);
    }
    try {
        const heartbeatMonitor = await Promise.resolve().then(() => __importStar(require('./services/heartbeat-monitor')));
        heartbeatMonitor.default.start();
    }
    catch (error) {
        console.error('⚠️  Failed to start heartbeat monitor:', error);
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
        const { imageMonitor } = await Promise.resolve().then(() => __importStar(require('./services/image-monitor')));
        imageMonitor.start();
        console.log('✅ Image Monitor started');
    }
    catch (error) {
        console.error('⚠️  Failed to start image monitor:', error);
    }
    try {
        await job_scheduler_1.jobScheduler.start();
        console.log('✅ Job Scheduler started');
    }
    catch (error) {
        console.error('⚠️  Failed to start job scheduler:', error);
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
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
    process.on('SIGINT', async () => {
        console.log('\nSIGINT received, shutting down gracefully...');
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