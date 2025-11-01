import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import {
  CheckCircle2,
  XCircle,
  Circle,
  Clock,
  Server,
  Wifi,
  WifiOff,
  Info,
} from "lucide-react";

interface TimelineEvent {
  id: string;
  event_id: string;
  type: string;
  category: string;
  title: string;
  description: string;
  data: any;
  metadata: any;
}

interface DeviceTimelineCardProps {
  deviceUuid?: string;
  events: TimelineEvent[];
}

export function DeviceTimelineCard({
  deviceUuid,
  events,
}: DeviceTimelineCardProps) {
  const getEventIcon = (type: string) => {
    switch (type) {
      case "device.provisioned":
        return <CheckCircle2 className="w-4 h-4" />;
      case "device.online":
        return <Wifi className="w-4 h-4" />;
      case "device.offline":
        return <WifiOff className="w-4 h-4" />;
      default:
        return <Circle className="w-4 h-4" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case "device.provisioned":
        return {
          bg: "bg-blue-50",
          text: "text-blue-600",
          border: "border-blue-200",
          line: "bg-blue-200",
          badgeBg: "bg-blue-100",
          badgeText: "text-blue-700",
          badgeBorder: "border-blue-200",
        };
      case "device.online":
        return {
          bg: "bg-green-50",
          text: "text-green-600",
          border: "border-green-200",
          line: "bg-green-200",
          badgeBg: "bg-green-100",
          badgeText: "text-green-700",
          badgeBorder: "border-green-200",
        };
      case "device.offline":
        return {
          bg: "bg-red-50",
          text: "text-red-600",
          border: "border-red-200",
          line: "bg-red-200",
          badgeBg: "bg-red-100",
          badgeText: "text-red-700",
          badgeBorder: "border-red-200",
        };
      default:
        return {
          bg: "bg-gray-50",
          text: "text-gray-600",
          border: "border-gray-200",
          line: "bg-gray-200",
          badgeBg: "bg-gray-100",
          badgeText: "text-gray-700",
          badgeBorder: "border-gray-200",
        };
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const getEventTimestamp = (event: TimelineEvent) => {
    // Try to find the most relevant timestamp from the event data
    if (event.data.provisioned_at) return event.data.provisioned_at;
    if (event.data.detected_at) return event.data.detected_at;
    if (event.data.came_online_at) return event.data.came_online_at;
    if (event.data.last_seen) return event.data.last_seen;
    return null;
  };

  const renderEventDetails = (event: TimelineEvent) => {
    const details: { label: string; value: string }[] = [];

    // Common details based on event type
    if (event.type === "device.provisioned") {
      if (event.data.device_name)
        details.push({ label: "Device", value: event.data.device_name });
      if (event.data.ip_address)
        details.push({ label: "IP Address", value: event.data.ip_address });
      if (event.data.mac_address)
        details.push({ label: "MAC Address", value: event.data.mac_address });
      if (event.data.os_version)
        details.push({ label: "OS Version", value: event.data.os_version });
    } else if (event.type === "device.offline") {
      if (event.data.reason)
        details.push({ label: "Reason", value: event.data.reason });
      if (event.data.last_seen)
        details.push({
          label: "Last Seen",
          value: formatDate(event.data.last_seen),
        });
      if (event.data.offline_threshold_minutes)
        details.push({
          label: "Threshold",
          value: `${event.data.offline_threshold_minutes} minutes`,
        });
    } else if (event.type === "device.online") {
      if (event.data.reason)
        details.push({ label: "Reason", value: event.data.reason });
      if (event.data.offline_duration_minutes !== undefined) {
        const duration = Math.abs(event.data.offline_duration_minutes);
        details.push({
          label: "Offline Duration",
          value: `${duration} minutes`,
        });
      }
    }

    return details;
  };

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
            <Clock className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-foreground mb-1">Device Event History</h3>
            <p className="text-muted-foreground">Recent device activity and status changes</p>
          </div>
        </div>
        {events.length > 0 && (
          <Badge variant="outline" className="bg-muted text-foreground border-border">
            {events.length} {events.length === 1 ? "event" : "events"}
          </Badge>
        )}
      </div>

      <ScrollArea className="h-[400px] pr-4">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
              <Info className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">No events to display</p>
            <p className="text-muted-foreground">Events will appear here as they occur</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />

            {/* Events */}
            <div className="space-y-6">
              {events.map((event, index) => {
                const colors = getEventColor(event.type);
                const timestamp = getEventTimestamp(event);
                const details = renderEventDetails(event);

                return (
                  <div key={event.id} className="relative pl-12">
                    {/* Timeline dot */}
                    <div
                      className={`absolute left-0 w-10 h-10 rounded-full border-2 ${colors.border} ${colors.bg} flex items-center justify-center ${colors.text}`}
                    >
                      {getEventIcon(event.type)}
                    </div>

                    {/* Event card */}
                    <div className="bg-card border border-border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="text-foreground mb-1">{event.title}</h4>
                          {event.description && (
                            <p className="text-muted-foreground">{event.description}</p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={`${colors.badgeBg} ${colors.badgeText} ${colors.badgeBorder} ml-2`}
                        >
                          {event.category}
                        </Badge>
                      </div>

                      {timestamp && (
                        <div className="flex items-center gap-2 text-muted-foreground mb-3">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatDate(timestamp)}</span>
                        </div>
                      )}

                      {details.length > 0 && (
                        <div className="space-y-2 pt-3 border-t border-border">
                          {details.map((detail, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-muted-foreground">{detail.label}</span>
                              <span className="text-foreground">{detail.value}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Event ID (collapsed by default) */}
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground">
                          Event ID: {event.event_id}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}
