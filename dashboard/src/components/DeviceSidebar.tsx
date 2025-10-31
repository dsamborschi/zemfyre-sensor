import { useState } from "react";
import { Monitor, Smartphone, Server, Laptop, Search, Plus,Filter, Edit, X } from "lucide-react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { cn } from "./ui/utils";

export interface Device {
  id: string;
  deviceUuid: string;
  name: string;
  type: "desktop" | "laptop" | "mobile" | "server" | "gateway" | "edge-device" | "iot-hub" | "plc" | "controller" | "sensor-node" | "standalone";
  status: "online" | "offline" | "warning" | "pending";
  ipAddress: string;
  macAddress?: string;
  lastSeen: string;
  lastConnectivity?: string; // Store raw timestamp
  cpu: number;
  memory: number;
  disk: number;
}

interface DeviceSidebarProps {
  devices: Device[];
  selectedDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
  onAddDevice: () => void;
  onEditDevice: (device: Device) => void;
}

const deviceIcons = {
  desktop: Monitor,
  laptop: Laptop,
  mobile: Smartphone,
  server: Server,
  gateway: Server,
  "edge-device": Monitor,
  "iot-hub": Server,
  plc: Monitor,
  controller: Server,
  "sensor-node": Smartphone,
  standalone: Monitor,
};

const statusColors = {
  online: "bg-green-500",
  offline: "bg-gray-400",
  warning: "bg-yellow-500",
  pending: "bg-yellow-500",
};

const statusBadgeColors = {
  online: "bg-green-100 text-green-700 border-green-200",
  offline: "bg-gray-100 text-gray-700 border-gray-200",
  warning: "bg-yellow-100 text-yellow-700 border-yellow-200",
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
};

export function DeviceSidebar({ devices, selectedDeviceId, onAddDevice, onEditDevice , onSelectDevice }: DeviceSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>(["online", "offline", "warning", "pending"]);
  const [typeFilters, setTypeFilters] = useState<string[]>(["desktop", "laptop", "mobile", "server", "gateway", "edge-device", "iot-hub", "plc", "controller", "sensor-node", "standalone"]);

  const toggleStatusFilter = (status: string) => {
    setStatusFilters(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const toggleTypeFilter = (type: string) => {
    setTypeFilters(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const filteredDevices = devices.filter(device => {
    const matchesSearch = device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         device.ipAddress.includes(searchQuery);
    const matchesStatus = statusFilters.includes(device.status);
    const matchesType = typeFilters.includes(device.type);
    return matchesSearch && matchesStatus && matchesType;
  });

  const hasActiveFilters = statusFilters.length < 4 || typeFilters.length < 11 || searchQuery.length > 0;

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilters(["online", "offline", "warning", "pending"]);
    setTypeFilters(["desktop", "laptop", "mobile", "server", "gateway", "edge-device", "iot-hub", "plc", "controller", "sensor-node", "standalone"]);
  };

  return (
    <TooltipProvider>
      <div className="w-full lg:w-80 lg:border-r border-gray-200 bg-white h-full flex flex-col overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-gray-900 mb-1">Devices</h2>
            <p className="text-gray-600">
              {devices.filter(d => d.status === "online").length} of {devices.length} online
            </p>
          </div>
          <Button size="sm" onClick={onAddDevice}>
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="p-4 space-y-3 border-b border-gray-200 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="search"
            placeholder="Search devices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1">
                <Filter className="w-4 h-4 mr-2" />
                Filters
                {hasActiveFilters && (
                  <Badge className="ml-2 bg-blue-600">Active</Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={statusFilters.includes("online")}
                onCheckedChange={() => toggleStatusFilter("online")}
              >
                Online
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={statusFilters.includes("warning")}
                onCheckedChange={() => toggleStatusFilter("warning")}
              >
                Warning
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={statusFilters.includes("offline")}
                onCheckedChange={() => toggleStatusFilter("offline")}
              >
                Offline
              </DropdownMenuCheckboxItem>

              <DropdownMenuCheckboxItem
                checked={statusFilters.includes("pending")}
                onCheckedChange={() => toggleStatusFilter("pending")}
              >
                Pending
              </DropdownMenuCheckboxItem>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuLabel>Device Type</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={typeFilters.includes("server")}
                onCheckedChange={() => toggleTypeFilter("server")}
              >
                Server
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={typeFilters.includes("desktop")}
                onCheckedChange={() => toggleTypeFilter("desktop")}
              >
                Desktop
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={typeFilters.includes("laptop")}
                onCheckedChange={() => toggleTypeFilter("laptop")}
              >
                Laptop
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={typeFilters.includes("mobile")}
                onCheckedChange={() => toggleTypeFilter("mobile")}
              >
                Mobile
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={typeFilters.includes("gateway")}
                onCheckedChange={() => toggleTypeFilter("gateway")}
              >
                Gateway
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={typeFilters.includes("edge-device")}
                onCheckedChange={() => toggleTypeFilter("edge-device")}
              >
                Edge Device
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={typeFilters.includes("iot-hub")}
                onCheckedChange={() => toggleTypeFilter("iot-hub")}
              >
                IoT Hub
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={typeFilters.includes("plc")}
                onCheckedChange={() => toggleTypeFilter("plc")}
              >
                PLC
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={typeFilters.includes("controller")}
                onCheckedChange={() => toggleTypeFilter("controller")}
              >
                Controller
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={typeFilters.includes("sensor-node")}
                onCheckedChange={() => toggleTypeFilter("sensor-node")}
              >
                Sensor Node
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={typeFilters.includes("standalone")}
                onCheckedChange={() => toggleTypeFilter("standalone")}
              >
                Standalone
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        <p className="text-gray-600">
          Showing {filteredDevices.length} of {devices.length} devices
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {filteredDevices.map((device) => {
            const Icon = deviceIcons[device.type];
            const isSelected = device.id === selectedDeviceId;
            
            return (
              <Card
                key={device.id}
                className={cn(
                  "p-4 transition-all hover:shadow-md relative group",
                  isSelected ? "ring-2 ring-blue-500 shadow-md" : ""
                )}
              >
                <div 
                  className="flex items-start gap-3 cursor-pointer"
                  onClick={() => onSelectDevice(device.id)}
                >
                  <div className="relative">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Icon className="w-5 h-5 text-gray-700" />
                    </div>
                    <div
                      className={cn(
                        "absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white",
                        statusColors[device.status]
                      )}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <h3 className="text-gray-900 truncate">
                            {device.name.length > 15 
                              ? `${device.name.substring(0, 15)}...` 
                              : device.name}
                          </h3>
                        </TooltipTrigger>
                        {device.name.length > 15 && (
                          <TooltipContent>
                            <p>{device.name}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className={cn("text-xs", statusBadgeColors[device.status])}>
                        {device.status}
                      </Badge>
                      <span className="text-gray-500">{device.ipAddress}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-gray-600">
                        <span>CPU</span>
                        <span>{device.cpu}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all rounded-full",
                            device.cpu > 80 ? "bg-red-500" : device.cpu > 60 ? "bg-yellow-500" : "bg-blue-500"
                          )}
                          style={{ width: `${device.cpu}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-gray-500 mt-2">
                      Last seen: {device.lastSeen}
                    </div>
                  </div>
                </div>

                {/* Edit Button - appears on hover */}
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditDevice(device);
                  }}
                >
                  <Edit className="w-4 h-4" />
                </Button>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
