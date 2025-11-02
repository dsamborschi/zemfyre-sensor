import { useState, useRef, useEffect } from "react";
import { Copy, Check } from "lucide-react";

interface MqttMessageViewerProps {
  selectedTopic: string;
  selectedMessage: string;
}

export function MqttMessageViewer({ selectedTopic, selectedMessage }: MqttMessageViewerProps) {
  const [copied, setCopied] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when message changes
  useEffect(() => {
    if (messageRef.current) {
      messageRef.current.scrollTop = messageRef.current.scrollHeight;
    }
  }, [selectedMessage]);

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

  // Try to parse and format JSON
  const formatJsonMessage = (message: string) => {
    try {
      const parsed = JSON.parse(message);
      const formatted = JSON.stringify(parsed, null, 2);
      
      // Add syntax highlighting with theme-aware colors
      return formatted
        .replace(/(".*?"):/g, '<span class="text-blue-600 dark:text-blue-400 font-medium">$1</span>:')  // Keys
        .replace(/: (".*?")/g, ': <span class="text-green-600 dark:text-green-400">$1</span>')  // String values
        .replace(/: (true|false)/g, ': <span class="text-purple-600 dark:text-purple-400 font-semibold">$1</span>')  // Booleans
        .replace(/: (null)/g, ': <span class="text-muted-foreground italic">$1</span>')  // Null
        .replace(/: (-?\d+\.?\d*)/g, ': <span class="text-orange-600 dark:text-orange-400">$1</span>');  // Numbers
    } catch (e) {
      return message; // Return as-is if not valid JSON
    }
  };

  return (
    <div className="border border-border rounded-lg p-4 bg-muted">
      <div className="mb-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-xs font-semibold text-muted-foreground">Topic:</p>
          <button
            onClick={handleCopyTopic}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10 rounded transition-colors"
            title={copied ? "Copied!" : "Copy topic"}
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                <span className="text-green-600 dark:text-green-400">Copied!</span>
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
      
      <div className="mb-2">
        <p className="text-xs font-semibold text-muted-foreground">Last Message:</p>
      </div>
      
      <div
        ref={messageRef}
        className="bg-card rounded p-3 font-mono text-xs overflow-auto border border-border"
        style={{ 
          height: '500px',
          scrollbarWidth: 'thin',
          scrollbarColor: 'hsl(var(--muted-foreground)) hsl(var(--muted))'
        }}
      >
        <pre 
          className="text-foreground whitespace-pre-wrap break-words"
          dangerouslySetInnerHTML={{ __html: formatJsonMessage(selectedMessage) }}
        />
      </div>
    </div>
  );
}
