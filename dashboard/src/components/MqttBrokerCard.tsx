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
  fullTopic?: string; // Store full topic path for selection
}

interface TopicNodeProps {
  topic: MqttTopic;
  level?: number;
  onTopicSelect?: (topic: string, message: string) => void;
  fullPath?: string;
}

const TopicNode = ({ topic, level = 0, onTopicSelect, fullPath = '' }: TopicNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = topic.children && topic.children.length > 0;
  const currentPath = fullPath ? `${fullPath}/${topic.name}` : topic.name;

  // Reset expansion state when topic name changes (e.g., device UUID changes)
  useEffect(() => {
    setIsExpanded(true);
  }, [topic.name, level]);

  const handleClick = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    } else if (onTopicSelect && topic.lastMessage) {
      // Leaf node - select it to show JSON
      onTopicSelect(currentPath, topic.lastMessage);
    }
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-2 px-2 hover:bg-gray-50 rounded cursor-pointer group",
          !hasChildren && "hover:bg-blue-50" // Highlight leaf nodes on hover
        )}
        style={{ marginLeft: `${level * 24}px` }}
        onClick={handleClick}
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
            <TopicNode 
              key={`${child.name}-${index}`} 
              topic={child} 
              level={level + 1}
              onTopicSelect={onTopicSelect}
              fullPath={currentPath}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface MqttBrokerCardProps {
  deviceId: string;
}

// Build hierarchical tree from flat topic list
const buildTopicTree = (flatTopics: any[]): MqttTopic[] => {
  const root: { [key: string]: any } = {};

  flatTopics.forEach(({ topic, messageCount, lastMessage }) => {
    const parts = topic.split('/');
    let current = root;

    parts.forEach((part: string, index: number) => {
      if (!current[part]) {
        current[part] = {
          name: part,
          messageCount: 0,
          children: {},
        };
      }

      // If this is the last part, set the message details
      if (index === parts.length - 1) {
        current[part].messageCount = messageCount;
        current[part].lastMessage = lastMessage;
      }

      current = current[part].children;
    });
  });

  // Convert nested object to array format
  const convertToArray = (obj: any): MqttTopic[] => {
    return Object.values(obj).map((node: any) => {
      const children = node.children && Object.keys(node.children).length > 0
        ? convertToArray(node.children)
        : undefined;

      return {
        name: node.name,
        messageCount: node.messageCount,
        lastMessage: node.lastMessage,
        children,
      };
    });
  };

  return convertToArray(root);
};

export function MqttBrokerCard({ deviceId }: MqttBrokerCardProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [topics, setTopics] = useState<MqttTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalMessages, setTotalMessages] = useState(0);
  const [activeTopics, setActiveTopics] = useState(0);
  const [timeWindow, setTimeWindow] = useState(15); // 15 minutes by default
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [selectedMessage, setSelectedMessage] = useState<string>('');

  // Fetch topics from API
  useEffect(() => {
    const fetchTopics = async () => {
      try {
        console.log(`[MqttBrokerCard] Fetching topics with time window: ${timeWindow} minutes`);
        
        // Fetch both recent activity AND actual topics for last message
        const [recentResponse, topicsResponse] = await Promise.all([
          fetch(`http://localhost:4002/api/v1/mqtt-monitor/recent-activity?window=${timeWindow}`),
          fetch('http://localhost:4002/api/v1/mqtt-monitor/topics')
        ]);
        
        if (recentResponse.ok && topicsResponse.ok) {
          const recentData = await recentResponse.json();
          const topicsData = await topicsResponse.json();
          
          if (recentData.success && recentData.data && topicsData.success && topicsData.data) {
            // Filter topics for the selected device
            const deviceRecentTopics = recentData.data.filter((t: any) => 
              t.topic.includes(deviceId)
            );

            // Create a map of topics with their last message
            const topicLastMessageMap = new Map(
              topicsData.data
                .filter((t: any) => t.topic.includes(deviceId))
                .map((t: any) => [t.topic, t.lastMessage])
            );

            console.log(`[MqttBrokerCard] Found ${deviceRecentTopics.length} active topics in last ${timeWindow} minutes`);

            // Convert recent activity to format expected by buildTopicTree
            // Combine recent message count with actual last message
            const topicsForTree = deviceRecentTopics.map((t: any) => {
              const lastMsg = topicLastMessageMap.get(t.topic);
              // Truncate long JSON messages, show rate for summary
              const displayMessage = lastMsg && typeof lastMsg === 'string'
                ? (lastMsg.length > 100 ? lastMsg.substring(0, 97) + '...' : lastMsg)
                : `Rate: ${t.messageRate.toFixed(1)}/min`;
              
              return {
                topic: t.topic,
                messageCount: t.messageCount,
                lastMessage: displayMessage
              };
            });

            // Build hierarchical tree
            const tree = buildTopicTree(topicsForTree);
            setTopics(tree);
            setIsConnected(true);
            
            // Calculate stats - sum of recent message counts
            const total = deviceRecentTopics.reduce((sum: number, t: any) => sum + (t.messageCount || 0), 0);
            setTotalMessages(total);
            setActiveTopics(deviceRecentTopics.length);
          }
        }
      } catch (error) {
        console.error('[MqttBrokerCard] Failed to fetch topics:', error);
        setIsConnected(false);
      } finally {
        setLoading(false);
      }
    };

    fetchTopics();
    const interval = setInterval(fetchTopics, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [deviceId, timeWindow]);

  // Calculate total messages (recursive)
  const countMessages = (topics: MqttTopic[]): number => {
    return topics.reduce((sum, topic) => {
      const childMessages = topic.children ? countMessages(topic.children) : 0;
      return sum + topic.messageCount + childMessages;
    }, 0);
  };

  // Handle topic selection
  const handleTopicSelect = (topic: string, message: string) => {
    setSelectedTopic(topic);
    setSelectedMessage(message);
  };

  // Try to parse and format JSON
  const formatJsonMessage = (message: string) => {
    try {
      const parsed = JSON.parse(message);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return message; // Return as-is if not valid JSON
    }
  };

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

      {/* Stats with Time Window Selector */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500"></p>
          <select 
            value={timeWindow}
            onChange={(e) => setTimeWindow(parseInt(e.target.value))}
            className="text-xs px-2 py-1 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="5">Last 5 min</option>
            <option value="15">Last 15 min</option>
            <option value="30">Last 30 min</option>
            <option value="60">Last hour</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
          <div>
            <p className="text-xs text-gray-500 mb-1">Messages</p>
            <p className="text-lg font-semibold text-gray-900">
              {loading ? '...' : totalMessages.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Active Topics</p>
            <p className="text-lg font-semibold text-gray-900">
              {loading ? '...' : activeTopics}
            </p>
          </div>
        </div>
      </div>

      {/* Topic Tree and JSON Viewer - Split View */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Topic Tree */}
        <div className="border border-gray-200 rounded-lg p-2 max-h-[500px] overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading topics...</div>
          ) : topics.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No topics found for this device</div>
          ) : (
            topics.map((topic, index) => (
              <TopicNode 
                key={`${topic.name}-${index}`} 
                topic={topic} 
                onTopicSelect={handleTopicSelect}
              />
            ))
          )}
        </div>

        {/* JSON Message Viewer */}
        <div className="border border-gray-200 rounded-lg p-3 max-h-[500px] overflow-y-auto bg-gray-50">
          {selectedTopic ? (
            <div>
              <div className="mb-2 pb-2 border-b border-gray-300">
                <p className="text-xs font-semibold text-gray-700 mb-1">Topic:</p>
                <p className="text-xs font-mono text-gray-900 break-all">{selectedTopic}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Message:</p>
                <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap break-words bg-white p-3 rounded border border-gray-200 overflow-x-auto">
                  {formatJsonMessage(selectedMessage)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-center text-gray-400">
              <div>
                <Circle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Select a topic to view its message</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
