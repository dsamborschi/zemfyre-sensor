# Architecture Diagrams

Visual representations of the customer signup and Kubernetes deployment architecture.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Internet                                    │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    DNS (*.iotistic.cloud)                                │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ billing.iotistic.cloud → Billing API                             │   │
│  │ customer1.iotistic.cloud → Customer 1 Instance                   │   │
│  │ customer2.iotistic.cloud → Customer 2 Instance                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  Kubernetes Cluster (EKS/GKE/AKS)                        │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │              Ingress Controller (Nginx + cert-manager)             │ │
│  │  - TLS Termination (Let's Encrypt)                                 │ │
│  │  - Routing based on hostname                                       │ │
│  └───────────┬────────────────────────────────────┬───────────────────┘ │
│              │                                     │                     │
│              ▼                                     ▼                     │
│  ┌───────────────────────────┐     ┌─────────────────────────────────┐ │
│  │  Namespace: billing       │     │ Namespace: customer-customer1   │ │
│  │                           │     │                                 │ │
│  │  ┌──────────────────┐     │     │  ┌────────────────────────────┐│ │
│  │  │  Billing API     │     │     │  │ Dashboard (Admin Panel)    ││ │
│  │  │  - Customer mgmt │     │     │  │ ├─ Port 80                 ││ │
│  │  │  - Subscriptions │     │     │  │ └─ UI for sensor data      ││ │
│  │  │  - Licenses      │     │     │  └────────────────────────────┘│ │
│  │  │  - K8s deploy    │     │     │  ┌────────────────────────────┐│ │
│  │  └────┬─────────────┘     │     │  │ API Service                ││ │
│  │       │                   │     │  │ ├─ Port 3001               ││ │
│  │       ▼                   │     │  │ ├─ License validation      ││ │
│  │  ┌──────────────────┐     │     │  │ ├─ MQTT ↔ Database        ││ │
│  │  │  PostgreSQL      │     │     │  │ └─ REST endpoints          ││ │
│  │  │  - Customers     │     │     │  └────────┬───────────────────┘│ │
│  │  │  - Subscriptions │     │     │           │                    │ │
│  │  │  - Licenses      │     │     │  ┌────────▼────────┐ ┌────────▼─┐│
│  │  └──────────────────┘     │     │  │  PostgreSQL     │ │Mosquitto ││ │
│  │                           │     │  │  - Sensor data  │ │  (MQTT)  ││ │
│  │  ┌──────────────────┐     │     │  │  - Time-series  │ │- Port    ││ │
│  │  │  Stripe API      │     │     │  │  - 10Gi storage │ │  1883    ││ │
│  │  │  Integration     │     │     │  └─────────────────┘ │- Port    ││ │
│  │  └──────────────────┘     │     │                      │  9001    ││ │
│  │                           │     │                      └──────────┘│ │
│  │  ┌──────────────────┐     │     │  ┌────────────────────────────┐│ │
│  │  │ Helm SDK         │     │     │  │ Billing Exporter           ││ │
│  │  │ (Deploy Service) │     │     │  │ ├─ Usage metrics           ││ │
│  │  └──────────────────┘     │     │  │ └─ Port 9090 (Prometheus)  ││ │
│  └───────────────────────────┘     │  └────────────────────────────┘│ │
│                                     │                                 │ │
│                                     │  Resource Quota:                │ │
│                                     │  - 4 CPU cores max              │ │
│                                     │  - 4Gi memory max               │ │
│                                     │  Network Policy: Isolated       │ │
│                                     └─────────────────────────────────┘ │
│                                                                           │
│  Additional Customer Instances...                                        │
│  ├─ customer-customer2                                                   │
│  ├─ customer-customer3                                                   │
│  └─ customer-customer4                                                   │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

## Customer Signup Flow

```
┌────────────┐
│  Customer  │
└─────┬──────┘
      │
      │ 1. POST /api/customers/signup
      │    { email, password, company_name }
      ▼
┌───────────────────────────────────────────────────────────┐
│                    Billing API                             │
│                                                            │
│  Step 1: Validate Input                                   │
│  ├─ Email format check                                    │
│  ├─ Password strength (min 8 chars)                       │
│  ├─ Check for duplicate email                             │
│  └─ Company name required                                 │
│                                                            │
│  Step 2: Create Customer                                  │
│  ├─ Hash password (bcrypt, 10 rounds)                     │
│  ├─ Generate customer_id (UUID)                           │
│  └─ INSERT INTO customers                                 │
│                                                            │
│  Step 3: Create Trial Subscription                        │
│  ├─ Plan: starter                                         │
│  ├─ Duration: 14 days                                     │
│  ├─ Status: trialing                                      │
│  └─ INSERT INTO subscriptions                             │
│                                                            │
│  Step 4: Generate License                                 │
│  ├─ Sign JWT with RS256 (private key)                    │
│  ├─ Include: customer_id, plan, features, limits         │
│  ├─ Expiry: trial_end date                               │
│  └─ Return JWT token                                      │
│                                                            │
│  Step 5: Log Audit Trail                                  │
│  ├─ Action: generated                                     │
│  ├─ Type: trial_signup                                    │
│  └─ INSERT INTO license_history                           │
│                                                            │
│  Step 6: Trigger K8s Deployment (Async)                   │
│  ├─ Update deployment_status = 'deploying'                │
│  ├─ Call k8sDeploymentService.deployCustomerInstance()   │
│  └─ Return immediately (don't wait)                       │
│                                                            │
└────────┬──────────────────────────────────────────────────┘
         │
         │ 2. Response: { customer_id, license, instance_url }
         ▼
┌────────────┐
│  Customer  │ Receives:
│            │ - customer_id: "abc123"
│            │ - license: "eyJhbGc..."
│            │ - instance_url: "https://abc123.iotistic.cloud"
│            │ - deployment_status: "deploying"
└────────────┘
```

## Kubernetes Deployment Flow

```
┌──────────────────────────────────────────────────────────┐
│           K8sDeploymentService                           │
│         (billing/src/services/k8s-deployment-service.ts) │
└────────┬─────────────────────────────────────────────────┘
         │
         │ deployCustomerInstance(options)
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: Update Database                                        │
│  └─ UPDATE customers SET deployment_status = 'deploying'        │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: Create Namespace                                       │
│  └─ kubectl create namespace customer-{customerId}              │
│     --labels=customer-id={customerId},managed-by=iotistic       │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: Helm Install                                           │
│  └─ helm upgrade --install customer-{customerId}                │
│     ./charts/customer-instance                                  │
│     --set customer.id={customerId}                              │
│     --set customer.email={email}                                │
│     --set customer.companyName={companyName}                    │
│     --set license.key={licenseKey}                              │
│     --namespace customer-{customerId}                           │
│     --create-namespace                                          │
│     --wait                                                      │
│     --timeout 5m                                                │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Helm Chart Execution                                           │
│                                                                  │
│  1. Create Secret (secrets.yaml)                                │
│     ├─ IOTISTIC_LICENSE_KEY={licenseKey}                        │
│     ├─ DATABASE_URL=postgresql://...                            │
│     ├─ POSTGRES_USER=postgres                                   │
│     ├─ POSTGRES_PASSWORD=<generated>                            │
│     └─ CUSTOMER_ID, CUSTOMER_EMAIL, CUSTOMER_COMPANY            │
│                                                                  │
│  2. Deploy PostgreSQL (postgres.yaml)                           │
│     ├─ StatefulSet: 1 replica                                   │
│     ├─ Image: postgres:15-alpine                                │
│     ├─ PVC: 10Gi storage                                        │
│     ├─ Service: ClusterIP port 5432                             │
│     └─ Probes: pg_isready                                       │
│                                                                  │
│  3. Deploy Mosquitto (mosquitto.yaml)                           │
│     ├─ ConfigMap: mosquitto.conf                                │
│     ├─ Deployment: 1 replica                                    │
│     ├─ Image: eclipse-mosquitto:2.0                             │
│     ├─ Service: ClusterIP ports 1883, 9001                      │
│     └─ Probes: TCP socket                                       │
│                                                                  │
│  4. Deploy API (api.yaml)                                       │
│     ├─ Deployment: 1 replica                                    │
│     ├─ Image: iotistic/api:latest                               │
│     ├─ Env: LICENSE, DATABASE_URL, MQTT_BROKER from secrets     │
│     ├─ Resources: 250m-500m CPU, 256Mi-512Mi memory             │
│     ├─ Service: ClusterIP port 3001                             │
│     └─ Probes: HTTP /health                                     │
│                                                                  │
│  5. Deploy Dashboard (dashboard.yaml)                           │
│     ├─ Deployment: 1 replica                                    │
│     ├─ Image: iotistic/admin:latest                             │
│     ├─ Env: API_URL, MQTT_URL                                   │
│     ├─ Resources: 100m-200m CPU, 128Mi-256Mi memory             │
│     ├─ Service: ClusterIP port 80                               │
│     └─ Probes: HTTP /                                           │
│                                                                  │
│  6. Deploy Exporter (exporter.yaml)                             │
│     ├─ Deployment: 1 replica                                    │
│     ├─ Image: iotistic/billing-exporter:latest                  │
│     ├─ Env: CUSTOMER_ID, DATABASE_URL from secrets              │
│     ├─ Resources: 50m-100m CPU, 64Mi-128Mi memory               │
│     ├─ Service: ClusterIP port 9090                             │
│     └─ Probes: HTTP /metrics                                    │
│                                                                  │
│  7. Create Ingress (ingress.yaml)                               │
│     ├─ Host: {customerId}.iotistic.cloud                        │
│     ├─ TLS: cert-manager (Let's Encrypt)                        │
│     ├─ Rules:                                                    │
│     │   ├─ / → dashboard:80                                     │
│     │   ├─ /api → api:3001                                      │
│     │   └─ /metrics → exporter:9090                             │
│     └─ Annotations: nginx, cert-manager                         │
│                                                                  │
│  8. Apply Resource Quota (resource-quota.yaml)                  │
│     ├─ CPU: 4 cores max                                         │
│     ├─ Memory: 4Gi max                                          │
│     ├─ PVCs: 5 max                                              │
│     └─ Services: 10 max                                         │
│                                                                  │
│  9. Apply Network Policy (network-policy.yaml)                  │
│     ├─ Ingress: Allow from ingress-nginx only                   │
│     ├─ Egress: Allow DNS, internal pods, HTTPS/HTTP             │
│     └─ Deny all other traffic                                   │
│                                                                  │
└────────┬─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 4: Wait for Deployment                                    │
│  └─ kubectl wait --for=condition=available --timeout=300s       │
│     --all deployments -n customer-{customerId}                  │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 5: Update Database (Success)                              │
│  ├─ UPDATE customers SET                                        │
│  │   deployment_status = 'deployed',                            │
│  │   deployed_at = NOW(),                                       │
│  │   deployment_error = NULL                                    │
│  └─ Return: { success: true, instanceUrl: "https://..." }       │
└─────────────────────────────────────────────────────────────────┘

                     OR (on error)

┌─────────────────────────────────────────────────────────────────┐
│  Step 5: Update Database (Failure)                              │
│  ├─ UPDATE customers SET                                        │
│  │   deployment_status = 'failed',                              │
│  │   deployment_error = {error message}                         │
│  └─ Return: { success: false, error: "..." }                    │
└─────────────────────────────────────────────────────────────────┘
```

## License Validation Flow

```
┌────────────────┐
│  IoT Device    │
│  (Raspberry Pi)│
└───────┬────────┘
        │
        │ 1. MQTT Connect
        ▼
┌────────────────────────────────────────────────────┐
│  Customer Instance (customer-abc123)               │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │  Mosquitto MQTT Broker                      │  │
│  │  mqtt://customer-abc123-mosquitto:1883      │  │
│  └──────────────┬──────────────────────────────┘  │
│                 │                                   │
│                 │ 2. Forward messages               │
│                 ▼                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │  API Service                                │  │
│  │                                             │  │
│  │  On Startup:                                │  │
│  │  ├─ Read IOTISTIC_LICENSE_KEY from secret  │  │
│  │  ├─ Verify JWT signature (RS256)           │  │
│  │  ├─ Check expiry date                      │  │
│  │  ├─ Validate customer_id                   │  │
│  │  └─ Load features & limits                 │  │
│  │                                             │  │
│  │  On Request:                                │  │
│  │  ├─ Enforce maxDevices limit               │  │
│  │  ├─ Enforce dataRetentionDays              │  │
│  │  └─ Enable/disable features                │  │
│  │                                             │  │
│  └──────────────┬──────────────────────────────┘  │
│                 │                                   │
│                 │ 3. Store sensor data              │
│                 ▼                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │  PostgreSQL                                 │  │
│  │  - Sensor readings                          │  │
│  │  - Device metadata                          │  │
│  │  - Alert history                            │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Stripe Payment Flow

```
┌────────────┐
│  Customer  │
└─────┬──────┘
      │
      │ Trial expires after 14 days
      │
      │ 1. Click "Upgrade to Paid Plan"
      ▼
┌───────────────────────────────────────────────────────┐
│  Dashboard (customer-abc123)                          │
│  https://abc123.iotistic.cloud                        │
└────────┬──────────────────────────────────────────────┘
         │
         │ 2. POST /api/subscriptions/create-checkout-session
         ▼
┌───────────────────────────────────────────────────────┐
│  Billing API                                          │
│                                                        │
│  Step 1: Create/Get Stripe Customer                   │
│  ├─ Check if customers.stripe_customer_id exists     │
│  ├─ If not: stripe.customers.create()                │
│  │   ├─ email: {customer.email}                      │
│  │   └─ metadata: { customer_id: {customer_id} }     │
│  └─ UPDATE customers SET stripe_customer_id = ...    │
│                                                        │
│  Step 2: Create Checkout Session                      │
│  └─ stripe.checkout.sessions.create({                │
│      customer: stripe_customer_id,                    │
│      mode: 'subscription',                            │
│      line_items: [{ price: 'price_xxx', quantity: 1}],│
│      success_url: '...?session_id={CHECKOUT_SESSION_ID}',│
│      cancel_url: '...'                                │
│    })                                                 │
│                                                        │
│  Step 3: Return Checkout URL                          │
│  └─ { checkoutUrl: 'https://checkout.stripe.com/...' }│
│                                                        │
└────────┬──────────────────────────────────────────────┘
         │
         │ 3. Redirect to Stripe Checkout
         ▼
┌───────────────────────────────────────────────────────┐
│  Stripe Checkout (stripe.com)                         │
│  - Enter payment details                              │
│  - Complete purchase                                  │
└────────┬──────────────────────────────────────────────┘
         │
         │ 4. Webhook: checkout.session.completed
         ▼
┌───────────────────────────────────────────────────────┐
│  Billing API - Webhook Handler                        │
│  POST /api/webhooks/stripe                            │
│                                                        │
│  Step 1: Verify Webhook Signature                     │
│  └─ stripe.webhooks.constructEvent()                  │
│                                                        │
│  Step 2: Get Customer ID                              │
│  ├─ stripeCustomerId = event.data.object.customer    │
│  └─ customer = findByStripeCustomerId(stripeCustomerId)│
│                                                        │
│  Step 3: Update Subscription                          │
│  └─ UPDATE subscriptions SET                          │
│      status = 'active',                               │
│      current_period_start = NOW(),                    │
│      current_period_end = NOW() + INTERVAL '30 days', │
│      stripe_subscription_id = ...                     │
│                                                        │
│  Step 4: Generate New License                         │
│  ├─ Generate JWT with updated expiry (30 days)       │
│  └─ Log in license_history                            │
│                                                        │
│  Step 5: Update Customer Instance (optional)          │
│  └─ k8sDeploymentService.updateCustomerInstance()    │
│      (Updates license in K8s secret)                  │
│                                                        │
└────────┬──────────────────────────────────────────────┘
         │
         │ 5. Redirect back to success_url
         ▼
┌────────────┐
│  Customer  │ Subscription upgraded!
│            │ New license valid for 30 days
└────────────┘
```

## Data Flow

```
┌───────────────────────────────────────────────────────────────┐
│                       IoT Device                               │
│                    (Raspberry Pi + BME688)                     │
└────────┬──────────────────────────────────────────────────────┘
         │
         │ Sensor readings every 10s:
         │ - Temperature (°C)
         │ - Humidity (%)
         │ - Pressure (hPa)
         │ - Gas resistance (Ω)
         │
         │ MQTT Publish: sensor/telemetry
         │ { temp: 22.5, humidity: 45.2, ... }
         ▼
┌───────────────────────────────────────────────────────────────┐
│  Customer Instance Namespace                                  │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Mosquitto MQTT Broker                                 │  │
│  │  mqtt://customer-abc123-mosquitto:1883                 │  │
│  └──────────┬─────────────────────────────────────────────┘  │
│             │                                                 │
│             │ Subscribe: sensor/#                             │
│             ▼                                                 │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Node-RED (Optional)                                   │  │
│  │  - Data transformation                                 │  │
│  │  - Alert rules                                         │  │
│  │  - Integrations                                        │  │
│  └──────────┬─────────────────────────────────────────────┘  │
│             │                                                 │
│             │ HTTP POST: /api/sensor-data                     │
│             ▼                                                 │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  API Service                                           │  │
│  │  - Validate license (maxDevices check)                │  │
│  │  - Parse sensor data                                  │  │
│  │  - Apply business logic                               │  │
│  └──────────┬─────────────────────────────────────────────┘  │
│             │                                                 │
│             │ INSERT INTO sensor_readings                     │
│             ▼                                                 │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL                                            │  │
│  │  Table: sensor_readings                               │  │
│  │  - id, device_id, timestamp                           │  │
│  │  - temperature, humidity, pressure, gas_resistance    │  │
│  │  - Indexes: (device_id, timestamp)                    │  │
│  │  - Retention: 90 days (configurable per license)     │  │
│  └──────────┬─────────────────────────────────────────────┘  │
│             │                                                 │
│             │ Query: SELECT * WHERE ...                       │
│             ▼                                                 │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Grafana Dashboard (embedded in admin panel)          │  │
│  │  - Real-time graphs                                   │  │
│  │  - Historical trends                                  │  │
│  │  - Alert visualization                                │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

## Multi-Tenant Isolation

```
┌──────────────────────────────────────────────────────────────────┐
│                  Kubernetes Cluster                              │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Namespace: customer-customer1                             │ │
│  │  ├─ Resource Quota: 4 CPU, 4Gi memory                      │ │
│  │  ├─ Network Policy: Deny all external                      │ │
│  │  └─ RBAC: No cross-namespace access                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              ▲▼                                  │
│                       (No direct access)                         │
│                              ▲▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Namespace: customer-customer2                             │ │
│  │  ├─ Resource Quota: 4 CPU, 4Gi memory                      │ │
│  │  ├─ Network Policy: Deny all external                      │ │
│  │  └─ RBAC: No cross-namespace access                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Isolation Mechanisms:                                           │
│  ✅ Namespace-level resource isolation                           │
│  ✅ Network policies (no inter-namespace traffic)                │
│  ✅ Separate databases (one PostgreSQL per customer)             │
│  ✅ Separate secrets (licenses, credentials)                     │
│  ✅ Resource quotas (prevent noisy neighbor)                     │
│  ✅ Separate ingress routes (unique subdomains)                  │
│  ✅ License enforcement (device limits, features)                │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

These diagrams provide a comprehensive visual representation of:
- Overall system architecture
- Customer signup workflow
- Kubernetes deployment process
- License validation mechanism
- Stripe payment integration
- Real-time data flow from devices
- Multi-tenant isolation strategy

Use these diagrams to understand how all components interact!
