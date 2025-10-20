# Visualize Entity-Relationship Graph
# Fetches entities and relationships from Digital Twin API and generates interactive visualization

param(
    [string]$ApiUrl = "http://localhost:4002",
    [string]$OutputFile = "graph-visualization.html"
)

Write-Host "🔍 Fetching entities and relationships from Digital Twin API...`n" -ForegroundColor Cyan

# Fetch all entities
try {
    $entitiesResponse = Invoke-RestMethod -Uri "$ApiUrl/api/v1/entities" -Method Get
    # Extract data array from response
    $entities = if ($entitiesResponse.data) { $entitiesResponse.data } else { $entitiesResponse }
    Write-Host "✅ Found $($entities.Count) entities" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to fetch entities: $_" -ForegroundColor Red
    exit 1
}

# Fetch all relationships
try {
    $relationshipsResponse = Invoke-RestMethod -Uri "$ApiUrl/api/v1/relationships" -Method Get
    # Extract data array from response
    $relationships = if ($relationshipsResponse.data) { $relationshipsResponse.data } else { $relationshipsResponse }
    Write-Host "✅ Found $($relationships.Count) relationships`n" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to fetch relationships: $_" -ForegroundColor Red
    exit 1
}

# Display summary
Write-Host "📊 Entity Types:" -ForegroundColor Yellow
$entityGroups = $entities | Group-Object entity_type | Sort-Object Count -Descending
foreach ($group in $entityGroups) {
    Write-Host "   • $($group.Name): $($group.Count)" -ForegroundColor White
}

Write-Host "`n🔗 Relationship Types:" -ForegroundColor Yellow
$relationshipGroups = $relationships | Group-Object relationship_type | Sort-Object Count -Descending
foreach ($group in $relationshipGroups) {
    Write-Host "   • $($group.Name): $($group.Count)" -ForegroundColor White
}

# Save data as JSON files for the HTTP server to serve
$entities | ConvertTo-Json -Depth 10 | Out-File -FilePath "graph-data-entities.json" -Encoding UTF8
$relationships | ConvertTo-Json -Depth 10 | Out-File -FilePath "graph-data-relationships.json" -Encoding UTF8

Write-Host "📁 Data files created`n" -ForegroundColor Gray

# Generate HTML visualization
$html = @"
<!DOCTYPE html>
<html>
<head>
    <title>Digital Twin - Entity Relationship Graph</title>
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
        #header h1 { font-size: 1.5rem; color: #60a5fa; }
        #stats { display: flex; gap: 2rem; font-size: 0.875rem; }
        .stat { display: flex; align-items: center; gap: 0.5rem; }
        .stat-label { color: #94a3b8; }
        .stat-value { color: #60a5fa; font-weight: 600; }
        
        #mynetwork { position: fixed; top: 73px; left: 0; right: 0; bottom: 0; background: #0f172a; }
        
        #legend {
            position: fixed; bottom: 20px; left: 20px;
            background: rgba(30, 41, 59, 0.95); backdrop-filter: blur(10px);
            border: 1px solid #334155; border-radius: 8px;
            padding: 1rem; max-width: 250px; z-index: 1000;
        }
        #legend h3 { font-size: 0.875rem; color: #60a5fa; margin-bottom: 0.75rem; text-transform: uppercase; }
        .legend-item { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; font-size: 0.875rem; }
        .legend-color { 
            width: 16px; height: 16px; border: 2px solid #334155; 
            display: inline-block; flex-shrink: 0;
        }
        .legend-shape-box { border-radius: 2px; }
        .legend-shape-circle { border-radius: 50%; }
        .legend-shape-diamond { 
            width: 12px; height: 12px; 
            transform: rotate(45deg); 
            margin: 2px;
        }
        .legend-shape-triangle { 
            width: 0; height: 0; 
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-bottom: 14px solid;
            border-bottom-color: inherit;
            background: none !important;
        }
        .legend-shape-star { 
            clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
        }
        .legend-shape-hexagon {
            clip-path: polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%);
        }
        
        #info-panel {
            position: fixed; top: 73px; right: 20px; width: 300px;
            max-height: calc(100vh - 93px); background: rgba(30, 41, 59, 0.95);
            backdrop-filter: blur(10px); border: 1px solid #334155; border-radius: 8px;
            padding: 1.5rem; overflow-y: auto; display: none; z-index: 1000;
        }
        #info-panel.visible { display: block; }
        #info-panel h3 { font-size: 1.125rem; color: #60a5fa; margin-bottom: 1rem; }
        .info-field { margin-bottom: 1rem; }
        .info-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.25rem; }
        .info-value { color: #e2e8f0; font-size: 0.875rem; word-break: break-all; }
        .property-list { background: rgba(15, 23, 42, 0.5); border-radius: 4px; padding: 0.5rem; margin-top: 0.5rem; }
        .property-item { font-size: 0.75rem; color: #cbd5e1; margin-bottom: 0.25rem; }
        .close-btn { position: absolute; top: 1rem; right: 1rem; background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; }
        .close-btn:hover { color: #e2e8f0; }
        
        #loading { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #60a5fa; font-size: 1.5rem; }
    </style>
</head>
<body>
    <div id="loading">Loading graph data...</div>
    
    <div id="header" style="display: none;">
        <h1>🏢 Digital Twin - Entity Relationship Graph</h1>
        <div id="stats">
            <div class="stat"><span class="stat-label">Entities:</span><span class="stat-value" id="entity-count">0</span></div>
            <div class="stat"><span class="stat-label">Relationships:</span><span class="stat-value" id="relationship-count">0</span></div>
        </div>
    </div>
    
    <div id="mynetwork" style="display: none;"></div>
    
    <div id="legend" style="display: none;">
        <h3>Entity Types</h3>
        <div id="legend-content"></div>
    </div>
    
    <div id="info-panel">
        <button class="close-btn" onclick="closeInfoPanel()">×</button>
        <div id="info-content"></div>
    </div>

    <script>
        // Load data from local server
        Promise.all([
            fetch('http://localhost:8765/graph-data-entities.json').then(r => r.json()),
            fetch('http://localhost:8765/graph-data-relationships.json').then(r => r.json())
        ]).then(([entities, relationships]) => {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('header').style.display = 'flex';
            document.getElementById('mynetwork').style.display = 'block';
            document.getElementById('legend').style.display = 'block';
            
            document.getElementById('entity-count').textContent = entities.length;
            document.getElementById('relationship-count').textContent = relationships.length;
            
            // Colors for entity types
            const colors = {
                building: '#ef4444', floor: '#f59e0b', unit: '#10b981', stairwell: '#3b82f6',
                sensor: '#8b5cf6', device: '#ec4899', room: '#14b8a6', zone: '#f97316',
                equipment: '#6366f1', default: '#64748b'
            };
            
            // Define icons for entity types (Font Awesome unicode)
            const icons = {
                building: '\uf1ad',      // fa-building
                floor: '\uf0c8',         // fa-square (layers)
                room: '\uf2bd',          // fa-door-open
                unit: '\uf015',          // fa-home (house)
                device: '\uf0c3',        // fa-tablet
                sensor: '\uf06e',        // fa-eye
                equipment: '\uf0ad',     // fa-wrench
                gateway: '\uf233',       // fa-server
                zone: '\uf279',          // fa-map
                stairwell: '\uf0a8',     // fa-stairs
                default: '\uf111'        // fa-circle
            };
            
            // Create nodes
            const nodes = entities.map(e => {
                const icon = icons[e.entity_type] || icons.default;
                const color = colors[e.entity_type] || colors.default;
                
                return {
                    id: e.id,
                    label: e.entity_type === 'floor' && e.metadata?.floor_number !== undefined 
                        ? 'Floor '+e.metadata.floor_number : e.name,
                    color: color,
                    font: { 
                        color: '#ffffff', 
                        size: e.entity_type === 'building' ? 16 : 14,
                        bold: e.entity_type === 'building',
                        face: 'system-ui'
                    },
                    shape: 'icon',
                    icon: {
                        face: 'FontAwesome',
                        code: icon,
                        size: e.entity_type === 'building' ? 60 : (e.entity_type === 'unit' ? 45 : (e.entity_type === 'floor' ? 50 : 40)),
                        color: color
                    },
                    title: e.entity_type + ': ' + e.name,
                    entity: e
                };
            });
            
            // Create edges
            const edgeColors = {
                contains: '#60a5fa', connects_to: '#34d399', depends_on: '#fbbf24',
                adjacent_to: '#a78bfa', serves: '#fb923c', default: '#64748b'
            };
            
            const edges = relationships.map(r => ({
                from: r.source_entity_id,
                to: r.target_entity_id,
                color: edgeColors[r.relationship_type] || edgeColors.default,
                arrows: { to: { enabled: true, scaleFactor: 0.5 } },
                smooth: { type: 'curvedCW', roundness: 0.2 },
                width: 2,
                title: r.relationship_type,
                relationship: r
            }));
            
            // Create network
            const container = document.getElementById('mynetwork');
            const network = new vis.Network(container, { nodes, edges }, {
                physics: {
                    stabilization: { iterations: 200 },
                    barnesHut: {
                        gravitationalConstant: -8000,
                        centralGravity: 0.3,
                        springLength: 150,
                        springConstant: 0.04,
                        damping: 0.09,
                        avoidOverlap: 0.5
                    }
                },
                interaction: { hover: true, tooltipDelay: 100, navigationButtons: true, keyboard: true },
                layout: { improvedLayout: true }
            });
            
            // Legend with icons
            const entityTypes = [...new Set(entities.map(e => e.entity_type))].sort();
            const legendContent = document.getElementById('legend-content');
            
            entityTypes.forEach(type => {
                const color = colors[type] || colors.default;
                const icon = icons[type] || icons.default;
                
                legendContent.innerHTML += '<div class="legend-item"><i class="fa" style="color:'+color+';font-size:16px;width:16px;text-align:center;">'+icon+'</i><span>'+type+'</span></div>';
            });
            
            // Node click handler
            network.on('click', params => {
                if (params.nodes.length > 0) {
                    const entity = entities.find(e => e.id === params.nodes[0]);
                    if (entity) showEntityInfo(entity, entities, relationships);
                } else {
                    closeInfoPanel();
                }
            });
            
            // Focus on building nodes
            const buildingNodes = nodes.filter(n => n.entity.entity_type === 'building').map(n => n.id);
            if (buildingNodes.length > 0) {
                network.fit({ nodes: buildingNodes, animation: { duration: 1000, easingFunction: 'easeInOutQuad' } });
            }
            
            console.log('✅ Graph loaded:', entities.length, 'entities,', relationships.length, 'relationships');
        }).catch(err => {
            document.getElementById('loading').innerHTML = '❌ Failed to load data<br><small>'+err.message+'</small><br><br>Make sure the server is running:<br><code style="color:#60a5fa">python -m http.server 8765</code>';
            console.error('Load error:', err);
        });
        
        function showEntityInfo(entity, entities, relationships) {
            let html = '<h3>'+entity.name+'</h3>';
            html += '<div class="info-field"><div class="info-label">Type</div><div class="info-value">'+entity.entity_type+'</div></div>';
            html += '<div class="info-field"><div class="info-label">ID</div><div class="info-value" style="font-family:monospace;font-size:0.7rem;">'+entity.id+'</div></div>';
            
            if (entity.description) {
                html += '<div class="info-field"><div class="info-label">Description</div><div class="info-value">'+entity.description+'</div></div>';
            }
            
            if (entity.metadata && Object.keys(entity.metadata).length > 0) {
                html += '<div class="info-field"><div class="info-label">Metadata</div><div class="property-list">';
                for (const [k, v] of Object.entries(entity.metadata)) {
                    html += '<div class="property-item"><strong>'+k+':</strong> '+JSON.stringify(v)+'</div>';
                }
                html += '</div></div>';
            }
            
            const outgoing = relationships.filter(r => r.source_entity_id === entity.id);
            const incoming = relationships.filter(r => r.target_entity_id === entity.id);
            
            if (outgoing.length > 0) {
                html += '<div class="info-field"><div class="info-label">Outgoing ('+outgoing.length+')</div><div class="property-list">';
                outgoing.forEach(r => {
                    const target = entities.find(e => e.id === r.target_entity_id);
                    html += '<div class="property-item">'+r.relationship_type+' → '+(target?.name||'Unknown')+'</div>';
                });
                html += '</div></div>';
            }
            
            if (incoming.length > 0) {
                html += '<div class="info-field"><div class="info-label">Incoming ('+incoming.length+')</div><div class="property-list">';
                incoming.forEach(r => {
                    const source = entities.find(e => e.id === r.source_entity_id);
                    html += '<div class="property-item">'+(source?.name||'Unknown')+' → '+r.relationship_type+'</div>';
                });
                html += '</div></div>';
            }
            
            document.getElementById('info-content').innerHTML = html;
            document.getElementById('info-panel').classList.add('visible');
        }
        
        function closeInfoPanel() {
            document.getElementById('info-panel').classList.remove('visible');
        }
    </script>
</body>
</html>
"@

# Save HTML file
$html | Out-File -FilePath $OutputFile -Encoding UTF8

Write-Host "✅ Visualization generated: $OutputFile" -ForegroundColor Green
Write-Host "🌐 Starting local HTTP server on port 8765...`n" -ForegroundColor Cyan

# Start Python HTTP server in background
$serverJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    python -m http.server 8765
}

Write-Host "✅ Server started (Job ID: $($serverJob.Id))" -ForegroundColor Green
Write-Host "🌐 Opening http://localhost:8765/$OutputFile`n" -ForegroundColor Cyan

# Wait a moment for server to start
Start-Sleep -Seconds 2

# Open in default browser
Start-Process "http://localhost:8765/$OutputFile"

Write-Host "💡 Tips:" -ForegroundColor Yellow
Write-Host "   • Click nodes to see entity details" -ForegroundColor White
Write-Host "   • Drag nodes to rearrange" -ForegroundColor White
Write-Host "   • Scroll to zoom in/out" -ForegroundColor White
Write-Host "   • Use navigation buttons in bottom-right`n" -ForegroundColor White

Write-Host "🛑 To stop the server later, run: Stop-Job $($serverJob.Id); Remove-Job $($serverJob.Id)" -ForegroundColor Yellow
