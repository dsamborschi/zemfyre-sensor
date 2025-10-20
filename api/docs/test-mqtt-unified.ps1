# Test Unified MQTT Monitoring Service
# Tests topic tree, metrics, and schema generation in one service

$baseUrl = "http://localhost:3002/api/v1/mqtt-monitor"

Write-Host "`n🧪 Testing Unified MQTT Monitoring Service`n" -ForegroundColor Cyan

# Test 1: Status
Write-Host "1️⃣  GET /status" -ForegroundColor Yellow
try {
    $status = Invoke-RestMethod -Uri "$baseUrl/status"
    Write-Host "   ✅ Connected: $($status.data.connected)" -ForegroundColor Green
    Write-Host "   Topics: $($status.data.topicCount), Messages: $($status.data.messageCount)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Start service
Write-Host "2️⃣  POST /start" -ForegroundColor Yellow
try {
    $start = Invoke-RestMethod -Uri "$baseUrl/start" -Method Post
    Write-Host "   ✅ $($start.message)" -ForegroundColor Green
    Start-Sleep -Seconds 3
} catch {
    Write-Host "   ⚠️  $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

# Test 3: Topic Tree
Write-Host "3️⃣  GET /topic-tree" -ForegroundColor Yellow
try {
    $tree = Invoke-RestMethod -Uri "$baseUrl/topic-tree"
    Write-Host "   ✅ Tree loaded: $($tree.data._messagesCounter) total messages" -ForegroundColor Green
    
    # Show tree structure
    function Show-TreeNode($node, $indent = "") {
        $keys = $node.PSObject.Properties.Name | Where-Object { -not $_.StartsWith('_') }
        foreach ($key in $keys | Select-Object -First 3) {
            $child = $node.$key
            Write-Host "   $indent📁 $key (msgs: $($child._messagesCounter))" -ForegroundColor Cyan
            if ($child._schema) {
                Write-Host "   $indent   🔷 Has Schema" -ForegroundColor Blue
            }
        }
    }
    
    Show-TreeNode $tree.data
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Topics with Schemas
Write-Host "4️⃣  GET /topics (with schemas)" -ForegroundColor Yellow
try {
    $topics = Invoke-RestMethod -Uri "$baseUrl/topics"
    Write-Host "   ✅ Topics: $($topics.count)" -ForegroundColor Green
    
    # Group by message type
    $byType = $topics.data | Group-Object messageType
    Write-Host "`n   📊 Topics by type:" -ForegroundColor Cyan
    foreach ($group in $byType) {
        $typeName = if ($group.Name) { $group.Name } else { "unknown" }
        Write-Host "      • $typeName`: $($group.Count)" -ForegroundColor White
    }
    
    # Show JSON topics with schemas
    $jsonWithSchemas = $topics.data | Where-Object { $_.messageType -eq 'json' -and $_.schema }
    if ($jsonWithSchemas.Count -gt 0) {
        Write-Host "`n   🔷 JSON topics with schemas:" -ForegroundColor Cyan
        $jsonWithSchemas | Select-Object -First 3 | ForEach-Object {
            Write-Host "      • $($_.topic)" -ForegroundColor White
            Write-Host "        Schema: $($_.schema.type) with $($_.schema.properties.Count) properties" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 5: Get specific topic schema
if ($topics -and $topics.data.Count -gt 0) {
    $jsonTopic = $topics.data | Where-Object { $_.messageType -eq 'json' } | Select-Object -First 1
    
    if ($jsonTopic) {
        Write-Host "5️⃣  GET /topics/:topic/schema" -ForegroundColor Yellow
        $encodedTopic = [System.Uri]::EscapeDataString($jsonTopic.topic)
        
        try {
            $schema = Invoke-RestMethod -Uri "$baseUrl/topics/$encodedTopic/schema"
            Write-Host "   ✅ Schema for: $($jsonTopic.topic)" -ForegroundColor Green
            Write-Host "   Type: $($schema.data.messageType)" -ForegroundColor Gray
            if ($schema.data.schema) {
                Write-Host "   Schema: $(ConvertTo-Json $schema.data.schema -Compress -Depth 5)" -ForegroundColor Gray
            }
        } catch {
            Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
        }
        Write-Host ""
    }
}

# Test 6: Metrics
Write-Host "6️⃣  GET /metrics" -ForegroundColor Yellow
try {
    $metrics = Invoke-RestMethod -Uri "$baseUrl/metrics"
    Write-Host "   ✅ Metrics retrieved" -ForegroundColor Green
    Write-Host "`n   📈 Current rates:" -ForegroundColor Cyan
    Write-Host "      • Messages/sec: Published=$($metrics.data.messageRate.current.published), Received=$($metrics.data.messageRate.current.received)" -ForegroundColor White
    Write-Host "      • Throughput: Out=$($metrics.data.throughput.current.outbound) KB/s, In=$($metrics.data.throughput.current.inbound) KB/s" -ForegroundColor White
    Write-Host "`n   👥 Connections:" -ForegroundColor Cyan
    Write-Host "      • Clients: $($metrics.data.clients)" -ForegroundColor White
    Write-Host "      • Subscriptions: $($metrics.data.subscriptions)" -ForegroundColor White
    Write-Host "      • Retained Messages: $($metrics.data.retainedMessages)" -ForegroundColor White
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 6b: Stats (comprehensive)
Write-Host "6️⃣ b GET /stats (comprehensive)" -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "$baseUrl/stats"
    Write-Host "   ✅ Comprehensive stats retrieved" -ForegroundColor Green
    Write-Host "`n   📊 Schema Statistics:" -ForegroundColor Cyan
    Write-Host "      • Topics with schemas: $($stats.stats.schemas.total)" -ForegroundColor White
    Write-Host "      • By type: JSON=$($stats.stats.schemas.byType.json), String=$($stats.stats.schemas.byType.string)" -ForegroundColor White
    Write-Host "`n   📈 Performance:" -ForegroundColor Cyan
    Write-Host "      • Message Rate: $($stats.stats.messageRate.published) pub/s, $($stats.stats.messageRate.received) rec/s" -ForegroundColor White
    Write-Host "      • Throughput: $($stats.stats.throughput.outbound) KB/s out, $($stats.stats.throughput.inbound) KB/s in" -ForegroundColor White
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 7: Dashboard (unified endpoint)
Write-Host "7️⃣  GET /dashboard (unified)" -ForegroundColor Yellow
try {
    $dashboard = Invoke-RestMethod -Uri "$baseUrl/dashboard"
    Write-Host "   ✅ Dashboard loaded" -ForegroundColor Green
    
    $d = $dashboard.data
    Write-Host "`n   📊 Complete Dashboard Summary:" -ForegroundColor Cyan
    Write-Host "      🔌 Status:" -ForegroundColor Yellow
    Write-Host "         • Connected: $($d.status.connected)" -ForegroundColor White
    Write-Host "         • Topics: $($d.topics.count)" -ForegroundColor White
    Write-Host "         • With Schemas: $($d.topics.withSchemas)" -ForegroundColor White
    Write-Host "         • Messages: $($d.status.messageCount)" -ForegroundColor White
    
    Write-Host "`n      📈 Metrics:" -ForegroundColor Yellow
    Write-Host "         • Msg Rate: $($d.metrics.messageRate.current.published) pub/s, $($d.metrics.messageRate.current.received) rec/s" -ForegroundColor White
    Write-Host "         • Throughput: $($d.metrics.throughput.current.outbound) KB/s out, $($d.metrics.throughput.current.inbound) KB/s in" -ForegroundColor White
    Write-Host "         • Clients: $($d.metrics.clients)" -ForegroundColor White
    Write-Host "         • Total Sent: $($d.metrics.totalMessages.sent)" -ForegroundColor White
    
    Write-Host "`n      🌳 Topic Tree:" -ForegroundColor Yellow
    Write-Host "         • Root Messages: $($d.topicTree._messagesCounter)" -ForegroundColor White
    Write-Host "         • Root Topics: $($d.topicTree._topicsCounter)" -ForegroundColor White
    
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 8: System Stats
Write-Host "8️⃣  GET /system-stats" -ForegroundColor Yellow
try {
    $sysStats = Invoke-RestMethod -Uri "$baseUrl/system-stats"
    Write-Host "   ✅ System stats retrieved" -ForegroundColor Green
    
    $sys = $sysStats.data.'$SYS'.broker
    if ($sys) {
        Write-Host "`n   🔧 Broker Stats:" -ForegroundColor Cyan
        Write-Host "      • Messages Sent: $($sys.messages.sent)" -ForegroundColor White
        Write-Host "      • Messages Received: $($sys.messages.received)" -ForegroundColor White
        Write-Host "      • Connected Clients: $($sys.clients.connected)" -ForegroundColor White
    }
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Summary
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ Unified MQTT Monitoring Service Tests Complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Write-Host "📊 Summary:" -ForegroundColor Yellow
if ($dashboard) {
    Write-Host "   • Total Topics: $($dashboard.data.topics.count)" -ForegroundColor White
    Write-Host "   • With JSON Schemas: $($dashboard.data.topics.withSchemas)" -ForegroundColor White
    Write-Host "   • Connected: $($dashboard.data.status.connected)" -ForegroundColor White
    Write-Host "   • Current Message Rate: $($dashboard.data.metrics.messageRate.current.published) msg/s" -ForegroundColor White
}
Write-Host ""

Write-Host "💡 Key Features Tested:" -ForegroundColor Yellow
Write-Host "   ✅ Topic tree hierarchy" -ForegroundColor Green
Write-Host "   ✅ Automatic schema generation" -ForegroundColor Green
Write-Host "   ✅ Real-time metrics" -ForegroundColor Green
Write-Host "   ✅ Message type detection" -ForegroundColor Green
Write-Host "   ✅ Unified dashboard endpoint" -ForegroundColor Green
Write-Host ""

Write-Host "🎯 Use /dashboard endpoint for your UI!" -ForegroundColor Magenta
Write-Host ""
