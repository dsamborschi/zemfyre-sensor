# Multi-Device Management Feature

This document describes the multi-device management system that allows you to control multiple Zemfyre sensor devices from a single admin interface.

## Architecture Overview

The multi-device management system consists of:

1. **Device Types** (`src/data/types/device.ts`) - TypeScript interfaces for device management
2. **Device Store** (`src/stores/devices.ts`) - Pinia store for device state management
3. **Device Sidebar** (`src/components/sidebar/DeviceSidebar.vue`) - UI component for device switching
4. **Dynamic API URLs** (`src/services/application-manager-api.ts`) - Support for switching API endpoints
5. **Integrated Layout** (`src/layouts/AppLayout.vue`) - Device sidebar in main layout
6. **Navbar Toggle** (`src/components/navbar/components/AppNavbarActions.vue`) - Button to show/hide devices

## Features

### 1. Device Management
- **Add Device**: Add new devices with hostname, port, protocol, location, and description
- **Remove Device**: Delete devices from the list
- **View Devices**: See all registered devices with their status
- **Switch Devices**: Click on a device to make it active

### 2. Device Status
- **Online/Offline Detection**: Automatically tests device connections
- **Status Badges**: Visual indicators for device status (online/offline/unknown)
- **Last Seen**: Timestamp of last successful connection
- **Refresh Status**: Manual refresh button to update all device statuses

### 3. Persistence
- **LocalStorage**: Devices are saved in browser localStorage
- **Keys Used**:
  - `iotistic_devices` - Array of all devices
  - `iotistic_active_device` - ID of currently active device
- **Auto-initialization**: Creates default localhost device if none exist

### 4. Device Statistics
- Total Devices count
- Online Devices count
- Offline Devices count
- Last Sync Time

## User Interface

### Device Sidebar (Right Side)
- **Location**: Fixed right sidebar (collapsible on mobile)
- **Toggle**: "Devices" button in navbar
- **Sections**:
  - Stats cards (Total devices, Online devices)
  - Device list with status badges
  - Add device button
  - Refresh all devices button

### Add Device Dialog
Form fields:
- **Device Name** (required) - Display name for the device
- **Hostname** (required) - IP address or hostname
- **Port** (optional, default: 3002) - API port
- **Protocol** (optional, default: http) - http or https
- **Location** (optional) - Physical location
- **Description** (optional) - Additional notes

### Device Cards
Each device shows:
- Device name
- Hostname and API URL
- Status badge (online/offline/unknown)
- Location (if set)
- Remove button
- Active indicator (blue border)

## Technical Implementation

### Device Store Actions

```typescript
// Initialize devices from localStorage
await devicesStore.initialize()

// Add a new device
await devicesStore.addDevice({
  name: 'Raspberry Pi 1',
  hostname: '192.168.1.100',
  port: 3002,
  protocol: 'http',
  location: 'Living Room'
})

// Set active device
devicesStore.setActiveDevice('device-id')

// Refresh device status
await devicesStore.refreshDeviceStatus('device-id')

// Remove device
devicesStore.removeDevice('device-id')
```

### API URL Switching

When you switch devices, the API URL is automatically updated:

```typescript
// In application-manager store
watch(
  () => devicesStore.activeDeviceApiUrl,
  (newApiUrl) => {
    if (newApiUrl) {
      setApiUrl(newApiUrl) // Update API endpoint
      this.refresh() // Reload data from new device
    }
  }
)
```

### Connection Testing

Devices are tested by attempting to fetch `/status` endpoint with 5-second timeout:

```typescript
const response = await fetch(`${device.apiUrl}/status`, {
  signal: AbortSignal.timeout(5000)
})
```

## Usage Examples

### Adding a New Device

1. Click "Devices" button in navbar to open sidebar
2. Click "Add Device" button
3. Fill in device details:
   - Name: "Raspberry Pi - Kitchen"
   - Hostname: "192.168.1.50"
   - Port: 3002
   - Location: "Kitchen"
4. Click "Add Device"
5. Device appears in list with status check in progress

### Switching Between Devices

1. Open device sidebar (click "Devices" in navbar)
2. Click on any device card
3. Active device changes (blue border indicator)
4. Applications and metrics refresh from new device
5. All API calls now go to the new device

### Removing a Device

1. Open device sidebar
2. Click trash icon on device card
3. Confirm removal
4. Device is deleted from list and localStorage

## Environment Variables

```bash
# .env file
VITE_APP_MANAGER_API=http://localhost:3002/api/v1  # Default API URL
VITE_USE_MOCK_DATA=false  # Use real API data
```

## Data Models

### Device Interface
```typescript
interface Device {
  id: string                    // Unique identifier (UUID)
  name: string                  // Display name
  hostname: string              // IP or hostname
  apiUrl: string                // Full API URL
  status: 'online' | 'offline' | 'unknown'
  lastSeen?: string             // ISO timestamp
  deviceType?: string           // e.g., "Raspberry Pi 4"
  location?: string             // Physical location
  description?: string          // Notes
  isDefault?: boolean           // Is default device
  createdAt: string             // ISO timestamp
  updatedAt?: string            // ISO timestamp
}
```

### DeviceConnectionTest Interface
```typescript
interface DeviceConnectionTest {
  success: boolean
  latency?: number              // Response time in ms
  error?: string                // Error message if failed
  version?: string              // API version from response
}
```

## File Structure

```
admin/src/
├── data/types/
│   └── device.ts                          # Device interfaces
├── stores/
│   ├── devices.ts                         # Device management store
│   ├── application-manager.ts             # Updated with device switching
│   └── global-store.ts                    # Added device sidebar toggle
├── services/
│   └── application-manager-api.ts         # Dynamic API URL support
├── components/
│   ├── sidebar/
│   │   └── DeviceSidebar.vue             # Device management UI
│   └── navbar/components/
│       └── AppNavbarActions.vue          # Added devices toggle button
└── layouts/
    └── AppLayout.vue                      # Integrated device sidebar
```

## Mobile Responsiveness

- **Desktop**: Device sidebar always visible on right side
- **Tablet/Mobile**: Device sidebar as overlay (hidden by default)
- **Toggle**: "Devices" button in navbar works on all screen sizes
- **Touch-friendly**: Large tap targets, easy scrolling

## Best Practices

1. **Always test connection** after adding a device
2. **Use static IPs** or hostnames for reliable connections
3. **Label devices clearly** with location or purpose
4. **Refresh status** if connection seems stale
5. **Remove unused devices** to keep list clean
6. **Default device**: First device added becomes default

## Troubleshooting

### Device shows offline but is running
- Click refresh button to re-test connection
- Verify hostname and port are correct
- Check network connectivity
- Ensure Application Manager API is running on device

### Can't switch devices
- Check device status is online
- Verify API URL is accessible
- Check browser console for errors
- Try refreshing the page

### Device not saving
- Check browser localStorage is enabled
- Clear localStorage and re-add device
- Check for JavaScript errors in console

### API calls failing after switch
- Verify new device API is running
- Check CORS settings on device
- Ensure port is not blocked by firewall

## Future Enhancements

- [ ] Device grouping/tagging
- [ ] Bulk operations (update all, restart all)
- [ ] Device health monitoring dashboard
- [ ] Automatic device discovery (mDNS/Bonjour)
- [ ] Device synchronization (copy config between devices)
- [ ] Historical device metrics
- [ ] Alert notifications per device
- [ ] Device backup/restore

## API Endpoints Used

All device API calls use the Application Manager REST API:

- `GET /status` - Test device connection
- `GET /device` - Get device information
- `GET /apps` - Get applications
- `GET /metrics` - Get system metrics
- (All other Application Manager endpoints)

See `application-manager/README.md` for complete API documentation.
