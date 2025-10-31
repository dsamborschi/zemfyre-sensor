/**
 * MQTT Page - Shows MQTT broker status and metrics
 */

import { useState, useEffect, useMemo } from "react";
import { Users, MessageSquare, Zap, TrendingUp } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Device } from "./DeviceSidebar";
import { MqttBrokerCard } from "./MqttBrokerCard";
import { MqttMetricsCard } from "./MqttMetricsCard";
import { buildApiUrl } from "@/config/api";

interface MqttPageProps {
  device: Device;
}

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

export function MqttPage({ device }: MqttPageProps) {
  const [brokerStats, setBrokerStats] = useState<BrokerStats | null>(null);

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

  // Calculate current stats
  const currentStats = useMemo(() => {
    if (!brokerStats) {
      return {
        messagesPerSec: 0,
        throughputKBps: 0,
        activeClients: 0,
        activeSubscriptions: 0,
      };
    }

    return {
      messagesPerSec: Math.round((brokerStats.messageRatePublished || 0) + (brokerStats.messageRateReceived || 0)),
      throughputKBps: Math.round(((brokerStats.throughputInbound || 0) + (brokerStats.throughputOutbound || 0)) / 1024),
      activeClients: brokerStats.connectedClients || 0,
      activeSubscriptions: brokerStats.subscriptions || 0,
    };
  }, [brokerStats]);

  return (
    <div className="flex-1 bg-gray-50 overflow-auto">
      <div className="p-4 md:p-6 lg:p-8 space-y-6">

        {/* Page Title */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">MQTT Broker & Metrics</h2>
          <p className="text-sm text-gray-600">
            Monitor MQTT broker status, connections, and message flow
          </p>
        </div>

        {/* Metric Count Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-2 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Connected Clients</p>
                  <p className="text-3xl font-bold">{currentStats.activeClients}</p>
                </div>
                <div className="h-12 w-12 text-blue-600 dark:text-blue-400">
                  <Users className="h-full w-full" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Subscriptions</p>
                  <p className="text-3xl font-bold">{currentStats.activeSubscriptions}</p>
                </div>
                <div className="h-12 w-12 text-purple-600 dark:text-purple-400">
                  <MessageSquare className="h-full w-full" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Messages/sec</p>
                  <p className="text-3xl font-bold">{currentStats.messagesPerSec}</p>
                </div>
                <div className="h-12 w-12 text-green-600 dark:text-green-400">
                  <Zap className="h-full w-full" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Throughput</p>
                  <p className="text-3xl font-bold">{currentStats.throughputKBps} <span className="text-lg">KB/s</span></p>
                </div>
                <div className="h-12 w-12 text-orange-600 dark:text-orange-400">
                  <TrendingUp className="h-full w-full" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* MQTT Cards Side by Side */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* MQTT Broker Status Card */}
          <MqttBrokerCard deviceId={device.deviceUuid} />

          {/* MQTT Metrics Card */}
          <MqttMetricsCard />
        </div>
      </div>
    </div>
  );
}
