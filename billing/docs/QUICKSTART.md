# Billing - Quick Start Guide

## 🎯 What This Is

**Global Billing** - A separate, centralized service that:
- Manages customer subscriptions using **Stripe**
- Generates **JWT licenses** (RS256) for customer instances
- Tracks usage from deployed customer instances
- Provides RESTful API for billing operations

**Architecture**: 
```
Global Billing API (YOUR cloud) → Generates License JWT → Customer Instance (THEIR infrastructure) validates license
```

---

## 🚀 Quick Setup (5 minutes)

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
```

### 4. Setup Database

**Option A**: Docker Compose (easiest)
```bash
docker-compose up -d postgres
```

**Option B**: Local PostgreSQL
```bash
# Create database
createdb billing

# Run migrations
npm run migrate
```

### 5. Start Development Server

```bash
npm run dev
```

Server runs on http://localhost:3100

---

## 🧪 Test the API

### Create a Customer (with 14-day trial)

```powershell
$response = Invoke-RestMethod -Method POST -Uri "http://localhost:3100/api/customers" `
  -ContentType "application/json" `
  -Body '{"email":"test@example.com","company_name":"Test Corp"}'

$customerId = $response.customer.customer_id
$license = $response.license

Write-Host "Customer ID: $customerId"
Write-Host "License JWT: $license"
```

### Create Stripe Checkout Session

```powershell
$checkout = Invoke-RestMethod -Method POST -Uri "http://localhost:3100/api/subscriptions/checkout" `
  -ContentType "application/json" `
  -Body "{`"customer_id`":`"$customerId`",`"plan`":`"professional`",`"success_url`":`"http://localhost:3100/success`",`"cancel_url`":`"http://localhost:3100/cancel`"}"

Write-Host "Checkout URL: $($checkout.checkout_url)"
# Open in browser to complete payment
```

### Get License for Customer Instance

```powershell
$license = Invoke-RestMethod -Method GET -Uri "http://localhost:3100/api/licenses/$customerId"
Write-Host "License: $($license.license)"
```

### Report Usage from Customer Instance

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3100/api/usage/report" `
  -ContentType "application/json" `
  -Body "{`"customer_id`":`"$customerId`",`"instance_id`":`"prod-1`",`"active_devices`":25,`"total_devices`":50}"
```

---

## 🔗 Integration with Customer Instance

### In Your Customer Instance (api/)

1. **Get public key** from billing API:
```powershell
$publicKey = (Invoke-RestMethod -Uri "http://localhost:3100/api/licenses/public-key").public_key
```

2. **Set environment variable**:
```bash
LICENSE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
...
-----END PUBLIC KEY-----"
```

3. **Validate license** (already implemented in `api/src/license/license-validator.ts`):
```typescript
import { LicenseValidator } from './license/license-validator';

// On instance startup
const license = process.env.LICENSE_JWT;
const licenseData = await LicenseValidator.validateLicense(license);

console.log('Plan:', licenseData.plan);
console.log('Max Devices:', licenseData.features.maxDevices);
```

4. **Report usage** (from customer instance):
```typescript
import axios from 'axios';

// Report daily
setInterval(async () => {
  await axios.post('http://your-billing-api.com/api/usage/report', {
    customer_id: process.env.CUSTOMER_ID,
    instance_id: process.env.INSTANCE_ID,
    active_devices: await getActiveDeviceCount(),
    total_devices: await getTotalDeviceCount(),
  });
}, 24 * 60 * 60 * 1000); // Daily
```

---

## 📋 Stripe Setup

### 1. Create Products & Prices

In Stripe Dashboard (https://dashboard.stripe.com/test/products):

1. **Starter Plan**
   - Name: "Starter Plan"
   - Price: $29/month
   - Copy Price ID → `STRIPE_PRICE_STARTER`

2. **Professional Plan**
   - Name: "Professional Plan"
   - Price: $99/month
   - Copy Price ID → `STRIPE_PRICE_PROFESSIONAL`

3. **Enterprise Plan**
   - Name: "Enterprise Plan"
   - Price: $499/month (or custom)
   - Copy Price ID → `STRIPE_PRICE_ENTERPRISE`

### 2. Setup Webhook

1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Forward webhooks to local dev:
```bash
stripe listen --forward-to localhost:3100/api/webhooks/stripe
```
3. Copy webhook secret → `STRIPE_WEBHOOK_SECRET`

**Production**: Create webhook endpoint in Stripe Dashboard pointing to `https://your-api.com/api/webhooks/stripe`

---

## 🏗️ Production Deployment

### Using Docker

```bash
# Build
docker build -t billing-api .

# Run with environment file
docker run -d \
  --name billing-api \
  -p 3100:3100 \
  --env-file .env \
  -v /path/to/keys:/app/keys \
  billing-api
```

### Using Docker Compose

```bash
docker-compose up -d
```

### Environment Checklist

✅ PostgreSQL database (Azure Database, AWS RDS, etc.)
✅ Stripe account (production mode)
✅ RSA keys generated and backed up
✅ Environment variables set
✅ Webhook endpoint configured in Stripe
✅ HTTPS/TLS certificate (use Nginx/Caddy reverse proxy)

---

## 🔐 Security Notes

1. **Private Key**: NEVER commit `keys/private-key.pem` to git (already in `.gitignore`)
2. **Stripe Keys**: Use environment variables, never hardcode
3. **Database**: Use SSL connections in production
4. **HTTPS**: Always use TLS in production (Nginx, Caddy, or cloud load balancer)
5. **Webhook Signature**: Always verify Stripe webhook signatures (already implemented)

---

## 📊 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/customers` | POST | Create customer + trial |
| `/api/customers/:id` | GET | Get customer details |
| `/api/subscriptions/checkout` | POST | Create Stripe checkout |
| `/api/subscriptions/trial` | POST | Create trial subscription |
| `/api/subscriptions/upgrade` | POST | Upgrade plan |
| `/api/subscriptions/cancel` | POST | Cancel subscription |
| `/api/licenses/:customerId` | GET | Get license JWT |
| `/api/licenses/public-key` | GET | Get public key for instances |
| `/api/licenses/verify` | POST | Verify license (testing) |
| `/api/usage/report` | POST | Report usage from instance |
| `/api/usage/:customerId` | GET | Get usage history |
| `/api/webhooks/stripe` | POST | Stripe webhook handler |

See [README.md](./README.md) for complete API documentation.

---

## 🆘 Troubleshooting

**TypeScript errors after npm install?**
```bash
npm run build
```

**Database connection fails?**
- Check `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Run migrations: `npm run migrate`

**License generation fails?**
- Run `npm run generate-keys`
- Check `LICENSE_PRIVATE_KEY_PATH` points to existing file

**Stripe webhook fails?**
- Verify webhook signature in `.env` matches Stripe CLI/Dashboard
- Check Stripe CLI is forwarding: `stripe listen`

**Customer instance can't verify license?**
- Ensure public key is correctly copied (including `-----BEGIN/END-----` markers)
- Check customer instance has `LICENSE_PUBLIC_KEY` environment variable

---

## 🎓 Next Steps

1. **Test Stripe Flow**: Create customer → checkout → complete payment → verify license updated
2. **Test Webhook**: Use Stripe CLI to trigger events: `stripe trigger checkout.session.completed`
3. **Integrate with Customer Instance**: Add license validation on instance startup
4. **Add Monitoring**: Set up logging, alerts for failed payments
5. **Customize Plans**: Edit `src/services/license-generator.ts` to adjust feature flags

---

**Questions?** See [README.md](./README.md) for full documentation.
