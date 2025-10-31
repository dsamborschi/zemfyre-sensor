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
