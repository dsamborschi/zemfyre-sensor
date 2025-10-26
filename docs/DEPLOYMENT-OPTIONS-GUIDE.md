# Deployment Options Guide

**Multi-Tenant IoT Platform - Local Development vs Cloud Production**

This guide outlines deployment strategies for the Iotistic multi-tenant SaaS platform, comparing local Docker Desktop development with cloud Kubernetes deployments (AKS, EKS, GKE).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Local Development Setup (Docker Desktop)](#local-development-setup-docker-desktop)
3. [Cloud Production Setup (AKS/EKS/GKE)](#cloud-production-setup-akseksgke)
4. [MQTT Options for Cloud](#mqtt-options-for-cloud)
5. [Cost Analysis](#cost-analysis)
6. [Migration Path](#migration-path)
7. [Decision Matrix](#decision-matrix)

---

## Architecture Overview

### Platform Components (Per Customer Namespace)

```
Customer Namespace
├── PostgreSQL (5432)        - Device data, MQTT ACLs
├── Mosquitto (1883, 9001)   - MQTT broker
├── API (3002)               - REST API, provisioning
├── Dashboard (80)           - React admin panel
└── Billing Exporter (9090)  - Usage metrics
```

### Global Services (Shared)

```
Billing Service
├── Stripe integration
├── Customer management
├── License generation (JWT)
└── K8s deployment orchestration
```

---

## Local Development Setup (Docker Desktop)

### Overview

**Target Environment:** MacOS/Windows developers running Kubernetes via Docker Desktop

**Key Characteristics:**
- Single-node cluster
- `localhost` domain
- NodePort for external access
- No LoadBalancer support
- Manual hosts file configuration (optional)

### Service Exposure Strategy

#### Automatic NodePort Allocation

When `BASE_DOMAIN=localhost`, the billing service automatically configures NodePort for all services:

```typescript
// billing/src/services/k8s-deployment-service.ts
const isDockerDesktop = this.baseDomain === 'localhost';

if (isDockerDesktop) {
  // Hash customer ID for deterministic port allocation
  const hashCode = shortId.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  const portOffset = Math.abs(hashCode % 2000); // Support ~2000 customers
  
  const apiPort = 30000 + portOffset;           // e.g., 30567
  const dashboardPort = 30000 + portOffset + 1; // e.g., 30568
  const mqttPort = 31000 + portOffset;          // e.g., 31567
  const websocketPort = 31000 + portOffset + 1; // e.g., 31568
}
```

#### Port Allocation Table

| Service | Port Range | Example (customer `a18ada74`) |
|---------|-----------|-------------------------------|
| API | 30000-31999 | 30567 |
| Dashboard | 30001-32000 | 30568 |
| MQTT | 31000-32999 | 31567 |
| WebSocket | 31001-33000 | 31568 |

**Benefits:**
- ✅ No port conflicts between customers
- ✅ Deterministic (same customer ID = same ports)
- ✅ No database needed for port tracking
- ✅ Supports up to 2,000 concurrent customer namespaces

### Access Methods

#### Option 1: Direct NodePort (Recommended)

**Agent Connection:**
```bash
# API
CLOUD_API_ENDPOINT=http://localhost:30567

# MQTT (determined by provisioning response)
mqtt://localhost:31567
```

**Dashboard Access:**
```
http://localhost:30568
```

**Pros:**
- ✅ No DNS configuration needed
- ✅ Works immediately after deployment
- ✅ Multiple customers on different ports

**Cons:**
- ❌ Need to track which port belongs to which customer
- ❌ Dashboard CORS may require configuration

#### Option 2: Hosts File + Ingress (Development Parity)

**Setup:**
```powershell
# Add to C:\Windows\System32\drivers\etc\hosts
127.0.0.1 a18ada74.localhost
127.0.0.1 b23dfe89.localhost
```

**Access:**
```
http://a18ada74.localhost    # Dashboard
http://a18ada74.localhost/api # API
mqtt://localhost:31567        # MQTT (still NodePort)
```

**Pros:**
- ✅ Matches production URL structure
- ✅ No CORS issues
- ✅ Easier to remember

**Cons:**
- ❌ Manual hosts file updates per customer
- ❌ MQTT still requires NodePort (Ingress can't handle TCP)

### Setup Steps

#### 1. Prerequisites

```bash
# Enable Kubernetes in Docker Desktop
# Settings → Kubernetes → Enable Kubernetes

# Verify cluster
kubectl cluster-info
```

#### 2. Deploy Billing Service

```bash
cd billing
cp .env.example .env

# Edit .env
BASE_DOMAIN=localhost
STRIPE_SECRET_KEY=sk_test_...
LICENSE_PRIVATE_KEY_PATH=./keys/private_key.pem
LICENSE_PUBLIC_KEY_PATH=./keys/public_key.pem

# Generate license keys
npm run generate-keys

# Start billing service
docker-compose up -d
```

#### 3. Create Customer

```powershell
# Using PowerShell script
cd billing/scripts
.\test-signup-flow.ps1
```

**Expected Output:**
```json
{
  "customerId": "cust_...",
  "namespace": "customer-a18ada74",
  "ports": {
    "api": 30567,
    "dashboard": 30568,
    "mqtt": 31567,
    "websocket": 31568
  },
  "status": "provisioning"
}
```

#### 4. Verify Deployment

```bash
# Check namespace
kubectl get ns | grep customer-

# Check pods
kubectl get pods -n customer-a18ada74

# Check services
kubectl get svc -n customer-a18ada74
```

#### 5. Connect Agent

```bash
cd agent

# Delete old database (if re-provisioning)
rm -f agent.db

# Set environment
export CLOUD_API_ENDPOINT=http://localhost:30567
export PROVISIONING_API_KEY=<key-from-create-provisioning-key.ps1>

# Start agent
npm run dev
```

**Expected Agent Logs:**
```
✅ Device provisioned successfully
🔍 MQTT Broker URL: mqtt://localhost:31567
✅ Connected to MQTT broker
✅ Cloud API connected
```

### Environment Variables

```bash
# Billing Service (.env)
BASE_DOMAIN=localhost
DATABASE_URL=postgresql://localhost:5433/iotistic_billing
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
LICENSE_PRIVATE_KEY_PATH=./keys/private_key.pem
LICENSE_PUBLIC_KEY_PATH=./keys/public_key.pem
SIMULATE_K8S_DEPLOYMENT=false  # Set to true to skip actual Helm

# Agent
CLOUD_API_ENDPOINT=http://localhost:30567  # Or http://a18ada74.localhost/api
PROVISIONING_API_KEY=<from-api>
MQTT_BROKER_URL=  # Leave empty, gets from provisioning
```

### Limitations

| Limitation | Impact | Workaround |
|-----------|--------|------------|
| Single-node cluster | No HA testing | Use Minikube with multi-node |
| NodePort range (30000-32767) | Max 2,767 customers | Use hash-based allocation (2,000 max) |
| No LoadBalancer | Can't test LB provisioning | Mock with NodePort |
| Localhost DNS | Can't test real domains | Use hosts file |

---

## Cloud Production Setup (AKS/EKS/GKE)

### Overview

**Target Environment:** Azure AKS, AWS EKS, or Google GKE

**Key Characteristics:**
- Multi-node cluster
- Public domain (e.g., `iotistic.cloud`)
- Ingress for HTTP/HTTPS
- LoadBalancer or TCP proxy for MQTT
- Auto-scaling support

### Service Exposure Strategy

#### ClusterIP + Ingress (HTTP/HTTPS)

When `BASE_DOMAIN != localhost`, services use ClusterIP (internal only):

```yaml
# Helm values automatically generated
api:
  serviceType: ClusterIP  # ← Internal only, not exposed
dashboard:
  serviceType: ClusterIP
```

#### Ingress Routes Traffic

```yaml
# charts/customer-instance/templates/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: customer-a18ada74
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - a18ada74.iotistic.cloud
    secretName: customer-a18ada74-tls
  rules:
  - host: a18ada74.iotistic.cloud
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: customer-a18ada74-customer-instance-dashboard
            port:
              number: 80
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: customer-a18ada74-customer-instance-api
            port:
              number: 3002
```

**Result:**
- Dashboard: `https://a18ada74.iotistic.cloud`
- API: `https://a18ada74.iotistic.cloud/api`
- One public IP for **all** customers (cost-efficient!)

### Architecture Diagram

```
                        Internet
                           │
                           │
                    ┌──────▼──────┐
                    │ DNS Records │
                    │ *.iotistic. │
                    │    cloud    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────────────────┐
                    │ Ingress Controller      │
                    │ (nginx/traefik)         │
                    │ LoadBalancer:           │
                    │ 20.30.40.50             │
                    └──────┬──────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
    HTTP/HTTPS         MQTT/TLS          Metrics
        │                  │                  │
   ┌────▼────┐      ┌──────▼──────┐    ┌─────▼─────┐
   │ Ingress │      │ HAProxy/    │    │Prometheus │
   │ Rules   │      │ Nginx TCP   │    │ Operator  │
   └────┬────┘      │ Proxy       │    └─────┬─────┘
        │           └──────┬──────┘          │
        │                  │                 │
   ┌────▼──────────────────▼─────────────────▼────┐
   │         Customer Namespaces                   │
   │         (ClusterIP Services)                  │
   │                                                │
   │  ┌─────────────────────────────────────┐     │
   │  │ customer-a18ada74                    │     │
   │  │  ├─ postgres (5432)                  │     │
   │  │  ├─ mosquitto (1883, 9001)           │     │
   │  │  ├─ api (3002)                       │     │
   │  │  ├─ dashboard (80)                   │     │
   │  │  └─ billing-exporter (9090)          │     │
   │  └─────────────────────────────────────┘     │
   │                                                │
   │  ┌─────────────────────────────────────┐     │
   │  │ customer-b23dfe89                    │     │
   │  │  ├─ postgres (5432)                  │     │
   │  │  ├─ mosquitto (1883, 9001)           │     │
   │  │  ├─ api (3002)                       │     │
   │  │  ├─ dashboard (80)                   │     │
   │  │  └─ billing-exporter (9090)          │     │
   │  └─────────────────────────────────────┘     │
   │                                                │
   │  ... (more customer namespaces)               │
   └────────────────────────────────────────────────┘
```

### Setup Steps

#### 1. Provision Kubernetes Cluster

**Azure AKS:**
```bash
# Create resource group
az group create --name iotistic-rg --location eastus

# Create AKS cluster (3 nodes, autoscaling)
az aks create \
  --resource-group iotistic-rg \
  --name iotistic-cluster \
  --node-count 3 \
  --enable-cluster-autoscaler \
  --min-count 3 \
  --max-count 10 \
  --node-vm-size Standard_D4s_v3 \
  --enable-addons monitoring \
  --generate-ssh-keys

# Get credentials
az aks get-credentials --resource-group iotistic-rg --name iotistic-cluster
```

**AWS EKS:**
```bash
# Install eksctl
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin

# Create cluster
eksctl create cluster \
  --name iotistic-cluster \
  --region us-east-1 \
  --nodegroup-name standard-workers \
  --node-type t3.large \
  --nodes 3 \
  --nodes-min 3 \
  --nodes-max 10 \
  --managed
```

**Google GKE:**
```bash
# Create cluster
gcloud container clusters create iotistic-cluster \
  --zone us-central1-a \
  --num-nodes 3 \
  --machine-type n1-standard-4 \
  --enable-autoscaling \
  --min-nodes 3 \
  --max-nodes 10

# Get credentials
gcloud container clusters get-credentials iotistic-cluster --zone us-central1-a
```

#### 2. Install Core Infrastructure

**Ingress Controller (NGINX):**
```bash
# Add Helm repo
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# Install
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=LoadBalancer \
  --set controller.replicaCount=2 \
  --set controller.metrics.enabled=true

# Wait for LoadBalancer IP
kubectl get svc -n ingress-nginx ingress-nginx-controller --watch
```

**Cert-Manager (TLS Certificates):**
```bash
# Install cert-manager
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set installCRDs=true

# Create ClusterIssuer for Let's Encrypt
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@iotistic.cloud
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

**Prometheus + Grafana (Monitoring):**
```bash
# Install kube-prometheus-stack
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.retention=30d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=50Gi \
  --set grafana.adminPassword=<secure-password>
```

#### 3. Configure DNS

**Get LoadBalancer IP:**
```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
# Example: 20.30.40.50
```

**Create DNS Records:**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `*.iotistic.cloud` | `20.30.40.50` | 300 |
| A | `billing.iotistic.cloud` | `20.30.40.50` | 300 |

**Verify:**
```bash
nslookup a18ada74.iotistic.cloud
# Should return: 20.30.40.50
```

#### 4. Deploy Billing Service

```bash
cd billing

# Update .env for production
BASE_DOMAIN=iotistic.cloud
DATABASE_URL=postgresql://<cloud-db-host>:5432/iotistic_billing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
LICENSE_PRIVATE_KEY_PATH=/app/keys/private_key.pem
LICENSE_PUBLIC_KEY_PATH=/app/keys/public_key.pem
SIMULATE_K8S_DEPLOYMENT=false

# Deploy via Helm (or Docker Compose + Ingress)
helm install billing ./charts/billing \
  --namespace billing \
  --create-namespace \
  --set ingress.enabled=true \
  --set ingress.host=billing.iotistic.cloud \
  --set ingress.tls.enabled=true
```

#### 5. Create Customer

```bash
# Via API
curl -X POST https://billing.iotistic.cloud/api/customers/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "companyName": "Acme Corp",
    "plan": "professional"
  }'
```

**Response:**
```json
{
  "customerId": "cust_...",
  "namespace": "customer-a18ada74",
  "urls": {
    "dashboard": "https://a18ada74.iotistic.cloud",
    "api": "https://a18ada74.iotistic.cloud/api",
    "mqtt": "mqtt://mqtt.a18ada74.iotistic.cloud:8883"
  },
  "status": "provisioning"
}
```

#### 6. Verify Deployment

```bash
# Check namespace
kubectl get ns customer-a18ada74

# Check pods
kubectl get pods -n customer-a18ada74

# Check ingress
kubectl get ingress -n customer-a18ada74

# Test API
curl https://a18ada74.iotistic.cloud/api/health
```

### Environment Variables (Production)

```bash
# Billing Service
BASE_DOMAIN=iotistic.cloud
DATABASE_URL=postgresql://prod-db.postgres.database.azure.com:5432/iotistic_billing
REDIS_URL=redis://prod-redis.redis.cache.windows.net:6380
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
LICENSE_PRIVATE_KEY_PATH=/app/keys/private_key.pem
LICENSE_PUBLIC_KEY_PATH=/app/keys/public_key.pem
KUBECONFIG_PATH=/root/.kube/config
CHART_PATH=/app/charts/customer-instance

# Agent (Device)
CLOUD_API_ENDPOINT=https://a18ada74.iotistic.cloud/api
PROVISIONING_API_KEY=<from-provisioning-endpoint>
# MQTT URL comes from provisioning response
```

---

## MQTT Options for Cloud

### Problem Statement

**Ingress controllers (nginx, traefik) only handle HTTP/HTTPS.**

MQTT uses raw TCP on port 1883 (or 8883 for TLS), which Ingress can't route based on hostname.

### Option 1: LoadBalancer per Customer

#### Architecture

```yaml
# charts/customer-instance/values.yaml
mosquitto:
  serviceType: LoadBalancer  # ← Each customer gets public IP
```

#### How It Works

```bash
# Customer A
kubectl get svc -n customer-a18ada74
# mosquitto  LoadBalancer  10.0.1.50  52.168.10.20  1883:31000/TCP

# Customer B
kubectl get svc -n customer-b23dfe89
# mosquitto  LoadBalancer  10.0.2.30  52.168.10.21  1883:31001/TCP
```

**Agent connects to unique IP per customer:**
```
mqtt://52.168.10.20:1883  # Customer A
mqtt://52.168.10.21:1883  # Customer B
```

#### Pros & Cons

**Pros:**
- ✅ Simplest to implement (one YAML line)
- ✅ Complete isolation (dedicated IP per customer)
- ✅ No shared infrastructure bottleneck
- ✅ Works with any MQTT client (no TLS required)

**Cons:**
- ❌ **Expensive:** $20-30/month per LoadBalancer
- ❌ Cloud provider IP limits (e.g., Azure: 100 IPs per subscription)
- ❌ DNS management (need A record per customer)
- ❌ Doesn't scale beyond 100-500 customers

#### Cost Breakdown (100 Customers)

| Cloud | LoadBalancer Cost | Total/Month | Total/Year |
|-------|------------------|-------------|------------|
| **Azure** | $25/LB | $2,500 | $30,000 |
| **AWS** | $20/NLB | $2,000 | $24,000 |
| **GCP** | $20/LB | $2,000 | $24,000 |

**Recommendation:** ❌ **Not viable for SaaS with >10 customers**

---

### Option 2: Shared TCP Proxy with SNI (Recommended ⭐)

#### Architecture

```
                    Internet
                       │
                ┌──────▼──────┐
                │   DNS       │
                │ *.iotistic. │
                │    cloud    │
                └──────┬──────┘
                       │
         ┌─────────────▼─────────────┐
         │ HAProxy/Nginx TCP Proxy   │
         │ LoadBalancer: 20.30.40.50 │
         │ Port 8883 (MQTT over TLS) │
         └─────────────┬─────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
    SNI Routing    SNI Routing    SNI Routing
 (mqtt.a18.cloud) (mqtt.b23.cloud) (mqtt.c45.cloud)
        │              │              │
   ┌────▼───┐     ┌───▼────┐     ┌───▼────┐
   │Mosquitto│     │Mosquitto│    │Mosquitto│
   │a18ada74│     │b23dfe89│    │c45ab12│
   └─────────┘     └────────┘     └────────┘
```

#### How It Works

**1. TLS with SNI (Server Name Indication)**

When an MQTT client connects with TLS, it sends the hostname in the TLS handshake:
```
Client → Proxy: "I want mqtt.a18ada74.iotistic.cloud"
Proxy → Backend: Route to customer-a18ada74-mosquitto:8883
```

**2. HAProxy Configuration**

```haproxy
# /etc/haproxy/haproxy.cfg
frontend mqtt_tls
    bind *:8883
    mode tcp
    tcp-request inspect-delay 5s
    tcp-request content accept if { req_ssl_hello_type 1 }
    
    # Route based on SNI
    use_backend mqtt_a18ada74 if { req_ssl_sni -i mqtt.a18ada74.iotistic.cloud }
    use_backend mqtt_b23dfe89 if { req_ssl_sni -i mqtt.b23dfe89.iotistic.cloud }
    # ... dynamically generated for each customer

backend mqtt_a18ada74
    mode tcp
    server mosquitto customer-a18ada74-mosquitto.customer-a18ada74.svc:8883 check

backend mqtt_b23dfe89
    mode tcp
    server mosquitto customer-b23dfe89-mosquitto.customer-b23dfe89.svc:8883 check
```

**3. Mosquitto TLS Configuration**

```conf
# mosquitto.conf (per customer)
listener 8883
protocol mqtt
cafile /mosquitto/certs/ca.crt
certfile /mosquitto/certs/server.crt
keyfile /mosquitto/certs/server.key
require_certificate false  # Allow username/password auth
```

#### Implementation Steps

**1. Install HAProxy Helm Chart:**

```bash
helm repo add haproxytech https://haproxytech.github.io/helm-charts
helm repo update

helm install mqtt-proxy haproxytech/haproxy \
  --namespace mqtt-proxy \
  --create-namespace \
  --set service.type=LoadBalancer \
  --set service.ports[0].name=mqtt-tls \
  --set service.ports[0].port=8883 \
  --set service.ports[0].targetPort=8883 \
  --set service.ports[0].protocol=TCP
```

**2. Generate Dynamic HAProxy Config:**

```typescript
// billing/src/services/mqtt-proxy-config.ts
export async function updateHAProxyConfig() {
  const customers = await getActiveCustomers();
  
  let config = `
frontend mqtt_tls
    bind *:8883
    mode tcp
    tcp-request inspect-delay 5s
    tcp-request content accept if { req_ssl_hello_type 1 }
`;

  customers.forEach(customer => {
    const hostname = `mqtt.${customer.shortId}.${BASE_DOMAIN}`;
    const backend = `mqtt_${customer.shortId}`;
    
    config += `    use_backend ${backend} if { req_ssl_sni -i ${hostname} }\n`;
  });

  customers.forEach(customer => {
    const backend = `mqtt_${customer.shortId}`;
    const service = `customer-${customer.shortId}-mosquitto.customer-${customer.shortId}.svc`;
    
    config += `
backend ${backend}
    mode tcp
    server mosquitto ${service}:8883 check
`;
  });

  // Write to ConfigMap and reload HAProxy
  await updateConfigMap('mqtt-proxy', 'haproxy-config', config);
}
```

**3. Enable TLS in Mosquitto:**

```yaml
# charts/customer-instance/values.yaml
mosquitto:
  tls:
    enabled: true
    certSecretName: ""  # Auto-generated via cert-manager
```

**4. Create DNS Records:**

```bash
# Wildcard MQTT subdomain
mqtt.*.iotistic.cloud → 20.30.40.50 (HAProxy LoadBalancer IP)
```

#### Agent Connection

```typescript
// Agent connects with TLS + SNI
const mqttUrl = "mqtts://mqtt.a18ada74.iotistic.cloud:8883";
const options = {
  username: deviceUsername,
  password: devicePassword,
  ca: fs.readFileSync('./ca.crt'),  // CA certificate
  rejectUnauthorized: true
};

const client = mqtt.connect(mqttUrl, options);
```

#### Pros & Cons

**Pros:**
- ✅ **Cost-efficient:** One LoadBalancer for unlimited customers
- ✅ Scales to 10,000+ customers
- ✅ Standard TLS encryption (secure by default)
- ✅ Can use cert-manager for auto certificate renewal
- ✅ SNI is standard MQTT feature (all clients support it)

**Cons:**
- ⚠️ Requires TLS (plain MQTT not supported)
- ⚠️ Single point of failure (mitigated with HA HAProxy)
- ⚠️ Dynamic config updates (need automation)
- ⚠️ Slightly more complex setup

#### Cost Breakdown (1,000 Customers)

| Component | Cost/Month | Notes |
|-----------|-----------|-------|
| HAProxy LoadBalancer | $25 | Single LB, shared |
| HAProxy Compute (3 replicas) | $150 | 3x t3.medium instances |
| Cert-Manager | $0 | Let's Encrypt (free) |
| **Total** | **$175** | ~$0.18 per customer |

**Recommendation:** ✅ **Best option for SaaS with 10+ customers**

---

### Option 3: Cloud-Native MQTT Service

#### Architecture

Instead of self-hosted Mosquitto, use managed MQTT service:

```
Agent → AWS IoT Core / Azure IoT Hub / HiveMQ Cloud
            ↓
      Customer API (via webhooks)
```

#### Popular Services

**AWS IoT Core:**
- **Pricing:** $1.00/million messages + $0.50/million minutes connected
- **Features:** Auto-scaling, device registry, rules engine
- **Integration:** Lambda, DynamoDB, S3

**Azure IoT Hub:**
- **Pricing:** $10/month (Basic tier) + $0.0004/message
- **Features:** Device twins, direct methods, file upload
- **Integration:** Event Hubs, Stream Analytics

**HiveMQ Cloud:**
- **Pricing:** $99/month (Starter) → $499/month (Professional)
- **Features:** MQTT 5.0, clustering, monitoring
- **Integration:** Webhooks, Kafka, REST API

#### Implementation

**1. Provision Cloud Service (Example: AWS IoT Core):**

```bash
# Create IoT Thing per device
aws iot create-thing --thing-name device-123abc

# Create certificate
aws iot create-keys-and-certificate --set-as-active \
  --certificate-pem-outfile device.crt \
  --public-key-outfile device.public.key \
  --private-key-outfile device.private.key

# Create policy
aws iot create-policy --policy-name device-policy --policy-document '{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "iot:*",
    "Resource": "*"
  }]
}'

# Attach policy to certificate
aws iot attach-policy --policy-name device-policy --target <certificate-arn>
```

**2. Update Helm Chart:**

```yaml
# charts/customer-instance/values.yaml
mosquitto:
  enabled: false  # ← Don't deploy Mosquitto

mqtt:
  provider: "aws-iot"  # or "azure-iot-hub", "hivemq"
  broker:
    host: "a18ada74.iot.us-east-1.amazonaws.com"
    port: 8883
    protocol: "mqtts"
    useTls: true
```

**3. Provisioning Flow:**

```typescript
// api/src/routes/provisioning.ts
async function provisionDevice(deviceId: string, customerId: string) {
  // Create AWS IoT Thing
  const thing = await iotClient.createThing({
    thingName: `${customerId}-${deviceId}`
  });
  
  // Create certificate
  const cert = await iotClient.createKeysAndCertificate({ setAsActive: true });
  
  // Return to device
  return {
    mqttBrokerUrl: `mqtts://${customerId}.iot.us-east-1.amazonaws.com:8883`,
    mqttUsername: "", // Not used with certificates
    mqttPassword: "",
    clientCertificate: cert.certificatePem,
    clientKey: cert.keyPair.PrivateKey,
    caCertificate: amazonRootCA
  };
}
```

#### Pros & Cons

**Pros:**
- ✅ Zero maintenance (fully managed)
- ✅ Auto-scaling (handles millions of devices)
- ✅ High availability (99.9% SLA)
- ✅ Built-in device management
- ✅ Rich integrations (cloud-native services)

**Cons:**
- ❌ **Higher cost** at scale (message-based pricing)
- ❌ Vendor lock-in
- ❌ Less control over broker configuration
- ❌ Migration complexity (customer data in cloud)

#### Cost Breakdown (1,000 Devices, 10 msg/min each)

**AWS IoT Core:**
```
Messages/month: 1,000 devices × 10 msg/min × 60 min × 24 hr × 30 days
              = 432,000,000 messages

Cost: 432M messages × $1.00/million = $432/month
Connected time: 1,000 devices × 43,200 min = 43.2M minutes
              = 43.2M × $0.50/million = $21.60/month

Total: $453.60/month (~$0.45 per device)
```

**HiveMQ Cloud (Professional):**
```
Fixed: $499/month (up to 10,000 devices, unlimited messages)
Total: $499/month (~$0.50 per device)
```

**Recommendation:** ⚠️ **Good for enterprise customers with high reliability needs, but expensive for small/medium deployments**

---

## Cost Analysis

### Local Development (Docker Desktop)

| Component | Cost | Notes |
|-----------|------|-------|
| Docker Desktop | Free (personal) / $5/month (pro) | Included in dev tools |
| Compute | $0 | Runs on laptop |
| Storage | $0 | Local disk |
| Networking | $0 | Localhost |
| **Total** | **$0-5/month** | Per developer |

---

### Cloud Production - Cost Comparison

#### Scenario: 100 Customers, 10 Devices Each (1,000 Total Devices)

**Assumptions:**
- 3-node Kubernetes cluster (t3.large / D4s_v3 equivalent)
- 100 customer namespaces
- 1,000 devices sending 10 messages/min
- 500 GB storage total
- 1 TB data transfer/month

---

#### Option 1: LoadBalancer per Customer (❌ Not Recommended)

**Azure AKS:**
```
Cluster (3x D4s_v3):         $480/month
Storage (500 GB):            $50/month
LoadBalancers (100):         $2,500/month  ← 💸 Expensive!
Data Transfer (1 TB):        $87/month
Monitoring (Log Analytics):  $100/month
Total:                       $3,217/month
Per Customer:                $32.17/month
```

**AWS EKS:**
```
Cluster (3x t3.large):       $450/month
EKS Control Plane:           $73/month
Storage (500 GB):            $50/month
Network Load Balancers (100): $2,000/month  ← 💸 Expensive!
Data Transfer (1 TB):        $90/month
CloudWatch Logs:             $100/month
Total:                       $2,763/month
Per Customer:                $27.63/month
```

**Verdict:** ❌ **$27-32 per customer just for infrastructure = unsustainable**

---

#### Option 2: Shared TCP Proxy with SNI (✅ Recommended)

**Azure AKS:**
```
Cluster (3x D4s_v3):         $480/month
Storage (500 GB):            $50/month
Ingress LoadBalancer (1):    $25/month     ← ✅ Shared
HAProxy LoadBalancer (1):    $25/month     ← ✅ Shared
HAProxy Compute (3x B2s):    $90/month
Data Transfer (1 TB):        $87/month
Monitoring:                  $100/month
Cert-Manager:                $0/month
Total:                       $857/month
Per Customer:                $8.57/month   ← ✅ 73% cheaper!
```

**AWS EKS:**
```
Cluster (3x t3.large):       $450/month
EKS Control Plane:           $73/month
Storage (500 GB):            $50/month
Ingress NLB (1):             $20/month     ← ✅ Shared
MQTT TCP Proxy NLB (1):      $20/month     ← ✅ Shared
HAProxy Compute (3x t3.small): $75/month
Data Transfer (1 TB):        $90/month
CloudWatch:                  $100/month
Total:                       $878/month
Per Customer:                $8.78/month   ← ✅ 68% cheaper!
```

**Verdict:** ✅ **$8-9 per customer = sustainable for SaaS**

---

#### Option 3: Cloud-Native MQTT (⚠️ Variable Cost)

**AWS IoT Core:**
```
Cluster (3x t3.large):       $450/month
EKS Control Plane:           $73/month
Storage (500 GB):            $50/month
Ingress NLB (1):             $20/month
Data Transfer (1 TB):        $90/month
CloudWatch:                  $100/month
AWS IoT Core:                $453/month    ← Message-based
Total:                       $1,236/month
Per Customer:                $12.36/month
```

**HiveMQ Cloud (Professional):**
```
Cluster (3x t3.large):       $450/month
EKS Control Plane:           $73/month
Storage (500 GB):            $50/month
Ingress NLB (1):             $20/month
Data Transfer (1 TB):        $90/month
CloudWatch:                  $100/month
HiveMQ Cloud:                $499/month    ← Flat rate
Total:                       $1,282/month
Per Customer:                $12.82/month
```

**Verdict:** ⚠️ **$12-13 per customer = acceptable for enterprise, but 50% more expensive than self-hosted**

---

### Cost Summary Table

| Deployment Option | Monthly Cost | Cost per Customer | Scalability | Recommended For |
|------------------|--------------|-------------------|-------------|-----------------|
| **Local (Docker Desktop)** | $0-5 | N/A | 1-5 namespaces | Development |
| **Cloud: LB per Customer** | $2,763-3,217 | $27-32 | Poor (100 max) | ❌ Not recommended |
| **Cloud: Shared TCP Proxy** | $857-878 | $8-9 | Excellent (10,000+) | ✅ **Most SaaS** |
| **Cloud: Managed MQTT** | $1,236-1,282 | $12-13 | Excellent (unlimited) | Enterprise |

---

## Migration Path

### Phase 1: Local Development (Week 1)

**Goal:** Get developers up and running with multi-tenant setup

**Steps:**
1. ✅ Install Docker Desktop with Kubernetes
2. ✅ Deploy billing service (`docker-compose up`)
3. ✅ Configure NodePort allocation in Helm charts
4. ✅ Test customer signup → namespace deployment → agent connection
5. ✅ Verify all services work (API, Dashboard, MQTT)

**Success Criteria:**
- [ ] Can create 3+ customer namespaces locally
- [ ] Agent connects to NodePort MQTT
- [ ] Dashboard accessible on `localhost:30xxx`

---

### Phase 2: Cloud Infrastructure Setup (Week 2-3)

**Goal:** Provision production Kubernetes cluster and core services

**Steps:**
1. Provision AKS/EKS/GKE cluster (3 nodes, autoscaling)
2. Install ingress-nginx controller
3. Install cert-manager for TLS
4. Install Prometheus + Grafana
5. Configure DNS (`*.iotistic.cloud` → LoadBalancer IP)
6. Deploy billing service to cloud
7. Test customer signup → ClusterIP services → Ingress routing

**Success Criteria:**
- [ ] Ingress LoadBalancer has public IP
- [ ] DNS resolves `*.iotistic.cloud` correctly
- [ ] HTTPS works with Let's Encrypt certificates
- [ ] Can create customer via billing API

---

### Phase 3: MQTT TCP Proxy (Week 4)

**Goal:** Enable production MQTT routing with SNI

**Steps:**
1. Deploy HAProxy with LoadBalancer service
2. Generate TLS certificates for `mqtt.*.iotistic.cloud`
3. Configure Mosquitto with TLS (port 8883)
4. Implement dynamic HAProxy config generator
5. Test agent connection with TLS + SNI
6. Set up monitoring for HAProxy (Prometheus metrics)

**Success Criteria:**
- [ ] Agent connects to `mqtts://mqtt.customer-id.iotistic.cloud:8883`
- [ ] Messages published/received successfully
- [ ] Multiple customers can connect simultaneously
- [ ] HAProxy metrics visible in Grafana

---

### Phase 4: Production Hardening (Week 5-6)

**Goal:** Make system production-ready

**Steps:**
1. Set up backups (PostgreSQL, etcd)
2. Configure resource quotas per namespace
3. Implement network policies (isolate customer traffic)
4. Set up log aggregation (ELK/Loki)
5. Create runbooks for common issues
6. Load testing (simulate 1,000+ devices)
7. Disaster recovery testing

**Success Criteria:**
- [ ] Automated daily backups
- [ ] Can restore customer namespace from backup
- [ ] Network policies block cross-namespace traffic
- [ ] System handles 1,000 concurrent MQTT connections
- [ ] Monitoring alerts fire correctly

---

### Phase 5: Migration (Week 7+)

**Goal:** Move existing customers from local/staging to production

**Steps:**
1. Export customer data from staging
2. Create production customer namespaces
3. Import data to production PostgreSQL
4. Update DNS records
5. Update agent configuration (new MQTT URLs)
6. Monitor for issues
7. Decommission staging

**Success Criteria:**
- [ ] All customers migrated successfully
- [ ] Zero data loss
- [ ] Downtime < 5 minutes per customer
- [ ] All agents reconnect automatically

---

## Decision Matrix

### When to Use Each Option

| Scenario | Recommended Setup | Reason |
|----------|------------------|---------|
| **Local development** | Docker Desktop + NodePort | Fast iteration, no cloud costs |
| **Staging/Testing** | Minikube/K3s + NodePort | Close to production, but cheaper |
| **Production (0-10 customers)** | Cloud + LB per customer | Simple, acceptable cost at small scale |
| **Production (10-1000 customers)** | Cloud + Shared TCP Proxy ⭐ | Best cost/scalability balance |
| **Production (1000+ customers)** | Cloud + Managed MQTT | Offload ops burden, pay for reliability |
| **Enterprise customers** | Dedicated clusters | Complete isolation, compliance requirements |

---

### Hybrid Architecture (Recommended for Most)

```
Development:   Docker Desktop + NodePort
Staging:       Small K8s cluster + Shared TCP Proxy
Production:    Large K8s cluster + Shared TCP Proxy + (Optional) Managed MQTT for Premium
```

**Benefits:**
- ✅ Developers iterate quickly locally
- ✅ Staging matches production architecture
- ✅ Production optimized for cost/scale
- ✅ Premium customers can opt into managed MQTT

---

## Quick Reference Commands

### Local Development

```bash
# Start billing service
cd billing && docker-compose up -d

# Create customer
curl -X POST http://localhost:3100/api/customers/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","companyName":"Test Corp","plan":"starter"}'

# Check customer namespace
kubectl get pods -n customer-<id>

# Get NodePort services
kubectl get svc -n customer-<id> -o wide

# Connect agent
export CLOUD_API_ENDPOINT=http://localhost:30xxx
npm run dev
```

### Cloud Production

```bash
# Deploy customer
curl -X POST https://billing.iotistic.cloud/api/customers/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","companyName":"Test Corp","plan":"professional"}'

# Check deployment
kubectl get ingress -n customer-<id>
kubectl get pods -n customer-<id>

# Test HTTPS
curl https://customer-id.iotistic.cloud/api/health

# Test MQTT (with mosquitto_sub)
mosquitto_sub -h mqtt.customer-id.iotistic.cloud -p 8883 \
  -u <username> -P <password> -t '#' \
  --cafile ca.crt --insecure

# View HAProxy stats
kubectl port-forward -n mqtt-proxy svc/haproxy 8404:8404
# Open http://localhost:8404/stats
```

---

## Troubleshooting

### Local Development

**Issue:** NodePort conflicts between customers

**Solution:**
```bash
# Check port allocation
kubectl get svc --all-namespaces | grep NodePort

# Manually override if needed
helm upgrade customer-<id> ./charts/customer-instance \
  --set api.nodePort=30500 \
  --set dashboard.nodePort=30501
```

**Issue:** Agent can't connect to MQTT

**Solution:**
```bash
# Verify NodePort is active
kubectl get svc -n customer-<id> | grep mosquitto

# Test connectivity
telnet localhost 31xxx

# Check Mosquitto logs
kubectl logs -n customer-<id> deployment/mosquitto
```

### Cloud Production

**Issue:** DNS not resolving

**Solution:**
```bash
# Check LoadBalancer IP
kubectl get svc -n ingress-nginx ingress-nginx-controller

# Verify DNS propagation
dig a18ada74.iotistic.cloud

# Check Ingress rules
kubectl describe ingress -n customer-a18ada74
```

**Issue:** TLS certificate errors

**Solution:**
```bash
# Check cert-manager status
kubectl get certificates --all-namespaces
kubectl describe certificate customer-a18ada74-tls -n customer-a18ada74

# Force renewal
kubectl delete secret customer-a18ada74-tls -n customer-a18ada74
kubectl delete certificate customer-a18ada74-tls -n customer-a18ada74
```

**Issue:** MQTT SNI routing not working

**Solution:**
```bash
# Check HAProxy config
kubectl get cm -n mqtt-proxy haproxy-config -o yaml

# Test SNI with OpenSSL
openssl s_client -connect mqtt.a18ada74.iotistic.cloud:8883 \
  -servername mqtt.a18ada74.iotistic.cloud

# Check HAProxy logs
kubectl logs -n mqtt-proxy deployment/haproxy -f
```

---

## Conclusion

### Recommended Path

**For Most SaaS Businesses:**

1. **Start with Local Development (Docker Desktop + NodePort)**
   - Fast iteration
   - Zero cloud costs during dev
   - Supports 5-10 test customers

2. **Move to Cloud with Shared Infrastructure (ClusterIP + TCP Proxy)**
   - Cost-effective at $8-9 per customer
   - Scales to 10,000+ customers
   - Industry-standard approach

3. **Add Managed MQTT for Premium Customers (Optional)**
   - Offer as upgrade path
   - Charge $20-50/month premium
   - Offload reliability concerns

### Key Takeaways

✅ **Your current architecture is production-ready** with minimal changes
✅ **NodePort works great for local development** (up to ~2000 namespaces)
✅ **Shared TCP Proxy is the sweet spot** for production (10-10,000 customers)
✅ **Avoid LoadBalancer-per-customer** at all costs (too expensive)
✅ **Managed MQTT services** are good for enterprise, but pricey for startups

---

**Last Updated:** October 26, 2025  
**Authors:** Iotistic Platform Team  
**Related Docs:**
- [K8S Deployment Guide](./K8S-DEPLOYMENT-GUIDE.md)
- [Customer Signup K8s Deployment](./CUSTOMER-SIGNUP-K8S-DEPLOYMENT.md)
- [MQTT Broker Config API](./MQTT-BROKER-CONFIG-API.md)
