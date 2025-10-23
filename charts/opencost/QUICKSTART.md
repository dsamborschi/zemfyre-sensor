# OpenCost Quick Start Guide

## What is OpenCost?

OpenCost tracks **real Kubernetes infrastructure costs** per customer namespace. It provides:

- **Hourly/Daily/Monthly cost estimates** per namespace
- **Resource breakdown**: CPU, memory, storage, network costs
- **Pod-level granularity**: See which pods cost the most
- **Prometheus integration**: Query costs like any other metric

## Prerequisites

✅ Kubernetes cluster running  
✅ Prometheus installed in `monitoring` namespace  
✅ ServiceMonitor CRD installed (if using prometheus-operator)

## Quick Deploy

```powershell
# From charts/opencost directory
cd charts/opencost
./deploy.ps1
```

That's it! OpenCost is now collecting cost data.

## Verify It's Working

```powershell
# Check pod status
kubectl get pods -n monitoring -l app=opencost

# Check metrics endpoint
kubectl port-forward -n monitoring svc/opencost 9003:9003
curl http://localhost:9003/metrics | Select-String "node_namespace"
```

You should see metrics like:
```
node_namespace_total_cost{namespace="customer-b4c867f4"} 0.042
node_namespace_cpu_cost{namespace="customer-b4c867f4"} 0.031
node_namespace_memory_cost{namespace="customer-b4c867f4"} 0.008
```

## Query Costs in Prometheus

```promql
# Total hourly cost for customer
sum(node_namespace_total_cost{namespace="customer-b4c867f4"})

# Estimated monthly cost
sum(node_namespace_total_cost{namespace="customer-b4c867f4"}) * 24 * 30

# Cost breakdown
sum(node_namespace_cpu_cost{namespace="customer-b4c867f4"})      # CPU
sum(node_namespace_memory_cost{namespace="customer-b4c867f4"})   # Memory
sum(node_namespace_pv_cost{namespace="customer-b4c867f4"})       # Storage
```

## Access OpenCost UI

```powershell
kubectl port-forward -n monitoring svc/opencost 9090:9090
# Open browser: http://localhost:9090
```

## Integration with Billing System

OpenCost metrics are automatically scraped by Prometheus. To send costs to your billing API:

### Option 1: Update billing-exporter (Recommended)

The `billing-exporter` already collects metrics from Prometheus. Add cost queries to it:

```typescript
// In billing-exporter/src/metrics-collector.ts

// Add to existing queries
const costQueries = {
  total: `sum(node_namespace_total_cost{namespace="${namespace}"})`,
  cpu: `sum(node_namespace_cpu_cost{namespace="${namespace}"})`,
  memory: `sum(node_namespace_memory_cost{namespace="${namespace}"})`,
  storage: `sum(node_namespace_pv_cost{namespace="${namespace}"})`
};
```

### Option 2: Use cost-metrics-collector (New)

A dedicated cost collector is available at:
`billing-exporter/src/collectors/cost-metrics-collector.ts`

## Customize Pricing

By default, OpenCost uses generic pricing. To use your actual cloud provider costs:

### AWS EKS
```yaml
# charts/opencost/values.yaml
opencost:
  cloudProvider:
    provider: "AWS"
```

### GCP GKE
```yaml
opencost:
  cloudProvider:
    provider: "GCP"
    gcp:
      billingDataDataset: "my-project.billing_export"
```

### Custom Pricing (On-Prem)
```yaml
opencost:
  pricing:
    cpu: "0.03"        # $ per vCPU per hour
    memory: "0.004"    # $ per GB RAM per hour
    storage: "0.0001"  # $ per GB storage per hour
    network: "0.01"    # $ per GB egress
```

Then redeploy:
```powershell
helm upgrade opencost ./charts/opencost -n monitoring
```

## Grafana Dashboard

Create a dashboard to visualize customer costs:

**Query Examples:**

1. **Monthly Cost Gauge**
   ```promql
   sum(node_namespace_total_cost{namespace="customer-b4c867f4"}) * 24 * 30
   ```

2. **Cost Breakdown (Stacked Bar)**
   ```promql
   sum(node_namespace_cpu_cost{namespace="customer-b4c867f4"}) * 24 * 30
   sum(node_namespace_memory_cost{namespace="customer-b4c867f4"}) * 24 * 30
   sum(node_namespace_pv_cost{namespace="customer-b4c867f4"}) * 24 * 30
   ```

3. **Cost Trend (Graph)**
   ```promql
   sum_over_time(node_namespace_total_cost{namespace="customer-b4c867f4"}[7d:1h]) * 24
   ```

## Troubleshooting

### No metrics appearing

**Check OpenCost logs:**
```powershell
kubectl logs -n monitoring deployment/opencost
```

**Verify Prometheus connection:**
```powershell
kubectl exec -it -n monitoring deployment/opencost -- \
  wget -qO- http://prometheus-kube-prometheus-prometheus.monitoring:9090/api/v1/status/config
```

### Costs are $0.00

This happens when:
- Namespaces have no resource requests/limits set
- OpenCost hasn't collected enough data yet (wait ~5 minutes)
- Cloud provider pricing not configured (uses generic pricing)

**Fix:** Set resource requests on all pods:
```yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
```

### ServiceMonitor not working

**Check if Prometheus is scraping:**
```powershell
# Check ServiceMonitor exists
kubectl get servicemonitor -n monitoring opencost

# Check Prometheus targets
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090
# Open: http://localhost:9090/targets
# Look for "opencost" target
```

## Example Cost Calculation

Given these resources in namespace `customer-b4c867f4`:
- API pod: 250m CPU, 256Mi memory
- Postgres: 500m CPU, 512Mi memory
- Mosquitto: 100m CPU, 64Mi memory
- Storage: 10Gi PVC

**With default pricing:**
- CPU: (0.25 + 0.5 + 0.1) cores × $0.031/hr = $0.026/hr
- Memory: (0.25 + 0.5 + 0.064) GB × $0.004/hr = $0.003/hr
- Storage: 10 GB × $0.00005/hr = $0.0005/hr
- **Total: ~$0.03/hr = $0.72/day = $21.60/month**

## Next Steps

1. ✅ Deploy OpenCost (done with `deploy.ps1`)
2. 📊 Create Grafana dashboard for cost visualization
3. 💰 Integrate costs into billing-exporter
4. 📧 Set up cost alerts (e.g., namespace > $100/month)
5. 🏷️ Add cost labels to customer namespaces for better tracking

## References

- [OpenCost Docs](https://www.opencost.io/docs/)
- [Prometheus Queries](../README.md#prometheus-queries)
- [Billing Exporter Integration](../../billing-exporter/README.md)
