#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Monitor Redis Streams metrics buffering (Phase 2)

.DESCRIPTION
    This script monitors the Phase 2 Redis Streams implementation:
    - Stream lengths (pending metrics per device)
    - Worker batch processing stats
    - Database write reduction
    - Latency metrics

.EXAMPLE
    .\monitor-redis-streams.ps1
    .\monitor-redis-streams.ps1 -Interval 5
#>

param(
    [int]$Interval = 2  # Refresh interval in seconds
)

Write-Host "🔍 Redis Streams Metrics Monitor (Phase 2)" -ForegroundColor Cyan
Write-Host "=" * 80
Write-Host ""

# Check if Redis is running
$redisRunning = docker ps --filter "name=iotistic-redis" --format "{{.Names}}" 2>$null
if (-not $redisRunning) {
    Write-Host "❌ Redis container not running!" -ForegroundColor Red
    Write-Host "   Start with: docker compose up -d redis" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Redis container: $redisRunning" -ForegroundColor Green
Write-Host ""

# Monitoring loop
$iteration = 0
try {
    while ($true) {
        $iteration++
        Clear-Host
        
        Write-Host "🔍 Redis Streams Metrics Monitor - Iteration $iteration" -ForegroundColor Cyan
        Write-Host "=" * 80
        Write-Host ""
        
        # Get all metrics streams
        $streams = docker exec iotistic-redis redis-cli KEYS "metrics:*" 2>$null
        
        if ($streams) {
            $streamList = $streams -split "`n" | Where-Object { $_ -ne "(empty array)" -and $_ -ne "" }
            
            if ($streamList.Count -gt 0) {
                Write-Host "📊 Active Streams: $($streamList.Count)" -ForegroundColor Yellow
                Write-Host ""
                
                foreach ($stream in $streamList) {
                    if ($stream) {
                        # Get stream info
                        $length = docker exec iotistic-redis redis-cli XLEN $stream 2>$null
                        $deviceUuid = $stream -replace "metrics:", ""
                        $shortUuid = $deviceUuid.Substring(0, [Math]::Min(8, $deviceUuid.Length))
                        
                        # Color code based on length
                        $color = "White"
                        if ($length -gt 500) { $color = "Red" }
                        elseif ($length -gt 100) { $color = "Yellow" }
                        elseif ($length -gt 0) { $color = "Green" }
                        else { $color = "Gray" }
                        
                        Write-Host "  Device $shortUuid..." -NoNewline
                        Write-Host " : " -NoNewline
                        Write-Host "$length pending metrics" -ForegroundColor $color
                    }
                }
                
                # Get total pending
                $totalPending = 0
                foreach ($stream in $streamList) {
                    if ($stream) {
                        $len = docker exec iotistic-redis redis-cli XLEN $stream 2>$null
                        $totalPending += [int]$len
                    }
                }
                
                Write-Host ""
                Write-Host "Total Pending: $totalPending metrics" -ForegroundColor Cyan
                
                # Show recent stream activity (last 5 entries from first stream)
                if ($streamList.Count -gt 0 -and $streamList[0]) {
                    Write-Host ""
                    Write-Host "📝 Recent Activity ($($streamList[0])):" -ForegroundColor Yellow
                    $recent = docker exec iotistic-redis redis-cli XREVRANGE $streamList[0] + - COUNT 3 2>$null
                    if ($recent) {
                        Write-Host $recent -ForegroundColor Gray
                    }
                }
            } else {
                Write-Host "📊 No active streams" -ForegroundColor Gray
                Write-Host "   Metrics are being processed faster than they arrive! ✅" -ForegroundColor Green
            }
        } else {
            Write-Host "📊 No metrics streams yet" -ForegroundColor Gray
            Write-Host "   Waiting for device state updates..." -ForegroundColor Yellow
        }
        
        Write-Host ""
        Write-Host "=" * 80
        Write-Host ""
        
        # Memory usage
        $memInfo = docker exec iotistic-redis redis-cli INFO memory 2>$null | Select-String "used_memory_human"
        if ($memInfo) {
            Write-Host "💾 Redis Memory: $($memInfo -replace '.*:', '')" -ForegroundColor Cyan
        }
        
        # Commands stats
        $cmdStats = docker exec iotistic-redis redis-cli INFO stats 2>$null | Select-String "instantaneous_ops_per_sec"
        if ($cmdStats) {
            Write-Host "⚡ Ops/sec: $($cmdStats -replace '.*:', '')" -ForegroundColor Cyan
        }
        
        Write-Host ""
        Write-Host "Press Ctrl+C to stop monitoring" -ForegroundColor Gray
        Write-Host "Refreshing in $Interval seconds..." -ForegroundColor Gray
        
        Start-Sleep -Seconds $Interval
    }
} catch {
    Write-Host ""
    Write-Host "Monitoring stopped." -ForegroundColor Yellow
}
