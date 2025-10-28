import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Wifi, Network, Smartphone } from "lucide-react";

export interface NetworkInterface {
  id: string;
  type: "wifi" | "ethernet" | "mobile" | "wired";
  ipAddress: string;
  status: "connected" | "disconnected";
  signal?: number; // For wifi/mobile
  speed?: string; // e.g., "1000 Mbps" for ethernet
}

interface NetworkingCardProps {
  interfaces: NetworkInterface[];
}

const interfaceIcons = {
  wifi: Wifi,
  ethernet: Network,
  mobile: Smartphone,
  wired: Network,
};

const statusColors = {
  connected: "bg-green-100 text-green-700 border-green-200",
  disconnected: "bg-gray-100 text-gray-700 border-gray-200",
};

export function NetworkingCard({ interfaces }: NetworkingCardProps) {
  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-gray-900 mb-1">Network Interfaces</h3>
          <p className="text-gray-600">Active network connections</p>
        </div>
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
          {interfaces.filter(i => i.status === "connected").length} Active
        </Badge>
      </div>

      {interfaces.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No network interfaces detected</p>
        </div>
      ) : (
        <div className="space-y-3">
          {interfaces.map((iface) => {
            const Icon = interfaceIcons[iface.type];
            return (
              <div
                key={iface.id}
                className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    iface.status === "connected" 
                      ? "bg-green-100 text-green-700" 
                      : "bg-gray-100 text-gray-400"
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">{iface.ipAddress}</span>
                      <Badge variant="outline" className={`text-xs ${statusColors[iface.status]}`}>
                        {iface.status}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="capitalize">{iface.type}</span>
                      
                      {iface.type === "wifi" && iface.signal !== undefined && (
                        <>
                          <span>•</span>
                          <span>Signal: {iface.signal}%</span>
                        </>
                      )}
                      
                      {iface.type === "mobile" && iface.signal !== undefined && (
                        <>
                          <span>•</span>
                          <span>Signal: {iface.signal}%</span>
                        </>
                      )}
                      
                      {iface.type === "ethernet" && iface.speed && (
                        <>
                          <span>•</span>
                          <span>{iface.speed}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
