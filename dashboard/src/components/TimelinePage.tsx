import { Badge } from "./ui/badge";
import { Device } from "./DeviceSidebar";
import { TimelineCard } from "./TimelineCard";

interface TimelinePageProps {
  device: Device;
}

export function TimelinePage({ device }: TimelinePageProps) {
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
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Event Timeline</h2>
          <p className="text-gray-600">System events and activity history</p>
        </div>

        {/* Timeline Card */}
        <TimelineCard
          deviceId={device.deviceUuid}
          limit={50}
          autoRefresh={true}
          refreshInterval={30000}
        />
      </div>
    </div>
  );
}
