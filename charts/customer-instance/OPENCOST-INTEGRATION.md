# OpenCost Integration - Customer Instance

## Overview

OpenCost is now **automatically deployed with every customer instance** to track infrastructure costs per customer namespace.

## What Gets Deployed

When a customer signs up (via billing service), they get:

```
customer-{id} namespace
├── PostgreSQL
├── Mosquitto MQTT broker
├── API service
├── Dashboard
├── Prometheus (if Enterprise tier)
├── Grafana (if Enterprise tier)
└── OpenCost ← NEW! Tracks infrastructure costs
```

## Configuration in values.yaml

```yaml
opencost:
  enabled: true  # Deploy OpenCost for all customers
  
  image:
    repository: quay.io/kubecost1/kubecost-cost-model
    tag: latest
  
  resources:
    requests:
      cpu: 200m      # Small footprint
      memory: 256Mi
  
  cloudProvider:
    provider: ""  # Set to "AWS", "GCP", or "Azure" for production
  
  pricing:
    cpu: "0.031611"      # Default pricing (AWS c5.large baseline)
    memory: "0.004237"
    storage: "0.00005"
    network: "0.01"
```

## How It Works

### 1. Automatic Deployment

When billing service creates customer:

```typescript
// billing/src/services/k8s-deployment-service.ts

const values = {
  customer: {
    id: customerId,
    plan: customer.plan
  },
  opencost: {
    enabled: true,  // Always enabled
    cloudProvider: {
      provider: process.env.CLOUD_PROVIDER || ""  // "AWS", "GCP", "Azure", or ""
    }
  },
  monitoring: {
    dedicated: customer.plan === 'enterprise'
  }
};

await helm.install('customer-instance', values);
```

### 2. Prometheus Scraping

OpenCost metrics are automatically scraped by:

- **Enterprise customers:** Their dedicated Prometheus in the same namespace
- **Starter/Professional:** Shared cluster Prometheus (when available)

Scrape configuration added automatically in `prometheus-dedicated.yaml`:

```yaml
scrape_configs:
- job_name: 'opencost'
  static_configs:
  - targets: ['cb4c867f4-customer-instance-opencost:9003']
    labels:
      service: 'opencost'
      customer_id: 'cust-b4c867f4...'
```

### 3. Cost Metrics Available

Once deployed, these metrics appear in Prometheus:

```promql
# Total namespace cost (hourly)
node_namespace_total_cost{namespace="customer-b4c867f4"}

# Cost breakdown
node_namespace_cpu_cost{namespace="customer-b4c867f4"}
node_namespace_memory_cost{namespace="customer-b4c867f4"}
node_namespace_pv_cost{namespace="customer-b4c867f4"}
node_namespace_network_cost{namespace="customer-b4c867f4"}

# Pod-level costs
pod_cpu_allocation_cost{namespace="customer-b4c867f4", pod="api-..."}
pod_memory_allocation_cost{namespace="customer-b4c867f4", pod="postgres-..."}
```

## Billing Service Integration

### Update k8s-deployment-service.ts

Add cloud provider configuration:

```typescript
// billing/src/services/k8s-deployment-service.ts

async deployCustomerInstance(customer: Customer): Promise<void> {
  const values = {
    customer: {
      id: this.sanitizeCustomerId(customer.id),
      email: customer.email,
      plan: customer.plan
    },
    
    // OpenCost configuration
    opencost: {
      enabled: true,
      cloudProvider: {
        provider: this.getCloudProvider()  // NEW method
      }
    },
    
    monitoring: {
      dedicated: customer.plan === 'enterprise'
    }
  };

  await this.helm.install(...);
}

private getCloudProvider(): string {
  // Detect cloud provider from environment or cluster
  const provider = process.env.CLOUD_PROVIDER || '';
  
  // Validate
  if (provider && !['AWS', 'GCP', 'Azure'].includes(provider)) {
    logger.warn(`Invalid cloud provider: ${provider}, using default pricing`);
    return '';
  }
  
  return provider;
}
```

### Environment Variables

Add to billing service `.env`:

```bash
# Cloud provider for OpenCost pricing
# Options: AWS, GCP, Azure, or empty for default pricing
CLOUD_PROVIDER=AWS  # Set based on your cluster location
```

## Querying Costs

### From Grafana

Customers can see their costs in Grafana dashboards:

**Monthly Cost Estimate:**
```promql
sum(node_namespace_total_cost{namespace="customer-b4c867f4"}) * 24 * 30
```

**Cost Breakdown:**
```promql
sum(node_namespace_cpu_cost{namespace="customer-b4c867f4"}) * 24 * 30
sum(node_namespace_memory_cost{namespace="customer-b4c867f4"}) * 24 * 30
sum(node_namespace_pv_cost{namespace="customer-b4c867f4"}) * 24 * 30
```

### From Billing Exporter

Update billing-exporter to collect costs:

```typescript
// billing-exporter/src/collectors/cost-metrics-collector.ts

const monthlyCost = await prometheus.query(
  `sum(node_namespace_total_cost{namespace="${namespace}"}) * 24 * 30`
);

await billingApi.reportCost({
  customerId,
  month: currentMonth,
  infrastructureCost: parseFloat(monthlyCost.data.result[0]?.value[1] || '0')
});
```

## Pricing Modes

### Docker Desktop (Local Dev)

```yaml
opencost:
  cloudProvider:
    provider: ""  # Empty = use default pricing
  pricing:
    cpu: "0.031611"
    memory: "0.004237"
```

**Cost accuracy:** ~50-70% (generic estimates)

### AWS EKS (Production)

```yaml
opencost:
  cloudProvider:
    provider: "AWS"  # Auto-fetches AWS pricing
```

**Cost accuracy:** 95-99% (real AWS Pricing API)

### GCP GKE (Production)

```yaml
opencost:
  cloudProvider:
    provider: "GCP"
    gcp:
      billingDataDataset: "project.billing_export"
```

**Cost accuracy:** 99% (actual BigQuery billing data)

### Azure AKS (Production)

```yaml
opencost:
  cloudProvider:
    provider: "Azure"
    azure:
      subscriptionId: "..."
      resourceGroup: "..."
```

**Cost accuracy:** 95-99% (Azure Rate Card API)

## Example Cost Calculation

### Starter Plan Customer

**Resources:**
- API: 250m CPU, 256Mi memory
- Postgres: 250m CPU, 256Mi memory + 10Gi storage
- Mosquitto: 100m CPU, 64Mi memory

**Calculation (default pricing):**
```
CPU:     0.6 vCPU × $0.0316/vCPU/hr = $0.019/hr
Memory:  0.576 GB × $0.0042/GB/hr  = $0.002/hr
Storage: 10 GB × $0.00005/GB/hr    = $0.0005/hr
────────────────────────────────────────────────
Total:   $0.0215/hr = $0.52/day = $15.48/month
```

### Enterprise Plan Customer

**Resources:**
- API: 250m CPU, 256Mi memory
- Postgres: 500m CPU, 512Mi memory + 10Gi storage
- Mosquitto: 100m CPU, 64Mi memory
- Prometheus: 500m CPU, 1Gi memory + 50Gi storage
- Grafana: 100m CPU, 128Mi memory
- Dashboard: 100m CPU, 128Mi memory
- OpenCost: 200m CPU, 256Mi memory

**Calculation (default pricing):**
```
CPU:     1.75 vCPU × $0.0316/vCPU/hr = $0.055/hr
Memory:  2.38 GB × $0.0042/GB/hr    = $0.010/hr
Storage: 60 GB × $0.00005/GB/hr     = $0.003/hr
───────────────────────────────────────────────
Total:   $0.068/hr = $1.63/day = $48.96/month
```

## Testing Locally

### 1. Deploy Test Customer

```powershell
cd billing
npm run dev

# In another terminal
./scripts/complete-signup-workflow.ps1
```

### 2. Check OpenCost Deployed

```powershell
kubectl get pods -n customer-b4c867f4 | Select-String "opencost"

# Should see:
# cb4c867f4-customer-instance-opencost-xxx   1/1   Running
```

### 3. Port-Forward OpenCost

```powershell
kubectl port-forward -n customer-b4c867f4 `
  svc/cb4c867f4-customer-instance-opencost 9003:9003

# Check metrics
curl http://localhost:9003/metrics | Select-String "node_namespace"
```

### 4. Query in Prometheus

```powershell
# Port-forward Prometheus
kubectl port-forward -n customer-b4c867f4 `
  svc/cb4c867f4-customer-instance-prometheus 9091:9090

# Open browser: http://localhost:9091
# Query: sum(node_namespace_total_cost{namespace="customer-b4c867f4"})
```

### 5. View in Grafana

```powershell
# Port-forward Grafana
kubectl port-forward -n customer-b4c867f4 `
  svc/cb4c867f4-customer-instance-grafana 3001:80

# Open browser: http://localhost:3001 (admin/admin)
# Go to Explore
# Query: sum(node_namespace_total_cost{namespace="customer-b4c867f4"}) * 24 * 30
```

## Grafana Dashboard

Create a "Infrastructure Costs" dashboard panel:

**Panel 1: Monthly Cost (Single Stat)**
```promql
sum(node_namespace_total_cost{namespace="customer-b4c867f4"}) * 24 * 30
```
Unit: Currency → USD
Decimals: 2

**Panel 2: Cost Breakdown (Pie Chart)**
```promql
sum(node_namespace_cpu_cost{namespace="customer-b4c867f4"}) * 24 * 30
sum(node_namespace_memory_cost{namespace="customer-b4c867f4"}) * 24 * 30
sum(node_namespace_pv_cost{namespace="customer-b4c867f4"}) * 24 * 30
```
Legend: Compute, Memory, Storage

**Panel 3: Daily Cost Trend (Graph)**
```promql
sum_over_time(node_namespace_total_cost{namespace="customer-b4c867f4"}[24h:1h]) * 24
```
Time range: Last 7 days

## Troubleshooting

### OpenCost pod not starting

**Check logs:**
```powershell
kubectl logs -n customer-b4c867f4 deployment/cb4c867f4-customer-instance-opencost
```

**Common issues:**
- Prometheus not reachable → Check monitoring.dedicated setting
- RBAC permissions → Check ClusterRole/ClusterRoleBinding created
- Image pull failed → Check image.pullPolicy setting

### No cost metrics appearing

**Check Prometheus scraping:**
```powershell
# Get Prometheus config
kubectl get configmap -n customer-b4c867f4 `
  cb4c867f4-customer-instance-prometheus-config -o yaml

# Look for opencost job in scrape_configs
```

**Verify OpenCost is exposing metrics:**
```powershell
kubectl port-forward -n customer-b4c867f4 `
  svc/cb4c867f4-customer-instance-opencost 9003:9003

curl http://localhost:9003/metrics | Select-String "opencost"
```

### Costs are $0.00

**Check pods have resource requests:**
```powershell
kubectl get pods -n customer-b4c867f4 -o json | `
  Select-String "resources" -Context 3,3
```

All pods must have CPU/memory requests set for OpenCost to calculate costs.

## Next Steps

1. ✅ OpenCost now deploys automatically with every customer
2. 📊 Create Grafana dashboard template for cost visualization
3. 💰 Update billing-exporter to collect and report costs
4. 📧 Add cost alerts (e.g., email if >$100/month)
5. 🏷️ Set CLOUD_PROVIDER env var for production pricing

## References

- [OpenCost Documentation](https://www.opencost.io/docs/)
- [Helm Chart Values](../values.yaml#opencost)
- [Prometheus Template](./prometheus-dedicated.yaml)
- [OpenCost Template](./opencost.yaml)
