# MQTT Schema Agent + Digital Twin Integration Example

# This script demonstrates how to integrate MQTT schema discovery with the digital twin

$apiUrl = "http://localhost:3002/api/v1"
$digitalTwinUrl = "http://localhost:4002/api/v1"

Write-Host "`n🔗 MQTT Schema + Digital Twin Integration Demo`n" -ForegroundColor Cyan

# Step 1: Ensure MQTT schema agent is running
Write-Host "1️⃣  Checking MQTT Schema Agent status..." -ForegroundColor Yellow
try {
    $status = Invoke-RestMethod -Uri "$apiUrl/mqtt-schema/status"
    if (-not $status.connected) {
        Write-Host "   ⚠️  Agent not connected, starting..." -ForegroundColor Yellow
        Invoke-RestMethod -Uri "$apiUrl/mqtt-schema/start" -Method Post | Out-Null
        Start-Sleep -Seconds 2
    }
    Write-Host "   ✅ MQTT Schema Agent connected" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 2: Simulate publishing sensor data
Write-Host "2️⃣  Publishing test sensor data to MQTT..." -ForegroundColor Yellow

$testMessages = @(
    @{
        topic = "building/maple-heights/floor-14/temperature"
        payload = @{
            value = 22.5
            unit = "celsius"
            sensor_id = "temp-14-01"
            timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        }
    },
    @{
        topic = "building/maple-heights/floor-14/humidity"
        payload = @{
            value = 65
            unit = "percent"
            sensor_id = "hum-14-01"
            timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        }
    },
    @{
        topic = "building/maple-heights/gateway/status"
        payload = @{
            online = $true
            uptime = 3600
            connected_sensors = 12
            timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        }
    }
)

foreach ($msg in $testMessages) {
    $jsonPayload = $msg.payload | ConvertTo-Json -Compress
    Write-Host "   📤 Publishing to $($msg.topic)" -ForegroundColor Cyan
    
    # Using mosquitto_pub (requires Mosquitto installed)
    # mosquitto_pub -h localhost -t $msg.topic -m $jsonPayload
    
    # Alternative: Use MQTT library directly in PowerShell
    Write-Host "      Payload: $jsonPayload" -ForegroundColor Gray
}

Write-Host "   ⚠️  Note: Install mosquitto_pub or use MQTT client to actually publish" -ForegroundColor Yellow
Write-Host ""

# Step 3: Wait for schema discovery
Write-Host "3️⃣  Waiting for schema discovery (5 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Step 4: Get discovered schemas
Write-Host "4️⃣  Fetching discovered MQTT topics..." -ForegroundColor Yellow
try {
    $topics = Invoke-RestMethod -Uri "$apiUrl/mqtt-schema/topics"
    Write-Host "   ✅ Discovered $($topics.count) topics" -ForegroundColor Green
    
    if ($topics.count -eq 0) {
        Write-Host "   ⚠️  No topics discovered. Publish some MQTT messages first." -ForegroundColor Yellow
        Write-Host "   💡 Try: mosquitto_pub -h localhost -t test/topic -m '{""test"":123}'" -ForegroundColor Cyan
        exit 0
    }
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 5: Create entities in digital twin based on discovered topics
Write-Host "5️⃣  Creating digital twin entities from MQTT topics..." -ForegroundColor Yellow

$createdEntities = @()

foreach ($topic in $topics.topics | Where-Object { $_.topic -notlike '$SYS/*' }) {
    Write-Host "`n   📋 Processing topic: $($topic.topic)" -ForegroundColor Cyan
    
    # Parse topic to determine entity type
    $parts = $topic.topic -split '/'
    $entityType = "sensor"
    $entityName = $topic.topic
    
    # Smart entity type detection
    if ($topic.topic -match '/temperature$') {
        $entityType = "sensor"
        $entityName = "Temperature Sensor - $($parts[-2])"
    } elseif ($topic.topic -match '/humidity$') {
        $entityType = "sensor"
        $entityName = "Humidity Sensor - $($parts[-2])"
    } elseif ($topic.topic -match '/gateway/') {
        $entityType = "gateway"
        $entityName = "IoT Gateway - $($parts[-2])"
    } elseif ($topic.topic -match '/device/') {
        $entityType = "device"
        $entityName = "Device - $($parts[-1])"
    }
    
    # Create entity payload
    $entityPayload = @{
        entity_type = $entityType
        name = $entityName
        description = "Auto-discovered from MQTT topic: $($topic.topic)"
        metadata = @{
            mqtt_topic = $topic.topic
            schema = $topic | Select-Object -Property type, properties, items
            discovery_timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
            auto_discovered = $true
        }
    } | ConvertTo-Json -Depth 10
    
    # Create entity in digital twin
    try {
        $entity = Invoke-RestMethod -Uri "$digitalTwinUrl/entities" -Method Post `
            -ContentType "application/json" -Body $entityPayload
        
        Write-Host "      ✅ Created entity: $entityName (ID: $($entity.id))" -ForegroundColor Green
        $createdEntities += $entity
    } catch {
        Write-Host "      ⚠️  Entity may already exist or error: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host ""

# Step 6: Create relationships between entities
Write-Host "6️⃣  Creating relationships..." -ForegroundColor Yellow

if ($createdEntities.Count -ge 2) {
    # Example: Connect sensors to gateway
    $gateway = $createdEntities | Where-Object { $_.entity_type -eq "gateway" } | Select-Object -First 1
    $sensors = $createdEntities | Where-Object { $_.entity_type -eq "sensor" }
    
    if ($gateway -and $sensors) {
        foreach ($sensor in $sensors) {
            $relPayload = @{
                source_entity_id = $gateway.id
                target_entity_id = $sensor.id
                relationship_type = "MONITORS"
                metadata = @{
                    auto_created = $true
                    discovery_method = "mqtt_schema"
                }
            } | ConvertTo-Json
            
            try {
                Invoke-RestMethod -Uri "$digitalTwinUrl/relationships" -Method Post `
                    -ContentType "application/json" -Body $relPayload | Out-Null
                Write-Host "   ✅ Connected: $($gateway.name) → $($sensor.name)" -ForegroundColor Green
            } catch {
                Write-Host "   ⚠️  Relationship may exist: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
}

Write-Host ""

# Step 7: Summary
Write-Host "📊 Integration Summary:" -ForegroundColor Cyan
Write-Host "   • MQTT Topics Discovered: $($topics.count)" -ForegroundColor White
Write-Host "   • Digital Twin Entities Created: $($createdEntities.Count)" -ForegroundColor White
Write-Host "   • Entity Types: $($createdEntities.entity_type | Select-Object -Unique | Join-String -Separator ', ')" -ForegroundColor White
Write-Host ""

Write-Host "🔍 View Results:" -ForegroundColor Yellow
Write-Host "   • Graph Visualization: .\visualize-graph.ps1" -ForegroundColor White
Write-Host "   • MQTT Topics: curl $apiUrl/mqtt-schema/topics" -ForegroundColor White
Write-Host "   • Digital Twin Entities: curl $digitalTwinUrl/entities" -ForegroundColor White
Write-Host ""

Write-Host "💡 Next Steps:" -ForegroundColor Yellow
Write-Host "   1. Publish more sensor data" -ForegroundColor White
Write-Host "   2. Entities will auto-update from MQTT schema changes" -ForegroundColor White
Write-Host "   3. Use graph visualization to see relationships" -ForegroundColor White
Write-Host "   4. Integrate with ML anomaly detection" -ForegroundColor White
Write-Host ""
