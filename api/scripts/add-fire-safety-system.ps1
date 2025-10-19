# Fire Safety & Evacuation Planning System for Maple Heights Condominium
# Adds fire detection, suppression, evacuation routes, and emergency systems

$baseUrl = "http://localhost:4002/api/v1"
$headers = @{
    "Content-Type" = "application/json"
}

Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Red
Write-Host "║     Fire Safety & Evacuation System - Maple Heights          ║" -ForegroundColor Red
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Red

# Get the Maple Heights building
Write-Host "🔍 Finding Maple Heights Condominium..." -ForegroundColor Yellow
$buildings = Invoke-RestMethod -Uri "$baseUrl/entities?entity_type=building"
$mapleHeights = $buildings.data | Where-Object { $_.name -eq "Maple Heights Condominium" }

if (-not $mapleHeights) {
    Write-Host "   ❌ Maple Heights not found. Run create-condo-building.ps1 first." -ForegroundColor Red
    exit 1
}

$buildingId = $mapleHeights.id
Write-Host "   ✓ Found building: $buildingId" -ForegroundColor Green

# Get ground floor
$floors = Invoke-RestMethod -Uri "$baseUrl/relationships?source_entity_id=$buildingId&relationship_type=CONTAINS"
$groundFloor = $floors.data | Where-Object { 
    $entity = Invoke-RestMethod -Uri "$baseUrl/entities/$($_.target_entity_id)"
    $entity.data.name -eq "Ground Floor"
} | Select-Object -First 1

$groundFloorId = $groundFloor.target_entity_id
Write-Host "   ✓ Found Ground Floor: $groundFloorId" -ForegroundColor Green

# ============================================================================
# STEP 1: CREATE FIRE DETECTION ZONES
# ============================================================================
Write-Host "`n🔥 STEP 1: Creating Fire Detection Zones..." -ForegroundColor Yellow

$zones = @()

# Zone 1: Lobby & Common Areas
$zone1Body = @{
    entity_type = "zone"
    name = "Fire Zone 1 - Lobby & Common Areas"
    description = "Ground floor public spaces"
    metadata = @{
        zone_type = "fire_detection"
        alarm_panel = "Panel A"
        priority = "high"
        evacuation_route = "Main entrance + rear exit"
    }
} | ConvertTo-Json

$zone1 = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $zone1Body
$zone1Id = $zone1.data.id
$zones += $zone1Id
Write-Host "   ✓ Zone 1 created (Lobby & Common Areas)" -ForegroundColor Green

# Zone 2: Parking
$zone2Body = @{
    entity_type = "zone"
    name = "Fire Zone 2 - Parking Levels"
    description = "Underground parking areas"
    metadata = @{
        zone_type = "fire_detection"
        alarm_panel = "Panel B"
        priority = "high"
        evacuation_route = "Parking ramps + stairwells"
        ventilation_required = $true
    }
} | ConvertTo-Json

$zone2 = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $zone2Body
$zone2Id = $zone2.data.id
$zones += $zone2Id
Write-Host "   ✓ Zone 2 created (Parking)" -ForegroundColor Green

# Zone 3: Residential Floors 1-7
$zone3Body = @{
    entity_type = "zone"
    name = "Fire Zone 3 - Residential Floors 1-7"
    description = "Lower residential floors"
    metadata = @{
        zone_type = "fire_detection"
        alarm_panel = "Panel C"
        priority = "critical"
        evacuation_route = "Stairwells A, B, C"
        max_occupancy = 224
    }
} | ConvertTo-Json

$zone3 = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $zone3Body
$zone3Id = $zone3.data.id
$zones += $zone3Id
Write-Host "   ✓ Zone 3 created (Residential 1-7)" -ForegroundColor Green

# Zone 4: Residential Floors 8-14
$zone4Body = @{
    entity_type = "zone"
    name = "Fire Zone 4 - Residential Floors 8-14"
    description = "Upper residential floors"
    metadata = @{
        zone_type = "fire_detection"
        alarm_panel = "Panel D"
        priority = "critical"
        evacuation_route = "Stairwells A, B, C"
        max_occupancy = 224
    }
} | ConvertTo-Json

$zone4 = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $zone4Body
$zone4Id = $zone4.data.id
$zones += $zone4Id
Write-Host "   ✓ Zone 4 created (Residential 8-14)" -ForegroundColor Green

# Zone 5: Penthouse
$zone5Body = @{
    entity_type = "zone"
    name = "Fire Zone 5 - Penthouse & Rooftop"
    description = "Top floor and rooftop terrace"
    metadata = @{
        zone_type = "fire_detection"
        alarm_panel = "Panel E"
        priority = "critical"
        evacuation_route = "Stairwells A, B + Rooftop helicopter pad"
        max_occupancy = 32
        helicopter_access = $true
    }
} | ConvertTo-Json

$zone5 = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $zone5Body
$zone5Id = $zone5.data.id
$zones += $zone5Id
Write-Host "   ✓ Zone 5 created (Penthouse)" -ForegroundColor Green

# Link zones to building
foreach ($zoneId in $zones) {
    $relBody = @{
        source_entity_id = $buildingId
        target_entity_id = $zoneId
        relationship_type = "CONTAINS"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$baseUrl/relationships" -Method POST -Headers $headers -Body $relBody | Out-Null
}
Write-Host "   ✓ Linked 5 fire zones to building" -ForegroundColor Green

# ============================================================================
# STEP 2: CREATE FIRE ALARM PANELS
# ============================================================================
Write-Host "`n🚨 STEP 2: Creating Fire Alarm Control Panels..." -ForegroundColor Yellow

$panels = @()

# Main Fire Alarm Control Panel
$mainPanelBody = @{
    entity_type = "equipment"
    name = "Main Fire Alarm Control Panel"
    description = "Central fire alarm monitoring and control"
    metadata = @{
        equipment_type = "fire_alarm"
        manufacturer = "Simplex"
        model = "4100ES"
        zones_monitored = 256
        location = "Security Office - Ground Floor"
        uls_certified = $true
        monitoring_station = "Central Station Alarm"
        monitoring_phone = "+1-416-555-FIRE"
    }
} | ConvertTo-Json

$mainPanel = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $mainPanelBody
$mainPanelId = $mainPanel.data.id
$panels += $mainPanelId
Write-Host "   ✓ Main Fire Alarm Panel created" -ForegroundColor Green

# ============================================================================
# STEP 3: CREATE SMOKE DETECTORS
# ============================================================================
Write-Host "`n💨 STEP 3: Creating Smoke Detectors..." -ForegroundColor Yellow

$smokeDetectors = @()

# Lobby smoke detectors
for ($i = 1; $i -le 4; $i++) {
    $detectorBody = @{
        entity_type = "device"
        name = "Smoke Detector - Lobby-$i"
        description = "Photoelectric smoke detector in lobby area"
        metadata = @{
            device_type = "smoke_detector"
            manufacturer = "System Sensor"
            model = "2W-B"
            detection_type = "photoelectric"
            zone = "Zone 1"
            address = "001-$i"
            last_test = "2025-10-01"
            test_frequency_days = 30
        }
    } | ConvertTo-Json
    
    $detector = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $detectorBody
    $smokeDetectors += $detector.data.id
}
Write-Host "   ✓ Created 4 smoke detectors (Lobby)" -ForegroundColor Green

# Parking smoke detectors
for ($i = 1; $i -le 3; $i++) {
    $detectorBody = @{
        entity_type = "device"
        name = "Smoke Detector - Parking P1-$i"
        description = "Heavy-duty smoke detector for parking"
        metadata = @{
            device_type = "smoke_detector"
            manufacturer = "System Sensor"
            model = "2WT-B"
            detection_type = "photoelectric"
            zone = "Zone 2"
            address = "002-$i"
            temperature_rating = "high"
        }
    } | ConvertTo-Json
    
    $detector = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $detectorBody
    $smokeDetectors += $detector.data.id
}
Write-Host "   ✓ Created 3 smoke detectors (Parking)" -ForegroundColor Green

# Hallway smoke detectors (Floor 3 sample)
for ($i = 1; $i -le 2; $i++) {
    $detectorBody = @{
        entity_type = "device"
        name = "Smoke Detector - Floor 3 Hallway-$i"
        description = "Corridor smoke detector"
        metadata = @{
            device_type = "smoke_detector"
            manufacturer = "System Sensor"
            model = "2W-B"
            detection_type = "photoelectric"
            zone = "Zone 3"
            address = "003-$i"
        }
    } | ConvertTo-Json
    
    $detector = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $detectorBody
    $smokeDetectors += $detector.data.id
}
Write-Host "   ✓ Created 2 smoke detectors (Floor 3)" -ForegroundColor Green

# ============================================================================
# STEP 4: CREATE PULL STATIONS
# ============================================================================
Write-Host "`n🔴 STEP 4: Creating Manual Fire Pull Stations..." -ForegroundColor Yellow

$pullStations = @()

# Lobby pull stations
$pullBody = @{
    entity_type = "device"
    name = "Pull Station - Lobby Main Exit"
    description = "Manual fire alarm activation point"
    metadata = @{
        device_type = "pull_station"
        manufacturer = "Simplex"
        model = "4099-9003"
        location = "Near main exit"
        zone = "Zone 1"
        address = "101-1"
        height_inches = 48
    }
} | ConvertTo-Json

$pull1 = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $pullBody
$pullStations += $pull1.data.id
Write-Host "   ✓ Pull Station - Lobby Main Exit" -ForegroundColor Green

# Stairwell pull stations (3 per building)
for ($i = 1; $i -le 3; $i++) {
    $stairLetter = @("A", "B", "C")[$i-1]
    $pullBody = @{
        entity_type = "device"
        name = "Pull Station - Stairwell $stairLetter Ground"
        description = "Manual fire alarm in stairwell"
        metadata = @{
            device_type = "pull_station"
            manufacturer = "Simplex"
            model = "4099-9003"
            location = "Stairwell $stairLetter - Ground Floor"
            zone = "Zone 1"
            address = "101-$($i+1)"
        }
    } | ConvertTo-Json
    
    $pull = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $pullBody
    $pullStations += $pull.data.id
}
Write-Host "   ✓ Created 3 pull stations (Stairwells A, B, C)" -ForegroundColor Green

# ============================================================================
# STEP 5: CREATE FIRE SUPPRESSION SYSTEMS
# ============================================================================
Write-Host "`n💧 STEP 5: Creating Fire Suppression Systems..." -ForegroundColor Yellow

# Sprinkler System
$sprinklerBody = @{
    entity_type = "equipment"
    name = "Wet Pipe Sprinkler System"
    description = "Building-wide automatic sprinkler system"
    metadata = @{
        equipment_type = "fire_suppression"
        manufacturer = "Victaulic"
        system_type = "wet_pipe"
        coverage = "entire_building"
        water_supply = "city_main"
        pressure_psi = 65
        heads_total = 480
        last_inspection = "2025-09-15"
        inspection_frequency = "annual"
    }
} | ConvertTo-Json

$sprinkler = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $sprinklerBody
$sprinklerId = $sprinkler.data.id
Write-Host "   ✓ Sprinkler System created" -ForegroundColor Green

# Fire Pump
$pumpBody = @{
    entity_type = "equipment"
    name = "Fire Pump System"
    description = "Boosts water pressure for upper floors"
    metadata = @{
        equipment_type = "fire_suppression"
        manufacturer = "Patterson"
        type = "electric_motor_driven"
        capacity_gpm = 1500
        pressure_psi = 125
        location = "Mechanical Room - Ground Floor"
        backup_power = $true
        generator_connection = $true
    }
} | ConvertTo-Json

$pump = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $pumpBody
$pumpId = $pump.data.id
Write-Host "   ✓ Fire Pump created" -ForegroundColor Green

# Standpipe System
$standpipeBody = @{
    entity_type = "equipment"
    name = "Standpipe System"
    description = "Firefighter water supply in stairwells"
    metadata = @{
        equipment_type = "fire_suppression"
        class = "Class_I"
        hose_connection_size_inches = 2.5
        locations = @("Stairwell A", "Stairwell B", "Stairwell C")
        floors_served = 16
        roof_connection = $true
    }
} | ConvertTo-Json

$standpipe = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $standpipeBody
$standpipeId = $standpipe.data.id
Write-Host "   ✓ Standpipe System created" -ForegroundColor Green

# ============================================================================
# STEP 6: CREATE EVACUATION ROUTES & EXITS
# ============================================================================
Write-Host "`n🚪 STEP 6: Creating Evacuation Routes & Emergency Exits..." -ForegroundColor Yellow

$exits = @()

# Main Entrance/Exit
$mainExitBody = @{
    entity_type = "room"
    name = "Emergency Exit - Main Entrance"
    description = "Primary building exit"
    metadata = @{
        room_type = "emergency_exit"
        exit_type = "main_entrance"
        width_inches = 96
        direction = "north"
        capacity_per_minute = 120
        exit_signage = "illuminated"
        panic_hardware = $true
        alarm_on_use = $false
    }
} | ConvertTo-Json

$mainExit = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $mainExitBody
$exits += $mainExit.data.id
Write-Host "   ✓ Main Entrance Exit" -ForegroundColor Green

# Rear Emergency Exit
$rearExitBody = @{
    entity_type = "room"
    name = "Emergency Exit - Rear Loading"
    description = "Rear emergency exit to loading area"
    metadata = @{
        room_type = "emergency_exit"
        exit_type = "emergency_only"
        width_inches = 72
        direction = "south"
        capacity_per_minute = 80
        exit_signage = "illuminated"
        panic_hardware = $true
        alarm_on_use = $true
    }
} | ConvertTo-Json

$rearExit = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $rearExitBody
$exits += $rearExit.data.id
Write-Host "   ✓ Rear Emergency Exit" -ForegroundColor Green

# Stairwell A
$stairABody = @{
    entity_type = "room"
    name = "Stairwell A - North"
    description = "Fire-rated emergency stairwell"
    metadata = @{
        room_type = "stairwell"
        fire_rating_hours = 2
        pressurized = $true
        emergency_lighting = $true
        floors_served = 16
        width_inches = 60
        exit_to = "Main entrance"
        roof_access = $true
    }
} | ConvertTo-Json

$stairA = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $stairABody
$stairAId = $stairA.data.id
$exits += $stairAId
Write-Host "   ✓ Stairwell A" -ForegroundColor Green

# Stairwell B
$stairBBody = @{
    entity_type = "room"
    name = "Stairwell B - South"
    description = "Fire-rated emergency stairwell"
    metadata = @{
        room_type = "stairwell"
        fire_rating_hours = 2
        pressurized = $true
        emergency_lighting = $true
        floors_served = 16
        width_inches = 60
        exit_to = "Rear exit"
        roof_access = $true
    }
} | ConvertTo-Json

$stairB = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $stairBBody
$stairBId = $stairB.data.id
$exits += $stairBId
Write-Host "   ✓ Stairwell B" -ForegroundColor Green

# Stairwell C
$stairCBody = @{
    entity_type = "room"
    name = "Stairwell C - West"
    description = "Fire-rated emergency stairwell"
    metadata = @{
        room_type = "stairwell"
        fire_rating_hours = 2
        pressurized = $true
        emergency_lighting = $true
        floors_served = 16
        width_inches = 60
        exit_to = "Side exit - parking level"
        roof_access = $false
    }
} | ConvertTo-Json

$stairC = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $stairCBody
$stairCId = $stairC.data.id
$exits += $stairCId
Write-Host "   ✓ Stairwell C" -ForegroundColor Green

# ============================================================================
# STEP 7: CREATE ASSEMBLY POINTS
# ============================================================================
Write-Host "`n📍 STEP 7: Creating Emergency Assembly Points..." -ForegroundColor Yellow

$assemblyPoints = @()

# Primary Assembly Point
$assembly1Body = @{
    entity_type = "zone"
    name = "Assembly Point 1 - Front Plaza"
    description = "Primary evacuation assembly area"
    metadata = @{
        zone_type = "assembly_point"
        capacity = 500
        location = "Front plaza, 50m from building"
        designation = "primary"
        accessible = $true
        weather_protected = $false
        distance_from_building_meters = 50
    }
} | ConvertTo-Json

$assembly1 = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $assembly1Body
$assemblyPoints += $assembly1.data.id
Write-Host "   ✓ Assembly Point 1 (Front Plaza)" -ForegroundColor Green

# Secondary Assembly Point
$assembly2Body = @{
    entity_type = "zone"
    name = "Assembly Point 2 - Parking Lot North"
    description = "Secondary assembly area for parking evacuees"
    metadata = @{
        zone_type = "assembly_point"
        capacity = 200
        location = "North parking lot surface area"
        designation = "secondary"
        accessible = $true
        weather_protected = $false
        distance_from_building_meters = 75
    }
} | ConvertTo-Json

$assembly2 = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $assembly2Body
$assemblyPoints += $assembly2.data.id
Write-Host "   ✓ Assembly Point 2 (Parking Lot)" -ForegroundColor Green

# ============================================================================
# STEP 8: CREATE EMERGENCY SYSTEMS
# ============================================================================
Write-Host "`n⚡ STEP 8: Creating Emergency Power & Communication..." -ForegroundColor Yellow

# Emergency Generator
$generatorBody = @{
    entity_type = "equipment"
    name = "Emergency Diesel Generator"
    description = "Backup power for life safety systems"
    metadata = @{
        equipment_type = "emergency_power"
        manufacturer = "Cummins"
        model = "C500D6"
        capacity_kw = 500
        fuel_capacity_hours = 48
        auto_start = $true
        systems_powered = @(
            "Fire alarm panel",
            "Emergency lighting",
            "Fire pump",
            "Stairwell pressurization",
            "Elevators (one car for firefighter use)"
        )
        last_test = "2025-10-10"
        test_frequency = "monthly"
    }
} | ConvertTo-Json

$generator = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $generatorBody
$generatorId = $generator.data.id
Write-Host "   ✓ Emergency Generator created" -ForegroundColor Green

# Emergency Voice Communication System
$evacBody = @{
    entity_type = "equipment"
    name = "Emergency Voice/Alarm Communication System"
    description = "Public address system for emergency announcements"
    metadata = @{
        equipment_type = "emergency_communication"
        manufacturer = "Simplex"
        model = "TrueAlert ES"
        zones = 16
        speakers_total = 120
        firefighter_phone_locations = 16
        two_way_communication = $true
        backup_battery_hours = 24
    }
} | ConvertTo-Json

$evac = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $evacBody
$evacId = $evac.data.id
Write-Host "   ✓ Emergency Communication System created" -ForegroundColor Green

# Fire Department Connection (FDC)
$fdcBody = @{
    entity_type = "equipment"
    name = "Fire Department Connection"
    description = "External connection for fire department to boost water pressure"
    metadata = @{
        equipment_type = "fire_suppression"
        type = "siamese_connection"
        location = "Front of building, near main entrance"
        inlet_size_inches = 2.5
        outlets = 2
        connects_to = @("Sprinkler system", "Standpipe system")
        marked = "SPRINKLER & STANDPIPE"
    }
} | ConvertTo-Json

$fdc = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $fdcBody
$fdcId = $fdc.data.id
Write-Host "   ✓ Fire Department Connection created" -ForegroundColor Green

# ============================================================================
# STEP 9: CREATE RELATIONSHIPS
# ============================================================================
Write-Host "`n🔗 STEP 9: Creating Fire Safety Relationships..." -ForegroundColor Yellow

$relationships = @(
    # Fire alarm panel monitors all smoke detectors
    @{ source = $mainPanelId; target = $smokeDetectors[0]; type = "MONITORS"; desc = "Panel monitors smoke detectors" }
    @{ source = $mainPanelId; target = $smokeDetectors[1]; type = "MONITORS"; desc = "Panel monitors smoke detectors" }
    @{ source = $mainPanelId; target = $smokeDetectors[2]; type = "MONITORS"; desc = "Panel monitors smoke detectors" }
    
    # Fire alarm panel monitors pull stations
    @{ source = $mainPanelId; target = $pullStations[0]; type = "MONITORS"; desc = "Panel monitors pull stations" }
    @{ source = $mainPanelId; target = $pullStations[1]; type = "MONITORS"; desc = "Panel monitors pull stations" }
    
    # Sprinkler system depends on fire pump
    @{ source = $sprinklerId; target = $pumpId; type = "DEPENDS_ON"; desc = "Sprinkler needs pump for upper floors" }
    
    # Fire pump depends on emergency generator
    @{ source = $pumpId; target = $generatorId; type = "DEPENDS_ON"; desc = "Pump needs backup power" }
    
    # Fire alarm panel depends on emergency generator
    @{ source = $mainPanelId; target = $generatorId; type = "DEPENDS_ON"; desc = "Alarm needs backup power" }
    
    # Emergency communication depends on generator
    @{ source = $evacId; target = $generatorId; type = "DEPENDS_ON"; desc = "Voice system needs backup power" }
    
    # Stairwells provide exit routes
    @{ source = $stairAId; target = $mainExit.data.id; type = "COMMUNICATES_WITH"; desc = "Stairwell A exits to main entrance" }
    @{ source = $stairBId; target = $rearExit.data.id; type = "COMMUNICATES_WITH"; desc = "Stairwell B exits to rear" }
    
    # Fire pump powers suppression systems
    @{ source = $pumpId; target = $standpipeId; type = "POWERS"; desc = "Pump provides water pressure to standpipes" }
    
    # Ground floor contains exits and equipment
    @{ source = $groundFloorId; target = $mainExit.data.id; type = "CONTAINS"; desc = "Ground floor contains main exit" }
    @{ source = $groundFloorId; target = $rearExit.data.id; type = "CONTAINS"; desc = "Ground floor contains rear exit" }
    @{ source = $groundFloorId; target = $mainPanelId; type = "CONTAINS"; desc = "Ground floor contains fire panel" }
    @{ source = $groundFloorId; target = $generatorId; type = "CONTAINS"; desc = "Ground floor contains generator" }
    @{ source = $groundFloorId; target = $pumpId; type = "CONTAINS"; desc = "Ground floor contains fire pump" }
    
    # Building contains stairwells and assembly points
    @{ source = $buildingId; target = $stairAId; type = "CONTAINS"; desc = "Building contains stairwell" }
    @{ source = $buildingId; target = $stairBId; type = "CONTAINS"; desc = "Building contains stairwell" }
    @{ source = $buildingId; target = $stairCId; type = "CONTAINS"; desc = "Building contains stairwell" }
)

$relCount = 0
foreach ($rel in $relationships) {
    try {
        $relBody = @{
            source_entity_id = $rel.source
            target_entity_id = $rel.target
            relationship_type = $rel.type
            metadata = @{
                description = $rel.desc
                category = "fire_safety"
            }
        } | ConvertTo-Json
        
        Invoke-RestMethod -Uri "$baseUrl/relationships" -Method POST -Headers $headers -Body $relBody | Out-Null
        $relCount++
    }
    catch {
        Write-Host "   ⚠ Relationship already exists or error: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
}
Write-Host "   ✓ Created $relCount fire safety relationships" -ForegroundColor Green

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Red
Write-Host "║          ✓ Fire Safety System Created Successfully           ║" -ForegroundColor Red
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Red

Write-Host "Fire Safety Components:" -ForegroundColor White
Write-Host "  🔥 Fire Detection Zones: 5" -ForegroundColor Gray
Write-Host "     • Lobby & Common Areas" -ForegroundColor DarkGray
Write-Host "     • Parking Levels" -ForegroundColor DarkGray
Write-Host "     • Residential Floors 1-7" -ForegroundColor DarkGray
Write-Host "     • Residential Floors 8-14" -ForegroundColor DarkGray
Write-Host "     • Penthouse & Rooftop" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  🚨 Detection Devices: 13" -ForegroundColor Gray
Write-Host "     • Smoke Detectors: 9" -ForegroundColor DarkGray
Write-Host "     • Pull Stations: 4" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  💧 Suppression Systems: 4" -ForegroundColor Gray
Write-Host "     • Wet Pipe Sprinkler System (480 heads)" -ForegroundColor DarkGray
Write-Host "     • Fire Pump (1500 GPM)" -ForegroundColor DarkGray
Write-Host "     • Standpipe System (3 stairwells)" -ForegroundColor DarkGray
Write-Host "     • Fire Department Connection" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  🚪 Evacuation Routes: 5" -ForegroundColor Gray
Write-Host "     • Stairwell A (North)" -ForegroundColor DarkGray
Write-Host "     • Stairwell B (South)" -ForegroundColor DarkGray
Write-Host "     • Stairwell C (West)" -ForegroundColor DarkGray
Write-Host "     • Main Entrance Exit" -ForegroundColor DarkGray
Write-Host "     • Rear Emergency Exit" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  📍 Assembly Points: 2" -ForegroundColor Gray
Write-Host "     • Front Plaza (Primary, 500 capacity)" -ForegroundColor DarkGray
Write-Host "     • Parking Lot North (Secondary, 200 capacity)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  ⚡ Emergency Systems: 3" -ForegroundColor Gray
Write-Host "     • Diesel Generator (500 kW, 48hr fuel)" -ForegroundColor DarkGray
Write-Host "     • Emergency Voice/Alarm System" -ForegroundColor DarkGray
Write-Host "     • Fire Alarm Control Panel (256 zones)" -ForegroundColor DarkGray

Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Red
Write-Host "Evacuation Planning Queries:" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Red

Write-Host "# Analyze impact if Fire Pump fails" -ForegroundColor White
Write-Host "curl `"http://localhost:4002/api/v1/graph/impact/$pumpId`"`n" -ForegroundColor Gray

Write-Host "# Analyze impact if Emergency Generator fails" -ForegroundColor White
Write-Host "curl `"http://localhost:4002/api/v1/graph/impact/$generatorId`"`n" -ForegroundColor Gray

Write-Host "# Find all fire detection devices" -ForegroundColor White
Write-Host "curl `"http://localhost:4002/api/v1/entities/search?q=smoke`"`n" -ForegroundColor Gray

Write-Host "# Get all evacuation routes (stairwells)" -ForegroundColor White
Write-Host "curl `"http://localhost:4002/api/v1/entities/search?q=stairwell`"`n" -ForegroundColor Gray

Write-Host "# View complete fire safety topology" -ForegroundColor White
Write-Host "curl `"http://localhost:4002/api/v1/graph/topology?type=equipment`"`n" -ForegroundColor Gray

Write-Host "# Get all emergency exits" -ForegroundColor White
Write-Host "curl `"http://localhost:4002/api/v1/entities/search?q=exit`"`n" -ForegroundColor Gray

Write-Host "# Find dependencies for fire alarm panel" -ForegroundColor White
Write-Host "curl `"http://localhost:4002/api/v1/relationships/$mainPanelId/descendants`"`n" -ForegroundColor Gray

Write-Host "`n🔥 Fire evacuation planning system ready!" -ForegroundColor Green
Write-Host "   Use these entities to:" -ForegroundColor White
Write-Host "   • Map evacuation routes per floor" -ForegroundColor Gray
Write-Host "   • Calculate evacuation times" -ForegroundColor Gray
Write-Host "   • Identify critical failure points" -ForegroundColor Gray
Write-Host "   • Plan firefighter access routes" -ForegroundColor Gray
Write-Host "   • Simulate emergency scenarios" -ForegroundColor Gray
Write-Host ""
