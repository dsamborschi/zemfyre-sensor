# Fire Evacuation Planning with Digital Twin - Complete Guide

## Overview

Yes! You can **absolutely use the digital twin system for fire evacuation planning**. The entity-relationship model is perfect for this because it captures:

1. **Physical Structure** - Buildings, floors, rooms, stairwells
2. **Fire Safety Equipment** - Alarms, sprinklers, extinguishers
3. **Detection Systems** - Smoke detectors, heat sensors, pull stations
4. **Evacuation Routes** - Stairwells, exits, assembly points
5. **Dependencies** - What fails if critical systems go down
6. **Critical Paths** - Shortest routes, capacities, bottlenecks

---

## Fire Safety System Components

### 🔥 Fire Detection Zones (5)

| Zone | Area | Priority | Occupancy | Alarm Panel |
|------|------|----------|-----------|-------------|
| Zone 1 | Lobby & Common Areas | High | 200 | Panel A |
| Zone 2 | Parking Levels | High | 60 | Panel B |
| Zone 3 | Residential Floors 1-7 | Critical | 224 | Panel C |
| Zone 4 | Residential Floors 8-14 | Critical | 224 | Panel D |
| Zone 5 | Penthouse & Rooftop | Critical | 32 | Panel E |

**Total Building Occupancy**: ~740 people

### 🚨 Detection Devices (13)

**Smoke Detectors (9):**
- Lobby: 4 photoelectric detectors
- Parking P1: 3 heavy-duty detectors
- Floor 3 Hallways: 2 corridor detectors

**Pull Stations (4):**
- Lobby Main Exit
- Stairwell A Ground
- Stairwell B Ground  
- Stairwell C Ground

### 💧 Fire Suppression (4 Systems)

1. **Wet Pipe Sprinkler System**
   - 480 sprinkler heads
   - Entire building coverage
   - Water supply: City main
   - Pressure: 65 PSI

2. **Fire Pump**
   - Capacity: 1,500 GPM
   - Pressure: 125 PSI
   - Powers upper floors (above 7th)
   - Emergency generator backup

3. **Standpipe System**
   - Class I (2.5" hose connections)
   - 3 stairwells (A, B, C)
   - All 16 floors
   - Roof connection for aerial access

4. **Fire Department Connection (FDC)**
   - Front of building (main entrance)
   - Siamese connection (2 inlets)
   - Feeds sprinkler + standpipe systems

### 🚪 Evacuation Routes (5)

| Route | Type | Capacity | Exits To | Roof Access |
|-------|------|----------|----------|-------------|
| **Stairwell A** | Fire-rated 2hr | 60" wide | Main entrance | Yes |
| **Stairwell B** | Fire-rated 2hr | 60" wide | Rear exit | Yes |
| **Stairwell C** | Fire-rated 2hr | 60" wide | Parking side exit | No |
| **Main Entrance** | Primary exit | 96" wide | Front plaza | N/A |
| **Rear Exit** | Emergency only | 72" wide | Loading area | N/A |

**All stairwells:**
- Pressurized (smoke-free)
- Emergency lighting
- 2-hour fire rating
- Serve all 16 floors

### 📍 Assembly Points (2)

1. **Front Plaza** (Primary)
   - Capacity: 500 people
   - Distance: 50m from building
   - Accessible, weather open
   - Main entrance evacuees

2. **Parking Lot North** (Secondary)
   - Capacity: 200 people
   - Distance: 75m from building
   - Accessible
   - Parking level evacuees

### ⚡ Emergency Systems (3)

1. **Emergency Diesel Generator**
   - 500 kW capacity
   - 48-hour fuel supply
   - Auto-start on power failure
   - Powers: Fire alarm, fire pump, emergency lights, stairwell pressurization, 1 firefighter elevator

2. **Fire Alarm Control Panel**
   - 256 zone capacity
   - Monitors all detectors
   - Connected to Central Station
   - ULS certified

3. **Emergency Voice/Alarm Communication**
   - 16 zones
   - 120 speakers
   - 16 firefighter phone locations
   - Two-way communication
   - 24-hour battery backup

---

## Evacuation Planning Use Cases

### 1. **Route Planning & Optimization**

**Query: Find all evacuation routes from Floor 3**

```bash
# Get Floor 3 entity
curl "http://localhost:4002/api/v1/entities/search?q=Floor%203"

# Find stairwells connected to Floor 3
curl "http://localhost:4002/api/v1/entities/search?q=stairwell"
```

**Result:** 3 stairwells (A, B, C) available
- Stairwell A → Main entrance (96" exit, 120 people/min)
- Stairwell B → Rear exit (72" exit, 80 people/min)
- Stairwell C → Parking side exit

**Evacuation Time Calculation:**
- Floor 3 occupancy: 32 people (4 units × 8 people avg)
- Distributed across 3 stairwells: ~11 people per stairwell
- Descent time: 3 floors × 30 sec/floor = 90 seconds
- Exit time: 11 people ÷ 2 people/sec = 5 seconds
- **Total: ~2 minutes for Floor 3 evacuation**

### 2. **Critical Failure Impact Analysis**

**Scenario: Emergency Generator Fails**

```bash
curl "http://localhost:4002/api/v1/graph/impact/7ad3dc50-bb97-41e9-8fdc-8da122613fa8"
```

**Impacted Systems (Cascading Failure):**
1. ❌ Fire Pump (no backup power)
   - Sprinkler system pressure reduced
   - Upper floors (8-15) lose fire suppression
2. ❌ Fire Alarm Panel (loses power after battery ~24hrs)
   - Detection continues via battery
   - Central station communication at risk
3. ❌ Emergency Voice System (loses power after battery ~24hrs)
   - Evacuation announcements limited
   - Firefighter communications degraded
4. ❌ Stairwell Pressurization (fails)
   - Smoke can enter stairwells
   - Evacuation routes compromised

**Risk Level**: 🔴 **CRITICAL** - Multiple life safety systems affected

**Mitigation**:
- Monthly generator tests required
- Automatic transfer switch (ATS) maintenance
- 48-hour fuel supply verified
- Mobile generator hookup available

### 3. **Capacity Planning**

**Query: Total building evacuation capacity**

```bash
# Get all evacuation routes
curl "http://localhost:4002/api/v1/entities/search?q=stairwell"
curl "http://localhost:4002/api/v1/entities/search?q=exit"
```

**Calculation:**

| Exit Route | Width | Capacity (people/min) | Notes |
|------------|-------|----------------------|-------|
| Stairwell A → Main entrance | 60" + 96" | 120 | Primary route |
| Stairwell B → Rear exit | 60" + 72" | 80 | Emergency route |
| Stairwell C → Side exit | 60" + 48" | 60 | Parking access |
| **TOTAL** | | **260 people/min** | |

**Building Evacuation Time:**
- Total occupancy: 740 people
- Evacuation rate: 260 people/min
- **Full building evacuation: ~3 minutes (ideal conditions)**

**Reality factors:**
- Add 30 sec per floor for upper floors
- Mobility-impaired residents: 5-10 min
- Panic/crowding: +50% time
- **Realistic total: 8-12 minutes**

### 4. **Fire Spread Modeling**

**Scenario: Fire starts in Unit 302 (Floor 3)**

```bash
# Get Unit 302
curl "http://localhost:4002/api/v1/entities/search?q=Unit%20302"

# Find what contains it (floor)
curl "http://localhost:4002/api/v1/relationships?target_entity_id=<unit_302_id>&relationship_type=CONTAINS"

# Find adjacent units
curl "http://localhost:4002/api/v1/relationships/<floor_3_id>/children"
```

**Affected Areas (Time-based):**

**T+0 min**: Fire in Unit 302
- Sprinkler activates
- Smoke detector triggers
- Fire alarm sounds building-wide

**T+2 min**: Smoke spreads to hallway
- Hallway smoke detectors activate
- Floor 3 evacuation begins
- Stairwell doors must remain closed

**T+5 min**: If fire breaches unit
- Adjacent units at risk (301, 303, 304)
- Floor above (Floor 4) smoke migration risk
- Fire department notified automatically

**T+10 min**: Fire department arrival
- FDC connection used
- Standpipe access via stairwells
- Firefighter elevator to Floor 3

### 5. **Accessibility & Special Needs**

**Query: Identify residents needing assistance**

```bash
# This would query resident database (future feature)
# For now, track via entity metadata:

curl -X POST http://localhost:4002/api/v1/entities/<unit_id>/properties \
  -d '{
    "property_name": "accessibility_needs",
    "property_value": {
      "wheelchair": true,
      "hearing_impaired": false,
      "evacuation_time_minutes": 10,
      "requires_assistance": true,
      "rescue_zone": "Floor 3 Stairwell A landing"
    }
  }'
```

**Rescue Zones (Areas of Refuge):**
- Each floor has 3 stairwell landings
- 2-hour fire rating
- Emergency phone connection
- Marked for firefighter pickup
- Can shelter 4-6 people per landing

### 6. **Firefighter Operations Planning**

**Query: Find firefighter access points**

```bash
# Get standpipe locations
curl "http://localhost:4002/api/v1/entities/search?q=standpipe"

# Get FDC
curl "http://localhost:4002/api/v1/entities/search?q=department%20connection"

# Get stairwells with roof access
curl "http://localhost:4002/api/v1/entities/search?q=stairwell"
# Filter metadata: roof_access = true
```

**Firefighter Access Strategy:**

1. **Water Supply**:
   - FDC at main entrance
   - Connects to sprinkler + standpipe
   - 2 × 2.5" inlets
   - Boosts pressure to 125 PSI

2. **Vertical Access**:
   - Stairwell A (North) - Roof access ✓
   - Stairwell B (South) - Roof access ✓
   - Stairwell C (West) - No roof access
   - Firefighter elevator - Ground to 15

3. **Interior Attack**:
   - Standpipe connections every floor
   - 2.5" hose connections
   - Stairwell protection
   - Two-way communication system

4. **Aerial Operations** (if needed):
   - Penthouse rooftop access
   - Helicopter pad (emergency)
   - Roof hatch from Stairwells A & B

### 7. **Drill Planning & Simulation**

**Monthly Fire Drill Scenario:**

```bash
# Simulate Zone 3 alarm (Floors 1-7)

# 1. Check all smoke detectors in zone
curl "http://localhost:4002/api/v1/entities/search?q=smoke%20detector"
# Filter: zone = "Zone 3"

# 2. Verify evacuation routes available
curl "http://localhost:4002/api/v1/entities/search?q=stairwell"

# 3. Check assembly point capacity
curl "http://localhost:4002/api/v1/entities/search?q=assembly"
# Verify: 224 people (Zone 3) < 500 capacity (Front Plaza)

# 4. Test emergency systems
curl "http://localhost:4002/api/v1/graph/impact/<generator_id>"
# Verify backup systems functional
```

**Drill Metrics to Track:**
- Evacuation completion time per floor
- Stairwell congestion points
- Assembly point arrival times
- Missing persons identification time
- All-clear confirmation time

**Target**: Full evacuation in < 5 minutes (realistic: 8-10 min)

---

## API Queries for Evacuation Planning

### Find All Fire Safety Equipment

```bash
# All smoke detectors
curl "http://localhost:4002/api/v1/entities/search?q=smoke"

# All pull stations
curl "http://localhost:4002/api/v1/entities/search?q=pull%20station"

# All evacuation routes
curl "http://localhost:4002/api/v1/entities/search?q=stairwell"

# All emergency exits
curl "http://localhost:4002/api/v1/entities/search?q=exit"

# Fire suppression systems
curl "http://localhost:4002/api/v1/entities/search?q=sprinkler"
```

### Impact Analysis Queries

```bash
# What fails if generator goes down?
curl "http://localhost:4002/api/v1/graph/impact/7ad3dc50-bb97-41e9-8fdc-8da122613fa8"

# What fails if fire pump fails?
curl "http://localhost:4002/api/v1/graph/impact/2908788f-13d4-4173-9947-ead948cbed55"

# What does fire alarm panel monitor?
curl "http://localhost:4002/api/v1/relationships?source_entity_id=03075231-3a4e-4adf-995c-25ee5091abb1&relationship_type=MONITORS"
```

### Topology & Visualization

```bash
# Get complete fire safety topology
curl "http://localhost:4002/api/v1/graph/topology"

# Get building hierarchy
curl "http://localhost:4002/api/v1/relationships/1d9bc879-e45e-4a3f-8a09-4da4e0e59b8d/tree"

# Get all fire zones
curl "http://localhost:4002/api/v1/entities?entity_type=zone"
```

---

## Advanced Evacuation Scenarios

### Scenario 1: Fire on Floor 10 (Upper Residential)

**Conditions:**
- Fire origin: Unit 1005
- Time: 2:00 AM (sleeping hours)
- Weather: Winter storm (assembly point issue)

**Evacuation Plan:**
1. **Immediate (T+0):**
   - Sprinkler activates in Unit 1005
   - Smoke detector triggers
   - Building-wide alarm sounds
   - Zone 4 alert (Floors 8-14)

2. **T+1 min:**
   - Floor 10 residents wake up
   - Evacuation begins via 3 stairwells
   - Emergency voice system announces floor

3. **T+2 min:**
   - Floors 9, 11 start evacuating (precautionary)
   - Firefighter elevator dispatched
   - Fire department en route (ETA 6 min)

4. **T+5 min:**
   - Floor 10 cleared
   - Floors 8-14 evacuation underway
   - Assembly point: Use Lobby due to weather (backup plan)

5. **T+8 min:**
   - Fire department arrives
   - FDC connection established
   - Standpipe attack from Floor 9 up

6. **T+12 min:**
   - All residents accounted for
   - Fire contained to Unit 1005
   - All-clear given for Floors 11-15

**Lessons:**
- Weather backup assembly point needed (lobby/parking)
- Upper floor evacuation takes longer
- Stairwell congestion at Floors 8-9
- Emergency voice system critical for floor-specific instructions

### Scenario 2: Parking Level Fire (Vehicle)

**Conditions:**
- Electric vehicle fire (thermal runaway)
- Location: Parking P1
- High smoke production, toxic fumes

**Evacuation Plan:**
1. **Detection (T+0):**
   - Parking smoke detector activates
   - Zone 2 alarm
   - Parking ventilation fans activate

2. **Evacuation (T+1 min):**
   - People in parking use Stairwell C (direct parking access)
   - Ground floor notified
   - Lobby evacuates via main entrance

3. **Fire Department (T+6 min):**
   - Approach from parking ramp
   - Ventilation critical (toxic fumes)
   - Sprinkler system activated

4. **Containment:**
   - EV fire requires hours to burn out
   - Parking level closed for 24-48 hours
   - Residents use street parking

**Lessons:**
- EV fires are unique challenge
- Ventilation system critical
- Parking-level evacuation is fastest (direct to outside)

### Scenario 3: Multi-Floor Fire (Worst Case)

**Conditions:**
- Fire spreads vertically through utility chase
- Affects Floors 3, 4, 5
- Stairwell B compromised (smoke infiltration)

**Evacuation Plan:**
1. **T+0:** Fire detected Floor 3
2. **T+2:** Spreads to Floor 4 (utility chase)
3. **T+3:** Stairwell B pressurization fails (smoke enters)
4. **T+4:** **CRITICAL DECISION:**
   - Redirect all evacuees to Stairwells A & C
   - Emergency voice system: "AVOID STAIRWELL B"
   - Floors 1-2 evacuate first (below fire)
   - Floors 6-15 shelter in place until clear

5. **T+10:** Fire department establishes command
   - Stairwell A used for evacuation (down)
   - Stairwell C used for firefighter access (up)
   - Standpipe operations from Floor 6

6. **T+20:** Fire contained
   - Floors 1-2 cleared
   - Floors 3-5 cleared via Stairwell A
   - Floors 6-15 evacuate in stages

**Lessons:**
- Redundancy is critical (3 stairwells)
- Emergency voice system essential for re-routing
- Shelter-in-place may be safer than evacuation (upper floors)
- Firefighter access separate from civilian evacuation

---

## Integration with Real-Time Data

### Future Enhancements

1. **Live Sensor Integration:**
   ```bash
   # Link BME688 sensors to fire zones
   curl -X POST http://localhost:4002/api/v1/entities/<sensor_id>/device \
     -d '{"device_uuid": "<actual_sensor_uuid>"}'
   
   # Monitor temperature rise = early fire detection
   # Smoke particulate detection
   # Air quality degradation
   ```

2. **Occupancy Tracking:**
   - Smart locks report unit occupancy
   - Gym access control shows people in fitness center
   - Elevator logs show floor activity
   - **Real-time evacuation count**

3. **Dynamic Route Optimization:**
   - Smoke sensors show which stairwells are clear
   - Crowd sensors show congestion
   - AI suggests optimal evacuation path per resident

4. **Emergency Responder Dashboard:**
   - Building layout with live fire location
   - Evacuation progress by floor
   - Standpipe locations marked
   - Utility shutoff locations

---

## Compliance & Regulations

### Ontario Fire Code Requirements

- ✅ Smoke detectors in all common areas
- ✅ Sprinklers in all units and common spaces
- ✅ 2-hour fire-rated stairwells
- ✅ Emergency lighting with battery backup
- ✅ Fire alarm connected to central monitoring station
- ✅ Monthly fire drill requirement
- ✅ Annual inspection of fire suppression systems
- ✅ Standpipe system for buildings > 6 stories
- ✅ Emergency voice communication system

### Digital Twin Assists With:

1. **Inspection Tracking**: Last inspection dates in metadata
2. **Maintenance Scheduling**: Fire pump, generator, sprinklers
3. **Drill Documentation**: Record evacuation times, issues
4. **Code Compliance**: Verify all required systems present
5. **Audit Trail**: Changes to fire safety equipment tracked

---

## Summary

**YES! The digital twin is PERFECT for fire evacuation planning because it provides:**

✅ **Complete Building Model** - Every floor, room, exit mapped  
✅ **Equipment Tracking** - All fire safety devices documented  
✅ **Dependency Mapping** - Know what fails if generator/pump goes down  
✅ **Route Optimization** - Calculate fastest evacuation paths  
✅ **Capacity Planning** - Verify exits handle occupancy  
✅ **Impact Analysis** - Simulate failure scenarios  
✅ **Real-Time Integration** - Connect to live sensors (future)  
✅ **Drill Planning** - Test scenarios, track improvements  
✅ **Compliance** - Document all required systems  
✅ **Training** - Visualize building for firefighters  

**Next Steps:**
1. ✅ Fire safety system created (this script)
2. Link real temperature/smoke sensors to zones
3. Add occupancy tracking per unit
4. Build evacuation visualization dashboard
5. Integrate with building management system (BMS)
6. Create mobile app for residents (evacuation map)
7. Train AI on evacuation patterns
8. Connect to fire department CAD system

---

**Documentation Created:** October 18, 2025  
**System:** Zemfyre Sensor Digital Twin - Fire Safety Module  
**Building:** Maple Heights Condominium, Toronto  
**Script:** `api/scripts/add-fire-safety-system.ps1`
