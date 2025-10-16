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

interface AnalyticsCardProps {
  deviceName?: string;
}

// Mock data for different processes
const generateProcessData = (timePeriod: TimePeriod) => {
  const dataPointsMap = {
    "30min": 30,
    "6h": 36,
    "12h": 48,
    "24h": 48
  };
  
  const dataPoints = dataPointsMap[timePeriod];
  const data = [];

  for (let i = 0; i < dataPoints; i++) {
    const timeStr = `${String(i).padStart(2, '0')}:${String((i * 5) % 60).padStart(2, '0')}`;

    data.push({
      time: timeStr,
      general: 20 + Math.random() * 15 + Math.sin(i / 10) * 10,
      influxdb: 35 + Math.random() * 20 + Math.cos(i / 8) * 15,
      nodered: 15 + Math.random() * 10 + Math.sin(i / 12) * 8,
      grafana: 25 + Math.random() * 12 + Math.cos(i / 15) * 10,
    });
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

export function AnalyticsCard({ deviceName = "Device 1" }: AnalyticsCardProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("ram");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("24h");

  const chartData = generateProcessData(timePeriod);

  const getMetricUnit = () => {
    switch (selectedMetric) {
      case "ram":
        return "%";
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
          <Line
            type="monotone"
            dataKey="general"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name="General"
          />
          <Line
            type="monotone"
            dataKey="influxdb"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            name="InfluxDB"
          />
          <Line
            type="monotone"
            dataKey="nodered"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            name="Node-RED"
          />
          <Line
            type="monotone"
            dataKey="grafana"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
            name="Grafana"
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
