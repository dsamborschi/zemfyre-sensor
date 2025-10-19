param(
    [Parameter(Mandatory=$true)]
    [string]$DeviceUuid,
    
    [Parameter(Mandatory=$false)]
    [string]$Field = "system.cpuUsage",
    
    [Parameter(Mandatory=$false)]
    [int]$Hours = 24,
    
    [Parameter(Mandatory=$false)]
    [switch]$CheckAnomalies,
    
    [Parameter(Mandatory=$false)]
    [int]$Port = 4002
)

$API_BASE = "http://localhost:$Port/api/v1"

Write-Host "`n" -NoNewline
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  📊 Digital Twin History Analyzer" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

try {
    if ($CheckAnomalies) {
        Write-Host "🔍 Analyzing anomalies in " -NoNewline -ForegroundColor Yellow
        Write-Host "$Field" -ForegroundColor White -NoNewline
        Write-Host "..." -ForegroundColor Yellow
        Write-Host ""
        
        $response = Invoke-RestMethod -Uri "$API_BASE/devices/$DeviceUuid/twin/anomalies?field=$Field"
        
        # Statistics
        Write-Host "📊 Statistical Analysis:" -ForegroundColor Cyan
        Write-Host "   Data Points : " -NoNewline -ForegroundColor Gray
        Write-Host $response.statistics.dataPoints -ForegroundColor White
        Write-Host "   Mean        : " -NoNewline -ForegroundColor Gray
        Write-Host "$([math]::Round($response.statistics.mean, 2))" -ForegroundColor White
        Write-Host "   Std Dev     : " -NoNewline -ForegroundColor Gray
        Write-Host "$([math]::Round($response.statistics.stdDev, 2))" -ForegroundColor White
        Write-Host "   Min         : " -NoNewline -ForegroundColor Gray
        Write-Host "$([math]::Round($response.statistics.min, 2))" -ForegroundColor Green
        Write-Host "   Max         : " -NoNewline -ForegroundColor Gray
        Write-Host "$([math]::Round($response.statistics.max, 2))" -ForegroundColor Red
        Write-Host ""
        
        # Anomaly Detection Results
        Write-Host "🎯 Anomaly Detection (Z-score method, threshold=$($response.anomalyDetection.threshold)):" -ForegroundColor Cyan
        Write-Host "   Total       : " -NoNewline -ForegroundColor Gray
        
        if ($response.anomalyDetection.detected.total -gt 0) {
            Write-Host $response.anomalyDetection.detected.total -ForegroundColor Yellow
        } else {
            Write-Host $response.anomalyDetection.detected.total -ForegroundColor Green
        }
        
        Write-Host "   Critical    : " -NoNewline -ForegroundColor Gray
        if ($response.anomalyDetection.detected.critical -gt 0) {
            Write-Host $response.anomalyDetection.detected.critical -ForegroundColor Red
        } else {
            Write-Host $response.anomalyDetection.detected.critical -ForegroundColor Green
        }
        
        Write-Host "   Warning     : " -NoNewline -ForegroundColor Gray
        if ($response.anomalyDetection.detected.warning -gt 0) {
            Write-Host $response.anomalyDetection.detected.warning -ForegroundColor Yellow
        } else {
            Write-Host $response.anomalyDetection.detected.warning -ForegroundColor Green
        }
        
        Write-Host "   Percentage  : " -NoNewline -ForegroundColor Gray
        Write-Host "$($response.anomalyDetection.detected.percentage)%" -ForegroundColor White
        Write-Host ""
        
        # Anomaly Details
        if ($response.anomalies.Count -gt 0) {
            Write-Host "🔴 Anomaly Details (Top 10):" -ForegroundColor Red
            Write-Host "   " -NoNewline
            Write-Host "Time                     " -NoNewline -ForegroundColor Gray
            Write-Host "Value      " -NoNewline -ForegroundColor Gray
            Write-Host "Z-Score  " -NoNewline -ForegroundColor Gray
            Write-Host "Severity  " -NoNewline -ForegroundColor Gray
            Write-Host "Deviation" -ForegroundColor Gray
            Write-Host "   $('-' * 80)" -ForegroundColor DarkGray
            
            foreach ($anomaly in $response.anomalies | Select-Object -First 10) {
                $timestamp = [DateTime]::Parse($anomaly.timestamp).ToString("yyyy-MM-dd HH:mm:ss")
                $color = if ($anomaly.severity -eq "critical") { "Red" } else { "Yellow" }
                
                Write-Host "   " -NoNewline
                Write-Host "$timestamp  " -NoNewline -ForegroundColor White
                Write-Host "$([math]::Round($anomaly.value, 2))".PadRight(10) -NoNewline -ForegroundColor $color
                Write-Host "$([math]::Round($anomaly.zScore, 2))".PadRight(8) -NoNewline -ForegroundColor $color
                Write-Host "$($anomaly.severity)".PadRight(10) -NoNewline -ForegroundColor $color
                Write-Host "$($anomaly.deviation)" -ForegroundColor $color
            }
            
            if ($response.anomalies.Count -gt 10) {
                Write-Host "`n   ... and $($response.anomalies.Count - 10) more anomalies" -ForegroundColor Gray
            }
        } else {
            Write-Host "✅ No anomalies detected - all values within normal range!" -ForegroundColor Green
        }
        
    } else {
        $from = (Get-Date).AddHours(-$Hours).ToString("yyyy-MM-ddTHH:mm:ssZ")
        
        Write-Host "📈 Fetching history for " -NoNewline -ForegroundColor Yellow
        Write-Host "$Field" -ForegroundColor White -NoNewline
        Write-Host " (last $Hours hours)..." -ForegroundColor Yellow
        Write-Host ""
        
        $response = Invoke-RestMethod -Uri "$API_BASE/devices/$DeviceUuid/twin/history?field=$Field&from=$from&limit=1000"
        
        if ($response.count -eq 0) {
            Write-Host "⚠️  No history data available for this time range" -ForegroundColor Yellow
            Write-Host "   Try expanding the time range with -Hours parameter" -ForegroundColor Gray
            exit
        }
        
        # Statistics
        Write-Host "📊 Statistics:" -ForegroundColor Cyan
        Write-Host "   Count       : " -NoNewline -ForegroundColor Gray
        Write-Host $response.statistics.count -ForegroundColor White
        Write-Host "   Average     : " -NoNewline -ForegroundColor Gray
        Write-Host "$([math]::Round($response.statistics.average, 2))" -ForegroundColor White
        Write-Host "   Min         : " -NoNewline -ForegroundColor Gray
        Write-Host "$([math]::Round($response.statistics.min, 2))" -ForegroundColor Green
        Write-Host "   Max         : " -NoNewline -ForegroundColor Gray
        Write-Host "$([math]::Round($response.statistics.max, 2))" -ForegroundColor Red
        Write-Host "   Latest      : " -NoNewline -ForegroundColor Gray
        Write-Host "$([math]::Round($response.statistics.latest, 2))" -ForegroundColor White
        Write-Host ""
        
        # Time Range
        Write-Host "📅 Time Range:" -ForegroundColor Cyan
        Write-Host "   From        : " -NoNewline -ForegroundColor Gray
        Write-Host ([DateTime]::Parse($response.timeRange.from).ToString("yyyy-MM-dd HH:mm:ss")) -ForegroundColor White
        Write-Host "   To          : " -NoNewline -ForegroundColor Gray
        Write-Host ([DateTime]::Parse($response.timeRange.to).ToString("yyyy-MM-dd HH:mm:ss")) -ForegroundColor White
        Write-Host ""
        
        # Recent Values
        Write-Host "📋 Recent Values (last 10):" -ForegroundColor Cyan
        Write-Host "   " -NoNewline
        Write-Host "Time                     " -NoNewline -ForegroundColor Gray
        Write-Host "Value" -ForegroundColor Gray
        Write-Host "   $('-' * 50)" -ForegroundColor DarkGray
        
        foreach ($point in $response.data | Select-Object -First 10) {
            $timestamp = [DateTime]::Parse($point.timestamp).ToString("yyyy-MM-dd HH:mm:ss")
            $value = [math]::Round($point.value, 2)
            
            # Color based on value relative to average
            $color = "White"
            if ($value -gt $response.statistics.average * 1.5) {
                $color = "Red"
            } elseif ($value -gt $response.statistics.average * 1.2) {
                $color = "Yellow"
            } elseif ($value -lt $response.statistics.average * 0.5) {
                $color = "Green"
            }
            
            Write-Host "   " -NoNewline
            Write-Host "$timestamp  " -NoNewline -ForegroundColor White
            Write-Host $value -ForegroundColor $color
        }
        
        if ($response.count -gt 10) {
            Write-Host "`n   ... and $($response.count - 10) more data points" -ForegroundColor Gray
        }
        
        # Suggest anomaly check if there's enough data
        if ($response.count -ge 10) {
            Write-Host ""
            Write-Host "💡 Tip: Run with -CheckAnomalies to detect outliers" -ForegroundColor Cyan
        }
    }
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host ""
        Write-Host "💡 Possible reasons:" -ForegroundColor Yellow
        Write-Host "   - Device UUID is incorrect" -ForegroundColor Gray
        Write-Host "   - No history data exists for this device yet" -ForegroundColor Gray
        Write-Host "   - Field path is incorrect" -ForegroundColor Gray
        Write-Host ""
        Write-Host "   Try: Get-DeviceHistory -DeviceUuid ""$(curl http://localhost:$Port/api/v1/devices | ConvertFrom-Json | Select-Object -First 1 -ExpandProperty devices | Select-Object -ExpandProperty uuid)""" -ForegroundColor Gray
    } elseif ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host ""
        Write-Host "💡 Possible reasons:" -ForegroundColor Yellow
        Write-Host "   - Not enough data points (need at least 10 for anomaly detection)" -ForegroundColor Gray
        Write-Host "   - Field doesn't contain numeric values" -ForegroundColor Gray
        Write-Host ""
        Write-Host "   Try expanding time range: -Hours 168 (7 days)" -ForegroundColor Gray
    }
    
    Write-Host ""
    exit 1
}
