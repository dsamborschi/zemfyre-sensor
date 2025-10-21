# Billing Exporter

Kubernetes metrics exporter for Zemfyre billing system. Collects resource usage metrics from Prometheus and reports them to the Global Billing API.

## Overview

The Billing Exporter is a lightweight service that:
- ✅ Queries Prometheus for Kubernetes metrics
- ✅ Collects network, CPU, memory, storage usage
- ✅ Reports hourly to Global Billing API
- ✅ Runs in customer Kubernetes namespaces
- ✅ Zero impact on customer workloads

## Architecture

```
Customer K8s Namespace
├── Customer Workloads (MQTT, API, Postgres, etc.)
├── Prometheus (collects metrics automatically)
└── Billing Exporter
    ├── Queries Prometheus every hour
    └── Reports to Global Billing API
```

## Metrics Collected

| Metric | Description | Prometheus Query |
|--------|-------------|------------------|
| **Network Sent** | Bytes transmitted (egress) | `container_network_transmit_bytes_total` |
| **Network Received** | Bytes received (ingress) | `container_network_receive_bytes_total` |
| **Storage Used** | PVC storage in GB | `kubelet_volume_stats_used_bytes` |
| **CPU Hours** | Core-hours consumed | `container_cpu_usage_seconds_total` |
| **Memory GB-Hours** | Memory usage over time | `container_memory_working_set_bytes` |
| **HTTP Requests** | Request count (via Ingress) | `nginx_ingress_controller_requests` |

## Configuration

### Environment Variables

```bash
# Required
CUSTOMER_ID=cust_abc123xyz          # Customer identifier
PROMETHEUS_URL=http://prometheus:9090  # Prometheus endpoint
BILLING_API_URL=https://billing.zemfyre.com  # Billing API URL

# Optional
INSTANCE_ID=k8s-us-east-1           # Instance identifier (default: k8s-cluster-1)
NAMESPACE=customer-abc              # K8s namespace to monitor (default: default)
COLLECTION_INTERVAL=3600000         # Collection interval in ms (default: 1 hour)
HEALTH_CHECK_PORT=8080              # Health check server port (default: 8080)
LOG_LEVEL=info                      # Log level (default: info)
```

## Development

### Prerequisites

- Node.js 18+
- Access to Prometheus instance
- Access to Billing API

### Install Dependencies

```bash
cd billing-exporter
npm install
```

### Local Development

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# Update: CUSTOMER_ID, PROMETHEUS_URL, BILLING_API_URL
nano .env

# Start in development mode
npm run dev
```

### Build TypeScript

```bash
# Compile TypeScript to JavaScript
npm run build

# Watch mode (auto-recompile on changes)
npm run watch

# Start compiled version
npm start
```

### Docker Build

```bash
# Build Docker image
npm run docker:build

# Or manually
docker build -t iotistic/billing-exporter:latest .

# Push to Docker registry
npm run docker:push

# Or manually
docker push iotistic/billing-exporter:latest

# Test locally with Docker
docker run --rm \
  -e CUSTOMER_ID=cust_test123 \
  -e PROMETHEUS_URL=http://prometheus:9090 \
  -e BILLING_API_URL=https://billing.zemfyre.com \
  -e NAMESPACE=test \
  iotistic/billing-exporter:latest
```

## Kubernetes Deployment

### 1. Build and Push Docker Image

```bash
cd billing-exporter

# Build image
npm run docker:build

# Or manually
docker build -t iotistic/billing-exporter:latest .

# Push to registry
npm run docker:push

# Or manually
docker push iotistic/billing-exporter:latest
```

### 2. Create Customer Namespace

```bash
# Create namespace for customer
kubectl create namespace customer-abc
```

### 3. Create ConfigMap

```bash
# Apply ConfigMap with customer configuration
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: billing-exporter-config
  namespace: customer-abc
data:
  PROMETHEUS_URL: "http://prometheus-kube-prometheus-prometheus.monitoring:9090"
  BILLING_API_URL: "https://billing.zemfyre.com"
  CUSTOMER_ID: "cust_abc123xyz"
  INSTANCE_ID: "k8s-us-east-1"
  NAMESPACE: "customer-abc"
  COLLECTION_INTERVAL: "3600000"
  LOG_LEVEL: "info"
EOF
```

### 4. Deploy Exporter

```bash
# Deploy billing exporter to customer namespace
kubectl apply -f k8s/deployment.yaml -n customer-abc
```

### 5. Verify Deployment

```bash
# Check pod status
kubectl get pods -n customer-abc -l app=billing-exporter

# Expected output:
# NAME                                READY   STATUS    RESTARTS   AGE
# billing-exporter-xxxxxxxxxx-xxxxx   1/1     Running   0          30s

# View logs (live)
kubectl logs -f deployment/billing-exporter -n customer-abc

# Expected output:
# 🚀 Starting Billing Exporter...
# 🔍 Verifying connectivity...
# ✅ Prometheus is reachable
# ✅ Billing API is reachable
# 📊 Collecting metrics from Kubernetes...
# ✅ Metrics collected successfully
# 📤 Reporting usage to billing API...
# ✅ Usage reported successfully
# ✅ Billing Exporter started - collecting every 60 minutes

# Check health endpoints
kubectl port-forward -n customer-abc deployment/billing-exporter 8080:8080

# In another terminal:
curl http://localhost:8080/health
curl http://localhost:8080/ready
curl http://localhost:8080/metrics
```

### 6. Verify Metrics Collection

```bash
# Check if metrics are being reported to billing API
# (Assuming you have the billing management scripts)
cd ../billing
npm run usage -- --customer cust_abc123xyz

# Should show usage data from the exporter
```

## Health Checks

### Liveness Probe
- **Endpoint**: `GET /health`
- **Purpose**: Is the service running?
- **Success**: HTTP 200

### Readiness Probe
- **Endpoint**: `GET /ready`
- **Purpose**: Is the service ready to collect metrics?
- **Success**: HTTP 200 (after first successful collection)
- **Failure**: HTTP 503 (if Prometheus unreachable or collection failed)

### Metrics Endpoint
- **Endpoint**: `GET /metrics`
- **Purpose**: Service info and last collection time
- **Response**:
```json
{
  "service": "billing-exporter",
  "version": "1.0.0",
  "customer_id": "cust_abc123xyz",
  "instance_id": "k8s-us-east-1",
  "namespace": "customer-abc",
  "last_collection": "2025-10-21T10:00:00.000Z",
  "uptime_seconds": 3600,
  "timestamp": "2025-10-21T11:00:00.000Z"
}
```

## API Integration

### Usage Report Format

The exporter sends usage reports to `POST /api/usage/report`:

```json
{
  "customer_id": "cust_abc123xyz",
  "instance_id": "k8s-us-east-1",
  "timestamp": "2025-10-21T10:00:00.000Z",
  "network_bytes_sent": 1234567890,
  "network_bytes_received": 987654321,
  "storage_used_gb": 15.3,
  "cpu_hours": 2.4,
  "memory_gb_hours": 5.1,
  "http_requests": 125000
}
```

## Troubleshooting

### Exporter Not Collecting Metrics

```bash
# Check pod status
kubectl get pods -n customer-abc -l app=billing-exporter

# Check logs for errors
kubectl logs -f deployment/billing-exporter -n customer-abc

# Common errors:
# - "Prometheus query failed" → Check Prometheus connectivity
# - "Failed to report usage" → Check Billing API connectivity
# - "CUSTOMER_ID environment variable is required" → Check ConfigMap

# Verify namespace configuration
kubectl get configmap billing-exporter-config -n customer-abc -o yaml

# Test Prometheus connectivity from pod
kubectl exec -it deployment/billing-exporter -n customer-abc -- wget -O- http://prometheus-kube-prometheus-prometheus.monitoring:9090/-/healthy

# Check if pod can reach Prometheus
kubectl exec -it deployment/billing-exporter -n customer-abc -- nc -zv prometheus-kube-prometheus-prometheus.monitoring 9090
```

### Prometheus Queries Failing

```bash
# Port-forward Prometheus to test queries locally
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090

# Test basic query
curl "http://localhost:9090/api/v1/query?query=up"

# Check if cAdvisor metrics are available
curl "http://localhost:9090/api/v1/query?query=container_network_transmit_bytes_total"

# Test specific namespace query
curl "http://localhost:9090/api/v1/query?query=container_network_transmit_bytes_total{namespace=\"customer-abc\"}"

# If no results, Prometheus may not be scraping cAdvisor
# Verify Prometheus scrape configs:
kubectl get prometheus -n monitoring -o yaml | grep -A 20 scrape_configs
```

### Billing API Unreachable

```bash
# Check network connectivity from pod
kubectl exec -it deployment/billing-exporter -n customer-abc -- wget -O- https://billing.zemfyre.com/health

# Verify BILLING_API_URL in config
kubectl get configmap billing-exporter-config -n customer-abc -o jsonpath='{.data.BILLING_API_URL}'

# Check if DNS resolution works
kubectl exec -it deployment/billing-exporter -n customer-abc -- nslookup billing.zemfyre.com

# Check exporter logs for API errors
kubectl logs -f deployment/billing-exporter -n customer-abc | grep "billing API"

# Verify customer ID is correct
kubectl get configmap billing-exporter-config -n customer-abc -o jsonpath='{.data.CUSTOMER_ID}'

# Test API endpoint from billing service
cd ../billing
npm run customer -- list
# Verify customer exists
```

### Pod Crashes or Restarts

```bash
# Check pod events
kubectl describe pod -n customer-abc -l app=billing-exporter

# Check resource limits
kubectl get pod -n customer-abc -l app=billing-exporter -o jsonpath='{.spec.containers[0].resources}'

# Increase resources if needed (edit deployment)
kubectl edit deployment billing-exporter -n customer-abc

# View previous pod logs if crashed
kubectl logs -n customer-abc -l app=billing-exporter --previous
```

### Health Checks Failing

```bash
# Test liveness probe
kubectl exec -it deployment/billing-exporter -n customer-abc -- wget -O- http://localhost:8080/health

# Test readiness probe
kubectl exec -it deployment/billing-exporter -n customer-abc -- wget -O- http://localhost:8080/ready

# Check pod events for probe failures
kubectl describe pod -n customer-abc -l app=billing-exporter | grep -A 10 Events

# If readiness fails:
# - Check if Prometheus is reachable
# - Check if first metrics collection succeeded
# - View logs for collection errors
```

### Missing Metrics or Zero Values

```bash
# Verify Prometheus has data for the namespace
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090

# Check network metrics
curl "http://localhost:9090/api/v1/query?query=sum(rate(container_network_transmit_bytes_total{namespace=\"customer-abc\"}[1h]))"

# Check storage metrics
curl "http://localhost:9090/api/v1/query?query=sum(kubelet_volume_stats_used_bytes{namespace=\"customer-abc\"})"

# Check CPU metrics
curl "http://localhost:9090/api/v1/query?query=sum(rate(container_cpu_usage_seconds_total{namespace=\"customer-abc\"}[1h]))"

# If queries return no data:
# 1. Wait a few minutes for metrics to be collected
# 2. Verify pods are running in the namespace
# 3. Check Prometheus scrape targets: http://localhost:9090/targets
```

## Resource Requirements

- **CPU**: 50m (request), 100m (limit)
- **Memory**: 64Mi (request), 128Mi (limit)
- **Storage**: None (stateless)
- **Network**: Minimal (hourly API calls)

## Security

### RBAC Permissions

The exporter requires minimal permissions:
- **Read** pods and services in its namespace
- **No write** permissions
- **No secrets** access
- **No cluster-wide** permissions

### Network Policies

Optional: Restrict exporter to only communicate with Prometheus and Billing API:
- Allow egress to Prometheus (monitoring namespace)
- Allow egress to Billing API (external)
- Allow egress to DNS (kube-system)

## Logging

Logs are JSON-formatted with timestamps:

```json
{
  "level": "info",
  "message": "✅ Metrics collected successfully",
  "timestamp": "2025-10-21 10:00:00",
  "service": "billing-exporter",
  "network_gb": "1.15",
  "storage_gb": "15.30",
  "cpu_hours": "2.40",
  "memory_gb_hours": "5.10",
  "http_requests": 125000
}
```

## License

Proprietary - Zemfyre Technologies Inc.
