# Simulate Device/Entity Failure and Visualize Impact
# Shows cascading failure effects through the entity-relationship graph

param(
    [string]$ApiUrl = "http://localhost:4002",
    [Parameter(Mandatory=$false)]
    [string]$EntityId,
    [Parameter(Mandatory=$false)]
    [string]$EntityName,
    [string]$FailureType = "device_failure",
    [string]$OutputFile = "failure-simulation.html"
)

Write-Host "🔥 Simulating Failure Scenario`n" -ForegroundColor Red

# If no entity specified, list available entities
if (-not $EntityId -and -not $EntityName) {
    Write-Host "📋 Available entities to simulate failure:`n" -ForegroundColor Yellow
    
    $entitiesResponse = Invoke-RestMethod -Uri "$ApiUrl/api/v1/entities" -Method Get
    $entities = if ($entitiesResponse.data) { $entitiesResponse.data } else { $entitiesResponse }
    
    # Group by type
    $grouped = $entities | Group-Object entity_type | Sort-Object Name
    
    foreach ($group in $grouped) {
        Write-Host "  $($group.Name):" -ForegroundColor Cyan
        $group.Group | Select-Object -First 3 | ForEach-Object {
            Write-Host "    • $($_.name) (ID: $($_.id))" -ForegroundColor White
        }
        if ($group.Count -gt 3) {
            Write-Host "    ... and $($group.Count - 3) more" -ForegroundColor Gray
        }
        Write-Host ""
    }
    
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\simulate-failure.ps1 -EntityId <id>" -ForegroundColor White
    Write-Host "  .\simulate-failure.ps1 -EntityName 'Device Name'`n" -ForegroundColor White
    exit 0
}

# Find entity by name if provided
if ($EntityName) {
    $entitiesResponse = Invoke-RestMethod -Uri "$ApiUrl/api/v1/entities" -Method Get
    $entities = if ($entitiesResponse.data) { $entitiesResponse.data } else { $entitiesResponse }
    $entity = $entities | Where-Object { $_.name -like "*$EntityName*" } | Select-Object -First 1
    
    if (-not $entity) {
        Write-Host "❌ Entity not found: $EntityName" -ForegroundColor Red
        exit 1
    }
    
    $EntityId = $entity.id
    Write-Host "✅ Found entity: $($entity.name) (ID: $EntityId)`n" -ForegroundColor Green
}

# Fetch all entities and relationships first
$entitiesResponse = Invoke-RestMethod -Uri "$ApiUrl/api/v1/entities" -Method Get
$entities = if ($entitiesResponse.data) { $entitiesResponse.data } else { $entitiesResponse }

$relationshipsResponse = Invoke-RestMethod -Uri "$ApiUrl/api/v1/relationships" -Method Get
$relationships = if ($relationshipsResponse.data) { $relationshipsResponse.data } else { $relationshipsResponse }

# Manually calculate impact by traversing relationships
Write-Host "💥 Simulating failure of entity: $EntityId" -ForegroundColor Red
Write-Host "🔍 Analyzing impact through relationship graph...`n" -ForegroundColor Yellow

$failedEntity = $entities | Where-Object { $_.id -eq $EntityId }

# Find direct dependencies (entities that depend on the failed entity)
$directImpact = @()
$directRelationships = $relationships | Where-Object { 
    $_.source_entity_id -eq $EntityId -and 
    ($_.relationship_type -in @('POWERS', 'PROVIDES_SERVICE', 'CONTAINS', 'MONITORS', 'CONTROLS'))
}

foreach ($rel in $directRelationships) {
    $targetEntity = $entities | Where-Object { $_.id -eq $rel.target_entity_id }
    if ($targetEntity) {
        $directImpact += @{
            entity_id = $targetEntity.id
            entity_name = $targetEntity.name
            relationship = $rel.relationship_type
        }
    }
}

# Find indirect impact (entities affected by directly impacted entities)
$indirectImpact = @()
$processedIds = @($EntityId) + ($directImpact | ForEach-Object { $_.entity_id })

foreach ($direct in $directImpact) {
    $indirectRels = $relationships | Where-Object {
        $_.source_entity_id -eq $direct.entity_id -and
        $_.target_entity_id -notin $processedIds
    }
    
    foreach ($rel in $indirectRels) {
        $targetEntity = $entities | Where-Object { $_.id -eq $rel.target_entity_id }
        if ($targetEntity -and $targetEntity.id -notin ($indirectImpact | ForEach-Object { $_.entity_id })) {
            $indirectImpact += @{
                entity_id = $targetEntity.id
                entity_name = $targetEntity.name
                via = $direct.entity_name
            }
        }
    }
}

# Also find entities that contain the failed entity (reverse impact)
$containedBy = $relationships | Where-Object {
    $_.target_entity_id -eq $EntityId -and $_.relationship_type -eq 'CONTAINS'
}

foreach ($rel in $containedBy) {
    $sourceEntity = $entities | Where-Object { $_.id -eq $rel.source_entity_id }
    if ($sourceEntity -and $sourceEntity.id -notin ($directImpact | ForEach-Object { $_.entity_id })) {
        $directImpact += @{
            entity_id = $sourceEntity.id
            entity_name = $sourceEntity.name
            relationship = 'CONTAINED_IN'
        }
    }
}

Write-Host "📊 Impact Analysis Results:" -ForegroundColor Cyan
Write-Host "   • Failed Entity: $($failedEntity.name)" -ForegroundColor White
Write-Host "   • Entity Type: $($failedEntity.entity_type)" -ForegroundColor Gray
Write-Host "   • Direct Impact: $($directImpact.Count) entities" -ForegroundColor Yellow
Write-Host "   • Indirect Impact: $($indirectImpact.Count) entities`n" -ForegroundColor Yellow

if ($directImpact.Count -gt 0) {
    Write-Host "   🔸 Directly Affected:" -ForegroundColor Yellow
    $directImpact | ForEach-Object {
        Write-Host "      • $($_.entity_name) ($($_.relationship))" -ForegroundColor White
    }
    Write-Host ""
}

$impact = @{
    affected_entity = $failedEntity
    direct_impact = $directImpact
    indirect_impact = $indirectImpact
    critical_path = $directImpact  # Simplified
}

# Create impact sets for easy lookup
$failedEntityId = $EntityId
$directImpactIds = if ($impact -and $impact.direct_impact) { 
    $impact.direct_impact | ForEach-Object { $_.entity_id } 
} else { @() }
$indirectImpactIds = if ($impact -and $impact.indirect_impact) { 
    $impact.indirect_impact | ForEach-Object { $_.entity_id } 
} else { @() }
$criticalPathIds = if ($impact -and $impact.critical_path) { 
    $impact.critical_path | ForEach-Object { $_.entity_id } 
} else { @() }

# Save data as JSON
$entities | ConvertTo-Json -Depth 10 | Out-File -FilePath "failure-entities.json" -Encoding UTF8
$relationships | ConvertTo-Json -Depth 10 | Out-File -FilePath "failure-relationships.json" -Encoding UTF8

# Create impact data JSON with proper array handling
$impactData = @{
    failed_entity_id = $failedEntityId
    direct_impact_ids = @($directImpactIds)  # Ensure it's an array
    indirect_impact_ids = @($indirectImpactIds)  # Ensure it's an array
    critical_path_ids = @($criticalPathIds)  # Ensure it's an array
    impact_details = $impact
}

# Convert to JSON and save
$impactJson = $impactData | ConvertTo-Json -Depth 10
$impactJson | Out-File -FilePath "failure-impact.json" -Encoding UTF8

Write-Host "📝 Impact data: $($directImpactIds.Count) direct, $($indirectImpactIds.Count) indirect" -ForegroundColor Gray

Write-Host "📁 Data files created`n" -ForegroundColor Gray

# Generate HTML with failure visualization
$html = @"
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Failure Simulation - Digital Twin</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui; background: #0f172a; color: #e2e8f0; overflow: hidden; }
        
        #header {
            position: fixed; top: 0; left: 0; right: 0;
            background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(10px);
            border-bottom: 1px solid #334155; padding: 1rem 2rem; z-index: 1000;
            display: flex; justify-content: space-between; align-items: center;
        }
        #header h1 { font-size: 1.5rem; color: #ef4444; }
        #stats { display: flex; gap: 2rem; font-size: 0.875rem; }
        .stat { display: flex; align-items: center; gap: 0.5rem; }
        .stat-label { color: #94a3b8; }
        .stat-value { color: #ef4444; font-weight: 600; }
        
        #mynetwork { position: fixed; top: 73px; left: 0; right: 0; bottom: 0; background: #0f172a; }
        
        #legend {
            position: fixed; bottom: 20px; left: 20px;
            background: rgba(30, 41, 59, 0.95); backdrop-filter: blur(10px);
            border: 1px solid #334155; border-radius: 8px;
            padding: 1rem; max-width: 280px; z-index: 1000;
        }
        #legend h3 { font-size: 0.875rem; color: #ef4444; margin-bottom: 0.75rem; text-transform: uppercase; }
        .legend-section { margin-bottom: 1rem; }
        .legend-section-title { font-size: 0.75rem; color: #60a5fa; margin-bottom: 0.5rem; font-weight: 600; }
        .legend-item { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; font-size: 0.875rem; }
        .legend-color { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #334155; }
        
        #info-panel {
            position: fixed; top: 73px; right: 20px; width: 350px;
            max-height: calc(100vh - 93px); background: rgba(30, 41, 59, 0.95);
            backdrop-filter: blur(10px); border: 1px solid #334155; border-radius: 8px;
            padding: 1.5rem; overflow-y: auto; z-index: 1000;
        }
        #info-panel h3 { font-size: 1.125rem; color: #ef4444; margin-bottom: 1rem; }
        .impact-badge { 
            display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; 
            font-size: 0.75rem; font-weight: 600; margin-bottom: 1rem;
        }
        .impact-failed { background: #991b1b; color: #fca5a5; }
        .impact-direct { background: #92400e; color: #fbbf24; }
        .impact-indirect { background: #1e40af; color: #93c5fd; }
        .impact-critical { background: #7c2d12; color: #fb923c; }
        .info-field { margin-bottom: 1rem; }
        .info-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.25rem; }
        .info-value { color: #e2e8f0; font-size: 0.875rem; word-break: break-all; }
        .property-list { background: rgba(15, 23, 42, 0.5); border-radius: 4px; padding: 0.5rem; margin-top: 0.5rem; }
        .property-item { font-size: 0.75rem; color: #cbd5e1; margin-bottom: 0.25rem; }
        
        #loading { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #ef4444; font-size: 1.5rem; }
        
        .pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
    </style>
</head>
<body>
    <div id="loading">Loading failure simulation...</div>
    
    <div id="header" style="display: none;">
        <h1>🔥 Failure Simulation</h1>
        <div id="stats">
            <div class="stat"><span class="stat-label">Failed:</span><span class="stat-value" id="failed-count">1</span></div>
            <div class="stat"><span class="stat-label">Direct Impact:</span><span class="stat-value" id="direct-count">0</span></div>
            <div class="stat"><span class="stat-label">Indirect Impact:</span><span class="stat-value" id="indirect-count">0</span></div>
        </div>
    </div>
    
    <div id="mynetwork" style="display: none;"></div>
    
    <div id="legend" style="display: none;">
        <h3>Impact Visualization</h3>
        <div class="legend-section">
            <div class="legend-section-title">Impact Levels</div>
            <div class="legend-item"><div class="legend-color" style="background-color:#dc2626"></div><span>Failed Entity (pulsing)</span></div>
            <div class="legend-item"><div class="legend-color" style="background-color:#f59e0b"></div><span>Direct Impact</span></div>
            <div class="legend-item"><div class="legend-color" style="background-color:#3b82f6"></div><span>Indirect Impact</span></div>
            <div class="legend-item"><div class="legend-color" style="background-color:#f97316"></div><span>Critical Path</span></div>
        </div>
    </div>
    
    <div id="info-panel">
        <h3>💥 Failure Impact Analysis</h3>
        <div id="impact-summary"></div>
    </div>

    <script>
        Promise.all([
            fetch('http://localhost:8765/failure-entities.json').then(r => r.json()),
            fetch('http://localhost:8765/failure-relationships.json').then(r => r.json()),
            fetch('http://localhost:8765/failure-impact.json').then(r => r.json())
        ]).then(([entities, relationships, impactData]) => {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('header').style.display = 'flex';
            document.getElementById('mynetwork').style.display = 'block';
            document.getElementById('legend').style.display = 'block';
            
            // Ensure arrays exist
            impactData.direct_impact_ids = impactData.direct_impact_ids || [];
            impactData.indirect_impact_ids = impactData.indirect_impact_ids || [];
            impactData.critical_path_ids = impactData.critical_path_ids || [];
            
            // Update stats
            document.getElementById('direct-count').textContent = impactData.direct_impact_ids.length;
            document.getElementById('indirect-count').textContent = impactData.indirect_impact_ids.length;
            
            // Create impact sets
            const failedId = impactData.failed_entity_id;
            const directIds = new Set(impactData.direct_impact_ids);
            const indirectIds = new Set(impactData.indirect_impact_ids);
            const criticalIds = new Set(impactData.critical_path_ids);
            
            // Define icons for entity types
            const icons = {
                building: '\uf1ad',      // fa-building
                floor: '\uf0c8',         // fa-square
                room: '\uf2bd',          // fa-door-open
                unit: '\uf015',          // fa-home
                device: '\uf0c3',        // fa-tablet
                sensor: '\uf06e',        // fa-eye
                equipment: '\uf0ad',     // fa-wrench
                gateway: '\uf233',       // fa-server
                zone: '\uf279',          // fa-map
                stairwell: '\uf0a8',     // fa-stairs
                default: '\uf111'        // fa-circle
            };
            
            // Determine node color based on impact
            function getNodeColor(entityId) {
                if (entityId === failedId) return '#dc2626'; // Red - failed
                if (criticalIds.has(entityId)) return '#f97316'; // Orange - critical path
                if (directIds.has(entityId)) return '#f59e0b'; // Amber - direct impact
                if (indirectIds.has(entityId)) return '#3b82f6'; // Blue - indirect impact
                return '#64748b'; // Gray - no impact
            }
            
            // Create nodes with impact coloring and icons
            const nodes = entities.map(e => {
                const icon = icons[e.entity_type] || icons.default;
                const nodeColor = getNodeColor(e.id);
                
                return {
                    id: e.id,
                    label: e.name,
                    font: { 
                        color: '#ffffff', 
                        size: e.id === failedId ? 16 : 14,
                        bold: e.id === failedId || criticalIds.has(e.id),
                        face: 'system-ui'
                    },
                    shape: 'icon',
                    icon: {
                        face: 'FontAwesome',
                        code: icon,
                        size: e.id === failedId ? 70 : (e.entity_type === 'building' ? 60 : (e.entity_type === 'unit' ? 45 : 40)),
                        color: nodeColor
                    },
                    title: e.entity_type + ': ' + e.name,
                    entity: e
                };
            });
            
            // Highlight relationships in critical path
            const edges = relationships.map(r => {
                const isInCriticalPath = criticalIds.has(r.source_entity_id) && criticalIds.has(r.target_entity_id);
                const isImpactEdge = (r.source_entity_id === failedId || directIds.has(r.source_entity_id)) && 
                                     (directIds.has(r.target_entity_id) || indirectIds.has(r.target_entity_id));
                
                return {
                    from: r.source_entity_id,
                    to: r.target_entity_id,
                    color: isInCriticalPath ? '#f97316' : (isImpactEdge ? '#fbbf24' : '#475569'),
                    width: isInCriticalPath ? 4 : (isImpactEdge ? 3 : 2),
                    arrows: { to: { enabled: true, scaleFactor: 0.5 } },
                    smooth: { type: 'curvedCW', roundness: 0.2 },
                    title: r.relationship_type
                };
            });
            
            // Create network
            const container = document.getElementById('mynetwork');
            const network = new vis.Network(container, { nodes, edges }, {
                physics: {
                    stabilization: { iterations: 300 },
                    barnesHut: {
                        gravitationalConstant: -10000,
                        centralGravity: 0.5,
                        springLength: 200,
                        springConstant: 0.04,
                        damping: 0.09,
                        avoidOverlap: 0.8
                    }
                },
                interaction: { hover: true, tooltipDelay: 100, navigationButtons: true, keyboard: true }
            });
            
            // Show impact summary
            const failedEntity = entities.find(e => e.id === failedId);
            let summaryHtml = '<div class="impact-badge impact-failed">FAILED</div>';
            summaryHtml += '<div class="info-field">';
            summaryHtml += '<div class="info-label">Failed Entity</div>';
            summaryHtml += '<div class="info-value">'+failedEntity.name+'</div>';
            summaryHtml += '<div class="info-value" style="color:#94a3b8;font-size:0.75rem;">'+failedEntity.entity_type+'</div>';
            summaryHtml += '</div>';
            
            // Show direct impact
            if (impactData.direct_impact_ids && impactData.direct_impact_ids.length > 0) {
                summaryHtml += '<div class="info-field">';
                summaryHtml += '<div class="info-label">Direct Impact ('+impactData.direct_impact_ids.length+')</div>';
                summaryHtml += '<div class="property-list">';
                impactData.direct_impact_ids.slice(0, 8).forEach(entityId => {
                    const e = entities.find(en => en.id === entityId);
                    if (e) summaryHtml += '<div class="property-item">• '+e.name+' <span style="color:#94a3b8">('+e.entity_type+')</span></div>';
                });
                if (impactData.direct_impact_ids.length > 8) {
                    summaryHtml += '<div class="property-item">... and '+(impactData.direct_impact_ids.length-8)+' more</div>';
                }
                summaryHtml += '</div></div>';
            } else {
                summaryHtml += '<div class="info-field">';
                summaryHtml += '<div class="info-label">Direct Impact</div>';
                summaryHtml += '<div class="info-value" style="color:#94a3b8">No direct dependencies found</div>';
                summaryHtml += '</div>';
            }
            
            // Show indirect impact
            if (impactData.indirect_impact_ids && impactData.indirect_impact_ids.length > 0) {
                summaryHtml += '<div class="info-field">';
                summaryHtml += '<div class="info-label">Indirect Impact ('+impactData.indirect_impact_ids.length+')</div>';
                summaryHtml += '<div class="property-list">';
                impactData.indirect_impact_ids.slice(0, 8).forEach(entityId => {
                    const e = entities.find(en => en.id === entityId);
                    if (e) summaryHtml += '<div class="property-item">• '+e.name+' <span style="color:#94a3b8">('+e.entity_type+')</span></div>';
                });
                if (impactData.indirect_impact_ids.length > 8) {
                    summaryHtml += '<div class="property-item">... and '+(impactData.indirect_impact_ids.length-8)+' more</div>';
                }
                summaryHtml += '</div></div>';
            }
            
            document.getElementById('impact-summary').innerHTML = summaryHtml;
            
            // Focus on failed entity and its neighborhood
            const impactedIds = [failedId, ...Array.from(directIds), ...Array.from(criticalIds)];
            network.fit({ nodes: impactedIds, animation: { duration: 1000, easingFunction: 'easeInOutQuad' } });
            
            // Pulse animation for failed node
            setInterval(() => {
                const node = nodes.find(n => n.id === failedId);
                if (node) {
                    node.size = node.size === 35 ? 40 : 35;
                    network.body.data.nodes.update(node);
                }
            }, 1000);
            
            console.log('🔥 Failure simulation loaded');
        }).catch(err => {
            document.getElementById('loading').innerHTML = '❌ Failed to load simulation<br><small>'+err.message+'</small>';
            console.error('Load error:', err);
        });
    </script>
</body>
</html>
"@

# Save HTML
$html | Out-File -FilePath $OutputFile -Encoding UTF8

Write-Host "✅ Failure simulation generated: $OutputFile" -ForegroundColor Green
Write-Host "🌐 Starting local HTTP server on port 8765...`n" -ForegroundColor Cyan

# Check if server already running, if not start it
$existingJob = Get-Job | Where-Object { $_.State -eq 'Running' -and $_.Command -like '*http.server 8765*' }

if (-not $existingJob) {
    $serverJob = Start-Job -ScriptBlock {
        Set-Location $using:PWD
        python -m http.server 8765
    }
    Write-Host "✅ Server started (Job ID: $($serverJob.Id))" -ForegroundColor Green
} else {
    Write-Host "✅ Server already running" -ForegroundColor Green
}

Start-Sleep -Seconds 1

Write-Host "🌐 Opening http://localhost:8765/$OutputFile`n" -ForegroundColor Cyan
Start-Process "http://localhost:8765/$OutputFile"

Write-Host "💡 Failure Visualization:" -ForegroundColor Yellow
Write-Host "   • 🔴 Red (pulsing) = Failed entity" -ForegroundColor White
Write-Host "   • 🟠 Orange = Critical path entities" -ForegroundColor White
Write-Host "   • 🟡 Amber = Direct impact" -ForegroundColor White
Write-Host "   • 🔵 Blue = Indirect impact" -ForegroundColor White
Write-Host "   • Gray = Not affected`n" -ForegroundColor White
