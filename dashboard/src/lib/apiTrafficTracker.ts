/**
 * API Traffic Tracker
 * 
 * Tracks API endpoint usage metrics including:
 * - Request count
 * - Total bytes transferred
 * - Response time
 * - Per-endpoint statistics
 */

export type ApiTrafficMetrics = {
  count: number;
  totalBytes: number;
  totalTime: number;
  avgSize: number;
  avgTime: number;
  success: number;
  failed: number;
};

export type EndpointStats = ApiTrafficMetrics & {
  url: string;
  method?: string;
  statuses: Record<number, number>; // e.g. {200: 34, 500: 2}
};

let globalMetrics: ApiTrafficMetrics = {
  count: 0,
  totalBytes: 0,
  totalTime: 0,
  avgSize: 0,
  avgTime: 0,
  success: 0,
  failed: 0,
};

let endpointMap: Record<string, EndpointStats> = {};
let listeners: ((m: ApiTrafficMetrics) => void)[] = [];
let endpointListeners: ((endpoints: EndpointStats[]) => void)[] = [];

export const apiTrafficTracker = {
  log(url: string, size: number, duration: number, method: string = 'GET', status: number = 200) {
    // Group by path (remove query params)
    const path = url.split("?")[0];
    const key = `${method} ${path}`;
    
    const endpoint =
      endpointMap[key] ||
      (endpointMap[key] = {
        url: path,
        method,
        count: 0,
        totalBytes: 0,
        totalTime: 0,
        avgSize: 0,
        avgTime: 0,
        success: 0,
        failed: 0,
        statuses: {},
      });

    // Update endpoint metrics
    endpoint.count++;
    endpoint.totalBytes += size;
    endpoint.totalTime += duration;
    endpoint.avgSize = endpoint.totalBytes / endpoint.count;
    endpoint.avgTime = endpoint.totalTime / endpoint.count;
    endpoint.statuses[status] = (endpoint.statuses[status] || 0) + 1;

    if (status >= 200 && status < 300) {
      endpoint.success++;
    } else {
      endpoint.failed++;
    }

    // Update global metrics
    globalMetrics.count++;
    globalMetrics.totalBytes += size;
    globalMetrics.totalTime += duration;
    globalMetrics.avgSize = globalMetrics.totalBytes / globalMetrics.count;
    globalMetrics.avgTime = globalMetrics.totalTime / globalMetrics.count;
    
    if (status >= 200 && status < 300) {
      globalMetrics.success++;
    } else {
      globalMetrics.failed++;
    }

    // Notify listeners
    listeners.forEach((fn) => fn({ ...globalMetrics }));
    endpointListeners.forEach((fn) => fn(Object.values(endpointMap)));
  },

  subscribe(fn: (m: ApiTrafficMetrics) => void) {
    listeners.push(fn);
    fn(globalMetrics);
    return () => (listeners = listeners.filter((f) => f !== fn));
  },

  subscribeEndpoints(fn: (endpoints: EndpointStats[]) => void) {
    endpointListeners.push(fn);
    fn(Object.values(endpointMap));
    return () =>
      (endpointListeners = endpointListeners.filter((f) => f !== fn));
  },

  reset() {
    globalMetrics = {
      count: 0,
      totalBytes: 0,
      totalTime: 0,
      avgSize: 0,
      avgTime: 0,
      success: 0,
      failed: 0,
    };
    endpointMap = {};
    listeners.forEach((fn) => fn({ ...globalMetrics }));
    endpointListeners.forEach((fn) => fn([]));
  },

  getMetrics() {
    return { ...globalMetrics };
  },

  getEndpoints() {
    return Object.values(endpointMap);
  },
};
