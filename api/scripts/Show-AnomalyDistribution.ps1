param(
    [Parameter(Mandatory=$true)]
    [string]$DeviceUuid,
    
    [Parameter(Mandatory=$false)]
    [string]$Field = "system.cpuUsage",
    
    [Parameter(Mandatory=$false)]
    [double]$Threshold = 2.5,
    
    [Parameter(Mandatory=$false)]
    [int]$Port = 4002
)

$API_BASE = "http://localhost:$Port/api/v1"

Write-Host "`n╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🎯 Z-Score Anomaly Detection Visualizer                 ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

try {
    # Fetch anomaly data
    $response = Invoke-RestMethod -Uri "$API_BASE/devices/$DeviceUuid/twin/anomalies?field=$Field&threshold=$Threshold"
    
    $mean = [math]::Round($response.statistics.mean, 2)
    $stdDev = [math]::Round($response.statistics.stdDev, 2)
    $min = [math]::Round($response.statistics.min, 2)
    $max = [math]::Round($response.statistics.max, 2)
    
    # Calculate threshold lines
    $upperCritical = [math]::Round($mean + (3 * $stdDev), 2)
    $upperWarning = [math]::Round($mean + ($Threshold * $stdDev), 2)
    $lowerWarning = [math]::Round($mean - ($Threshold * $stdDev), 2)
    $lowerCritical = [math]::Round($mean - (3 * $stdDev), 2)
    
    Write-Host "📊 Statistical Distribution:" -ForegroundColor Yellow
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host ""
    
    # Visual representation
    $scale = 50
    $range = $max - $min
    if ($range -eq 0) { $range = 1 }
    
    function Get-Bar {
        param($value, $color)
        $length = [math]::Max(1, [math]::Min($scale, [int](($value - $min) / $range * $scale)))
        return ("█" * $length)
    }
    
    # Critical upper
    if ($upperCritical -le $max) {
        Write-Host "  Critical Upper (μ+3σ): " -NoNewline -ForegroundColor Red
        Write-Host "$upperCritical".PadLeft(8) -NoNewline -ForegroundColor Red
        Write-Host " │" -NoNewline -ForegroundColor DarkGray
        Write-Host (Get-Bar $upperCritical "Red") -ForegroundColor Red
    }
    
    # Warning upper
    if ($upperWarning -le $max -and $upperWarning -ne $upperCritical) {
        Write-Host "  Warning Upper (μ+${Threshold}σ): " -NoNewline -ForegroundColor Yellow
        Write-Host "$upperWarning".PadLeft(8) -NoNewline -ForegroundColor Yellow
        Write-Host " │" -NoNewline -ForegroundColor DarkGray
        Write-Host (Get-Bar $upperWarning "Yellow") -ForegroundColor Yellow
    }
    
    # Mean
    Write-Host "  Mean (μ):          " -NoNewline -ForegroundColor Cyan
    Write-Host "$mean".PadLeft(8) -NoNewline -ForegroundColor Cyan
    Write-Host " │" -NoNewline -ForegroundColor DarkGray
    Write-Host (Get-Bar $mean "Cyan") -ForegroundColor Cyan
    
    # Warning lower
    if ($lowerWarning -ge $min -and $lowerWarning -ne $lowerCritical) {
        Write-Host "  Warning Lower (μ-${Threshold}σ): " -NoNewline -ForegroundColor Yellow
        Write-Host "$lowerWarning".PadLeft(8) -NoNewline -ForegroundColor Yellow
        Write-Host " │" -NoNewline -ForegroundColor DarkGray
        Write-Host (Get-Bar $lowerWarning "Yellow") -ForegroundColor Yellow
    }
    
    # Critical lower
    if ($lowerCritical -ge $min) {
        Write-Host "  Critical Lower (μ-3σ): " -NoNewline -ForegroundColor Red
        Write-Host "$lowerCritical".PadLeft(8) -NoNewline -ForegroundColor Red
        Write-Host " │" -NoNewline -ForegroundColor DarkGray
        Write-Host (Get-Bar $lowerCritical "Red") -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "  Min:               " -NoNewline -ForegroundColor Green
    Write-Host "$min".PadLeft(8) -ForegroundColor Green
    Write-Host "  Max:               " -NoNewline -ForegroundColor Red
    Write-Host "$max".PadLeft(8) -ForegroundColor Red
    Write-Host "  Std Dev (σ):       " -NoNewline -ForegroundColor Gray
    Write-Host "$stdDev".PadLeft(8) -ForegroundColor White
    
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host ""
    
    # Distribution zones
    Write-Host "📈 Distribution Zones:" -ForegroundColor Yellow
    Write-Host ""
    
    $zone1 = [math]::Round(68.27, 2)
    $zone2 = [math]::Round(95.45, 2)
    $zone3 = [math]::Round(99.73, 2)
    
    Write-Host "  Within ±1σ (${lowerWarning} to ${upperWarning}): " -NoNewline -ForegroundColor Green
    Write-Host "$zone1% " -NoNewline -ForegroundColor White
    Write-Host "of data" -ForegroundColor Gray
    
    Write-Host "  Within ±2σ:                              " -NoNewline -ForegroundColor Green
    Write-Host "$zone2% " -NoNewline -ForegroundColor White
    Write-Host "of data" -ForegroundColor Gray
    
    Write-Host "  Within ±3σ:                              " -NoNewline -ForegroundColor Green
    Write-Host "$zone3% " -NoNewline -ForegroundColor White
    Write-Host "of data" -ForegroundColor Gray
    
    Write-Host ""
    Write-Host "  Beyond ±${Threshold}σ (Threshold):                    " -NoNewline -ForegroundColor Yellow
    Write-Host "$([math]::Round(100 - 98.76, 2))% " -NoNewline -ForegroundColor White
    Write-Host "of data (ANOMALIES)" -ForegroundColor Yellow
    
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host ""
    
    # Anomaly summary
    Write-Host "🔍 Detection Results:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Data Points:   " -NoNewline -ForegroundColor Gray
    Write-Host $response.statistics.dataPoints -ForegroundColor White
    
    Write-Host "  Threshold:     " -NoNewline -ForegroundColor Gray
    Write-Host "Z-score > $Threshold" -ForegroundColor White
    
    Write-Host "  Anomalies:     " -NoNewline -ForegroundColor Gray
    $totalColor = if ($response.anomalyDetection.detected.total -gt 0) { "Yellow" } else { "Green" }
    Write-Host "$($response.anomalyDetection.detected.total) " -NoNewline -ForegroundColor $totalColor
    Write-Host "($($response.anomalyDetection.detected.percentage)%)" -ForegroundColor Gray
    
    Write-Host "    - Critical:  " -NoNewline -ForegroundColor Gray
    $criticalColor = if ($response.anomalyDetection.detected.critical -gt 0) { "Red" } else { "Green" }
    Write-Host $response.anomalyDetection.detected.critical -ForegroundColor $criticalColor
    
    Write-Host "    - Warning:   " -NoNewline -ForegroundColor Gray
    $warningColor = if ($response.anomalyDetection.detected.warning -gt 0) { "Yellow" } else { "Green" }
    Write-Host $response.anomalyDetection.detected.warning -ForegroundColor $warningColor
    
    Write-Host ""
    
    # Show anomalies with Z-score visualization
    if ($response.anomalies.Count -gt 0) {
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
        Write-Host ""
        Write-Host "🚨 Detected Anomalies (Top 5):" -ForegroundColor Red
        Write-Host ""
        
        foreach ($anomaly in $response.anomalies | Select-Object -First 5) {
            $timestamp = [DateTime]::Parse($anomaly.timestamp).ToString("MM/dd HH:mm")
            $color = if ($anomaly.severity -eq "critical") { "Red" } else { "Yellow" }
            $icon = if ($anomaly.severity -eq "critical") { "🔴" } else { "⚠️ " }
            
            Write-Host "  $icon " -NoNewline
            Write-Host "$timestamp" -NoNewline -ForegroundColor White
            Write-Host " │ " -NoNewline -ForegroundColor DarkGray
            Write-Host "Value: $([math]::Round($anomaly.value, 2))".PadRight(15) -NoNewline -ForegroundColor $color
            Write-Host "Z-score: $([math]::Round($anomaly.zScore, 2))".PadRight(15) -NoNewline -ForegroundColor $color
            Write-Host "Deviation: $($anomaly.deviation)" -ForegroundColor $color
            
            # Z-score bar
            $zScoreBar = [math]::Min(30, [int]([math]::Abs($anomaly.zScore) * 5))
            Write-Host "     " -NoNewline
            Write-Host ("│" + ("█" * $zScoreBar)) -ForegroundColor $color
        }
        
        if ($response.anomalies.Count -gt 5) {
            Write-Host ""
            Write-Host "  ... and $($response.anomalies.Count - 5) more anomalies" -ForegroundColor Gray
        }
    } else {
        Write-Host "✅ No anomalies detected!" -ForegroundColor Green
        Write-Host "   All values are within $Threshold standard deviations of the mean." -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║  💡 Interpretation Guide                                  ║" -ForegroundColor Cyan
    Write-Host "╠════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
    Write-Host "║  Z-score 0.0-1.0:  Normal variation                       ║" -ForegroundColor White
    Write-Host "║  Z-score 1.0-2.0:  Slightly unusual                       ║" -ForegroundColor White
    Write-Host "║  Z-score 2.0-2.5:  Unusual (depending on threshold)       ║" -ForegroundColor Yellow
    Write-Host "║  Z-score 2.5-3.0:  Warning - Anomaly detected             ║" -ForegroundColor Yellow
    Write-Host "║  Z-score > 3.0:    Critical - Very rare event             ║" -ForegroundColor Red
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
    
    # Recommendations
    if ($response.anomalyDetection.detected.total -eq 0) {
        Write-Host "💡 Tip: Try lowering threshold to -Threshold 2.0 to detect more subtle anomalies" -ForegroundColor Cyan
    } elseif ($response.anomalyDetection.detected.total -gt $response.statistics.dataPoints * 0.1) {
        Write-Host "💡 Tip: Too many anomalies? Try increasing threshold to -Threshold 3.0" -ForegroundColor Cyan
    } else {
        Write-Host "✅ Threshold $Threshold looks good for this metric!" -ForegroundColor Green
    }
    
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    exit 1
}
