# PowerShell script to create a sample building hierarchy with relationships
# This demonstrates the entity-relationship system

$baseUrl = "http://localhost:4002/api/v1"
$headers = @{
    "Content-Type" = "application/json"
}

Write-Host "`n=== Creating Sample Building Hierarchy ===`n" -ForegroundColor Cyan

# Step 1: Create Building (or use existing one)
Write-Host "1. Creating Building..." -ForegroundColor Yellow
$buildingBody = @{
    entity_type = "building"
    name = "Smart Office HQ"
    description = "Main headquarters with IoT sensors"
    metadata = @{
        address = "123 IoT Street"
        square_feet = 50000
    }
} | ConvertTo-Json

$building = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $buildingBody
$buildingId = $building.data.id
Write-Host "   ✓ Building created: $buildingId" -ForegroundColor Green

# Step 2: Create Floors
Write-Host "`n2. Creating Floors..." -ForegroundColor Yellow
$floor1Body = @{
    entity_type = "floor"
    name = "Ground Floor"
    description = "Reception and lobby area"
    metadata = @{
        floor_number = 1
        area_sqft = 15000
    }
} | ConvertTo-Json

$floor1 = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $floor1Body
$floor1Id = $floor1.data.id
Write-Host "   ✓ Floor 1 created: $floor1Id" -ForegroundColor Green

$floor2Body = @{
    entity_type = "floor"
    name = "Second Floor"
    description = "Engineering and development"
    metadata = @{
        floor_number = 2
        area_sqft = 17500
    }
} | ConvertTo-Json

$floor2 = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $floor2Body
$floor2Id = $floor2.data.id
Write-Host "   ✓ Floor 2 created: $floor2Id" -ForegroundColor Green

# Step 3: Create Building -> Floor relationships
Write-Host "`n3. Creating Building -> Floor relationships..." -ForegroundColor Yellow
$rel1Body = @{
    source_entity_id = $buildingId
    target_entity_id = $floor1Id
    relationship_type = "CONTAINS"
    metadata = @{
        created_by = "setup_script"
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/relationships" -Method POST -Headers $headers -Body $rel1Body | Out-Null
Write-Host "   ✓ Building CONTAINS Floor 1" -ForegroundColor Green

$rel2Body = @{
    source_entity_id = $buildingId
    target_entity_id = $floor2Id
    relationship_type = "CONTAINS"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/relationships" -Method POST -Headers $headers -Body $rel2Body | Out-Null
Write-Host "   ✓ Building CONTAINS Floor 2" -ForegroundColor Green

# Step 4: Create Rooms on Floor 1
Write-Host "`n4. Creating Rooms on Floor 1..." -ForegroundColor Yellow
$room101Body = @{
    entity_type = "room"
    name = "Conference Room 101"
    description = "Large meeting room"
    metadata = @{
        room_number = "101"
        capacity = 20
        has_projector = $true
    }
} | ConvertTo-Json

$room101 = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $room101Body
$room101Id = $room101.data.id
Write-Host "   ✓ Room 101 created: $room101Id" -ForegroundColor Green

$room102Body = @{
    entity_type = "room"
    name = "Server Room 102"
    description = "Main data center"
    metadata = @{
        room_number = "102"
        climate_controlled = $true
        access_restricted = $true
    }
} | ConvertTo-Json

$room102 = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $room102Body
$room102Id = $room102.data.id
Write-Host "   ✓ Room 102 created: $room102Id" -ForegroundColor Green

# Step 5: Create Floor 1 -> Room relationships
Write-Host "`n5. Creating Floor 1 -> Room relationships..." -ForegroundColor Yellow
$floorRoom1 = @{
    source_entity_id = $floor1Id
    target_entity_id = $room101Id
    relationship_type = "CONTAINS"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/relationships" -Method POST -Headers $headers -Body $floorRoom1 | Out-Null
Write-Host "   ✓ Floor 1 CONTAINS Room 101" -ForegroundColor Green

$floorRoom2 = @{
    source_entity_id = $floor1Id
    target_entity_id = $room102Id
    relationship_type = "CONTAINS"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/relationships" -Method POST -Headers $headers -Body $floorRoom2 | Out-Null
Write-Host "   ✓ Floor 1 CONTAINS Room 102" -ForegroundColor Green

# Step 6: Create Rooms on Floor 2
Write-Host "`n6. Creating Rooms on Floor 2..." -ForegroundColor Yellow
$room201Body = @{
    entity_type = "room"
    name = "Engineering Lab 201"
    description = "IoT development workspace"
    metadata = @{
        room_number = "201"
        has_workbenches = $true
    }
} | ConvertTo-Json

$room201 = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $room201Body
$room201Id = $room201.data.id
Write-Host "   ✓ Room 201 created: $room201Id" -ForegroundColor Green

$floorRoom3 = @{
    source_entity_id = $floor2Id
    target_entity_id = $room201Id
    relationship_type = "CONTAINS"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/relationships" -Method POST -Headers $headers -Body $floorRoom3 | Out-Null
Write-Host "   ✓ Floor 2 CONTAINS Room 201" -ForegroundColor Green

# Step 7: Create Equipment entities
Write-Host "`n7. Creating Equipment..." -ForegroundColor Yellow
$hvacBody = @{
    entity_type = "equipment"
    name = "HVAC Unit A1"
    description = "Primary climate control system"
    metadata = @{
        model = "ThermoMaster 5000"
        install_date = "2024-01-15"
        maintenance_schedule = "quarterly"
    }
} | ConvertTo-Json

$hvac = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $hvacBody
$hvacId = $hvac.data.id
Write-Host "   ✓ HVAC created: $hvacId" -ForegroundColor Green

# Step 8: Create dependency relationship (Room 102 depends on HVAC)
Write-Host "`n8. Creating dependency relationships..." -ForegroundColor Yellow
$depRel = @{
    source_entity_id = $room102Id
    target_entity_id = $hvacId
    relationship_type = "DEPENDS_ON"
    metadata = @{
        reason = "Server room requires climate control"
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/relationships" -Method POST -Headers $headers -Body $depRel | Out-Null
Write-Host "   ✓ Server Room DEPENDS_ON HVAC" -ForegroundColor Green

# Step 9: Get actual device UUID from your digital twin
Write-Host "`n9. Checking for existing devices..." -ForegroundColor Yellow
try {
    $shadows = Invoke-RestMethod -Uri "$baseUrl/digital-twin"
    if ($shadows.data.Count -gt 0) {
        $deviceUuid = $shadows.data[0].device_uuid
        Write-Host "   ✓ Found device: $deviceUuid" -ForegroundColor Green
        
        # Create device entity and link to shadow
        Write-Host "`n10. Creating device entity and linking to shadow..." -ForegroundColor Yellow
        $deviceBody = @{
            entity_type = "device"
            name = "Temperature Sensor 001"
            description = "BME688 environmental sensor"
            metadata = @{
                sensor_type = "BME688"
                location_detail = "Near window"
            }
        } | ConvertTo-Json
        
        $device = Invoke-RestMethod -Uri "$baseUrl/entities" -Method POST -Headers $headers -Body $deviceBody
        $deviceEntityId = $device.data.id
        Write-Host "   ✓ Device entity created: $deviceEntityId" -ForegroundColor Green
        
        # Link device to shadow
        $linkBody = @{
            device_uuid = $deviceUuid
        } | ConvertTo-Json
        
        Invoke-RestMethod -Uri "$baseUrl/entities/$deviceEntityId/device" -Method POST -Headers $headers -Body $linkBody | Out-Null
        Write-Host "   ✓ Device entity linked to shadow: $deviceUuid" -ForegroundColor Green
        
        # Place device in Room 101
        $deviceRoomRel = @{
            source_entity_id = $room101Id
            target_entity_id = $deviceEntityId
            relationship_type = "CONTAINS"
        } | ConvertTo-Json
        
        Invoke-RestMethod -Uri "$baseUrl/relationships" -Method POST -Headers $headers -Body $deviceRoomRel | Out-Null
        Write-Host "   ✓ Conference Room CONTAINS Temperature Sensor" -ForegroundColor Green
        
        # HVAC monitors the device
        $monitorRel = @{
            source_entity_id = $hvacId
            target_entity_id = $deviceEntityId
            relationship_type = "MONITORS"
            metadata = @{
                metric = "temperature"
            }
        } | ConvertTo-Json
        
        Invoke-RestMethod -Uri "$baseUrl/relationships" -Method POST -Headers $headers -Body $monitorRel | Out-Null
        Write-Host "   ✓ HVAC MONITORS Temperature Sensor" -ForegroundColor Green
    }
    else {
        Write-Host "   ⚠ No device shadows found - skipping device entity creation" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "   ⚠ Could not fetch device shadows - skipping device entity creation" -ForegroundColor Yellow
}

# Summary
Write-Host "`n=== Hierarchy Created Successfully! ===`n" -ForegroundColor Cyan
Write-Host "Structure:" -ForegroundColor White
Write-Host "  Smart Office HQ (Building)" -ForegroundColor Gray
Write-Host "    ├─ Ground Floor" -ForegroundColor Gray
Write-Host "    │   ├─ Conference Room 101" -ForegroundColor Gray
Write-Host "    │   │   └─ Temperature Sensor 001 (if device exists)" -ForegroundColor Gray
Write-Host "    │   └─ Server Room 102 [DEPENDS_ON HVAC]" -ForegroundColor Gray
Write-Host "    └─ Second Floor" -ForegroundColor Gray
Write-Host "        └─ Engineering Lab 201" -ForegroundColor Gray
Write-Host "  HVAC Unit A1 [MONITORS Temperature Sensor]" -ForegroundColor Gray

Write-Host "`nTest Commands:" -ForegroundColor Cyan
Write-Host "  # Get full hierarchy tree" -ForegroundColor White
Write-Host "  curl http://localhost:4002/api/v1/graph/hierarchy/$buildingId" -ForegroundColor Gray
Write-Host "`n  # Get building status with metrics" -ForegroundColor White
Write-Host "  curl http://localhost:4002/api/v1/graph/buildings/$buildingId/status" -ForegroundColor Gray
Write-Host "`n  # Analyze impact if HVAC fails" -ForegroundColor White
Write-Host "  curl http://localhost:4002/api/v1/graph/entities/$hvacId/impact" -ForegroundColor Gray
Write-Host "`n  # View all relationships" -ForegroundColor White
Write-Host "  curl http://localhost:4002/api/v1/relationships" -ForegroundColor Gray
Write-Host "`n  # Get topology for visualization" -ForegroundColor White
Write-Host "  curl http://localhost:4002/api/v1/graph/topology" -ForegroundColor Gray
Write-Host ""
