import { useState, useEffect } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  CheckCircle2,
  XCircle,
  Circle,
  Clock,
  Server,
  Wifi,
  WifiOff,
  Info,
  RefreshCw,
  Container,
  Settings,
  Activity,
  Loader2,
} from "lucide-react";
import { Button } from "./ui/button";
import { buildApiUrl } from "@/config/api";

interface TimelineEvent {
  id: string;
  event_id: string;
  timestamp: string;
  type: string;
  category: string;
  title: string;
  description: string;
  data: any;
  metadata: any;
  source?: string;
  correlation_id?: string;
}

interface TimelineCardProps {
  deviceId?: string;
  limit?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function TimelineCard({
  deviceId,
  limit = 5,
  autoRefresh = true,
  refreshInterval = 30000,
}: TimelineCardProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Fetch events from API
  const fetchEvents = async () => {
    if (!deviceId) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const response = await fetch(
        buildApiUrl(`/api/v1/events/device/${deviceId}?limit=${limit}`)
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch events: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.events) {
        // Get the top 5 latest events (API already returns them in order)
        const latestEvents = data.events.slice(0, 5);
        setEvents(latestEvents);
        setLastRefresh(new Date());
      } else {
        throw new Error(data.error || 'Failed to fetch events');
      }
    } catch (err) {
      console.error('[TimelineCard] Error fetching events:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchEvents();
  }, [deviceId, limit]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchEvents();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, deviceId, limit]);

  const handleManualRefresh = () => {
    setLoading(true);
    fetchEvents();
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case "device.provisioned":
        return <CheckCircle2 className="w-4 h-4" />;
      case "device.online":
        return <Wifi className="w-4 h-4" />;
      case "device.offline":
        return <WifiOff className="w-4 h-4" />;
      case "container.start":
      case "container.stop":
      case "container.restart":
        return <Container className="w-4 h-4" />;
      case "target_state.updated":
      case "current_state.updated":
        return <Settings className="w-4 h-4" />;
      case "reconciliation.started":
      case "reconciliation.completed":
        return <Activity className="w-4 h-4" />;
      default:
        return <Circle className="w-4 h-4" />;
    }
  };

  const getEventColor = (type: string, category: string) => {
    // Color by category first, then specific types
    switch (category) {
      case "device":
        if (type === "device.online") {
          return {
            bg: "bg-green-50",
            text: "text-green-600",
            border: "border-green-200",
            badgeBg: "bg-green-100",
            badgeText: "text-green-700",
            badgeBorder: "border-green-200",
          };
        }
        if (type === "device.offline") {
          return {
            bg: "bg-red-50",
            text: "text-red-600",
            border: "border-red-200",
            badgeBg: "bg-red-100",
            badgeText: "text-red-700",
            badgeBorder: "border-red-200",
          };
        }
        return {
          bg: "bg-blue-50",
          text: "text-blue-600",
          border: "border-blue-200",
          badgeBg: "bg-blue-100",
          badgeText: "text-blue-700",
          badgeBorder: "border-blue-200",
        };
      case "container":
      case "application":
        return {
          bg: "bg-purple-50",
          text: "text-purple-600",
          border: "border-purple-200",
          badgeBg: "bg-purple-100",
          badgeText: "text-purple-700",
          badgeBorder: "border-purple-200",
        };
      case "configuration":
        return {
          bg: "bg-yellow-50",
          text: "text-yellow-600",
          border: "border-yellow-200",
          badgeBg: "bg-yellow-100",
          badgeText: "text-yellow-700",
          badgeBorder: "border-yellow-200",
        };
      case "system":
        return {
          bg: "bg-indigo-50",
          text: "text-indigo-600",
          border: "border-indigo-200",
          badgeBg: "bg-indigo-100",
          badgeText: "text-indigo-700",
          badgeBorder: "border-indigo-200",
        };
      case "telemetry":
        return {
          bg: "bg-teal-50",
          text: "text-teal-600",
          border: "border-teal-200",
          badgeBg: "bg-teal-100",
          badgeText: "text-teal-700",
          badgeBorder: "border-teal-200",
        };
      default:
        return {
          bg: "bg-gray-50",
          text: "text-gray-600",
          border: "border-gray-200",
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
    // Primary timestamp from event
    if (event.timestamp) return event.timestamp;
    
    // Fallback to data timestamps
    if (event.data?.provisioned_at) return event.data.provisioned_at;
    if (event.data?.detected_at) return event.data.detected_at;
    if (event.data?.came_online_at) return event.data.came_online_at;
    if (event.data?.last_seen) return event.data.last_seen;
    return null;
  };

  const renderEventDetails = (event: TimelineEvent) => {
    const details: { label: string; value: string }[] = [];

    // Common details based on event type
    if (event.type === "device.provisioned") {
      if (event.data?.device_name)
        details.push({ label: "Device", value: event.data.device_name });
      if (event.data?.ip_address)
        details.push({ label: "IP Address", value: event.data.ip_address });
      if (event.data?.mac_address)
        details.push({ label: "MAC Address", value: event.data.mac_address });
      if (event.data?.os_version)
        details.push({ label: "OS Version", value: event.data.os_version });
    } else if (event.type === "device.offline") {
      if (event.data?.reason)
        details.push({ label: "Reason", value: event.data.reason });
      if (event.data?.last_seen)
        details.push({
          label: "Last Seen",
          value: formatDate(event.data.last_seen),
        });
      if (event.data?.offline_threshold_minutes)
        details.push({
          label: "Threshold",
          value: `${event.data.offline_threshold_minutes} minutes`,
        });
    } else if (event.type === "device.online") {
      if (event.data?.reason)
        details.push({ label: "Reason", value: event.data.reason });
      if (event.data?.offline_duration_minutes !== undefined) {
        const duration = Math.abs(event.data.offline_duration_minutes);
        details.push({
          label: "Offline Duration",
          value: `${duration} minutes`,
        });
      }
    } else if (event.type.startsWith("container.")) {
      if (event.data?.container_name)
        details.push({ label: "Container", value: event.data.container_name });
      if (event.data?.app_name)
        details.push({ label: "Application", value: event.data.app_name });
      if (event.data?.image)
        details.push({ label: "Image", value: event.data.image });
    } else if (event.type.startsWith("target_state.")) {
      if (event.data?.changed_fields && Array.isArray(event.data.changed_fields)) {
        details.push({ label: "Changed", value: event.data.changed_fields.join(", ") });
      }
    } else if (event.type.startsWith("reconciliation.")) {
      if (event.data?.actions_count !== undefined)
        details.push({ label: "Actions", value: String(event.data.actions_count) });
      if (event.data?.duration_ms !== undefined)
        details.push({ label: "Duration", value: `${event.data.duration_ms}ms` });
    }

    // Add source if available
    if (event.source) {
      details.push({ label: "Source", value: event.source });
    }

    return details;
  };

  return (
    <Card className="flex flex-col h-[600px]">
      {/* Sticky Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 p-4 md:p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg text-gray-900 font-medium mb-1">Timeline</h3>
              <p className="text-sm text-gray-00">
                {loading ? "Loading events..." : `Device activity and system events`}
              </p>
              {!loading && lastRefresh && (
                <p className="text-xs text-gray-500 mt-1">
                  Last updated: {lastRefresh.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {events.length > 0 && (
              <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-200">
                {events.length} {events.length === 1 ? "event" : "events"}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleManualRefresh}
              disabled={loading}
              className="h-8 w-8 p-0"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable Events Section */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        <div className="p-4 md:p-6">
        {error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-3">
              <XCircle className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-red-600 font-medium">Failed to load events</p>
            <p className="text-sm text-gray-500 mt-1">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              className="mt-3"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
            <p className="text-gray-600">Loading events...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <Info className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-gray-600">No events to display</p>
            <p className="text-sm text-gray-500 mt-1">Events will appear here as they occur</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200" />

            {/* Events */}
            <div className="space-y-6">
              {events.map((event, index) => {
                const colors = getEventColor(event.type, event.category);
                const timestamp = getEventTimestamp(event);
                const details = renderEventDetails(event);

                return (
                  <div key={event.id} className="relative pl-12">
                    {/* Timeline dot */}
            

                    {/* Event card */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="text-gray-900 mb-1">{event.title}</h4>
                          {event.description && (
                            <p className="text-gray-600">{event.description}</p>
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
                        <div className="flex items-center gap-2 text-gray-500 mb-3">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="text-sm">{formatDate(timestamp)}</span>
                        </div>
                      )}

                      {details.length > 0 && (
                        <div className="space-y-2 pt-3 border-t border-gray-100">
                          {details.map((detail, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-gray-600">{detail.label}</span>
                              <span className="text-gray-900">{detail.value}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Event ID */}
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs text-gray-500">
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
        </div>
      </div>
    </Card>
  );
}
