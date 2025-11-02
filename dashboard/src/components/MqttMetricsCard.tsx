import { Card } from "@/components/ui/card";
import { useState, useEffect } from "react";
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

interface BrokerStats {
  connectedClients: number;
  disconnectedClients: number;
  totalClients: number;
  subscriptions: number;
  retainedMessages: number;
  messagesSent: number;
  messagesReceived: number;
  messagesPublished: number;
  messagesDropped: number;
  bytesSent: number;
  bytesReceived: number;
  messageRatePublished: number;
  messageRateReceived: number;
  throughputInbound: number;
  throughputOutbound: number;
}

interface MqttMetricsCardProps {
  brokerStats: BrokerStats | null;
}

export function MqttMetricsCard({ brokerStats }: MqttMetricsCardProps) {
  const [messageRateHistory, setMessageRateHistory] = useState<Array<{time: string; published: number; received: number}>>([]);
  const [throughputHistory, setThroughputHistory] = useState<Array<{time: string; inbound: number; outbound: number}>>([]);
  const [connectionHistory, setConnectionHistory] = useState<Array<{time: string; clients: number; subscriptions: number}>>([]);

  // Update history when brokerStats changes (pushed via WebSocket)
  useEffect(() => {
    if (!brokerStats) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    setMessageRateHistory(prev => {
      const newEntry = {
        time: timeStr,
        published: Math.round(brokerStats.messageRatePublished),
        received: Math.round(brokerStats.messageRateReceived),
      };
      const updated = [...prev, newEntry];
      return updated.slice(-30); // Keep last 30 data points
    });
    
    setThroughputHistory(prev => {
      const newEntry = {
        time: timeStr,
        inbound: Math.round(brokerStats.throughputInbound / 1024), // Convert to KB/s
        outbound: Math.round(brokerStats.throughputOutbound / 1024),
      };
      const updated = [...prev, newEntry];
      return updated.slice(-30);
    });
    
    setConnectionHistory(prev => {
      const newEntry = {
        time: timeStr,
        clients: brokerStats.connectedClients,
        subscriptions: brokerStats.subscriptions,
      };
      const updated = [...prev, newEntry];
      return updated.slice(-30);
    });
  }, [brokerStats]);

  return (
    <Card className="p-4 md:p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
   
          <h3 className="text-lg text-foreground font-medium mb-1">MQTT Metrics</h3>
        </div>
        <p className="text-muted-foreground text-sm">Real-time broker statistics and performance</p>
      </div>

      {/* Charts Grid */}
      <div className="space-y-6">
        {/* Message Rate Chart */}
        <div>
          <div className="mb-3">
            <h4 className="text-foreground text-sm font-medium mb-1">Message Rate</h4>
            <p className="text-muted-foreground text-xs">Published and received messages per second</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={messageRateHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
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
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} width={40} />
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
            <h4 className="text-foreground text-sm font-medium mb-1">Network Throughput</h4>
            <p className="text-muted-foreground text-xs">Inbound and outbound data transfer (KB/s)</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={throughputHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="time" 
                stroke="#6b7280" 
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} width={40} />
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
            <h4 className="text-foreground text-sm font-medium mb-1">Active Connections</h4>
            <p className="text-muted-foreground text-xs">Connected clients and active subscriptions</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={connectionHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="time" 
                stroke="#6b7280" 
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} width={40} />
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
