# Iotistic Billing System - Complete Guide

> **All-in-one documentation for the Iotistic Global Billing API**  
> Last Updated: October 22, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [API Endpoints](#api-endpoints)
5. [License System](#license-system)
6. [Plan Configuration](#plan-configuration)
7. [Stripe Integration](#stripe-integration)
8. [Security](#security)
9. [Kubernetes Deployment](#kubernetes-deployment)
10. [Testing](#testing)
11. [Consumption Billing](#consumption-billing)
12. [Management](#management)
13. [Troubleshooting](#troubleshooting)

---

## Overview

The **Iotistic Global Billing API** is a production-ready, centralized billing service that:

✅ Manages customer subscriptions via Stripe  
✅ Generates JWT license keys for customer instances  
✅ Tracks usage from deployed customer instances  
✅ Handles trial periods and plan upgrades  
✅ Processes Stripe webhooks  
✅ Supports consumption-based billing

### Technology Stack

- **Node.js 18+** / TypeScript 5.3
- **Express** - REST API framework
- **PostgreSQL** - Customer, subscription, usage data
- **Stripe SDK 14.9** - Payment processing
- **Bull + Redis** - Job queue for deployments
- **jsonwebtoken** - RS256 JWT signing/verification
- **Docker** - Containerized deployment

---

## Architecture

### Deployment Model

```
┌─────────────────────────────────────────────────────────────┐
│                    YOUR CLOUD (Single Instance)             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Global Billing API (billing/)                         │ │
│  │  - Stripe checkout & subscriptions                     │ │
│  │  - License JWT generation (RS256 private key)          │ │
│  │  - Customer/subscription database                      │ │
│  │  - Usage aggregation                                   │ │
│  │  - Deployment queue (Bull + Redis)                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                          ↓ Generates License JWT            │
│                          ↓ (signed with private key)        │
└─────────────────────────────────────────────────────────────┘
                                    ↓
              ┌─────────────────────┼─────────────────────┐
              ↓                     ↓                     ↓
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  Customer Instance  │  │  Customer Instance  │  │  Customer Instance  │
│  (THEIR K8s/Cloud)  │  │  (THEIR K8s/Cloud)  │  │  (THEIR K8s/Cloud)  │
│  ┌───────────────┐  │  │  ┌───────────────┐  │  │  ┌───────────────┐  │
│  │ Validates     │  │  │  │ Validates     │  │  │  │ Validates     │  │
│  │ License JWT   │  │  │  │ License JWT   │  │  │  │ License JWT   │  │
│  │ (public key)  │  │  │  │ (public key)  │  │  │  │ (public key)  │  │
│  │               │  │  │  │               │  │  │  │               │  │
│  │ Reports Usage │  │  │  │ Reports Usage │  │  │  │ Reports Usage │  │
│  └───────────────┘  │  │  └───────────────┘  │  │  └───────────────┘  │
│   api/ (validates)  │  │   api/ (validates)  │  │   api/ (validates)  │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

### Directory Structure

```
billing/
├── src/
│   ├── db/                     # Database layer (PostgreSQL)
│   │   ├── connection.ts       # Database connection pool
│   │   ├── customer-model.ts   # Customer CRUD operations
│   │   ├── subscription-model.ts # Trial + paid subscriptions
│   │   ├── usage-report-model.ts # Usage tracking
│   │   └── license-history-model.ts # License audit trail
│   ├── services/
│   │   ├── license-generator.ts  # RS256 JWT license signing
│   │   ├── stripe-service.ts     # Stripe integration
│   │   ├── deployment-queue.ts   # Bull queue configuration
│   │   └── k8s-deployment-service.ts # Kubernetes deployment
│   ├── workers/
│   │   └── deployment-worker.ts  # Background deployment jobs
│   ├── routes/
│   │   ├── customers.ts        # Customer management API
│   │   ├── subscriptions.ts    # Subscription API
│   │   ├── licenses.ts         # License generation API
│   │   ├── usage.ts            # Usage reporting API
│   │   └── webhooks.ts         # Stripe webhook handler
│   ├── middleware/
│   │   ├── auth.ts             # Authentication middleware
│   │   └── rate-limit.ts       # Rate limiting
│   └── index.ts                # Express server + Bull Board
├── migrations/
│   ├── 001_initial_schema.sql  # PostgreSQL schema
│   └── 002_add_license_audit.sql # License history table
├── scripts/
│   ├── generate-keys.ts        # RSA key pair generator
│   ├── test-checkout-flow.ps1  # Stripe checkout test
│   ├── test-queue.ps1          # Deployment queue test
│   └── upgrade-customer.ps1    # Customer upgrade tool
├── docs/                       # Documentation (this file)
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config
├── Dockerfile                  # Production container
├── docker-compose.yml          # Local development stack
├── .env.example                # Environment template
└── .gitignore                  # Excludes keys/
```

---

## Quick Start

### 1. Install Dependencies

```bash
cd billing
npm install
```

### 2. Generate RSA Keys (for license signing)

```powershell
npm run generate-keys
```

This creates:
- `keys/private-key.pem` - **Keep secret!** Used to sign licenses
- `keys/public-key.pem` - Share with customer instances to verify licenses

### 3. Configure Environment

Copy `.env.example` to `.env`:

```bash
PORT=3100
DATABASE_URL=postgres://billing:billing123@localhost:5432/billing

# Redis (for deployment queue)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0
QUEUE_CONCURRENCY=3

# Get these from https://dashboard.stripe.com/test/apikeys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Get this from Stripe CLI or webhooks dashboard
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs (create products in Stripe dashboard first)
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PROFESSIONAL=price_...
STRIPE_PRICE_ENTERPRISE=price_...

# License keys (just generated)
LICENSE_PRIVATE_KEY_PATH=./keys/private-key.pem
LICENSE_PUBLIC_KEY_PATH=./keys/public-key.pem

# Trial settings
DEFAULT_TRIAL_DAYS=14

# Kubernetes deployment
BASE_DOMAIN=iotistic.cloud
HELM_CHART_PATH=/app/charts/customer-instance
SIMULATE_K8S_DEPLOYMENT=true  # For local testing
```

### 4. Start Database & Redis

```bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Verify services are running
docker-compose ps

# Check Redis connection
docker exec billing-redis-1 redis-cli ping
# Should return: PONG
```

**Redis Configuration:**

The billing service uses Redis for:
- **Deployment Queue** (Bull) - Background job processing
- **Session Storage** (optional)
- **Rate Limiting** (optional)

Default Redis connection settings in `docker-compose.yml`:
```yaml
redis:
  image: redis:7-alpine
  container_name: billing-redis
  ports:
    - "6379:6379"
  volumes:
    - redis-data:/data
  command: redis-server --appendonly yes
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 3s
    retries: 3
```

**Redis Security (Production):**

For production deployments, enable authentication:

```yaml
redis:
  image: redis:7-alpine
  command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
  environment:
    - REDIS_PASSWORD=${REDIS_PASSWORD}
```

Update `.env`:
```bash
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-password-here
REDIS_DB=0
```

**Redis Persistence:**

Redis is configured with AOF (Append-Only File) persistence:
- All write operations are logged
- Data survives container restarts
- Volume: `redis-data:/data`

**Monitoring Redis:**

```bash
# Connect to Redis CLI
docker exec -it billing-redis-1 redis-cli

# Check memory usage
INFO memory

# List all keys
KEYS *

# Monitor commands in real-time
MONITOR

# Check queue status
KEYS bull:*
```

### 5. Run Migrations

```bash
npm run migrate
```

### 6. Start Development Server

```bash
npm run dev
```

Server runs on http://localhost:3100

**Bull Board UI** (Queue Dashboard): http://localhost:3100/admin/queues

---

## API Endpoints

### Customer Management

#### Create Customer

```http
POST /api/customers
Content-Type: application/json

{
  "email": "customer@example.com",
  "company_name": "Acme Corp",
  "full_name": "John Doe",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "customer": {
    "customer_id": "cust_abc123xyz",
    "email": "customer@example.com",
    "company_name": "Acme Corp",
    "stripe_customer_id": "cus_xxx",
    "created_at": "2025-10-22T10:00:00Z"
  },
  "subscription": {
    "plan": "starter",
    "status": "trialing",
    "trial_ends_at": "2025-11-05T10:00:00Z"
  },
  "license": {
    "jwt": "eyJhbGc..."
  }
}
```

#### Get Customer

```http
GET /api/customers/:customerId
```

#### List Customers

```http
GET /api/customers?page=1&limit=20
```

### Subscription Management

#### Create Checkout Session

```http
POST /api/subscriptions/checkout
Content-Type: application/json

{
  "customer_id": "cust_abc123",
  "plan": "professional",
  "success_url": "https://app.example.com/success",
  "cancel_url": "https://app.example.com/cancel"
}
```

**Response:**
```json
{
  "session_id": "cs_test_xxx",
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_xxx"
}
```

#### Get Subscription

```http
GET /api/subscriptions/:customerId
```

#### Upgrade Subscription

```http
POST /api/subscriptions/upgrade
Content-Type: application/json

{
  "customer_id": "cust_abc123",
  "new_plan": "enterprise"
}
```

#### Cancel Subscription

```http
POST /api/subscriptions/cancel
Content-Type: application/json

{
  "customer_id": "cust_abc123"
}
```

### License Management

#### Generate License

```http
GET /api/licenses/:customerId
```

**Response:**
```json
{
  "license": "eyJhbGc...",
  "decoded": {
    "customerId": "cust_abc123",
    "customerName": "Acme Corp",
    "plan": "professional",
    "features": {
      "maxDevices": 50,
      "dataRetentionDays": 365,
      "canExportData": true,
      "hasAdvancedAlerts": true,
      "hasApiAccess": true,
      "hasMqttAccess": true,
      "hasCustomBranding": false
    },
    "limits": {
      "maxUsers": 15,
      "maxAlertRules": 100,
      "maxDashboards": 20
    },
    "subscription": {
      "status": "active",
      "currentPeriodEndsAt": "2025-11-22T00:00:00Z"
    }
  }
}
```

#### Get Public Key

```http
GET /api/licenses/public-key
```

#### Get License History

```http
GET /api/licenses/:customerId/history
```

**Response:**
```json
{
  "customer_id": "cust_abc123",
  "email": "customer@example.com",
  "history": [
    {
      "id": 42,
      "action": "upgraded",
      "plan": "professional",
      "max_devices": 50,
      "generated_at": "2025-10-21T10:30:00Z",
      "metadata": {
        "oldPlan": "starter",
        "newPlan": "professional",
        "features": {...}
      }
    }
  ],
  "statistics": {
    "totalGenerations": 5,
    "byAction": { "generated": 3, "upgraded": 2 },
    "byPlan": { "starter": 2, "professional": 3 }
  }
}
```

#### Revoke License

```http
POST /api/licenses/:customerId/revoke
Content-Type: application/json

{
  "reason": "Customer requested cancellation"
}
```

### Usage Reporting

#### Report Usage

```http
POST /api/usage/report
Content-Type: application/json

{
  "customer_id": "cust_abc123",
  "instance_id": "prod-1",
  "active_devices": 42,
  "total_devices": 45,
  "mqtt_messages_published": 150000,
  "mqtt_messages_received": 120000,
  "mqtt_bytes_sent": 1500000,
  "mqtt_bytes_received": 1200000,
  "http_requests": 5000,
  "http_bytes_sent": 500000,
  "http_bytes_received": 300000,
  "postgres_size_mb": 125.5,
  "postgres_row_count": 500000
}
```

#### Get Usage History

```http
GET /api/usage/:customerId?days=30
```

### Deployment Queue

#### Get Queue Stats

```http
GET /api/queue/stats
```

**Response:**
```json
{
  "waiting": 0,
  "active": 1,
  "completed": 15,
  "failed": 2,
  "delayed": 0
}
```

### Webhooks

#### Stripe Webhook Handler

```http
POST /api/webhooks/stripe
Stripe-Signature: t=xxx,v1=yyy

{
  "type": "checkout.session.completed",
  "data": { ... }
}
```

**Supported Events:**
- `checkout.session.completed` - Payment completed
- `customer.subscription.updated` - Subscription changed
- `customer.subscription.deleted` - Subscription canceled
- `invoice.payment_succeeded` - Invoice paid
- `invoice.payment_failed` - Payment failed

---

## License System

### How It Works

1. **Billing API** generates JWT license with customer's plan features
2. **Customer Instance** validates JWT using public key (RS256)
3. **Feature Guards** enforce limits (max devices, retention, etc.)

### License JWT Payload Example

```json
{
  "customerId": "cust_abc123",
  "customerName": "Acme Corp",
  "plan": "professional",
  "features": {
    "maxDevices": 50,
    "dataRetentionDays": 365,
    "canExportData": true,
    "hasAdvancedAlerts": true,
    "hasApiAccess": true,
    "hasMqttAccess": true,
    "hasCustomBranding": false
  },
  "limits": {
    "maxUsers": 15,
    "maxAlertRules": 100,
    "maxDashboards": 20
  },
  "trial": {
    "isTrialMode": false
  },
  "subscription": {
    "status": "active",
    "currentPeriodEndsAt": "2025-11-21T00:00:00Z"
  },
  "issuedAt": 1729500000,
  "expiresAt": 1761036000
}
```

### License Audit Logging

All license-related events are logged to `license_history` table:

- **What IS stored** (Safe):
  - License hash (SHA-256 of JWT)
  - Plan name and features
  - Customer ID
  - Timestamps
  - Metadata (features/limits)

- **What is NOT stored** (Secure):
  - ❌ Actual JWT license token
  - ❌ Private key
  - ❌ Customer API keys
  - ❌ Stripe payment details

### License Enforcement

**Enforcement Point:** Provisioning key generation (NOT device registration)

When creating a provisioning key, the system:
1. Checks the license
2. Counts active devices
3. Compares current vs limit
4. Blocks or allows key creation

**Error Response (403 Forbidden):**
```json
{
  "error": "Device limit exceeded",
  "message": "Your professional plan allows a maximum of 50 devices. You currently have 50 active devices. Please upgrade your plan to add more devices.",
  "details": {
    "currentDevices": 50,
    "maxDevices": 50,
    "plan": "professional"
  }
}
```

---

## Plan Configuration

### Subscription Plans

| Plan | Price | Max Devices | Data Retention | Advanced Alerts | Custom Branding | Max Users |
|------|-------|-------------|----------------|-----------------|-----------------|-----------|
| **Trial** | FREE | 10 | 30 days | ❌ | ❌ | 2 |
| **Starter** | $29/mo | 10 | 30 days | ❌ | ❌ | 5 |
| **Professional** | $99/mo | 50 | 365 days | ✅ | ❌ | 15 |
| **Enterprise** | Custom | Unlimited | Unlimited | ✅ | ✅ | Unlimited |

### Feature Comparison

#### Core Device Management
- **Max Devices**: Device limit per plan
- **Device Hours**: Tracked for billing

#### Job Execution Capabilities
- **Can Execute Jobs**: Run commands on remote devices (all plans)
- **Can Schedule Jobs**: Set up recurring jobs (Professional+)

#### Remote Access & Control
- **Remote Access**: SSH tunnel access (all plans)
- **OTA Updates**: Over-the-air updates (Professional+)

#### Data Management
- **Data Retention**: How long data is stored
- **Can Export Data**: Export to CSV/JSON (all plans)

#### Advanced Features
- **Advanced Alerts**: Complex alert rules (Professional+)
- **Custom Dashboards**: Create custom Grafana dashboards (Professional+)
- **API Access**: Full REST API (all plans)
- **MQTT Access**: Direct MQTT broker access (all plans)
- **Custom Branding**: White-label UI (Enterprise only)

#### Limits
- **Max Job Templates**: Reusable job templates
- **Max Alert Rules**: Alert rules per customer
- **Max Users**: User accounts per customer

### Unlicensed Mode (Fallback)

If no valid license is provided:

| Feature | Unlicensed Mode |
|---------|-----------------|
| Max Devices | 2 |
| Can Execute Jobs | ✅ |
| Can Schedule Jobs | ❌ |
| Remote Access | ✅ |
| OTA Updates | ❌ |
| Can Export Data | ❌ |
| Trial Duration | 7 days |

---

## Stripe Integration

### Setup Products & Prices

1. Go to Stripe Dashboard → Products
2. Create products for each plan:

```bash
# Starter Plan
stripe products create \
  --name "Iotistic Starter" \
  --description "Up to 10 devices"

stripe prices create \
  --product prod_XXX \
  --currency usd \
  --unit-amount 2900 \
  --recurring[interval]=month

# Professional Plan
stripe products create \
  --name "Iotistic Professional" \
  --description "Up to 50 devices"

stripe prices create \
  --product prod_YYY \
  --currency usd \
  --unit-amount 9900 \
  --recurring[interval]=month

# Enterprise Plan
stripe products create \
  --name "Iotistic Enterprise" \
  --description "Unlimited devices"

stripe prices create \
  --product prod_ZZZ \
  --currency usd \
  --unit-amount 29900 \
  --recurring[interval]=month
```

3. Copy Price IDs to `.env`:
```bash
STRIPE_PRICE_STARTER=price_xxx
STRIPE_PRICE_PROFESSIONAL=price_yyy
STRIPE_PRICE_ENTERPRISE=price_zzz
```

### Configure Webhooks

#### Development (Stripe CLI)

```bash
# Start Stripe CLI
docker logs billing-stripe-cli

# Look for:
# Ready! Your webhook signing secret is whsec_xxxxx

# Copy to .env
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Restart billing service
docker-compose restart billing
```

#### Production

1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://billing.yourdomain.com/api/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy webhook signing secret to production `.env`

### Test Cards

| Card Number | Scenario |
|-------------|----------|
| `4242 4242 4242 4242` | ✅ Success |
| `4000 0000 0000 0002` | ❌ Card declined |
| `4000 0000 0000 9995` | ❌ Insufficient funds |
| `4000 0027 6000 3184` | 🔐 Requires 3D Secure |

**Expiry:** Any future date (e.g., 12/28)  
**CVC:** Any 3 digits (e.g., 123)  
**ZIP:** Any 5 digits (e.g., 12345)

---

## Security

### ⚠️ Current Status: NO AUTHENTICATION IMPLEMENTED

**All billing endpoints are currently PUBLIC.** This must be fixed before production deployment.

### Required Security Implementations

#### 1. API Key Authentication (Customer Instances)

**Purpose:** Allow customer instances to report usage and get licenses

**Setup:**
```bash
npm install bcrypt
```

**Usage:**
```typescript
// Customer instance sends:
headers: {
  'X-API-Key': 'cust_abc123_secrettoken456'
}
```

**Implementation:**
```typescript
// billing/src/index.ts
import { authenticateCustomer } from './middleware/auth';

app.use('/api/usage', authenticateCustomer, usageRouter);
app.use('/api/licenses', authenticateCustomer, licensesRouter);
```

#### 2. Admin Token (Management Operations)

**Purpose:** Protect customer creation/modification

**Setup:**
```bash
# Generate token
openssl rand -hex 32

# Add to .env
ADMIN_API_TOKEN=<your_64_char_hex>
```

**Usage:**
```typescript
// Management scripts send:
headers: {
  'Authorization': 'Bearer <admin_token>'
}
```

**Implementation:**
```typescript
import { authenticateAdmin } from './middleware/auth';

app.use('/api/customers', authenticateAdmin, customersRouter);
```

#### 3. Rate Limiting

**Setup:**
```bash
npm install express-rate-limit
```

**Configuration:**
```typescript
// billing/src/middleware/rate-limit.ts
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});

export const usageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 60, // 60 requests per hour
  keyGenerator: (req) => req.body.customer_id, // Per customer
});
```

#### 4. Security Headers

**Setup:**
```bash
npm install helmet
```

**Implementation:**
```typescript
import helmet from 'helmet';

app.use(helmet());
```

#### 5. HTTPS/TLS (Production)

**Nginx Configuration:**
```nginx
server {
    listen 443 ssl http2;
    server_name billing.iotistic.com;

    ssl_certificate /etc/letsencrypt/live/billing.iotistic.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/billing.iotistic.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3100;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Security Checklist

- [ ] Install dependencies (bcrypt, express-rate-limit, helmet)
- [ ] Run database migration (API key columns)
- [ ] Generate and set ADMIN_API_TOKEN
- [ ] Enable authentication middleware
- [ ] Generate API keys for customers
- [ ] Update customer instances with API keys
- [ ] Enable rate limiting
- [ ] Add security headers
- [ ] Configure HTTPS/TLS
- [ ] Set up Stripe webhook with secret
- [ ] Test authentication flows
- [ ] Run security audit (`npm audit`)
- [ ] Set up monitoring and alerts

**Do not deploy to production until all items are checked!**

---

## Redis Queue System

### Overview

The billing service uses **Bull** (Redis-based queue) for background job processing:

- **Deployment Queue** - Kubernetes deployments for new customers
- **Webhook Processing** - Async Stripe webhook handling
- **Email Notifications** - Async email sending
- **License Generation** - Batch license regeneration

### Queue Architecture

```
Stripe Webhook → API Endpoint → Bull Queue → Worker → Kubernetes Deployment
                                     ↓
                                Redis Storage
                                     ↓
                               Bull Board UI
```

### Bull Board Dashboard

**Access:** http://localhost:3100/admin/queues

**Features:**
- Real-time job monitoring
- Job status (waiting, active, completed, failed)
- Retry failed jobs
- Job details and logs
- Progress tracking
- Performance metrics

### Queue Configuration

**Environment Variables:**

```bash
# Redis Connection
REDIS_HOST=redis              # Redis hostname
REDIS_PORT=6379              # Redis port
REDIS_PASSWORD=              # Optional password (production)
REDIS_DB=0                   # Database number

# Queue Settings
QUEUE_CONCURRENCY=3          # Parallel workers
QUEUE_MAX_RETRY=3            # Retry attempts
QUEUE_BACKOFF_DELAY=5000     # Retry delay (ms)
```

**Queue Options (code):**

```typescript
// billing/src/services/deployment-queue.ts
const queue = new Queue('customer-deployments', {
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,  // Keep last 100 completed
    removeOnFail: 200,      // Keep last 200 failed
  },
});
```

### Job Lifecycle

1. **Job Created**
   - API receives request (e.g., new customer signup)
   - Job added to queue with payload

2. **Job Queued**
   - Stored in Redis
   - Status: `waiting`
   - Visible in Bull Board

3. **Worker Picks Up Job**
   - Worker process polls queue
   - Status: `active`
   - Progress updates visible

4. **Job Processing**
   - Execute business logic
   - Report progress (0-100%)
   - Log operations

5. **Job Complete**
   - Status: `completed` or `failed`
   - Stored for audit
   - Retry if failed (up to 3 times)

### Queue Operations

**Add Job to Queue:**

```typescript
import { deploymentQueue } from './services/deployment-queue';

await deploymentQueue.add('deploy-customer', {
  customerId: 'cust_abc123',
  plan: 'professional',
  namespace: 'customer-abc123',
});
```

**Check Queue Status:**

```bash
# Via API
curl http://localhost:3100/api/queue/stats

# Via Bull Board
# Open http://localhost:3100/admin/queues
```

**Response:**
```json
{
  "waiting": 5,
  "active": 2,
  "completed": 150,
  "failed": 3,
  "delayed": 0
}
```

**Retry Failed Job:**

Via Bull Board:
1. Go to "Failed" tab
2. Click on job
3. Click "Retry" button

Via Code:
```typescript
const job = await queue.getJob(jobId);
await job.retry();
```

**Remove Jobs:**

```typescript
// Clean old jobs
await queue.clean(1000 * 60 * 60 * 24); // 24 hours

// Remove specific job
const job = await queue.getJob(jobId);
await job.remove();
```

### Monitoring & Debugging

**View Queue Logs:**

```bash
# Application logs
docker-compose logs -f billing

# Worker logs (if separate)
docker-compose logs -f billing-worker
```

**Redis Queue Keys:**

```bash
# Connect to Redis
docker exec -it billing-redis-1 redis-cli

# List Bull queues
KEYS bull:customer-deployments:*

# Get waiting jobs count
LLEN bull:customer-deployments:wait

# Get job data
HGETALL bull:customer-deployments:1
```

**Common Issues:**

| Issue | Cause | Solution |
|-------|-------|----------|
| Jobs stuck in waiting | Worker not running | Check `npm run dev` or restart service |
| Jobs failing repeatedly | Invalid configuration | Check job payload and environment vars |
| Redis connection error | Redis not running | `docker-compose up -d redis` |
| High memory usage | Too many completed jobs | Run `queue.clean()` or reduce retention |

### Production Deployment

**Separate Worker Process:**

For production, run workers in separate containers:

```yaml
# docker-compose.production.yml
services:
  billing-api:
    build: .
    command: npm start
    # API only, no workers
    
  billing-worker:
    build: .
    command: npm run worker
    replicas: 3  # Multiple workers
    environment:
      - QUEUE_CONCURRENCY=5
```

**Redis Cluster (High Availability):**

```yaml
redis:
  image: redis:7-alpine
  command: >
    redis-server
    --requirepass ${REDIS_PASSWORD}
    --appendonly yes
    --cluster-enabled yes
    --cluster-config-file nodes.conf
    --cluster-node-timeout 5000
```

**Monitoring:**

- Use Bull Board UI for real-time monitoring
- Set up alerts for failed jobs (>10% failure rate)
- Monitor Redis memory usage
- Track queue depth (alert if >100 waiting)

### Queue Best Practices

1. **Job Idempotency**
   - Jobs should be safely retryable
   - Check if work already done before executing
   - Use unique job IDs

2. **Timeouts**
   - Set reasonable job timeouts
   - Prevent hung jobs
   ```typescript
   defaultJobOptions: {
     timeout: 300000, // 5 minutes
   }
   ```

3. **Progress Reporting**
   - Update job progress for long-running tasks
   ```typescript
   job.progress(50); // 50% complete
   ```

4. **Error Handling**
   - Catch errors and provide context
   - Log useful debugging information
   ```typescript
   try {
     await deployCustomer(job.data);
   } catch (error) {
     await job.log(`Deployment failed: ${error.message}`);
     throw error;
   }
   ```

5. **Resource Cleanup**
   - Clean up resources even if job fails
   - Use try/finally blocks
   - Remove temporary files

---

## Kubernetes Deployment

### Architecture

```yaml
# Customer Instance Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: customer-abc123
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: api
        image: iotistic/api:latest
        env:
        - name: IOTISTIC_LICENSE_KEY
          value: "eyJhbGc..."  # From billing API
        - name: CUSTOMER_ID
          value: "cust_abc123"
```

### Helm Chart

The billing service deploys customer instances using Helm:

**Location:** `charts/customer-instance/`

**Components:**
- PostgreSQL (database)
- Mosquitto (MQTT broker with PostgreSQL auth)
- Redis (cache and queue)
- API (backend)
- Dashboard (admin UI)
- Billing Exporter (metrics)

**Deployment Process:**

1. Customer signs up → `POST /api/customers/signup`
2. Billing creates customer + trial subscription
3. Job queued → `deployment-queue.ts`
4. Worker picks up job → `deployment-worker.ts`
5. Helm install → `charts/customer-instance`
6. License generated and injected
7. Customer instance starts

**Simulation Mode:**

For local testing without K8s:

```bash
SIMULATE_K8S_DEPLOYMENT=true
```

Simulates deployment with 3-5 second delay.

### Bull Board (Queue Dashboard)

Access at: http://localhost:3100/admin/queues

**Features:**
- Real-time job monitoring
- Job inspection (click any job)
- Progress tracking (visual bars)
- Retry failed jobs (one-click)
- Clean old jobs
- Multiple view tabs (waiting, active, completed, failed, delayed)
- Timing metrics

---

## Testing

### Complete Checkout Flow Test

```powershell
# Step 1: Create Customer
$customerBody = @{
    email = "test@example.com"
    company_name = "Test Corp"
    full_name = "Test User"
    password = "SecurePass123"
} | ConvertTo-Json

$customer = Invoke-RestMethod -Uri "http://localhost:3100/api/customers/signup" `
    -Method POST -Body $customerBody -ContentType "application/json"

$customerId = $customer.customer.customer_id
Write-Host "Customer ID: $customerId"

# Step 2: Create Checkout Session
$checkoutBody = @{
    customer_id = $customerId
    plan = "professional"
    success_url = "http://localhost:3100/success"
    cancel_url = "http://localhost:3100/cancel"
} | ConvertTo-Json

$checkout = Invoke-RestMethod -Uri "http://localhost:3100/api/subscriptions/checkout" `
    -Method POST -Body $checkoutBody -ContentType "application/json"

Write-Host "Checkout URL: $($checkout.checkout_url)"
Start-Process $checkout.checkout_url

# Step 3: Complete payment with test card
# Card: 4242 4242 4242 4242
# Expiry: Any future date
# CVC: Any 3 digits

# Step 4: Verify subscription (wait for webhook)
Start-Sleep -Seconds 5

$subscription = Invoke-RestMethod -Uri "http://localhost:3100/api/subscriptions/$customerId"
Write-Host "Status: $($subscription.subscription.status)"
Write-Host "Plan: $($subscription.subscription.plan)"

# Step 5: Get license
$license = Invoke-RestMethod -Uri "http://localhost:3100/api/licenses/$customerId"
Write-Host "License: $($license.license)"
```

### Test Deployment Queue

```powershell
# Run queue test script
.\test-queue.ps1
```

### Trigger Stripe Webhooks

```bash
# Enter Stripe CLI container
docker exec -it billing-stripe-cli sh

# Trigger events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_succeeded
```

### View Logs

```bash
# Billing service logs
docker-compose logs -f billing

# Stripe CLI logs
docker logs -f billing-stripe-cli

# Queue processing
# Access Bull Board at http://localhost:3100/admin/queues
```

---

## Consumption Billing

### Metrics Tracked

#### Device Metrics (Already Implemented)
- Active devices count
- Total devices count
- Device hours

#### Network Traffic (NEW)
- **MQTT Messages**
  - Message count (publish/subscribe)
  - Payload size (bytes)
  - QoS level
- **HTTP API Calls**
  - Request count
  - Request/response size (bytes)
  - Endpoint categories

#### Data Storage (NEW)
- Database size (MB)
- Row count
- Object storage (if applicable)

### Architecture

```
Customer Instance
    ↓
Traffic Monitor → Aggregate → Usage Reporter
    ↓
Global Billing API
    ↓
Stripe Metered Billing
```

### Pricing Model

**Base Subscription** (Fixed Monthly):
- **Starter**: $29/mo → 10 devices, 10 GB traffic, 5 GB storage
- **Professional**: $99/mo → 50 devices, 100 GB traffic, 50 GB storage
- **Enterprise**: Custom → Unlimited

**Overage Pricing** (Pay-as-you-go):
- **MQTT Traffic**: $0.10 per GB over limit
- **HTTP Traffic**: $0.15 per GB over limit
- **Storage**: $0.20 per GB/month over limit
- **API Calls**: $0.50 per 1,000 calls over limit
- **Additional Devices**: $2 per device/month over limit

### Implementation Status

- ✅ Device metrics tracking
- ⏳ MQTT traffic monitoring (TrafficMonitor service)
- ⏳ HTTP traffic tracking (middleware)
- ⏳ Storage monitoring (PostgreSQL)
- ⏳ Stripe metered billing integration

---

## Management

### Customer Manager CLI

```bash
# Add customer
npm run customer -- add \
  --email customer@example.com \
  --name "Customer Name" \
  --company "Company Inc"

# Upgrade customer
npm run customer -- upgrade \
  --id cust_abc123 \
  --plan professional

# Deactivate customer
npm run customer -- deactivate --id cust_abc123

# List customers
npm run customer -- list
```

### Usage Viewer CLI

```bash
# View customer usage
npm run usage -- --customer cust_abc123

# View last 30 days
npm run usage -- --customer cust_abc123 --days 30

# View all customers
npm run usage -- --all
```

### Upgrade Customer Script

```powershell
# Upgrade specific customer
.\upgrade-customer.ps1 -CustomerId "cust_abc123" -Plan "professional"
```

**Output:**
- Verifies customer exists
- Checks current subscription
- Creates checkout session
- Opens browser for payment
- Provides verification commands

---

## Troubleshooting

### Common Issues

#### Issue: "Customer not found" in webhook logs
**Cause:** Webhook using test Stripe customer ID  
**Solution:** Use real checkout flow, not `stripe trigger`

#### Issue: Checkout URL doesn't open
**Cause:** Browser security or URL encoding  
**Solution:** Copy URL manually and paste in browser

#### Issue: Webhook not received
**Cause:** Stripe CLI not forwarding  
**Solution:** Check Stripe CLI logs:
```bash
docker logs billing-stripe-cli
# Should see: Ready! Your webhook signing secret is whsec_...
```

#### Issue: Subscription still shows "trialing"
**Cause:** Webhook not processed yet  
**Solution:** Wait 3-5 seconds after payment, then check again

#### Issue: License not updated
**Cause:** License generation is lazy (on GET request)  
**Solution:** Call `GET /api/licenses/:customerId` to trigger generation

#### Issue: TypeScript errors after npm install
**Solution:**
```bash
npm run build
```

#### Issue: Database connection fails
**Solution:**
- Check `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Run migrations: `npm run migrate`

#### Issue: License generation fails
**Solution:**
- Run `npm run generate-keys`
- Check `LICENSE_PRIVATE_KEY_PATH` points to existing file

#### Issue: Deployment queue stuck
**Cause:** Redis not running or Bull worker crashed  
**Solution:**
```bash
# Check Redis
docker ps | grep redis

# Restart billing service
docker-compose restart billing

# Check Bull Board
# Open http://localhost:3100/admin/queues
```

### Debugging

#### Check Queue Status

```bash
# API endpoint
curl http://localhost:3100/api/queue/stats

# Bull Board UI
# Open http://localhost:3100/admin/queues
```

#### Check Database

```bash
# Connect to database
docker exec -it billing-postgres-1 psql -U billing -d billing

# Check customers
SELECT customer_id, email, company_name, created_at FROM customers;

# Check subscriptions
SELECT customer_id, plan, status, stripe_subscription_id FROM subscriptions;

# Check usage reports
SELECT customer_id, active_devices, reported_at FROM usage_reports ORDER BY reported_at DESC LIMIT 10;

# Check license history
SELECT customer_id, action, plan, generated_at FROM license_history ORDER BY generated_at DESC LIMIT 10;
```

#### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f billing
docker-compose logs -f postgres
docker-compose logs -f redis
docker-compose logs -f stripe-cli
```

---

## Production Deployment

### Environment Variables

```bash
# Production .env
NODE_ENV=production
PORT=3100

# Database (use managed service)
DATABASE_URL=postgresql://user:password@prod-db:5432/billing

# Redis (use managed service)
REDIS_HOST=prod-redis.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=<redis_password>
REDIS_DB=0
REDIS_TLS_ENABLED=true  # For managed Redis services

# Queue Configuration
QUEUE_CONCURRENCY=5
QUEUE_MAX_RETRY=3
QUEUE_BACKOFF_DELAY=5000

# Stripe (live keys)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs (production)
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PROFESSIONAL=price_...
STRIPE_PRICE_ENTERPRISE=price_...

# License keys (use secrets manager)
LICENSE_PRIVATE_KEY_PATH=/secrets/license_private_key.pem
LICENSE_PUBLIC_KEY_PATH=/secrets/license_public_key.pem

# Trial settings
DEFAULT_TRIAL_DAYS=14

# Security
ADMIN_API_TOKEN=<64-char-hex-production-token>

# Kubernetes
BASE_DOMAIN=iotistic.com
HELM_CHART_PATH=/app/charts/customer-instance
SIMULATE_K8S_DEPLOYMENT=false
```

### Docker Deployment

**Option 1: Docker Compose (Recommended)**

```bash
# Production docker-compose
docker-compose -f docker-compose.production.yml up -d

# Verify services
docker-compose ps

# View logs
docker-compose logs -f billing
docker-compose logs -f billing-worker
```

**docker-compose.production.yml:**
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: billing
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
    volumes:
      - redis-data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  billing:
    build: .
    command: npm start
    ports:
      - "3100:3100"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/billing
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
    volumes:
      - ./keys:/app/keys:ro
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  billing-worker:
    build: .
    command: npm run worker
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/billing
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - QUEUE_CONCURRENCY=5
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    deploy:
      replicas: 3  # Multiple workers for high availability

volumes:
  postgres-data:
  redis-data:
```

**Option 2: Standalone Containers**

```bash
# Build
docker build -t billing-api:latest .

# Create network
docker network create billing-network

# Start Redis
docker run -d \
  --name billing-redis \
  --network billing-network \
  -e REDIS_PASSWORD=your-secure-password \
  -v redis-data:/data \
  redis:7-alpine \
  redis-server --requirepass your-secure-password --appendonly yes

# Start PostgreSQL
docker run -d \
  --name billing-postgres \
  --network billing-network \
  -e POSTGRES_DB=billing \
  -e POSTGRES_USER=billing \
  -e POSTGRES_PASSWORD=your-secure-password \
  -v postgres-data:/var/lib/postgresql/data \
  postgres:15-alpine

# Start API
docker run -d \
  --name billing-api \
  --network billing-network \
  -p 3100:3100 \
  --env-file .env.production \
  -v /path/to/keys:/app/keys:ro \
  billing-api:latest

# Start Worker
docker run -d \
  --name billing-worker \
  --network billing-network \
  --env-file .env.production \
  -e QUEUE_CONCURRENCY=5 \
  billing-api:latest \
  npm run worker
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: billing-api
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: billing
        image: iotistic/billing-api:latest
        ports:
        - containerPort: 3100
        envFrom:
        - secretRef:
            name: billing-secrets
        volumeMounts:
        - name: license-keys
          mountPath: /app/keys
          readOnly: true
      volumes:
      - name: license-keys
        secret:
          secretName: license-keys
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: billing-worker
spec:
  replicas: 5
  template:
    spec:
      containers:
      - name: worker
        image: iotistic/billing-api:latest
        command: ["npm", "run", "worker"]
        envFrom:
        - secretRef:
            name: billing-secrets
        env:
        - name: QUEUE_CONCURRENCY
          value: "5"
---
apiVersion: v1
kind: Service
metadata:
  name: redis
spec:
  ports:
  - port: 6379
    targetPort: 6379
  selector:
    app: redis
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
spec:
  serviceName: redis
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        command:
        - redis-server
        - --requirepass
        - $(REDIS_PASSWORD)
        - --appendonly
        - "yes"
        ports:
        - containerPort: 6379
          name: redis
        env:
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: billing-secrets
              key: redis-password
        volumeMounts:
        - name: redis-data
          mountPath: /data
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "1Gi"
            cpu: "500m"
  volumeClaimTemplates:
  - metadata:
      name: redis-data
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 10Gi
```

**Create Secrets:**

```bash
# Create billing secrets
kubectl create secret generic billing-secrets \
  --from-literal=database-url=postgresql://user:pass@postgres:5432/billing \
  --from-literal=redis-host=redis \
  --from-literal=redis-port=6379 \
  --from-literal=redis-password=your-secure-password \
  --from-literal=stripe-secret-key=sk_live_... \
  --from-literal=stripe-webhook-secret=whsec_... \
  --from-literal=admin-api-token=your-admin-token

# Create license keys secret
kubectl create secret generic license-keys \
  --from-file=private-key.pem=./keys/private-key.pem \
  --from-file=public-key.pem=./keys/public-key.pem
```

**Deploy:**

```bash
# Apply manifests
kubectl apply -f k8s/billing.yaml

# Check status
kubectl get pods -l app=billing
kubectl get pods -l app=billing-worker
kubectl get pods -l app=redis

# View logs
kubectl logs -f deployment/billing-api
kubectl logs -f deployment/billing-worker

# Check Redis
kubectl exec -it redis-0 -- redis-cli -a your-password ping
```

**Using Managed Redis (AWS ElastiCache, Azure Cache, GCP Memorystore):**

Update billing-secrets:
```bash
kubectl create secret generic billing-secrets \
  --from-literal=redis-host=prod-redis.xxx.cache.amazonaws.com \
  --from-literal=redis-port=6379 \
  --from-literal=redis-password=managed-redis-password \
  --from-literal=redis-tls-enabled=true \
  --dry-run=client -o yaml | kubectl apply -f -
```

Remove Redis StatefulSet if using managed service:
```bash
kubectl delete statefulset redis
kubectl delete service redis
```

### Secrets Management

**Use a secrets manager:**
- AWS Secrets Manager
- Azure Key Vault
- HashiCorp Vault
- Kubernetes Secrets

**Never:**
- Commit secrets to git
- Store secrets in plain text
- Share secrets via email/Slack

### Monitoring

**Metrics to track:**
- API response times
- Error rates (4xx, 5xx)
- Queue processing time
- Database connection pool usage
- Stripe webhook success rate

**Alerts:**
- Failed authentication >5%
- 500 errors >0.1%
- Response time >1s
- Queue backlog >100 jobs
- Database connection failures

### Backup Strategy

**Database:**
- Automated daily backups
- Point-in-time recovery
- Test restore monthly

**Secrets:**
- Backup RSA keys to encrypted storage
- Document recovery procedures
- Test key rotation

---

## Changelog

### Version 1.0.0 (October 2025)

**Features:**
- ✅ Stripe integration (checkout, subscriptions, webhooks)
- ✅ JWT license generation (RS256)
- ✅ Customer management API
- ✅ Usage tracking and reporting
- ✅ License audit logging
- ✅ Device limit enforcement
- ✅ Deployment queue (Bull + Redis)
- ✅ Bull Board UI for queue monitoring
- ✅ Kubernetes deployment support
- ✅ Multi-plan support (Starter, Professional, Enterprise)
- ✅ Trial period management
- ✅ Comprehensive documentation

**Security:**
- ✅ Webhook signature verification
- ✅ SQL injection prevention
- ✅ Secrets in environment variables
- ⏳ API authentication (planned)
- ⏳ Rate limiting (planned)
- ⏳ Security headers (planned)

**Infrastructure:**
- ✅ Docker containerization
- ✅ Docker Compose for local development
- ✅ PostgreSQL database
- ✅ Redis for queueing
- ✅ TypeScript build system
- ✅ Database migrations

---

## Support

For questions or issues:

- **Documentation**: This file covers everything
- **Security**: See Security section above
- **Testing**: See Testing section above
- **Production**: See Production Deployment section above

---

## License

Proprietary - Iotistic Technologies Inc.

---

**End of Documentation**

*This is a complete, all-in-one guide for the Iotistic Billing System. All original documentation files have been consolidated into this single document for easier reference.*
