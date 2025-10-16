import { useState } from "react";
import { Card } from "./ui/card";
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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type MetricType = "ram" | "cpu" | "storage" | "temperature" | "network";
type TimePeriod = "30min" | "6h" | "12h" | "24h";

interface Process {
  name: string;
  cpu: number;
  memory: number;
  pid: number;
}

interface AnalyticsCardProps {
  deviceName?: string;
  processes?: Process[];
}

// Mock data for different processes based on actual process data
const generateProcessData = (timePeriod: TimePeriod, processes: Process[], metricType: MetricType) => {
  const dataPointsMap = {
    "30min": 30,
    "6h": 36,
    "12h": 48,
    "24h": 48
  };
  
  const dataPoints = dataPointsMap[timePeriod];
  const data = [];

  for (let i = 0; i < dataPoints; i++) {
    const timeStr = `${String(Math.floor(i * (24 / dataPoints))).padStart(2, '0')}:${String((i * 5) % 60).padStart(2, '0')}`;

    const dataPoint: any = { time: timeStr };
    
    // Generate data for each process based on their current metrics
    processes.forEach(process => {
      const baseValue = metricType === 'cpu' ? process.cpu : process.memory;
      // Add some variation over time
      dataPoint[process.name] = Math.max(0, baseValue + Math.random() * 10 - 5 + Math.sin(i / 10) * 5);
    });

    data.push(dataPoint);
  }

  return data;
};

const metricOptions = [
  { value: "ram", label: "RAM Usage" },
  { value: "cpu", label: "CPU Usage" },
  { value: "storage", label: "Storage" },
  { value: "temperature", label: "Temperature" },
  { value: "network", label: "Network" },
];

const timePeriodOptions = [
  { value: "30min", label: "30 minutes" },
  { value: "6h", label: "6 hours" },
  { value: "12h", label: "12 hours" },
  { value: "24h", label: "24 hours" },
];

// Colors for different processes
const processColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export function AnalyticsCard({ deviceName = "Device 1", processes = [] }: AnalyticsCardProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("cpu");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("24h");

  // Use default processes if none provided
  const defaultProcesses = [
    { name: "node", cpu: 18.5, memory: 12.3, pid: 1234 },
    { name: "postgres", cpu: 12.2, memory: 8.7, pid: 5678 },
    { name: "nginx", cpu: 8.1, memory: 5.2, pid: 9012 },
    { name: "docker", cpu: 6.5, memory: 15.6, pid: 3456 },
    { name: "systemd", cpu: 4.2, memory: 3.1, pid: 1 },
  ];

  const activeProcesses = processes.length > 0 ? processes : defaultProcesses;
  const chartData = generateProcessData(timePeriod, activeProcesses, selectedMetric);

  const getMetricUnit = () => {
    switch (selectedMetric) {
      case "ram":
      case "cpu":
        return "%";
      case "storage":
        return "%";
      case "temperature":
        return "°C";
      case "network":
        return "Mbps";
      default:
        return "%";
    }
  };

  return (
    <Card className="p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-gray-900 mb-1">Analytics</h3>
          <p className="text-gray-600">Process performance metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timePeriod} onValueChange={(value: any) => setTimePeriod(value)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timePeriodOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedMetric} onValueChange={(value: any) => setSelectedMetric(value)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {metricOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="time" stroke="#6b7280" />
          <YAxis stroke="#6b7280" />
          <Tooltip />
          <Legend />
          {activeProcesses.map((process, index) => (
            <Line
              key={process.name}
              type="monotone"
              dataKey={process.name}
              stroke={processColors[index % processColors.length]}
              strokeWidth={2}
              dot={false}
              name={process.name}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
