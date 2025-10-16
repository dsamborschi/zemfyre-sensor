import { useState } from "react";
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

// Mock MQTT topic data following $iot/device/<device-id>/<subtopic> pattern
const generateMockTopics = (): MqttTopic[] => {
  const deviceIds = [
    "a3f8c9d2-4e1b-4a9f-b7d3-c2e8f5a1b6d4",
    "b8e4d1c3-9f2a-4d6e-a5c7-d9f3e8b2a7c1",
    "c5d9f2e4-3a7b-4c8e-d1f6-e8a3c9b5d7f2"
  ];

  return [
    {
      name: "$iot",
      messageCount: 0,
      children: [
        {
          name: "device",
          messageCount: 0,
          children: deviceIds.map(deviceId => ({
            name: deviceId,
            messageCount: 0,
            children: [
              {
                name: "telemetry",
                messageCount: 142,
                lastMessage: JSON.stringify({ temperature: 23.5, humidity: 65 }),
                children: [
                  {
                    name: "temperature",
                    messageCount: 89,
                    lastMessage: "23.5",
                  },
                  {
                    name: "humidity",
                    messageCount: 53,
                    lastMessage: "65",
                  }
                ]
              },
              {
                name: "status",
                messageCount: 45,
                lastMessage: JSON.stringify({ online: true, uptime: 3600 }),
                children: [
                  {
                    name: "online",
                    messageCount: 23,
                    lastMessage: "true",
                  },
                  {
                    name: "uptime",
                    messageCount: 22,
                    lastMessage: "3600",
                  }
                ]
              },
              {
                name: "commands",
                messageCount: 12,
                lastMessage: JSON.stringify({ action: "restart" }),
              },
              {
                name: "events",
                messageCount: 8,
                lastMessage: JSON.stringify({ type: "alert", level: "warning" }),
              }
            ]
          }))
        }
      ]
    }
  ];
};

const TopicNode = ({ topic, level = 0 }: { topic: MqttTopic; level?: number }) => {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const hasChildren = topic.children && topic.children.length > 0;

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

export function MqttBrokerCard() {
  const [topics] = useState<MqttTopic[]>(generateMockTopics());
  const [isConnected] = useState(true);

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
          <h3 className="text-gray-900">MQTT Broker</h3>
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
            {topics[0]?.children?.[0]?.children?.length || 0}
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
