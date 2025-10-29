"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModbusAdapterConfigSchema = exports.SocketOutputSchema = exports.ModbusDeviceSchema = exports.ModbusConnectionSchema = exports.ModbusRegisterSchema = exports.Endianness = exports.ModbusDataType = exports.ModbusConnectionType = exports.ModbusFunctionCode = void 0;
const zod_1 = require("zod");
/**
 * Modbus Function Code enumeration
 */
var ModbusFunctionCode;
(function (ModbusFunctionCode) {
    ModbusFunctionCode[ModbusFunctionCode["READ_COILS"] = 1] = "READ_COILS";
    ModbusFunctionCode[ModbusFunctionCode["READ_DISCRETE_INPUTS"] = 2] = "READ_DISCRETE_INPUTS";
    ModbusFunctionCode[ModbusFunctionCode["READ_HOLDING_REGISTERS"] = 3] = "READ_HOLDING_REGISTERS";
    ModbusFunctionCode[ModbusFunctionCode["READ_INPUT_REGISTERS"] = 4] = "READ_INPUT_REGISTERS";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_SINGLE_COIL"] = 5] = "WRITE_SINGLE_COIL";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_SINGLE_REGISTER"] = 6] = "WRITE_SINGLE_REGISTER";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_MULTIPLE_COILS"] = 15] = "WRITE_MULTIPLE_COILS";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_MULTIPLE_REGISTERS"] = 16] = "WRITE_MULTIPLE_REGISTERS";
})(ModbusFunctionCode || (exports.ModbusFunctionCode = ModbusFunctionCode = {}));
/**
 * Modbus Connection Type enumeration
 */
var ModbusConnectionType;
(function (ModbusConnectionType) {
    ModbusConnectionType["TCP"] = "tcp";
    ModbusConnectionType["RTU"] = "rtu";
    ModbusConnectionType["ASCII"] = "ascii";
})(ModbusConnectionType || (exports.ModbusConnectionType = ModbusConnectionType = {}));
/**
 * Data Type enumeration for register interpretation
 */
var ModbusDataType;
(function (ModbusDataType) {
    ModbusDataType["INT16"] = "int16";
    ModbusDataType["UINT16"] = "uint16";
    ModbusDataType["INT32"] = "int32";
    ModbusDataType["UINT32"] = "uint32";
    ModbusDataType["FLOAT32"] = "float32";
    ModbusDataType["BOOLEAN"] = "boolean";
    ModbusDataType["STRING"] = "string";
})(ModbusDataType || (exports.ModbusDataType = ModbusDataType = {}));
/**
 * Endianness for multi-register data types
 */
var Endianness;
(function (Endianness) {
    Endianness["BIG"] = "big";
    Endianness["LITTLE"] = "little";
})(Endianness || (exports.Endianness = Endianness = {}));
/**
 * Modbus Register Configuration Schema
 */
exports.ModbusRegisterSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    address: zod_1.z.number().min(0).max(65535),
    functionCode: zod_1.z.nativeEnum(ModbusFunctionCode),
    dataType: zod_1.z.nativeEnum(ModbusDataType),
    count: zod_1.z.number().min(1).max(125).optional().default(1), // For multiple registers
    endianness: zod_1.z.nativeEnum(Endianness).optional().default(Endianness.BIG),
    scale: zod_1.z.number().optional().default(1), // Scaling factor
    offset: zod_1.z.number().optional().default(0), // Offset value
    unit: zod_1.z.string().optional().default(''), // Unit of measurement
    description: zod_1.z.string().optional().default('')
});
/**
 * Modbus Connection Configuration Schema
 */
exports.ModbusConnectionSchema = zod_1.z.object({
    type: zod_1.z.nativeEnum(ModbusConnectionType),
    // TCP specific
    host: zod_1.z.string().optional(),
    port: zod_1.z.number().min(1).max(65535).optional().default(502),
    // RTU/ASCII specific
    serialPort: zod_1.z.string().optional(),
    baudRate: zod_1.z.number().optional().default(9600),
    dataBits: zod_1.z.number().min(7).max(8).optional().default(8),
    stopBits: zod_1.z.number().min(1).max(2).optional().default(1),
    parity: zod_1.z.enum(['none', 'even', 'odd']).optional().default('none'),
    // Common settings
    timeout: zod_1.z.number().min(100).max(30000).optional().default(5000), // milliseconds
    retryAttempts: zod_1.z.number().min(0).max(10).optional().default(3),
    retryDelay: zod_1.z.number().min(100).max(10000).optional().default(1000), // milliseconds
}).refine((data) => {
    // TCP connections require host
    if (data.type === ModbusConnectionType.TCP && !data.host) {
        return false;
    }
    // RTU/ASCII connections require serialPort
    if ((data.type === ModbusConnectionType.RTU || data.type === ModbusConnectionType.ASCII) && !data.serialPort) {
        return false;
    }
    return true;
}, {
    message: "TCP connections require host, RTU/ASCII connections require serialPort"
});
/**
 * Modbus Device Configuration Schema
 */
exports.ModbusDeviceSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    slaveId: zod_1.z.number().min(1).max(247),
    connection: exports.ModbusConnectionSchema,
    registers: zod_1.z.array(exports.ModbusRegisterSchema).min(1),
    pollInterval: zod_1.z.number().min(100).max(300000).optional().default(5000), // milliseconds
    enabled: zod_1.z.boolean().optional().default(true)
});
/**
 * Unix Socket Output Configuration Schema
 */
exports.SocketOutputSchema = zod_1.z.object({
    socketPath: zod_1.z.string().min(1),
    dataFormat: zod_1.z.enum(['json', 'csv']).optional().default('json'),
    delimiter: zod_1.z.string().optional().default('\n'),
    includeTimestamp: zod_1.z.boolean().optional().default(true),
    includeDeviceName: zod_1.z.boolean().optional().default(true)
});
/**
 * Modbus Adapter Configuration Schema
 */
exports.ModbusAdapterConfigSchema = zod_1.z.object({
    devices: zod_1.z.array(exports.ModbusDeviceSchema).min(1),
    output: exports.SocketOutputSchema,
    logging: zod_1.z.object({
        level: zod_1.z.enum(['debug', 'info', 'warn', 'error']).optional().default('info'),
        enableConsole: zod_1.z.boolean().optional().default(true),
        enableFile: zod_1.z.boolean().optional().default(false),
        filePath: zod_1.z.string().optional()
    }).optional().default({})
});
//# sourceMappingURL=types.js.map