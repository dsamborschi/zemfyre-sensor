import { Application, ApplicationsCard } from "./ApplicationsCard";
import { Device } from "./DeviceSidebar";

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
  return (
    <div className="flex-1 bg-gray-50 overflow-auto">
      <div className="p-4 md:p-6 lg:p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Applications</h2>
          <p className="text-gray-600">
            Manage containerized applications and services running on {device.name}
          </p>
        </div>

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
      </div>
    </div>
  );
}
