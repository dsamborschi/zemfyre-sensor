# Event Timeline Card - Figma Design Implementation

## Summary

Successfully redesigned the `EventTimelineCard` component based on the Figma Timeline design found in `dashboard/src/components/figma/Timeline/src/components/TimelineCard.tsx`.

## Changes Made

### 1. **Visual Design Overhaul**

#### Header Section
- Added icon container with indigo background (`bg-indigo-50`)
- Clock icon in rounded square container
- Improved typography with better spacing
- Event count badge with subtle styling

#### Timeline Structure
- Larger timeline dots (10x10 instead of 8x8)
- Icon-based event indicators instead of category icons
- Event-type specific icons (CheckCircle2, Wifi, WifiOff, Circle, etc.)
- Better visual hierarchy with proper spacing

#### Event Cards
- Clean white cards with border and shadow
- Shadow elevation on hover (`hover:shadow-md`)
- Better internal padding and spacing
- Timestamp display with clock icon
- Event details in collapsible section
- Improved badge styling

### 2. **Color Scheme Updates**

#### Event Type Colors (Figma Pattern)
- **Device Provisioned**: Blue (`blue-50`, `blue-600`, `blue-200`)
- **Device Online**: Green (`green-50`, `green-600`, `green-200`)
- **Device Offline**: Red (`red-50`, `red-600`, `red-200`)
- **Configuration**: Purple (`purple-50`, `purple-600`, `purple-200`)
- **Default**: Gray (`gray-50`, `gray-600`, `gray-200`)

Each color scheme includes:
- `bg`: Background color for icon container
- `text`: Text/icon color
- `border`: Border color for icon container
- `badgeBg`, `badgeText`, `badgeBorder`: Badge styling

### 3. **Enhanced Features**

#### ScrollArea Component
- Replaced fixed height container with Radix UI ScrollArea
- Height set to 500px with smooth scrolling
- Better handling of long event lists

#### Event Details
- `renderEventDetails()` function extracts event-specific information
- Shows device name, IP address, MAC address, OS version for provisioning
- Shows reason, last seen, threshold for offline events
- Shows offline duration for online events
- Details displayed in key-value format with proper styling

#### Timestamp Handling
- `getEventTimestamp()` function with fallback logic:
  1. First tries `event.timestamp` field directly
  2. Falls back to `event.data.provisioned_at`
  3. Falls back to `event.data.detected_at`
  4. Falls back to `event.data.came_online_at`
  5. Falls back to `event.data.last_seen`
- Better date formatting with `formatDate()` function

#### Category Filter Pills
- Rounded corners (`rounded-lg` instead of `rounded-full`)
- Indigo color scheme for active state
- Better padding and spacing
- Event count badges for each category

### 4. **Icon System**

#### Event Type Icons
```typescript
getEventIcon(type) {
  device.provisioned → CheckCircle2
  device.online → Wifi
  device.offline → WifiOff
  container.* → Box
  configuration.updated → Settings
  system.* → Server
  default → Circle
}
```

### 5. **State Improvements**

#### Loading State
- Centered layout with spinning RefreshCw icon
- Better visual feedback

#### Error State
- Icon in colored circle background
- Clear error message
- Prominent retry button with indigo background

#### Empty State
- Info icon in gray circle
- Contextual message based on filter
- Helpful text for user guidance

### 6. **Debug Enhancements**

- Added console log for sample event in `fetchEvents()`
- Collapsible event details section showing:
  - Event ID
  - Correlation ID
  - Raw event data JSON
- Better debugging visibility

## File Structure

```
dashboard/src/components/
├── EventTimelineCard.tsx          (Updated with Figma design)
├── ui/
│   ├── card.tsx                   (Used by timeline)
│   ├── badge.tsx                  (Used by timeline)
│   └── scroll-area.tsx            (New: Added for scrolling)
└── figma/Timeline/src/components/
    └── TimelineCard.tsx           (Reference design)
```

## Database Fix Required

**Important**: The event timestamp issue is caused by PostgreSQL functions returning the wrong column name:

### Issue
- Database function `get_aggregate_events()` was returning column named `event_timestamp`
- Code expects column named `timestamp`

### Fix Applied
Updated `api/database/migrations/006_add_event_sourcing.sql`:
- Changed RETURNS TABLE to include `timestamp` instead of `event_timestamp`
- Added missing columns to return statement (aggregate_type, aggregate_id, correlation_id, etc.)
- Updated both `get_aggregate_events()` and `get_event_chain()` functions

### To Apply Fix
Run the SQL fix script:
```powershell
cd api
Get-Content fix-event-timestamp.sql | docker-compose exec -T postgres psql -U postgres -d iotistic
```

Or use the PowerShell script:
```powershell
cd api
.\apply-timestamp-fix.ps1
```

Then restart the API server.

## Usage

The component interface remains unchanged:

```tsx
<EventTimelineCard
  deviceId="46b68204-9806-43c5-8d19-18b1f53e3b8a"
  limit={50}
  autoRefresh={true}
  refreshInterval={30000}
/>
```

## Design Principles Applied

1. **Consistency**: Follows Figma design patterns for colors, spacing, and layout
2. **Accessibility**: Better color contrast, clear visual hierarchy
3. **Responsiveness**: Mobile-friendly with proper spacing
4. **Progressive Disclosure**: Details hidden by default, expandable on demand
5. **Visual Feedback**: Hover states, transitions, loading indicators
6. **Information Density**: Balanced view with key info visible, details on expansion

## Testing Checklist

- [ ] Timeline displays with proper vertical line
- [ ] Event cards show correct icons based on type
- [ ] Colors match event types (blue for provisioned, green for online, red for offline)
- [ ] Timestamps display correctly after database fix
- [ ] Category filters work properly
- [ ] Auto-refresh indicator shows at bottom
- [ ] ScrollArea handles long lists smoothly
- [ ] Event details expand/collapse properly
- [ ] Loading/error/empty states display correctly
- [ ] Hover effects work on event cards

## Next Steps

1. Apply database timestamp fix
2. Test with real device events
3. Verify timestamp display
4. Consider adding event search/filtering
5. Add event export functionality (future)
6. Add real-time event streaming via WebSocket (future)
