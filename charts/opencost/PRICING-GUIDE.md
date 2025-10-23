# OpenCost Pricing Configuration Guide

## How OpenCost Calculates Costs

OpenCost uses **real-time cloud provider pricing** to calculate accurate infrastructure costs. Here's how it works:

## Pricing Methods

### 1. Cloud Provider APIs (RECOMMENDED - Most Accurate)

OpenCost **automatically fetches real pricing** from cloud providers:

#### AWS
```yaml
opencost:
  cloudProvider:
    provider: "AWS"
    aws:
      spotDataBucket: "my-spot-data-bucket"  # Optional for spot pricing
      spotDataPrefix: "spot-data/"
```

**How it works:**
- Uses **AWS Pricing API** to get real-time EC2, EBS, ELB costs
- Auto-detects region from node metadata
- Pulls actual on-demand pricing per instance type
- Optionally reads Spot pricing from S3 data feed

**Required IAM Permissions:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "pricing:GetProducts",
        "pricing:DescribeServices"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-spot-data-bucket",
        "arn:aws:s3:::my-spot-data-bucket/*"
      ]
    }
  ]
}
```

**Example Pricing (AWS us-east-1):**
- c5.large: $0.085/hr → OpenCost calculates $0.0425/vCPU/hr
- EBS gp3: $0.08/GB/month → $0.00011/GB/hr
- Network egress: $0.09/GB (first 10TB)

---

#### GCP
```yaml
opencost:
  cloudProvider:
    provider: "GCP"
    gcp:
      billingDataDataset: "my-project.billing_export"
```

**How it works:**
- Reads **BigQuery Billing Export** for actual billed costs
- Includes sustained use discounts automatically
- Reflects committed use discounts
- Shows real costs including credits

**Setup BigQuery Billing Export:**
1. Go to GCP Console → Billing → Billing Export
2. Enable BigQuery export
3. Create dataset: `my-project.billing_export`
4. Grant OpenCost service account access:
   ```bash
   gcloud projects add-iam-policy-binding my-project \
     --member="serviceAccount:opencost@my-project.iam.gserviceaccount.com" \
     --role="roles/bigquery.dataViewer"
   ```

**Example Pricing (GCP us-central1):**
- n1-standard-2: $0.095/hr → $0.0475/vCPU/hr
- Persistent Disk: $0.04/GB/month → $0.000055/GB/hr
- Network egress: $0.12/GB (worldwide)

---

#### Azure
```yaml
opencost:
  cloudProvider:
    provider: "Azure"
    azure:
      subscriptionId: "12345678-1234-1234-1234-123456789012"
      resourceGroup: "my-k8s-cluster-rg"
```

**How it works:**
- Uses **Azure Rate Card API** for pricing
- Queries actual Azure pricing per region
- Includes reserved instance pricing if applicable

**Required Permissions:**
```bash
# Assign Reader role to OpenCost managed identity
az role assignment create \
  --assignee <opencost-managed-identity-id> \
  --role "Reader" \
  --scope "/subscriptions/<subscription-id>/resourceGroups/<rg-name>"

# Grant Rate Card API access
az role assignment create \
  --assignee <opencost-managed-identity-id> \
  --role "Billing Reader" \
  --scope "/subscriptions/<subscription-id>"
```

**Example Pricing (Azure eastus):**
- Standard_D2s_v3: $0.096/hr → $0.048/vCPU/hr
- Premium SSD: $0.135/GB/month → $0.000187/GB/hr
- Network egress: $0.087/GB

---

### 2. Default Pricing (Fallback)

If cloud provider is not configured, OpenCost uses **generic baseline pricing** based on AWS c5.large:

```yaml
opencost:
  cloudProvider:
    provider: ""  # Empty = use defaults
  pricing:
    cpu: "0.031611"      # $0.031611 per vCPU/hour
    memory: "0.004237"   # $0.004237 per GB RAM/hour
    storage: "0.00005"   # $0.00005 per GB storage/hour
    network: "0.01"      # $0.01 per GB egress
```

**When to use:**
- Development/testing clusters
- On-prem clusters (before setting up CSV pricing)
- Quick cost estimates without cloud API setup

**Accuracy:** ±30-50% depending on actual instance types used

---

### 3. Custom CSV Pricing (On-Prem/Air-Gapped)

For **on-premise Kubernetes** or custom hardware:

**Create pricing CSV:**
```csv
# custom-pricing.csv
node,cpu_hourly_cost,ram_gb_hourly_cost,storage_gb_hourly_cost
node-type-1,0.05,0.006,0.0001
node-type-2,0.10,0.012,0.0001
gpu-node,0.50,0.020,0.0002
```

**Mount CSV to OpenCost pod:**
```yaml
# In Helm values
opencost:
  exporter:
    extraVolumes:
    - name: pricing-config
      configMap:
        name: opencost-pricing
    extraVolumeMounts:
    - name: pricing-config
      mountPath: /var/pricing
    env:
      CUSTOM_COST_ENABLED: "true"
      CUSTOM_COST_PATH: "/var/pricing/custom-pricing.csv"
```

**When to use:**
- Bare-metal Kubernetes clusters
- Private datacenters with known TCO
- Strict air-gapped environments

---

## Cost Calculation Examples

### Example 1: Simple Pod (Starter Plan)

**Pod Resources:**
```yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
```

**Calculation (AWS pricing):**
```
CPU:     0.1 vCPU × $0.0425/vCPU/hr = $0.00425/hr
Memory:  0.125 GB × $0.004/GB/hr    = $0.0005/hr
─────────────────────────────────────────────────
Total:   $0.00475/hr
         $0.114/day
         $3.42/month
```

---

### Example 2: Enterprise Customer (Full Stack)

**Resources in namespace `customer-b4c867f4`:**
```yaml
API:        250m CPU, 256Mi memory
Postgres:   500m CPU, 512Mi memory  + 10Gi PVC
Mosquitto:  100m CPU, 64Mi memory
Prometheus: 500m CPU, 1Gi memory    + 50Gi PVC
Grafana:    100m CPU, 128Mi memory
Dashboard:  100m CPU, 128Mi memory
```

**Calculation (AWS c5.large baseline):**
```
CPU Total:     1.55 vCPU × $0.0425/vCPU/hr = $0.0659/hr
Memory Total:  2.0 GB × $0.004/GB/hr       = $0.008/hr
Storage Total: 60 GB × $0.00005/GB/hr      = $0.003/hr
Network:       ~5 GB/day × $0.01/GB        = $0.05/day = $0.002/hr
─────────────────────────────────────────────────────────
Total:   $0.079/hr
         $1.90/day
         $56.88/month
```

**With real AWS pricing (actual instance types):**
- If running on t3.medium nodes: **~$40/month**
- If running on c5.large nodes: **~$57/month**
- If running on m5.xlarge nodes: **~$85/month**

---

## Accuracy Comparison

| Method | Accuracy | Setup Effort | Use Case |
|--------|----------|--------------|----------|
| **AWS Pricing API** | 95-99% | Low (just IAM) | Production AWS |
| **GCP BigQuery** | 99% (actual bills) | Medium (enable export) | Production GCP |
| **Azure Rate Card** | 95-99% | Medium (RBAC setup) | Production Azure |
| **Default Pricing** | 50-70% | Zero | Dev/testing |
| **Custom CSV** | 80-90% | High (calculate TCO) | On-prem |

---

## Recommended Configuration for Iotistic Platform

### Docker Desktop (Local Dev)
```yaml
# Use defaults - good enough for testing
opencost:
  cloudProvider:
    provider: ""
  pricing:
    cpu: "0.031611"
    memory: "0.004237"
    storage: "0.00005"
```

### AWS EKS (Production)
```yaml
opencost:
  cloudProvider:
    provider: "AWS"
    # No other config needed - uses Pricing API automatically
```

### GCP GKE (Production)
```yaml
opencost:
  cloudProvider:
    provider: "GCP"
    gcp:
      billingDataDataset: "iotistic-prod.billing_export"
```

### Azure AKS (Production)
```yaml
opencost:
  cloudProvider:
    provider: "Azure"
    azure:
      subscriptionId: "your-subscription-id"
      resourceGroup: "iotistic-k8s-prod"
```

---

## Verifying Pricing is Working

### Check OpenCost Logs
```powershell
kubectl logs -n monitoring deployment/opencost | Select-String "pricing"
```

**Good output:**
```
Successfully connected to AWS Pricing API
Loaded pricing data for region us-east-1
Found 1,245 instance types with pricing
```

**Bad output:**
```
Failed to connect to pricing API, using default pricing
WARNING: Using fallback pricing estimates
```

### Query Sample Costs
```powershell
# Port-forward Prometheus
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090

# Query namespace cost in browser (http://localhost:9090)
sum(node_namespace_total_cost{namespace="customer-b4c867f4"})
```

**If cost is $0.00:** Check that pods have resource requests set

**If cost seems wrong:** Verify cloud provider configuration

### Test Cloud API Access

**AWS:**
```bash
# From OpenCost pod
kubectl exec -it -n monitoring deployment/opencost -- \
  curl "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/index.json" | head -20
```

**GCP:**
```bash
# Check BigQuery access
kubectl exec -it -n monitoring deployment/opencost -- \
  gcloud auth list
```

---

## Pricing Updates

OpenCost automatically updates pricing:

- **AWS/Azure:** Queries API every 24 hours
- **GCP:** Syncs with BigQuery hourly
- **Default:** Static (update Helm chart to change)
- **CSV:** Reads on pod start (restart to update)

To force pricing refresh:
```powershell
kubectl rollout restart -n monitoring deployment/opencost
```

---

## Cost Optimization Tips

Once you have accurate pricing, use it to optimize:

1. **Right-size resources:**
   ```promql
   # Find pods using less than 50% of requested CPU
   avg_over_time(container_cpu_usage_seconds_total[1h]) < 
     (kube_pod_container_resource_requests{resource="cpu"} * 0.5)
   ```

2. **Identify expensive pods:**
   ```promql
   topk(10, sum by (pod) (
     pod_cpu_allocation_cost{namespace="customer-b4c867f4"} + 
     pod_memory_allocation_cost{namespace="customer-b4c867f4"}
   ))
   ```

3. **Track cost trends:**
   ```promql
   sum_over_time(node_namespace_total_cost{namespace="customer-b4c867f4"}[30d:1h])
   ```

---

## References

- [AWS Pricing API Docs](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/price-changes.html)
- [GCP BigQuery Billing Export](https://cloud.google.com/billing/docs/how-to/export-data-bigquery)
- [Azure Rate Card API](https://learn.microsoft.com/en-us/previous-versions/azure/reference/mt219004(v=azure.100))
- [OpenCost GitHub](https://github.com/opencost/opencost)
