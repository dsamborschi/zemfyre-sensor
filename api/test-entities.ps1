#Requires -Version 5.1

<#
.SYNOPSIS
    Test script for Digital Twin Entity/Relationship API

.DESCRIPTION
    Comprehensive test suite for validating entity, relationship, and graph endpoints.
    Creates a test hierarchy, validates operations, and cleans up.

.EXAMPLE
    .\test-entities.ps1
    
.EXAMPLE
    .\test-entities.ps1 -BaseUrl "http://production-api:4002"
#>

param(
    [string]$BaseUrl = "http://localhost:4002",
    [switch]$SkipCleanup
)

$ErrorActionPreference = "Continue"
$API_BASE = "$BaseUrl/api/v1"

# Color output functions
function Write-Success { param($Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Error-Custom { param($Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Info { param($Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Step { param($Message) Write-Host "`n🔹 $Message" -ForegroundColor Yellow }

# API Helper
function Invoke-ApiRequest {
    param(
        [string]$Method = "GET",
        [string]$Endpoint,
        [object]$Body = $null
    )
    
    $uri = "$API_BASE$Endpoint"
    $params = @{
        Uri = $uri
        Method = $Method
        Headers = @{ "Content-Type" = "application/json" }
        ErrorAction = "Stop"
    }
    
    if ($Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }
    
    try {
        $response = Invoke-RestMethod @params
        return $response
    } catch {
        Write-Error-Custom "API Error: $_"
        Write-Error-Custom "Response: $($_.ErrorDetails.Message)"
        throw
    }
}

# Test tracking
$script:TestsPassed = 0
$script:TestsFailed = 0
$script:CreatedEntities = @()
$script:CreatedRelationships = @()

function Test-Assertion {
    param(
        [string]$TestName,
        [scriptblock]$Test
    )
    
    try {
        $result = & $Test
        if ($result) {
            Write-Success $TestName
            $script:TestsPassed++
        } else {
            Write-Error-Custom "$TestName - Assertion failed"
            $script:TestsFailed++
        }
    } catch {
        Write-Error-Custom "$TestName - Exception: $_"
        $script:TestsFailed++
    }
}

Write-Host "`n================================================" -ForegroundColor Magenta
Write-Host "  Digital Twin Entity/Relationship API Tests" -ForegroundColor Magenta
Write-Host "================================================`n" -ForegroundColor Magenta
Write-Info "API Base URL: $API_BASE"

# ============================================================================
# TEST 1: Entity Types
# ============================================================================
Write-Step "TEST 1: Get Entity Types"

try {
    $types = Invoke-ApiRequest -Endpoint "/entities/types"
    
    Test-Assertion "Entity types endpoint returns success" {
        $types.success -eq $true
    }
    
    Test-Assertion "At least 7 entity types exist" {
        $types.data.Count -ge 7
    }
    
    Test-Assertion "Building type exists" {
        $types.data | Where-Object { $_.name -eq "building" }
    }
    
    Write-Info "Found $($types.data.Count) entity types"
} catch {
    Write-Error-Custom "Failed to get entity types: $_"
}

# ============================================================================
# TEST 2: Create Entities
# ============================================================================
Write-Step "TEST 2: Create Entity Hierarchy"

try {
    # Create building
    $building = Invoke-ApiRequest -Method POST -Endpoint "/entities" -Body @{
        entity_type = "building"
        name = "Test HQ"
        metadata = @{
            address = "123 Test St"
            floors = 3
        }
    }
    
    Test-Assertion "Building created successfully" {
        $building.success -eq $true
    }
    
    $script:CreatedEntities += $building.data.id
    Write-Info "Created building: $($building.data.id)"
    
    # Create floor
    $floor = Invoke-ApiRequest -Method POST -Endpoint "/entities" -Body @{
        entity_type = "floor"
        name = "Floor 1"
        metadata = @{
            level = 1
        }
    }
    
    Test-Assertion "Floor created successfully" {
        $floor.success -eq $true
    }
    
    $script:CreatedEntities += $floor.data.id
    Write-Info "Created floor: $($floor.data.id)"
    
    # Create room
    $room = Invoke-ApiRequest -Method POST -Endpoint "/entities" -Body @{
        entity_type = "room"
        name = "Server Room"
        metadata = @{
            number = "101"
            purpose = "IT Infrastructure"
        }
    }
    
    Test-Assertion "Room created successfully" {
        $room.success -eq $true
    }
    
    $script:CreatedEntities += $room.data.id
    Write-Info "Created room: $($room.data.id)"
    
    # Create device entity
    $device = Invoke-ApiRequest -Method POST -Endpoint "/entities" -Body @{
        entity_type = "device"
        name = "Test Temperature Sensor"
        metadata = @{
            type = "temperature"
            location = "Rack 3"
        }
    }
    
    Test-Assertion "Device entity created successfully" {
        $device.success -eq $true
    }
    
    $script:CreatedEntities += $device.data.id
    Write-Info "Created device: $($device.data.id)"
    
} catch {
    Write-Error-Custom "Failed to create entities: $_"
}

# ============================================================================
# TEST 3: Create Relationships
# ============================================================================
Write-Step "TEST 3: Create Relationships"

try {
    # Building CONTAINS Floor
    $rel1 = Invoke-ApiRequest -Method POST -Endpoint "/relationships" -Body @{
        source_entity_id = $building.data.id
        target_entity_id = $floor.data.id
        relationship_type = "CONTAINS"
    }
    
    Test-Assertion "Building-Floor relationship created" {
        $rel1.success -eq $true
    }
    
    $script:CreatedRelationships += $rel1.data.id
    
    # Floor CONTAINS Room
    $rel2 = Invoke-ApiRequest -Method POST -Endpoint "/relationships" -Body @{
        source_entity_id = $floor.data.id
        target_entity_id = $room.data.id
        relationship_type = "CONTAINS"
    }
    
    Test-Assertion "Floor-Room relationship created" {
        $rel2.success -eq $true
    }
    
    $script:CreatedRelationships += $rel2.data.id
    
    # Room CONTAINS Device
    $rel3 = Invoke-ApiRequest -Method POST -Endpoint "/relationships" -Body @{
        source_entity_id = $room.data.id
        target_entity_id = $device.data.id
        relationship_type = "CONTAINS"
    }
    
    Test-Assertion "Room-Device relationship created" {
        $rel3.success -eq $true
    }
    
    $script:CreatedRelationships += $rel3.data.id
    
    Write-Info "Created 3 relationships"
    
} catch {
    Write-Error-Custom "Failed to create relationships: $_"
}

# ============================================================================
# TEST 4: Query Hierarchy
# ============================================================================
Write-Step "TEST 4: Query Hierarchy"

try {
    # Get children
    $children = Invoke-ApiRequest -Endpoint "/relationships/$($building.data.id)/children"
    
    Test-Assertion "Building has children" {
        $children.data.Count -gt 0
    }
    
    # Get descendants
    $descendants = Invoke-ApiRequest -Endpoint "/relationships/$($building.data.id)/descendants"
    
    Test-Assertion "Building has 3 descendants" {
        $descendants.data.Count -eq 3
    }
    
    # Get parent
    $parent = Invoke-ApiRequest -Endpoint "/relationships/$($room.data.id)/parent"
    
    Test-Assertion "Room has parent (Floor)" {
        $parent.data.id -eq $floor.data.id
    }
    
    # Get ancestors
    $ancestors = Invoke-ApiRequest -Endpoint "/relationships/$($device.data.id)/ancestors"
    
    Test-Assertion "Device has 3 ancestors" {
        $ancestors.data.Count -eq 3
    }
    
    Write-Info "Hierarchy queries successful"
    
} catch {
    Write-Error-Custom "Failed hierarchy queries: $_"
}

# ============================================================================
# TEST 5: Get Hierarchy Tree
# ============================================================================
Write-Step "TEST 5: Get Hierarchy Tree"

try {
    $tree = Invoke-ApiRequest -Endpoint "/graph/tree/$($building.data.id)"
    
    Test-Assertion "Tree returned successfully" {
        $tree.success -eq $true
    }
    
    Test-Assertion "Tree has root" {
        $tree.data.root -ne $null
    }
    
    Test-Assertion "Tree total descendants = 3" {
        $tree.data.total_descendants -eq 3
    }
    
    Write-Info "Hierarchy tree structure validated"
    Write-Host "`n  Tree Structure:" -ForegroundColor Gray
    Write-Host "  - $($tree.data.root.name)" -ForegroundColor Gray
    Write-Host "    - Floor 1" -ForegroundColor Gray
    Write-Host "      - Server Room" -ForegroundColor Gray
    Write-Host "        - Test Temperature Sensor" -ForegroundColor Gray
    
} catch {
    Write-Error-Custom "Failed to get tree: $_"
}

# ============================================================================
# TEST 6: Graph Topology
# ============================================================================
Write-Step "TEST 6: Get Graph Topology"

try {
    $topology = Invoke-ApiRequest -Endpoint "/graph/topology"
    
    Test-Assertion "Topology returned successfully" {
        $topology.success -eq $true
    }
    
    Test-Assertion "Topology has nodes" {
        $topology.data.nodes.Count -gt 0
    }
    
    Test-Assertion "Topology has edges" {
        $topology.data.edges.Count -gt 0
    }
    
    Write-Info "Graph topology contains $($topology.node_count) nodes and $($topology.edge_count) edges"
    
} catch {
    Write-Error-Custom "Failed to get topology: $_"
}

# ============================================================================
# TEST 7: Graph Metrics
# ============================================================================
Write-Step "TEST 7: Get Aggregate Metrics"

try {
    $metrics = Invoke-ApiRequest -Endpoint "/graph/metrics/$($building.data.id)"
    
    Test-Assertion "Metrics returned successfully" {
        $metrics.success -eq $true
    }
    
    Test-Assertion "Metrics has device count" {
        $metrics.data.device_count -ne $null
    }
    
    Write-Info "Building has $($metrics.data.device_count) devices"
    
} catch {
    Write-Error-Custom "Failed to get metrics: $_"
}

# ============================================================================
# TEST 8: Search Entities
# ============================================================================
Write-Step "TEST 8: Search Entities"

try {
    $search = Invoke-ApiRequest -Endpoint "/entities/search?q=Test"
    
    Test-Assertion "Search returned results" {
        $search.data.Count -gt 0
    }
    
    Write-Info "Found $($search.count) entities matching 'Test'"
    
} catch {
    Write-Error-Custom "Failed search: $_"
}

# ============================================================================
# TEST 9: Get Statistics
# ============================================================================
Write-Step "TEST 9: Get Graph Statistics"

try {
    $stats = Invoke-ApiRequest -Endpoint "/graph/statistics"
    
    Test-Assertion "Statistics returned successfully" {
        $stats.success -eq $true
    }
    
    Test-Assertion "Has entities by type" {
        $stats.data.entities_by_type -ne $null
    }
    
    Test-Assertion "Has relationships by type" {
        $stats.data.relationships_by_type -ne $null
    }
    
    Write-Info "Total entities: $($stats.data.total_entities)"
    Write-Info "Total relationships: $($stats.data.total_relationships)"
    
} catch {
    Write-Error-Custom "Failed to get statistics: $_"
}

# ============================================================================
# TEST 10: Update Entity
# ============================================================================
Write-Step "TEST 10: Update Entity"

try {
    $updated = Invoke-ApiRequest -Method PUT -Endpoint "/entities/$($building.data.id)" -Body @{
        name = "Test HQ (Updated)"
        metadata = @{
            address = "456 Updated St"
            floors = 5
        }
    }
    
    Test-Assertion "Entity updated successfully" {
        $updated.success -eq $true -and $updated.data.name -eq "Test HQ (Updated)"
    }
    
    Write-Info "Entity updated successfully"
    
} catch {
    Write-Error-Custom "Failed to update entity: $_"
}

# ============================================================================
# CLEANUP
# ============================================================================
if (-not $SkipCleanup) {
    Write-Step "Cleanup: Deleting Test Data"
    
    try {
        # Delete relationships first (foreign key constraints)
        foreach ($relId in $script:CreatedRelationships) {
            $null = Invoke-ApiRequest -Method DELETE -Endpoint "/relationships/$relId"
        }
        Write-Info "Deleted $($script:CreatedRelationships.Count) relationships"
        
        # Delete entities (in reverse order)
        [array]::Reverse($script:CreatedEntities)
        foreach ($entityId in $script:CreatedEntities) {
            $null = Invoke-ApiRequest -Method DELETE -Endpoint "/entities/$entityId"
        }
        Write-Info "Deleted $($script:CreatedEntities.Count) entities"
        
        Write-Success "Cleanup completed"
        
    } catch {
        Write-Error-Custom "Cleanup failed: $_"
    }
} else {
    Write-Info "Skipping cleanup (use -SkipCleanup to keep test data)"
    Write-Info "Created entities: $($script:CreatedEntities -join ', ')"
}

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host "`n================================================" -ForegroundColor Magenta
Write-Host "  Test Summary" -ForegroundColor Magenta
Write-Host "================================================" -ForegroundColor Magenta

$totalTests = $script:TestsPassed + $script:TestsFailed
$successRate = if ($totalTests -gt 0) { [math]::Round(($script:TestsPassed / $totalTests) * 100, 2) } else { 0 }

Write-Host "`nTotal Tests: $totalTests" -ForegroundColor White
Write-Host "Passed: $($script:TestsPassed)" -ForegroundColor Green
Write-Host "Failed: $($script:TestsFailed)" -ForegroundColor Red
Write-Host "Success Rate: $successRate%" -ForegroundColor $(if ($successRate -eq 100) { "Green" } else { "Yellow" })

if ($script:TestsFailed -eq 0) {
    Write-Host "`n🎉 All tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n⚠️  Some tests failed. Check output above." -ForegroundColor Yellow
    exit 1
}
