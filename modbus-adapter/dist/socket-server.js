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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketServer = void 0;
const net = __importStar(require("net"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Unix Socket Server that receives sensor data and serves it to connected clients
 */
class SocketServer {
    constructor(config, logger) {
        this.clients = [];
        this.started = false;
        this.config = config;
        this.logger = logger;
    }
    /**
     * Start the Unix socket server
     */
    async start() {
        if (this.started) {
            return;
        }
        try {
            // Ensure socket directory exists
            const socketDir = path.dirname(this.config.socketPath);
            if (!fs.existsSync(socketDir)) {
                fs.mkdirSync(socketDir, { recursive: true });
            }
            // Remove existing socket file if it exists
            if (fs.existsSync(this.config.socketPath)) {
                fs.unlinkSync(this.config.socketPath);
            }
            this.server = net.createServer((socket) => {
                this.handleClientConnection(socket);
            });
            await new Promise((resolve, reject) => {
                this.server.listen(this.config.socketPath, () => {
                    this.logger.info(`Unix socket server started at: ${this.config.socketPath}`);
                    this.started = true;
                    resolve();
                });
                this.server.on('error', (error) => {
                    this.logger.error(`Socket server error: ${error.message}`);
                    reject(error);
                });
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to start socket server: ${errorMessage}`);
            throw error;
        }
    }
    /**
     * Stop the Unix socket server
     */
    async stop() {
        if (!this.started || !this.server) {
            return;
        }
        try {
            // Close all client connections
            for (const client of this.clients) {
                client.destroy();
            }
            this.clients = [];
            // Close server
            await new Promise((resolve) => {
                this.server.close(() => {
                    this.logger.info('Unix socket server stopped');
                    resolve();
                });
            });
            // Remove socket file
            if (fs.existsSync(this.config.socketPath)) {
                fs.unlinkSync(this.config.socketPath);
            }
            this.started = false;
            this.server = undefined;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error stopping socket server: ${errorMessage}`);
        }
    }
    /**
     * Send sensor data to all connected clients
     */
    sendData(dataPoints) {
        if (!this.started || this.clients.length === 0) {
            return;
        }
        try {
            const message = this.formatData(dataPoints);
            const data = message + this.config.delimiter;
            // Send to all connected clients
            this.clients.forEach((client, index) => {
                try {
                    client.write(data);
                }
                catch (error) {
                    this.logger.warn(`Failed to send data to client ${index}: ${error}`);
                    this.removeClient(client);
                }
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error sending data: ${errorMessage}`);
        }
    }
    /**
     * Get number of connected clients
     */
    getClientCount() {
        return this.clients.length;
    }
    /**
     * Check if server is running
     */
    isRunning() {
        return this.started;
    }
    /**
     * Handle new client connection
     */
    handleClientConnection(socket) {
        this.logger.info(`New client connected to socket server`);
        this.clients.push(socket);
        socket.on('error', (error) => {
            this.logger.warn(`Client socket error: ${error.message}`);
            this.removeClient(socket);
        });
        socket.on('close', () => {
            this.logger.info('Client disconnected from socket server');
            this.removeClient(socket);
        });
        socket.on('end', () => {
            this.logger.info('Client ended connection to socket server');
            this.removeClient(socket);
        });
    }
    /**
     * Remove client from the list
     */
    removeClient(socket) {
        const index = this.clients.indexOf(socket);
        if (index > -1) {
            this.clients.splice(index, 1);
            try {
                socket.destroy();
            }
            catch (error) {
                // Ignore errors when destroying socket
            }
        }
    }
    /**
     * Format sensor data based on configuration
     */
    formatData(dataPoints) {
        if (this.config.dataFormat === 'csv') {
            return this.formatAsCsv(dataPoints);
        }
        else {
            return this.formatAsJson(dataPoints);
        }
    }
    /**
     * Format data as JSON
     */
    formatAsJson(dataPoints) {
        const data = {};
        if (this.config.includeTimestamp) {
            data.timestamp = new Date().toISOString();
        }
        // Group data points by device
        const deviceData = {};
        for (const point of dataPoints) {
            if (!deviceData[point.deviceName]) {
                deviceData[point.deviceName] = {};
            }
            deviceData[point.deviceName][point.registerName] = {
                value: point.value,
                unit: point.unit,
                quality: point.quality,
                timestamp: point.timestamp
            };
        }
        data.devices = deviceData;
        return JSON.stringify(data);
    }
    /**
     * Format data as CSV
     */
    formatAsCsv(dataPoints) {
        const rows = [];
        for (const point of dataPoints) {
            const row = [
                point.deviceName,
                point.registerName,
                String(point.value),
                point.unit,
                point.quality,
                point.timestamp
            ].join(',');
            rows.push(row);
        }
        return rows.join('\n');
    }
}
exports.SocketServer = SocketServer;
//# sourceMappingURL=socket-server.js.map