/**
 * Sensor Health Dashboard - Main Overview Page
 * Shows all sensors with their connection status and health metrics
 */

import React, { useEffect, useState } from 'react';
import { Activity, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SensorSummaryCards } from '@/components/sensors/SensorSummaryCards';
import { SensorTable } from '@/components/sensors/SensorTable';
import { PipelineHealth } from '@/components/sensors/PipelineHealth';
import { SensorDetailPage } from './SensorDetailPage';
import { AddSensorDialog } from '@/components/sensors/AddSensorDialog';
import { useSensorHealth } from '@/hooks/useSensorHealth';
import { toast } from 'sonner';

interface SensorHealthDashboardProps {
  deviceUuid: string;
}

export const SensorHealthDashboard: React.FC<SensorHealthDashboardProps> = ({ deviceUuid }) => {
  const { data, loading, error, refetch } = useSensorHealth(deviceUuid);
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null);
  const [addSensorDialogOpen, setAddSensorDialogOpen] = useState(false);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [refetch]);

  // Handle adding new sensor pipeline
  const handleAddSensorPipeline = async (config: any) => {
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
        throw new Error(error.message || 'Failed to add sensor pipeline');
      }

      const result = await response.json();
      console.log('Sensor pipeline added:', result);
      
      toast.success(`Sensor pipeline "${config.name}" added successfully`);
      
      // Refresh sensor list
      refetch();
    } catch (error: any) {
      toast.error(`Failed to add sensor pipeline: ${error.message}`);
      throw error;
    }
  };

  const handleAddProtocolDevice = async (device: any) => {
    try {
      const response = await fetch(`/api/v1/devices/${deviceUuid}/protocol-devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(device),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add protocol adapter device');
      }

      const result = await response.json();
      console.log('Protocol device added:', result);
      
      toast.success(`Protocol device "${device.name}" added successfully`);
      
      // Refresh sensor list
      refetch();
    } catch (error: any) {
      toast.error(`Failed to add protocol device: ${error.message}`);
      throw error;
    }
  };

  // Only show loading spinner on initial load (when there's no data yet)
  if (loading && !data) {
    return (
      <div className="flex-1 bg-gray-50 overflow-auto">
        <div className="flex items-center justify-center min-h-[400px]">
          <Activity className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Show error only if we have no data to display
  if (error && !data) {
    return (
      <div className="flex-1 bg-gray-50 overflow-auto p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load sensor health data: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="flex-1 bg-gray-50 overflow-auto">
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Sensors</h1>
            <p className="text-sm text-gray-600">
              Monitor and manage your connected sensors
            </p>
          </div>
          <Button onClick={() => setAddSensorDialogOpen(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Sensor
          </Button>
        </div>

      {/* Summary Cards */}
      <SensorSummaryCards summary={data.summary} />

      {/* Sensor Status Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sensors</CardTitle>
          <CardDescription>{data.devices.length} sensor(s) configured</CardDescription>
        </CardHeader>
        <CardContent>
          <SensorTable 
            sensors={data.devices} 
            onViewDetails={(sensorName) => setSelectedSensor(sensorName)}
          />
        </CardContent>
      </Card>

      {/* Pipeline Infrastructure */}
      <PipelineHealth pipelines={data.pipelines} />

      {/* Sensor Detail Modal */}
      <Dialog open={selectedSensor !== null} onOpenChange={(open) => !open && setSelectedSensor(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedSensor && (
            <SensorDetailPage 
              deviceUuid={deviceUuid}
              sensorName={selectedSensor}
              onClose={() => setSelectedSensor(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Add Sensor Dialog - Unified */}
      <AddSensorDialog
        open={addSensorDialogOpen}
        onOpenChange={setAddSensorDialogOpen}
        onSavePipeline={handleAddSensorPipeline}
        onSaveDevice={handleAddProtocolDevice}
        deviceUuid={deviceUuid}
      />
      </div>
    </div>
  );
};
