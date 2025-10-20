# Timeline Component Comparison - Complete Guide

## 🎯 What Was Created

I've created **3 different timeline implementations** so you can see the differences:

### 1. **Figma TimelineCard (Original)** ✨
- **Location**: `dashboard/src/components/figma/Timeline/src/components/TimelineCard.tsx`
- **Status**: **UNCHANGED** - Pure Figma design
- **Data**: Static/mock data only
- **Purpose**: Reference design from Figma

### 2. **FigmaTimelineCard (API Wrapper)** 🔌
- **Location**: `dashboard/src/components/FigmaTimelineCard.tsx`
- **Status**: **NEW** - Wrapper component
- **Data**: Fetches from your API (`http://localhost:4002`)
- **Purpose**: Makes Figma component work with real data

### 3. **EventTimelineCard (Custom)** 🎨
- **Location**: `dashboard/src/components/EventTimelineCard.tsx`
- **Status**: **UPDATED** - Custom design attempt
- **Data**: Fetches from your API with extra features
- **Purpose**: Enhanced version with filters

### 4. **TimelineComparison (Demo Page)** 📊
- **Location**: `dashboard/src/components/TimelineComparison.tsx`
- **Status**: **NEW** - Comparison page
- **Purpose**: See all 3 versions side-by-side

---

## 🚀 How to Use

### View the Comparison Page

Add this to your router or import it directly:

```tsx
import { TimelineComparison } from './components/TimelineComparison';

// In your routes or page:
<TimelineComparison />
```

This will show:
- **Left**: Figma design with mock data
- **Middle**: Figma design with API data
- **Right**: Custom design with API data

### Use Individual Components

#### Option 1: Pure Figma (Mock Data)
```tsx
import { TimelineCard } from "./components/figma/Timeline/src/components/TimelineCard";

const mockEvents = [
  {
    id: "1",
    event_id: "uuid-here",
    type: "device.provisioned",
    category: "device",
    title: "Device Provisioned",
    description: "Device was successfully provisioned",
    data: {
      provisioned_at: "2025-10-19T14:30:00Z",
      device_name: "Sensor-001",
    },
    metadata: {},
  },
];

<TimelineCard
  title="Device Timeline"
  description="Mock data demo"
  events={mockEvents}
/>
```

#### Option 2: Figma with API Data
```tsx
import { FigmaTimelineCard } from "./components/FigmaTimelineCard";

<FigmaTimelineCard
  deviceId="46b68204-9806-43c5-8d19-18b1f53e3b8a"
  limit={50}
  autoRefresh={true}
  refreshInterval={30000}
/>
```

#### Option 3: Custom Design
```tsx
import { EventTimelineCard } from "./components/EventTimelineCard";

<EventTimelineCard
  deviceId="46b68204-9806-43c5-8d19-18b1f53e3b8a"
  limit={50}
  autoRefresh={true}
  refreshInterval={30000}
/>
```

---

## 🔍 Key Differences

### Visual Design

| Feature | Figma Original | Custom Design |
|---------|---------------|---------------|
| Header Icon | Indigo clock in rounded box | Indigo clock in rounded box |
| Timeline Dots | 10x10 with event icons | 10x10 with event icons |
| Timeline Line | Left-5, gray-200 | Left-5, gray-200 |
| Event Cards | White, shadow-sm | White, shadow-sm |
| Scroll Height | 400px | 500px |
| Card Spacing | space-y-6 | space-y-6 |

**They look almost identical!** 🎨

### Functional Features

| Feature | Figma (Mock) | Figma (API) | Custom |
|---------|--------------|-------------|--------|
| API Integration | ❌ | ✅ | ✅ |
| Auto Refresh | ❌ | ✅ | ✅ |
| Loading State | ❌ | ✅ | ✅ |
| Error Handling | ❌ | ✅ | ✅ |
| Category Filters | ❌ | ❌ | ✅ |
| Event Details | ✅ | ✅ | ✅ |

---

## 📂 File Structure

```
dashboard/src/components/
├── figma/
│   └── Timeline/
│       └── src/
│           └── components/
│               ├── TimelineCard.tsx          ← Original Figma (UNCHANGED)
│               └── ui/
│                   ├── card.tsx
│                   ├── badge.tsx
│                   └── scroll-area.tsx
│
├── FigmaTimelineCard.tsx                     ← NEW: API wrapper for Figma
├── EventTimelineCard.tsx                     ← UPDATED: Custom design
└── TimelineComparison.tsx                    ← NEW: Comparison page
```

---

## 🎨 Mock Data Structure

The Figma component expects events in this format:

```typescript
interface TimelineEvent {
  id: string;              // String ID
  event_id: string;        // UUID
  type: string;            // "device.provisioned", "device.online", etc.
  category: string;        // "device", "system", etc.
  title: string;           // Display title
  description: string;     // Event description
  data: {                  // Event-specific data
    provisioned_at?: string;
    detected_at?: string;
    came_online_at?: string;
    last_seen?: string;
    device_name?: string;
    ip_address?: string;
    // ... more fields
  };
  metadata: any;           // Additional metadata
}
```

### API to Figma Transformation

The `FigmaTimelineCard` wrapper automatically transforms your API data:

```typescript
// Your API returns:
{
  id: 123,                    // Number
  event_id: "uuid",
  timestamp: "2025-10-19...", // ISO timestamp
  type: "device.provisioned",
  // ...
}

// Wrapper transforms to:
{
  id: "123",                  // String
  event_id: "uuid",
  type: "device.provisioned",
  data: {
    provisioned_at: "2025-10-19...",  // Added to data
    detected_at: "2025-10-19...",
    // ... original data preserved
  }
}
```

---

## 🧪 Testing

### 1. Build Test

```powershell
cd dashboard
npm run build
```

✅ Should build without errors (TypeScript warnings are cosmetic)

### 2. Run Development Server

```powershell
cd dashboard
npm run dev
```

Navigate to your comparison page to see all three versions.

### 3. Check API Connection

Make sure your API is running:

```powershell
cd api
docker-compose up -d
```

API should be available at `http://localhost:4002`

### 4. Test Event Endpoint

```powershell
curl http://localhost:4002/api/v1/events/device/46b68204-9806-43c5-8d19-18b1f53e3b8a?limit=10
```

---

## 🐛 Troubleshooting

### Events Not Loading

**Check Browser Console:**
```
[FigmaTimeline] Fetching events for device: 46b68204-...
[FigmaTimeline] Loaded 10 events
[FigmaTimeline] Sample API event: {...}
[FigmaTimeline] Sample transformed event: {...}
```

**If you see errors:**
1. Verify API is running: `curl http://localhost:4002/api/v1/health`
2. Check CORS settings in API
3. Verify device UUID exists

### Timestamps Not Showing

**Root Cause**: PostgreSQL functions need updating

**Fix:**
```powershell
cd api
Get-Content fix-event-timestamp.sql | docker-compose exec -T postgres psql -U postgres -d iotistic
docker-compose restart api
```

### Figma Component Import Errors

**Error**: `Cannot find module './figma/Timeline/src/components/TimelineCard'`

**Fix**: The Figma folder structure should be:
```
dashboard/src/components/figma/Timeline/src/components/TimelineCard.tsx
```

Make sure all folders exist.

---

## 📊 Visual Comparison

### Header Design

**Both use the same pattern:**
```tsx
<div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
  <Clock className="w-5 h-5 text-indigo-600" />
</div>
```

### Timeline Structure

**Both use the same layout:**
- Left position: `left-5`
- Dot size: `w-10 h-10`
- Card padding left: `pl-12`
- Vertical line: `w-0.5 bg-gray-200`

### Event Cards

**Both use:**
- White background
- Border: `border-gray-200`
- Shadow: `shadow-sm hover:shadow-md`
- Rounded: `rounded-lg`

---

## 🎯 Which One Should You Use?

### Use **Figma (Mock)** if:
- You want to showcase the design without backend
- Creating a static demo
- Testing UI without API

### Use **Figma (API)** if:
- You want the exact Figma design with live data
- No need for filters or extra features
- Keep it simple and clean

### Use **Custom Design** if:
- You need category filtering
- Want to extend functionality
- Need custom modifications

---

## 📝 Summary

✅ **Created 3 timeline implementations**
✅ **Figma component unchanged** (pure reference)
✅ **API wrapper for Figma component** (makes it work with your data)
✅ **Comparison page** (see all versions side-by-side)
✅ **All components build successfully**
✅ **Mock data included** for testing

**Next Steps:**
1. Add `<TimelineComparison />` to your routes
2. View all 3 versions side-by-side
3. Choose which design you prefer
4. Apply the database timestamp fix if needed

Enjoy comparing the designs! 🚀
