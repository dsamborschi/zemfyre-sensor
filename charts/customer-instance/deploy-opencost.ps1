# Deploy OpenCost to existing customer namespace (Docker Desktop)
# Uses kubectl apply instead of Helm

param(
    [string]$Namespace = "customer-b4c867f4",
    [string]$CustomerId = "cust-b4c867f44a92453aba8a2fe3fe5d6e5e"
)

Write-Host "Deploying OpenCost to namespace: $Namespace" -ForegroundColor Cyan

# Generate manifests from Helm chart
$tempDir = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
Write-Host "Generating manifests in: $tempDir" -ForegroundColor Gray

# Create OpenCost deployment manifest
$opencostManifest = @"
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cb4c867f4-customer-instance-opencost
  namespace: $Namespace
  labels:
    app.kubernetes.io/name: customer-instance
    app.kubernetes.io/component: opencost
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: cb4c867f4-customer-instance-opencost
  labels:
    app.kubernetes.io/name: customer-instance
    app.kubernetes.io/component: opencost
rules:
- apiGroups: [""]
  resources:
  - nodes
  - pods
  - services
  - namespaces
  - persistentvolumes
  - persistentvolumeclaims
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources:
  - deployments
  - statefulsets
  - daemonsets
  - replicasets
  verbs: ["get", "list", "watch"]
- apiGroups: ["batch"]
  resources:
  - jobs
  - cronjobs
  verbs: ["get", "list", "watch"]
- apiGroups: ["storage.k8s.io"]
  resources:
  - storageclasses
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: cb4c867f4-customer-instance-opencost
  labels:
    app.kubernetes.io/name: customer-instance
    app.kubernetes.io/component: opencost
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cb4c867f4-customer-instance-opencost
subjects:
- kind: ServiceAccount
  name: cb4c867f4-customer-instance-opencost
  namespace: $Namespace
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cb4c867f4-customer-instance-opencost
  namespace: $Namespace
  labels:
    app.kubernetes.io/name: customer-instance
    app.kubernetes.io/component: opencost
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: customer-instance
      app.kubernetes.io/component: opencost
  template:
    metadata:
      labels:
        app.kubernetes.io/name: customer-instance
        app.kubernetes.io/component: opencost
    spec:
      serviceAccountName: cb4c867f4-customer-instance-opencost
      containers:
      - name: opencost
        image: quay.io/kubecost1/kubecost-cost-model:latest
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 9003
          name: metrics
          protocol: TCP
        env:
        # Prometheus configuration (dedicated Prometheus in same namespace)
        - name: PROMETHEUS_SERVER_ENDPOINT
          value: "http://cb4c867f4-customer-instance-prometheus:9090"
        
        # Customer identification
        - name: CLUSTER_ID
          value: "$CustomerId"
        - name: COST_ALLOCATION_NAMESPACE_LABEL
          value: "customer-id"
        
        # Default pricing (Docker Desktop - no cloud provider)
        - name: CPU_PRICE
          value: "0.031611"
        - name: MEMORY_PRICE
          value: "0.004237"
        - name: STORAGE_PRICE
          value: "0.00005"
        - name: NETWORK_PRICE
          value: "0.01"
        
        # Retention settings
        - name: RETENTION_DAYS
          value: "15"
        - name: RESOLUTION
          value: "hourly"
        
        # Logging
        - name: LOG_LEVEL
          value: "info"
        
        # Disable UI to save resources
        - name: UI_PORT
          value: ""
        
        resources:
          requests:
            cpu: 200m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
        
        livenessProbe:
          httpGet:
            path: /healthz
            port: 9003
          initialDelaySeconds: 30
          periodSeconds: 10
        
        readinessProbe:
          httpGet:
            path: /healthz
            port: 9003
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: cb4c867f4-customer-instance-opencost
  namespace: $Namespace
  labels:
    app.kubernetes.io/name: customer-instance
    app.kubernetes.io/component: opencost
spec:
  type: ClusterIP
  ports:
  - port: 9003
    targetPort: 9003
    protocol: TCP
    name: metrics
  selector:
    app.kubernetes.io/name: customer-instance
    app.kubernetes.io/component: opencost
"@

# Save manifest
$manifestFile = Join-Path $tempDir "opencost.yaml"
$opencostManifest | Out-File -FilePath $manifestFile -Encoding UTF8

Write-Host "`nApplying OpenCost manifests..." -ForegroundColor Green
kubectl apply -f $manifestFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ OpenCost deployed successfully!" -ForegroundColor Green
    
    # Wait for pod to be ready
    Write-Host "`nWaiting for OpenCost pod to be ready..." -ForegroundColor Cyan
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/component=opencost -n $Namespace --timeout=60s
    
    # Show status
    Write-Host "`n📊 OpenCost Status:" -ForegroundColor Cyan
    kubectl get pods -n $Namespace -l app.kubernetes.io/component=opencost
    kubectl get svc -n $Namespace -l app.kubernetes.io/component=opencost
    
    # Update Prometheus ConfigMap to add OpenCost scrape job
    Write-Host "`n📝 Updating Prometheus configuration..." -ForegroundColor Cyan
    
    $prometheusConfigPatch = @"
data:
  prometheus.yml: |
    global:
      scrape_interval: 30s
      evaluation_interval: 30s
      external_labels:
        customer_id: "$CustomerId"
        customer_plan: "enterprise"
        cluster: "$CustomerId"
    
    scrape_configs:
    # API metrics
    - job_name: 'api'
      static_configs:
      - targets: ['cb4c867f4-customer-instance-api:3002']
        labels:
          service: 'api'
          customer_id: "$CustomerId"
    
    # MQTT broker metrics
    - job_name: 'mosquitto'
      static_configs:
      - targets: ['cb4c867f4-customer-instance-mosquitto-exporter:9234']
        labels:
          service: 'mosquitto'
          customer_id: "$CustomerId"
    
    # PostgreSQL metrics
    - job_name: 'postgres'
      static_configs:
      - targets: ['cb4c867f4-customer-instance-postgres:9187']
        labels:
          service: 'postgres'
          customer_id: "$CustomerId"
    
    # OpenCost - infrastructure cost metrics
    - job_name: 'opencost'
      static_configs:
      - targets: ['cb4c867f4-customer-instance-opencost:9003']
        labels:
          service: 'opencost'
          customer_id: "$CustomerId"
"@

    $patchFile = Join-Path $tempDir "prometheus-patch.yaml"
    $prometheusConfigPatch | Out-File -FilePath $patchFile -Encoding UTF8
    
    kubectl apply -f $patchFile
    
    # Restart Prometheus to pick up new config
    Write-Host "`n🔄 Restarting Prometheus to apply new configuration..." -ForegroundColor Cyan
    kubectl delete pod -n $Namespace -l app.kubernetes.io/component=prometheus
    
    Start-Sleep -Seconds 10
    
    Write-Host "`n✅ Setup Complete!" -ForegroundColor Green
    Write-Host "`n📊 Access OpenCost:" -ForegroundColor Yellow
    Write-Host "Port-forward:  kubectl port-forward -n $Namespace svc/cb4c867f4-customer-instance-opencost 9003:9003" -ForegroundColor White
    Write-Host "Metrics URL:   http://localhost:9003/metrics" -ForegroundColor Gray
    Write-Host "`n📈 Query Costs in Prometheus:" -ForegroundColor Yellow
    Write-Host "Port-forward:  kubectl port-forward -n $Namespace svc/cb4c867f4-customer-instance-prometheus 9091:9090" -ForegroundColor White
    Write-Host "Prometheus:    http://localhost:9091" -ForegroundColor Gray
    Write-Host "`n💰 Example Query (monthly cost):" -ForegroundColor Cyan
    Write-Host "sum(node_namespace_total_cost{namespace=`"$Namespace`"}) * 24 * 30" -ForegroundColor White
    
} else {
    Write-Host "`n❌ OpenCost deployment failed!" -ForegroundColor Red
    Write-Host "Check errors above and try again." -ForegroundColor Yellow
    exit 1
}

# Cleanup temp files
Remove-Item -Recurse -Force $tempDir
