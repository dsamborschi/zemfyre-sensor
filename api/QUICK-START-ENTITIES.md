# 🚀 Quick Start: Digital Twin with Relationships

## 5-Minute Setup

### 1. Run Migration
```bash
cd api
npx knex migrate:latest
```

### 2. Start API
```bash
npm run dev
```

### 3. Test It Works
```bash
curl http://localhost:4002/api/v1/entities/types
```

### 4. Create Your First Entity
```bash
curl -X POST http://localhost:4002/api/v1/entities \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "building",
    "name": "My First Building",
    "metadata": {"address": "123 Main St"}
  }'
```

## What You Get

### 23 New Endpoints
- `/api/v1/entities/*` - Manage entities
- `/api/v1/relationships/*` - Create relationships
- `/api/v1/graph/*` - Query graph

### Entity Types
- `building`, `floor`, `room`, `zone`
- `device`, `equipment`, `gateway`

### Relationship Types
- `CONTAINS` - Building contains floors
- `DEPENDS_ON` - Device depends on gateway
- `MONITORS` - Sensor monitors equipment

## Example: Build a Hierarchy

```bash
# 1. Create building
BUILDING_ID=$(curl -X POST http://localhost:4002/api/v1/entities \
  -H "Content-Type: application/json" \
  -d '{"entity_type":"building","name":"HQ"}' | jq -r '.data.id')

# 2. Create floor
FLOOR_ID=$(curl -X POST http://localhost:4002/api/v1/entities \
  -H "Content-Type: application/json" \
  -d '{"entity_type":"floor","name":"Floor 1"}' | jq -r '.data.id')

# 3. Link them
curl -X POST http://localhost:4002/api/v1/relationships \
  -H "Content-Type: application/json" \
  -d "{\"source_entity_id\":\"$BUILDING_ID\",\"target_entity_id\":\"$FLOOR_ID\",\"relationship_type\":\"CONTAINS\"}"

# 4. Query hierarchy
curl http://localhost:4002/api/v1/graph/tree/$BUILDING_ID
```

## Run Full Test Suite

```powershell
cd api
.\test-entities.ps1
```

## Documentation
- See `PHASE5-ENTITY-RELATIONSHIPS-COMPLETE.md` for complete details
- See `docs/DIGITAL-TWIN-RELATIONSHIPS.md` for API reference

---

**You now have a complete digital twin with entities, relationships, and graph queries!** 🎉
