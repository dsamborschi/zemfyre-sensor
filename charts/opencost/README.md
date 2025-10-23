# OpenCost Helm Chart

**Kubernetes cost monitoring and allocation for multi-tenant SaaS platform.**

OpenCost tracks infrastructure costs per customer namespace, exposing metrics to Prometheus for billing and cost analysis.

## Features

- **Real-time Cost Tracking**: CPU, memory, storage, network costs per namespace/pod/service
- **Multi-Cloud Support**: AWS EKS, GCP GKE, Azure AKS, on-premises
- **Prometheus Integration**: Exposes cost metrics for querying and alerting
- **Namespace-Level Allocation**: Track costs per customer namespace
- **Web UI**: Optional cost visualization dashboard

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Kubernetes Cluster                          │
│                                                                 │
│  ┌─────────────┐        ┌──────────────┐                       │
│  │ Customer NS │        │ Customer NS  │   (Multiple customer   │
│  │ customer-1  │        │ customer-2   │    namespaces)        │
│  │             │        │              │                       │
│  │ Pods        │        │ Pods         │                       │
│  │ Services    │        │ Services     │                       │
│  └─────────────┘        └──────────────┘                       │
│         │                       │                              │
│         │  Resource Usage       │                              │
│         └───────────┬───────────┘                              │
│                     ▼                                          │
│            ┌─────────────────┐                                 │
│            │   OpenCost      │  ← Queries K8s API              │
│            │  (monitoring)   │  ← Queries Prometheus           │
│            │                 │  ← Cloud Provider Pricing API   │
│            └─────────────────┘                                 │
│                     │                                          │
│                     │ Cost Metrics                             │
│                     ▼                                          │
│            ┌─────────────────┐                                 │
│            │  Prometheus     │                                 │
│            │  (monitoring)   │                                 │
│            └─────────────────┘                                 │
│                     │                                          │
│         ┌───────────┴───────────┐                              │
│         ▼                       ▼                              │
│  ┌─────────────┐        ┌──────────────┐                      │
│  │  Grafana    │        │ Billing      │                      │
│  │  Dashboard  │        │ Exporter     │                      │
│  │             │        │              │                      │
│  │ Cost Viz    │        │ Query costs  │                      │
│  └─────────────┘        │ Send to API  │                      │
│                         └──────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

## Key Metrics Exposed

OpenCost exposes these Prometheus metrics:

### Namespace-Level Costs
```
# Total namespace cost (hourly)
node_namespace_total_cost{namespace="customer-abc123"}

# CPU cost
node_namespace_cpu_cost{namespace="customer-abc123"}

# Memory cost
node_namespace_memory_cost{namespace="customer-abc123"}

# Storage cost (PVCs)
node_namespace_pv_cost{namespace="customer-abc123"}

# Network egress cost
node_namespace_network_cost{namespace="customer-abc123"}
```

### Pod-Level Costs
```
# Pod CPU cost
pod_cpu_allocation_cost{namespace="customer-abc123", pod="api-deployment-xyz"}

# Pod memory cost
pod_memory_allocation_cost{namespace="customer-abc123", pod="api-deployment-xyz"}
```

### Resource Allocation
```
# CPU cores allocated
pod_cpu_allocation{namespace="customer-abc123"}

# Memory GB allocated
pod_memory_allocation_gb{namespace="customer-abc123"}
```

## Installation

### Prerequisites

1. **Kubernetes cluster** with metrics-server installed
2. **Prometheus** running (cluster-wide or per-namespace)
3. **ServiceMonitor CRD** (if using prometheus-operator)

### Deploy OpenCost

```bash
# Install to monitoring namespace
helm install opencost ./charts/opencost \
  --namespace monitoring \
  --create-namespace

# Verify deployment
kubectl get pods -n monitoring -l app=opencost
kubectl get svc -n monitoring opencost
```

### Configuration

Edit `values.yaml` to configure cloud provider:

**AWS EKS:**
```yaml
opencost:
  cloudProvider:
    provider: "AWS"
    aws:
      spotDataBucket: "my-spot-data-bucket"
```

**GCP GKE:**
```yaml
opencost:
  cloudProvider:
    provider: "GCP"
    gcp:
      billingDataDataset: "my-project.billing_export"
```

**Azure AKS:**
```yaml
opencost:
  cloudProvider:
    provider: "Azure"
    azure:
      subscriptionId: "your-subscription-id"
      resourceGroup: "your-resource-group"
```

**On-Premises/Generic:**
```yaml
opencost:
  cloudProvider:
    provider: ""  # Empty = use custom pricing
  pricing:
    cpu: "0.03"      # $ per CPU core per hour
    memory: "0.004"  # $ per GB RAM per hour
    storage: "0.0001" # $ per GB storage per hour
```

## Usage

### Query Costs via Prometheus

```promql
# Total cost for specific customer namespace (last hour)
sum(node_namespace_total_cost{namespace="customer-abc123"})

# Daily cost estimate
sum(node_namespace_total_cost{namespace="customer-abc123"}) * 24

# Monthly cost estimate
sum(node_namespace_total_cost{namespace="customer-abc123"}) * 24 * 30

# Cost breakdown by resource type
sum by (namespace) (node_namespace_cpu_cost)
sum by (namespace) (node_namespace_memory_cost)
sum by (namespace) (node_namespace_pv_cost)
```

### Access OpenCost UI

```bash
# Port-forward to access web UI
kubectl port-forward -n monitoring svc/opencost 9090:9090

# Open browser
http://localhost:9090
```

### Integrate with Billing Exporter

Update `billing-exporter` to query cost metrics:

```typescript
// In billing-exporter/src/collectors/cost-collector.ts

const namespaceCostQuery = `
  sum(node_namespace_total_cost{namespace="${namespace}"}) * 24 * 30
`;

const result = await this.prometheus.query(namespaceCostQuery);
const monthlyCost = parseFloat(result.data.result[0]?.value[1] || '0');

// Report to billing API
await this.billingApi.reportCost({
  customerId,
  month: currentMonth,
  infrastructureCost: monthlyCost,
  breakdown: {
    compute: cpuCost + memoryCost,
    storage: storageCost,
    network: networkCost
  }
});
```

## Cost Allocation Strategy

OpenCost allocates costs using these methods:

1. **Namespace Labels**: Customer namespaces labeled with `customer-id`
2. **Resource Requests**: Costs allocated based on CPU/memory requests
3. **Actual Usage**: Can optionally use actual usage vs requests
4. **Shared Resources**: Proportional allocation of shared cluster resources

### Label Customer Namespaces

Ensure customer namespaces have labels:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: customer-abc123
  labels:
    customer-id: "cust-abc123..."
    managed-by: "iotistic"
    plan: "enterprise"
```

## Grafana Dashboard

Create dashboard to visualize customer costs:

**Panel 1: Total Monthly Cost**
```promql
sum(node_namespace_total_cost{namespace=~"customer-.*"}) by (namespace) * 24 * 30
```

**Panel 2: Cost Breakdown**
```promql
sum(node_namespace_cpu_cost{namespace="customer-abc123"}) * 24 * 30
sum(node_namespace_memory_cost{namespace="customer-abc123"}) * 24 * 30
sum(node_namespace_pv_cost{namespace="customer-abc123"}) * 24 * 30
```

**Panel 3: Cost Trend (7 days)**
```promql
sum_over_time(node_namespace_total_cost{namespace="customer-abc123"}[7d:1h]) * 24
```

## Troubleshooting

### No cost metrics appearing

**Check OpenCost logs:**
```bash
kubectl logs -n monitoring deployment/opencost
```

**Verify Prometheus connection:**
```bash
kubectl exec -it -n monitoring deployment/opencost -- \
  curl http://prometheus-kube-prometheus-prometheus.monitoring:9090/api/v1/query?query=up
```

**Check ServiceMonitor:**
```bash
kubectl get servicemonitor -n monitoring opencost
```

### Costs seem inaccurate

**Verify cloud provider configuration:**
- AWS: Ensure IAM role has pricing API access
- GCP: Verify BigQuery billing export is enabled
- Azure: Check subscription ID and resource group

**Check custom pricing:**
If not using cloud provider pricing, verify `pricing` values in `values.yaml` match your actual infrastructure costs.

### Missing namespace costs

**Ensure namespaces have labels:**
```bash
kubectl get ns customer-abc123 -o yaml | grep customer-id
```

**Check RBAC permissions:**
```bash
kubectl auth can-i list namespaces --as=system:serviceaccount:monitoring:opencost
```

## Pricing Models

### Cloud Provider Pricing (Recommended)

OpenCost automatically fetches real pricing from cloud providers:

- **AWS**: Uses AWS Pricing API
- **GCP**: Uses BigQuery billing export
- **Azure**: Uses Azure Pricing API

### Custom Pricing

For on-premises or custom environments, set pricing in `values.yaml`:

```yaml
pricing:
  cpu: "0.031611"      # vCPU per hour (e.g., AWS c5.large)
  memory: "0.004237"   # GB RAM per hour
  storage: "0.00005"   # GB storage per hour (EBS gp3)
  network: "0.01"      # GB egress per GB
```

## Integration with Iotistic Platform

### 1. Update Billing Exporter

Add cost metrics to existing usage collection:

```typescript
// billing-exporter/src/collectors/namespace-cost-collector.ts

export class NamespaceCostCollector {
  async collectCosts(namespace: string): Promise<CostData> {
    const queries = {
      total: `sum(node_namespace_total_cost{namespace="${namespace}"})`,
      cpu: `sum(node_namespace_cpu_cost{namespace="${namespace}"})`,
      memory: `sum(node_namespace_memory_cost{namespace="${namespace}"})`,
      storage: `sum(node_namespace_pv_cost{namespace="${namespace}"})`,
      network: `sum(node_namespace_network_cost{namespace="${namespace}"})`
    };

    const results = await Promise.all(
      Object.entries(queries).map(([key, query]) =>
        this.prometheus.query(query).then(r => ({ key, value: r.data.result[0]?.value[1] }))
      )
    );

    return {
      hourly: parseFloat(results.find(r => r.key === 'total')?.value || '0'),
      daily: parseFloat(results.find(r => r.key === 'total')?.value || '0') * 24,
      monthly: parseFloat(results.find(r => r.key === 'total')?.value || '0') * 24 * 30,
      breakdown: {
        cpu: parseFloat(results.find(r => r.key === 'cpu')?.value || '0'),
        memory: parseFloat(results.find(r => r.key === 'memory')?.value || '0'),
        storage: parseFloat(results.find(r => r.key === 'storage')?.value || '0'),
        network: parseFloat(results.find(r => r.key === 'network')?.value || '0')
      }
    };
  }
}
```

### 2. Add to Customer Dashboard

Show cost metrics in customer dashboard:

```typescript
// dashboard/src/pages/Billing/InfrastructureCosts.tsx

const InfrastructureCosts = () => {
  const [costs, setCosts] = useState<CostData | null>(null);

  useEffect(() => {
    fetch('/api/billing/costs')
      .then(r => r.json())
      .then(setCosts);
  }, []);

  return (
    <Card>
      <CardHeader>Infrastructure Costs</CardHeader>
      <CardContent>
        <MetricRow label="Current Month" value={`$${costs?.monthly.toFixed(2)}`} />
        <Breakdown>
          <MetricRow label="Compute (CPU + Memory)" value={`$${(costs?.breakdown.cpu + costs?.breakdown.memory).toFixed(2)}`} />
          <MetricRow label="Storage" value={`$${costs?.breakdown.storage.toFixed(2)}`} />
          <MetricRow label="Network" value={`$${costs?.breakdown.network.toFixed(2)}`} />
        </Breakdown>
      </CardContent>
    </Card>
  );
};
```

### 3. Add to License/Billing API

Store historical costs:

```sql
-- billing/migrations/XXX_add_infrastructure_costs.js

exports.up = function(knex) {
  return knex.schema.createTable('infrastructure_costs', table => {
    table.increments('id').primary();
    table.string('customer_id').notNullable();
    table.date('date').notNullable();
    table.decimal('cost_total', 10, 4).notNullable();
    table.decimal('cost_cpu', 10, 4).notNullable();
    table.decimal('cost_memory', 10, 4).notNullable();
    table.decimal('cost_storage', 10, 4).notNullable();
    table.decimal('cost_network', 10, 4).notNullable();
    table.timestamps(true, true);
    
    table.index(['customer_id', 'date']);
  });
};
```

## Cost Optimization Tips

1. **Right-size resources**: Use actual usage metrics to adjust CPU/memory requests
2. **Storage cleanup**: Delete old PVCs, compress data
3. **Network optimization**: Minimize cross-zone traffic
4. **Spot instances**: Use spot instances for non-critical workloads (AWS/GCP)
5. **Resource quotas**: Prevent runaway costs with namespace quotas

## References

- [OpenCost Documentation](https://www.opencost.io/docs/)
- [OpenCost GitHub](https://github.com/opencost/opencost)
- [Kubernetes Cost Attribution](https://kubernetes.io/blog/2021/12/16/kubernetes-cost-attribution/)
- [FinOps Foundation](https://www.finops.org/)

## License

This chart deploys OpenCost (Apache 2.0 license).
