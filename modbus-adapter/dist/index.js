#!/usr/bin/env node
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
exports.ConsoleLogger = exports.ConfigLoader = exports.ModbusAdapter = void 0;
const yargs = __importStar(require("yargs"));
const dotenv = __importStar(require("dotenv"));
const modbus_adapter_1 = require("./modbus-adapter");
Object.defineProperty(exports, "ModbusAdapter", { enumerable: true, get: function () { return modbus_adapter_1.ModbusAdapter; } });
const config_loader_1 = require("./config-loader");
Object.defineProperty(exports, "ConfigLoader", { enumerable: true, get: function () { return config_loader_1.ConfigLoader; } });
const logger_1 = require("./logger");
Object.defineProperty(exports, "ConsoleLogger", { enumerable: true, get: function () { return logger_1.ConsoleLogger; } });
// Load environment variables
dotenv.config();
/**
 * CLI interface for Modbus Adapter
 */
async function main() {
    const argv = await yargs
        .option('config', {
        alias: 'c',
        description: 'Path to configuration file',
        type: 'string'
    })
        .option('example-config', {
        description: 'Generate example configuration file',
        type: 'string'
    })
        .option('validate-config', {
        description: 'Validate configuration file',
        type: 'string'
    })
        .option('log-level', {
        alias: 'l',
        description: 'Log level (debug, info, warn, error)',
        type: 'string',
        default: 'info',
        choices: ['debug', 'info', 'warn', 'error']
    })
        .help()
        .alias('help', 'h')
        .version()
        .alias('version', 'v')
        .argv;
    try {
        // Generate example configuration
        if (argv.exampleConfig) {
            const exampleConfig = config_loader_1.ConfigLoader.createExampleConfig();
            config_loader_1.ConfigLoader.saveToFile(exampleConfig, argv.exampleConfig);
            console.log(`Example configuration saved to: ${argv.exampleConfig}`);
            process.exit(0);
        }
        // Validate configuration
        if (argv.validateConfig) {
            const config = config_loader_1.ConfigLoader.loadFromFile(argv.validateConfig);
            console.log('Configuration is valid');
            console.log(`Devices: ${config.devices.length}`);
            console.log(`Output socket: ${config.output.socketPath}`);
            process.exit(0);
        }
        // Load configuration
        let config;
        if (argv.config) {
            config = config_loader_1.ConfigLoader.loadFromFile(argv.config);
        }
        else {
            config = config_loader_1.ConfigLoader.loadFromEnv();
        }
        // Create logger
        const logger = new logger_1.ConsoleLogger(argv.logLevel, true);
        // Create and start adapter
        const adapter = new modbus_adapter_1.ModbusAdapter(config, logger);
        // Setup graceful shutdown
        const shutdown = async () => {
            logger.info('Shutting down Modbus Adapter...');
            try {
                await adapter.stop();
                process.exit(0);
            }
            catch (error) {
                logger.error('Error during shutdown:', error);
                process.exit(1);
            }
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        process.on('SIGUSR2', shutdown); // nodemon restart
        // Setup event listeners
        adapter.on('started', () => {
            logger.info('Modbus Adapter is running');
            logger.info(`Socket server: ${config.output.socketPath}`);
            logger.info(`Active devices: ${config.devices.filter(d => d.enabled).length}`);
        });
        adapter.on('device-connected', (deviceName) => {
            logger.info(`Device connected: ${deviceName}`);
        });
        adapter.on('device-disconnected', (deviceName) => {
            logger.warn(`Device disconnected: ${deviceName}`);
        });
        adapter.on('device-error', (deviceName, error) => {
            logger.error(`Device error [${deviceName}]: ${error.message}`);
        });
        adapter.on('data-received', (deviceName, dataPoints) => {
            logger.debug(`Data received from ${deviceName}: ${dataPoints.length} points`);
        });
        // Start adapter
        await adapter.start();
    }
    catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
// Run CLI
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map