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
const rollout_monitor_1 = require("./jobs/rollout-monitor");
const job_scheduler_1 = require("./services/job-scheduler");
const connection_1 = __importDefault(require("./db/connection"));
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
        documentation: '/api/docs'
    });
});
app.get('/api/docs', (req, res) => {
    res.json({
        version: '2.0.0',
        description: 'Unified API for Zemfyre Sensor system',
        endpoints: {
            general: {
                'GET /': 'Health check',
                'GET /api/docs': 'This documentation'
            },
            grafana: {
                'GET /grafana/dashboards': 'List all Grafana dashboards',
                'GET /grafana/alert-rules': 'List all alert rules',
                'POST /grafana/update-alert-threshold': 'Update alert threshold',
                'GET /grafana/dashboards/:uid/variables': 'Get dashboard variables',
                'POST /grafana/dashboards/:uid/variables/:varName': 'Update dashboard variable'
            },
            docker: {
                'GET /containers': 'List all Docker containers',
                'POST /containers/:id/restart': 'Restart a container'
            },
            notifications: {
                'POST /notify': 'Send system notification'
            },
            provisioningKeys: {
                'POST /api/v1/provisioning-keys': 'Create new provisioning key for fleet',
                'GET /api/v1/provisioning-keys?fleetId=xxx': 'List provisioning keys for a fleet',
                'DELETE /api/v1/provisioning-keys/:keyId': 'Revoke a provisioning key'
            },
            cloud: {
                'POST /api/v1/device/register': 'Register new device (two-phase auth - provisioning key)',
                'POST /api/v1/device/:uuid/key-exchange': 'Exchange keys (two-phase auth - device key)',
                'GET /api/v1/device/:uuid/state': 'Device polls for target state (ETag cached)',
                'POST /api/v1/device/:uuid/logs': 'Device uploads logs',
                'PATCH /api/v1/device/state': 'Device reports current state + metrics',
                'GET /api/v1/devices': 'List all registered devices',
                'GET /api/v1/devices/:uuid': 'Get specific device info',
                'GET /api/v1/devices/:uuid/target-state': 'Get device target state',
                'POST /api/v1/devices/:uuid/target-state': 'Set device target state',
                'GET /api/v1/devices/:uuid/current-state': 'Get device current state',
                'DELETE /api/v1/devices/:uuid/target-state': 'Clear device target state'
            },
            imageRegistry: {
                'GET /api/v1/images': 'List approved images (query: status, category, search)',
                'GET /api/v1/images/:id': 'Get image details with all tags',
                'POST /api/v1/images': 'Add new image to approved registry',
                'PUT /api/v1/images/:id': 'Update image details',
                'DELETE /api/v1/images/:id': 'Remove image from registry',
                'POST /api/v1/images/:id/tags': 'Add new tag to image',
                'PUT /api/v1/images/:imageId/tags/:tagId': 'Update tag details',
                'DELETE /api/v1/images/:imageId/tags/:tagId': 'Remove tag from image',
                'GET /api/v1/images/categories': 'Get list of image categories'
            },
            deviceJobs: {
                'GET /api/v1/jobs/templates': 'List all job templates',
                'POST /api/v1/jobs/templates': 'Create new job template',
                'GET /api/v1/jobs/templates/:id': 'Get job template details',
                'PUT /api/v1/jobs/templates/:id': 'Update job template',
                'DELETE /api/v1/jobs/templates/:id': 'Delete job template',
                'POST /api/v1/jobs/execute': 'Execute job on device(s)',
                'GET /api/v1/jobs/executions': 'List job executions (query: status, device_uuid)',
                'GET /api/v1/jobs/executions/:id': 'Get job execution details',
                'POST /api/v1/jobs/executions/:id/cancel': 'Cancel job execution',
                'GET /api/v1/devices/:uuid/jobs/next': 'Device polling endpoint (get next job)',
                'PATCH /api/v1/devices/:uuid/jobs/:jobId/status': 'Device reports job status',
                'GET /api/v1/devices/:uuid/jobs': 'Get device job history',
                'GET /api/v1/jobs/handlers': 'List reusable job handlers',
                'POST /api/v1/jobs/handlers': 'Create new job handler'
            }
        },
        notes: [
            'Grafana management requires GRAFANA_API_TOKEN environment variable',
            'Docker operations require /var/run/docker.sock volume mount',
            'Cloud endpoints support multi-device IoT fleet management',
            'Devices poll for target state using ETag caching',
            'Two-phase authentication: provisioning key (fleet) + device key (unique per device)'
        ]
    });
});
app.use(provisioning_1.default);
app.use(devices_1.default);
app.use(admin_1.default);
app.use(apps_1.default);
app.use(device_state_1.default);
app.use('/api/v1/webhooks', webhooks_1.default);
app.use('/api/v1', rollouts_1.default);
app.use('/api/v1', image_registry_1.default);
app.use('/api/v1', device_jobs_1.default);
app.use('/api/v1', scheduled_jobs_1.default);
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
    console.log('🚀 Initializing Zemfyre Unified API...\n');
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
    const server = app.listen(PORT, () => {
        console.log('='.repeat(80));
        console.log('☁️  Iotistic Unified API Server');
        console.log('='.repeat(80));
        console.log(`Server running on http://localhost:${PORT}`);
        console.log('='.repeat(80) + '\n');
    });
    process.on('SIGTERM', async () => {
        console.log('SIGTERM received, shutting down gracefully...');
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