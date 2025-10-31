/**
 * MQTT Page - Shows MQTT broker status and metrics
 */

import { useState } from "react";
import { Activity } from "lucide-react";
import { Badge } from "./ui/badge";
import { Device } from "./DeviceSidebar";
import { MqttBrokerCard } from "./MqttBrokerCard";
import { MqttMetricsCard } from "./MqttMetricsCard";

interface MqttPageProps {
  device: Device;
}

export function MqttPage({ device }: MqttPageProps) {
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

        {/* MQTT Broker Status Card */}
        <MqttBrokerCard deviceUuid={device.deviceUuid} />

        {/* MQTT Metrics Card */}
        <MqttMetricsCard deviceUuid={device.deviceUuid} />
      </div>
    </div>
  );
}
