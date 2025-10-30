/**
 * useSensorHealth Hook
 * Fetches sensor health data from the API
 */

import { useState, useEffect, useCallback } from 'react';

interface SensorHealthData {
  devices: Array<{
    name: string;
    protocol: string;
    status: 'online' | 'offline' | 'error';
    connected: boolean;
    lastPoll: string | null;
    errorCount: number;
    lastError: string | null;
    lastSeen: string;
  }>;
  pipelines: Array<{
    name: string;
    state: string;
    healthy: boolean;
    messagesReceived: string | number;
    messagesPublished: string | number;
    lastActivity: string | null;
    lastError: string | null;
    lastSeen: string;
  }>;
  summary: {
    total: number;
    online: number;
    offline: number;
    errors: number;
  };
}

interface UseSensorHealthResult {
  data: SensorHealthData | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useSensorHealth = (deviceUuid: string): UseSensorHealthResult => {
  const [data, setData] = useState<SensorHealthData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/v1/devices/${deviceUuid}/sensors`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const jsonData = await response.json();
      
      // Transform data to match expected format
      const transformedData: SensorHealthData = {
        devices: (jsonData.devices || []).map((device: any) => ({
          ...device,
          status: (device.status === 'online' || device.status === 'offline' || device.status === 'error') 
            ? device.status 
            : 'offline' // Default to offline if status is invalid
        })),
        pipelines: jsonData.pipelines || [],
        summary: jsonData.summary || {
          total: 0,
          online: 0,
          offline: 0,
          errors: 0
        }
      };

      setData(transformedData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [deviceUuid]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData
  };
};
