# Zemfyre Global Billing API

**Global SaaS Control Plane** for Zemfyre IoT Platform - Handles Stripe subscriptions, license generation, and customer management.

---

## Overview

This is the **centralized billing API** that:
- ✅ Manages customer subscriptions via Stripe
- ✅ Generates JWT license keys for customer instances
- ✅ Tracks usage from deployed customer instances
- ✅ Handles trial periods and plan upgrades
- ✅ Processes Stripe webhooks

**Customer instances** (deployed in K8s clusters) validate licenses and report usage back to this API.

---

## Architecture

```
┌─────────────────────────────────────────┐
│   Global Billing API (This Repo)       │
│   - Stripe integration                  │
│   - License generation (JWT)            │
│   - Customer management                 │
│   - Usage aggregation                   │
│   - Subscription lifecycle              │
└─────────────────────────────────────────┘
                    ↓
              License JWT
                    ↓
┌─────────────────────────────────────────┐
│  Customer Instance (Per Customer)       │
│  - Validates license                    │
│  - Enforces feature flags               │
│  - Reports usage daily                  │
└─────────────────────────────────────────┘
```

---

## Features

### ✅ Stripe Integration
- Subscription creation with checkout sessions
- Plan management (Starter, Professional, Enterprise)
- Promo code support
- Webhook handling (payment success, subscription canceled, etc.)

### ✅ License Management
- JWT-based licenses (RS256 asymmetric signing)
- Feature flags per plan
- Device limits and usage quotas
- License renewal and revocation

### ✅ Trial Management
- 14-day free trials
- Trial-to-paid conversion
- Trial expiration handling

### ✅ Usage Tracking
- Receive usage reports from customer instances
- Aggregate device counts
- Usage-based billing (future)

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Generate RSA Keys

```bash
# Create keys directory
mkdir keys

# Generate private key
openssl genrsa -out keys/private-key.pem 2048

# Generate public key
openssl rsa -in keys/private-key.pem -pubout -out keys/public-key.pem

# IMPORTANT: Copy public key to customer instances
cat keys/public-key.pem
```

### 3. Set Up Database

```bash
# Create PostgreSQL database
createdb zemfyre_billing

# Run migrations
npm run migrate
```

### 4. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Stripe keys and database URL
```

### 5. Run Development Server

```bash
npm run dev
```

Server runs on `http://localhost:3100`

---

## API Endpoints

### Customer Management

**POST /api/customers**
Create a new customer account
```json
{
  "email": "customer@example.com",
  "companyName": "Acme Corp",
  "plan": "professional"
}
```

**GET /api/customers/:customerId**
Get customer details

---

### Subscription Management

**POST /api/subscriptions/create-checkout**
Create Stripe checkout session
```json
{
  "customerId": "cust_123",
  "plan": "professional",
  "successUrl": "https://app.zemfyre.com/success",
  "cancelUrl": "https://app.zemfyre.com/pricing"
}
```

**POST /api/subscriptions/create-trial**
Start a free trial
```json
{
  "customerId": "cust_123",
  "plan": "professional"
}
```

**POST /api/subscriptions/:subscriptionId/upgrade**
Upgrade subscription plan

**POST /api/subscriptions/:subscriptionId/cancel**
Cancel subscription

---

### License Management

**GET /api/licenses/:customerId**
Generate license JWT for customer
```json
{
  "license": "eyJhbGc...",
  "publicKey": "-----BEGIN PUBLIC KEY-----..."
}
```

**POST /api/licenses/:customerId/revoke**
Revoke customer license

---

### Usage Reporting

**POST /api/usage/report**
Receive usage report from customer instance
```json
{
  "customerId": "cust_123",
  "instanceId": "us-east-1",
  "timestamp": "2025-10-21T10:00:00Z",
  "metrics": {
    "activeDevices": 23,
    "totalDevices": 30
  }
}
```

**GET /api/usage/:customerId**
Get usage history for customer

---

### Webhooks

**POST /webhooks/stripe**
Stripe webhook handler (payment success, subscription canceled, etc.)

---

## Database Schema

### customers
```sql
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  customer_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  company_name VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### subscriptions
```sql
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  customer_id VARCHAR(255) REFERENCES customers(customer_id),
  stripe_subscription_id VARCHAR(255),
  plan VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  trial_ends_at TIMESTAMP,
  current_period_ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### usage_reports
```sql
CREATE TABLE usage_reports (
  id SERIAL PRIMARY KEY,
  customer_id VARCHAR(255) REFERENCES customers(customer_id),
  instance_id VARCHAR(255),
  active_devices INTEGER,
  total_devices INTEGER,
  reported_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Plan Configuration

| Feature | Starter | Professional | Enterprise |
|---------|---------|--------------|------------|
| **Price** | $29/mo | $99/mo | Custom |
| **Max Devices** | 10 | 50 | Unlimited |
| **Data Retention** | 30 days | 365 days | Custom |
| **Export Data** | ✅ | ✅ | ✅ |
| **Advanced Alerts** | ❌ | ✅ | ✅ |
| **Custom Branding** | ❌ | ❌ | ✅ |
| **API Access** | ✅ | ✅ | ✅ |
| **Support** | Email | Priority | 24/7 Phone |

---

## Stripe Setup

### 1. Create Products in Stripe

```bash
# Starter Plan
stripe products create \
  --name "Zemfyre Starter" \
  --description "Up to 10 devices"

stripe prices create \
  --product prod_XXX \
  --currency usd \
  --unit-amount 2900 \
  --recurring[interval]=month

# Professional Plan
stripe products create \
  --name "Zemfyre Professional" \
  --description "Up to 50 devices"

stripe prices create \
  --product prod_YYY \
  --currency usd \
  --unit-amount 9900 \
  --recurring[interval]=month
```

### 2. Configure Webhooks

Add webhook endpoint in Stripe dashboard:
- URL: `https://billing.zemfyre.com/webhooks/stripe`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

### 3. Get Webhook Secret

```bash
stripe listen --forward-to localhost:3100/webhooks/stripe
# Copy webhook secret to .env
```

---

## License JWT Structure

```typescript
{
  customerId: "cust_abc123",
  customerName: "Acme Corporation",
  plan: "professional",
  features: {
    maxDevices: 50,
    dataRetentionDays: 365,
    canExportData: true,
    hasAdvancedAlerts: true,
    hasApiAccess: true,
    hasMqttAccess: true,
    hasCustomBranding: false
  },
  limits: {
    maxUsers: 10,
    maxAlertRules: 100,
    maxDashboards: 20
  },
  trial: {
    isTrialMode: false
  },
  subscription: {
    status: "active",
    currentPeriodEndsAt: "2025-11-21T00:00:00Z"
  },
  issuedAt: 1729500000,
  expiresAt: 1761036000
}
```

Signed with RS256 using `keys/private-key.pem`.

---

## Deployment

### Docker

```bash
# Build
docker build -t zemfyre-billing-api .

# Run
docker run -d \
  -p 3100:3100 \
  -e DATABASE_URL=postgresql://... \
  -e STRIPE_SECRET_KEY=sk_live_... \
  -v ./keys:/app/keys:ro \
  --name billing-api \
  zemfyre-billing-api
```

### Production Checklist

- [ ] Use production Stripe keys
- [ ] Secure RSA private key (AWS Secrets Manager, Azure Key Vault)
- [ ] Enable HTTPS (SSL/TLS)
- [ ] Set up database backups
- [ ] Configure monitoring (Datadog, New Relic)
- [ ] Rate limiting
- [ ] DDoS protection (Cloudflare)
- [ ] Logging aggregation (ELK, Splunk)

---

## Security

### Private Key Management

**NEVER commit `keys/private-key.pem` to git!**

Production options:
- AWS Secrets Manager
- Azure Key Vault
- HashiCorp Vault
- Environment variable (base64 encoded)

### Webhook Verification

All Stripe webhooks are verified using `STRIPE_WEBHOOK_SECRET` to prevent forgery.

### Customer Instance Authentication

Customer instances authenticate with their license JWT when reporting usage.

---

## Testing

### Create Test Customer

```bash
curl -X POST http://localhost:3100/api/customers \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "companyName": "Test Corp",
    "plan": "professional"
  }'
```

### Start Trial

```bash
curl -X POST http://localhost:3100/api/subscriptions/create-trial \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_test123",
    "plan": "professional"
  }'
```

### Generate License

```bash
curl http://localhost:3100/api/licenses/cust_test123
```

### Report Usage

```bash
curl -X POST http://localhost:3100/api/usage/report \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "customerId": "cust_test123",
    "instanceId": "dev-1",
    "timestamp": "2025-10-21T10:00:00Z",
    "metrics": {
      "activeDevices": 5,
      "totalDevices": 10
    }
  }'
```

---

## Integration with Customer Instances

Customer instances use the **public key** to validate licenses:

```bash
# In customer instance .env
ZEMFYRE_LICENSE_KEY=eyJhbGc...  # JWT from billing API
LICENSE_PUBLIC_KEY="$(cat keys/public-key.pem)"  # Public key
BILLING_API_URL=https://billing.zemfyre.com
```

---

## Support

- **Email**: support@zemfyre.com
- **Docs**: https://docs.zemfyre.com
- **Status**: https://status.zemfyre.com

---

## License

Proprietary - Zemfyre Technologies Inc.
