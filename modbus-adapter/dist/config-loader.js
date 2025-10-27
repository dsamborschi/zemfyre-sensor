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
exports.ConfigLoader = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_1 = require("./types");
/**
 * Configuration loader for Modbus Adapter
 */
class ConfigLoader {
    /**
     * Load configuration from file
     */
    static loadFromFile(configPath) {
        try {
            if (!fs.existsSync(configPath)) {
                throw new Error(`Configuration file not found: ${configPath}`);
            }
            const configData = fs.readFileSync(configPath, 'utf8');
            const rawConfig = JSON.parse(configData);
            // Validate configuration against schema
            const config = types_1.ModbusAdapterConfigSchema.parse(rawConfig);
            return config;
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to load configuration: ${error.message}`);
            }
            throw new Error(`Failed to load configuration: ${String(error)}`);
        }
    }
    /**
     * Load configuration from environment variables
     */
    static loadFromEnv() {
        try {
            const configJson = process.env.MODBUS_ADAPTER_CONFIG;
            if (!configJson) {
                throw new Error('MODBUS_ADAPTER_CONFIG environment variable not set');
            }
            const rawConfig = JSON.parse(configJson);
            const config = types_1.ModbusAdapterConfigSchema.parse(rawConfig);
            return config;
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to load configuration from environment: ${error.message}`);
            }
            throw new Error(`Failed to load configuration from environment: ${String(error)}`);
        }
    }
    /**
     * Create example configuration
     */
    static createExampleConfig() {
        return {
            devices: [
                {
                    name: 'temperature-sensor',
                    slaveId: 1,
                    connection: {
                        type: types_1.ModbusConnectionType.TCP,
                        host: '192.168.1.100',
                        port: 502,
                        timeout: 5000,
                        retryAttempts: 3,
                        retryDelay: 1000
                    },
                    registers: [
                        {
                            name: 'temperature',
                            address: 40001,
                            functionCode: types_1.ModbusFunctionCode.READ_HOLDING_REGISTERS,
                            dataType: types_1.ModbusDataType.FLOAT32,
                            count: 2,
                            endianness: types_1.Endianness.BIG,
                            scale: 0.1,
                            offset: 0,
                            unit: '°C',
                            description: 'Temperature reading'
                        },
                        {
                            name: 'humidity',
                            address: 40003,
                            functionCode: types_1.ModbusFunctionCode.READ_HOLDING_REGISTERS,
                            dataType: types_1.ModbusDataType.FLOAT32,
                            count: 2,
                            endianness: types_1.Endianness.BIG,
                            scale: 0.1,
                            offset: 0,
                            unit: '%',
                            description: 'Humidity reading'
                        }
                    ],
                    pollInterval: 5000,
                    enabled: true
                },
                {
                    name: 'pressure-sensor',
                    slaveId: 2,
                    connection: {
                        type: types_1.ModbusConnectionType.RTU,
                        serialPort: '/dev/ttyUSB0',
                        baudRate: 9600,
                        dataBits: 8,
                        stopBits: 1,
                        parity: 'none',
                        timeout: 5000,
                        retryAttempts: 3,
                        retryDelay: 1000
                    },
                    registers: [
                        {
                            name: 'pressure',
                            address: 30001,
                            functionCode: types_1.ModbusFunctionCode.READ_INPUT_REGISTERS,
                            dataType: types_1.ModbusDataType.UINT32,
                            count: 2,
                            endianness: types_1.Endianness.BIG,
                            scale: 0.001,
                            offset: 0,
                            unit: 'bar',
                            description: 'Pressure reading'
                        }
                    ],
                    pollInterval: 3000,
                    enabled: true
                }
            ],
            output: {
                socketPath: '/tmp/sensors/modbus.sock',
                dataFormat: 'json',
                delimiter: '\n',
                includeTimestamp: true,
                includeDeviceName: true
            },
            logging: {
                level: 'info',
                enableConsole: true,
                enableFile: false
            }
        };
    }
    /**
     * Save configuration to file
     */
    static saveToFile(config, configPath) {
        try {
            // Ensure directory exists
            const configDir = path.dirname(configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            // Validate configuration
            types_1.ModbusAdapterConfigSchema.parse(config);
            // Save to file
            const configJson = JSON.stringify(config, null, 2);
            fs.writeFileSync(configPath, configJson, 'utf8');
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to save configuration: ${error.message}`);
            }
            throw new Error(`Failed to save configuration: ${String(error)}`);
        }
    }
    /**
     * Validate configuration
     */
    static validate(config) {
        return types_1.ModbusAdapterConfigSchema.parse(config);
    }
}
exports.ConfigLoader = ConfigLoader;
//# sourceMappingURL=config-loader.js.map