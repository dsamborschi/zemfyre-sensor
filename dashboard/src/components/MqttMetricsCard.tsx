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
import { buildApiUrl } from "@/config/api";

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
  deviceId: string;
}

export function MqttMetricsCard() {
  const [brokerStats, setBrokerStats] = useState<BrokerStats | null>(null);
  const [messageRateHistory, setMessageRateHistory] = useState<Array<{time: string; published: number; received: number}>>([]);
  const [throughputHistory, setThroughputHistory] = useState<Array<{time: string; inbound: number; outbound: number}>>([]);
  const [connectionHistory, setConnectionHistory] = useState<Array<{time: string; clients: number; subscriptions: number}>>([]);

  // Fetch broker stats from API
  useEffect(() => {
    const fetchBrokerStats = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/v1/mqtt-monitor/stats'));
        if (response.ok) {
          const data = await response.json();
          if (data.stats) {
            // Map the API response to our BrokerStats interface
            const mappedStats: BrokerStats = {
              connectedClients: parseInt(data.stats.broker?.clients?.connected || '0'),
              disconnectedClients: parseInt(data.stats.broker?.clients?.disconnected || '0'),
              totalClients: parseInt(data.stats.broker?.clients?.total || '0'),
              subscriptions: parseInt(data.stats.broker?.subscriptions?.count || '0'),
              retainedMessages: parseInt(data.stats.broker?.['retained messages']?.count || '0'),
              messagesSent: parseInt(data.stats.broker?.messages?.sent || '0'),
              messagesReceived: parseInt(data.stats.broker?.messages?.received || '0'),
              messagesPublished: parseInt(data.stats.broker?.publish?.messages?.sent || '0'),
              messagesDropped: parseInt(data.stats.broker?.publish?.messages?.dropped || '0'),
              bytesSent: parseInt(data.stats.broker?.bytes?.sent || '0'),
              bytesReceived: parseInt(data.stats.broker?.bytes?.received || '0'),
              messageRatePublished: parseFloat(data.stats.broker?.load?.publish?.sent?.['1min'] || '0'),
              messageRateReceived: parseFloat(data.stats.broker?.load?.publish?.received?.['1min'] || '0'),
              throughputInbound: parseFloat(data.stats.broker?.load?.bytes?.received?.['1min'] || '0'),
              throughputOutbound: parseFloat(data.stats.broker?.load?.bytes?.sent?.['1min'] || '0'),
            };
            
            setBrokerStats(mappedStats);
            
            // Update history with new data point
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            setMessageRateHistory(prev => {
              const newEntry = {
                time: timeStr,
                published: Math.round(mappedStats.messageRatePublished),
                received: Math.round(mappedStats.messageRateReceived),
              };
              const updated = [...prev, newEntry];
              return updated.slice(-30); // Keep last 30 data points
            });
            
            setThroughputHistory(prev => {
              const newEntry = {
                time: timeStr,
                inbound: Math.round(mappedStats.throughputInbound / 1024), // Convert to KB/s
                outbound: Math.round(mappedStats.throughputOutbound / 1024),
              };
              const updated = [...prev, newEntry];
              return updated.slice(-30);
            });
            
            setConnectionHistory(prev => {
              const newEntry = {
                time: timeStr,
                clients: mappedStats.connectedClients,
                subscriptions: mappedStats.subscriptions,
              };
              const updated = [...prev, newEntry];
              return updated.slice(-30);
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch broker stats:', error);
      }
    };

    fetchBrokerStats();
    const interval = setInterval(fetchBrokerStats, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="p-4 md:p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
   
          <h3 className="text-lg text-gray-900 font-medium mb-1">MQTT Metrics</h3>
        </div>
        <p className="text-gray-600 text-sm">Real-time broker statistics and performance</p>
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
            <h4 className="text-gray-900 text-sm font-medium mb-1">Network Throughput</h4>
            <p className="text-gray-600 text-xs">Inbound and outbound data transfer (KB/s)</p>
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
            <h4 className="text-gray-900 text-sm font-medium mb-1">Active Connections</h4>
            <p className="text-gray-600 text-xs">Connected clients and active subscriptions</p>
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
