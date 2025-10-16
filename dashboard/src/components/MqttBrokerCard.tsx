import { useState, useMemo, useEffect } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { ChevronRight, ChevronDown, Activity, Circle } from "lucide-react";
import { cn } from "./ui/utils";

interface MqttTopic {
  name: string;
  messageCount: number;
  lastMessage?: string;
  children?: MqttTopic[];
}

// Helper function to generate random message count
const randomCount = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// Mock MQTT topic data following $iot/device/<device-id>/<subtopic> pattern
const generateMockTopics = (deviceId: string): MqttTopic[] => {
  const tempCount = randomCount(50, 150);
  const humidityCount = randomCount(40, 120);
  const onlineCount = randomCount(10, 40);
  const uptimeCount = randomCount(10, 40);
  
  return [
    {
      name: "$iot",
      messageCount: 0,
      children: [
        {
          name: "device",
          messageCount: 0,
          children: [
            {
              name: deviceId,
              messageCount: 0,
              children: [
              {
                name: "telemetry",
                messageCount: tempCount + humidityCount,
                lastMessage: JSON.stringify({ temperature: 23.5, humidity: 65 }),
                children: [
                  {
                    name: "temperature",
                    messageCount: tempCount,
                    lastMessage: "23.5",
                  },
                  {
                    name: "humidity",
                    messageCount: humidityCount,
                    lastMessage: "65",
                  }
                ]
              },
              {
                name: "status",
                messageCount: onlineCount + uptimeCount,
                lastMessage: JSON.stringify({ online: true, uptime: 3600 }),
                children: [
                  {
                    name: "online",
                    messageCount: onlineCount,
                    lastMessage: "true",
                  },
                  {
                    name: "uptime",
                    messageCount: uptimeCount,
                    lastMessage: "3600",
                  }
                ]
              },
              {
                name: "commands",
                messageCount: randomCount(5, 25),
                lastMessage: JSON.stringify({ action: "restart" }),
              },
              {
                name: "events",
                messageCount: randomCount(3, 20),
                lastMessage: JSON.stringify({ type: "alert", level: "warning" }),
              }
            ]
            }
          ]
        }
      ]
    }
  ];
};

const TopicNode = ({ topic, level = 0 }: { topic: MqttTopic; level?: number }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = topic.children && topic.children.length > 0;

  // Reset expansion state when topic name changes (e.g., device UUID changes)
  useEffect(() => {
    setIsExpanded(true);
  }, [topic.name, level]);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-2 px-2 hover:bg-gray-50 rounded cursor-pointer group"
        )}
        style={{ marginLeft: `${level * 24}px` }}
        onClick={() => hasChildren && setIsExpanded(!isExpanded)}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          )
        ) : (
          <Circle className="w-2 h-2 text-gray-300 ml-1 flex-shrink-0" />
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-mono text-sm truncate",
              hasChildren ? "text-gray-900 font-medium" : "text-gray-700"
            )}>
              {topic.name}
            </span>
            {topic.messageCount > 0 && (
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                {topic.messageCount}
              </Badge>
            )}
          </div>
          {topic.lastMessage && !hasChildren && (
            <div className="text-xs text-gray-500 font-mono truncate mt-1">
              {topic.lastMessage}
            </div>
          )}
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {topic.children!.map((child, index) => (
            <TopicNode key={`${child.name}-${index}`} topic={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

interface MqttBrokerCardProps {
  deviceId: string;
}

export function MqttBrokerCard({ deviceId }: MqttBrokerCardProps) {
  const [isConnected] = useState(true);

  // Regenerate topics when deviceId changes
  const topics = useMemo(() => generateMockTopics(deviceId), [deviceId]);

  // Calculate total messages
  const countMessages = (topics: MqttTopic[]): number => {
    return topics.reduce((sum, topic) => {
      const childMessages = topic.children ? countMessages(topic.children) : 0;
      return sum + topic.messageCount + childMessages;
    }, 0);
  };

  const totalMessages = countMessages(topics);

  return (
    <Card className="p-4 md:p-6">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg text-gray-900 font-medium mb-1">MQTT Topics</h3>
          <div className="flex items-center gap-2">
            <Activity className={cn(
              "w-4 h-4",
              isConnected ? "text-green-500 animate-pulse" : "text-gray-400"
            )} />
            <Badge variant="outline" className={cn(
              "text-xs",
              isConnected 
                ? "bg-green-50 text-green-700 border-green-200" 
                : "bg-gray-50 text-gray-700 border-gray-200"
            )}>
              {isConnected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
        </div>
        <p className="text-gray-600">Topic hierarchy and message counts</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
        <div>
          <p className="text-xs text-gray-500 mb-1">Total Messages</p>
          <p className="text-lg font-semibold text-gray-900">{totalMessages}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Active Topics</p>
          <p className="text-lg font-semibold text-gray-900">
            {topics[0]?.children?.[0]?.children?.[0]?.children?.length || 0}
          </p>
        </div>
      </div>

      {/* Topic Tree */}
      <div className="border border-gray-200 rounded-lg p-2 max-h-[500px] overflow-y-auto">
        {topics.map((topic, index) => (
          <TopicNode key={`${topic.name}-${index}`} topic={topic} />
        ))}
      </div>
    </Card>
  );
}
