/**
 * Sensor Health Dashboard - Main Overview Page
 * Shows all sensors with their connection status and health metrics
 */

import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SensorSummaryCards } from '@/components/sensors/SensorSummaryCards';
import { SensorTable } from '@/components/sensors/SensorTable';
import { PipelineHealth } from '@/components/sensors/PipelineHealth';
import { SensorDetailPage } from './SensorDetailPage';
import { useSensorHealth } from '@/hooks/useSensorHealth';

interface SensorHealthDashboardProps {
  deviceUuid: string;
}

export const SensorHealthDashboard: React.FC<SensorHealthDashboardProps> = ({ deviceUuid }) => {
  const { data, loading, error, refetch } = useSensorHealth(deviceUuid);
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [refetch]);

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
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Sensor Health Overview</h1>
          <p className="text-sm text-gray-600">
            Last updated: {new Date().toLocaleString()}
          </p>
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

      {/* Pipeline Infrastructure (Collapsed) */}
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
      </div>
    </div>
  );
};
