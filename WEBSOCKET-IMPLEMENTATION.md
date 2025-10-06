# WebSocket Real-Time Updates Implementation Plan

## Overview
Replace polling-based metric updates with WebSocket real-time updates for better performance and lower latency.

## Current State
- **Backend**: Express REST API on port 3002
- **Frontend**: Polling every 10 seconds using `setInterval`
- **Data**: System metrics (CPU, memory, storage, processes, network interfaces)

## Implementation Steps

### 1. Backend Changes (application-manager)

#### A. Install Dependencies
```bash
cd application-manager
npm install ws @types/ws
```

#### B. Create WebSocket Manager (`src/websocket-manager.ts`)
- Attach WebSocket server to Express HTTP server
- Broadcast metrics to all connected clients
- Handle client connections/disconnections
- Periodic metrics emission (5s interval)

#### C. Update API Server (`src/api/server.ts`)
- Import WebSocket manager
- Initialize WebSocket server after Express server starts
- Start metrics broadcasting

#### D. Add WebSocket Endpoint
```
ws://localhost:3002/ws/metrics
```

### 2. Frontend Changes (admin)

#### A. Create WebSocket Composable (`src/composables/useWebSocket.ts`)
- WebSocket connection management
- Auto-reconnection on disconnect
- Typed message handling
- Connection status tracking

#### B. Create Metrics WebSocket Service (`src/services/metrics-websocket.ts`)
- Connect to WebSocket endpoint
- Parse and emit typed metrics updates
- Fallback to polling if WebSocket fails
- Reconnection logic with exponential backoff

#### C. Update DevicesPage (`src/pages/devices/DevicesPage.vue`)
- Replace `setInterval` polling with WebSocket subscription
- Keep polling as fallback
- Add connection status indicator
- Handle WebSocket events

#### D. Update Devices Store (`src/stores/devices.ts`)
- Add WebSocket update handler
- Support both polling and WebSocket updates
- Merge updates efficiently

### 3. Message Protocol

#### Client → Server
```typescript
{
  type: 'subscribe' | 'unsubscribe',
  channel: 'metrics'
}
```

#### Server → Client
```typescript
{
  type: 'metrics',
  data: SystemMetrics,
  timestamp: string
}

// Or error
{
  type: 'error',
  message: string
}
```

### 4. Features

#### Backend
- ✅ WebSocket server on `/ws/metrics`
- ✅ Broadcast metrics every 5 seconds
- ✅ Client connection tracking
- ✅ Graceful shutdown handling
- ✅ Error handling and logging

#### Frontend
- ✅ WebSocket connection with auto-reconnect
- ✅ Typed message handling
- ✅ Connection status indicator
- ✅ Fallback to polling if WS fails
- ✅ Exponential backoff on reconnect
- ✅ Clean disconnect on page unmount

### 5. Testing

#### Manual Testing
1. Start application-manager: `cd application-manager && npm run dev`
2. Start admin frontend: `cd admin && npm run dev`
3. Open DevicesPage and verify real-time updates
4. Check browser console for WebSocket messages
5. Stop/start backend to test reconnection
6. Monitor network tab for WebSocket frames

#### Test Scenarios
- ✅ Normal operation: Metrics update in real-time
- ✅ Backend restart: Auto-reconnection works
- ✅ Page visibility: Pause/resume on tab switch
- ✅ Network error: Fallback to polling
- ✅ Multiple clients: All receive broadcasts

### 6. Configuration

#### Environment Variables
```bash
# Backend (application-manager)
WS_METRICS_INTERVAL=5000  # Metrics broadcast interval (ms)
WS_ENABLED=true           # Enable WebSocket server

# Frontend (admin)
VITE_WS_URL=ws://localhost:3002  # WebSocket server URL
VITE_ENABLE_WS=true              # Enable WebSocket client
```

### 7. Benefits

#### Performance
- 🚀 **Lower Latency**: <100ms vs 10s polling interval
- 📉 **Reduced Load**: Server pushes updates vs client polling
- 💾 **Less Bandwidth**: Only send data when changed

#### User Experience
- ⚡ **Real-time Updates**: Instant metric changes
- 🔌 **Connection Status**: Visual feedback on connection state
- 🔄 **Auto-recovery**: Seamless reconnection on failure

### 8. Rollback Plan

If WebSocket causes issues:
1. Set `VITE_ENABLE_WS=false` in frontend `.env`
2. Frontend automatically falls back to polling
3. Backend WebSocket server is harmless if not used

### 9. File Structure

```
application-manager/
  src/
    websocket-manager.ts        [NEW] WebSocket server
    api/server.ts               [MODIFIED] Initialize WS

admin/
  src/
    composables/
      useWebSocket.ts           [NEW] WebSocket composable
    services/
      metrics-websocket.ts      [NEW] Metrics WS client
    stores/
      devices.ts                [MODIFIED] Handle WS updates
    pages/
      devices/
        DevicesPage.vue         [MODIFIED] Use WS instead of polling
```

### 10. Next Steps

1. **Install `ws` package** in application-manager
2. **Create `websocket-manager.ts`** with metrics broadcasting
3. **Update `server.ts`** to initialize WebSocket
4. **Create frontend composable** for WebSocket connection
5. **Create metrics service** for typed message handling
6. **Update DevicesPage** to use WebSocket
7. **Test end-to-end** with backend and frontend running

---

## Implementation Ready ✅

All design decisions are documented. Ready to implement when you give the go-ahead!
