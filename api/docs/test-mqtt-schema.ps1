# Test MQTT Schema Agent
# Tests the MQTT schema agent API endpoints

$baseUrl = "http://localhost:3002/api/v1/mqtt-schema"

Write-Host "`n🧪 Testing MQTT Schema Agent API`n" -ForegroundColor Cyan

# Test 1: Get status
Write-Host "1️⃣  Testing GET /status" -ForegroundColor Yellow
try {
    $status = Invoke-RestMethod -Uri "$baseUrl/status" -Method Get
    Write-Host "   ✅ Status: Connected=$($status.connected), Topics=$($status.topicCount)" -ForegroundColor Green
    Write-Host "   Response: $(ConvertTo-Json $status -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 2: Start agent (if not already started)
Write-Host "2️⃣  Testing POST /start" -ForegroundColor Yellow
try {
    $startResult = Invoke-RestMethod -Uri "$baseUrl/start" -Method Post
    Write-Host "   ✅ Start: $($startResult.message)" -ForegroundColor Green
    Write-Host "   Response: $(ConvertTo-Json $startResult -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "   ⚠️  Already running or error: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""

# Wait a bit for messages to be received
Write-Host "⏳ Waiting 3 seconds for messages..." -ForegroundColor Cyan
Start-Sleep -Seconds 3

# Test 3: Get discovered topics
Write-Host "3️⃣  Testing GET /topics" -ForegroundColor Yellow
try {
    $topics = Invoke-RestMethod -Uri "$baseUrl/topics" -Method Get
    Write-Host "   ✅ Discovered topics: $($topics.count)" -ForegroundColor Green
    
    if ($topics.count -gt 0) {
        Write-Host "`n   📋 Topics:" -ForegroundColor Cyan
        $topics.topics | Select-Object -First 5 | ForEach-Object {
            Write-Host "      • $($_.topic) - $($_.type)" -ForegroundColor White
        }
        if ($topics.count -gt 5) {
            Write-Host "      ... and $($topics.count - 5) more" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 4: Get broker statistics
Write-Host "4️⃣  Testing GET /stats" -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "$baseUrl/stats" -Method Get
    Write-Host "   ✅ Broker stats:" -ForegroundColor Green
    Write-Host "      • Connected: $($stats.stats.mqtt_connected)" -ForegroundColor White
    Write-Host "      • Connected Clients: $($stats.stats.connectedClients)" -ForegroundColor White
    Write-Host "      • Subscriptions: $($stats.stats.subscriptions)" -ForegroundColor White
    Write-Host "      • User Messages: $($stats.stats.userMessages)" -ForegroundColor White
    Write-Host "      • Messages Sent: $($stats.stats.messagesSent)" -ForegroundColor White
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 5: Get specific topic schema (if any topics discovered)
if ($topics -and $topics.count -gt 0) {
    $testTopic = $topics.topics[0].topic
    $encodedTopic = [System.Uri]::EscapeDataString($testTopic)
    
    Write-Host "5️⃣  Testing GET /topics/:topic (topic: $testTopic)" -ForegroundColor Yellow
    try {
        $schema = Invoke-RestMethod -Uri "$baseUrl/topics/$encodedTopic" -Method Get
        Write-Host "   ✅ Schema retrieved" -ForegroundColor Green
        Write-Host "   Schema: $(ConvertTo-Json $schema.schema -Compress -Depth 10)" -ForegroundColor Gray
    } catch {
        Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n✅ Tests complete!`n" -ForegroundColor Green

# Summary
Write-Host "📊 Summary:" -ForegroundColor Cyan
Write-Host "   • API Base: $baseUrl" -ForegroundColor White
Write-Host "   • Agent Status: $(if($status.connected){'✅ Connected'}else{'❌ Disconnected'})" -ForegroundColor White
Write-Host "   • Topics Discovered: $($topics.count)" -ForegroundColor White
Write-Host ""

Write-Host "💡 Next Steps:" -ForegroundColor Yellow
Write-Host "   1. Publish test messages: mosquitto_pub -h localhost -t test/topic -m '{""test"":123}'" -ForegroundColor White
Write-Host "   2. View topics: curl $baseUrl/topics" -ForegroundColor White
Write-Host "   3. View stats: curl $baseUrl/stats" -ForegroundColor White
Write-Host "   4. Stop agent: curl -X POST $baseUrl/stop" -ForegroundColor White
Write-Host ""
