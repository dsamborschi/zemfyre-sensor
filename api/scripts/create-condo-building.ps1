# PowerShell script to create a realistic North American Condominium Building
# Complete with apartments, common areas, HVAC, security cameras, and IoT devices

$baseUrl = "http://localhost:4002/api/v1"
$headers = @{
    "Content-Type" = "application/json"
}

Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Creating Maple Heights Condominium - Digital Twin System     ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# ============================================================================
# STEP 1: CREATE BUILDING
# ============================================================================
Write-Host "📋 STEP 1: Creating Building..." -ForegroundColor Yellow
$buildingBody = @{
    entity_type = "building"
    name = "Maple Heights Condominium"
    description = "15-story residential condominium in downtown Toronto"
    metadata = @{
        address = "456 Maple Avenue, Toronto, ON M5B 2H1"
        year_built = 2018
        total_units = 120
        floors = 15
        parking_levels = 2
        building_type = "residential"
        property_management = "CondoLife Property Management"
        emergency_contact = "+1-416-555-0100"
    }
} | ConvertTo-Json

$building = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $buildingBody
$buildingId = $building.data.id
Write-Host "   ✓ Building created: Maple Heights Condominium" -ForegroundColor Green
Write-Host "     ID: $buildingId" -ForegroundColor Gray

# ============================================================================
# STEP 2: CREATE FLOORS
# ============================================================================
Write-Host "`n📋 STEP 2: Creating Floors..." -ForegroundColor Yellow

# Parking Levels
$parkingP1Body = @{
    entity_type = "floor"
    name = "Parking Level P1"
    description = "Underground parking - Level 1"
    metadata = @{
        floor_number = -1
        floor_type = "parking"
        parking_spots = 60
        ev_charging_stations = 8
    }
} | ConvertTo-Json

$parkingP1 = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $parkingP1Body
$parkingP1Id = $parkingP1.data.id
Write-Host "   ✓ Parking Level P1 created" -ForegroundColor Green

# Ground Floor (Lobby & Common Areas)
$groundFloorBody = @{
    entity_type = "floor"
    name = "Ground Floor"
    description = "Main lobby, mailroom, and building management office"
    metadata = @{
        floor_number = 0
        floor_type = "common"
        area_sqft = 5000
    }
} | ConvertTo-Json

$groundFloor = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $groundFloorBody
$groundFloorId = $groundFloor.data.id
Write-Host "   ✓ Ground Floor created" -ForegroundColor Green

# Residential Floors (1-14)
$residentialFloors = @()
foreach ($floorNum in 1..14) {
    $floorBody = @{
        entity_type = "floor"
        name = "Floor $floorNum"
        description = "Residential floor with 8 units"
        metadata = @{
            floor_number = $floorNum
            floor_type = "residential"
            units_per_floor = 8
            area_sqft = 12000
        }
    } | ConvertTo-Json
    
    $floor = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $floorBody
    $residentialFloors += $floor.data.id
    
    if ($floorNum % 3 -eq 0) {
        Write-Host "   ✓ Floors 1-$floorNum created..." -ForegroundColor Green
    }
}

# Penthouse Floor
$penthouseBody = @{
    entity_type = "floor"
    name = "Penthouse Floor 15"
    description = "Luxury penthouse suites with rooftop access"
    metadata = @{
        floor_number = 15
        floor_type = "penthouse"
        units_per_floor = 4
        area_sqft = 15000
        rooftop_terrace = $true
    }
} | ConvertTo-Json

$penthouse = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $penthouseBody
$penthouseId = $penthouse.data.id
Write-Host "   ✓ Penthouse Floor created" -ForegroundColor Green

# ============================================================================
# STEP 3: LINK FLOORS TO BUILDING
# ============================================================================
Write-Host "`n📋 STEP 3: Creating Building → Floor Relationships..." -ForegroundColor Yellow

# Link all floors to building
$allFloors = @($parkingP1Id, $groundFloorId) + $residentialFloors + @($penthouseId)
foreach ($floorId in $allFloors) {
    $relBody = @{
        source_entity_id = $buildingId
        target_entity_id = $floorId
        relationship_type = "CONTAINS"
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "$baseUrl/relationships" -Method POST -Headers $headers -Body $relBody | Out-Null
}
Write-Host "   ✓ Linked 16 floors to building" -ForegroundColor Green

# ============================================================================
# STEP 4: CREATE COMMON AREAS
# ============================================================================
Write-Host "`n📋 STEP 4: Creating Common Areas..." -ForegroundColor Yellow

# Main Lobby
$lobbyBody = @{
    entity_type = "room"
    name = "Main Lobby"
    description = "Building entrance with concierge desk and seating area"
    metadata = @{
        room_type = "lobby"
        area_sqft = 2000
        hours = "24/7"
        concierge = $true
    }
} | ConvertTo-Json

$lobby = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $lobbyBody
$lobbyId = $lobby.data.id
Write-Host "   ✓ Main Lobby created" -ForegroundColor Green

# Mailroom
$mailroomBody = @{
    entity_type = "room"
    name = "Mailroom & Package Center"
    description = "Secure mailroom with package lockers"
    metadata = @{
        room_type = "mailroom"
        area_sqft = 400
        parcel_lockers = 80
    }
} | ConvertTo-Json

$mailroom = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $mailroomBody
$mailroomId = $mailroom.data.id
Write-Host "   ✓ Mailroom created" -ForegroundColor Green

# Fitness Center
$gymBody = @{
    entity_type = "room"
    name = "Fitness Center"
    description = "Residents gym with cardio and weight equipment"
    metadata = @{
        room_type = "amenity"
        area_sqft = 1200
        hours = "6:00 AM - 10:00 PM"
        equipment_count = 15
    }
} | ConvertTo-Json

$gym = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $gymBody
$gymId = $gym.data.id
Write-Host "   ✓ Fitness Center created" -ForegroundColor Green

# Party Room
$partyRoomBody = @{
    entity_type = "room"
    name = "Party Room"
    description = "Bookable event space for residents"
    metadata = @{
        room_type = "amenity"
        area_sqft = 800
        capacity = 40
        reservation_required = $true
    }
} | ConvertTo-Json

$partyRoom = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $partyRoomBody
$partyRoomId = $partyRoom.data.id
Write-Host "   ✓ Party Room created" -ForegroundColor Green

# Link common areas to ground floor
foreach ($roomId in @($lobbyId, $mailroomId, $gymId, $partyRoomId)) {
    $relBody = @{
        source_entity_id = $groundFloorId
        target_entity_id = $roomId
        relationship_type = "CONTAINS"
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "$baseUrl/relationships" -Method POST -Headers $headers -Body $relBody | Out-Null
}
Write-Host "   ✓ Linked common areas to Ground Floor" -ForegroundColor Green

# ============================================================================
# STEP 5: CREATE SAMPLE APARTMENTS
# ============================================================================
Write-Host "`n📋 STEP 5: Creating Sample Apartments (Floor 3 & 15)..." -ForegroundColor Yellow

# Floor 3 Apartments (representative sample)
$floor3Units = @()
foreach ($unitNum in 1..4) {
    $unitNumber = "30$unitNum"
    $unitBody = @{
        entity_type = "room"
        name = "Unit $unitNumber"
        description = "2-bedroom, 2-bathroom apartment"
        metadata = @{
            room_type = "apartment"
            unit_number = $unitNumber
            bedrooms = 2
            bathrooms = 2
            area_sqft = 1100
            balcony = $true
            occupied = $true
        }
    } | ConvertTo-Json
    
    $unit = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $unitBody
    $floor3Units += $unit.data.id
}
Write-Host "   ✓ Created 4 units on Floor 3 (301-304)" -ForegroundColor Green

# Penthouse Units
$penthouseUnits = @()
foreach ($unitNum in 1..2) {
    $unitNumber = "PH0$unitNum"
    $unitBody = @{
        entity_type = "room"
        name = "Penthouse $unitNumber"
        description = "Luxury 3-bedroom penthouse with private terrace"
        metadata = @{
            room_type = "penthouse"
            unit_number = $unitNumber
            bedrooms = 3
            bathrooms = 3
            area_sqft = 2500
            private_terrace = $true
            terrace_sqft = 800
            occupied = $true
        }
    } | ConvertTo-Json
    
    $unit = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $unitBody
    $penthouseUnits += $unit.data.id
}
Write-Host "   ✓ Created 2 penthouse units (PH01-PH02)" -ForegroundColor Green

# Link apartments to floors
foreach ($unitId in $floor3Units) {
    $relBody = @{
        source_entity_id = $residentialFloors[2]  # Floor 3
        target_entity_id = $unitId
        relationship_type = "CONTAINS"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$baseUrl/relationships" -Method POST -Headers $headers -Body $relBody | Out-Null
}

foreach ($unitId in $penthouseUnits) {
    $relBody = @{
        source_entity_id = $penthouseId
        target_entity_id = $unitId
        relationship_type = "CONTAINS"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$baseUrl/relationships" -Method POST -Headers $headers -Body $relBody | Out-Null
}
Write-Host "   ✓ Linked apartments to their floors" -ForegroundColor Green

# ============================================================================
# STEP 6: CREATE HVAC SYSTEMS
# ============================================================================
Write-Host "`n📋 STEP 6: Creating HVAC Systems..." -ForegroundColor Yellow

# Central Chiller
$chillerBody = @{
    entity_type = "equipment"
    name = "Central Chiller Unit"
    description = "Primary cooling system for entire building"
    metadata = @{
        equipment_type = "hvac"
        manufacturer = "Carrier"
        model = "30XA-1002"
        capacity_tons = 250
        install_date = "2018-03-15"
        maintenance_schedule = "quarterly"
        location = "Rooftop"
        energy_rating = "ENERGY_STAR"
    }
} | ConvertTo-Json

$chiller = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $chillerBody
$chillerId = $chiller.data.id
Write-Host "   ✓ Central Chiller created" -ForegroundColor Green

# Boiler
$boilerBody = @{
    entity_type = "equipment"
    name = "Central Boiler System"
    description = "Heating system for building and hot water"
    metadata = @{
        equipment_type = "hvac"
        manufacturer = "Weil-McLain"
        model = "EGH-95"
        capacity_btu = 950000
        install_date = "2018-03-15"
        fuel_type = "natural_gas"
        location = "Mechanical Room - Ground Floor"
    }
} | ConvertTo-Json

$boiler = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $boilerBody
$boilerId = $boiler.data.id
Write-Host "   ✓ Central Boiler created" -ForegroundColor Green

# Air Handling Units (per floor)
$ahuBody = @{
    entity_type = "equipment"
    name = "Air Handling Unit - Floors 1-5"
    description = "Ventilation and air distribution system"
    metadata = @{
        equipment_type = "hvac"
        manufacturer = "Trane"
        model = "Voyager-15"
        cfm_capacity = 15000
        serves_floors = "1-5"
        install_date = "2018-04-01"
    }
} | ConvertTo-Json

$ahu = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $ahuBody
$ahuId = $ahu.data.id
Write-Host "   ✓ Air Handling Unit created" -ForegroundColor Green

# ============================================================================
# STEP 7: CREATE SECURITY CAMERAS
# ============================================================================
Write-Host "`n📋 STEP 7: Creating Security Camera System..." -ForegroundColor Yellow

# NVR (Network Video Recorder)
$nvrBody = @{
    entity_type = "equipment"
    name = "Network Video Recorder"
    description = "Central security camera recording system"
    metadata = @{
        equipment_type = "security"
        manufacturer = "Hikvision"
        model = "DS-96256NI-I24"
        channels = 256
        storage_tb = 96
        location = "Security Office"
        recording_retention_days = 30
    }
} | ConvertTo-Json

$nvr = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $nvrBody
$nvrId = $nvr.data.id
Write-Host "   ✓ NVR System created" -ForegroundColor Green

# Lobby Cameras
$lobbyCam1Body = @{
    entity_type = "device"
    name = "Lobby Camera 01 - Main Entrance"
    description = "4K PTZ camera monitoring main entrance"
    metadata = @{
        device_type = "security_camera"
        manufacturer = "Hikvision"
        model = "DS-2DE4A425IWG-E"
        resolution = "4MP"
        ptz = $true
        night_vision = $true
        location = "Lobby - Main Entrance"
        ip_address = "192.168.10.101"
    }
} | ConvertTo-Json

$lobbyCam1 = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $lobbyCam1Body
$lobbyCam1Id = $lobbyCam1.data.id
Write-Host "   ✓ Lobby Camera 01 created" -ForegroundColor Green

$lobbyCam2Body = @{
    entity_type = "device"
    name = "Lobby Camera 02 - Elevator Bank"
    description = "Fixed dome camera monitoring elevator area"
    metadata = @{
        device_type = "security_camera"
        manufacturer = "Hikvision"
        model = "DS-2CD2143G2-I"
        resolution = "4MP"
        location = "Lobby - Elevator Bank"
        ip_address = "192.168.10.102"
    }
} | ConvertTo-Json

$lobbyCam2 = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $lobbyCam2Body
$lobbyCam2Id = $lobbyCam2.data.id
Write-Host "   ✓ Lobby Camera 02 created" -ForegroundColor Green

# Parking Camera
$parkingCamBody = @{
    entity_type = "device"
    name = "Parking Camera P1-01"
    description = "Wide-angle camera for parking level"
    metadata = @{
        device_type = "security_camera"
        manufacturer = "Hikvision"
        model = "DS-2CD2343G2-I"
        resolution = "4MP"
        coverage_angle = 120
        location = "Parking P1 - Entrance"
        ip_address = "192.168.10.201"
    }
} | ConvertTo-Json

$parkingCam = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $parkingCamBody
$parkingCamId = $parkingCam.data.id
Write-Host "   ✓ Parking Camera created" -ForegroundColor Green

# ============================================================================
# STEP 8: CREATE IoT SENSORS
# ============================================================================
Write-Host "`n📋 STEP 8: Creating IoT Sensor Devices..." -ForegroundColor Yellow

# Try to link to existing device shadow if available
$deviceLinked = $false
try {
    $shadows = Invoke-RestMethod -Uri "$baseUrl/digital-twin"
    if ($shadows.data.Count -gt 0) {
        $existingDeviceUuid = $shadows.data[0].device_uuid
        
        $tempSensorBody = @{
            entity_type = "device"
            name = "BME688 Sensor - Lobby"
            description = "Environmental sensor monitoring lobby conditions"
            metadata = @{
                device_type = "environmental_sensor"
                manufacturer = "Bosch"
                model = "BME688"
                measures = @("temperature", "humidity", "pressure", "air_quality")
                location = "Lobby - Near Entrance"
            }
        } | ConvertTo-Json
        
        $tempSensor = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $tempSensorBody
        $tempSensorId = $tempSensor.data.id
        
        # Link to shadow
        $linkBody = @{
            device_uuid = $existingDeviceUuid
        } | ConvertTo-Json
        Invoke-RestMethod -Uri "$baseUrl/entities/$tempSensorId/device" -Method POST -Headers $headers -Body $linkBody | Out-Null
        
        Write-Host "   ✓ BME688 Sensor created and linked to shadow" -ForegroundColor Green
        $deviceLinked = $true
    }
}
catch {
    # Create sensor without shadow link
    $tempSensorBody = @{
        entity_type = "device"
        name = "BME688 Sensor - Lobby"
        description = "Environmental sensor monitoring lobby conditions"
        metadata = @{
            device_type = "environmental_sensor"
            manufacturer = "Bosch"
            model = "BME688"
            measures = @("temperature", "humidity", "pressure", "air_quality")
            location = "Lobby - Near Entrance"
        }
    } | ConvertTo-Json
    
    $tempSensor = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $tempSensorBody
    $tempSensorId = $tempSensor.data.id
    Write-Host "   ✓ BME688 Sensor created (no shadow available)" -ForegroundColor Green
}

# Water Leak Sensor
$waterSensorBody = @{
    entity_type = "device"
    name = "Water Leak Sensor - Boiler Room"
    description = "Flood detection sensor"
    metadata = @{
        device_type = "water_sensor"
        manufacturer = "Aqara"
        model = "SJCGQ11LM"
        location = "Mechanical Room - Near Boiler"
        battery = $true
    }
} | ConvertTo-Json

$waterSensor = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $waterSensorBody
$waterSensorId = $waterSensor.data.id
Write-Host "   ✓ Water Leak Sensor created" -ForegroundColor Green

# Smart Thermostat
$thermostatBody = @{
    entity_type = "device"
    name = "Smart Thermostat - Lobby"
    description = "Networked thermostat controlling lobby climate"
    metadata = @{
        device_type = "thermostat"
        manufacturer = "Nest"
        model = "Learning Thermostat Gen 3"
        location = "Lobby"
        wifi_enabled = $true
    }
} | ConvertTo-Json

$thermostat = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $thermostatBody
$thermostatId = $thermostat.data.id
Write-Host "   ✓ Smart Thermostat created" -ForegroundColor Green

# ============================================================================
# STEP 9: CREATE GATEWAY
# ============================================================================
Write-Host "`n📋 STEP 9: Creating IoT Gateway..." -ForegroundColor Yellow

$gatewayBody = @{
    entity_type = "gateway"
    name = "Building IoT Gateway"
    description = "Raspberry Pi gateway for sensor network"
    metadata = @{
        device_type = "iot_gateway"
        hardware = "Raspberry Pi 4"
        os = "Zemfyre Sensor OS"
        location = "IT Closet - Ground Floor"
        ip_address = "192.168.10.50"
        mqtt_enabled = $true
        connected_sensors = 12
    }
} | ConvertTo-Json

$gateway = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $gatewayBody
$gatewayId = $gateway.data.id
Write-Host "   ✓ IoT Gateway created" -ForegroundColor Green

# ============================================================================
# STEP 10: CREATE RELATIONSHIPS
# ============================================================================
Write-Host "`n📋 STEP 10: Creating Equipment & Device Relationships..." -ForegroundColor Yellow

$relationships = @(
    # Cameras in Lobby
    @{ source = $lobbyId; target = $lobbyCam1Id; type = "CONTAINS"; desc = "Lobby contains Camera 01" }
    @{ source = $lobbyId; target = $lobbyCam2Id; type = "CONTAINS"; desc = "Lobby contains Camera 02" }
    
    # Parking camera
    @{ source = $parkingP1Id; target = $parkingCamId; type = "CONTAINS"; desc = "Parking contains Camera" }
    
    # Sensors in rooms
    @{ source = $lobbyId; target = $tempSensorId; type = "CONTAINS"; desc = "Lobby contains Temp Sensor" }
    @{ source = $lobbyId; target = $thermostatId; type = "CONTAINS"; desc = "Lobby contains Thermostat" }
    @{ source = $groundFloorId; target = $waterSensorId; type = "CONTAINS"; desc = "Ground Floor contains Water Sensor" }
    
    # NVR monitors all cameras
    @{ source = $nvrId; target = $lobbyCam1Id; type = "MONITORS"; desc = "NVR monitors Camera 01" }
    @{ source = $nvrId; target = $lobbyCam2Id; type = "MONITORS"; desc = "NVR monitors Camera 02" }
    @{ source = $nvrId; target = $parkingCamId; type = "MONITORS"; desc = "NVR monitors Parking Camera" }
    
    # Gateway provides service to sensors
    @{ source = $gatewayId; target = $tempSensorId; type = "PROVIDES_SERVICE"; desc = "Gateway services Temp Sensor" }
    @{ source = $gatewayId; target = $waterSensorId; type = "PROVIDES_SERVICE"; desc = "Gateway services Water Sensor" }
    
    # HVAC dependencies
    @{ source = $lobbyId; target = $chillerId; type = "DEPENDS_ON"; desc = "Lobby depends on Chiller" }
    @{ source = $lobbyId; target = $boilerId; type = "DEPENDS_ON"; desc = "Lobby depends on Boiler" }
    @{ source = $gymId; target = $ahuId; type = "DEPENDS_ON"; desc = "Gym depends on AHU" }
    
    # Thermostat controls HVAC
    @{ source = $thermostatId; target = $ahuId; type = "CONTROLS"; desc = "Thermostat controls AHU" }
    
    # Equipment location
    @{ source = $groundFloorId; target = $boilerId; type = "CONTAINS"; desc = "Ground Floor contains Boiler" }
    @{ source = $groundFloorId; target = $nvrId; type = "CONTAINS"; desc = "Ground Floor contains NVR" }
    @{ source = $groundFloorId; target = $gatewayId; type = "CONTAINS"; desc = "Ground Floor contains Gateway" }
)

$relCount = 0
foreach ($rel in $relationships) {
    $relBody = @{
        source_entity_id = $rel.source
        target_entity_id = $rel.target
        relationship_type = $rel.type
        metadata = @{
            description = $rel.desc
        }
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "$baseUrl/relationships" -Method POST -Headers $headers -Body $relBody | Out-Null
    $relCount++
}
Write-Host "   ✓ Created $relCount equipment/device relationships" -ForegroundColor Green

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║               ✓ Maple Heights Condominium Created             ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "Building Structure:" -ForegroundColor White
Write-Host "  🏢 Maple Heights Condominium" -ForegroundColor Gray
Write-Host "     ├─ 🅿️  Parking Level P1" -ForegroundColor Gray
Write-Host "     │   └─ 📹 Security Camera" -ForegroundColor DarkGray
Write-Host "     ├─ 🏛️  Ground Floor (Lobby & Common Areas)" -ForegroundColor Gray
Write-Host "     │   ├─ 🚪 Main Lobby" -ForegroundColor DarkGray
Write-Host "     │   │   ├─ 📹 Camera 01 (Main Entrance)" -ForegroundColor DarkGray
Write-Host "     │   │   ├─ 📹 Camera 02 (Elevator Bank)" -ForegroundColor DarkGray
Write-Host "     │   │   ├─ 🌡️  BME688 Environmental Sensor" -ForegroundColor DarkGray
Write-Host "     │   │   └─ 🌡️  Smart Thermostat [CONTROLS] → AHU" -ForegroundColor DarkGray
Write-Host "     │   ├─ 📬 Mailroom & Package Center" -ForegroundColor DarkGray
Write-Host "     │   ├─ 💪 Fitness Center" -ForegroundColor DarkGray
Write-Host "     │   ├─ 🎉 Party Room" -ForegroundColor DarkGray
Write-Host "     │   ├─ ❄️  Central Boiler System" -ForegroundColor DarkGray
Write-Host "     │   ├─ 💧 Water Leak Sensor" -ForegroundColor DarkGray
Write-Host "     │   ├─ 📹 NVR [MONITORS] → All Cameras" -ForegroundColor DarkGray
Write-Host "     │   └─ 🌐 IoT Gateway [PROVIDES_SERVICE] → Sensors" -ForegroundColor DarkGray
Write-Host "     ├─ 🏠 Floor 3 (Sample Residential)" -ForegroundColor Gray
Write-Host "     │   ├─ Unit 301 (2BR/2BA)" -ForegroundColor DarkGray
Write-Host "     │   ├─ Unit 302 (2BR/2BA)" -ForegroundColor DarkGray
Write-Host "     │   ├─ Unit 303 (2BR/2BA)" -ForegroundColor DarkGray
Write-Host "     │   └─ Unit 304 (2BR/2BA)" -ForegroundColor DarkGray
Write-Host "     ├─ 🏠 Floors 1-14 (Residential)" -ForegroundColor Gray
Write-Host "     └─ 👑 Penthouse Floor 15" -ForegroundColor Gray
Write-Host "         ├─ Penthouse PH01 (3BR/3BA + Terrace)" -ForegroundColor DarkGray
Write-Host "         └─ Penthouse PH02 (3BR/3BA + Terrace)" -ForegroundColor DarkGray
Write-Host "" -ForegroundColor Gray
Write-Host "  ⚙️  HVAC Systems:" -ForegroundColor Gray
Write-Host "     ├─ ❄️  Central Chiller Unit (Rooftop)" -ForegroundColor DarkGray
Write-Host "     ├─ 🔥 Central Boiler System (Natural Gas)" -ForegroundColor DarkGray
Write-Host "     └─ 💨 Air Handling Unit (Floors 1-5)" -ForegroundColor DarkGray

Write-Host "`nStatistics:" -ForegroundColor Cyan
Write-Host "  • Total Floors: 16 (P1 to Floor 15)" -ForegroundColor Gray
Write-Host "  • Sample Units: 6 (4 regular + 2 penthouses)" -ForegroundColor Gray
Write-Host "  • Common Areas: 4 (Lobby, Mailroom, Gym, Party Room)" -ForegroundColor Gray
Write-Host "  • HVAC Equipment: 3 systems" -ForegroundColor Gray
Write-Host "  • Security Cameras: 3 (+ NVR system)" -ForegroundColor Gray
Write-Host "  • IoT Devices: 3 sensors + 1 gateway" -ForegroundColor Gray
Write-Host "  • Relationships: $relCount connections" -ForegroundColor Gray

Write-Host "`nRelationship Types:" -ForegroundColor Cyan
Write-Host "  ✓ CONTAINS        - Physical containment" -ForegroundColor Gray
Write-Host "  ✓ DEPENDS_ON      - Operational dependency" -ForegroundColor Gray
Write-Host "  ✓ MONITORS        - Surveillance/monitoring" -ForegroundColor Gray
Write-Host "  ✓ CONTROLS        - Device control" -ForegroundColor Gray
Write-Host "  ✓ PROVIDES_SERVICE - Service provision" -ForegroundColor Gray

Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Test Commands:" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

Write-Host "# View full building hierarchy" -ForegroundColor White
Write-Host "curl `"http://localhost:4002/api/v1/relationships/$buildingId/tree`"`n" -ForegroundColor Gray

Write-Host "# Analyze impact if Chiller fails" -ForegroundColor White
Write-Host "curl `"http://localhost:4002/api/v1/graph/impact/$chillerId`"`n" -ForegroundColor Gray

Write-Host "# Get all security cameras" -ForegroundColor White
Write-Host "curl `"http://localhost:4002/api/v1/entities/search?q=camera`"`n" -ForegroundColor Gray

Write-Host "# View topology graph" -ForegroundColor White
Write-Host "curl `"http://localhost:4002/api/v1/graph/topology`"`n" -ForegroundColor Gray

Write-Host "# Find what NVR monitors" -ForegroundColor White
Write-Host "curl `"http://localhost:4002/api/v1/relationships/$nvrId/children`"`n" -ForegroundColor Gray

Write-Host "# Get building status with aggregated metrics" -ForegroundColor White
Write-Host "curl `"http://localhost:4002/api/v1/graph/building/$buildingId/status`"`n" -ForegroundColor Gray

Write-Host "# Check device locations view" -ForegroundColor White
Write-Host "curl `"http://localhost:4002/api/v1/graph/device-locations`"`n" -ForegroundColor Gray

Write-Host "`n✨ Condominium digital twin created successfully!`n" -ForegroundColor Green
