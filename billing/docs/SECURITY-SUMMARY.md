# Security Implementation Summary

## 🚨 Critical Finding: No Authentication Currently Implemented

Your billing service **has no authentication** on any endpoints. Anyone with the API URL can:
- Create/delete customers
- View all customer data
- Modify subscriptions
- Access usage reports

---

## ✅ Security Measures Already Implemented

1. **Webhook Signature Verification** ✅
   - Stripe webhook events are verified using `STRIPE_WEBHOOK_SECRET`
   - Prevents unauthorized webhook injection

2. **SQL Injection Prevention** ✅
   - Using parameterized queries via Knex.js
   - No string concatenation in SQL

3. **Secrets in Environment Variables** ✅
   - Stripe keys, database credentials not hardcoded

---

## 🛡️ Required Implementations (BEFORE Production)

### 1. API Key Authentication for Customer Instances

**Purpose:** Allow customer instances (api/) to report usage and get licenses

**Implementation:**
- ✅ Created `src/middleware/auth.ts` with `authenticateCustomer()` middleware
- ✅ Created database migration for API key storage (`api_key_hash`)
- ✅ Added `CustomerModel.setApiKey()` and `verifyApiKey()` methods
- ⏳ Need to install: `npm install bcrypt`
- ⏳ Need to apply: Add middleware to usage/licenses/subscriptions routes

**Usage:**
```typescript
// Customer instance sends:
headers: { 'X-API-Key': 'cust_abc123_secrettoken456' }
```

---

### 2. Admin Token for Management Operations

**Purpose:** Protect customer creation/modification and admin operations

**Implementation:**
- ✅ Created `authenticateAdmin()` middleware in auth.ts
- ⏳ Need to generate token: `openssl rand -hex 32`
- ⏳ Need to set: `ADMIN_API_TOKEN` in .env
- ⏳ Need to apply: Add middleware to customer routes

**Usage:**
```typescript
// Management scripts send:
headers: { 'Authorization': 'Bearer <admin_token>' }
```

---

### 3. Rate Limiting

**Purpose:** Prevent abuse and DDoS attacks

**Implementation:**
- ✅ Created `src/middleware/rate-limit.ts` with multiple limiters
- ⏳ Need to install: `npm install express-rate-limit`
- ⏳ Need to apply: Add middleware to routes

**Limits:**
- General API: 100 req/15min per IP
- Usage reporting: 60 req/hour per customer
- Webhooks: 100 req/min
- Admin: 10 req/hour per IP

---

### 4. Security Headers

**Purpose:** Protect against common web vulnerabilities (XSS, clickjacking, etc.)

**Implementation:**
- ⏳ Need to install: `npm install helmet`
- ⏳ Need to apply: `app.use(helmet())`

---

### 5. HTTPS/TLS (Production Only)

**Purpose:** Encrypt all traffic, required by Stripe for webhooks

**Implementation:**
- Use Nginx reverse proxy with Let's Encrypt SSL certificate
- Or use Kubernetes Ingress with cert-manager
- See SECURITY-SETUP.md for configuration examples

---

## 📋 Quick Start Checklist

### Installation
```bash
cd billing
npm install bcrypt express-rate-limit helmet
npm install --save-dev @types/bcrypt
```

### Database Migration
```bash
npx knex migrate:latest
```

### Generate Admin Token
```bash
openssl rand -hex 32
# Add to .env: ADMIN_API_TOKEN=<token>
```

### Update index.ts
```typescript
import { authenticateAdmin, authenticateCustomer } from './middleware/auth';
import { apiLimiter, usageLimiter, webhookLimiter } from './middleware/rate-limit';
import helmet from 'helmet';

app.use(helmet());

// Public
app.get('/health', ...);
app.use('/api/webhooks', webhookLimiter, webhooksRouter);

// Customer auth
app.use('/api/usage', usageLimiter, authenticateCustomer, usageRouter);
app.use('/api/licenses', authenticateCustomer, licensesRouter);
app.use('/api/subscriptions', authenticateCustomer, subscriptionsRouter);

// Admin auth
app.use('/api/customers', apiLimiter, authenticateAdmin, customersRouter);
```

### Update Customer Creation
```typescript
import { generateApiKey } from '../middleware/auth';

const customer = await CustomerModel.create({ email, company_name });
const apiKey = generateApiKey(customer.customer_id);
await CustomerModel.setApiKey(customer.customer_id, apiKey);

res.json({
  customer,
  api_key: apiKey, // Return ONCE - cannot retrieve later
});
```

### Configure Customer Instance
```bash
# api/.env
BILLING_API_KEY=cust_abc123_<secret_from_customer_creation>
```

```typescript
// api/src/services/billing-client.ts
this.client = axios.create({
  baseURL: this.billingApiUrl,
  headers: {
    'X-API-Key': process.env.BILLING_API_KEY,
  },
});
```

---

## 📚 Documentation Created

1. **SECURITY.md** - Comprehensive security guide
   - All security considerations
   - Implementation details
   - Best practices
   - Compliance requirements

2. **SECURITY-SETUP.md** - Step-by-step setup guide
   - Quick start instructions
   - Configuration examples
   - Testing procedures
   - Emergency procedures

3. **auth.ts** - Authentication middleware
   - Customer API key authentication
   - Admin token authentication
   - Helper functions

4. **rate-limit.ts** - Rate limiting middleware
   - Multiple rate limiters for different endpoints
   - IP and customer-based limiting

5. **Migration** - Database changes
   - Add API key columns to customers table

6. **CustomerModel updates** - API key management
   - `setApiKey()` - Store hashed API key
   - `verifyApiKey()` - Validate and authenticate
   - `revokeApiKey()` - Remove API key

---

## ⚠️ Important Security Considerations

### Data Flow Security

**Customer Instance → Billing API:**
- Uses `X-API-Key` header
- API key format: `cust_<id>_<secret>`
- Keys stored hashed (bcrypt) in database
- Rate limited: 60 requests/hour

**Admin Scripts → Billing API:**
- Uses `Authorization: Bearer <token>` header
- Token is 64-character hex string
- Stored in environment variable
- Rate limited: 10 requests/hour

**Stripe → Billing API (Webhooks):**
- Uses signature verification (already implemented)
- No authentication needed (signature is authentication)
- Rate limited: 100 requests/minute

### Key Security Principles

1. **Defense in Depth**
   - Multiple layers: auth, rate limiting, input validation
   - No single point of failure

2. **Least Privilege**
   - Customer instances can only access their own data
   - Admin token required for cross-customer operations

3. **Fail Secure**
   - Missing auth = 401 Unauthorized
   - Invalid credentials = no information disclosure
   - Rate limit exceeded = 429 Too Many Requests

4. **Audit Trail**
   - Log all authentication attempts
   - Track API key usage (last_used timestamp)
   - Monitor failed auth patterns

---

## 🔐 Secrets Management

### Development (.env file)
```bash
# Billing service
ADMIN_API_TOKEN=<64-char-hex>
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
DATABASE_URL=postgresql://...
```

### Production (Use Secrets Manager)
- AWS Secrets Manager
- Azure Key Vault
- Kubernetes Secrets
- HashiCorp Vault

**Never commit secrets to git!**

---

## 🚀 Deployment Workflow

1. **Local Development**
   - Use test Stripe keys
   - Use simple admin token
   - No HTTPS required

2. **Staging**
   - Use test Stripe keys
   - Use strong admin token
   - HTTPS recommended
   - Test authentication flows

3. **Production**
   - Use live Stripe keys
   - Use production admin token (rotate monthly)
   - HTTPS required
   - Monitor authentication failures
   - Set up alerts

---

## 📊 Monitoring & Alerts

### Metrics to Track
- Failed authentication rate
- Rate limit hits
- API response times
- Database connection pool usage
- Webhook delivery success rate

### Alert Thresholds
- 401/403 rate >5% → Potential attack or misconfiguration
- 500 errors >0.1% → Application errors
- Response time >1s → Performance issue
- Failed webhooks >10% → Stripe connectivity issue

---

## 🆘 Emergency Response

### Compromised API Key
1. Call `CustomerModel.revokeApiKey(customerId)`
2. Generate new key
3. Update customer instance immediately
4. Monitor for unauthorized usage

### Compromised Admin Token
1. Generate new token: `openssl rand -hex 32`
2. Update billing service .env
3. Restart billing service
4. Update all management scripts

### Data Breach
1. Identify scope (which customers affected)
2. Notify affected customers (GDPR requirement)
3. Rotate all credentials
4. Review audit logs
5. Patch vulnerability
6. Document incident

---

## ✅ Production Readiness Checklist

- [ ] Install security dependencies (bcrypt, express-rate-limit, helmet)
- [ ] Run database migration (API key columns)
- [ ] Generate and set ADMIN_API_TOKEN
- [ ] Enable authentication middleware on all routes
- [ ] Generate API keys for all customers
- [ ] Update customer instances with API keys
- [ ] Enable rate limiting
- [ ] Add security headers (helmet)
- [ ] Configure HTTPS/TLS
- [ ] Set up Stripe webhook with secret
- [ ] Test all authentication flows
- [ ] Run security audit (`npm audit`)
- [ ] Set up monitoring and alerts
- [ ] Document emergency procedures
- [ ] Train team on security practices

**Do not deploy to production until all items are checked!**

---

## 📞 Need Help?

See detailed guides:
- `docs/SECURITY.md` - Complete security documentation
- `docs/SECURITY-SETUP.md` - Step-by-step setup guide
- `src/middleware/auth.ts` - Authentication implementation
- `src/middleware/rate-limit.ts` - Rate limiting configuration

Questions? Issues? Create a GitHub issue or contact security team.
