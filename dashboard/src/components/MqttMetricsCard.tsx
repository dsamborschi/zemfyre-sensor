import { Card } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { useMemo } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface MqttMetricsCardProps {
  deviceId: string;
}

const randomInRange = (min: number, max: number) => 
  Math.floor(Math.random() * (max - min + 1)) + min;

const generateMockMetrics = (deviceId: string) => {
  // Generate time-series data for MQTT metrics
  const now = new Date();
  const messageRateHistory = [];
  const throughputHistory = [];
  const connectionHistory = [];

  for (let i = 29; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 2000);
    const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Message rate data (messages per second)
    messageRateHistory.push({
      time: timeStr,
      published: randomInRange(50, 200),
      received: randomInRange(40, 180),
    });

    // Throughput data (KB/s)
    throughputHistory.push({
      time: timeStr,
      inbound: randomInRange(10, 80),
      outbound: randomInRange(15, 90),
    });

    // Connection count
    connectionHistory.push({
      time: timeStr,
      clients: randomInRange(5, 20),
      subscriptions: randomInRange(15, 60),
    });
  }

  return {
    messageRateHistory,
    throughputHistory,
    connectionHistory,
  };
};

export function MqttMetricsCard({ deviceId }: MqttMetricsCardProps) {
  const metrics = useMemo(() => generateMockMetrics(deviceId), [deviceId]);

  // Calculate current stats (last value from each series)
  const currentStats = useMemo(() => {
    const lastMessageRate = metrics.messageRateHistory[metrics.messageRateHistory.length - 1];
    const lastThroughput = metrics.throughputHistory[metrics.throughputHistory.length - 1];
    const lastConnection = metrics.connectionHistory[metrics.connectionHistory.length - 1];

    return {
      messagesPerSec: lastMessageRate.published + lastMessageRate.received,
      throughputKBps: lastThroughput.inbound + lastThroughput.outbound,
      activeClients: lastConnection.clients,
      activeSubscriptions: lastConnection.subscriptions,
    };
  }, [metrics]);

  return (
    <Card className="p-4 md:p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
   
          <h3 className="text-gray-900 font-medium mb-1">MQTT Metrics</h3>
        </div>
        <p className="text-gray-600 text-sm">Real-time broker statistics and performance</p>
      </div>

      {/* Current Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="text-blue-600 text-sm font-medium mb-1">Messages/sec</div>
          <div className="text-2xl font-bold text-blue-900">{currentStats.messagesPerSec}</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3">
          <div className="text-green-600 text-sm font-medium mb-1">Throughput</div>
          <div className="text-2xl font-bold text-green-900">{currentStats.throughputKBps} KB/s</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-3">
          <div className="text-purple-600 text-sm font-medium mb-1">Clients</div>
          <div className="text-2xl font-bold text-purple-900">{currentStats.activeClients}</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-3">
          <div className="text-orange-600 text-sm font-medium mb-1">Subscriptions</div>
          <div className="text-2xl font-bold text-orange-900">{currentStats.activeSubscriptions}</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="space-y-6">
        {/* Message Rate Chart */}
        <div>
          <div className="mb-3">
            <h4 className="text-gray-900 text-sm font-medium mb-1">Message Rate</h4>
            <p className="text-gray-600 text-xs">Published and received messages per second</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={metrics.messageRateHistory}>
              <defs>
                <linearGradient id="colorPublished" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorReceived" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="time" 
                stroke="#6b7280" 
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Area
                type="monotone"
                dataKey="published"
                stackId="1"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPublished)"
              />
              <Area
                type="monotone"
                dataKey="received"
                stackId="1"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorReceived)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Throughput Chart */}
        <div>
          <div className="mb-3">
            <h4 className="text-gray-900 text-sm font-medium mb-1">Network Throughput</h4>
            <p className="text-gray-600 text-xs">Inbound and outbound data transfer (KB/s)</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={metrics.throughputHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="time" 
                stroke="#6b7280" 
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line
                type="monotone"
                dataKey="inbound"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="outbound"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Connections Chart */}
        <div>
          <div className="mb-3">
            <h4 className="text-gray-900 text-sm font-medium mb-1">Active Connections</h4>
            <p className="text-gray-600 text-xs">Connected clients and active subscriptions</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={metrics.connectionHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="time" 
                stroke="#6b7280" 
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line
                type="monotone"
                dataKey="clients"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="subscriptions"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
