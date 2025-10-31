import { Application, ApplicationsCard } from "./ApplicationsCard";
import { Device } from "./DeviceSidebar";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Package, Layers, Activity, AlertCircle } from "lucide-react";
import { ContainerLogsCard } from "./ContainerLogsCard";

interface ApplicationsPageProps {
  device: Device;
  applications: Application[];
  onAddApplication: (app: Omit<Application, "id">) => void;
  onUpdateApplication: (app: Application) => void;
  onRemoveApplication: (appId: string) => void;
  onToggleAppStatus: (appId: string) => void;
  onToggleServiceStatus: (appId: string, serviceId: number, action: "start" | "pause" | "stop") => void;
  deploymentStatus?: {
    needsDeployment: boolean;
    version: number;
    lastDeployedAt?: string;
    deployedBy?: string;
  };
  setDeploymentStatus?: React.Dispatch<React.SetStateAction<Record<string, {
    needsDeployment: boolean;
    version: number;
    lastDeployedAt?: string;
    deployedBy?: string;
  }>>>;
}

export function ApplicationsPage({
  device,
  applications,
  onAddApplication,
  onUpdateApplication,
  onRemoveApplication,
  onToggleAppStatus,
  onToggleServiceStatus,
  deploymentStatus,
  setDeploymentStatus,
}: ApplicationsPageProps) {
  // Calculate application statistics
  const totalApps = applications.length;
  const runningApps = applications.filter(app => 
    app.services?.some(s => s.status === "running")
  ).length;
  
  // Calculate service statistics
  const allServices = applications.flatMap(app => app.services || []);
  const totalServices = allServices.length;
  const runningServices = allServices.filter(s => s.status === "running").length;
  const stoppedServices = allServices.filter(s => s.status === "stopped").length;
  const pausedServices = allServices.filter(s => s.status === "paused").length;
  const pendingServices = allServices.filter(s => s.status === "pending").length;
  
  // Calculate sync status for applications
  const syncingApps = applications.filter(app => app.syncStatus === "syncing").length;
  const errorApps = applications.filter(app => app.syncStatus === "error").length;
  const pendingApps = applications.filter(app => app.syncStatus === "pending").length;
  const syncedApps = applications.filter(app => app.syncStatus === "synced").length;

  const metrics = [
    {
      icon: Package,
      label: "Total Applications",
      value: totalApps.toString(),
      subtitle: `${runningApps} running`,
      color: "blue",
      bgColor: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      icon: Layers,
      label: "Total Services",
      value: totalServices.toString(),
      subtitle: `${runningServices} running, ${stoppedServices} stopped`,
      color: "purple",
      bgColor: "bg-purple-50",
      iconColor: "text-purple-600",
    },
    {
      icon: Activity,
      label: "Service Status",
      value: pausedServices > 0 ? `${pausedServices} paused` : `${runningServices} active`,
      subtitle: pendingServices > 0 ? `${pendingServices} pending` : "All synced",
      color: pausedServices > 0 ? "orange" : "green",
      bgColor: pausedServices > 0 ? "bg-orange-50" : "bg-green-50",
      iconColor: pausedServices > 0 ? "text-orange-600" : "text-green-600",
    },
    {
      icon: AlertCircle,
      label: "Sync Status",
      value: errorApps > 0 ? `${errorApps} errors` : syncingApps > 0 ? `${syncingApps} syncing` : "All synced",
      subtitle: pendingApps > 0 ? `${pendingApps} pending deployment` : `${syncedApps} synced`,
      color: errorApps > 0 ? "red" : syncingApps > 0 ? "blue" : "green",
      bgColor: errorApps > 0 ? "bg-red-50" : syncingApps > 0 ? "bg-blue-50" : "bg-green-50",
      iconColor: errorApps > 0 ? "text-red-600" : syncingApps > 0 ? "text-blue-600" : "text-green-600",
    },
  ];

  return (
    <div className="flex-1 bg-gray-50 overflow-auto">
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Applications</h2>
          <p className="text-gray-600">
            Manage containerized applications and services running on {device.name}
          </p>
        </div>

        {/* Quick Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric, index) => {
            const Icon = metric.icon;
            const borderColors = {
              blue: 'border-blue-200',
              purple: 'border-purple-200',
              green: 'border-green-200',
              orange: 'border-orange-200',
              red: 'border-red-200',
            };
            return (
              <Card key={index} className={`border-2 ${metric.bgColor} ${borderColors[metric.color as keyof typeof borderColors]}`}>
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
                      <p className="text-3xl font-bold">{metric.value}</p>
                      {metric.subtitle && (
                        <p className="text-xs text-gray-600">{metric.subtitle}</p>
                      )}
                    </div>
                    <div className={`h-12 w-12 ${metric.iconColor}`}>
                      <Icon className="h-full w-full" />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Applications and Logs Side by Side */}
        
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Applications Card */}
          <ApplicationsCard
            deviceId={device.id}
            deviceUuid={device.deviceUuid}
            deviceStatus={device.status}
            applications={applications}
            onAddApplication={onAddApplication}
            onUpdateApplication={onUpdateApplication}
            onRemoveApplication={onRemoveApplication}
            onToggleStatus={onToggleAppStatus}
            onToggleServiceStatus={onToggleServiceStatus}
          />

          {/* Container Logs Card */}
          <ContainerLogsCard
            deviceUuid={device.deviceUuid}
            applications={applications}
          />
        </div>
      </div>
    </div>
  );
}
