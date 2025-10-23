# Deploy OpenCost to monitoring namespace
# Tracks infrastructure costs across all customer namespaces

Write-Host "Deploying OpenCost for cost monitoring..." -ForegroundColor Cyan

# Check if monitoring namespace exists
$namespace = kubectl get namespace monitoring -o name 2>$null
if (-not $namespace) {
    Write-Host "Creating monitoring namespace..." -ForegroundColor Yellow
    kubectl create namespace monitoring
}

# Check if Prometheus is running
$prometheus = kubectl get svc -n monitoring -l app.kubernetes.io/name=prometheus -o name 2>$null
if (-not $prometheus) {
    Write-Host "WARNING: Prometheus not found in monitoring namespace!" -ForegroundColor Red
    Write-Host "OpenCost requires Prometheus to be running." -ForegroundColor Yellow
    Write-Host "Expected service: prometheus-kube-prometheus-prometheus" -ForegroundColor Yellow
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y") {
        exit 1
    }
}

# Install OpenCost Helm chart
Write-Host "`nInstalling OpenCost..." -ForegroundColor Green
helm install opencost ./charts/opencost `
    --namespace monitoring `
    --create-namespace `
    --wait

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n OpenCost deployed successfully!" -ForegroundColor Green
    
    # Wait for pod to be ready
    Write-Host "`nWaiting for OpenCost pod to be ready..." -ForegroundColor Cyan
    kubectl wait --for=condition=ready pod -l app=opencost -n monitoring --timeout=60s
    
    # Show status
    Write-Host "`nOpenCost Status:" -ForegroundColor Cyan
    kubectl get pods -n monitoring -l app=opencost
    kubectl get svc -n monitoring opencost
    
    # Port-forward instructions
    Write-Host "`n Access OpenCost:" -ForegroundColor Yellow
    Write-Host "Metrics:  kubectl port-forward -n monitoring svc/opencost 9003:9003" -ForegroundColor White
    Write-Host "          http://localhost:9003/metrics" -ForegroundColor Gray
    Write-Host "`nUI:       kubectl port-forward -n monitoring svc/opencost 9090:9090" -ForegroundColor White
    Write-Host "          http://localhost:9090" -ForegroundColor Gray
    
    # Example queries
    Write-Host "`n Example Prometheus Queries:" -ForegroundColor Yellow
    Write-Host "Total namespace cost:     sum(node_namespace_total_cost{namespace='customer-b4c867f4'})" -ForegroundColor White
    Write-Host "Monthly cost estimate:    sum(node_namespace_total_cost{namespace='customer-b4c867f4'}) * 24 * 30" -ForegroundColor White
    Write-Host "CPU cost:                 sum(node_namespace_cpu_cost{namespace='customer-b4c867f4'})" -ForegroundColor White
    
} else {
    Write-Host "`n OpenCost deployment failed!" -ForegroundColor Red
    Write-Host "Check logs: kubectl logs -n monitoring -l app=opencost" -ForegroundColor Yellow
    exit 1
}
