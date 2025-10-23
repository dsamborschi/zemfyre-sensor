# Quick Start - Customer Signup & K8s Deployment

Fast setup guide for local development and testing.

## Prerequisites

```bash
# Required
- Docker Desktop with Kubernetes enabled
- Node.js 18+
- PostgreSQL 14+
- kubectl
- Helm 3.8+

# Optional (for testing)
- PowerShell (Windows) or Bash (Linux/Mac)
- curl or Postman
```

## 1. Local Setup (5 minutes)

### Start Billing Service

```bash
# 1. Install dependencies
cd billing
npm install

# 2. Create database
createdb billing_dev

# 3. Run migrations
npm run migrate:latest

# 4. Generate RSA keys for JWT
mkdir -p keys
ssh-keygen -t rsa -b 4096 -m PEM -f keys/private.key -N ""
openssl rsa -in keys/private.key -pubout -outform PEM -out keys/public.key

# 5. Create .env
cat > .env << 'EOF'
DATABASE_URL=postgresql://localhost:5432/billing_dev
JWT_PRIVATE_KEY_PATH=./keys/private.key
JWT_PUBLIC_KEY_PATH=./keys/public.key
STRIPE_SECRET_KEY=sk_test_...
BASE_DOMAIN=localhost
HELM_CHART_PATH=../charts/customer-instance
PORT=3000
NODE_ENV=development
EOF

# 6. Start server
npm run dev
```

### Test Signup

```bash
# Create customer
curl -X POST http://localhost:3000/api/customers/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123",
    "company_name": "Test Company"
  }'

# Response includes:
# - customer_id
# - license (JWT)
# - instance_url (will be deployed)
```

### Verify in Database

```bash
psql billing_dev -c "SELECT customer_id, email, deployment_status FROM customers;"
```

## 2. Kubernetes Setup (10 minutes)

### Enable Kubernetes (Docker Desktop)

```bash
# Docker Desktop → Settings → Kubernetes → Enable
# Wait for cluster to start

# Verify
kubectl cluster-info
kubectl get nodes
```

### Install Nginx Ingress

```bash
# Install
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=NodePort \
  --set controller.service.nodePorts.http=30080

# Verify
kubectl get pods -n ingress-nginx
```

### Install cert-manager (Optional - for TLS)

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.13.0 \
  --set installCRDs=true

# Verify
kubectl get pods -n cert-manager
```

### Install ServiceMonitor CRD (Required for Monitoring)

**CRITICAL**: This CRD must be installed before deploying any customer instances, or deployments will fail.

```bash
# Install ServiceMonitor CRD for Prometheus monitoring
kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/main/example/prometheus-operator-crd/monitoring.coreos.com_servicemonitors.yaml

# Verify installation
kubectl get crd servicemonitors.monitoring.coreos.com
```

**Why**: Customer instances create `ServiceMonitor` resources for metrics collection. Without this CRD, Helm deployments fail with:
```
Error: no matches for kind "ServiceMonitor" in version "monitoring.coreos.com/v1"
```

**Note**: For production, install the full Prometheus Operator stack (see `K8S-DEPLOYMENT-GUIDE.md`). For local dev, just the CRD is sufficient to prevent deployment errors.

### Configure /etc/hosts

```bash
# Add to /etc/hosts (Linux/Mac) or C:\Windows\System32\drivers\etc\hosts (Windows)
127.0.0.1 test123.localhost
127.0.0.1 billing.localhost
```

## 3. Deploy Test Customer (2 minutes)

### Manual Helm Install

```bash
# Generate test license (use customer_id from signup)
# For quick test, use a dummy JWT:
export TEST_LICENSE="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJjdXN0b21lcl9pZCI6InRlc3QxMjMifQ.test"

# Deploy
helm install customer-test123 ./charts/customer-instance \
  --set customer.id=test123 \
  --set customer.email=test@example.com \
  --set customer.companyName="Test Corp" \
  --set license.key="$TEST_LICENSE" \
  --set domain.base=localhost \
  --set ingress.enabled=false \
  --namespace customer-test123 \
  --create-namespace

# Watch deployment
kubectl get pods -n customer-test123 --watch
```

### Or Via API (Automated)

```bash
# Trigger deployment for customer created in step 1
CUSTOMER_ID="<customer_id from signup response>"

curl -X POST http://localhost:3000/api/customers/$CUSTOMER_ID/deploy

# Check status
curl http://localhost:3000/api/customers/$CUSTOMER_ID/deployment/status
```

### Access Services

```bash
# Port-forward dashboard
kubectl port-forward -n customer-test123 svc/customer-test123-dashboard 8080:80
# Open: http://localhost:8080

# Port-forward API
kubectl port-forward -n customer-test123 svc/customer-test123-api 8081:3001
# Test: curl http://localhost:8081/health

# Port-forward MQTT
kubectl port-forward -n customer-test123 svc/customer-test123-mosquitto 1883:1883
# Test: mosquitto_pub -h localhost -t test -m "hello"
```

## 4. Test Complete Flow (1 minute)

### Run Automated Tests

```powershell
# Windows PowerShell
cd billing
.\scripts\test-signup-flow.ps1
```

```bash
# Linux/Mac Bash (TODO: create bash version)
cd billing
npm test
```

### Manual Testing

```bash
# 1. Signup
curl -X POST http://localhost:3000/api/customers/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "manual-test@example.com",
    "password": "ManualTest123",
    "company_name": "Manual Test Corp"
  }' | jq .

# Save customer_id from response

# 2. Login
curl -X POST http://localhost:3000/api/customers/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "manual-test@example.com",
    "password": "ManualTest123"
  }' | jq .

# 3. Get customer details
curl http://localhost:3000/api/customers/<customer_id> | jq .

# 4. Check deployment status
curl http://localhost:3000/api/customers/<customer_id>/deployment/status | jq .

# 5. Trigger deployment
curl -X POST http://localhost:3000/api/customers/<customer_id>/deploy | jq .
```

## 5. Cleanup

```bash
# Delete customer instance
CUSTOMER_ID="test123"
curl -X DELETE http://localhost:3000/api/customers/$CUSTOMER_ID/deployment

# Or via Helm
helm uninstall customer-test123 --namespace customer-test123
kubectl delete namespace customer-test123

# Stop billing service
# Ctrl+C in terminal

# Cleanup database
psql billing_dev -c "TRUNCATE customers, subscriptions, license_history CASCADE;"
```

## Common Issues

### Issue: Billing service can't connect to database

```bash
# Check PostgreSQL is running
psql -l

# Create database if missing
createdb billing_dev

# Check DATABASE_URL in .env
cat .env | grep DATABASE_URL
```

### Issue: Helm install fails

```bash
# Check cluster is running
kubectl get nodes

# Check if namespace exists
kubectl get namespace customer-test123

# Delete and retry
helm uninstall customer-test123 --namespace customer-test123
kubectl delete namespace customer-test123
# Wait 30 seconds, then retry helm install
```

### Issue: Pods not starting

```bash
# Check pod status
kubectl get pods -n customer-test123

# Describe failing pod
kubectl describe pod <pod-name> -n customer-test123

# Check events
kubectl get events -n customer-test123 --sort-by='.lastTimestamp'

# Common fixes:
# 1. Image pull issues: Check docker images exist
# 2. Resource constraints: Increase Docker Desktop memory (8GB+)
# 3. Volume mount issues: Check storage class exists
kubectl get storageclass
```

### Issue: License validation fails

```bash
# Check API logs
kubectl logs -n customer-test123 deployment/customer-test123-api

# Verify license in secret
kubectl get secret customer-test123-secrets -n customer-test123 \
  -o jsonpath='{.data.IOTISTIC_LICENSE_KEY}' | base64 -d

# Regenerate license via login
curl -X POST http://localhost:3000/api/customers/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123"}' | jq -r .license
```

## Development Workflow

### 1. Make Changes to Billing Service

```bash
cd billing
# Edit files in src/
npm run dev  # Auto-reloads on changes
```

### 2. Test Changes

```bash
# Run tests
npm test

# Or manual API testing
curl http://localhost:3000/api/customers
```

### 3. Update Helm Chart

```bash
cd charts/customer-instance
# Edit templates/

# Lint chart
helm lint .

# Test rendering
helm template test . \
  --set customer.id=test \
  --set license.key=test
```

### 4. Deploy Updated Chart

```bash
# Upgrade existing deployment
helm upgrade customer-test123 ./charts/customer-instance \
  --reuse-values \
  --namespace customer-test123
```

### 5. View Logs

```bash
# Billing service (terminal where npm run dev)
# Check console output

# Customer instance API
kubectl logs -f -n customer-test123 deployment/customer-test123-api

# All pods in namespace
kubectl logs -f -n customer-test123 --all-containers=true
```

## Next Steps

Once local setup is working:

1. **Read Full Guides:**
   - `docs/K8S-DEPLOYMENT-GUIDE.md` - Production deployment
   - `charts/customer-instance/README.md` - Helm chart details
   - `docs/SIGNUP-K8S-IMPLEMENTATION.md` - Implementation summary

2. **Deploy to Cloud:**
   - Set up EKS/GKE/AKS cluster
   - Configure DNS (wildcard subdomain)
   - Deploy billing service
   - Test customer signup flow

3. **Implement Enhancements:**
   - Deployment queue (Bull + Redis)
   - Email notifications (SendGrid)
   - Usage monitoring (Prometheus)
   - Automated backups (S3)

4. **Production Checklist:**
   - Enable TLS (cert-manager)
   - Configure resource limits
   - Set up monitoring/alerting
   - Implement backup strategy
   - Security audit

## Useful Commands

```bash
# Billing Service
npm run dev                    # Start dev server
npm run build                  # Build for production
npm run migrate:latest         # Run migrations
npm test                       # Run tests

# Kubernetes
kubectl get pods -A            # All pods in all namespaces
kubectl get pods -n <ns>       # Pods in namespace
kubectl logs <pod>             # View logs
kubectl describe pod <pod>     # Detailed pod info
kubectl exec -it <pod> -- bash # Shell into pod
kubectl port-forward <pod> <local>:<remote>  # Port forwarding

# Helm
helm list -A                   # List all releases
helm status <release> -n <ns>  # Release status
helm get values <release> -n <ns>  # Current values
helm upgrade <release> <chart> # Upgrade release
helm uninstall <release> -n <ns>  # Delete release

# Database
psql billing_dev               # Connect to database
\dt                            # List tables
\d customers                   # Describe table
SELECT * FROM customers;       # Query
```

## Quick Reference

**API Endpoints:**
```
POST   /api/customers/signup              - Create account
POST   /api/customers/login               - Authenticate
GET    /api/customers/:id                 - Get customer
POST   /api/customers/:id/deploy          - Deploy instance
GET    /api/customers/:id/deployment/status  - Check status
DELETE /api/customers/:id/deployment      - Delete instance
```

**Test Credentials:**
```
Email: test@example.com
Password: TestPass123
```

**Ports:**
```
3000  - Billing API
8080  - Customer dashboard (port-forward)
8081  - Customer API (port-forward)
1883  - MQTT (port-forward)
```

**Namespaces:**
```
billing            - Billing service
customer-<id>      - Customer instances
ingress-nginx      - Ingress controller
cert-manager       - Certificate management
```

## Support

- **Documentation**: `/docs`
- **Helm Chart**: `/charts/customer-instance/README.md`
- **Tests**: `/billing/scripts/test-*.ps1`
- **GitHub Issues**: Create issue for bugs/questions

---

**Ready to build?** Start with step 1 and work through sequentially. Each step takes 1-10 minutes. Total setup time: ~20 minutes.
