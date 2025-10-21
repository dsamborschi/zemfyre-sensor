# Security Considerations for Billing System

## 🔒 Authentication & Authorization

### Current State: ⚠️ CRITICAL - NO AUTHENTICATION

**All billing endpoints are currently PUBLIC**. This must be fixed before production deployment.

---

## 🛡️ Required Security Implementations

### 1. **API Key Authentication** (IMMEDIATE - Critical)

#### For Customer Instances (api/ calling billing/)

**Implementation:**
- Add `X-API-Key` header to all customer requests
- Format: `cust_<customer_id>_<secret_token>`
- Store API keys in `customers` table (hashed with bcrypt)
- Validate on every request to protected endpoints

**Endpoints requiring customer auth:**
- `POST /api/usage/report` - Usage reporting
- `GET /api/licenses/:customerId` - License retrieval
- `GET /api/subscriptions/:customerId` - Subscription details
- `POST /api/subscriptions/checkout` - Create checkout session

**Setup:**
```typescript
// In billing/src/middleware/auth.ts
export function authenticateCustomer(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  // Verify API key against database
  // Attach customerId to request
}
```

**Customer instance usage:**
```typescript
// In api/src/services/billing-client.ts
this.client = axios.create({
  baseURL: this.billingApiUrl,
  headers: {
    'X-API-Key': process.env.BILLING_API_KEY, // Customer-specific key
  },
});
```

#### For Admin Operations (Management scripts)

**Implementation:**
- Use `Authorization: Bearer <admin_token>` header
- Generate strong admin token: `openssl rand -hex 32`
- Store in environment: `ADMIN_API_TOKEN`
- Required for all admin operations

**Endpoints requiring admin auth:**
- `POST /api/customers` - Create customer
- `GET /api/customers` - List customers
- `PATCH /api/customers/:id` - Update customer
- `DELETE /api/usage/cleanup` - Clean up old data

**Setup:**
```bash
# Generate admin token
openssl rand -hex 32

# Add to .env
ADMIN_API_TOKEN=your_secure_admin_token_here
```

---

### 2. **Rate Limiting** (HIGH Priority)

**Install:**
```bash
npm install express-rate-limit
```

**Implementation:**
- General API: 100 req/15min per IP
- Usage reporting: 60 req/hour per customer
- Webhooks: 100 req/min (Stripe)
- Admin operations: 10 req/hour per IP

**Apply to routes:**
```typescript
import { apiLimiter, usageLimiter, webhookLimiter } from './middleware/rate-limit';

app.use('/api/usage', usageLimiter, usageRouter);
app.use('/api/webhooks', webhookLimiter, webhooksRouter);
app.use('/api', apiLimiter);
```

---

### 3. **Webhook Signature Verification** (CRITICAL)

**Status:** ✅ Already implemented

Your webhook handler already verifies Stripe signatures:
```typescript
const event = StripeService.constructWebhookEvent(req.body, signature);
```

**Requirements:**
- `STRIPE_WEBHOOK_SECRET` must be set (from Stripe dashboard)
- Raw body middleware must be used (already implemented)
- Never disable signature verification in production

---

### 4. **HTTPS/TLS** (CRITICAL for Production)

**Requirements:**
- All production traffic must use HTTPS
- Stripe requires HTTPS for webhooks
- Use valid SSL certificate (Let's Encrypt, CloudFlare, etc.)

**Setup with Nginx:**
```nginx
server {
    listen 443 ssl http2;
    server_name billing.zemfyre.com;

    ssl_certificate /etc/letsencrypt/live/billing.zemfyre.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/billing.zemfyre.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3100;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

### 5. **Database Security**

#### Connection Security
```typescript
// Use SSL for production database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: true }
    : false,
});
```

#### SQL Injection Prevention
- ✅ Already using parameterized queries (Knex.js)
- ✅ Never concatenate user input into SQL

#### Sensitive Data
- ✅ Stripe API keys in environment variables (not code)
- ✅ License RSA keys stored separately
- ⚠️ Consider encrypting sensitive customer data at rest

---

### 6. **CORS Configuration**

**Current:** Wide open (`app.use(cors())`)

**Production recommendation:**
```typescript
app.use(cors({
  origin: [
    'https://customer-instance-1.com',
    'https://customer-instance-2.com',
    'https://dashboard.zemfyre.com', // Admin dashboard
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));
```

---

### 7. **Input Validation**

**Install validation library:**
```bash
npm install joi
npm install --save-dev @types/joi
```

**Example validation:**
```typescript
import Joi from 'joi';

const customerSchema = Joi.object({
  email: Joi.string().email().required(),
  company_name: Joi.string().max(255).optional(),
});

router.post('/', async (req, res) => {
  const { error } = customerSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  // ... proceed
});
```

---

### 8. **Audit Logging**

**Log all sensitive operations:**
```typescript
// Log format
{
  timestamp: '2025-10-21T10:30:00Z',
  event: 'customer.created',
  actor: 'admin_token_id',
  subject: 'cust_abc123',
  ip: '192.168.1.1',
  metadata: { plan: 'starter' }
}
```

**What to log:**
- Customer creation/modification
- Subscription changes
- License generation
- API key generation/revocation
- Failed authentication attempts
- Usage reporting anomalies

---

### 9. **Secrets Management**

**Development:**
- Use `.env` file (gitignored)
- Never commit secrets to git

**Production:**
- Use secret management service:
  - AWS Secrets Manager
  - Azure Key Vault
  - HashiCorp Vault
  - Kubernetes Secrets
- Rotate secrets regularly (90 days)

**Required secrets:**
```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Admin access
ADMIN_API_TOKEN=<64-char-hex>

# Database
DATABASE_URL=postgresql://user:pass@host:5432/billing

# License keys (RSA private key)
LICENSE_PRIVATE_KEY_PATH=/secrets/license_key.pem
```

---

### 10. **Network Security**

**Firewall rules:**
- Allow inbound: 443 (HTTPS) only
- Block direct access to port 3100
- Use reverse proxy (Nginx)

**VPC/Network isolation (if on cloud):**
- Billing service in private subnet
- Database in isolated subnet (no internet)
- Only Nginx in public subnet

---

## 🚨 Security Checklist Before Production

- [ ] **Authentication implemented** (API keys + admin tokens)
- [ ] **Rate limiting enabled** (express-rate-limit)
- [ ] **HTTPS/TLS configured** (valid SSL certificate)
- [ ] **CORS restricted** (whitelist customer domains)
- [ ] **Database uses SSL** (encrypted connections)
- [ ] **Stripe webhook secret set** (signature verification)
- [ ] **Input validation added** (Joi or similar)
- [ ] **Audit logging implemented** (track sensitive operations)
- [ ] **Secrets in vault** (not .env in production)
- [ ] **Security headers** (Helmet.js)
- [ ] **SQL injection prevention** (parameterized queries - ✅ done)
- [ ] **XSS prevention** (sanitize inputs)
- [ ] **Dependency scanning** (`npm audit`)
- [ ] **Container security** (non-root user, minimal image)
- [ ] **Backup strategy** (database + secrets)
- [ ] **Incident response plan** (breach procedures)

---

## 📋 Immediate Action Items

### 1. Add Authentication Middleware (TODAY)

```bash
cd billing
npm install bcrypt express-rate-limit helmet
npm install --save-dev @types/bcrypt
```

### 2. Update Routes with Auth

```typescript
// src/index.ts
import { authenticateAdmin, authenticateCustomer } from './middleware/auth';
import { apiLimiter, usageLimiter } from './middleware/rate-limit';
import helmet from 'helmet';

app.use(helmet()); // Security headers

// Public routes
app.use('/health', healthRouter);
app.use('/api/webhooks', webhookLimiter, webhooksRouter);

// Customer routes (require API key)
app.use('/api/usage', usageLimiter, authenticateCustomer, usageRouter);
app.use('/api/licenses', authenticateCustomer, licensesRouter);
app.use('/api/subscriptions', authenticateCustomer, subscriptionsRouter);

// Admin routes (require admin token)
app.use('/api/customers', apiLimiter, authenticateAdmin, customersRouter);
```

### 3. Generate API Keys for Customers

Add to customer creation:
```typescript
import { generateApiKey } from './middleware/auth';

const customer = await CustomerModel.create({ email, company_name });
const apiKey = generateApiKey(customer.customer_id);

// Store hashed API key in database
await CustomerModel.updateApiKey(customer.customer_id, apiKey);

// Return API key ONCE (cannot be retrieved later)
res.json({
  customer,
  api_key: apiKey, // Customer must save this!
});
```

### 4. Update Customer Instance Configuration

```bash
# In api/.env
BILLING_API_KEY=cust_abc123_<secret_token_from_billing>
```

### 5. Update BillingClient

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

## 🔐 Additional Recommendations

### Data Retention
- Delete usage reports older than 90 days (already implemented)
- Archive old customer data (GDPR compliance)

### Compliance
- **PCI DSS**: Never store credit card data (Stripe handles this ✅)
- **GDPR**: Add customer data export/deletion endpoints
- **SOC 2**: Implement audit logging and access controls

### Monitoring
- Alert on failed authentication attempts (>10/hour)
- Monitor unusual usage patterns
- Track API error rates
- Set up uptime monitoring (e.g., Pingdom, UptimeRobot)

### Disaster Recovery
- Automated database backups (daily)
- Test restore procedures monthly
- Document recovery steps
- Multi-region deployment for high availability

---

## 📚 Security Resources

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Stripe Security Best Practices](https://stripe.com/docs/security/guide)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
