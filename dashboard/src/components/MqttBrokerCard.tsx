import { useState, useMemo, useEffect } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { ChevronRight, ChevronDown, Activity, Circle, Copy, Check } from "lucide-react";
import { cn } from "./ui/utils";
import { buildApiUrl } from "@/config/api";

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
  selectedTopic?: string;
}

const TopicNode = ({ topic, level = 0, onTopicSelect, fullPath = '', selectedTopic }: TopicNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = topic.children && topic.children.length > 0;
  const currentPath = fullPath ? `${fullPath}/${topic.name}` : topic.name;
  const isSelected = currentPath === selectedTopic;

  // Reset expansion state when topic name changes (e.g., device UUID changes)
  useEffect(() => {
    setIsExpanded(true);
  }, [topic.name, level]);

  const handleClick = () => {
    // Only select topic, don't toggle expansion
    if (onTopicSelect && topic.lastMessage) {
      onTopicSelect(currentPath, topic.lastMessage);
    }
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-2 px-2 rounded cursor-pointer group",
          isSelected ? "bg-blue-100 hover:bg-blue-100" : "hover:bg-gray-50",
          !hasChildren && !isSelected && "hover:bg-blue-50" // Highlight leaf nodes on hover
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
              "font-mono text-sm truncate text-gray-700",
              hasChildren && "text-gray-900 font-medium",
              isSelected && "font-semibold text-gray-900"
            )}>
              {topic.name}
            </span>
            {topic.messageCount > 0 && (
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                {topic.messageCount}
              </Badge>
            )}
          </div>
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
              selectedTopic={selectedTopic}
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
          lastMessage: undefined,
          children: {},
        };
      }

      // If this is the last part, set the message details for this exact topic
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
        messageCount: node.messageCount || 0,
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
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [selectedMessage, setSelectedMessage] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [timeWindow, setTimeWindow] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Fetch topics from API
  useEffect(() => {
    const fetchTopics = async () => {
      try {
        console.log(`[MqttBrokerCard] Fetching topics for device: ${deviceId}, timeWindow: ${timeWindow}`);
        
        // Fetch topics with time window filter
        const url = timeWindow === 'all' 
          ? buildApiUrl('/api/v1/mqtt-monitor/topics')
          : buildApiUrl(`/api/v1/mqtt-monitor/topics?timeWindow=${timeWindow}`);
        const topicsResponse = await fetch(url);
        
        if (topicsResponse.ok) {
          const topicsData = await topicsResponse.json();
          
          if (topicsData.success) {
            console.log('[MqttBrokerCard] All topics:', topicsData);
            
            // Filter topics for the selected device only
            // Only include topics that contain the specific deviceId
            const deviceTopics = topicsData.data.filter((t: any) => 
              t.topic.includes(deviceId)
            );

            console.log(`[MqttBrokerCard] Found ${deviceTopics.length} topics for device ${deviceId}`);

            // Use the data directly from the API (messageCount is already there)
            const topicsForTree = deviceTopics.map((t: any) => ({
              topic: t.topic,
              messageCount: t.messageCount || 0,
              lastMessage: t.lastMessage
            }));

            console.log('[MqttBrokerCard] Topics for tree:', topicsForTree);
            console.log('[MqttBrokerCard] Topic paths:', topicsForTree.map((t: any) => t.topic));

            // Build hierarchical tree
            const tree = buildTopicTree(topicsForTree);
            console.log('[MqttBrokerCard] Built tree:', JSON.stringify(tree, null, 2));
            setTopics(tree);
            setIsConnected(true);
            
            // Calculate stats from all topics
            const total = deviceTopics.reduce((sum: number, t: any) => sum + (t.messageCount || 0), 0);
            const active = deviceTopics.filter((t: any) => (t.messageCount || 0) > 0).length;
            setTotalMessages(total);
            setActiveTopics(active);
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

  // Copy topic to clipboard
  const handleCopyTopic = async () => {
    try {
      await navigator.clipboard.writeText(selectedTopic);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy topic:', err);
    }
  };

  // Auto-select first topic with a message when topics load or change
  useEffect(() => {
    if (topics.length === 0) {
      setSelectedTopic('');
      setSelectedMessage('');
      return;
    }

    // Find first topic with a message (recursively)
    const findFirstTopicWithMessage = (topics: MqttTopic[], path: string = ''): { topic: string; message: string } | null => {
      for (const topic of topics) {
        const currentPath = path ? `${path}/${topic.name}` : topic.name;
        
        // If this topic has a message, select it
        if (topic.lastMessage) {
          return { topic: currentPath, message: topic.lastMessage };
        }
        
        // Otherwise check children
        if (topic.children && topic.children.length > 0) {
          const found = findFirstTopicWithMessage(topic.children, currentPath);
          if (found) return found;
        }
      }
      return null;
    };

    const firstTopic = findFirstTopicWithMessage(topics);
    if (firstTopic && !selectedTopic) {
      setSelectedTopic(firstTopic.topic);
      setSelectedMessage(firstTopic.message);
    }
  }, [topics, deviceId, selectedTopic]);

  // Filter topics based on search query
  const filterTopics = (topics: MqttTopic[], query: string): MqttTopic[] => {
    if (!query.trim()) return topics;
    
    const lowerQuery = query.toLowerCase();
    
    return topics.filter(topic => {
      // Check if current topic name matches
      const nameMatches = topic.name.toLowerCase().includes(lowerQuery);
      
      // Check if any children match (recursively)
      const hasMatchingChildren = topic.children && topic.children.length > 0 
        ? filterTopics(topic.children, query).length > 0
        : false;
      
      // Include topic if it matches or has matching children
      if (nameMatches || hasMatchingChildren) {
        // If topic has children, filter them too
        if (topic.children && topic.children.length > 0) {
          return {
            ...topic,
            children: filterTopics(topic.children, query)
          };
        }
        return true;
      }
      
      return false;
    }).map(topic => {
      // Apply filter to children
      if (topic.children && topic.children.length > 0) {
        return {
          ...topic,
          children: filterTopics(topic.children, query)
        };
      }
      return topic;
    });
  };

  const filteredTopics = useMemo(() => {
    return filterTopics(topics, searchQuery);
  }, [topics, searchQuery]);

  // Try to parse and format JSON
  const formatJsonMessage = (message: string) => {
    try {
      const parsed = JSON.parse(message);
      const formatted = JSON.stringify(parsed, null, 2);
      
      // Add syntax highlighting
      return formatted
        .replace(/(".*?"):/g, '<span class="text-blue-600 font-medium">$1</span>:')  // Keys
        .replace(/: (".*?")/g, ': <span class="text-green-600">$1</span>')  // String values
        .replace(/: (true|false)/g, ': <span class="text-purple-600 font-semibold">$1</span>')  // Booleans
        .replace(/: (null)/g, ': <span class="text-gray-500 italic">$1</span>')  // Null
        .replace(/: (-?\d+\.?\d*)/g, ': <span class="text-orange-600">$1</span>');  // Numbers
    } catch (e) {
      return message; // Return as-is if not valid JSON
    }
  };

  return (
    <Card className="p-4 md:p-6">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg text-foreground font-medium mb-1">MQTT Explorer</h3>
          <div className="flex items-center gap-2">
            <Activity className={cn(
              "w-4 h-4",
              isConnected ? "text-green-500 animate-pulse" : "text-muted-foreground"
            )} />
            <Badge variant="outline" className={cn(
              "text-xs",
              isConnected 
                ? "bg-green-50 text-green-700 border-green-200" 
                : "bg-muted text-muted-foreground border-border"
            )}>
              {isConnected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
        </div>
        <p className="text-muted-foreground">Topic hierarchy and message counts</p>
      </div>

      {/* Stats */}
      <div className="mb-4">
        <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Messages</p>
            <p className="text-lg font-semibold text-foreground">
              {loading ? '...' : totalMessages.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Active Topics</p>
            <p className="text-lg font-semibold text-foreground">
              {loading ? '...' : activeTopics}
            </p>
          </div>
        </div>
      </div>


      {/* Search Filter */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-muted-foreground mb-2">
          Search Topics
        </label>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by topic name..."
            className="w-full px-3 py-2 pr-10 border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-background text-foreground placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
              title="Clear search"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="mt-1 text-xs text-gray-500">
            Filtering topics containing: "{searchQuery}"
          </p>
        )}
      </div>

      {/* Topic Tree and JSON Viewer - Conditional Split View */}
      <div className={cn(
        "grid grid-cols-1 gap-4",
        selectedTopic && "md:grid-cols-2" // Only show 2-column layout when topic is selected
      )}>
        {/* Topic Tree */}
        <div className="border border-gray-200 rounded-lg p-2 max-h-[500px] overflow-y-auto" style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#9ca3af #f3f4f6'
        }}>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading topics...</div>
          ) : filteredTopics.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? `No topics matching "${searchQuery}"` : 'No topics found for this device'}
            </div>
          ) : (
            filteredTopics.map((topic, index) => (
              <TopicNode 
                key={`${topic.name}-${index}`} 
                topic={topic} 
                onTopicSelect={handleTopicSelect}
                selectedTopic={selectedTopic}
              />
            ))
          )}
        </div>

        {/* JSON Message Viewer - Only render when a leaf topic is selected */}
        {selectedTopic && (
          <div className="border border-border rounded-lg p-3 max-h-[500px] overflow-y-auto bg-muted">
            <div>
              <div className="mb-2 pb-2 border-b border-border">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-xs font-semibold text-muted-foreground">Topic:</p>
                  <button
                    onClick={handleCopyTopic}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                    title={copied ? "Copied!" : "Copy topic"}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-green-600" />
                        <span className="text-green-600">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs font-mono text-foreground break-all">{selectedTopic}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Last Message:</p>
                <pre 
                  className="text-xs font-mono text-foreground whitespace-pre-wrap break-words bg-card p-3 rounded border border-border overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: formatJsonMessage(selectedMessage) }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
