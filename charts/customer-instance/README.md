# Customer Instance Helm Chart

Kubernetes Helm chart for deploying isolated customer instances of the Iotistic IoT platform.

## Overview

This chart deploys a complete IoT stack for each customer, including:

- **PostgreSQL** - Time-series database for sensor data
- **Mosquitto** - MQTT broker for device communication
- **API** - Backend API service
- **Dashboard** - Web-based admin panel
- **Billing Exporter** - Metrics collector for usage tracking

Each customer gets their own namespace with resource quotas and network policies.

## Prerequisites

- Kubernetes 1.23+
- Helm 3.8+
- Nginx Ingress Controller
- cert-manager (for TLS certificates)
- Storage class with dynamic provisioning

## Installation

### 1. Manual Installation

```bash
# Install for a specific customer
helm install customer-abc123 ./charts/customer-instance \
  --set customer.id=abc123 \
  --set customer.email=john@example.com \
  --set customer.companyName="Acme Corp" \
  --set license.key="eyJhbGc..." \
  --set domain.base=iotistic.cloud \
  --namespace customer-abc123 \
  --create-namespace
```

### 2. Automated Deployment (via Billing API)

The billing service automatically deploys instances when customers sign up:

```bash
# Customer signup triggers deployment
curl -X POST http://localhost:3000/api/customers/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123",
    "company_name": "Acme Corp"
  }'

# Check deployment status
curl http://localhost:3000/api/customers/abc123/deployment/status
```

## Configuration

### Required Values

```yaml
customer:
  id: "abc123"                    # Unique customer ID (used in URLs)
  email: "john@example.com"       # Customer email
  companyName: "Acme Corp"        # Company name

license:
  key: "eyJhbGc..."               # JWT license key

domain:
  base: "iotistdashic.ca"          # Base domain for customer subdomains
```

### Optional Values (with defaults)

```yaml
# PostgreSQL Configuration
postgres:
  image: postgres:15-alpine
  storageSize: 10Gi
  storageClass: standard
  resources:
    requests:
      cpu: 250m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

# Mosquitto MQTT Broker
mosquitto:
  image: eclipse-mosquitto:2.0
  mqttPort: 1883
  websocketPort: 9001
  resources:
    requests:
      cpu: 100m
      memory: 64Mi
    limits:
      cpu: 200m
      memory: 128Mi

# API Service
api:
  image: iotistic/api:latest
  port: 3001
  resources:
    requests:
      cpu: 250m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

# Dashboard
dashboard:
  image: iotistic/dashbaoard:latest
  port: 80
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 200m
      memory: 256Mi

# Billing Exporter
exporter:
  image: iotistic/billing-exporter:latest
  port: 9090
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 100m
      memory: 128Mi

# Ingress Configuration
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
  tls:
    enabled: true

# Resource Quota (per namespace)
resourceQuota:
  enabled: true
  cpu: "4"
  memory: "4Gi"
  pvcs: "5"
  services: "10"

# Network Policy
networkPolicy:
  enabled: true
```

## Access

Once deployed, the customer instance is accessible at:

- **Dashboard**: `https://{customer.id}.{domain.base}/`
- **API**: `https://{customer.id}.{domain.base}/api`
- **Metrics**: `https://{customer.id}.{domain.base}/metrics` (internal only)

Example: `https://abc123.iotistic.ca/`

## Architecture

```
Internet
    │
    ├─── Ingress (nginx + cert-manager)
    │         │
    │         ├─── / → Dashboard (port 80)
    │         ├─── /api → API (port 3001)
    │         └─── /metrics → Exporter (port 9090)
    │
    └─── Namespace: customer-{id}
              │
              ├─── PostgreSQL (ClusterIP:5432)
              │     └─── PVC (10Gi)
              │
              ├─── Mosquitto (ClusterIP:1883,9001)
              │
              ├─── API
              │     └─── Connects to: PostgreSQL, Mosquitto
              │
              ├─── Dashboard
              │     └─── Connects to: API
              │
              └─── Exporter
                    └─── Connects to: PostgreSQL
```

## Upgrading

```bash
# Update license or configuration
helm upgrade customer-abc123 ./charts/customer-instance \
  --set license.key="new-jwt-key" \
  --reuse-values \
  --namespace customer-abc123
```

## Uninstallation

```bash
# Delete via Helm
helm uninstall customer-abc123 --namespace customer-abc123

# Delete namespace (will cascade delete all resources)
kubectl delete namespace customer-abc123
```

Or via API:

```bash
curl -X DELETE http://localhost:3000/api/customers/abc123/deployment
```

## Monitoring

### Check Pod Status

```bash
kubectl get pods -n customer-abc123
kubectl describe pod <pod-name> -n customer-abc123
kubectl logs <pod-name> -n customer-abc123
```

### Check Services

```bash
kubectl get services -n customer-abc123
kubectl get ingress -n customer-abc123
```

### Check Resource Usage

```bash
kubectl top pods -n customer-abc123
kubectl describe resourcequota -n customer-abc123
```

### Metrics Endpoint

```bash
# Forward port to access metrics locally
kubectl port-forward -n customer-abc123 svc/customer-abc123-exporter 9090:9090

# Access Prometheus metrics
curl http://localhost:9090/metrics
```

## Troubleshooting

### Deployment Not Ready

```bash
# Check pod events
kubectl get events -n customer-abc123 --sort-by='.lastTimestamp'

# Check specific pod
kubectl describe pod <pod-name> -n customer-abc123
```

### License Validation Fails

Check API pod logs:

```bash
kubectl logs -n customer-abc123 deployment/customer-abc123-api
```

Verify license key is correct:

```bash
kubectl get secret customer-abc123-secrets -n customer-abc123 -o jsonpath='{.data.IOTISTIC_LICENSE_KEY}' | base64 -d
```

### Database Connection Issues

```bash
# Test PostgreSQL connectivity
kubectl exec -it -n customer-abc123 deployment/customer-abc123-api -- \
  pg_isready -h customer-abc123-postgres -p 5432
```

### MQTT Connection Issues

```bash
# Test Mosquitto connectivity
kubectl exec -it -n customer-abc123 deployment/customer-abc123-api -- \
  nc -zv customer-abc123-mosquitto 1883
```

### Storage Issues

```bash
# Check PVC status
kubectl get pvc -n customer-abc123

# Describe PVC for events
kubectl describe pvc postgres-data-customer-abc123-postgres-0 -n customer-abc123
```

## Security

### Secrets Management

All sensitive data is stored in Kubernetes Secrets:

- License keys
- Database credentials
- Customer information

```bash
# View secrets (base64 encoded)
kubectl get secret customer-abc123-secrets -n customer-abc123 -o yaml
```

### Network Policies

Network policies restrict traffic:

- Ingress: Only from ingress controller
- Egress: DNS + internal pods + HTTPS/HTTP (for updates)
- Inter-pod communication allowed within namespace

### Resource Quotas

Each namespace has resource quotas to prevent overuse:

- CPU: 4 cores
- Memory: 4Gi
- PVCs: 5
- Services: 10

## Development

### Testing the Chart

```bash
# Lint the chart
helm lint ./charts/customer-instance

# Dry run to see generated manifests
helm install --dry-run --debug test-customer ./charts/customer-instance \
  --set customer.id=test123 \
  --set customer.email=test@example.com \
  --set customer.companyName="Test Corp" \
  --set license.key="eyJtest..."

# Test on local cluster (minikube, kind, k3s)
helm install test-customer ./charts/customer-instance \
  --set customer.id=test123 \
  --set customer.email=test@example.com \
  --set customer.companyName="Test Corp" \
  --set license.key="eyJtest..." \
  --namespace customer-test123 \
  --create-namespace
```

### Template Development

```bash
# Render specific template
helm template test-customer ./charts/customer-instance \
  --show-only templates/api.yaml \
  --set customer.id=test123 \
  --set license.key="test"
```

## Support

For issues or questions:

1. Check pod logs: `kubectl logs <pod-name> -n customer-{id}`
2. Check events: `kubectl get events -n customer-{id}`
3. Check deployment status via API: `GET /api/customers/{id}/deployment/status`

## License

Proprietary - Iotistic
