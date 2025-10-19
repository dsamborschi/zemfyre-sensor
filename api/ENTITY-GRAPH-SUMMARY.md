# Entity-Relationship Summary

## Current Graph Structure

**Total Entities:** 8
**Total Relationships:** 6

### Hierarchy View
```
Smart Office HQ (Building)
├─ Ground Floor
│  ├─ Conference Room 101
│  └─ Server Room 102 ──[DEPENDS_ON]──> HVAC Unit A1
└─ Second Floor
   └─ Engineering Lab 201

HQ Building (Building)
└─ (no children)

HVAC Unit A1 (Equipment)
└─ (standalone equipment)
```

### Relationship Types in Use

| Type | Count | Example |
|------|-------|---------|
| CONTAINS | 5 | Building contains Floors, Floors contain Rooms |
| DEPENDS_ON | 1 | Server Room depends on HVAC |

### Available Relationship Types (Not Yet Used)

- **MONITORS** - Equipment monitors devices (e.g., HVAC monitors temp sensor)
- **CONTROLS** - Equipment controls devices (e.g., thermostat controls HVAC)
- **COMMUNICATES_WITH** - Devices communicate with each other
- **POWERS** - Power source powers equipment
- **PROVIDES_SERVICE** - Gateway provides service to devices
- **PART_OF** - Component is part of larger system

## API Endpoints Working

✅ `GET /api/v1/entities` - List all entities
✅ `GET /api/v1/relationships` - List all relationships
✅ `GET /api/v1/relationships/:id/tree` - Get hierarchy tree
✅ `GET /api/v1/graph/topology` - Get graph for visualization
✅ `GET /api/v1/graph/impact/:id` - Impact analysis
✅ `GET /api/v1/entities/types` - List entity types

## Example Queries

### Get Full Building Hierarchy
```bash
curl "http://localhost:4002/api/v1/relationships/bae324f0-314d-4d9b-ad7a-d6deadee0b45/tree"
```

### Analyze HVAC Failure Impact
```bash
curl "http://localhost:4002/api/v1/graph/impact/a858bd30-7aa9-43af-9700-19f291e8cd68"
```
Shows: Server Room 102 would be impacted

### View Graph Topology
```bash
curl "http://localhost:4002/api/v1/graph/topology"
```
Returns nodes and edges for visualization tools (D3.js, Cytoscape, etc.)

### Get All Relationships
```bash
curl "http://localhost:4002/api/v1/relationships"
```

### Search for Server Rooms
```bash
curl "http://localhost:4002/api/v1/entities/search?q=server"
```

## Next Steps to Enhance

1. **Link Real Devices**: When you have device shadows, link them to room entities
2. **Add More Relationships**: 
   - HVAC MONITORS temperature sensors
   - Gateway PROVIDES_SERVICE to devices
   - Equipment CONTROLS devices
3. **Add Zones**: Create zone entities (e.g., "North Wing") that span multiple rooms
4. **Add Gateways**: Link your SPE gateways as entities
5. **Visualize**: Build a React/D3.js visualization using the `/graph/topology` endpoint

## Database Tables

- `entities` - 8 rows
- `entity_types` - 7 rows (seeded)
- `entity_relationships` - 6 rows
- `entity_properties` - 0 rows (not yet used)

## Views Available

- `entity_hierarchy` - Recursive CTE for hierarchy queries
- `device_locations` - Devices with their building/floor/room context
