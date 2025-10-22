# Kubernetes-Based Consumption Billing

## Overview

If customer instances are deployed on **Kubernetes**, you can leverage K8s native monitoring instead of implementing custom traffic tracking in each service. This is **significantly simpler and more reliable**.

---

## Why Kubernetes Metrics are Better

### ✅ **Advantages**

1. **Already Collected** - K8s tracks everything automatically
2. **No Code Changes** - No need to instrument services
3. **Standardized** - Consistent across all customer deployments
4. **Historical Data** - Prometheus stores time-series data
5. **Production-Ready** - Battle-tested monitoring stack
6. **Resource Accurate** - Real CPU, memory, network from kernel

### ❌ **Custom Tracking Disadvantages**

1. **Code Overhead** - Middleware in every service
2. **Performance Impact** - Tracking adds latency
3. **Maintenance** - Must update tracking code
4. **Accuracy Issues** - Application-level tracking can miss traffic
5. **Fragmented** - Different implementations per service

---

## Kubernetes Metrics Available

### **1. Network Traffic** (via Network Policies + CNI)

```promql
# Total bytes sent by namespace
sum(rate(container_network_transmit_bytes_total{namespace="customer-abc"}[1h])) * 3600

# Total bytes received by namespace
sum(rate(container_network_receive_bytes_total{namespace="customer-abc"}[1h])) * 3600

# By pod (MQTT, API, etc.)
sum(rate(container_network_transmit_bytes_total{namespace="customer-abc",pod=~"mqtt.*"}[1h])) * 3600
```

### **2. Storage Usage** (via PersistentVolumeClaims)

```promql
# PostgreSQL PVC size
kubelet_volume_stats_used_bytes{namespace="customer-abc",persistentvolumeclaim="postgres-pvc"}

# Percentage used
kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes * 100
```

### **3. CPU & Memory** (via cAdvisor)

```promql
# CPU usage (cores)
sum(rate(container_cpu_usage_seconds_total{namespace="customer-abc"}[5m]))

# Memory usage (bytes)
sum(container_memory_working_set_bytes{namespace="customer-abc"})
```

### **4. HTTP Requests** (via Ingress/Service Mesh)

**Option A: Nginx Ingress Controller**
```promql
# Request count
sum(rate(nginx_ingress_controller_requests{namespace="customer-abc"}[1h])) * 3600

# Bytes sent
sum(rate(nginx_ingress_controller_response_size_sum{namespace="customer-abc"}[1h])) * 3600
```

**Option B: Istio Service Mesh**
```promql
# Request count per service
sum(rate(istio_requests_total{destination_namespace="customer-abc"}[1h])) * 3600

# Bytes sent
sum(rate(istio_response_bytes_sum{destination_namespace="customer-abc"}[1h])) * 3600
```

### **5. Database Queries** (via Database Exporter)

```promql
# PostgreSQL queries per second
rate(pg_stat_database_xact_commit{datname="Iotistic"}[1h])

# Database size
pg_database_size_bytes{datname="Iotistic"}
```

---

## Architecture: K8s-Based Billing

```
┌──────────────────────────────────────────────────────────────┐
│  Customer Kubernetes Namespace (customer-abc)                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   MQTT Pod  │  │   API Pod   │  │ Postgres Pod│          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│         ↓                ↓                  ↓                 │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Kubernetes Metrics (cAdvisor, kubelet)              │    │
│  │  - Network bytes in/out per pod                      │    │
│  │  - CPU/Memory usage                                  │    │
│  │  - Storage (PVC) usage                               │    │
│  └──────────────────────────────────────────────────────┘    │
│         ↓                                                     │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Prometheus (collects metrics every 15s)             │    │
│  │  - Stores time-series data                           │    │
│  │  - Retention: 30 days                                │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  Billing Exporter (Custom Service)                           │
│  - Queries Prometheus API hourly/daily                       │
│  - Aggregates metrics by customer namespace                  │
│  - Sends usage report to Global Billing API                  │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  Global Billing API                                           │
│  - Receives usage from all customer clusters                 │
│  - Calculates costs                                           │
│  - Reports to Stripe for metered billing                     │
└──────────────────────────────────────────────────────────────┘
```

---

## Implementation: Billing Exporter Service

### **Deployment Strategy**

**Option 1: Per-Customer Exporter** (Recommended)
- Deploy billing exporter in each customer namespace
- Exporter queries local Prometheus
- Sends usage directly to Global Billing API

**Option 2: Central Exporter**
- One exporter per K8s cluster
- Queries all customer namespaces
- Aggregates and sends batch reports

---

## Billing Exporter Code

### **File: `billing-exporter/src/index.ts`**

```typescript
import axios from 'axios';
import { PrometheusDriver } from 'prometheus-query';

interface UsageMetrics {
  customer_id: string;
  instance_id: string;
  network_bytes_sent: number;
  network_bytes_received: number;
  storage_used_gb: number;
  cpu_hours: number;
  memory_gb_hours: number;
  http_requests: number;
}

class BillingExporter {
  private prometheus: PrometheusDriver;
  private billingApiUrl: string;
  private customerId: string;
  private instanceId: string;

  constructor() {
    this.prometheus = new PrometheusDriver({
      endpoint: process.env.PROMETHEUS_URL || 'http://prometheus:9090',
      baseURL: '/api/v1'
    });
    
    this.billingApiUrl = process.env.BILLING_API_URL || 'https://billing.Iotistic.com';
    this.customerId = process.env.CUSTOMER_ID!;
    this.instanceId = process.env.INSTANCE_ID || 'k8s-cluster-1';
  }

  async collectMetrics(): Promise<UsageMetrics> {
    const namespace = process.env.NAMESPACE || 'default';
    const timeRange = '1h'; // Last hour

    // Network traffic
    const networkSent = await this.prometheus.instantQuery(
      `sum(increase(container_network_transmit_bytes_total{namespace="${namespace}"}[${timeRange}]))`
    );
    
    const networkReceived = await this.prometheus.instantQuery(
      `sum(increase(container_network_receive_bytes_total{namespace="${namespace}"}[${timeRange}]))`
    );

    // Storage (max value in period)
    const storage = await this.prometheus.instantQuery(
      `sum(kubelet_volume_stats_used_bytes{namespace="${namespace}"}) / 1024 / 1024 / 1024`
    );

    // CPU hours (core-hours)
    const cpuHours = await this.prometheus.instantQuery(
      `sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}"}[${timeRange}])) * 3600`
    );

    // Memory GB-hours
    const memoryGBHours = await this.prometheus.instantQuery(
      `sum(avg_over_time(container_memory_working_set_bytes{namespace="${namespace}"}[${timeRange}])) / 1024 / 1024 / 1024`
    );

    // HTTP requests (if using Nginx Ingress)
    const httpRequests = await this.prometheus.instantQuery(
      `sum(increase(nginx_ingress_controller_requests{namespace="${namespace}"}[${timeRange}]))`
    );

    return {
      customer_id: this.customerId,
      instance_id: this.instanceId,
      network_bytes_sent: this.extractValue(networkSent),
      network_bytes_received: this.extractValue(networkReceived),
      storage_used_gb: this.extractValue(storage),
      cpu_hours: this.extractValue(cpuHours),
      memory_gb_hours: this.extractValue(memoryGBHours),
      http_requests: this.extractValue(httpRequests)
    };
  }

  async reportUsage(metrics: UsageMetrics) {
    try {
      await axios.post(`${this.billingApiUrl}/api/usage/report`, metrics, {
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-ID': this.customerId
        }
      });
      
      console.log('✅ Usage reported successfully:', metrics);
    } catch (error: any) {
      console.error('❌ Failed to report usage:', error.message);
      throw error;
    }
  }

  private extractValue(result: any): number {
    if (result?.result?.[0]?.value?.[1]) {
      return parseFloat(result.result[0].value[1]);
    }
    return 0;
  }

  async run() {
    console.log('📊 Collecting metrics from Kubernetes...');
    
    const metrics = await this.collectMetrics();
    
    console.log('📤 Reporting usage to billing API...');
    await this.reportUsage(metrics);
    
    console.log('✅ Billing export complete');
  }
}

// Run every hour
const exporter = new BillingExporter();

// Initial run
exporter.run().catch(console.error);

// Schedule hourly
setInterval(() => {
  exporter.run().catch(console.error);
}, 60 * 60 * 1000); // 1 hour
```

---

## Kubernetes Deployment

### **ConfigMap for Customer Configuration**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: billing-exporter-config
  namespace: customer-abc
data:
  PROMETHEUS_URL: "http://prometheus:9090"
  BILLING_API_URL: "https://billing.Iotistic.com"
  CUSTOMER_ID: "cust_abc123xyz"
  INSTANCE_ID: "k8s-us-east-1"
  NAMESPACE: "customer-abc"
```

### **Deployment**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: billing-exporter
  namespace: customer-abc
spec:
  replicas: 1
  selector:
    matchLabels:
      app: billing-exporter
  template:
    metadata:
      labels:
        app: billing-exporter
    spec:
      serviceAccountName: billing-exporter
      containers:
      - name: exporter
        image: iotistic/billing-exporter:latest
        envFrom:
        - configMapRef:
            name: billing-exporter-config
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "100m"
```

### **ServiceAccount with Prometheus Access**

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: billing-exporter
  namespace: customer-abc
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: prometheus-reader
  namespace: customer-abc
rules:
- apiGroups: [""]
  resources: ["services", "endpoints", "pods"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: billing-exporter-prometheus
  namespace: customer-abc
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: prometheus-reader
subjects:
- kind: ServiceAccount
  name: billing-exporter
  namespace: customer-abc
```

---

## Prometheus Setup

### **Prometheus Configuration**

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  # Kubernetes cAdvisor metrics (container metrics)
  - job_name: 'kubernetes-cadvisor'
    kubernetes_sd_configs:
    - role: node
    relabel_configs:
    - source_labels: [__meta_kubernetes_node_name]
      regex: (.+)
      target_label: __metrics_path__
      replacement: /api/v1/nodes/${1}/proxy/metrics/cadvisor

  # Kubernetes kubelet metrics (volume, pod metrics)
  - job_name: 'kubernetes-nodes'
    kubernetes_sd_configs:
    - role: node
    relabel_configs:
    - action: labelmap
      regex: __meta_kubernetes_node_label_(.+)

  # Nginx Ingress Controller (HTTP metrics)
  - job_name: 'nginx-ingress'
    kubernetes_sd_configs:
    - role: pod
      namespaces:
        names:
        - ingress-nginx
    relabel_configs:
    - source_labels: [__meta_kubernetes_pod_label_app]
      action: keep
      regex: ingress-nginx

  # PostgreSQL Exporter
  - job_name: 'postgres'
    static_configs:
    - targets: ['postgres-exporter:9187']
```

---

## Database Schema Updates

### **Billing API Migration**

```sql
-- Update usage_reports table for K8s metrics
ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS network_bytes_sent BIGINT DEFAULT 0;
ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS network_bytes_received BIGINT DEFAULT 0;
ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS storage_used_gb DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS cpu_hours DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS memory_gb_hours DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS http_requests BIGINT DEFAULT 0;

-- Remove application-level metrics (not needed with K8s)
-- ALTER TABLE usage_reports DROP COLUMN IF EXISTS mqtt_messages_published;
-- ALTER TABLE usage_reports DROP COLUMN IF EXISTS mqtt_messages_received;
-- Keep these if you still want application-level granularity
```

---

## Pricing Model (K8s-Based)

### **Base Plans**

- **Starter**: $29/mo
  - 1 vCPU
  - 2 GB RAM
  - 10 GB storage
  - 100 GB network transfer

- **Professional**: $99/mo
  - 4 vCPU
  - 8 GB RAM
  - 50 GB storage
  - 500 GB network transfer

- **Enterprise**: Custom
  - Unlimited resources
  - Dedicated cluster

### **Overage Pricing**

- **CPU**: $0.05 per core-hour
- **Memory**: $0.01 per GB-hour
- **Storage**: $0.20 per GB per month
- **Network**: $0.10 per GB (ingress + egress)
- **HTTP Requests**: $0.50 per 1M requests

### **Cost Calculation**

```typescript
function calculateCost(usage: UsageMetrics, plan: Plan): number {
  let cost = plan.basePrice;

  // CPU overage
  if (usage.cpu_hours > plan.limits.cpu_hours) {
    const overage = usage.cpu_hours - plan.limits.cpu_hours;
    cost += overage * 0.05;
  }

  // Memory overage
  if (usage.memory_gb_hours > plan.limits.memory_gb_hours) {
    const overage = usage.memory_gb_hours - plan.limits.memory_gb_hours;
    cost += overage * 0.01;
  }

  // Storage overage
  if (usage.storage_used_gb > plan.limits.storage_gb) {
    const overage = usage.storage_used_gb - plan.limits.storage_gb;
    cost += overage * 0.20;
  }

  // Network overage
  const networkGB = (usage.network_bytes_sent + usage.network_bytes_received) / 1024 / 1024 / 1024;
  if (networkGB > plan.limits.network_gb) {
    const overage = networkGB - plan.limits.network_gb;
    cost += overage * 0.10;
  }

  return Math.round(cost * 100) / 100;
}
```

---

## Comparison: K8s vs Custom Tracking

| Feature | Custom Tracking | K8s Metrics |
|---------|----------------|-------------|
| **Implementation** | Complex (middleware in every service) | Simple (query Prometheus) |
| **Accuracy** | Application-level (may miss traffic) | Kernel-level (100% accurate) |
| **Performance Impact** | Yes (tracking overhead) | No (passive monitoring) |
| **Maintenance** | High (code in every service) | Low (standard K8s stack) |
| **Historical Data** | Need custom storage | Prometheus (built-in) |
| **Monitoring Tools** | Build custom | Grafana (ready) |
| **Multi-Tenant** | Complex isolation | Namespace-based (native) |
| **Cost to Implement** | 2-3 weeks dev | 1-2 days setup |

---

## Recommendations

### ✅ **Use Kubernetes Metrics If:**
- Customer instances deployed on K8s ✅
- Want simple, reliable billing
- Need infrastructure-level metrics (CPU, memory, network)
- Have Prometheus already (or can deploy it)
- Multi-tenant architecture (namespace per customer)

### ❌ **Use Custom Tracking If:**
- Not using Kubernetes
- Need application-specific metrics (e.g., MQTT message count by topic)
- Running on bare metal or VMs without orchestration
- Want to track business logic events (not infrastructure)

---

## Next Steps

### **Phase 1: Setup Prometheus Stack**
```bash
# Install Prometheus Operator
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace

# Verify metrics available
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090
# Open http://localhost:9090 and test queries
```

### **Phase 2: Deploy Billing Exporter**
```bash
# Build exporter image
cd billing-exporter
docker build -t iotistic/billing-exporter:latest .
docker push iotistic/billing-exporter:latest

# Deploy to customer namespace
kubectl apply -f k8s/billing-exporter.yaml -n customer-abc
```

### **Phase 3: Test Metrics Collection**
```bash
# Check exporter logs
kubectl logs -f deployment/billing-exporter -n customer-abc

# Verify metrics in Prometheus
# Query: sum(rate(container_network_transmit_bytes_total{namespace="customer-abc"}[1h]))
```

### **Phase 4: Integrate with Billing API**
- Update billing API to accept K8s metrics
- Create dashboard showing resource usage
- Test Stripe metered billing integration

---

## Conclusion

**YES, use Kubernetes metrics!** It's:
- ✅ **10x simpler** than custom tracking
- ✅ **More accurate** (kernel-level metrics)
- ✅ **Industry standard** (Prometheus + Grafana)
- ✅ **Production-ready** (battle-tested)
- ✅ **No code changes** to your services

The custom tracking approach should only be used if you're NOT on Kubernetes or need application-specific business metrics that K8s doesn't provide.
