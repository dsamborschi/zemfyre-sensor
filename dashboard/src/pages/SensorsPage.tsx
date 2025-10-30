/**
 * Sensors Page - User-Friendly Sensor Management
 * Hides technical pipeline details, focuses on sensor configuration and status
 */

import React, { useEffect, useState } from 'react';
import { Activity, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AddSensorDialog } from '@/components/sensors/AddSensorDialog';
import { toast } from 'sonner';

interface SensorsPageProps {
  deviceUuid: string;
  debugMode?: boolean;
  onDebugModeChange?: (enabled: boolean) => void;
}

interface Sensor {
  name: string;
  state: string;
  healthy: boolean;
  messagesPublished: number;
  lastActivity: string | null;
  lastError: string | null;
  configured: boolean;
  type?: 'pipeline' | 'device'; // pipeline = sensor publish, device = protocol adapter
  protocol?: string;
  connected?: boolean;
}

export const SensorsPage: React.FC<SensorsPageProps> = ({ 
  deviceUuid, 
  debugMode = false, 
  onDebugModeChange 
}) => {
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addSensorDialogOpen, setAddSensorDialogOpen] = useState(false);

  const fetchSensors = async () => {
    try {
      const response = await fetch(`/api/v1/devices/${deviceUuid}/sensors`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      
      // Merge pipelines and protocol adapter devices
      const pipelines = (data.pipelines || []).map((p: any) => ({
        ...p,
        type: 'pipeline' as const,
        protocol: p.protocolType, // Map protocolType to protocol for consistency
      }));
      
      const devices = (data.devices || []).map((d: any) => ({
        name: d.name,
        state: d.connected ? 'CONNECTED' : 'DISCONNECTED',
        healthy: d.connected,
        messagesPublished: 0, // Protocol adapters don't track messages
        lastActivity: d.lastSeen,
        lastError: d.lastError,
        configured: true,
        type: 'device' as const,
        protocol: d.protocol,
        connected: d.connected,
      }));
      
      setSensors([...pipelines, ...devices]);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSensors();
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchSensors, 10000);
    return () => clearInterval(interval);
  }, [deviceUuid]);

  const handleAddSensor = async (config: any) => {
    try {
      const response = await fetch(`/api/v1/devices/${deviceUuid}/sensor-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add sensor');
      }

      toast.success(`Sensor "${config.name}" added successfully`);
      fetchSensors();
    } catch (error: any) {
      toast.error(`Failed to add sensor: ${error.message}`);
      throw error;
    }
  };

  const getStatusBadge = (sensor: Sensor) => {
    if (sensor.state === 'PENDING') {
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">⏳ Starting...</Badge>;
    }
    if (sensor.state === 'CONNECTED' && sensor.healthy) {
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">✓ Active</Badge>;
    }
    if (sensor.state === 'DISCONNECTED') {
      return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">○ Inactive</Badge>;
    }
    return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">✕ Error</Badge>;
  };

  if (loading) {
    return (
      <div className="flex-1 bg-gray-50 overflow-auto">
        <div className="flex items-center justify-center min-h-[400px]">
          <Activity className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50 overflow-auto">
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Sensors</h1>
            <p className="text-sm text-gray-600">
              Configure and monitor your connected sensors
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onDebugModeChange && (
              <Button 
                variant={debugMode ? 'default' : 'outline'}
                onClick={() => onDebugModeChange(!debugMode)}
                className="flex items-center gap-2"
              >
                Debug
              </Button>
            )}
            <Button onClick={() => setAddSensorDialogOpen(true)} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Sensor
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>Failed to load sensors: {error}</AlertDescription>
          </Alert>
        )}

        {/* Sensors List */}
        <Card>
          <CardHeader>
            <CardTitle>Configured Sensors</CardTitle>
            <CardDescription>
              {sensors.length === 0 
                ? 'No sensors configured yet. Click "Add Sensor" to get started.' 
                : `${sensors.length} sensor(s) configured`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sensors.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Activity className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium mb-2">No sensors yet</p>
                <p className="text-sm">Add your first sensor to start collecting data</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sensors.map((sensor) => (
                  <div
                    key={sensor.name}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{sensor.name}</h3>
                        {getStatusBadge(sensor)}
                        {sensor.protocol && (
                          <Badge variant="outline" className="text-xs">
                            {sensor.protocol.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap gap-6 text-sm text-gray-600">
                        {sensor.type === 'pipeline' && (
                          <div>
                            <span className="font-medium">Messages Published:</span>{' '}
                            {sensor.messagesPublished.toLocaleString()}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Last Activity:</span>{' '}
                          {sensor.lastActivity 
                            ? new Date(sensor.lastActivity).toLocaleString()
                            : 'Never'}
                        </div>
                      </div>

                      {sensor.lastError && sensor.state !== 'PENDING' && (
                        <div className="mt-2 text-sm text-red-600">
                          <span className="font-medium">Error:</span> {sensor.lastError}
                        </div>
                      )}
                      
                      {sensor.state === 'PENDING' && (
                        <div className="mt-2 text-sm text-yellow-600">
                          <span className="font-medium">Status:</span> Waiting for agent to initialize sensor...
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Sensor Dialog */}
        <AddSensorDialog
          open={addSensorDialogOpen}
          onOpenChange={setAddSensorDialogOpen}
          onSave={handleAddSensor}
        />
      </div>
    </div>
  );
};
