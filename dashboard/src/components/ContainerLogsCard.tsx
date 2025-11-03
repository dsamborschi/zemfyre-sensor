/**
 * Container Logs Card Component
 * 
 * Displays real-time logs for containers with:
 * - Dropdown selector showing app-container format (e.g., app1-container1)
 * - Auto-scrolling log output
 * - Refresh functionality
 * - Log level filtering
 */

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Terminal, RefreshCw, Download } from "lucide-react";
import { buildApiUrl } from "@/config/api";

interface LogEntry {
  id?: number;
  device_uuid: string;
  service_name: string;
  timestamp: string;
  message: string;
  is_system: boolean;
  is_stderr: boolean;
}

interface ContainerOption {
  label: string;
  serviceName: string;
  appName: string;
}

interface Service {
  serviceId: number;
  serviceName: string;
  imageName: string;
  status: string;
  state?: string;
  health?: string;
  uptime?: string;
  id: string;
  name: string;
  image: string;
}

interface Application {
  id: string;
  appId: number;
  appName: string;
  name: string;
  image: string;
  status: string;
  syncStatus?: string;
  services?: Service[];
}

interface ContainerLogsCardProps {
  deviceUuid: string;
  applications: Application[];
}

export function ContainerLogsCard({ deviceUuid, applications }: ContainerLogsCardProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Build container options from applications
  const containerOptions: ContainerOption[] = applications.flatMap(app => 
    (app.services || []).map(service => ({
      label: `${app.appName}-${service.name}`,
      serviceName: service.name,
      appName: app.appName,
    }))
  );

  // Auto-select first container if available
  useEffect(() => {
    if (containerOptions.length > 0 && !selectedContainer) {
      setSelectedContainer(containerOptions[0].serviceName);
    }
  }, [containerOptions, selectedContainer]);

  // Fetch logs
  const fetchLogs = async () => {
    if (!selectedContainer) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        buildApiUrl(`/api/v1/devices/${deviceUuid}/logs?service=${selectedContainer}&limit=200`)
      );
      
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      } else {
        console.error('Failed to fetch logs:', response.status);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch logs on mount and when container changes
  useEffect(() => {
    fetchLogs();
    
    // Refresh every 5 seconds
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [selectedContainer, deviceUuid]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  // Download logs
  const downloadLogs = () => {
    const logText = logs.map(log => 
      `[${formatTimestamp(log.timestamp)}] ${log.message}`
    ).join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedContainer}-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedOption = containerOptions.find(opt => opt.serviceName === selectedContainer);

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Terminal className="h-6 w-6 text-muted-foreground" />
            <div>
              <CardTitle>Container Logs</CardTitle>
              <CardDescription>
                Real-time container output and system logs
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
              className={autoScroll ? 'bg-green-50 border-green-200' : ''}
            >
              <Badge variant={autoScroll ? "default" : "secondary"} className="text-xs">
                {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
              </Badge>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={downloadLogs}
              disabled={logs.length === 0}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Container Selector */}
        <div className="flex items-center gap-3 mt-4">
          <Select value={selectedContainer} onValueChange={setSelectedContainer}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Select container" />
            </SelectTrigger>
            <SelectContent>
              {containerOptions.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No containers available
                </div>
              ) : (
                containerOptions.map((option) => (
                  <SelectItem key={option.serviceName} value={option.serviceName}>
                    {option.label}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          
          {selectedOption && (
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 border border-blue-200 dark:border-blue-800">
                {logs.length} lines
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Log Output */}
        <div 
          ref={logContainerRef}
          className="bg-black rounded-lg p-4 font-mono text-sm overflow-auto"
          style={{ 
            height: '400px',
            backgroundColor: '#1e1e1e',
          }}
          onScroll={() => {
            if (logContainerRef.current) {
              const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
              // Disable auto-scroll if user scrolls up
              if (scrollTop + clientHeight < scrollHeight - 50) {
                setAutoScroll(false);
              } else {
                setAutoScroll(true);
              }
            }
          }}
        >
          {logs.length === 0 && !isLoading && (
            <div className="text-gray-500 text-center py-8">
              {selectedContainer ? 'No logs available' : 'Select a container to view logs'}
            </div>
          )}
          
          {logs.map((log, index) => {
            // Parse log level from message content (not just stderr flag)
            const isActualError = /\[error\]|\[crit\]|\[alert\]|\[emerg\]|ERROR|FATAL|CRITICAL/i.test(log.message);
            const isWarning = /\[warn\]|WARNING/i.test(log.message);
            const isNotice = /\[notice\]|INFO/i.test(log.message);
            
            // Determine color and badge based on actual log level
            let messageColor = '#9ca3af'; // gray default
            let levelBadge = null;
            
            if (isActualError) {
              messageColor = '#fca5a5'; // red
              levelBadge = <span className="ml-2 font-semibold" style={{ color: '#f87171' }}>ERROR</span>;
            } else if (isWarning) {
              messageColor = '#fcd34d'; // yellow
              levelBadge = <span className="ml-2 font-semibold" style={{ color: '#fbbf24' }}>WARN</span>;
            } else if (isNotice) {
              messageColor = '#93c5fd'; // blue
              levelBadge = <span className="ml-2 font-semibold" style={{ color: '#60a5fa' }}>INFO</span>;
            } else if (!log.is_stderr) {
              messageColor = '#86efac'; // green for stdout
            }
            
            return (
              <div 
                key={log.id || index}
                className="mb-1 hover:bg-gray-800 px-2 py-0.5 rounded"
                style={{ color: '#fff' }}
              >
                <span className="select-none" style={{ color: '#9ca3af' }}>
                  [{formatTimestamp(log.timestamp)}]
                </span>
                {levelBadge}
                {log.is_system && (
                  <span className="ml-2 font-semibold" style={{ color: '#a78bfa' }}>SYSTEM</span>
                )}
                <span className="ml-2" style={{ color: messageColor }}>
                  {log.message}
                </span>
              </div>
            );
          })}
          
          {isLoading && logs.length === 0 && (
            <div className="text-gray-500 text-center py-8">
              Loading logs...
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
