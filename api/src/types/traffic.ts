export interface DeviceTrafficStats {
  deviceId: string;
  endpoint: string;
  method: string; // HTTP method (GET, POST, PUT, DELETE, etc.)
  count: number;
  totalBytes: number;
  totalTime: number;
  avgSize: number;
  avgTime: number;
  success: number;
  failed: number;
  statuses: Record<number, number>; // e.g. {200: 12, 500: 1}
}
