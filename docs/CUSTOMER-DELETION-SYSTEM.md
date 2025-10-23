# Customer Deletion System

Complete solution for deleting customer accounts and automatically cleaning up Kubernetes resources.

## Overview

When a customer account is deleted (cancellation, termination, etc.), the system:
1. Queues an asynchronous deletion job
2. Removes Kubernetes namespace (cascades to all pods, services, PVCs, etc.)
3. Cleans up cluster-scoped resources (ClusterRole, ClusterRoleBinding from OpenCost)
4. Updates customer record to "pending" state (ready for re-deployment if needed)

## Architecture

```
DELETE /api/customers/{id}
         |
         v
  [Deployment Queue]
         |
         v
  [Deletion Worker]
         |
         +---> Uninstall Helm Release
         |
         +---> Delete K8s Namespace
         |         |
         |         +---> Pods
         |         +---> Services
         |         +---> ConfigMaps
         |         +---> Secrets
         |         +---> PVCs
         |         +---> ResourceQuota
         |
         +---> Delete ClusterRole/ClusterRoleBinding
         |
         +---> Update Customer Record (deployment_status = "pending")
```

## API Endpoints

### DELETE /api/customers/:id
Delete customer account and queue Kubernetes cleanup.

**Parameters:**
- `id` - Customer ID (Stripe customer ID format: `cust_abc123...`, NOT the database integer ID)

**Request:**
```bash
curl -X DELETE http://localhost:3100/api/customers/cust_56b0430bef364628b3e065d2d124b02a
```

**Response:**
```json
{
  "message": "Customer deletion queued successfully",
  "customerId": "cust_56b0430bef364628b3e065d2d124b02a",
  "jobId": "12345",
  "status": "pending",
  "note": "Kubernetes namespace will be deleted asynchronously. Check job status for progress."
}
```

**Status Codes:**
- `200` - Deletion queued successfully
- `404` - Customer not found
- `400` - Customer already being deleted
- `500` - Server error

### DELETE /api/customers/:id/deployment
Direct (synchronous) deletion of Kubernetes deployment only.

Use the queued endpoint (`DELETE /api/customers/:id`) instead for production - it provides better error handling and async processing.

## Implementation Details

### K8sDeploymentService.deleteCustomerInstance()

**Location:** `billing/src/services/k8s-deployment-service.ts`

**Deletion Steps:**

1. **Simulation Mode Check**
   ```typescript
   if (process.env.SIMULATE_K8S_DEPLOYMENT === 'true') {
     // Skip actual K8s deletion, just update database
   }
   ```

2. **Uninstall Helm Release**
   ```bash
   helm uninstall customer-{namespace} --namespace customer-{namespace}
   ```
   - Gracefully handles "not found" errors
   - Non-blocking (continues even if Helm release doesn't exist)

3. **Delete Kubernetes Namespace**
   ```bash
   kubectl delete namespace customer-{namespace} --timeout=5m
   ```
   - Cascades to ALL resources in namespace:
     * Pods
     * Services (ClusterIP, LoadBalancer)
     * Deployments, ReplicaSets
     * ConfigMaps, Secrets
     * PersistentVolumeClaims
     * ResourceQuotas
     * NetworkPolicies
   - 5-minute timeout for graceful termination

4. **Clean Up Cluster-Scoped Resources**
   ```bash
   # OpenCost creates ClusterRole/ClusterRoleBinding
   kubectl get clusterrolebinding -o name | grep "c{shortId}-customer-instance"
   kubectl delete clusterrolebinding/...
   
   kubectl get clusterrole -o name | grep "c{shortId}-customer-instance"
   kubectl delete clusterrole/...
   ```
   - Required because namespace deletion doesn't remove cluster-scoped resources
   - Non-blocking (warns if cleanup fails)

5. **Update Customer Record**
   ```typescript
   await CustomerModel.updateDeploymentStatus(customerId, 'pending', {
     instanceNamespace: '',
     instanceUrl: ''
   });
   ```
   - Sets status to "pending" (can be re-deployed)
   - Clears namespace and URL fields

### Deployment Queue Integration

**Location:** `billing/src/services/deployment-queue.ts`

The deletion uses the existing deployment queue infrastructure:

```typescript
// Add deletion job
await deploymentQueue.addDeleteJob({
  customerId: 'cust_abc123',
  namespace: 'customer-abc123'
});
```

**Job Processing:**
- Retries: 3 attempts (configurable via `QUEUE_MAX_RETRIES`)
- Backoff: Exponential (60s, 120s, 240s)
- Timeout: 10 minutes per attempt
- Cleanup: Job removed after 7 days (success or failure)

**Monitoring:**
```bash
# Get job status
GET /api/admin/jobs/{jobId}

# Response
{
  "id": "12345",
  "state": "completed",  # active, waiting, completed, failed
  "progress": 100,
  "data": {
    "customerId": "cust_abc123",
    "namespace": "customer-abc123"
  }
}
```

## Testing

### Test Script

**Location:** `billing/scripts/test-customer-deletion.ps1`

**Usage:**

```powershell
# Create new trial customer then delete
.\test-customer-deletion.ps1

# Delete existing customer
.\test-customer-deletion.ps1 -CustomerId "cust_abc123"

# Delete most recent customer
.\test-customer-deletion.ps1 -SkipCreate
```

**Test Flow:**
1. Creates trial customer (or uses existing)
2. Waits for deployment to complete
3. Deletes customer via API
4. Monitors deletion job queue
5. Verifies namespace deleted from Kubernetes
6. Verifies ClusterRole/ClusterRoleBinding cleanup
7. Checks customer database status

### Manual Testing

```bash
# 1. Create customer
curl -X POST http://localhost:3100/api/customers/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!",
    "company_name": "Test Corp"
  }'

# 2. Wait for deployment
kubectl get pods -n customer-{id}

# 3. Delete customer
curl -X DELETE http://localhost:3100/api/customers/cust_{id}

# 4. Verify namespace deletion
kubectl get namespace customer-{id}
# Should show: Error from server (NotFound)

# 5. Verify cluster resources cleaned up
kubectl get clusterrole | grep customer-{shortId}
kubectl get clusterrolebinding | grep customer-{shortId}
# Should return nothing
```

## Environment Variables

### Development (Docker Desktop)

```bash
# Simulate K8s operations (don't actually delete)
SIMULATE_K8S_DEPLOYMENT=true

# Queue configuration
QUEUE_MAX_RETRIES=3
QUEUE_RETRY_DELAY=60000  # 1 minute
```

### Production (Cloud Cluster)

```bash
# Real K8s deletion
SIMULATE_K8S_DEPLOYMENT=false

# Helm chart path
HELM_CHART_PATH=/app/charts/customer-instance

# Queue with Redis
REDIS_HOST=redis-master
REDIS_PORT=6379
REDIS_PASSWORD=<secret>

# Job configuration
QUEUE_MAX_RETRIES=5
QUEUE_RETRY_DELAY=120000  # 2 minutes
```

## Error Handling

### Common Errors

1. **Namespace Not Found**
   ```
   Error: namespaces "customer-abc123" not found
   ```
   - **Cause**: Already deleted or never existed
   - **Handling**: Warning logged, continues with database update
   - **Safe**: Yes

2. **Helm Release Not Found**
   ```
   Error: release: not found
   ```
   - **Cause**: Manually deleted or never installed
   - **Handling**: Warning logged, continues with namespace deletion
   - **Safe**: Yes

3. **Timeout During Deletion**
   ```
   Error: context deadline exceeded
   ```
   - **Cause**: Namespace has finalizers or stuck resources
   - **Handling**: Job fails, will retry
   - **Resolution**: Check `kubectl get namespace customer-{id} -o yaml` for finalizers

4. **ClusterRole Still Exists**
   ```
   Warning: Failed to delete ClusterRole
   ```
   - **Cause**: Permission issue or resource locked
   - **Handling**: Warning logged (non-critical)
   - **Resolution**: Manually delete with `kubectl delete clusterrole <name>`

### Retry Logic

Jobs automatically retry on failure:

```
Attempt 1: Immediate
  └─ Fails
Attempt 2: 60s delay
  └─ Fails
Attempt 3: 120s delay
  └─ Fails → Job marked as "failed"
```

Failed jobs remain in queue for 7 days for troubleshooting.

## Monitoring & Observability

### Logs

**Deletion Started:**
```
INFO: Starting customer instance deletion
  customerId: cust_abc123
  namespace: customer-abc123
```

**Helm Uninstall:**
```
INFO: Uninstalling Helm release
  releaseName: customer-abc123
  namespace: customer-abc123
✅ Helm release uninstalled
```

**Namespace Deletion:**
```
INFO: Deleting Kubernetes namespace
  namespace: customer-abc123
✅ Namespace deleted successfully
```

**Cluster Resource Cleanup:**
```
INFO: Cleaning up cluster-scoped resources
  prefix: cabc123-customer-instance
INFO: Deleted ClusterRoleBinding
  binding: clusterrolebinding.rbac.authorization.k8s.io/cabc123-customer-instance-opencost
INFO: Deleted ClusterRole
  role: clusterrole.rbac.authorization.k8s.io/cabc123-customer-instance-opencost
```

**Completion:**
```
✅ Customer instance deleted successfully
  customerId: cust_abc123
  namespace: customer-abc123
```

### Metrics (Future)

Add Prometheus metrics for monitoring:

```typescript
// billing-exporter/src/collectors/deletion-metrics-collector.ts
customer_deletions_total{status="success|failed"}
customer_deletion_duration_seconds
customer_namespace_deletion_duration_seconds
```

## Security Considerations

### Authorization

**Current:** No authentication on DELETE endpoint

**TODO for Production:**
```typescript
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  // Only admins or account owners can delete
});
```

### Soft Delete vs Hard Delete

**Current Implementation:** Hard delete (namespace immediately removed)

**Future Enhancement:** Soft delete with retention period

```typescript
// Add deletion_scheduled_at, deleted_at fields
{
  deletion_scheduled_at: "2025-10-30T00:00:00Z",  // 7 days from now
  deleted_at: null,
  deployment_status: "deleting"
}

// Background job: Delete after retention period
if (Date.now() > deletion_scheduled_at) {
  await k8sDeploymentService.deleteCustomerInstance(customerId);
}
```

### Data Backup

**Before Deletion:**
1. Backup PostgreSQL database (PVC)
2. Backup customer configuration (ConfigMaps)
3. Store backup in S3/GCS with customer ID tag
4. Set retention policy (e.g., 90 days)

## Production Checklist

Before deploying to production:

- [ ] Add authentication/authorization to DELETE endpoint
- [ ] Implement soft delete with retention period
- [ ] Add data backup before deletion
- [ ] Set up deletion monitoring/alerts
- [ ] Test with large namespaces (many resources)
- [ ] Verify PVC deletion (data loss!)
- [ ] Test ClusterRole cleanup across all plans
- [ ] Document customer communication process
- [ ] Add deletion confirmation UI
- [ ] Implement deletion audit log

## Next Steps

1. **Admin Dashboard Integration**
   - Add "Delete Customer" button to admin panel
   - Show deletion confirmation modal
   - Display deletion job status

2. **Customer Portal**
   - Allow customers to self-delete accounts
   - Show deletion warning (data loss)
   - Export data before deletion

3. **Billing Integration**
   - Cancel Stripe subscription on deletion
   - Process final invoice
   - Issue refund if applicable

4. **Data Retention**
   - Implement soft delete with 30-day retention
   - Export customer data to S3 before deletion
   - Comply with GDPR "right to be forgotten"

## Related Documentation

- `billing/docs/README.md` - Complete billing system guide
- `docs/K8S-DEPLOYMENT-GUIDE.md` - Kubernetes deployment architecture
- `docs/DEPLOYMENT-QUEUE-GUIDE.md` - Queue system documentation
- `billing/src/services/deployment-queue.ts` - Queue implementation
- `billing/src/services/k8s-deployment-service.ts` - K8s operations

## Support

For issues or questions:
1. Check logs: `kubectl logs -n billing deployment/billing-api`
2. Check job status: `GET /api/admin/jobs/{jobId}`
3. Verify namespace: `kubectl get namespace customer-{id}`
4. Manual cleanup: See "Manual Testing" section above
