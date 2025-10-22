# Kubernetes Deployment Guide

Complete guide for deploying the Zemfyre IoT platform with customer isolation on Kubernetes.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Cluster Setup](#cluster-setup)
5. [Billing Service Deployment](#billing-service-deployment)
6. [Customer Instance Deployment](#customer-instance-deployment)
7. [Testing](#testing)
8. [Monitoring](#monitoring)
9. [Troubleshooting](#troubleshooting)

## Overview

The Zemfyre platform uses a **multi-tenant architecture** with **namespace-level isolation**:

- **Billing Service**: Single shared instance managing customers, subscriptions, licenses
- **Customer Instances**: Isolated per customer, each in their own namespace

### Key Features

- ✅ **Automatic Deployment**: Customers self-signup → trial created → K8s stack deployed
- ✅ **License Validation**: JWT-based licenses verified on API startup
- ✅ **Resource Isolation**: Namespace quotas prevent resource hogging
- ✅ **Network Isolation**: Network policies restrict inter-pod traffic
- ✅ **TLS Termination**: Automatic HTTPS via cert-manager + Let's Encrypt
- ✅ **Usage Tracking**: Billing exporter collects metrics per customer

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Kubernetes Cluster                       │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Ingress Controller (nginx)                                  │ │
│  │ ├─ billing.iotistic.cloud → billing-service               │ │
│  │ ├─ customer1.iotistic.cloud → customer-customer1           │ │
│  │ └─ customer2.iotistic.cloud → customer-customer2           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Namespace: billing                                          │ │
│  │ ├─ Billing API (Node.js + PostgreSQL)                      │ │
│  │ ├─ Stripe Integration                                       │ │
│  │ └─ K8s Deployment Service (Helm orchestration)             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Namespace: customer-customer1                               │ │
│  │ ├─ PostgreSQL (sensor data)                                │ │
│  │ ├─ Mosquitto (MQTT broker)                                 │ │
│  │ ├─ API (with license validation)                           │ │
│  │ ├─ Dashboard (admin panel)                                 │ │
│  │ └─ Billing Exporter (usage metrics)                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Namespace: customer-customer2                               │ │
│  │ ├─ PostgreSQL (sensor data)                                │ │
│  │ ├─ Mosquitto (MQTT broker)                                 │ │
│  │ ├─ API (with license validation)                           │ │
│  │ ├─ Dashboard (admin panel)                                 │ │
│  │ └─ Billing Exporter (usage metrics)                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Tools

```bash
# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Verify installations
kubectl version --client
helm version
```

### Kubernetes Cluster

Options:

1. **Production**: AWS EKS, GKE, AKS, or self-managed
2. **Development**: minikube, kind, k3s, Docker Desktop

Minimum requirements:
- Kubernetes 1.23+
- 8GB RAM available
- 50GB storage
- LoadBalancer support (for ingress)

### Domain Setup

Configure DNS for wildcard subdomain:

```
*.iotistic.cloud → <INGRESS_EXTERNAL_IP>
billing.iotistic.cloud → <INGRESS_EXTERNAL_IP>
```

## Cluster Setup

### 1. Install Nginx Ingress Controller

```bash
# Add Helm repo
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# Install
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=LoadBalancer

# Wait for external IP
kubectl get service -n ingress-nginx ingress-nginx-controller --watch

# Get external IP
INGRESS_IP=$(kubectl get service -n ingress-nginx ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Ingress IP: $INGRESS_IP"
```

### 2. Install cert-manager (TLS Certificates)

```bash
# Add Helm repo
helm repo add jetstack https://charts.jetstack.io
helm repo update

# Install cert-manager
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.13.0 \
  --set installCRDs=true

# Verify installation
kubectl get pods -n cert-manager
```

### 3. Create ClusterIssuer (Let's Encrypt)

```yaml
# letsencrypt-prod.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@iotistic.cloud  # Change this
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
```

Apply:

```bash
kubectl apply -f letsencrypt-prod.yaml

# Verify
kubectl get clusterissuer
```

### 4. Configure Storage Class

Check available storage classes:

```bash
kubectl get storageclass
```

If using cloud provider, default storage class should work. For local development:

```yaml
# local-storage-class.yaml (for development only)
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: local-storage
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
```

## Billing Service Deployment

### 1. Build Docker Image

```bash
cd billing

# Build image
docker build -t iotistic/billing-api:latest .

# Push to registry
docker push iotistic/billing-api:latest
```

### 2. Create Namespace

```bash
kubectl create namespace billing
```

### 3. Create Secrets

```bash
# Database URL
kubectl create secret generic billing-secrets \
  --from-literal=DATABASE_URL="postgresql://user:password@postgres:5432/billing" \
  --from-literal=JWT_PRIVATE_KEY="$(cat /path/to/private.key)" \
  --from-literal=JWT_PUBLIC_KEY="$(cat /path/to/public.key)" \
  --from-literal=STRIPE_SECRET_KEY="sk_live_..." \
  --namespace billing

# Helm chart path (for K8s deployment service)
kubectl create configmap billing-config \
  --from-literal=HELM_CHART_PATH="/app/charts/customer-instance" \
  --from-literal=BASE_DOMAIN="iotistic.cloud" \
  --namespace billing
```

### 4. Deploy Billing Service

```yaml
# billing-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: billing-api
  namespace: billing
spec:
  replicas: 2
  selector:
    matchLabels:
      app: billing-api
  template:
    metadata:
      labels:
        app: billing-api
    spec:
      serviceAccountName: billing-deployer  # Created below
      containers:
      - name: api
        image: iotistic/billing-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        - name: PORT
          value: "3000"
        envFrom:
        - secretRef:
            name: billing-secrets
        - configMapRef:
            name: billing-config
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 1Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: billing-api
  namespace: billing
spec:
  selector:
    app: billing-api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: billing-ingress
  namespace: billing
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - billing.iotistic.cloud
    secretName: billing-tls
  rules:
  - host: billing.iotistic.cloud
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: billing-api
            port:
              number: 80
```

Apply:

```bash
kubectl apply -f billing-deployment.yaml
```

### 5. Create ServiceAccount for K8s Deployment

The billing service needs permissions to deploy customer instances:

```yaml
# billing-rbac.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: billing-deployer
  namespace: billing
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: billing-deployer
rules:
# Namespace management
- apiGroups: [""]
  resources: ["namespaces"]
  verbs: ["get", "list", "create", "delete"]
# Helm release management (via kubectl)
- apiGroups: ["apps"]
  resources: ["deployments", "statefulsets"]
  verbs: ["get", "list", "create", "update", "delete"]
- apiGroups: [""]
  resources: ["services", "configmaps", "secrets", "persistentvolumeclaims"]
  verbs: ["get", "list", "create", "update", "delete"]
- apiGroups: ["networking.k8s.io"]
  resources: ["ingresses", "networkpolicies"]
  verbs: ["get", "list", "create", "update", "delete"]
- apiGroups: [""]
  resources: ["resourcequotas"]
  verbs: ["get", "list", "create", "update", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: billing-deployer
subjects:
- kind: ServiceAccount
  name: billing-deployer
  namespace: billing
roleRef:
  kind: ClusterRole
  name: billing-deployer
  apiGroup: rbac.authorization.k8s.io
```

Apply:

```bash
kubectl apply -f billing-rbac.yaml
```

### 6. Install Helm in Billing Pod

The K8s deployment service uses Helm CLI. Install it in the billing container:

**Option A**: Add to Dockerfile:

```dockerfile
# In billing/Dockerfile
RUN curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

**Option B**: Init container:

```yaml
# Add to billing-deployment.yaml
initContainers:
- name: install-helm
  image: alpine/helm:latest
  command: ['sh', '-c', 'cp /usr/bin/helm /shared/helm']
  volumeMounts:
  - name: shared
    mountPath: /shared
# In main container
volumeMounts:
- name: shared
  mountPath: /usr/local/bin
# Add volume
volumes:
- name: shared
  emptyDir: {}
```

### 7. Copy Helm Chart to Billing Service

Mount the Helm chart as a ConfigMap or persistent volume:

```bash
# Create ConfigMap from chart files
kubectl create configmap customer-instance-chart \
  --from-file=./charts/customer-instance \
  --namespace billing

# Mount in deployment
# Add to billing-deployment.yaml containers.volumeMounts:
volumeMounts:
- name: helm-chart
  mountPath: /app/charts/customer-instance
  
# Add to volumes:
volumes:
- name: helm-chart
  configMap:
    name: customer-instance-chart
```

### 8. Verify Billing Service

```bash
# Check pods
kubectl get pods -n billing

# Check logs
kubectl logs -n billing deployment/billing-api

# Test API
curl https://billing.iotistic.cloud/health
```

## Customer Instance Deployment

### Automated Deployment (via Signup)

When a customer signs up, the system automatically:

1. Creates customer record
2. Creates 14-day trial subscription
3. Generates license JWT
4. Triggers Helm deployment

```bash
# Customer signup
curl -X POST https://billing.iotistic.cloud/api/customers/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123",
    "company_name": "Acme Corp"
  }'

# Response includes customer_id
{
  "success": true,
  "customer_id": "abc123",
  "email": "john@example.com",
  "license": "eyJhbGc...",
  "subscription": {
    "plan": "starter",
    "status": "trialing",
    "trial_end": "2024-02-01T00:00:00Z"
  },
  "instance_url": "https://abc123.iotistic.cloud",
  "deployment_status": "deploying"
}
```

### Manual Deployment

```bash
# Trigger deployment for existing customer
curl -X POST https://billing.iotistic.cloud/api/customers/abc123/deploy

# Check deployment status
curl https://billing.iotistic.cloud/api/customers/abc123/deployment/status
```

### Direct Helm Deployment (for testing)

```bash
helm install customer-test ./charts/customer-instance \
  --set customer.id=test123 \
  --set customer.email=test@example.com \
  --set customer.companyName="Test Corp" \
  --set license.key="eyJhbGc..." \
  --namespace customer-test123 \
  --create-namespace
```

## Testing

### 1. Test Customer Signup Flow

```powershell
# Run automated test (from billing directory)
.\scripts\test-signup-flow.ps1
```

### 2. Verify Deployment

```bash
# List customer namespaces
kubectl get namespaces | grep customer-

# Check pods in customer namespace
kubectl get pods -n customer-abc123

# Check services
kubectl get services -n customer-abc123

# Check ingress
kubectl get ingress -n customer-abc123

# Check resource quota
kubectl describe resourcequota -n customer-abc123

# Check network policy
kubectl get networkpolicy -n customer-abc123
```

### 3. Test Customer Instance

```bash
# Access dashboard
open https://abc123.iotistic.cloud

# Test API health
curl https://abc123.iotistic.cloud/api/health

# Test license validation
curl https://abc123.iotistic.cloud/api/license/verify
```

### 4. Test MQTT Connection

```bash
# Forward MQTT port
kubectl port-forward -n customer-abc123 svc/customer-abc123-mosquitto 1883:1883

# Publish test message
mosquitto_pub -h localhost -t test/topic -m "Hello from K8s"

# Subscribe to messages
mosquitto_sub -h localhost -t test/topic
```

## Monitoring

### Kubernetes Dashboard

```bash
# Install dashboard
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml

# Create admin user
kubectl create serviceaccount dashboard-admin -n kubernetes-dashboard
kubectl create clusterrolebinding dashboard-admin \
  --clusterrole=cluster-admin \
  --serviceaccount=kubernetes-dashboard:dashboard-admin

# Get token
kubectl -n kubernetes-dashboard create token dashboard-admin

# Access dashboard
kubectl proxy
open http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/
```

### Prometheus + Grafana (Optional)

```bash
# Install kube-prometheus-stack
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace

# Access Grafana
kubectl port-forward -n monitoring svc/monitoring-grafana 3000:80
# Default: admin/prom-operator
```

### Customer Usage Metrics

```bash
# Access billing exporter metrics
kubectl port-forward -n customer-abc123 svc/customer-abc123-exporter 9090:9090
curl http://localhost:9090/metrics
```

## Troubleshooting

### Billing Service Issues

**Problem**: Billing pods not starting

```bash
# Check events
kubectl get events -n billing --sort-by='.lastTimestamp'

# Check pod logs
kubectl logs -n billing deployment/billing-api

# Describe pod
kubectl describe pod -n billing <pod-name>
```

**Problem**: Can't deploy customer instances

```bash
# Check RBAC permissions
kubectl auth can-i create namespaces --as=system:serviceaccount:billing:billing-deployer

# Check Helm availability in pod
kubectl exec -it -n billing deployment/billing-api -- helm version
```

### Customer Instance Issues

**Problem**: Pods not starting

```bash
# Check resource quota
kubectl describe resourcequota -n customer-abc123

# Check pod events
kubectl describe pod -n customer-abc123 <pod-name>

# Check image pull
kubectl get events -n customer-abc123 | grep ImagePull
```

**Problem**: License validation fails

```bash
# Check license key in secret
kubectl get secret customer-abc123-secrets -n customer-abc123 \
  -o jsonpath='{.data.IOTISTIC_LICENSE_KEY}' | base64 -d

# Check API logs
kubectl logs -n customer-abc123 deployment/customer-abc123-api
```

**Problem**: Database connection fails

```bash
# Check PostgreSQL pod
kubectl get pods -n customer-abc123 | grep postgres

# Test connection from API pod
kubectl exec -it -n customer-abc123 deployment/customer-abc123-api -- \
  psql postgresql://postgres:password@customer-abc123-postgres:5432/iotistic
```

**Problem**: MQTT connection fails

```bash
# Check Mosquitto pod
kubectl get pods -n customer-abc123 | grep mosquitto

# Test from API pod
kubectl exec -it -n customer-abc123 deployment/customer-abc123-api -- \
  nc -zv customer-abc123-mosquitto 1883
```

### Network Issues

**Problem**: Ingress not working

```bash
# Check ingress status
kubectl get ingress -n customer-abc123

# Check ingress controller logs
kubectl logs -n ingress-nginx deployment/ingress-nginx-controller

# Check DNS resolution
nslookup abc123.iotistic.cloud
```

**Problem**: TLS certificate not issued

```bash
# Check certificate
kubectl get certificate -n customer-abc123

# Check cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager

# Describe certificate for events
kubectl describe certificate customer-abc123-tls -n customer-abc123
```

## Scaling

### Horizontal Pod Autoscaling

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: billing-api-hpa
  namespace: billing
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: billing-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### Cluster Autoscaling

Configure cluster autoscaler based on cloud provider:

- **AWS EKS**: Use Cluster Autoscaler or Karpenter
- **GKE**: Enable GKE Autopilot or Cluster Autoscaler
- **AKS**: Enable cluster autoscaler

## Backup & Disaster Recovery

### Database Backups

```bash
# Backup PostgreSQL from customer instance
kubectl exec -n customer-abc123 deployment/customer-abc123-postgres -- \
  pg_dump -U postgres iotistic > backup-abc123-$(date +%Y%m%d).sql

# Restore
kubectl exec -i -n customer-abc123 deployment/customer-abc123-postgres -- \
  psql -U postgres iotistic < backup-abc123-20240115.sql
```

### Velero (Cluster Backups)

```bash
# Install Velero
velero install \
  --provider aws \
  --bucket velero-backups \
  --backup-location-config region=us-east-1 \
  --snapshot-location-config region=us-east-1

# Backup all customer namespaces
velero backup create customers-backup \
  --selector customer-id \
  --include-namespaces customer-*

# Restore
velero restore create --from-backup customers-backup
```

## Cost Optimization

1. **Right-size resource requests**: Monitor actual usage and adjust
2. **Use spot instances**: For non-critical workloads
3. **Implement cluster autoscaler**: Scale down during off-hours
4. **Use PVC reclaim policies**: Delete storage when customer cancels
5. **Implement namespace quotas**: Prevent runaway costs

## Security Best Practices

1. **Enable Pod Security Standards**: Enforce restricted policies
2. **Use Network Policies**: Restrict inter-namespace traffic
3. **Rotate secrets regularly**: Automate with external-secrets
4. **Enable audit logging**: Track all API calls
5. **Use RBAC**: Principle of least privilege
6. **Scan images**: Use Trivy or Snyk
7. **Enable mTLS**: Use service mesh (Istio, Linkerd)

## Next Steps

1. **Implement deployment queue**: Use Bull + Redis for async deployments
2. **Add email notifications**: Welcome emails, trial expiration reminders
3. **Implement usage alerting**: Notify when approaching limits
4. **Add database backups**: Automated daily backups to S3
5. **Implement observability**: Distributed tracing with OpenTelemetry

## Support

- Documentation: `/docs`
- API Reference: `https://billing.iotistic.cloud/api-docs`
- Helm Chart: `/charts/customer-instance/README.md`
