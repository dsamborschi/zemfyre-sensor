# Protocol-Neutral Data Points Design

## Overview

The `protocol_adapter_devices` table uses a **protocol-neutral design** to support multiple industrial protocols (Modbus, OPC-UA, CAN, and future protocols) without requiring schema changes.

## Database Schema

### Key Fields

```sql
CREATE TABLE protocol_adapter_devices (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  protocol TEXT NOT NULL,              -- 'modbus', 'opcua', 'can', etc.
  enabled BOOLEAN DEFAULT true,
  poll_interval INTEGER DEFAULT 5000,  -- milliseconds
  connection JSONB NOT NULL,            -- Protocol-specific connection details
  data_points JSONB,                    -- Protocol-neutral data point definitions
  metadata JSONB,                       -- Additional protocol-specific config
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Migration History

- **20251030000000**: Initial table created with `registers` field (Modbus-specific name)
- **20251030202246**: Renamed `registers` → `data_points` for protocol neutrality

## Data Point Formats by Protocol

### Modbus Data Points

For Modbus devices, `data_points` contains an array of register configurations:

```json
{
  "name": "modbus-sensor-01",
  "protocol": "modbus",
  "data_points": [
    {
      "name": "Temperature",
      "address": 100,
      "functionCode": 3,        // READ_HOLDING_REGISTERS
      "dataType": "float32",    // int16, uint16, int32, uint32, float32, boolean, string
      "count": 2,               // Number of registers (float32 = 2 registers)
      "endianness": "big",      // big or little
      "scale": 0.1,             // Multiply raw value by this
      "offset": 0,              // Add this to scaled value
      "unit": "°C",
      "description": "Ambient temperature"
    },
    {
      "name": "Pressure",
      "address": 102,
      "functionCode": 4,        // READ_INPUT_REGISTERS
      "dataType": "uint16",
      "count": 1,
      "scale": 1,
      "offset": 0,
      "unit": "psi"
    }
  ]
}
```

**Modbus-Specific Fields:**
- `functionCode`: Modbus function (1=Coils, 2=Discrete, 3=Holding, 4=Input, etc.)
- `address`: Register address in device memory
- `endianness`: Byte order for multi-register values
- `count`: Number of registers to read

### OPC-UA Data Points (Future)

For OPC-UA devices, `data_points` contains node configurations:

```json
{
  "name": "opcua-plc-01",
  "protocol": "opcua",
  "data_points": [
    {
      "name": "Temperature",
      "nodeId": "ns=2;s=Temperature",
      "dataType": "Double",
      "samplingInterval": 1000,
      "deadbandType": "Absolute",
      "deadbandValue": 0.1,
      "unit": "°C",
      "description": "PLC temperature sensor"
    },
    {
      "name": "MotorSpeed",
      "nodeId": "ns=2;i=1001",
      "dataType": "Int32",
      "samplingInterval": 500,
      "unit": "RPM"
    }
  ]
}
```

**OPC-UA-Specific Fields:**
- `nodeId`: OPC-UA node identifier (namespace index + identifier)
- `samplingInterval`: How often to read the node (ms)
- `deadbandType`: Filter type (Absolute, Percent, None)
- `deadbandValue`: Change threshold to trigger update

### CAN Bus Data Points (Future)

For CAN devices, `data_points` contains message/signal configurations:

```json
{
  "name": "can-vehicle-01",
  "protocol": "can",
  "data_points": [
    {
      "name": "EngineRPM",
      "canId": "0x18FF1234",
      "dlc": 8,
      "byteOrder": "big",
      "signals": [
        {
          "name": "RPM",
          "startBit": 0,
          "bitLength": 16,
          "scale": 0.25,
          "offset": 0,
          "unit": "RPM"
        }
      ]
    },
    {
      "name": "VehicleSpeed",
      "canId": "0x0C00",
      "dlc": 2,
      "signals": [
        {
          "name": "Speed",
          "startBit": 0,
          "bitLength": 16,
          "scale": 0.01,
          "unit": "km/h"
        }
      ]
    }
  ]
}
```

**CAN-Specific Fields:**
- `canId`: CAN message identifier (hex)
- `dlc`: Data length code (message size)
- `signals`: Array of signal definitions within the message
- `startBit`: Bit position in message
- `bitLength`: Number of bits for this signal

## API Design

### Backward Compatibility

The code accepts both old (`registers`) and new (`dataPoints`) field names:

```typescript
// agent.ts normalization
data_points: device.dataPoints || device.data_points || device.registers
```

**Priority order:**
1. `dataPoints` (camelCase from API)
2. `data_points` (snake_case from SQLite)
3. `registers` (deprecated, Modbus-specific)

### API Endpoints

#### Create Protocol Device
```http
POST /api/devices/{deviceId}/protocol-devices
Content-Type: application/json

{
  "name": "sensor-01",
  "protocol": "modbus",
  "enabled": true,
  "pollInterval": 5000,
  "connection": {
    "type": "tcp",
    "host": "192.168.1.100",
    "port": 502
  },
  "dataPoints": [ /* protocol-specific array */ ],
  "metadata": {
    "slaveId": 1
  }
}
```

#### Update Protocol Device
```http
PATCH /api/devices/{deviceId}/protocol-devices/{deviceName}
Content-Type: application/json

{
  "enabled": false,
  "dataPoints": [ /* updated array */ ]
}
```

## Code Usage

### Creating a Device (TypeScript)

```typescript
import { ProtocolAdapterDeviceModel } from './models/protocol-adapter-device.model.js';

// Modbus device
await ProtocolAdapterDeviceModel.create({
  name: 'temp-sensor',
  protocol: 'modbus',
  enabled: true,
  poll_interval: 5000,
  connection: {
    type: 'tcp',
    host: '192.168.1.100',
    port: 502
  },
  data_points: [
    {
      name: 'Temperature',
      address: 100,
      functionCode: 3,
      dataType: 'float32',
      count: 2
    }
  ],
  metadata: { slaveId: 1 }
});

// OPC-UA device (future)
await ProtocolAdapterDeviceModel.create({
  name: 'plc-01',
  protocol: 'opcua',
  enabled: true,
  poll_interval: 1000,
  connection: {
    endpoint: 'opc.tcp://192.168.1.200:4840'
  },
  data_points: [
    {
      name: 'Temperature',
      nodeId: 'ns=2;s=Temperature',
      dataType: 'Double'
    }
  ]
});
```

### Reading Data Points

```typescript
const device = await ProtocolAdapterDeviceModel.getByName('temp-sensor');

// data_points is stored as JSON in SQLite
const dataPoints = device.data_points; // Already parsed by Knex

// For Modbus
if (device.protocol === 'modbus') {
  const registers = dataPoints as ModbusRegister[];
  // Process Modbus registers
}

// For OPC-UA (future)
if (device.protocol === 'opcua') {
  const nodes = dataPoints as OpcuaNode[];
  // Process OPC-UA nodes
}
```

## Benefits of Protocol-Neutral Design

### ✅ Extensibility
- Add new protocols without database migrations
- Protocol-specific logic isolated in handlers
- Common interface for all protocols

### ✅ Flexibility
- Each protocol defines its own data point schema
- No forced constraints from other protocols
- Use JSON validation (Zod) for type safety

### ✅ Consistency
- Same CRUD operations for all protocols
- Unified API endpoints
- Common configuration patterns

### ✅ Maintainability
- Clear separation of concerns
- Protocol-specific code in separate modules
- Easy to add protocol support

## Implementation Status

| Protocol | Status | Data Points Field | Notes |
|----------|--------|-------------------|-------|
| **Modbus** | ✅ Implemented | `data_points` | Fully functional with registers |
| **OPC-UA** | 🚧 Planned | `data_points` | Schema designed, not implemented |
| **CAN Bus** | 🚧 Planned | `data_points` | Schema designed, not implemented |
| **BACnet** | 📋 Future | `data_points` | Not yet designed |
| **MQTT** | 📋 Future | `data_points` | Not yet designed |

## Related Files

- **Model**: `agent/src/models/protocol-adapter-device.model.ts`
- **Migration**: `agent/src/migrations/20251030202246_rename_registers_to_data_points.js`
- **Config Handler**: `agent/src/features/protocol-adapters/config-handler.ts`
- **Modbus Loader**: `agent/src/features/protocol-adapters/modbus/config-loader.ts`
- **Type Definitions**: `agent/src/features/protocol-adapters/common/types.d.ts`

## Migration Guide

### For Existing Modbus Users

No action required! The migration automatically renames `registers` → `data_points`. Your existing code will continue to work with backward compatibility.

### For New Protocol Implementations

1. **Define data point schema** in `features/protocol-adapters/{protocol}/types.ts`
2. **Create config loader** that reads from `data_points` field
3. **Implement protocol adapter** that processes data points
4. **Add validation** using Zod schemas
5. **Update this documentation** with your protocol's data point format

## Example: Adding a New Protocol

```typescript
// 1. Define types
interface MyProtocolDataPoint {
  name: string;
  customField: string;
  // ... protocol-specific fields
}

// 2. Create device in database
await ProtocolAdapterDeviceModel.create({
  name: 'my-device',
  protocol: 'myprotocol',
  data_points: [
    { name: 'sensor1', customField: 'value' }
  ],
  connection: { /* connection details */ }
});

// 3. Implement adapter that reads data_points
class MyProtocolAdapter {
  async initialize() {
    const devices = await ProtocolAdapterDeviceModel.getAll('myprotocol');
    for (const device of devices) {
      const dataPoints = device.data_points as MyProtocolDataPoint[];
      // Process data points...
    }
  }
}
```

## Conclusion

The `data_points` field provides a **flexible, protocol-neutral foundation** for supporting any industrial communication protocol without requiring database schema changes. Each protocol can define its own data point structure while sharing common configuration patterns.
