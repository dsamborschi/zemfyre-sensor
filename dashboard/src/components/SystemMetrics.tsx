import { useState, useEffect } from "react";
import { Cpu, HardDrive, MemoryStick, Activity, Wifi, Thermometer, Zap, Clock, Package } from "lucide-react";
import { Card } from "./ui/card";
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
import { MqttBrokerCard } from "./MqttBrokerCard";
import { TimelineCard } from "./TimelineCard";
import { MqttMetricsCard } from "./MqttMetricsCard";
import { DeviceTimelineCard } from "./DeviceTimelineCard";
import { GeneralInfoCard } from "./GeneralInfoCard";
import { buildApiUrl } from "@/config/api";

interface SystemMetricsProps {
  device: Device;
  cpuHistory?: Array<{ time: string; value: number }>;
  memoryHistory?: Array<{ time: string; used: number; available: number }>;
  networkHistory?: Array<{ time: string; download: number; upload: number }>;
  applications?: Application[];
  onAddApplication?: (app: Omit<Application, "id">) => void;
  onUpdateApplication?: (app: Application) => void;
  onRemoveApplication?: (appId: string) => void;
  onToggleAppStatus?: (appId: string) => void;
  onToggleServiceStatus?: (appId: string, serviceId: number, action: "start" | "pause" | "stop") => void;
  networkInterfaces?: NetworkInterface[];
  deploymentStatus?: {
    needsDeployment: boolean;
    version: number;
    lastDeployedAt?: string;
    deployedBy?: string;
  };
  onDeploy?: () => void;
  onCancelDeploy?: () => void;
}

export function SystemMetrics({ 
  device, 
  cpuHistory = [],
  memoryHistory = [],
  networkHistory = [],
  applications = [],
  onAddApplication = () => {},
  onUpdateApplication = () => {},
  onRemoveApplication = () => {},
  onToggleAppStatus = () => {},
  onToggleServiceStatus = () => {},
  networkInterfaces = [],
  deploymentStatus,
  onDeploy = () => {},
  onCancelDeploy = () => {}
}: SystemMetricsProps) {
  const [selectedMetric, setSelectedMetric] = useState<'cpu' | 'memory' | 'network'>('cpu');
  const [timePeriod, setTimePeriod] = useState<'30min' | '6h' | '12h' | '24h'>('30min');

  // Calculate running and total apps/services
  const runningApps = applications.filter(app => app.status === "running").length;
  const totalApps = applications.length;
  
  // Calculate sync status for applications
  const syncingApps = applications.filter(app => app.syncStatus === "syncing").length;
  const errorApps = applications.filter(app => app.syncStatus === "error").length;
  const pendingApps = applications.filter(app => app.syncStatus === "pending").length;
  const syncedApps = applications.filter(app => app.syncStatus === "synced").length;
  
  // Show total apps count as the main value
  const getAppValue = () => {
    return totalApps === 0 ? "0" : `${totalApps}`;
  };
  
  // Determine the subtitle for applications - show aggregate status
  const getAppSubtitle = () => {
    if (totalApps === 0) return "No apps";
    
    const statuses = [];
    
    if (errorApps > 0) statuses.push(`${errorApps} Error`);
    if (syncingApps > 0) statuses.push(`${syncingApps} Syncing`);
    if (pendingApps > 0) statuses.push(`${pendingApps} Pending`);
    if (syncedApps > 0) statuses.push(`${syncedApps} Synced`);
    
    return statuses.join(', ') || `${totalApps} Running`;
  };
  
  const getAppSubtitleColor = () => {
    // Priority: Error (red) > Syncing (blue) > Pending (yellow) > default (gray)
    if (errorApps > 0) return "text-red-600";
    if (syncingApps > 0) return "text-blue-600";
    if (pendingApps > 0) return "text-yellow-600";
    return "text-gray-500";
  };

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
    {
      icon: Package,
      label: "Applications",
      value: getAppValue(),
      progress: totalApps > 0 ? (runningApps / totalApps) * 100 : 0,
      color: "orange",
      bgColor: "bg-orange-50",
      iconColor: "text-orange-600",
      subtitle: getAppSubtitle(),
      subtitleColor: getAppSubtitleColor(),
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
    <div className="flex-1 bg-gray-50 overflow-auto">
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* Header - Hidden on mobile (shown in sticky header instead) */}
        <div className="hidden lg:block space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-gray-900 mb-2">{device.name}</h1>
              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className={
                    device.status === "online"
                      ? "bg-green-100 text-green-700 border-green-200"
                      : device.status === "warning"
                      ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                      : "bg-gray-100 text-gray-700 border-gray-200"
                  }
                >
                  {device.status}
                </Badge>
                <span className="text-gray-600">{device.type}</span>
                <span className="text-gray-600">•</span>
                <span className="text-gray-600">{device.ipAddress}</span>
              </div>
            </div>

            {/* Quick Navigation Links */}
            <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-gray-500 mr-2">Jump to:</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => scrollToSection('applications-section')}
                className="text-xs"
              >
                Applications
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => scrollToSection('mqtt-section')}
                className="text-xs"
              >
                MQTT
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => scrollToSection('events-section')}
                className="text-xs"
              >
                Events
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => scrollToSection('analytics-section')}
                className="text-xs"
              >
                Analytics
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => scrollToSection('processes-section')}
                className="text-xs"
              >
                Processes
              </Button>
            </div>
          </div>
          
          {/* Device Actions */}
          <DeviceActions deviceName={device.name} deviceId={device.id} />
        </div>

        {/* Quick Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
          {metrics.map((metric, index) => {
            const Icon = metric.icon;
            
            const getProgressColors = (color: string) => {
              switch(color) {
                case 'blue':
                  return { bg: '#dbeafe', bar: '#2563eb' }; // blue-100, blue-600
                case 'purple':
                  return { bg: '#e9d5ff', bar: '#9333ea' }; // purple-200, purple-600
                case 'green':
                  return { bg: '#dcfce7', bar: '#16a34a' }; // green-100, green-600
                case 'orange':
                  return { bg: '#ffedd5', bar: '#ea580c' }; // orange-100, orange-600
                default:
                  return { bg: '#f3f4f6', bar: '#4b5563' }; // gray-100, gray-600
              }
            };

            const colors = getProgressColors(metric.color);

            return (
              <Card key={index} className="p-4 md:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-600 mb-2">{metric.label}</p>
                    <p className="text-2xl font-bold text-gray-900 mb-2">{metric.value}</p>
                    {metric.subtitle && metric.label === "Applications" ? (
                      // Special rendering for Applications with status badges
                      <div className="flex flex-wrap gap-1.5">
                        {errorApps > 0 && (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs px-2 py-0.5">
                            {errorApps} Error
                          </Badge>
                        )}
                        {syncingApps > 0 && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs px-2 py-0.5">
                            {syncingApps} Syncing
                          </Badge>
                        )}
                        {pendingApps > 0 && (
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs px-2 py-0.5">
                            {pendingApps} Pending
                          </Badge>
                        )}
                        {syncedApps > 0 && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs px-2 py-0.5">
                            {syncedApps} Synced
                          </Badge>
                        )}
                        {totalApps > 0 && errorApps === 0 && syncingApps === 0 && pendingApps === 0 && syncedApps === 0 && (
                          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200 text-xs px-2 py-0.5">
                            {totalApps} Running
                          </Badge>
                        )}
                      </div>
                    ) : metric.subtitle ? (
                      // Regular subtitle for other metrics
                      <span className={`text-sm font-medium ${(metric as any).subtitleColor || 'text-gray-500'}`}>
                        {metric.subtitle}
                      </span>
                    ) : null}
                  </div>
                  <div className={`w-10 h-10 ${metric.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${metric.iconColor}`} />
                  </div>
                </div>
                {metric.label !== "Applications" && (
                  <div 
                    className="relative h-2 w-full overflow-hidden rounded-full"
                    style={{ backgroundColor: colors.bg }}
                  >
                    <div 
                      className="h-full transition-all"
                      style={{ 
                        width: `${metric.progress}%`,
                        backgroundColor: colors.bar
                      }}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Telemetry Chart - Combined CPU, Memory, and Network */}
          <Card className="p-4 md:p-6">
            <div className="mb-4 space-y-3">
              <div>
                <h3 className="text-lg text-gray-900 font-medium mb-1">Telemetry</h3>
                <p className="text-sm text-gray-600">System performance metrics</p>
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
          </Card>

          {/* System Info */}
          <GeneralInfoCard systemInfo={systemInfo} />

          {/* Applications */}
          <div id="applications-section">
            <ApplicationsCard
              deviceId={device.id}
              deviceUuid={device.deviceUuid}
              applications={applications}
              onAddApplication={onAddApplication}
              onUpdateApplication={onUpdateApplication}
              onRemoveApplication={onRemoveApplication}
              onToggleStatus={onToggleAppStatus}
              onToggleServiceStatus={onToggleServiceStatus}
              deploymentStatus={deploymentStatus}
              onDeploy={onDeploy}
              onCancelDeploy={onCancelDeploy}
            />
          </div>

          {/* Network Interfaces */}
          <NetworkingCard interfaces={networkInterfaces} />

          {/* MQTT Broker */}
          <div id="mqtt-section">
            <MqttBrokerCard deviceId={device.deviceUuid} />
          </div>

          {/* MQTT Metrics */}
          <MqttMetricsCard deviceId={device.deviceUuid} />

          {/* Event Timeline */}

           
         
        </div>

        {/* Analytics Card */}
        <div id="analytics-section">
          <AnalyticsCard deviceName={device.name} deviceId={device.deviceUuid} processes={processes} />
        </div>

        {/* Top Processes */}
        <Card className="p-4 md:p-6" id="processes-section">
          <div className="mb-4">
            <h3 className="text-lg text-gray-900 font-medium mb-1">Top Processes</h3>
            <p className="text-sm text-gray-600">Most resource-intensive processes</p>
          </div>
          {processesLoading ? (
            <div className="text-center py-8 text-gray-500">Loading processes...</div>
          ) : processes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No process data available</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-0 text-sm font-medium text-gray-600">Process</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 hidden sm:table-cell">PID</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">CPU %</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 hidden md:table-cell">Memory %</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 hidden lg:table-cell">CPU Usage</th>
                  </tr>
                </thead>
                <tbody>
                  {processes.map((process, index) => (
                    <tr key={index} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 px-0 text-gray-900 truncate max-w-[150px]">
                        {process.name}
                      </td>
                      <td className="py-3 px-4 text-gray-600 hidden sm:table-cell">{process.pid}</td>
                      <td className="py-3 px-4 text-gray-900">{process.cpu.toFixed(1)}%</td>
                      <td className="py-3 px-4 text-gray-900 hidden md:table-cell">{process.mem.toFixed(1)}%</td>
                      <td className="py-3 px-4 hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[120px]">
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

          <TimelineCard
              deviceId={device.deviceUuid}
              limit={5}
              autoRefresh={true}
              refreshInterval={30000}
            />
      </div>
    </div>
  );
}
