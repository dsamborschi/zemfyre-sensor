# Maple Heights Condominium - Digital Twin Summary

## Building Overview

**Name:** Maple Heights Condominium  
**Type:** 15-story residential condominium  
**Location:** 456 Maple Avenue, Toronto, ON M5B 2H1  
**Year Built:** 2018  
**Total Units:** 120  
**Property Management:** CondoLife Property Management

## Entity Summary

### Buildings: 2 Total
1. **Smart Office HQ** (Office building from previous demo)
2. **Maple Heights Condominium** (New residential building)

### Maple Heights Structure

#### Floors (16 total)
- **Parking Level P1** (Underground, -1)
  - 60 parking spots
  - 8 EV charging stations
  
- **Ground Floor** (0)
  - Common areas and amenities
  - Building systems location
  
- **Floors 1-14** (Residential)
  - 8 units per floor
  - 12,000 sq ft per floor
  
- **Floor 15** (Penthouse)
  - 4 luxury units
  - 15,000 sq ft
  - Rooftop terrace access

#### Common Areas (Ground Floor)
1. **Main Lobby**
   - 2,000 sq ft
   - 24/7 concierge
   - 2 security cameras
   - Environmental sensor (BME688)
   - Smart thermostat
   
2. **Mailroom & Package Center**
   - 400 sq ft
   - 80 parcel lockers
   
3. **Fitness Center**
   - 1,200 sq ft
   - Open 6 AM - 10 PM
   - 15 pieces of equipment
   
4. **Party Room**
   - 800 sq ft
   - Capacity: 40 people
   - Reservation required

#### Sample Apartments (6 created)
**Floor 3 Units:**
- Unit 301: 2BR/2BA, 1,100 sq ft, balcony
- Unit 302: 2BR/2BA, 1,100 sq ft, balcony
- Unit 303: 2BR/2BA, 1,100 sq ft, balcony
- Unit 304: 2BR/2BA, 1,100 sq ft, balcony

**Penthouse Units:**
- PH01: 3BR/3BA, 2,500 sq ft + 800 sq ft terrace
- PH02: 3BR/3BA, 2,500 sq ft + 800 sq ft terrace

## Equipment & Systems

### HVAC Systems (3)
1. **Central Chiller Unit**
   - Manufacturer: Carrier
   - Model: 30XA-1002
   - Capacity: 250 tons
   - Location: Rooftop
   - Energy Star rated
   
2. **Central Boiler System**
   - Manufacturer: Weil-McLain
   - Model: EGH-95
   - Capacity: 950,000 BTU
   - Fuel: Natural gas
   - Location: Mechanical Room - Ground Floor
   
3. **Air Handling Unit** (Floors 1-5)
   - Manufacturer: Trane
   - Model: Voyager-15
   - Capacity: 15,000 CFM

### Security System (4 devices)
1. **Network Video Recorder (NVR)**
   - Manufacturer: Hikvision
   - Model: DS-96256NI-I24
   - Channels: 256
   - Storage: 96 TB
   - Retention: 30 days
   
2. **Lobby Camera 01** (Main Entrance)
   - Model: DS-2DE4A425IWG-E
   - Type: 4K PTZ
   - Resolution: 4MP
   - Night vision: Yes
   - IP: 192.168.10.101
   
3. **Lobby Camera 02** (Elevator Bank)
   - Model: DS-2CD2143G2-I
   - Type: Fixed dome
   - Resolution: 4MP
   - IP: 192.168.10.102
   
4. **Parking Camera P1-01**
   - Model: DS-2CD2343G2-I
   - Type: Wide-angle
   - Resolution: 4MP
   - Coverage: 120°
   - IP: 192.168.10.201

### IoT Sensors (3)
1. **BME688 Environmental Sensor** (Lobby)
   - Manufacturer: Bosch
   - Measures: Temperature, humidity, pressure, air quality
   - Location: Lobby - Near entrance
   
2. **Water Leak Sensor** (Boiler Room)
   - Manufacturer: Aqara
   - Model: SJCGQ11LM
   - Battery powered
   - Location: Mechanical Room
   
3. **Smart Thermostat** (Lobby)
   - Manufacturer: Nest
   - Model: Learning Thermostat Gen 3
   - WiFi enabled
   - Controls: Air Handling Unit

### Network Gateway (1)
- **Building IoT Gateway**
  - Hardware: Raspberry Pi 4
  - OS: Iotistic Sensor OS
  - Location: IT Closet - Ground Floor
  - IP: 192.168.10.50
  - MQTT enabled
  - Connected sensors: 12

## Relationship Graph

### Total Relationships: 61+
*Across both buildings (Smart Office HQ + Maple Heights)*

### Relationship Types in Maple Heights

#### CONTAINS (Physical Containment)
- Building → 16 Floors
- Ground Floor → 4 Common Areas
- Ground Floor → Equipment (Boiler, NVR, Gateway)
- Floor 3 → 4 Apartment Units
- Floor 15 → 2 Penthouse Units
- Parking P1 → 1 Security Camera
- Lobby → 2 Cameras + 2 Sensors

#### MONITORS (Surveillance)
- NVR → 3 Security Cameras
  - Lobby Camera 01
  - Lobby Camera 02
  - Parking Camera P1-01

#### PROVIDES_SERVICE (Network Service)
- IoT Gateway → 2 Sensors
  - BME688 Temperature Sensor
  - Water Leak Sensor

#### DEPENDS_ON (Operational Dependency)
- Lobby → Central Chiller
- Lobby → Central Boiler
- Fitness Center → Air Handling Unit

#### CONTROLS (Device Control)
- Smart Thermostat → Air Handling Unit

## API Endpoints for Maple Heights

### View Full Building Hierarchy
```bash
curl "http://localhost:4002/api/v1/relationships/1d9bc879-e45e-4a3f-8a09-4da4e0e59b8d/tree"
```

### Get Building with Aggregated Metrics
```bash
curl "http://localhost:4002/api/v1/graph/building/1d9bc879-e45e-4a3f-8a09-4da4e0e59b8d/status"
```

### Impact Analysis - Chiller Failure
```bash
curl "http://localhost:4002/api/v1/graph/impact/a95ae3de-a982-4f72-8a0c-685a99fa67a3"
```
*Shows: Lobby would be impacted*

### Impact Analysis - Boiler Failure
```bash
curl "http://localhost:4002/api/v1/graph/impact/c911488e-53af-46f5-97d8-08972df36d53"
```
*Shows: Lobby would be impacted*

### What Does NVR Monitor?
```bash
curl "http://localhost:4002/api/v1/relationships?source_entity_id=0f8e5152-aac1-41d4-9144-e80517e80455&relationship_type=MONITORS"
```
*Returns: 3 security cameras*

### What Services Does Gateway Provide?
```bash
curl "http://localhost:4002/api/v1/relationships?source_entity_id=97175516-5da0-4468-af13-f9d1666ae4fd&relationship_type=PROVIDES_SERVICE"
```
*Returns: 2 IoT sensors*

### Search for All Cameras
```bash
curl "http://localhost:4002/api/v1/entities/search?q=camera"
```

### Get All HVAC Equipment
```bash
curl "http://localhost:4002/api/v1/entities/search?q=hvac"
```

### View Complete Topology Graph
```bash
curl "http://localhost:4002/api/v1/graph/topology"
```

### Get All Device Locations (with Building Context)
```bash
curl "http://localhost:4002/api/v1/graph/device-locations"
```

## Use Cases Demonstrated

### 1. **Facility Management**
- Track all HVAC systems and maintenance schedules
- Monitor environmental conditions in common areas
- Manage building equipment inventory

### 2. **Security Operations**
- Central NVR system monitoring all cameras
- Coverage map: Parking, lobby entrance, elevator bank
- Integration with access control (future)

### 3. **Energy Management**
- Smart thermostat controls HVAC
- Environmental sensors provide feedback
- Identify dependencies for optimization

### 4. **Impact Analysis**
- If chiller fails → Lobby cooling affected
- If boiler fails → Lobby heating affected
- If gateway fails → Sensors lose connectivity

### 5. **Maintenance Planning**
- Identify equipment that multiple areas depend on
- Critical path analysis for system upgrades
- Preventive maintenance scheduling

### 6. **Resident Services**
- Unit-level environmental monitoring (future)
- Package delivery tracking via mailroom sensors
- Amenity usage analytics (gym, party room)

## Data Model Benefits

### Flexibility
- Easy to add new floors, units, or equipment
- Support for multiple buildings in portfolio
- Extensible metadata for custom properties

### Relationships
- Multi-type relationships (CONTAINS, MONITORS, DEPENDS_ON, etc.)
- Bi-directional traversal
- Impact analysis through dependency graph

### Integration
- Link to device shadows (digital twin state)
- MQTT integration for real-time updates
- REST API for management applications

### Visualization Ready
- `/graph/topology` returns nodes + edges
- Compatible with D3.js, Cytoscape, vis.js
- Hierarchical tree structure for org charts

## Next Steps

1. **Add More Units**: Script can be modified to create all 120 units
2. **Link Real Devices**: Connect actual BME688 sensors to device entities
3. **Add Zones**: Create logical zones (North Wing, South Wing)
4. **Access Control**: Add door sensors and access points
5. **Energy Meters**: Add smart meters per unit for billing
6. **Elevator System**: Model elevators and their maintenance
7. **Fire Safety**: Add smoke detectors and fire alarm system
8. **Visitor Management**: Integrate with concierge system
9. **Dashboard**: Build React frontend to visualize topology
10. **Mobile App**: Resident app showing unit status

## Database Stats (After Creation)

- **Entities**: ~50+ (2 buildings, 16 floors, 6 units, 4 common areas, 11 devices/equipment)
- **Relationships**: ~61 (hierarchical + operational)
- **Entity Types**: 7 (building, floor, room, zone, device, equipment, gateway)
- **Relationship Types**: 5 (CONTAINS, DEPENDS_ON, MONITORS, CONTROLS, PROVIDES_SERVICE)

---

**Created:** October 18, 2025  
**Script:** `api/scripts/create-condo-building.ps1`  
**Digital Twin System:** Iotistic Sensor - IoT Environmental Monitoring
