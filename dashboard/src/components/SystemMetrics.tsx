import { useState } from "react";
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
import { MqttMetricsCard } from "./MqttMetricsCard";

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
  onToggleServiceStatus?: (appId: string, serviceId: number, action: "start" | "stop") => void;
  networkInterfaces?: NetworkInterface[];
}

const cpuData = [
  { time: "00:00", value: 45 },
  { time: "00:05", value: 52 },
  { time: "00:10", value: 48 },
  { time: "00:15", value: 65 },
  { time: "00:20", value: 58 },
  { time: "00:25", value: 72 },
  { time: "00:30", value: 68 },
  { time: "00:35", value: 55 },
  { time: "00:40", value: 62 },
  { time: "00:45", value: 58 },
];

const memoryData = [
  { time: "00:00", used: 6.2, available: 9.8 },
  { time: "00:05", used: 6.5, available: 9.5 },
  { time: "00:10", used: 6.8, available: 9.2 },
  { time: "00:15", used: 7.2, available: 8.8 },
  { time: "00:20", used: 7.5, available: 8.5 },
  { time: "00:25", used: 7.8, available: 8.2 },
  { time: "00:30", used: 8.0, available: 8.0 },
  { time: "00:35", used: 7.6, available: 8.4 },
  { time: "00:40", used: 7.3, available: 8.7 },
  { time: "00:45", used: 7.0, available: 9.0 },
];

const networkData = [
  { time: "00:00", download: 12, upload: 5 },
  { time: "00:05", download: 18, upload: 7 },
  { time: "00:10", download: 15, upload: 6 },
  { time: "00:15", download: 25, upload: 10 },
  { time: "00:20", download: 22, upload: 9 },
  { time: "00:25", download: 30, upload: 12 },
  { time: "00:30", download: 28, upload: 11 },
  { time: "00:35", download: 20, upload: 8 },
  { time: "00:40", download: 24, upload: 10 },
  { time: "00:45", download: 19, upload: 7 },
];

export function SystemMetrics({ 
  device, 
  cpuHistory = cpuData,
  memoryHistory = memoryData,
  networkHistory = networkData,
  applications = [],
  onAddApplication = () => {},
  onUpdateApplication = () => {},
  onRemoveApplication = () => {},
  onToggleAppStatus = () => {},
  onToggleServiceStatus = () => {},
  networkInterfaces = []
}: SystemMetricsProps) {
  const [selectedMetric, setSelectedMetric] = useState<'cpu' | 'memory' | 'network'>('cpu');
  const [timePeriod, setTimePeriod] = useState<'30min' | '6h' | '12h' | '24h'>('30min');

  // Calculate running and total apps/services
  const runningApps = applications.filter(app => app.status === "running").length;
  const totalApps = applications.length;

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
      value: `${runningApps}/${totalApps}`,
      progress: totalApps > 0 ? (runningApps / totalApps) * 100 : 0,
      color: "orange",
      bgColor: "bg-orange-50",
      iconColor: "text-orange-600",
      subtitle: "Running",
    },
  ];

  const systemInfo = [
    { label: "Operating System", value: "Linux" },
    { label: "Architecture", value: "ArmV7" },
    { label: "Uptime", value: "15 days, 7 hours" },
    { label: "Hostname", value: device.name },
    { label: "IP Address", value: device.ipAddress },
    { label: "MAC Address", value: "00:1B:44:11:3A:B7" },
  ];

  const processes = [
    { name: "node", cpu: 18.5, memory: 12.3, pid: 1234 },
    { name: "postgres", cpu: 12.2, memory: 8.7, pid: 5678 },
    { name: "nginx", cpu: 8.1, memory: 5.2, pid: 9012 },
    { name: "docker", cpu: 6.5, memory: 15.6, pid: 3456 },
    { name: "systemd", cpu: 4.2, memory: 3.1, pid: 1 },
  ];

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
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-gray-600 mb-1">{metric.label}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-gray-900">{metric.value}</p>
                      {metric.subtitle && (
                        <span className="text-sm text-gray-500">{metric.subtitle}</span>
                      )}
                    </div>
                  </div>
                  <div className={`w-10 h-10 ${metric.bgColor} rounded-lg flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${metric.iconColor}`} />
                  </div>
                </div>
                {metric.label !== "Applications" && (
                  <div 
                    className="relative h-3 w-full overflow-hidden rounded-full"
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
          <Card className="p-4 md:p-6">
            <div className="mb-4">
              <h3 className="text-gray-900 mb-1">General Info</h3>
              <p className="text-gray-600">Device details and configuration</p>
            </div>
            <div className="space-y-3">
              {systemInfo.map((info, index) => (
                <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-gray-600">{info.label}</span>
                  <span className="text-gray-900">{info.value}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Applications */}
          <div id="applications-section">
            <ApplicationsCard
              deviceId={device.id}
              applications={applications}
              onAddApplication={onAddApplication}
              onUpdateApplication={onUpdateApplication}
              onRemoveApplication={onRemoveApplication}
              onToggleStatus={onToggleAppStatus}
              onToggleServiceStatus={onToggleServiceStatus}
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
        </div>

        {/* Analytics Card */}
        <div id="analytics-section">
          <AnalyticsCard deviceName={device.name} processes={processes} />
        </div>

        {/* Top Processes */}
        <Card className="p-4 md:p-6" id="processes-section">
          <div className="mb-4">
            <h3 className="text-lg text-gray-900 font-medium mb-1">Top Processes</h3>
            <p className="text-sm text-gray-600">Most resource-intensive processes</p>
          </div>
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
                    <td className="py-3 px-0 text-gray-900">{process.name}</td>
                    <td className="py-3 px-4 text-gray-600 hidden sm:table-cell">{process.pid}</td>
                    <td className="py-3 px-4 text-gray-900">{process.cpu}%</td>
                    <td className="py-3 px-4 text-gray-900 hidden md:table-cell">{process.memory}%</td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[120px]">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${process.cpu * 5}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
