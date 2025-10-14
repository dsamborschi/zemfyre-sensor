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
const grafana_1 = __importDefault(require("./routes/grafana"));
const notify_1 = __importDefault(require("./routes/notify"));
const USE_POSTGRES = process.env.USE_POSTGRES === 'true';
let cloudRoutes;
if (USE_POSTGRES) {
    console.log('🐘 Using PostgreSQL backend for device state');
    cloudRoutes = require('./routes/cloud-postgres').default;
}
else {
    console.log('💾 Using in-memory backend for device state');
    cloudRoutes = require('./routes/cloud').default;
}
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
        service: 'Zemfyre Unified API',
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
app.use(grafana_1.default);
app.use(notify_1.default);
app.use(cloudRoutes);
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
    if (USE_POSTGRES) {
        try {
            const db = await Promise.resolve().then(() => __importStar(require('./db/connection')));
            const connected = await db.testConnection();
            if (!connected) {
                console.error('❌ Failed to connect to PostgreSQL. Falling back to in-memory mode.');
                cloudRoutes = require('./routes/cloud').default;
            }
            else {
                await db.initializeSchema();
            }
        }
        catch (error) {
            console.error('❌ Database initialization error:', error);
            console.log('⚠️  Falling back to in-memory mode');
            cloudRoutes = require('./routes/cloud').default;
        }
    }
    const server = app.listen(PORT, () => {
        console.log('='.repeat(80));
        console.log('☁️  Zemfyre Unified API Server');
        console.log('='.repeat(80));
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Documentation: http://localhost:${PORT}/api/docs`);
        console.log('='.repeat(80));
        console.log('\nGrafana Management:');
        console.log(`  GET    /grafana/dashboards             - List dashboards`);
        console.log(`  GET    /grafana/alert-rules            - List alerts`);
        console.log(`  POST   /grafana/update-alert-threshold - Update threshold`);
        console.log('\nDocker Management:');
        console.log(`  GET    /containers                     - List containers`);
        console.log(`  POST   /containers/:id/restart         - Restart container`);
        console.log('\nCloud Device Management:');
        console.log(`  POST   /api/v1/device/register         - Register device (provisioning)`);
        console.log(`  POST   /api/v1/device/:uuid/key-exchange - Key exchange (provisioning)`);
        console.log(`  GET    /api/v1/devices                 - List all devices`);
        console.log(`  POST   /api/v1/devices/:uuid/target-state - Set device target`);
        console.log(`  PATCH  /api/v1/device/state            - Device reports state`);
        console.log('\nSystem:');
        console.log(`  POST   /notify                         - Send notification`);
        console.log('='.repeat(80) + '\n');
    });
    process.on('SIGTERM', () => {
        console.log('SIGTERM received, shutting down gracefully...');
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
    process.on('SIGINT', () => {
        console.log('\nSIGINT received, shutting down gracefully...');
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