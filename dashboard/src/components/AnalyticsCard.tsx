import { useState } from "react";
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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Download } from "lucide-react";

type MetricType = "ram" | "cpu" | "storage" | "temperature" | "network";
type TimePeriod = "1" | "3" | "6" | "12" | "24";
type ViewMode = "relative" | "absolute";

interface AnalyticsCardProps {
  deviceName?: string;
}

// Mock data for different processes
const generateProcessData = (hours: number) => {
  const dataPoints = hours * 12; // 12 points per hour (every 5 minutes)
  const data = [];
  const now = new Date();

  for (let i = dataPoints; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 5 * 60 * 1000);
    const timeStr = time.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

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
  { value: "ram", label: "RAM" },
  { value: "cpu", label: "CPU" },
  { value: "storage", label: "Storage" },
  { value: "temperature", label: "Temperature" },
  { value: "network", label: "Network" },
];

const timePeriodOptions = [
  { value: "1", label: "1" },
  { value: "3", label: "3" },
  { value: "6", label: "6" },
  { value: "12", label: "12" },
  { value: "24", label: "24" },
];

const exportOptions = [
  { value: "png", label: "PNG" },
  { value: "jpg", label: "JPG" },
  { value: "svg", label: "SVG" },
  { value: "pdf", label: "PDF" },
];

export function AnalyticsCard({ deviceName = "Device 1" }: AnalyticsCardProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("ram");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("24");
  const [viewMode, setViewMode] = useState<ViewMode>("relative");
  const [exportFormat, setExportFormat] = useState("png");

  const chartData = generateProcessData(parseInt(timePeriod));

  console.log("AnalyticsCard chartData:", chartData.length, "points", chartData.slice(0, 2));

  const handleExport = () => {
    console.log(`Exporting chart as ${exportFormat}`);
    // Add export logic here
  };

  const getMetricUnit = () => {
    switch (selectedMetric) {
      case "ram":
        return viewMode === "relative" ? "%" : "GB";
      case "cpu":
        return "%";
      case "storage":
        return viewMode === "relative" ? "%" : "GB";
      case "temperature":
        return "°C";
      case "network":
        return "Mbps";
      default:
        return "%";
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Analytics</h2>
        </div>

        {/* Controls Row 1: Metric and Time Period */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase">
              Select Metric
            </label>
            <Select value={selectedMetric} onValueChange={(value) => setSelectedMetric(value as MetricType)}>
              <SelectTrigger className="w-full">
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

          <div className="flex items-end gap-2">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase">
                Select
              </label>
              <Select value={timePeriod} onValueChange={(value) => setTimePeriod(value as TimePeriod)}>
                <SelectTrigger className="w-[80px]">
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
            </div>
            <div className="h-9 flex items-center text-sm text-gray-700">Hours</div>
          </div>
        </div>

        {/* Controls Row 2: View Mode Toggle */}
        <div className="flex items-center gap-2  pb-4">
          <Button
            variant={viewMode === "relative" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("relative")}
            className="text-xs"
          >
            Relative
          </Button>
          <Button
            variant={viewMode === "absolute" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("absolute")}
            className="text-xs"
          >
            Absolute
          </Button>
        </div>

        {/* Chart */}
        <div className="w-full bg-white rounded-lg p-4 border border-gray-200">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} isAnimationActive={false} />
              <XAxis
                dataKey="time"
                stroke="#6b7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#6b7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                label={{
                  value: getMetricUnit(),
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 12, fill: "#6b7280" },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number) => `${value.toFixed(1)}${getMetricUnit()}`}
              />
              <Legend
                wrapperStyle={{ fontSize: "12px", paddingTop: "20px" }}
                iconType="circle"
              />
              <Line
                type="monotone"
                dataKey="general"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                name="General"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="influxdb"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                name="InfluxDB"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="nodered"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                name="Node-RED"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="grafana"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                name="Grafana"
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </div>

      
      </div>
    </Card>
  );
}
