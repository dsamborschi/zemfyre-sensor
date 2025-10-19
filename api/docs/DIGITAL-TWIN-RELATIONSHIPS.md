# 🏢 Digital Twin with Relationships - Complete Implementation Guide

## Overview

This implementation extends the Zemfyre IoT Digital Twin API with **full entity-relationship graph capabilities**. You can now model buildings, floors, rooms, zones, and their relationships to devices - creating a **true digital twin** with hierarchies, dependencies, and graph queries.

---

## 🎯 What's New

### Before (Device Shadows Only):
```
Device A (isolated) ← Just state storage
Device B (isolated) ← No relationships
Device C (isolated) ← No context
```

### After (Complete Digital Twin):
```
Building HQ
  ├─ Floor 1
  │   ├─ Server Room
  │   │   ├─ Temperature Sensor (Device A)
  │   │   └─ Humidity Sensor (Device B)
  │   └─ Office 101
  │       └─ Air Quality Sensor (Device C)
  └─ Floor 2
      └─ Conference Room
          └─ Occupancy Sensor (Device D)
```

---

## 📦 Database Schema

### New Tables

#### **1. entity_types** - Define entity categories
```sql
CREATE TABLE entity_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE,      -- 'building', 'floor', 'room', etc.
  display_name VARCHAR(100),
  icon VARCHAR(50),
  properties_schema JSONB,
  description TEXT
);
```

**Seeded Types:**
- `building` - Physical buildings
- `floor` - Floors within buildings
- `room` - Rooms or spaces
- `zone` - Logical groupings
- `device` - IoT devices (linked to device_shadows)
- `equipment` - HVAC, lighting, etc.
- `gateway` - Network gateways

#### **2. entities** - Universal entity storage
```sql
CREATE TABLE entities (
  id UUID PRIMARY KEY,
  entity_type VARCHAR(50),      -- References entity_types.name
  name VARCHAR(255),
  description TEXT,
  metadata JSONB,               -- Flexible properties
  device_uuid UUID,             -- Links to device_shadows (if device)
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

#### **3. entity_relationships** - The graph structure
```sql
CREATE TABLE entity_relationships (
  id UUID PRIMARY KEY,
  source_entity_id UUID,        -- "From" entity
  target_entity_id UUID,        -- "To" entity
  relationship_type VARCHAR(50), -- Type of relationship
  metadata JSONB,               -- Relationship-specific data
  created_at TIMESTAMPTZ
);
```

**Relationship Types:**
- `CONTAINS` - Building contains floor, floor contains room
- `DEPENDS_ON` - Device depends on gateway
- `MONITORS` - Sensor monitors equipment
- `CONTROLS` - Controller controls HVAC
- `CONNECTED_TO` - Network connections
- `CORRELATED_WITH` - Statistical correlation
- `LOCATED_IN` - Physical location

#### **4. entity_properties** - Flexible key-value storage
```sql
CREATE TABLE entity_properties (
  id UUID PRIMARY KEY,
  entity_id UUID,
  property_key VARCHAR(100),
  property_value JSONB,
  updated_at TIMESTAMPTZ
);
```

### Database Views

#### **entity_hierarchy** - Recursive hierarchy view
Shows all entities with their depth and path from root.

#### **device_locations** - Device location mapping
Joins devices with their building/floor/room locations.

---

## 🚀 API Endpoints

### Entities (`/api/v1/entities`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/entities` | Create entity |
| GET | `/api/v1/entities` | List entities (with filters) |
| GET | `/api/v1/entities/search?q=<term>` | Search entities |
| GET | `/api/v1/entities/types` | Get entity types |
| GET | `/api/v1/entities/stats` | Get entity statistics |
| GET | `/api/v1/entities/:id` | Get entity by ID |
| PUT | `/api/v1/entities/:id` | Update entity |
| DELETE | `/api/v1/entities/:id` | Delete entity |
| POST | `/api/v1/entities/:id/link-device` | Link device to entity |
| GET | `/api/v1/entities/:id/properties` | Get entity properties |
| PUT | `/api/v1/entities/:id/properties/:key` | Set property |

### Relationships (`/api/v1/relationships`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/relationships` | Create relationship |
| GET | `/api/v1/relationships` | List relationships |
| GET | `/api/v1/relationships/:id` | Get relationship |
| DELETE | `/api/v1/relationships/:id` | Delete relationship |
| GET | `/api/v1/relationships/:id/children` | Get direct children |
| GET | `/api/v1/relationships/:id/parent` | Get parent |
| GET | `/api/v1/relationships/:id/descendants` | Get all descendants |
| GET | `/api/v1/relationships/:id/ancestors` | Get ancestors |
| GET | `/api/v1/relationships/:id/tree` | Get hierarchy tree |
| GET | `/api/v1/relationships/:id/dependents` | Get dependent entities |
| GET | `/api/v1/relationships/:id/dependencies` | Get dependencies |
| GET | `/api/v1/relationships/:id/related?type=<type>` | Get related by type |
| GET | `/api/v1/relationships/path/:fromId/:toId` | Find path |

### Graph Queries (`/api/v1/graph`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/graph/topology` | Complete graph for visualization |
| GET | `/api/v1/graph/tree/:id` | Hierarchy tree |
| GET | `/api/v1/graph/impact/:id` | Impact analysis |
| GET | `/api/v1/graph/metrics/:id` | Aggregate metrics |
| GET | `/api/v1/graph/building/:id/status` | Building status |
| GET | `/api/v1/graph/device-locations` | All device locations |
| GET | `/api/v1/graph/correlated/:deviceUuid` | Correlated devices |
| GET | `/api/v1/graph/statistics` | Graph statistics |
| GET | `/api/v1/graph/orphaned` | Orphaned entities |

---

## 📝 Usage Examples

### 1. Create a Building Hierarchy

```bash
# Create building
curl -X POST http://localhost:4002/api/v1/entities \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "building",
    "name": "Headquarters",
    "metadata": {
      "address": "123 Main St",
      "floors": 5
    }
  }'
# Response: { "success": true, "data": { "id": "building-uuid-1", ... } }

# Create floor
curl -X POST http://localhost:4002/api/v1/entities \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "floor",
    "name": "Floor 1",
    "metadata": {
      "level": 1,
      "area": "2500 sqft"
    }
  }'
# Response: { "success": true, "data": { "id": "floor-uuid-1", ... } }

# Create relationship (building CONTAINS floor)
curl -X POST http://localhost:4002/api/v1/relationships \
  -H "Content-Type: application/json" \
  -d '{
    "source_entity_id": "building-uuid-1",
    "target_entity_id": "floor-uuid-1",
    "relationship_type": "CONTAINS"
  }'
```

### 2. Link Existing Device to Room

```bash
# Create room
curl -X POST http://localhost:4002/api/v1/entities \
  -H "Content-Type": application/json" \
  -d '{
    "entity_type": "room",
    "name": "Server Room",
    "metadata": {
      "number": "101",
      "purpose": "IT Infrastructure"
    }
  }'
# Response: { "id": "room-uuid-1" }

# Create device entity linked to existing shadow
curl -X POST http://localhost:4002/api/v1/entities \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "device",
    "name": "Temperature Sensor A",
    "device_uuid": "46b68204-9806-43c5-8d19-18b1f53e3b8a",
    "metadata": {
      "location": "Rack 3"
    }
  }'
# Response: { "id": "device-uuid-1" }

# Link room CONTAINS device
curl -X POST http://localhost:4002/api/v1/relationships \
  -H "Content-Type: application/json" \
  -d '{
    "source_entity_id": "room-uuid-1",
    "target_entity_id": "device-uuid-1",
    "relationship_type": "CONTAINS"
  }'
```

### 3. Query Hierarchy

```bash
# Get building with full tree
curl http://localhost:4002/api/v1/graph/tree/building-uuid-1

# Response:
{
  "success": true,
  "data": {
    "root": { "id": "building-uuid-1", "name": "Headquarters" },
    "tree": {
      "id": "building-uuid-1",
      "name": "Headquarters",
      "depth": 0,
      "children": [
        {
          "id": "floor-uuid-1",
          "name": "Floor 1",
          "depth": 1,
          "children": [
            {
              "id": "room-uuid-1",
              "name": "Server Room",
              "depth": 2,
              "children": [...]
            }
          ]
        }
      ]
    },
    "total_descendants": 25,
    "max_depth": 3
  }
}
```

### 4. Get Building Status (Aggregate Metrics)

```bash
# Get all devices in building with metrics
curl http://localhost:4002/api/v1/graph/building/building-uuid-1/status

# Response:
{
  "success": true,
  "data": {
    "entity": { "id": "...", "name": "Headquarters" },
    "device_count": 45,
    "online_devices": 42,
    "offline_devices": 3,
    "avg_metrics": {
      "temperature": 22.5,
      "humidity": 45.2,
      "cpu_usage": 35.8
    },
    "health_score": 93,
    "floors": [
      {
        "entity": { "name": "Floor 1" },
        "device_count": 15,
        "online_devices": 14,
        "rooms": [...]
      }
    ]
  }
}
```

### 5. Impact Analysis

```bash
# What happens if gateway fails?
curl http://localhost:4002/api/v1/graph/impact/gateway-uuid-1

# Response:
{
  "success": true,
  "data": {
    "entity": { "id": "...", "name": "Gateway A" },
    "impacted": [
      {
        "entity": { "name": "Sensor 1" },
        "relationship_path": ["gateway-uuid-1", "sensor-uuid-1"],
        "severity": "critical"
      },
      {
        "entity": { "name": "Sensor 2" },
        "severity": "high"
      }
    ],
    "affected_count": 12
  }
}
```

### 6. Find Correlated Devices

```bash
# Find devices in same room (for correlation analysis)
curl http://localhost:4002/api/v1/graph/correlated/46b68204-9806-43c5-8d19-18b1f53e3b8a

# Response:
{
  "success": true,
  "data": [
    "device-uuid-2",
    "device-uuid-3"
  ],
  "count": 2
}
```

### 7. Get Graph Topology (for Visualization)

```bash
# Get complete graph
curl http://localhost:4002/api/v1/graph/topology

# Response (ready for D3.js, Cytoscape, etc.):
{
  "success": true,
  "data": {
    "nodes": [
      { "id": "1", "label": "HQ", "type": "building" },
      { "id": "2", "label": "Floor 1", "type": "floor" },
      { "id": "3", "label": "Device X", "type": "device", "device_uuid": "..." }
    ],
    "edges": [
      { "id": "e1", "source": "1", "target": "2", "type": "CONTAINS" },
      { "id": "e2", "source": "2", "target": "3", "type": "CONTAINS" }
    ]
  },
  "node_count": 50,
  "edge_count": 49
}
```

---

## 🔧 Running the Migration

### 1. Apply Migration

```bash
cd api
npx knex migrate:latest
```

**Output:**
```
Batch 1 run: 1 migrations
003_create_entity_tables.ts
✅ Entity tables created successfully
✅ Seeded 7 default entity types
✅ Created 2 helper views
```

### 2. Verify Tables

```bash
psql -U postgres -d iotistic -c "\dt"
```

**Should show:**
- `entities`
- `entity_types`
- `entity_relationships`
- `entity_properties`

---

## 🧪 Testing

See `test-entities.ps1` for complete test suite.

Quick test:
```powershell
# Create test entity
curl -X POST http://localhost:4002/api/v1/entities `
  -H "Content-Type: application/json" `
  -d '{"entity_type":"building","name":"Test Building"}'

# List all entities
curl http://localhost:4002/api/v1/entities

# Get statistics
curl http://localhost:4002/api/v1/graph/statistics
```

---

## 📊 Integration with Existing Features

### Digital Twin API (Existing)
```
GET /api/v1/digital-twin/device/:uuid
GET /api/v1/digital-twin/fleet/health
GET /api/v1/digital-twin/alerts
```

### Entity/Graph API (New)
```
GET /api/v1/entities
GET /api/v1/relationships
GET /api/v1/graph/topology
```

**Both APIs work together!** Devices in `device_shadows` can be linked to entities via `device_uuid` field.

---

## 🎨 Dashboard Integration

### Example: Building Dashboard

```typescript
// Fetch building hierarchy
const buildingStatus = await fetch(
  `http://localhost:4002/api/v1/graph/building/${buildingId}/status`
).then(r => r.json());

// Display metrics
console.log(`Building: ${buildingStatus.data.entity.name}`);
console.log(`Devices: ${buildingStatus.data.device_count}`);
console.log(`Online: ${buildingStatus.data.online_devices}`);
console.log(`Health Score: ${buildingStatus.data.health_score}%`);

// Display per-floor
buildingStatus.data.floors.forEach(floor => {
  console.log(`  Floor: ${floor.entity.name}`);
  console.log(`  Devices: ${floor.device_count} (${floor.online_devices} online)`);
});
```

### Example: Graph Visualization

```typescript
// Fetch topology
const topology = await fetch(
  'http://localhost:4002/api/v1/graph/topology'
).then(r => r.json());

// Use with D3.js or Cytoscape
const graph = {
  nodes: topology.data.nodes,
  edges: topology.data.edges
};

// Render with your favorite graph library
renderGraph(graph);
```

---

## 🚀 Next Steps

1. **Run Migration**: `npx knex migrate:latest`
2. **Start API**: `npm run dev`
3. **Create Test Hierarchy**: Use test script
4. **Query Relationships**: Try graph endpoints
5. **Integrate with Dashboard**: Use topology/metrics endpoints

---

## 📚 See Also

- `ENTITY-API-REFERENCE.md` - Complete API documentation
- `test-entities.ps1` - PowerShell test script
- `ML-SERVICE-COMPLETE.md` - ML integration guide

---

## 🎉 Summary

You now have a **complete digital twin** with:
- ✅ Entity modeling (buildings, floors, rooms, devices)
- ✅ Relationship graph (CONTAINS, DEPENDS_ON, etc.)
- ✅ Hierarchical queries (tree, descendants, ancestors)
- ✅ Impact analysis (what fails if X fails?)
- ✅ Aggregate metrics (roll up from children)
- ✅ Graph visualization (topology endpoints)
- ✅ Device location mapping
- ✅ Correlation discovery

**This is a TRUE digital twin - not just device shadows!** 🏆
