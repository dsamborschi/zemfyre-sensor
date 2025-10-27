# Add new customer to ArgoCD GitOps
# Usage: .\add-customer.ps1 -CustomerId "abc12345" -CustomerName "Acme Corp" -Plan "professional"

param(
    [Parameter(Mandatory=$true)]
    [string]$CustomerId,
    
    [Parameter(Mandatory=$true)]
    [string]$CustomerName,
    
    [Parameter(Mandatory=$true)]
    [ValidateSet("starter", "professional", "enterprise")]
    [string]$Plan
)

$ErrorActionPreference = "Stop"

$Namespace = "customer-$CustomerId"
$Hostname = "$CustomerId.iotistic.cloud"

Write-Host "🚀 Adding new customer to ArgoCD" -ForegroundColor Green
Write-Host "Customer ID: $CustomerId"
Write-Host "Customer Name: $CustomerName"
Write-Host "Plan: $Plan"
Write-Host "Namespace: $Namespace"
Write-Host "Hostname: $Hostname"
Write-Host ""

# Set resources based on plan
switch ($Plan) {
    "starter" {
        $ApiCpuReq = "100m"
        $ApiMemReq = "256Mi"
        $ApiCpuLim = "500m"
        $ApiMemLim = "512Mi"
        $PgSize = "10Gi"
        $MqttSize = "1Gi"
        $MonitoringDedicated = "false"
    }
    "professional" {
        $ApiCpuReq = "200m"
        $ApiMemReq = "512Mi"
        $ApiCpuLim = "1000m"
        $ApiMemLim = "1Gi"
        $PgSize = "20Gi"
        $MqttSize = "2Gi"
        $MonitoringDedicated = "false"
    }
    "enterprise" {
        $ApiCpuReq = "500m"
        $ApiMemReq = "1Gi"
        $ApiCpuLim = "2000m"
        $ApiMemLim = "2Gi"
        $PgSize = "50Gi"
        $MqttSize = "5Gi"
        $MonitoringDedicated = "true"
    }
}

# Create customer ArgoCD Application manifest
$CustomerFile = "argocd/customers/customer-$CustomerId.yaml"

$Content = @"
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: customer-$CustomerId
  namespace: argocd
  labels:
    customer-id: "$CustomerId"
    plan: "$Plan"
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: iotistic-customers
  
  source:
    repoURL: https://github.com/dsamborschi/zemfyre-sensor
    targetRevision: HEAD
    path: charts/customer-instance
    
    helm:
      # Use shared image versions (updated by CI/CD for all customers)
      valueFiles:
        - ../../argocd/shared/image-versions.yaml
        - ../../argocd/shared/common-values.yaml
      
      # Customer-specific configuration
      values: |
        customerId: "$CustomerId"
        customerName: "$CustomerName"
        
        # Namespace
        namespace: $Namespace
        
        # Ingress configuration
        ingress:
          host: $Hostname
        
        # License (TODO: Replace with actual license from billing service)
        licenseKey: "PLACEHOLDER_LICENSE_KEY"
        
        # $Plan plan configuration
        monitoring:
          enabled: true
          serviceMonitor:
            enabled: true
            namespace: monitoring
          dedicatedPrometheus: $MonitoringDedicated
        
        # $Plan plan resources
        resources:
          api:
            requests:
              cpu: $ApiCpuReq
              memory: $ApiMemReq
            limits:
              cpu: $ApiCpuLim
              memory: $ApiMemLim
        
        # Storage
        persistence:
          postgres:
            size: $PgSize
          mosquitto:
            size: $MqttSize
  
  destination:
    server: https://kubernetes.default.svc
    namespace: $Namespace
  
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
    
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
"@

Set-Content -Path $CustomerFile -Value $Content

Write-Host "✅ Created ArgoCD Application: $CustomerFile" -ForegroundColor Green
Write-Host ""

# Commit
Write-Host "📝 Committing changes..." -ForegroundColor Yellow
git add $CustomerFile
git commit -m "feat: add customer $CustomerId ($CustomerName) - $Plan plan`n`nCustomer will be automatically deployed by ArgoCD"

Write-Host ""
Write-Host "✅ Changes committed" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Push to deploy:" -ForegroundColor Yellow
Write-Host "   git push"
Write-Host ""
Write-Host "📊 Monitor deployment:" -ForegroundColor Yellow
Write-Host "   argocd app get customer-$CustomerId"
Write-Host "   argocd app sync customer-$CustomerId"
Write-Host "   kubectl get pods -n $Namespace"
Write-Host ""
Write-Host "⚠️  TODO:" -ForegroundColor Yellow
Write-Host "   1. Update licenseKey in $CustomerFile"
Write-Host "   2. Configure DNS for $Hostname"
Write-Host "   3. Verify ingress certificate"
