/**
 * Jobs Page - Shows scheduled jobs and job history
 */

import { Badge } from "./ui/badge";
import { Device } from "./DeviceSidebar";
import JobsCard from "./JobsCard";

interface JobsPageProps {
  device: Device;
}

export function JobsPage({ device }: JobsPageProps) {
  return (
    <div className="flex-1 bg-gray-50 overflow-auto">
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* Header - Hidden on mobile (shown in sticky header instead) */}
        <div className="hidden lg:block space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-gray-900 mb-2">{device.name}</h1>
              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className={
                    device.status === "online"
                      ? "bg-green-100 text-green-700 border-green-200"
                      : device.status === "warning"
                      ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                      : "bg-gray-100 text-gray-700 border-gray-200"
                  }
                >
                  {device.status}
                </Badge>
                <span className="text-gray-600">{device.type}</span>
                <span className="text-gray-600">•</span>
                <span className="text-gray-600">{device.ipAddress}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Page Title */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Scheduled Jobs</h2>
          <p className="text-sm text-gray-600">
            Manage and monitor scheduled tasks and job execution history
          </p>
        </div>

        {/* Jobs Card */}
        <JobsCard deviceUuid={device.deviceUuid} />
      </div>
    </div>
  );
}
