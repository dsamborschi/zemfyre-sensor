import { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { buildApiUrl } from '@/config/api';

interface DeviceFeatures {
  enableRemoteAccess?: boolean;
  enableJobEngine?: boolean;
  enableCloudJobs?: boolean;
  enableSensorPublish?: boolean;
  enableProtocolAdapters?: boolean;
  enableShadow?: boolean;
}

interface DeviceSettings {
  reconciliationIntervalMs?: number;
  targetStatePollIntervalMs?: number;
  deviceReportIntervalMs?: number;
}

interface DeviceLogging {
  level?: string;
  enableFilePersistence?: boolean;
  enableCloudLogging?: boolean;
}

interface DeviceConfig {
  features?: DeviceFeatures;
  settings?: DeviceSettings;
  logging?: DeviceLogging;
}

interface Props {
  deviceUuid: string;
}

export default function DeviceSettingsPage({ deviceUuid }: Props) {
  const [config, setConfig] = useState<DeviceConfig>({});
  const [pendingConfig, setPendingConfig] = useState<DeviceConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDeviceConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(buildApiUrl(`/api/v1/devices/${deviceUuid}/target-state`));
      
      if (!response.ok) {
        throw new Error('Failed to load device configuration');
      }
      
      const data = await response.json();
      const deviceConfig = data.config || {};
      
      setConfig(deviceConfig);
      setPendingConfig(deviceConfig);
      setHasChanges(false);
    } catch (err: any) {
      console.error('Error loading device config:', err);
      setError(err.message || 'Failed to load device configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (deviceUuid) {
      loadDeviceConfig();
    }
  }, [deviceUuid]);

  const handleFeatureToggle = (feature: keyof DeviceFeatures) => {
    setPendingConfig(prev => ({
      ...prev,
      features: {
        ...prev.features,
        [feature]: !prev.features?.[feature]
      }
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Fetch current target state to preserve apps and other config
      const currentResponse = await fetch(buildApiUrl(`/api/v1/devices/${deviceUuid}/target-state`));
      if (!currentResponse.ok) {
        throw new Error('Failed to fetch current state');
      }
      const currentData = await currentResponse.json();

      // Merge pending config with existing config (preserve non-feature settings)
      const updatedConfig = {
        ...currentData.config,
        features: pendingConfig.features,
        settings: pendingConfig.settings,
        logging: pendingConfig.logging
      };

      const response = await fetch(buildApiUrl(`/api/v1/devices/${deviceUuid}/target-state`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apps: currentData.apps, // Preserve existing apps
          config: updatedConfig
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save configuration');
      }

      setConfig(pendingConfig);
      setHasChanges(false);
      toast.success('Device configuration saved successfully');
    } catch (err: any) {
      console.error('Error saving device config:', err);
      toast.error(`Failed to save configuration: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPendingConfig(config);
    setHasChanges(false);
    toast.info('Changes discarded');
  };

  if (loading) {
    return (
      <div className="flex-1 bg-background overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading device configuration...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 bg-background overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={loadDeviceConfig} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-background overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Device Settings</h1>
            <p className="text-muted-foreground mt-1">
              Configure device features and behavior
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={loadDeviceConfig} 
              variant="outline" 
              size="sm"
              disabled={saving}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            {hasChanges && (
              <>
                <Button 
                  onClick={handleReset} 
                  variant="outline" 
                  size="sm"
                  disabled={saving}
                >
                  Reset
                </Button>
                <Button 
                  onClick={handleSave} 
                  size="sm"
                  disabled={saving}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Unsaved Changes Alert */}
        {hasChanges && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You have unsaved changes. Click "Save Changes" to apply them to the device.
            </AlertDescription>
          </Alert>
        )}

        {/* Device Features */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Device Features
            </CardTitle>
            <CardDescription>
              Enable or disable specific functionality on this device
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FeatureToggle
              label="Remote Access"
              description="Allow remote SSH/terminal access to this device"
              enabled={pendingConfig.features?.enableRemoteAccess ?? false}
              onToggle={() => handleFeatureToggle('enableRemoteAccess')}
            />
            
            <FeatureToggle
              label="Job Engine"
              description="Enable local job scheduling and execution on the device"
              enabled={pendingConfig.features?.enableJobEngine ?? false}
              onToggle={() => handleFeatureToggle('enableJobEngine')}
            />
            
            <FeatureToggle
              label="Cloud Jobs"
              description="Allow device to receive and execute jobs from cloud"
              enabled={pendingConfig.features?.enableCloudJobs ?? false}
              onToggle={() => handleFeatureToggle('enableCloudJobs')}
            />
            
            <FeatureToggle
              label="Sensor Publishing"
              description="Publish sensor data to MQTT broker automatically"
              enabled={pendingConfig.features?.enableSensorPublish ?? false}
              onToggle={() => handleFeatureToggle('enableSensorPublish')}
            />
            
            <FeatureToggle
              label="Protocol Adapters"
              description="Enable protocol adapters for Modbus, BACnet, and other industrial protocols"
              enabled={pendingConfig.features?.enableProtocolAdapters ?? false}
              onToggle={() => handleFeatureToggle('enableProtocolAdapters')}
            />
            
            <FeatureToggle
              label="Device Shadow"
              description="Maintain device shadow state for offline resilience"
              enabled={pendingConfig.features?.enableShadow ?? false}
              onToggle={() => handleFeatureToggle('enableShadow')}
            />
          </CardContent>
        </Card>

        {/* Feature Descriptions */}
        <Card>
          <CardHeader>
            <CardTitle>Feature Descriptions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <strong className="text-foreground">Remote Access:</strong>
              <p className="text-muted-foreground">
                Enables SSH tunneling and remote terminal access through the cloud platform. 
                Requires valid credentials and proper network configuration.
              </p>
            </div>
            <div>
              <strong className="text-foreground">Job Engine:</strong>
              <p className="text-muted-foreground">
                Allows the device to schedule and execute jobs locally (scripts, maintenance tasks, etc.). 
                Jobs can be triggered on a schedule or by events.
              </p>
            </div>
            <div>
              <strong className="text-foreground">Cloud Jobs:</strong>
              <p className="text-muted-foreground">
                Enables the device to receive job commands from the cloud platform via MQTT. 
                Jobs are executed locally and status is reported back to the cloud.
              </p>
            </div>
            <div>
              <strong className="text-foreground">Sensor Publishing:</strong>
              <p className="text-muted-foreground">
                Automatically publishes sensor readings to configured MQTT topics. 
                Sensor data becomes available for dashboards, alerts, and integrations.
              </p>
            </div>
            <div>
              <strong className="text-foreground">Protocol Adapters:</strong>
              <p className="text-muted-foreground">
                Enables communication with industrial devices using protocols like Modbus RTU/TCP, 
                BACnet, OPC UA, and others. Auto-enables when sensors are configured.
              </p>
            </div>
            <div>
              <strong className="text-foreground">Device Shadow:</strong>
              <p className="text-muted-foreground">
                Maintains a synchronized shadow state in the cloud that persists even when the device 
                goes offline. Useful for querying last-known state and queuing commands.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface FeatureToggleProps {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}

function FeatureToggle({ label, description, enabled, onToggle }: FeatureToggleProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <div className="flex-1 mr-4">
        <div className="font-medium text-foreground">{label}</div>
        <div className="text-sm text-muted-foreground mt-1">{description}</div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-300"
      />
    </div>
  );
}
