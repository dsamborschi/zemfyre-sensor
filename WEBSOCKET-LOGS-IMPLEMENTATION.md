# WebSocket Log Streaming Implementation

## Overview
Implemented real-time log streaming using WebSocket connections instead of HTTP polling for the ContainerLogsCard component.

## Changes Made

### Backend (API)

#### 1. Updated `api/src/services/websocket-manager.ts`

**Added Imports:**
```typescript
import { DeviceLogsModel } from '../db/models';
```

**Enhanced Interfaces:**
```typescript
interface WebSocketClient {
  serviceName?: string; // For logs channel - which service to stream logs for
}

interface WebSocketMessage {
  serviceName?: string; // For logs channel - which service to filter logs by
}
```

**Added Logs Channel Support:**
- Added `'logs'` case in `startDataStream()` with 2-second interval
- Modified `handleMessage()` to capture `serviceName` for logs subscriptions
- Updated `sendChannelData()` to handle logs differently:
  - Sends logs individually to each client based on their `serviceName` filter
  - Other channels still broadcast to all subscribers

**New Method:**
```typescript
private async fetchLogs(deviceUuid: string, serviceName?: string): Promise<any>
```
- Fetches latest 50 log entries per poll
- Filters by serviceName if provided
- Returns logs in format expected by dashboard

### Frontend (Dashboard)

#### 2. Updated `dashboard/src/components/ContainerLogsCard.tsx`

**Removed:**
- HTTP polling with `setInterval(fetchLogs, 5000)`
- `fetchLogs()` function
- `buildApiUrl` import (no longer needed)

**Added:**
- WebSocket connection with automatic reconnection
- `wsRef` to track WebSocket connection
- `handleRefresh()` to manually clear and refresh logs
- Real-time log streaming with automatic deduplication

**WebSocket Connection:**
```typescript
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = window.location.hostname;
const wsPort = import.meta.env.VITE_API_PORT || '4002';
const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}/ws?deviceUuid=${deviceUuid}`;
```

**Subscription Message:**
```typescript
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'logs',
  serviceName: selectedContainer,
}));
```

**Log Handling:**
- Appends new logs to existing array
- Removes duplicates by ID/timestamp
- Keeps last 200 logs
- Auto-scrolls to bottom when enabled

## How It Works

### Flow:

1. **User selects container** from dropdown
2. **WebSocket connects** to `/ws?deviceUuid=<uuid>`
3. **Subscribe message** sent with `channel: 'logs'` and `serviceName: <container>`
4. **Backend starts streaming** logs every 2 seconds
5. **Frontend receives** log updates in real-time
6. **Logs displayed** with auto-scroll and color coding
7. **On unmount/change** - unsubscribe and close connection

### Benefits:

✅ **Real-time updates** - Logs appear instantly (2-second refresh)
✅ **Lower server load** - No repeated HTTP requests
✅ **Bidirectional** - Can add commands/filtering later
✅ **Scalable** - Handles multiple clients efficiently
✅ **Consistent architecture** - Uses same WebSocket pattern as metrics/system-info

## Testing

### Test the Implementation:

1. Start API server:
```bash
cd api
npm run dev
```

2. Start dashboard:
```bash
cd dashboard
npm run dev
```

3. Navigate to device page and open Applications tab
4. Select a container from the logs dropdown
5. Watch logs stream in real-time
6. Try switching containers - should reconnect automatically
7. Check browser console for WebSocket connection logs

### Expected Console Output:

**Frontend:**
```
[ContainerLogs] Connecting to WebSocket: ws://localhost:4002/ws?deviceUuid=...
[ContainerLogs] WebSocket connected
[ContainerLogs] Connection acknowledged
[ContainerLogs] Received logs: 50
```

**Backend:**
```
[WebSocket] Client connected for device: <uuid>
[WebSocket] Client subscribed to logs for device <uuid>
[WebSocket] Started logs stream for device <uuid> (interval: 2000ms)
[WebSocket] Fetched 50 log entries for device <uuid> service <name>
```

## Configuration

### Adjustable Parameters:

**Backend (`websocket-manager.ts`):**
- Log fetch limit: `limit: 50` (line ~695)
- Streaming interval: `intervalTime = 2000` (line ~338)

**Frontend (`ContainerLogsCard.tsx`):**
- Max logs kept: `.slice(-200)` (line ~117)
- WebSocket port: `VITE_API_PORT` env var

## Troubleshooting

### WebSocket won't connect:
- Check API server is running on correct port (4002)
- Verify WebSocket upgrade is working: `curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://localhost:4002/ws?deviceUuid=test`

### Logs not appearing:
- Check browser console for errors
- Verify `DeviceLogsModel.get()` returns data
- Check backend logs for "[WebSocket] Fetched X log entries"

### Duplicate logs:
- Deduplication should handle this automatically
- Check if multiple WebSocket connections are open

### Memory issues:
- Adjust `.slice(-200)` to keep fewer logs
- Reduce fetch limit from 50 to 25

## Future Enhancements

### Potential Improvements:
1. **Incremental fetching** - Only fetch logs newer than last timestamp
2. **Log filtering** - Filter by log level (ERROR, WARN, INFO)
3. **Search functionality** - Search through logs in real-time
4. **Pause/resume** - Pause streaming without disconnecting
5. **Download filtered** - Download only filtered/visible logs
6. **Tail mode** - Follow mode like `tail -f`
7. **Multi-container view** - View logs from multiple containers simultaneously

## Related Files

- `api/src/services/websocket-manager.ts` - WebSocket server implementation
- `dashboard/src/components/ContainerLogsCard.tsx` - Log viewer UI
- `api/src/db/models/device-logs.ts` - Database model for logs
- `api/src/routes/device-state.ts` - HTTP endpoint (kept for fallback)

## Notes

- WebSocket connection automatically reconnects on container change
- Old HTTP polling endpoint still available at `/api/v1/devices/:uuid/logs`
- Works with existing database schema (no migrations needed)
- Compatible with both light and dark themes
