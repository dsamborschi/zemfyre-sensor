/**
 * Add Sensor Pipeline Dialog
 * Configures sensor-publish entries for reading from sockets/pipes and publishing to MQTT
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';

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
}

interface AddSensorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: SensorPipelineConfig) => Promise<void>;
}

const DEFAULT_CONFIG: Partial<SensorPipelineConfig> = {
  enabled: true,
  eomDelimiter: '\\n',
  bufferCapacity: 8192,
  publishInterval: 30000,
  bufferTimeMs: 5000,
  bufferSize: 10,
  addrPollSec: 10,
  heartbeatTimeSec: 300,
};

export const AddSensorDialog: React.FC<AddSensorDialogProps> = ({ open, onOpenChange, onSave }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Form state
  const [name, setName] = useState('');
  const [protocolType, setProtocolType] = useState<'modbus' | 'can' | 'opcua' | 'custom'>('modbus');
  const [platform, setPlatform] = useState<'windows' | 'linux'>('windows');
  const [socketPath, setSocketPath] = useState('');
  const [mqttTopic, setMqttTopic] = useState('');
  const [bufferCapacity, setBufferCapacity] = useState(DEFAULT_CONFIG.bufferCapacity!);
  const [publishInterval, setPublishInterval] = useState(DEFAULT_CONFIG.publishInterval!);
  const [bufferTimeMs, setBufferTimeMs] = useState(DEFAULT_CONFIG.bufferTimeMs!);
  const [bufferSize, setBufferSize] = useState(DEFAULT_CONFIG.bufferSize!);
  const [addrPollSec, setAddrPollSec] = useState(DEFAULT_CONFIG.addrPollSec!);
  const [heartbeatTimeSec, setHeartbeatTimeSec] = useState(DEFAULT_CONFIG.heartbeatTimeSec!);

  // Auto-generate default values based on selections
  React.useEffect(() => {
    if (name && protocolType && platform) {
      // Auto-generate socket path
      const defaultSocketPath = platform === 'windows'
        ? `\\\\.\\pipe\\${name}`
        : `/tmp/${name}.sock`;
      setSocketPath(defaultSocketPath);

      // Auto-generate MQTT topic
      setMqttTopic(`${protocolType}/data`);
    }
  }, [name, protocolType, platform]);

  const handleSave = async () => {
    setError(null);

    // Validation
    if (!name.trim()) {
      setError('Sensor name is required');
      return;
    }
    if (!socketPath.trim()) {
      setError('Socket/pipe path is required');
      return;
    }
    if (!mqttTopic.trim()) {
      setError('MQTT topic is required');
      return;
    }

    const config: SensorPipelineConfig = {
      name: name.trim(),
      enabled: true,
      addr: socketPath.trim(),
      eomDelimiter: DEFAULT_CONFIG.eomDelimiter!,
      mqttTopic: mqttTopic.trim(),
      bufferCapacity,
      publishInterval,
      bufferTimeMs,
      bufferSize,
      addrPollSec,
      heartbeatTimeSec,
      mqttHeartbeatTopic: `${mqttTopic}/heartbeat`,
    };

    try {
      setLoading(true);
      await onSave(config);
      // Reset form
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save sensor configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setSocketPath('');
    setMqttTopic('');
    setError(null);
    setShowAdvanced(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Sensor Pipeline</DialogTitle>
          <DialogDescription>
            Configure a sensor-publish pipeline to read data from a socket/pipe and publish to MQTT
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Info Alert */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              This configures the data pipeline. Make sure the protocol adapter (e.g., Modbus) is writing to the specified socket/pipe.
            </AlertDescription>
          </Alert>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Basic Configuration */}
          <div className="space-y-4">
            {/* Sensor Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Sensor Name *</Label>
              <Input
                id="name"
                placeholder="e.g., modbus-sensors, can-sensors"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Unique identifier for this sensor pipeline
              </p>
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

            {/* Socket/Pipe Path */}
            <div className="space-y-2">
              <Label htmlFor="socketPath">Socket/Pipe Path *</Label>
              <Input
                id="socketPath"
                placeholder={platform === 'windows' ? '\\\\.\\pipe\\sensor-name' : '/tmp/sensor-name.sock'}
                value={socketPath}
                onChange={(e) => setSocketPath(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500">
                {platform === 'windows' 
                  ? 'Windows Named Pipe path (e.g., \\\\.\\pipe\\modbus-sensors)'
                  : 'Unix domain socket path (e.g., /tmp/modbus.sock)'}
              </p>
            </div>

            {/* MQTT Topic */}
            <div className="space-y-2">
              <Label htmlFor="mqttTopic">MQTT Topic *</Label>
              <Input
                id="mqttTopic"
                placeholder="e.g., modbus/data, sensors/temperature"
                value={mqttTopic}
                onChange={(e) => setMqttTopic(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Topic where sensor data will be published
              </p>
            </div>
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
                  {/* Buffer Capacity */}
                  <div className="space-y-2">
                    <Label htmlFor="bufferCapacity">Buffer Capacity (bytes)</Label>
                    <Input
                      id="bufferCapacity"
                      type="number"
                      value={bufferCapacity}
                      onChange={(e) => setBufferCapacity(parseInt(e.target.value))}
                    />
                  </div>

                  {/* Publish Interval */}
                  <div className="space-y-2">
                    <Label htmlFor="publishInterval">Publish Interval (ms)</Label>
                    <Input
                      id="publishInterval"
                      type="number"
                      value={publishInterval}
                      onChange={(e) => setPublishInterval(parseInt(e.target.value))}
                    />
                  </div>

                  {/* Buffer Time */}
                  <div className="space-y-2">
                    <Label htmlFor="bufferTimeMs">Buffer Time (ms)</Label>
                    <Input
                      id="bufferTimeMs"
                      type="number"
                      value={bufferTimeMs}
                      onChange={(e) => setBufferTimeMs(parseInt(e.target.value))}
                    />
                  </div>

                  {/* Buffer Size */}
                  <div className="space-y-2">
                    <Label htmlFor="bufferSize">Buffer Size (messages)</Label>
                    <Input
                      id="bufferSize"
                      type="number"
                      value={bufferSize}
                      onChange={(e) => setBufferSize(parseInt(e.target.value))}
                    />
                  </div>

                  {/* Address Poll Seconds */}
                  <div className="space-y-2">
                    <Label htmlFor="addrPollSec">Address Poll (sec)</Label>
                    <Input
                      id="addrPollSec"
                      type="number"
                      value={addrPollSec}
                      onChange={(e) => setAddrPollSec(parseInt(e.target.value))}
                    />
                  </div>

                  {/* Heartbeat Time */}
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

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Add Sensor Pipeline'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
