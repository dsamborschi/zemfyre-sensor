"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModbusClient = void 0;
const modbus_serial_1 = __importDefault(require("modbus-serial"));
const types_1 = require("./types");
/**
 * Modbus Client wrapper that handles different connection types and data reading
 */
class ModbusClient {
    constructor(device, logger) {
        this.connected = false;
        this.device = device;
        this.logger = logger;
        this.client = new modbus_serial_1.default();
        this.setupErrorHandlers();
    }
    /**
     * Connect to the Modbus device
     */
    async connect() {
        try {
            this.logger.info(`Connecting to Modbus device: ${this.device.name}`);
            const { connection } = this.device;
            switch (connection.type) {
                case types_1.ModbusConnectionType.TCP:
                    if (!connection.host) {
                        throw new Error('TCP connection requires host');
                    }
                    await this.client.connectTCP(connection.host, { port: connection.port });
                    break;
                case types_1.ModbusConnectionType.RTU:
                    if (!connection.serialPort) {
                        throw new Error('RTU connection requires serialPort');
                    }
                    await this.client.connectRTUBuffered(connection.serialPort, {
                        baudRate: connection.baudRate,
                        dataBits: connection.dataBits,
                        stopBits: connection.stopBits,
                        parity: connection.parity
                    });
                    break;
                case types_1.ModbusConnectionType.ASCII:
                    if (!connection.serialPort) {
                        throw new Error('ASCII connection requires serialPort');
                    }
                    await this.client.connectAsciiSerial(connection.serialPort, {
                        baudRate: connection.baudRate,
                        dataBits: connection.dataBits,
                        stopBits: connection.stopBits,
                        parity: connection.parity
                    });
                    break;
                default:
                    throw new Error(`Unsupported connection type: ${connection.type}`);
            }
            // Set slave ID
            this.client.setID(this.device.slaveId);
            // Set timeout
            this.client.setTimeout(connection.timeout);
            this.connected = true;
            this.logger.info(`Connected to Modbus device: ${this.device.name}`);
        }
        catch (error) {
            this.connected = false;
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to connect to Modbus device ${this.device.name}: ${errorMessage}`);
            throw error;
        }
    }
    /**
     * Disconnect from the Modbus device
     */
    async disconnect() {
        try {
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = undefined;
            }
            if (this.client.isOpen) {
                this.client.close(() => {
                    this.logger.info(`Disconnected from Modbus device: ${this.device.name}`);
                });
            }
            this.connected = false;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error disconnecting from Modbus device ${this.device.name}: ${errorMessage}`);
        }
    }
    /**
     * Read all configured registers and return sensor data points
     */
    async readAllRegisters() {
        if (!this.connected) {
            throw new Error(`Modbus device ${this.device.name} is not connected`);
        }
        const dataPoints = [];
        const timestamp = new Date().toISOString();
        for (const register of this.device.registers) {
            try {
                const value = await this.readRegister(register);
                dataPoints.push({
                    deviceName: this.device.name,
                    registerName: register.name,
                    value: value,
                    unit: register.unit || '',
                    timestamp: timestamp,
                    quality: 'good'
                });
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.warn(`Failed to read register ${register.name} from device ${this.device.name}: ${errorMessage}`);
                dataPoints.push({
                    deviceName: this.device.name,
                    registerName: register.name,
                    value: 0,
                    unit: register.unit || '',
                    timestamp: timestamp,
                    quality: 'bad'
                });
            }
        }
        return dataPoints;
    }
    /**
     * Read a single register
     */
    async readRegister(register) {
        let rawData;
        switch (register.functionCode) {
            case types_1.ModbusFunctionCode.READ_COILS:
                rawData = await this.client.readCoils(register.address, register.count);
                return this.parseCoilData(rawData, register);
            case types_1.ModbusFunctionCode.READ_DISCRETE_INPUTS:
                rawData = await this.client.readDiscreteInputs(register.address, register.count);
                return this.parseCoilData(rawData, register);
            case types_1.ModbusFunctionCode.READ_HOLDING_REGISTERS:
                rawData = await this.client.readHoldingRegisters(register.address, register.count);
                return this.parseRegisterData(rawData, register);
            case types_1.ModbusFunctionCode.READ_INPUT_REGISTERS:
                rawData = await this.client.readInputRegisters(register.address, register.count);
                return this.parseRegisterData(rawData, register);
            default:
                throw new Error(`Unsupported function code: ${register.functionCode}`);
        }
    }
    /**
     * Parse coil/discrete input data
     */
    parseCoilData(data, register) {
        if (register.dataType === types_1.ModbusDataType.BOOLEAN) {
            return data.data[0] || false;
        }
        throw new Error(`Invalid data type ${register.dataType} for coil/discrete input`);
    }
    /**
     * Parse register data based on data type
     */
    parseRegisterData(data, register) {
        const buffer = Buffer.alloc(register.count * 2);
        for (let i = 0; i < register.count; i++) {
            if (register.endianness === types_1.Endianness.BIG) {
                buffer.writeUInt16BE(data.data[i], i * 2);
            }
            else {
                buffer.writeUInt16LE(data.data[i], i * 2);
            }
        }
        let value;
        switch (register.dataType) {
            case types_1.ModbusDataType.INT16:
                value = buffer.readInt16BE(0);
                break;
            case types_1.ModbusDataType.UINT16:
                value = buffer.readUInt16BE(0);
                break;
            case types_1.ModbusDataType.INT32:
                value = register.endianness === types_1.Endianness.BIG ? buffer.readInt32BE(0) : buffer.readInt32LE(0);
                break;
            case types_1.ModbusDataType.UINT32:
                value = register.endianness === types_1.Endianness.BIG ? buffer.readUInt32BE(0) : buffer.readUInt32LE(0);
                break;
            case types_1.ModbusDataType.FLOAT32:
                value = register.endianness === types_1.Endianness.BIG ? buffer.readFloatBE(0) : buffer.readFloatLE(0);
                break;
            case types_1.ModbusDataType.STRING:
                return buffer.toString('ascii').replace(/\0/g, '');
            default:
                throw new Error(`Unsupported data type: ${register.dataType}`);
        }
        // Apply scaling and offset
        return (value * register.scale) + register.offset;
    }
    /**
     * Check if client is connected
     */
    isConnected() {
        return this.connected && this.client.isOpen;
    }
    /**
     * Setup error handlers
     */
    setupErrorHandlers() {
        this.client.on('error', (error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Modbus client error for device ${this.device.name}: ${errorMessage}`);
            this.connected = false;
            this.scheduleReconnect();
        });
        this.client.on('close', () => {
            this.logger.warn(`Modbus connection closed for device ${this.device.name}`);
            this.connected = false;
            this.scheduleReconnect();
        });
    }
    /**
     * Schedule automatic reconnection
     */
    scheduleReconnect() {
        if (this.reconnectTimer)
            return;
        const delay = this.device.connection.retryDelay || 5000;
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = undefined;
            try {
                await this.connect();
            }
            catch (error) {
                this.logger.error(`Reconnection failed for device ${this.device.name}`);
                this.scheduleReconnect();
            }
        }, delay);
    }
}
exports.ModbusClient = ModbusClient;
//# sourceMappingURL=modbus-client.js.map