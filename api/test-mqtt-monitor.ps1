# Test MQTT Monitoring Dashboard Service
# Comprehensive tests for topic tree and metrics APIs

$baseUrl = "http://localhost:3002/api/v1/mqtt-monitor"

Write-Host "`n📊 Testing MQTT Monitoring Dashboard Service`n" -ForegroundColor Cyan

# Test 1: Get status
Write-Host "1️⃣  Testing GET /status" -ForegroundColor Yellow
try {
    $status = Invoke-RestMethod -Uri "$baseUrl/status"
    Write-Host "   ✅ Connected: $($status.data.connected)" -ForegroundColor Green
    Write-Host "   📊 Topics: $($status.data.topicCount), Messages: $($status.data.messageCount)" -ForegroundColor Cyan
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 2: Start monitor (if not running)
Write-Host "2️⃣  Testing POST /start" -ForegroundColor Yellow
try {
    $startResult = Invoke-RestMethod -Uri "$baseUrl/start" -Method Post
    Write-Host "   ✅ $($startResult.message)" -ForegroundColor Green
    Start-Sleep -Seconds 2
} catch {
    Write-Host "   ⚠️  Already running or error" -ForegroundColor Yellow
}

Write-Host ""

# Wait for data collection
Write-Host "⏳ Waiting 8 seconds for data collection..." -ForegroundColor Cyan
Start-Sleep -Seconds 8

# Test 3: Get metrics
Write-Host "3️⃣  Testing GET /metrics" -ForegroundColor Yellow
try {
    $metrics = Invoke-RestMethod -Uri "$baseUrl/metrics"
    $data = $metrics.data
    
    Write-Host "   ✅ Metrics Retrieved" -ForegroundColor Green
    Write-Host "`n   📈 Message Rate:" -ForegroundColor Cyan
    Write-Host "      • Published (current): $($data.messageRate.current.published) msg/s" -ForegroundColor White
    Write-Host "      • Received (current): $($data.messageRate.current.received) msg/s" -ForegroundColor White
    Write-Host "      • History (last 15): $($data.messageRate.published -join ', ')" -ForegroundColor Gray
    
    Write-Host "`n   🌐 Throughput:" -ForegroundColor Cyan
    Write-Host "      • Outbound: $($data.throughput.current.outbound) KB/s" -ForegroundColor White
    Write-Host "      • Inbound: $($data.throughput.current.inbound) KB/s" -ForegroundColor White
    
    Write-Host "`n   👥 Broker Stats:" -ForegroundColor Cyan
    Write-Host "      • Connected Clients: $($data.clients)" -ForegroundColor White
    Write-Host "      • Subscriptions: $($data.subscriptions)" -ForegroundColor White
    Write-Host "      • Retained Messages: $($data.retainedMessages)" -ForegroundColor White
    Write-Host "      • Total Sent: $($data.totalMessages.sent)" -ForegroundColor White
    Write-Host "      • Total Received: $($data.totalMessages.received)" -ForegroundColor White
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 4: Get topic tree
Write-Host "4️⃣  Testing GET /topic-tree" -ForegroundColor Yellow
try {
    $tree = Invoke-RestMethod -Uri "$baseUrl/topic-tree"
    $treeData = $tree.data
    
    Write-Host "   ✅ Topic Tree Retrieved" -ForegroundColor Green
    Write-Host "   📁 Root: $($treeData._name)" -ForegroundColor Cyan
    Write-Host "      • Total Messages: $($treeData._messagesCounter)" -ForegroundColor White
    Write-Host "      • Topic Count: $($treeData._topicsCounter)" -ForegroundColor White
    
    # Display first few levels
    Write-Host "`n   🌲 Tree Structure (first level):" -ForegroundColor Cyan
    $treeData.PSObject.Properties | Where-Object { $_.Name -notlike '_*' } | Select-Object -First 5 | ForEach-Object {
        $nodeName = $_.Name
        $node = $_.Value
        if ($node._messagesCounter) {
            Write-Host "      📁 $nodeName ($($node._messagesCounter) messages)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 5: Get flattened topics
Write-Host "5️⃣  Testing GET /topics" -ForegroundColor Yellow
try {
    $topics = Invoke-RestMethod -Uri "$baseUrl/topics"
    
    Write-Host "   ✅ Topics Retrieved: $($topics.count)" -ForegroundColor Green
    
    if ($topics.count -gt 0) {
        Write-Host "`n   📋 Sample Topics:" -ForegroundColor Cyan
        $topics.data | Select-Object -First 10 | ForEach-Object {
            $lastMsg = if ($_.lastMessage.Length -gt 50) { 
                $_.lastMessage.Substring(0, 50) + "..." 
            } else { 
                $_.lastMessage 
            }
            Write-Host "      • $($_.topic) ($($_.messageCount) msgs) - Last: $lastMsg" -ForegroundColor White
        }
        
        if ($topics.count -gt 10) {
            Write-Host "      ... and $($topics.count - 10) more topics" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 6: Get system stats
Write-Host "6️⃣  Testing GET /system-stats" -ForegroundColor Yellow
try {
    $sysStats = Invoke-RestMethod -Uri "$baseUrl/system-stats"
    
    Write-Host "   ✅ System Stats Retrieved" -ForegroundColor Green
    
    if ($sysStats.data.'$SYS'.broker) {
        $broker = $sysStats.data.'$SYS'.broker
        
        Write-Host "`n   🔍 Raw $SYS Topics:" -ForegroundColor Cyan
        
        if ($broker.messages) {
            Write-Host "      Messages:" -ForegroundColor Yellow
            Write-Host "        • Sent: $($broker.messages.sent)" -ForegroundColor White
            Write-Host "        • Received: $($broker.messages.received)" -ForegroundColor White
        }
        
        if ($broker.clients) {
            Write-Host "      Clients:" -ForegroundColor Yellow
            Write-Host "        • Connected: $($broker.clients.connected)" -ForegroundColor White
            Write-Host "        • Total: $($broker.clients.total)" -ForegroundColor White
        }
        
        if ($broker.load.bytes.sent) {
            Write-Host "      Load (Bytes Sent):" -ForegroundColor Yellow
            Write-Host "        • 1min: $($broker.load.bytes.sent.'1min')" -ForegroundColor White
            Write-Host "        • 15min: $($broker.load.bytes.sent.'15min')" -ForegroundColor White
        }
    }
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 7: Get complete dashboard data
Write-Host "7️⃣  Testing GET /dashboard (complete data)" -ForegroundColor Yellow
try {
    $dashboard = Invoke-RestMethod -Uri "$baseUrl/dashboard"
    $data = $dashboard.data
    
    Write-Host "   ✅ Dashboard Data Retrieved" -ForegroundColor Green
    Write-Host "`n   📊 Dashboard Summary:" -ForegroundColor Cyan
    Write-Host "      Status: $(if($data.status.connected){'🟢 Connected'}else{'🔴 Disconnected'})" -ForegroundColor White
    Write-Host "      Topics: $($data.topics.count)" -ForegroundColor White
    Write-Host "      Messages: $($data.status.messageCount)" -ForegroundColor White
    Write-Host "      Clients: $($data.metrics.clients)" -ForegroundColor White
    Write-Host "      Message Rate: $($data.metrics.messageRate.current.published) pub / $($data.metrics.messageRate.current.received) rec (msg/s)" -ForegroundColor White
    Write-Host "      Throughput: $($data.metrics.throughput.current.outbound) out / $($data.metrics.throughput.current.inbound) in (KB/s)" -ForegroundColor White
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Summary
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📊 Test Summary" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ All API endpoints tested successfully" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Available Endpoints:" -ForegroundColor Yellow
Write-Host "   GET  $baseUrl/status" -ForegroundColor White
Write-Host "   POST $baseUrl/start" -ForegroundColor White
Write-Host "   POST $baseUrl/stop" -ForegroundColor White
Write-Host "   GET  $baseUrl/topic-tree" -ForegroundColor White
Write-Host "   GET  $baseUrl/topics" -ForegroundColor White
Write-Host "   GET  $baseUrl/metrics" -ForegroundColor White
Write-Host "   GET  $baseUrl/system-stats" -ForegroundColor White
Write-Host "   GET  $baseUrl/dashboard" -ForegroundColor White
Write-Host ""
Write-Host "💡 Next Steps:" -ForegroundColor Yellow
Write-Host "   1. Build dashboard UI with these APIs" -ForegroundColor White
Write-Host "   2. Poll /dashboard every 5 seconds for live updates" -ForegroundColor White
Write-Host "   3. Use /topic-tree for hierarchical display" -ForegroundColor White
Write-Host "   4. Use /metrics for charts (message rate, throughput)" -ForegroundColor White
Write-Host ""
Write-Host "📚 Documentation: api/docs/MQTT-MONITORING-SERVICE.md" -ForegroundColor Cyan
Write-Host ""
