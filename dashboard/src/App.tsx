import { useState, useEffect } from "react";
import { DeviceSidebar, Device } from "./components/DeviceSidebar";
import { AddEditDeviceDialog } from "./components/AddEditDeviceDialog";
import { SystemMetrics } from "./components/SystemMetrics";
import { Application } from "./components/ApplicationsCard";
import { Toaster } from "./components/ui/sonner";
import { Sheet, SheetContent } from "./components/ui/sheet";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Menu } from "lucide-react";

import { toast } from "sonner";
import { Header } from "./components/Header";

const mockDevices: Device[] = [
  {
    id: "1",
    deviceUuid: "a3f8c9d2-4e1b-4a9f-b7d3-c2e8f5a1b6d4",
    name: "Assembly Line Gateway",
    type: "gateway",
    status: "online",
    ipAddress: "192.168.1.10",
    lastSeen: "Just now",
    cpu: 68,
    memory: 72,
    disk: 45,
  },
  {
    id: "2",
    deviceUuid: "b8e4d1c3-9f2a-4d6e-a5c7-d9f3e8b2a7c1",
    name: "Quality Control Station",
    type: "edge-device",
    status: "online",
    ipAddress: "192.168.1.11",
    lastSeen: "2 mins ago",
    cpu: 45,
    memory: 85,
    disk: 62,
  },
  {
    id: "3",
    deviceUuid: "c5d9f2e4-3a7b-4c8e-d1f6-e8a3c9b5d7f2",
    name: "Warehouse Sensor Hub",
    type: "iot-hub",
    status: "online",
    ipAddress: "192.168.1.25",
    lastSeen: "5 mins ago",
    cpu: 32,
    memory: 58,
    disk: 38,
  },
  {
    id: "4",
    deviceUuid: "d6e2a8f4-5c9b-4d7e-a3f8-e1c4b9d6a2f5",
    name: "Conveyor Belt Monitor",
    type: "plc",
    status: "warning",
    ipAddress: "192.168.1.12",
    lastSeen: "10 mins ago",
    cpu: 88,
    memory: 92,
    disk: 78,
  },
  {
    id: "5",
    deviceUuid: "e7f3b9c5-6d1a-4e8f-b2c9-f4d7a3e8b1c6",
    name: "HVAC Control Unit",
    type: "controller",
    status: "online",
    ipAddress: "192.168.1.30",
    lastSeen: "15 mins ago",
    cpu: 25,
    memory: 48,
    disk: 55,
  },
  {
    id: "6",
    deviceUuid: "f8a4c1d6-7e2b-4f9a-c3d8-a5e9b2f7c4d1",
    name: "Environmental Sensor Node",
    type: "sensor-node",
    status: "online",
    ipAddress: "192.168.1.45",
    lastSeen: "1 min ago",
    cpu: 18,
    memory: 35,
    disk: 68,
  },
  {
    id: "7",
    deviceUuid: "a1b5d2e7-8f3c-4a1b-d4e9-b6f1c5a8d3e2",
    name: "Packaging Line Gateway",
    type: "gateway",
    status: "offline",
    ipAddress: "192.168.1.50",
    lastSeen: "2 hours ago",
    cpu: 0,
    memory: 0,
    disk: 42,
  },
  {
    id: "8",
    deviceUuid: "b2c6e3f8-9a4d-4b2c-e5f1-c7a2d6b9e4f3",
    name: "Cold Storage Monitor",
    type: "edge-device",
    status: "online",
    ipAddress: "192.168.1.13",
    lastSeen: "Just now",
    cpu: 15,
    memory: 28,
    disk: 88,
  },
];

// Helper function to generate random variation
const randomVariation = (base: number, range: number = 5) => {
  const variation = (Math.random() - 0.5) * range * 2;
  return Math.max(0, Math.min(100, base + variation));
};

// Helper function to generate time labels
const generateTimeLabel = (offset: number) => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - offset * 5);
  return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
};

// Mock network interfaces for each device
const mockNetworkInterfaces: Record<string, any[]> = {
  "1": [
    {
      id: "eth0",
      type: "ethernet",
      ipAddress: "192.168.1.10",
      status: "connected",
      speed: "1000 Mbps",
    },
    {
      id: "wlan0",
      type: "wifi",
      ipAddress: "192.168.1.55",
      status: "connected",
      signal: 85,
    },
  ],
  "2": [
    {
      id: "eth0",
      type: "ethernet",
      ipAddress: "192.168.1.11",
      status: "connected",
      speed: "1000 Mbps",
    },
  ],
  "3": [
    {
      id: "wlan0",
      type: "wifi",
      ipAddress: "192.168.1.25",
      status: "connected",
      signal: 92,
    },
  ],
  "4": [
    {
      id: "eth0",
      type: "ethernet",
      ipAddress: "192.168.1.12",
      status: "connected",
      speed: "1000 Mbps",
    },
    {
      id: "wlan0",
      type: "wifi",
      ipAddress: "192.168.1.60",
      status: "disconnected",
      signal: 0,
    },
  ],
  "5": [
    {
      id: "wlan0",
      type: "wifi",
      ipAddress: "192.168.1.30",
      status: "connected",
      signal: 78,
    },
  ],
  "6": [
    {
      id: "wwan0",
      type: "mobile",
      ipAddress: "10.45.12.89",
      status: "connected",
      signal: 72,
    },
    {
      id: "wlan0",
      type: "wifi",
      ipAddress: "192.168.1.45",
      status: "connected",
      signal: 88,
    },
  ],
  "7": [
    {
      id: "eth0",
      type: "ethernet",
      ipAddress: "192.168.1.50",
      status: "disconnected",
      speed: "100 Mbps",
    },
  ],
  "8": [
    {
      id: "eth0",
      type: "ethernet",
      ipAddress: "192.168.1.13",
      status: "connected",
      speed: "10 Gbps",
    },
    {
      id: "eth1",
      type: "ethernet",
      ipAddress: "10.0.0.5",
      status: "connected",
      speed: "10 Gbps",
    },
  ],
  "9": [
    {
      id: "wwan0",
      type: "mobile",
      ipAddress: "10.45.13.102",
      status: "connected",
      signal: 68,
    },
    {
      id: "wlan0",
      type: "wifi",
      ipAddress: "192.168.1.46",
      status: "connected",
      signal: 95,
    },
  ],
  "10": [
    {
      id: "eth0",
      type: "ethernet",
      ipAddress: "192.168.1.14",
      status: "connected",
      speed: "1000 Mbps",
    },
  ],
};

// Initial mock applications for each device
const initialApplications: Record<string, Application[]> = {
  "1": [
    {
      id: "app-1",
      appId: 1001,
      appName: "predictive-maintenance",
      name: "predictive-maintenance",
      image: "iotistic/maintenance-ai:latest",
      status: "running",
      syncStatus: "synced",
      port: "8080",
      uptime: "5d 12h",
      services: [
        {
          serviceId: 1,
          serviceName: "ml-predictor",
          imageName: "iotistic/maintenance-ai:latest",
          appId: 1001,
          appName: "predictive-maintenance",
          config: {
            image: "iotistic/maintenance-ai:latest",
            ports: ["8080:8080", "8443:443"],
            environment: {
              ENV: "production",
              MODEL_VERSION: "v2.3.1",
              ALERT_THRESHOLD: "0.85",
            },
            volumes: ["ml-models:/app/models", "training-data:/app/data"],
          },
          status: "running",
          uptime: "5d 12h",
        },
      ],
    },
    {
      id: "app-2",
      appId: 1002,
      appName: "asset-monitoring",
      name: "asset-monitoring",
      image: "timescaledb/timescaledb:latest",
      status: "running",
      syncStatus: "synced",
      port: "5432",
      uptime: "5d 12h",
      services: [
        {
          serviceId: 1,
          serviceName: "timeseries-db",
          imageName: "timescaledb/timescaledb:latest-pg14",
          appId: 1002,
          appName: "asset-monitoring",
          config: {
            image: "timescaledb/timescaledb:latest-pg14",
            ports: ["5432:5432"],
            environment: {
              POSTGRES_PASSWORD: "***",
              POSTGRES_DB: "asset_metrics",
              POSTGRES_USER: "iot_admin",
            },
            volumes: ["timeseries-data:/var/lib/postgresql/data"],
          },
          status: "running",
          uptime: "5d 12h",
        },
      ],
    },
    {
      id: "app-3",
      appId: 1003,
      appName: "quality-control",
      name: "quality-control",
      image: "iotistic/qc-inspector:alpine",
      status: "running",
      syncStatus: "syncing",
      port: "9090",
      uptime: "2d 4h",
      services: [
        {
          serviceId: 1,
          serviceName: "vision-inspector",
          imageName: "iotistic/qc-inspector:v1.2-alpine",
          appId: 1003,
          appName: "quality-control",
          config: {
            image: "iotistic/qc-inspector:v1.2-alpine",
            ports: ["9090:9090"],
            environment: {
              CAMERA_DEVICE: "/dev/video0",
              DEFECT_THRESHOLD: "0.92",
            },
          },
          status: "running",
          uptime: "2d 4h",
        },
      ],
    },
  ],
  "2": [
    {
      id: "app-4",
      appId: 2001,
      appName: "energy-management",
      name: "energy-management",
      image: "iotistic/energy-optimizer:latest",
      status: "running",
      syncStatus: "synced",
      port: "8085",
      uptime: "8d 3h",
      services: [
        {
          serviceId: 1,
          serviceName: "power-analyzer",
          imageName: "iotistic/energy-optimizer:v3.1",
          appId: 2001,
          appName: "energy-management",
          config: {
            image: "iotistic/energy-optimizer:v3.1",
            ports: ["8085:8085"],
            environment: {
              GRID_MONITOR: "enabled",
              COST_OPTIMIZATION: "true",
            },
            volumes: ["energy-logs:/data/logs", "power-profiles:/config"],
          },
          status: "running",
          uptime: "8d 3h",
        },
      ],
    },
    {
      id: "app-5",
      appId: 2002,
      appName: "process-automation",
      name: "process-automation",
      image: "nodered/node-red:latest",
      status: "running",
      syncStatus: "error",
      port: "1880",
      uptime: "1d 2h",
      services: [
        {
          serviceId: 1,
          serviceName: "workflow-engine",
          imageName: "nodered/node-red:3.1",
          appId: 2002,
          appName: "process-automation",
          config: {
            image: "nodered/node-red:3.1",
            ports: ["1880:1880"],
            environment: {
              NODE_ENV: "production",
              TZ: "UTC",
              FLOWS: "production_flows.json",
            },
          },
          status: "running",
          uptime: "1d 2h",
        },
      ],
    },
  ],
  "3": [
    {
      id: "app-6",
      appId: 3001,
      appName: "environmental-monitoring",
      name: "environmental-monitoring",
      image: "iotistic/env-sensor-hub:latest",
      status: "running",
      syncStatus: "synced",
      port: "8086",
      uptime: "4h 20m",
      services: [
        {
          serviceId: 1,
          serviceName: "sensor-collector",
          imageName: "iotistic/env-sensor-hub:v2.0",
          appId: 3001,
          appName: "environmental-monitoring",
          config: {
            image: "iotistic/env-sensor-hub:v2.0",
            ports: ["8086:8086"],
            environment: {
              SENSOR_INTERVAL: "5000",
              DATA_RETENTION: "30d",
            },
          },
          status: "running",
          uptime: "4h 20m",
        },
      ],
    },
  ],
  "4": [
    {
      id: "app-7",
      appId: 4001,
      appName: "safety-compliance",
      name: "safety-compliance",
      image: "iotistic/safety-monitor:latest",
      status: "stopped",
      syncStatus: "pending",
      uptime: "0m",
      services: [
        {
          serviceId: 1,
          serviceName: "compliance-checker",
          imageName: "iotistic/safety-monitor:v1.5",
          appId: 4001,
          appName: "safety-compliance",
          config: {
            image: "iotistic/safety-monitor:v1.5",
            environment: {
              ALERT_CHANNELS: "email,sms",
              SAFETY_STANDARDS: "OSHA,ISO45001",
            },
          },
          status: "stopped",
          uptime: "0m",
        },
      ],
    },
  ],
  "10": [
    {
      id: "app-8",
      appId: 10001,
      appName: "production-dashboard",
      name: "production-dashboard",
      image: "grafana/grafana:latest",
      status: "running",
      syncStatus: "synced",
      port: "3000",
      uptime: "3d 8h",
      services: [
        {
          serviceId: 1,
          serviceName: "metrics-viz",
          imageName: "grafana/grafana:10.2-alpine",
          appId: 10001,
          appName: "production-dashboard",
          config: {
            image: "grafana/grafana:10.2-alpine",
            ports: ["3000:3000"],
            environment: {
              GF_SECURITY_ADMIN_PASSWORD: "***",
              GF_INSTALL_PLUGINS: "industrial-metrics",
            },
          },
          status: "running",
          uptime: "3d 8h",
        },
      ],
    },
    {
      id: "app-9",
      appId: 10002,
      appName: "supply-chain-tracking",
      name: "supply-chain-tracking",
      image: "iotistic/logistics-tracker:latest",
      status: "running",
      syncStatus: "synced",
      port: "8088",
      uptime: "3d 8h",
      services: [
        {
          serviceId: 1,
          serviceName: "inventory-manager",
          imageName: "iotistic/logistics-tracker:v2.4",
          appId: 10002,
          appName: "supply-chain-tracking",
          config: {
            image: "iotistic/logistics-tracker:v2.4",
            ports: ["8088:8088", "8089:8089"],
            environment: {
              RFID_READER: "enabled",
              BARCODE_SCANNER: "enabled",
              WAREHOUSE_MODE: "real-time",
            },
            labels: {
              "tracking.enabled": "true",
            },
          },
          status: "running",
          uptime: "3d 8h",
        },
      ],
    },
  ],
};

export default function App() {
  const [selectedDeviceId, setSelectedDeviceId] = useState(mockDevices[0].id);
  const [devices, setDevices] = useState(mockDevices);
  const [cpuHistory, setCpuHistory] = useState<Array<{ time: string; value: number }>>([]);
  const [memoryHistory, setMemoryHistory] = useState<Array<{ time: string; used: number; available: number }>>([]);
  const [networkHistory, setNetworkHistory] = useState<Array<{ time: string; download: number; upload: number }>>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [applications, setApplications] = useState<Record<string, Application[]>>(initialApplications);
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) || devices[0];
  const deviceApplications = applications[selectedDeviceId] || [];


    const handleAddDevice = () => {
    setEditingDevice(null);
    setDeviceDialogOpen(true);
  };

  const handleEditDevice = (device: Device) => {
    setEditingDevice(device);
    setDeviceDialogOpen(true);
  };

  const handleSaveDevice = (deviceData: Omit<Device, "id"> & { id?: string }) => {
    if (deviceData.id) {
      // Edit existing device
      setDevices(prev =>
        prev.map(d => (d.id === deviceData.id ? { ...d, ...deviceData } : d))
      );
    } else {
      // Add new device
      const newDevice: Device = {
        id: `${devices.length + 1}`,
        ...deviceData,
      };
      setDevices(prev => [...prev, newDevice]);
      setSelectedDeviceId(newDevice.id);
    }
  };

  const handleSelectDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setSidebarOpen(false); // Close sidebar on mobile after selection
  };

  const handleAddApplication = (app: Omit<Application, "id">) => {
    const newApp: Application = {
      ...app,
      id: `app-${Date.now()}`,
      // Ensure services array exists
      services: app.services || [],
    };
    setApplications(prev => ({
      ...prev,
      [selectedDeviceId]: [...(prev[selectedDeviceId] || []), newApp],
    }));
  };

  const handleUpdateApplication = (updatedApp: Application) => {
    setApplications(prev => ({
      ...prev,
      [selectedDeviceId]: (prev[selectedDeviceId] || []).map(app =>
        app.id === updatedApp.id ? updatedApp : app
      ),
    }));
  };

  const handleRemoveApplication = (appId: string) => {
    setApplications(prev => ({
      ...prev,
      [selectedDeviceId]: (prev[selectedDeviceId] || []).filter(app => app.id !== appId),
    }));
  };

  const handleToggleAppStatus = (appId: string) => {
    setApplications(prev => ({
      ...prev,
      [selectedDeviceId]: (prev[selectedDeviceId] || []).map(app =>
        app.id === appId
          ? {
              ...app,
              status: app.status === "running" ? "stopped" : "running",
              uptime: app.status === "running" ? "0m" : app.uptime,
            }
          : app
      ),
    }));
  };

  const handleToggleServiceStatus = (appId: string, serviceId: number, action: "start" | "stop") => {
    setApplications(prev => ({
      ...prev,
      [selectedDeviceId]: (prev[selectedDeviceId] || []).map(app => {
        if (app.id !== appId) return app;
        
        return {
          ...app,
          services: app.services?.map(service => {
            if (service.serviceId !== serviceId) return service;
            
            // Set status to syncing first, then change after a delay
            if (action === "start") {
              // Start service
              setTimeout(() => {
                setApplications(prevApps => ({
                  ...prevApps,
                  [selectedDeviceId]: (prevApps[selectedDeviceId] || []).map(a => {
                    if (a.id !== appId) return a;
                    return {
                      ...a,
                      services: a.services?.map(s => 
                        s.serviceId === serviceId ? { ...s, status: "running" } : s
                      ),
                    };
                  }),
                }));
              }, 1500); // Simulate 1.5s delay
              
              return { ...service, status: "syncing" };
            } else {
              // Stop service
              setTimeout(() => {
                setApplications(prevApps => ({
                  ...prevApps,
                  [selectedDeviceId]: (prevApps[selectedDeviceId] || []).map(a => {
                    if (a.id !== appId) return a;
                    return {
                      ...a,
                      services: a.services?.map(s => 
                        s.serviceId === serviceId ? { ...s, status: "stopped" } : s
                      ),
                    };
                  }),
                }));
              }, 1500); // Simulate 1.5s delay
              
              return { ...service, status: "syncing" };
            }
          }),
        };
      }),
    }));
  };

  // Initialize history data
  useEffect(() => {
    const initialCpuHistory = Array.from({ length: 10 }, (_, i) => ({
      time: generateTimeLabel(9 - i),
      value: randomVariation(selectedDevice.cpu, 10),
    }));
    setCpuHistory(initialCpuHistory);

    const initialMemoryHistory = Array.from({ length: 10 }, (_, i) => {
      const used = randomVariation(selectedDevice.memory * 0.16, 1);
      return {
        time: generateTimeLabel(9 - i),
        used,
        available: 16 - used,
      };
    });
    setMemoryHistory(initialMemoryHistory);

    const initialNetworkHistory = Array.from({ length: 10 }, (_, i) => ({
      time: generateTimeLabel(9 - i),
      download: Math.random() * 30 + 10,
      upload: Math.random() * 15 + 3,
    }));
    setNetworkHistory(initialNetworkHistory);
  }, [selectedDeviceId]);

  // Simulate real-time data updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Update device metrics
      setDevices(prevDevices =>
        prevDevices.map(device => {
          // Don't update offline devices
          if (device.status === "offline") return device;

          const newCpu = randomVariation(device.cpu, 3);
          const newMemory = randomVariation(device.memory, 2);
          
          // Update status based on metrics
          let newStatus: "online" | "offline" | "warning" = "online";
          if (newCpu > 85 || newMemory > 90) {
            newStatus = "warning";
          }

          return {
            ...device,
            cpu: Math.round(newCpu),
            memory: Math.round(newMemory),
            status: newStatus,
            lastSeen: device.id === selectedDeviceId ? "Just now" : device.lastSeen,
          };
        })
      );

      // Update chart history for selected device
      const currentDevice = devices.find(d => d.id === selectedDeviceId);
      if (currentDevice && currentDevice.status !== "offline") {
        // Update CPU history
        setCpuHistory(prev => {
          const newValue = randomVariation(currentDevice.cpu, 5);
          const newEntry = { time: generateTimeLabel(0), value: newValue };
          return [...prev.slice(1), newEntry];
        });

        // Update memory history
        setMemoryHistory(prev => {
          const used = randomVariation(currentDevice.memory * 0.16, 0.5);
          const newEntry = {
            time: generateTimeLabel(0),
            used,
            available: 16 - used,
          };
          return [...prev.slice(1), newEntry];
        });

        // Update network history
        setNetworkHistory(prev => {
          const newEntry = {
            time: generateTimeLabel(0),
            download: Math.random() * 30 + 10,
            upload: Math.random() * 15 + 3,
          };
          return [...prev.slice(1), newEntry];
        });
      }
    }, 3000); // Update every 3 seconds

    return () => clearInterval(interval);
  }, [selectedDeviceId, devices]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header*/}
     <Header />

      <div className="flex flex-1 overflow-hidden">
                {/* Desktop Sidebar - Hidden on mobile, positioned on right */}
        <div className="hidden lg:block">
          <DeviceSidebar
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={handleSelectDevice}
            onAddDevice={handleAddDevice}
            onEditDevice={handleEditDevice}
          />
        </div>
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile Header with Menu Button - Sticky at top */}
          <div className="lg:hidden bg-white border-b border-gray-200 p-4 flex items-center gap-3 sticky top-0 z-10">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-gray-900">{selectedDevice.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className={
                    selectedDevice.status === "online"
                      ? "bg-green-100 text-green-700 border-green-200 text-xs"
                      : selectedDevice.status === "warning"
                      ? "bg-yellow-100 text-yellow-700 border-yellow-200 text-xs"
                      : "bg-gray-100 text-gray-700 border-gray-200 text-xs"
                  }
                >
                  {selectedDevice.status}
                </Badge>
                <span className="text-xs text-gray-600">{selectedDevice.ipAddress}</span>
              </div>
            </div>
          </div>

          {/* System Metrics */}
          <SystemMetrics
          device={selectedDevice}
          cpuHistory={cpuHistory}
          memoryHistory={memoryHistory}
          networkHistory={networkHistory}
          applications={deviceApplications}
          onAddApplication={handleAddApplication}
          onUpdateApplication={handleUpdateApplication}
          onRemoveApplication={handleRemoveApplication}
          onToggleAppStatus={handleToggleAppStatus}
          onToggleServiceStatus={handleToggleServiceStatus}
          networkInterfaces={mockNetworkInterfaces[selectedDeviceId] || []}
        />
      </div>



        {/* Mobile Drawer - Opens from right */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="right" className="p-0 w-80">
            <DeviceSidebar
              devices={devices}
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={handleSelectDevice}
              onAddDevice={handleAddDevice}
              onEditDevice={handleEditDevice}
            />
          </SheetContent>
        </Sheet>
      </div>

       {/* Add/Edit Device Dialog */}
      <AddEditDeviceDialog
        open={deviceDialogOpen}
        onOpenChange={setDeviceDialogOpen}
        device={editingDevice}
        onSave={handleSaveDevice}
      />

      <Toaster />
    </div>
  );
}
