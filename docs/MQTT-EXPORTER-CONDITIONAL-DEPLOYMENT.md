# MQTT Exporter Conditional Deployment

## Problem
MQTT Exporter was being deployed for **all tiers** (Starter/Professional/Enterprise), but Starter/Professional plans don't have dedicated Prometheus, so the exporter has nowhere to send metrics. This caused:
- Unnecessary pod restarts (authentication errors)
- Wasted resources (CPU/memory)
- Confusion about deployment status

## Solution
**Deploy MQTT Exporter only for Enterprise tier** (when `monitoring.dedicated=true`)

### Deployment Logic by Tier

| Tier | Prometheus | MQTT Exporter | Reasoning |
|------|-----------|---------------|-----------|
| **Starter** | None (shared cluster) | ❌ No | No local Prometheus to scrape metrics |
| **Professional** | None (shared cluster) | ❌ No | No local Prometheus to scrape metrics |
| **Enterprise** | ✅ Dedicated | ✅ Yes | Dedicated Prometheus scrapes MQTT metrics |

## Implementation

### 1. Values.yaml Default
```yaml
# charts/customer-instance/values.yaml
mosquitto:
  metrics:
    enabled: false  # Will be overridden to true for Enterprise
```

### 2. Billing Service Logic
```typescript
// billing/src/services/k8s-deployment-service.ts
const hasDedicatedPrometheus = monitoringConfig.dedicated;
const mosquittoMetricsSection = `
mosquitto:
  metrics:
    enabled: ${hasDedicatedPrometheus}  # Only for Enterprise
`;
```

### 3. Template Conditional
```yaml
# charts/customer-instance/templates/mosquitto-exporter.yaml
{{- if and .Values.mosquitto.enabled .Values.mosquitto.metrics.enabled }}
# ... deployment, service, servicemonitor
{{- end }}
```

## Deployment Outcomes

### Starter/Professional Plan
```bash
kubectl get pods -n customer-566129d9
# Expected: 5 pods
# - postgres
# - mosquitto
# - api
# - dashboard
# - opencost
# NO mosquitto-exporter
```

### Enterprise Plan
```bash
kubectl get pods -n customer-abc123
# Expected: 8 pods
# - postgres
# - mosquitto
# - mosquitto-exporter  ← Only for Enterprise
# - api
# - dashboard
# - opencost
# - prometheus
# - grafana
```

## Why This Makes Sense

### Without Dedicated Prometheus
```
┌──────────────────────┐
│  Mosquitto Broker    │
└──────────────────────┘
         │
         │ $SYS/# topics
         ▼
┌──────────────────────┐
│  MQTT Exporter       │ ← Tries to connect
└──────────────────────┘
         │
         │ :9234/metrics
         ▼
      ❌ NOWHERE
   (No Prometheus!)
```

**Result**: Exporter restarts with "identifier rejected" errors because it has no valid credentials and no Prometheus to send metrics to.

### With Dedicated Prometheus (Enterprise)
```
┌──────────────────────┐
│  Mosquitto Broker    │
└──────────────────────┘
         │
         │ $SYS/# topics
         ▼
┌──────────────────────┐
│  MQTT Exporter       │
└──────────────────────┘
         │
         │ :9234/metrics
         ▼
┌──────────────────────┐
│ Dedicated Prometheus │ ← Scrapes every 30s
└──────────────────────┘
         │
         ▼
┌──────────────────────┐
│     Grafana          │ ← Visualizes MQTT health
└──────────────────────┘
```

**Result**: Complete monitoring stack with MQTT broker health metrics.

## Migration for Existing Deployments

If you have Starter/Professional deployments with MQTT exporter running:

```bash
# Delete the exporter deployment
kubectl delete deployment -n customer-{id} {id}-customer-instance-mosquitto-exporter

# Delete the exporter service
kubectl delete service -n customer-{id} {id}-customer-instance-mosquitto-exporter

# Verify
kubectl get pods -n customer-{id}
# Should show 5 pods (not 6)
```

## Testing

### Create Starter Customer
```bash
cd billing/scripts
./complete-signup-workflow.ps1 -Plan starter

# Verify NO mosquitto-exporter
kubectl get pods -n customer-{id} | grep mosquitto-exporter
# Should return nothing
```

### Create Enterprise Customer
```bash
./complete-signup-workflow.ps1 -Plan enterprise

# Verify mosquitto-exporter EXISTS
kubectl get pods -n customer-{id} | grep mosquitto-exporter
# Should show: c{id}-customer-instance-mosquitto-exporter-xxx Running
```

## Benefits

✅ **Resource Savings**: Starter plans save ~100m CPU, ~128Mi RAM per customer
✅ **Cleaner Deployments**: No unnecessary pods in CrashLoopBackOff
✅ **Clear Tier Differentiation**: MQTT monitoring is an Enterprise feature
✅ **Logical Architecture**: Components deployed only when needed

## Related Documentation
- `docs/CUSTOMER-DEPLOYMENT-COMPLETE-STACK.md` - Full deployment architecture
- `charts/customer-instance/OPENCOST-INTEGRATION.md` - OpenCost conditional deployment
- `billing/docs/README.md` - Billing service deployment logic
