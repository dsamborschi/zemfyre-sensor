/**
 * Unified Add Sensor Dialog
 * Handles both:
 * 1. Sensor-publish pipelines (local data collection via sockets/pipes)
 * 2. Protocol adapter devices (hardware sensors: Modbus, CAN, OPC-UA)
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';

interface SensorPipelineConfig {
  name: string;
  enabled: boolean;
  addr: string;
  eomDelimiter: string;
  mqttTopic: string;
  bufferCapacity: number;
  publishInterval?: number;
  bufferTimeMs?: number;
  bufferSize?: number;
  addrPollSec?: number;
  heartbeatTimeSec?: number;
  mqttHeartbeatTopic?: string;
  protocolType?: string;
  platform?: string;
}

interface ModbusRegister {
  name: string;
  address: number;
  type: 'coil' | 'discrete' | 'holding' | 'input';
  dataType: 'int16' | 'uint16' | 'int32' | 'uint32' | 'float32' | 'float64';
  unit?: string;
  scale?: number;
  offset?: number;
}

interface ProtocolAdapterDevice {
  name: string;
  protocol: 'modbus' | 'can' | 'opcua';
  enabled: boolean;
  pollInterval: number;
  connection: any;
  registers?: ModbusRegister[];
  metadata?: Record<string, any>;
}

interface AddSensorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSavePipeline: (config: SensorPipelineConfig) => Promise<void>;
  onSaveDevice: (device: ProtocolAdapterDevice) => Promise<void>;
  deviceUuid: string;
}

const DEFAULT_PIPELINE_CONFIG: Partial<SensorPipelineConfig> = {
  enabled: true,
  eomDelimiter: '\\n',
  bufferCapacity: 8192,
  publishInterval: 30000,
  bufferTimeMs: 5000,
  bufferSize: 10,
  addrPollSec: 10,
  heartbeatTimeSec: 300,
};

export const AddSensorDialog: React.FC<AddSensorDialogProps> = ({ 
  open, 
  onOpenChange, 
  onSavePipeline, 
  onSaveDevice,
  deviceUuid 
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeTab, setActiveTab] = useState<'device' | 'pipeline'>('device');
  
  // Pipeline form state
  const [pipelineName, setPipelineName] = useState('');
  const [protocolType, setProtocolType] = useState<'modbus' | 'can' | 'opcua' | 'custom'>('modbus');
  const [platform, setPlatform] = useState<'windows' | 'linux'>('windows');
  const [bufferCapacity, setBufferCapacity] = useState(DEFAULT_PIPELINE_CONFIG.bufferCapacity!);
  const [publishInterval, setPublishInterval] = useState(DEFAULT_PIPELINE_CONFIG.publishInterval!);
  const [bufferTimeMs, setBufferTimeMs] = useState(DEFAULT_PIPELINE_CONFIG.bufferTimeMs!);
  const [bufferSize, setBufferSize] = useState(DEFAULT_PIPELINE_CONFIG.bufferSize!);
  const [addrPollSec, setAddrPollSec] = useState(DEFAULT_PIPELINE_CONFIG.addrPollSec!);
  const [heartbeatTimeSec, setHeartbeatTimeSec] = useState(DEFAULT_PIPELINE_CONFIG.heartbeatTimeSec!);

  // Protocol adapter device form state
  const [deviceName, setDeviceName] = useState('');
  const [deviceProtocol, setDeviceProtocol] = useState<'modbus' | 'can' | 'opcua'>('modbus');
  const [deviceEnabled, setDeviceEnabled] = useState(true);
  const [devicePollInterval, setDevicePollInterval] = useState(5000);
  
  // Modbus connection
  const [modbusConnectionType, setModbusConnectionType] = useState<'tcp' | 'rtu'>('tcp');
  const [modbusHost, setModbusHost] = useState('');
  const [modbusPort, setModbusPort] = useState(502);
  const [modbusUnitId, setModbusUnitId] = useState(1);
  const [modbusSerialPort, setModbusSerialPort] = useState('COM1');
  const [modbusBaudRate, setModbusBaudRate] = useState(9600);
  
  // Modbus registers
  const [modbusRegisters, setModbusRegisters] = useState<ModbusRegister[]>([
    { name: 'register1', address: 0, type: 'holding', dataType: 'int16' }
  ]);

  const handleSavePipeline = async () => {
    setError(null);

    if (!pipelineName.trim()) {
      setError('Sensor name is required');
      return;
    }

    const config: any = {
      name: pipelineName.trim(),
      protocolType,
      platform,
      enabled: true,
      eomDelimiter: DEFAULT_PIPELINE_CONFIG.eomDelimiter!,
      bufferCapacity,
      publishInterval,
      bufferTimeMs,
      bufferSize,
      addrPollSec,
      heartbeatTimeSec,
    };

    try {
      setLoading(true);
      await onSavePipeline(config);
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save sensor pipeline');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDevice = async () => {
    setError(null);

    if (!deviceName.trim()) {
      setError('Device name is required');
      return;
    }

    // Validation based on protocol
    if (deviceProtocol === 'modbus') {
      if (modbusConnectionType === 'tcp' && !modbusHost.trim()) {
        setError('Modbus host is required for TCP connection');
        return;
      }
      if (modbusRegisters.length === 0) {
        setError('At least one register is required');
        return;
      }
    }

    const device: ProtocolAdapterDevice = {
      name: deviceName.trim(),
      protocol: deviceProtocol,
      enabled: deviceEnabled,
      pollInterval: devicePollInterval,
      connection: buildConnectionConfig(),
      registers: deviceProtocol === 'modbus' ? modbusRegisters : undefined,
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: 'dashboard'
      }
    };

    try {
      setLoading(true);
      await onSaveDevice(device);
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save protocol adapter device');
    } finally {
      setLoading(false);
    }
  };

  const buildConnectionConfig = () => {
    if (deviceProtocol === 'modbus') {
      if (modbusConnectionType === 'tcp') {
        return {
          type: 'tcp',
          host: modbusHost,
          port: modbusPort,
          unitId: modbusUnitId
        };
      } else {
        return {
          type: 'rtu',
          port: modbusSerialPort,
          baudRate: modbusBaudRate,
          unitId: modbusUnitId
        };
      }
    }
    return {};
  };

  const addRegister = () => {
    setModbusRegisters([
      ...modbusRegisters,
      { name: `register${modbusRegisters.length + 1}`, address: 0, type: 'holding', dataType: 'int16' }
    ]);
  };

  const removeRegister = (index: number) => {
    setModbusRegisters(modbusRegisters.filter((_, i) => i !== index));
  };

  const updateRegister = (index: number, field: keyof ModbusRegister, value: any) => {
    const updated = [...modbusRegisters];
    updated[index] = { ...updated[index], [field]: value };
    setModbusRegisters(updated);
  };

  const handleClose = () => {
    setPipelineName('');
    setDeviceName('');
    setError(null);
    setShowAdvanced(false);
    setActiveTab('device');
    setModbusRegisters([{ name: 'register1', address: 0, type: 'holding', dataType: 'int16' }]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Sensor</DialogTitle>
          <DialogDescription>
            Add a hardware sensor device (Modbus, CAN, OPC-UA) or a sensor pipeline (local data collection).
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="device">Hardware Sensor Device</TabsTrigger>
            <TabsTrigger value="pipeline">Sensor Pipeline</TabsTrigger>
          </TabsList>

          {/* Hardware Sensor Device Tab */}
          <TabsContent value="device" className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Configure a hardware sensor device (Modbus RTU/TCP, CAN Bus, OPC-UA). The device will be polled automatically.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              {/* Device Name */}
              <div className="space-y-2">
                <Label htmlFor="deviceName">Device Name *</Label>
                <Input
                  id="deviceName"
                  placeholder="e.g., temperature-sensor, flow-meter"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                />
              </div>

              {/* Protocol */}
              <div className="space-y-2">
                <Label htmlFor="deviceProtocol">Protocol *</Label>
                <Select value={deviceProtocol} onValueChange={(value: any) => setDeviceProtocol(value)}>
                  <SelectTrigger id="deviceProtocol">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modbus">Modbus (RTU/TCP)</SelectItem>
                    <SelectItem value="can">CAN Bus</SelectItem>
                    <SelectItem value="opcua">OPC-UA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Enabled Checkbox */}
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="deviceEnabled" 
                  checked={deviceEnabled}
                  onCheckedChange={(checked) => setDeviceEnabled(checked as boolean)}
                />
                <Label htmlFor="deviceEnabled" className="cursor-pointer">
                  Enable device immediately after creation
                </Label>
              </div>

              {/* Poll Interval */}
              <div className="space-y-2">
                <Label htmlFor="devicePollInterval">Poll Interval (ms)</Label>
                <Input
                  id="devicePollInterval"
                  type="number"
                  value={devicePollInterval}
                  onChange={(e) => setDevicePollInterval(parseInt(e.target.value))}
                />
                <p className="text-xs text-gray-500">How often to read data from the device</p>
              </div>

              {/* Modbus-specific configuration */}
              {deviceProtocol === 'modbus' && (
                <Card className="p-4 space-y-4 bg-gray-50">
                  <h4 className="font-medium">Modbus Connection</h4>
                  
                  {/* Connection Type */}
                  <div className="space-y-2">
                    <Label htmlFor="modbusConnectionType">Connection Type</Label>
                    <Select value={modbusConnectionType} onValueChange={(value: any) => setModbusConnectionType(value)}>
                      <SelectTrigger id="modbusConnectionType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tcp">Modbus TCP (Ethernet)</SelectItem>
                        <SelectItem value="rtu">Modbus RTU (Serial)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {modbusConnectionType === 'tcp' ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="modbusHost">Host/IP *</Label>
                        <Input
                          id="modbusHost"
                          placeholder="192.168.1.100"
                          value={modbusHost}
                          onChange={(e) => setModbusHost(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="modbusPort">Port</Label>
                        <Input
                          id="modbusPort"
                          type="number"
                          value={modbusPort}
                          onChange={(e) => setModbusPort(parseInt(e.target.value))}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="modbusSerialPort">Serial Port *</Label>
                        <Input
                          id="modbusSerialPort"
                          placeholder="COM1 or /dev/ttyUSB0"
                          value={modbusSerialPort}
                          onChange={(e) => setModbusSerialPort(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="modbusBaudRate">Baud Rate</Label>
                        <Select 
                          value={modbusBaudRate.toString()} 
                          onValueChange={(value) => setModbusBaudRate(parseInt(value))}
                        >
                          <SelectTrigger id="modbusBaudRate">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="9600">9600</SelectItem>
                            <SelectItem value="19200">19200</SelectItem>
                            <SelectItem value="38400">38400</SelectItem>
                            <SelectItem value="57600">57600</SelectItem>
                            <SelectItem value="115200">115200</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="modbusUnitId">Unit ID (Slave Address)</Label>
                    <Input
                      id="modbusUnitId"
                      type="number"
                      value={modbusUnitId}
                      onChange={(e) => setModbusUnitId(parseInt(e.target.value))}
                    />
                  </div>

                  {/* Registers */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Registers *</Label>
                      <Button type="button" size="sm" variant="outline" onClick={addRegister}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add Register
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {modbusRegisters.map((register, index) => (
                        <Card key={index} className="p-3 bg-white">
                          <div className="grid grid-cols-6 gap-2">
                            <div className="col-span-2">
                              <Input
                                placeholder="Name"
                                value={register.name}
                                onChange={(e) => updateRegister(index, 'name', e.target.value)}
                              />
                            </div>
                            <div>
                              <Input
                                type="number"
                                placeholder="Address"
                                value={register.address}
                                onChange={(e) => updateRegister(index, 'address', parseInt(e.target.value))}
                              />
                            </div>
                            <div>
                              <Select 
                                value={register.type} 
                                onValueChange={(value) => updateRegister(index, 'type', value)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="coil">Coil</SelectItem>
                                  <SelectItem value="discrete">Discrete</SelectItem>
                                  <SelectItem value="holding">Holding</SelectItem>
                                  <SelectItem value="input">Input</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Select 
                                value={register.dataType} 
                                onValueChange={(value) => updateRegister(index, 'dataType', value)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="int16">Int16</SelectItem>
                                  <SelectItem value="uint16">UInt16</SelectItem>
                                  <SelectItem value="int32">Int32</SelectItem>
                                  <SelectItem value="uint32">UInt32</SelectItem>
                                  <SelectItem value="float32">Float32</SelectItem>
                                  <SelectItem value="float64">Float64</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center">
                              <Button 
                                type="button" 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => removeRegister(index)}
                                disabled={modbusRegisters.length === 1}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

              {/* CAN Bus configuration */}
              {deviceProtocol === 'can' && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    CAN Bus configuration will be available soon. Contact support for early access.
                  </AlertDescription>
                </Alert>
              )}

              {/* OPC-UA configuration */}
              {deviceProtocol === 'opcua' && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    OPC-UA configuration will be available soon. Contact support for early access.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </TabsContent>

          {/* Sensor Pipeline Tab */}
          <TabsContent value="pipeline" className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Configure a local data collection pipeline. Data is read from a socket/pipe and published to MQTT.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              {/* Sensor Name */}
              <div className="space-y-2">
                <Label htmlFor="pipelineName">Pipeline Name *</Label>
                <Input
                  id="pipelineName"
                  placeholder="e.g., modbus-sensors, can-sensors"
                  value={pipelineName}
                  onChange={(e) => setPipelineName(e.target.value)}
                />
              </div>

              {/* Protocol Type */}
              <div className="space-y-2">
                <Label htmlFor="protocol">Protocol Type</Label>
                <Select value={protocolType} onValueChange={(value: any) => setProtocolType(value)}>
                  <SelectTrigger id="protocol">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modbus">Modbus</SelectItem>
                    <SelectItem value="can">CAN Bus</SelectItem>
                    <SelectItem value="opcua">OPC-UA</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Platform */}
              <div className="space-y-2">
                <Label htmlFor="platform">Platform</Label>
                <Select value={platform} onValueChange={(value: any) => setPlatform(value)}>
                  <SelectTrigger id="platform">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="windows">Windows (Named Pipe)</SelectItem>
                    <SelectItem value="linux">Linux/Unix (Socket)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Advanced Settings */}
              <div className="space-y-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full"
                >
                  {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
                </Button>

                {showAdvanced && (
                  <Card className="p-4 space-y-4 bg-gray-50">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="bufferCapacity">Buffer Capacity (bytes)</Label>
                        <Input
                          id="bufferCapacity"
                          type="number"
                          value={bufferCapacity}
                          onChange={(e) => setBufferCapacity(parseInt(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="publishInterval">Publish Interval (ms)</Label>
                        <Input
                          id="publishInterval"
                          type="number"
                          value={publishInterval}
                          onChange={(e) => setPublishInterval(parseInt(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bufferTimeMs">Buffer Time (ms)</Label>
                        <Input
                          id="bufferTimeMs"
                          type="number"
                          value={bufferTimeMs}
                          onChange={(e) => setBufferTimeMs(parseInt(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bufferSize">Buffer Size (messages)</Label>
                        <Input
                          id="bufferSize"
                          type="number"
                          value={bufferSize}
                          onChange={(e) => setBufferSize(parseInt(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="addrPollSec">Address Poll (sec)</Label>
                        <Input
                          id="addrPollSec"
                          type="number"
                          value={addrPollSec}
                          onChange={(e) => setAddrPollSec(parseInt(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="heartbeatTimeSec">Heartbeat (sec)</Label>
                        <Input
                          id="heartbeatTimeSec"
                          type="number"
                          value={heartbeatTimeSec}
                          onChange={(e) => setHeartbeatTimeSec(parseInt(e.target.value))}
                        />
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={activeTab === 'device' ? handleSaveDevice : handleSavePipeline} 
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
