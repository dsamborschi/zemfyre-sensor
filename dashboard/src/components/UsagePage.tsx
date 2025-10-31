/**
 * Usage Page - API Endpoint Analytics
 * 
 * Displays real-time API usage statistics including:
 * - Total requests
 * - Total bandwidth
 * - Average response time
 * - Per-endpoint breakdown
 */

import { useEffect, useState } from "react";
import { apiTrafficTracker, EndpointStats, ApiTrafficMetrics } from "@/lib/apiTrafficTracker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, BarChart3, Clock, HardDrive, RefreshCw, TrendingUp } from "lucide-react";

export function UsagePage() {
  const [globalMetrics, setGlobalMetrics] = useState<ApiTrafficMetrics>({
    count: 0,
    totalBytes: 0,
    totalTime: 0,
    avgSize: 0,
    avgTime: 0,
    success: 0,
    failed: 0,
  });
  const [endpoints, setEndpoints] = useState<EndpointStats[]>([]);

  useEffect(() => {
    // Subscribe to global metrics
    const unsubGlobal = apiTrafficTracker.subscribe(setGlobalMetrics);
    
    // Subscribe to endpoint metrics
    const unsubEndpoints = apiTrafficTracker.subscribeEndpoints(setEndpoints);
    
    return () => {
      unsubGlobal();
      unsubEndpoints();
    };
  }, []);

  // Sort endpoints by total bytes (most bandwidth-intensive first)
  const sortedEndpoints = [...endpoints].sort((a, b) => b.totalBytes - a.totalBytes);

  // Format bytes to human-readable format
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Format time in ms
  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Get method badge color
  const getMethodColor = (method?: string) => {
    switch (method) {
      case 'GET':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'POST':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'PUT':
      case 'PATCH':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'DELETE':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const handleReset = () => {
    if (confirm('Reset all usage statistics? This cannot be undone.')) {
      apiTrafficTracker.reset();
    }
  };

  return (
    <div className="flex-1 bg-gray-50 overflow-auto">
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">API Usage</h1>
            <p className="text-sm text-gray-600">
              Monitor API endpoint usage and performance metrics
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset Stats
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-2 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Total Requests</p>
                  <p className="text-3xl font-bold">{globalMetrics.count}</p>
                  <p className="text-xs text-muted-foreground">
                    {globalMetrics.success > 0 && (
                      <span className="text-green-600">{globalMetrics.success} success</span>
                    )}
                    {globalMetrics.failed > 0 && (
                      <>
                        {globalMetrics.success > 0 && ' • '}
                        <span className="text-red-600">{globalMetrics.failed} failed</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="h-12 w-12 text-blue-600 dark:text-blue-400">
                  <Activity className="h-full w-full" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Total Bandwidth</p>
                  <p className="text-3xl font-bold">{formatBytes(globalMetrics.totalBytes)}</p>
                  <p className="text-xs text-muted-foreground">Avg: {formatBytes(globalMetrics.avgSize)}</p>
                </div>
                <div className="h-12 w-12 text-purple-600 dark:text-purple-400">
                  <HardDrive className="h-full w-full" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Avg Response Time</p>
                  <p className="text-3xl font-bold">{formatTime(globalMetrics.avgTime)}</p>
                  <p className="text-xs text-muted-foreground">Performance metric</p>
                </div>
                <div className="h-12 w-12 text-green-600 dark:text-green-400">
                  <Clock className="h-full w-full" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                  <p className="text-3xl font-bold">
                    {globalMetrics.count > 0 
                      ? Math.round((globalMetrics.success / globalMetrics.count) * 100) 
                      : 0}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {globalMetrics.success}/{globalMetrics.count} requests
                  </p>
                </div>
                <div className="h-12 w-12 text-orange-600 dark:text-orange-400">
                  <TrendingUp className="h-full w-full" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Endpoints Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Endpoint Analytics</CardTitle>
                <CardDescription>
                  {sortedEndpoints.length === 0 
                    ? 'No API requests tracked yet' 
                    : `Top ${Math.min(sortedEndpoints.length, 20)} endpoints by bandwidth usage`}
                </CardDescription>
              </div>
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {sortedEndpoints.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium mb-2">No data yet</p>
                <p className="text-sm">API usage will appear here as you use the application</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700">Method</th>
                      <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700">Endpoint</th>
                      <th className="text-right py-3 px-4 font-semibold text-sm text-gray-700">Requests</th>
                      <th className="text-right py-3 px-4 font-semibold text-sm text-gray-700">Success</th>
                      <th className="text-right py-3 px-4 font-semibold text-sm text-gray-700">Failed</th>
                      <th className="text-right py-3 px-4 font-semibold text-sm text-gray-700">Total Size</th>
                      <th className="text-right py-3 px-4 font-semibold text-sm text-gray-700">Avg Size</th>
                      <th className="text-right py-3 px-4 font-semibold text-sm text-gray-700">Avg Time</th>
                      <th className="text-right py-3 px-4 font-semibold text-sm text-gray-700">Status Codes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEndpoints.slice(0, 20).map((endpoint, index) => {
                      const statusCodes = Object.entries(endpoint.statuses || {})
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([code, count]) => `${code}:${count}`)
                        .join(', ');

                      return (
                        <tr 
                          key={`${endpoint.method}-${endpoint.url}`}
                          className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                            index < 3 ? 'bg-blue-50/30' : ''
                          }`}
                        >
                          <td className="py-3 px-4">
                            <Badge variant="outline" className={getMethodColor(endpoint.method)}>
                              {endpoint.method || 'GET'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 font-mono text-sm text-gray-700 max-w-md truncate" title={endpoint.url}>
                            {endpoint.url}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-700">
                            {endpoint.count}
                          </td>
                          <td className="py-3 px-4 text-right text-green-600 font-medium">
                            {endpoint.success || 0}
                          </td>
                          <td className="py-3 px-4 text-right text-red-600 font-medium">
                            {endpoint.failed || 0}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-700 font-medium">
                            {formatBytes(endpoint.totalBytes)}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600">
                            {formatBytes(endpoint.avgSize)}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600">
                            {formatTime(endpoint.avgTime)}
                          </td>
                          <td className="py-3 px-4 text-right text-xs font-mono text-gray-500">
                            {statusCodes || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
