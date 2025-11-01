import { useState, useEffect } from "react";
import { Cpu, HardDrive, MemoryStick, Package } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Device } from "./DeviceSidebar";
import { DeviceActions } from "./DeviceActions";
import { ApplicationsCard, Application } from "./ApplicationsCard";
import { NetworkingCard, NetworkInterface } from "./NetworkingCard";
import { AnalyticsCard } from "./AnalyticsCard";
import { GeneralInfoCard } from "./GeneralInfoCard";
import { buildApiUrl } from "@/config/api";

interface SystemMetricsProps {
  device: Device;
  cpuHistory?: Array<{ time: string; value: number }>;
  memoryHistory?: Array<{ time: string; used: number; available: number }>;
  networkHistory?: Array<{ time: string; download: number; upload: number }>;
  networkInterfaces?: NetworkInterface[];
}

export function SystemMetrics({ 
  device, 
  cpuHistory = [],
  memoryHistory = [],
  networkHistory = [],
  networkInterfaces = []
}: SystemMetricsProps) {
  const [selectedMetric, setSelectedMetric] = useState<'cpu' | 'memory' | 'network'>('cpu');
  const [timePeriod, setTimePeriod] = useState<'30min' | '6h' | '12h' | '24h'>('30min');

  const metrics = [
    {
      icon: Cpu,
      label: "CPU Usage",
      value: `${device.cpu}%`,
      progress: device.cpu,
      color: "blue",
      bgColor: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      icon: MemoryStick,
      label: "Memory",
      value: `${device.memory}%`,
      progress: device.memory,
      color: "purple",
      bgColor: "bg-purple-50",
      iconColor: "text-purple-600",
    },
    {
      icon: HardDrive,
      label: "Disk Usage",
      value: `${device.disk}%`,
      progress: device.disk,
      color: "green",
      bgColor: "bg-green-50",
      iconColor: "text-green-600",
    },
  ];

  // Fetch system info from API
  const [systemInfo, setSystemInfo] = useState([
    { label: "Operating System", value: "Unknown" },
    { label: "Architecture", value: "Unknown" },
    { label: "Uptime", value: "Unknown" },
    { label: "Hostname", value: device.name },
    { label: "IP Address", value: device.ipAddress },
    { label: "MAC Address", value: "Unknown" },
  ]);

  useEffect(() => {
    // Clear systemInfo immediately on device change
    setSystemInfo([
      { label: "Operating System", value: "Unknown" },
      { label: "Architecture", value: "Unknown" },
      { label: "Uptime", value: "Unknown" },
      { label: "Hostname", value: device.name },
      { label: "IP Address", value: device.ipAddress },
      { label: "MAC Address", value: "Unknown" },
    ]);

    const fetchSystemInfo = async () => {
      if (!device.deviceUuid) return;
      try {
        const response = await fetch(buildApiUrl(`/api/v1/devices/${device.deviceUuid}/current-state`));
        if (!response.ok) {
          console.warn('Failed to fetch system info');
          return;
        }
        const data = await response.json();
        // Format uptime from seconds to human readable
        const formatUptime = (seconds: number): string => {
          const days = Math.floor(seconds / 86400);
          const hours = Math.floor((seconds % 86400) / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          const parts = [];
          if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
          if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
          if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
          return parts.length > 0 ? parts.join(', ') : 'Less than a minute';
        };
        // Extract OS and architecture from os_version string (e.g., "Microsoft Windows 10 Pro 10.0.19045")
        const osVersion = data.os_version || '';
        const osMatch = osVersion.match(/^([^0-9]+)/);
        const os = osMatch ? osMatch[1].trim() : (osVersion || 'Unknown');
        setSystemInfo([
          { label: "Operating System", value: os },
          { label: "Architecture", value: data.architecture || "Unknown" },
          { label: "Uptime", value: data.uptime ? formatUptime(data.uptime) : "Unknown" },
          { label: "Hostname", value: data.hostname || device.name },
          { label: "IP Address", value: device.ipAddress },
          { label: "MAC Address", value: device.macAddress || data.mac_address || "Unknown" },
        ]);
      } catch (error) {
        console.error('Failed to fetch system info:', error);
      }
    };

    fetchSystemInfo();
    const interval = setInterval(fetchSystemInfo, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [device.deviceUuid, device.name, device.ipAddress, device.macAddress]);

  // Fetch process data from API
  const [processes, setProcesses] = useState<Array<{
    pid: number;
    name: string;
    cpu: number;
    mem: number;
    command?: string;
  }>>([]);
  const [processesLoading, setProcessesLoading] = useState(true);

  useEffect(() => {
    // Clear processes immediately on device change
    setProcesses([]);
    setProcessesLoading(true);

    const fetchProcesses = async () => {
      if (!device.deviceUuid) return;
      try {
        const response = await fetch(buildApiUrl(`/api/v1/devices/${device.deviceUuid}/processes`));
        const data = await response.json();
        if (data.top_processes && Array.isArray(data.top_processes)) {
          setProcesses(data.top_processes);
        }
      } catch (error) {
        console.error('Failed to fetch processes:', error);
      } finally {
        setProcessesLoading(false);
      }
    };

    fetchProcesses();
    const interval = setInterval(fetchProcesses, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [device.deviceUuid]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="flex-1 bg-background overflow-auto">
      <div className="p-4 md:p-6 lg:p-8 space-y-6">

        {/* Quick Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric, index) => {
            const Icon = metric.icon;
            
            const iconColors = {
              blue: 'text-blue-600 dark:text-blue-400',
              purple: 'text-purple-600 dark:text-purple-400',
              green: 'text-green-600 dark:text-green-400',
              orange: 'text-orange-600 dark:text-orange-400',
            };

            const progressBarColors = {
              blue: 'bg-blue-600 dark:bg-blue-500',
              purple: 'bg-purple-600 dark:bg-purple-500',
              green: 'bg-green-600 dark:bg-green-500',
              orange: 'bg-orange-600 dark:bg-orange-500',
            };

            return (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardDescription>{metric.label}</CardDescription>
                    <div className={`h-10 w-10 ${iconColors[metric.color as keyof typeof iconColors]}`}>
                      <Icon className="h-full w-full" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-3xl">{metric.value}</CardTitle>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted mt-4">
                    <div 
                      className={`h-full transition-all ${progressBarColors[metric.color as keyof typeof progressBarColors]}`}
                      style={{ width: `${metric.progress}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Cards in 2-Column Layout */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Telemetry Chart - Combined CPU, Memory, and Network */}
          <Card className="p-4 md:p-6">
            <div className="mb-4 space-y-3">
              <div>
                <h3 className="text-lg text-foreground font-medium mb-1">Telemetry</h3>
                <p className="text-sm text-muted-foreground">System performance metrics</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={timePeriod} onValueChange={(value: any) => setTimePeriod(value)}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30min">30 minutes</SelectItem>
                    <SelectItem value="6h">6 hours</SelectItem>
                    <SelectItem value="12h">12 hours</SelectItem>
                    <SelectItem value="24h">24 hours</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedMetric} onValueChange={(value: any) => setSelectedMetric(value)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpu">CPU Usage</SelectItem>
                    <SelectItem value="memory">Memory Usage</SelectItem>
                    <SelectItem value="network">Network Activity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedMetric === 'cpu' && (
              <>
                {cpuHistory.length === 0 ? (
                  <div className="flex items-center justify-center h-[250px] text-gray-500">
                    No CPU data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={cpuHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <defs>
                        <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#6b7280" width={40} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorCpu)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </>
            )}

            {selectedMetric === 'memory' && (
              <>
                {memoryHistory.length === 0 ? (
                  <div className="flex items-center justify-center h-[250px] text-gray-500">
                    No memory data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={memoryHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorUsed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorAvailable" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#6b7280" width={40} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="used"
                    stackId="1"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorUsed)"
                  />
                  <Area
                    type="monotone"
                    dataKey="available"
                    stackId="1"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorAvailable)"
                  />
                </AreaChart>
              </ResponsiveContainer>
                )}
              </>
            )}

            {selectedMetric === 'network' && (
              <>
                {networkHistory.length === 0 ? (
                  <div className="flex items-center justify-center h-[250px] text-gray-500">
                    No network data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={networkHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#6b7280" width={40} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="download"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="upload"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </>
            )}
          </Card>

          {/* System Info */}
          <GeneralInfoCard systemInfo={systemInfo} />

          {/* Network Interfaces */}
          <NetworkingCard interfaces={networkInterfaces} />

          {/* Analytics Card */}
          <div id="analytics-section">
            <AnalyticsCard 
              deviceName={device.name} 
              deviceId={device.deviceUuid} 
              processes={processes.map(p => ({
                name: p.name,
                pid: p.pid,
                cpu: p.cpu,
                memory: p.mem, // Map mem to memory for AnalyticsCard
              }))} 
              provisioned={device.status !== 'pending'}
            />
          </div>
        </div>

        {/* Top Processes */}
        <Card className="p-4 md:p-6" id="processes-section">
          <div className="mb-4">
            <h3 className="text-lg text-foreground font-medium mb-1">Top Processes</h3>
            <p className="text-sm text-muted-foreground">Most resource-intensive processes</p>
          </div>
          {processesLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading processes...</div>
          ) : processes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No process data available</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-0 text-sm font-medium text-muted-foreground">Process</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground hidden sm:table-cell">PID</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">CPU %</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground hidden md:table-cell">Memory %</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground hidden lg:table-cell">CPU Usage</th>
                  </tr>
                </thead>
                <tbody>
                  {processes.map((process, index) => (
                    <tr key={index} className="border-b border-border last:border-0">
                      <td className="py-3 px-0 text-foreground truncate max-w-[150px]">
                        {process.name}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">{process.pid}</td>
                      <td className="py-3 px-4 text-foreground">{process.cpu.toFixed(1)}%</td>
                      <td className="py-3 px-4 text-foreground hidden md:table-cell">{process.mem.toFixed(1)}%</td>
                      <td className="py-3 px-4 hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2 max-w-[120px]">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${Math.min(process.cpu * 5, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
