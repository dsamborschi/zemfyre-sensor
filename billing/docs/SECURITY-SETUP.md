# Quick Security Setup Guide

## 🚨 Current Status: INSECURE - Authentication Required Before Production

---

## Step 1: Install Security Dependencies

```bash
cd billing
npm install bcrypt express-rate-limit helmet
npm install --save-dev @types/bcrypt
```

---

## Step 2: Run Database Migration

```bash
# Add API key columns to customers table
cd billing
npx knex migrate:latest
```

---

## Step 3: Generate Admin Token

```bash
# Generate secure admin token (64-char hex)
openssl rand -hex 32

# Output example: a1b2c3d4e5f6...

# Add to billing/.env
echo "ADMIN_API_TOKEN=<your_generated_token>" >> .env
```

---

## Step 4: Update Billing Service

### Enable authentication middleware:

```typescript
// billing/src/index.ts
import { authenticateAdmin, authenticateCustomer } from './middleware/auth';
import { apiLimiter, usageLimiter, webhookLimiter } from './middleware/rate-limit';
import helmet from 'helmet';

// Add security headers
app.use(helmet());

// Public routes (no auth)
app.get('/health', ...);
app.use('/api/webhooks', webhookLimiter, webhooksRouter);

// Customer routes (require X-API-Key header)
app.use('/api/usage', usageLimiter, authenticateCustomer, usageRouter);
app.use('/api/licenses', authenticateCustomer, licensesRouter);
app.use('/api/subscriptions', authenticateCustomer, subscriptionsRouter);

// Admin routes (require Authorization: Bearer <token>)
app.use('/api/customers', apiLimiter, authenticateAdmin, customersRouter);
```

---

## Step 5: Update Customer Creation

### When creating a customer, generate and return API key:

```typescript
// billing/src/routes/customers.ts
import { generateApiKey } from '../middleware/auth';
import { CustomerModel } from '../db/customer-model';

router.post('/', authenticateAdmin, async (req, res) => {
  // Create customer
  const customer = await CustomerModel.create({ email, company_name });

  // Generate API key
  const apiKey = generateApiKey(customer.customer_id);
  
  // Store hashed version in database
  await CustomerModel.setApiKey(customer.customer_id, apiKey);

  // Return API key ONCE (cannot be retrieved later)
  res.status(201).json({
    customer,
    subscription,
    license,
    api_key: apiKey, // Customer must save this!
  });
});
```

---

## Step 6: Update Management Scripts

### Add admin token to script calls:

```typescript
// billing/scripts/customer-manager.ts
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN;

const response = await axios.post(
  `${BILLING_API_URL}/api/customers`,
  customerData,
  {
    headers: {
      'Authorization': `Bearer ${ADMIN_TOKEN}`,
    },
  }
);
```

---

## Step 7: Configure Customer Instance

### On customer's server (api/.env):

```bash
# API key received when customer was created
BILLING_API_KEY=cust_abc123xyz_secrettoken456

# Update BillingClient to use API key
```

### Update api/src/services/billing-client.ts:

```typescript
this.client = axios.create({
  baseURL: this.billingApiUrl,
  headers: {
    'X-API-Key': process.env.BILLING_API_KEY,
  },
});
```

---

## Step 8: Test Authentication

### Test admin endpoint:

```bash
# Without token (should fail)
curl http://localhost:3100/api/customers

# With token (should succeed)
curl -H "Authorization: Bearer <your_admin_token>" \
  http://localhost:3100/api/customers
```

### Test customer endpoint:

```bash
# Without API key (should fail)
curl http://localhost:3100/api/licenses/cust_abc123

# With API key (should succeed)
curl -H "X-API-Key: cust_abc123_secrettoken" \
  http://localhost:3100/api/licenses/cust_abc123
```

---

## Step 9: Enable HTTPS (Production Only)

### Option A: Nginx Reverse Proxy

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
        proxy_set_header Host $host;
    }
}
```

### Option B: Kubernetes Ingress with cert-manager

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: billing-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - billing.zemfyre.com
    secretName: billing-tls
  rules:
  - host: billing.zemfyre.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: billing
            port:
              number: 3100
```

---

## Step 10: Configure Stripe Webhook

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://billing.zemfyre.com/api/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy webhook signing secret
5. Add to .env: `STRIPE_WEBHOOK_SECRET=whsec_...`

---

## Environment Variables Checklist

### billing/.env (Production)

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/billing

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Admin access
ADMIN_API_TOKEN=<64-char-hex-token>

# License keys
LICENSE_PRIVATE_KEY_PATH=/secrets/license_key.pem
LICENSE_PUBLIC_KEY_PATH=/secrets/license_key.pub

# Server
PORT=3100
NODE_ENV=production
```

### api/.env (Customer Instance)

```bash
# Billing integration
BILLING_API_URL=https://billing.zemfyre.com
BILLING_API_KEY=cust_abc123_<secret_from_customer_creation>
CUSTOMER_ID=cust_abc123
```

---

## Security Validation

Run these tests before going live:

```bash
# 1. Test rate limiting
for i in {1..150}; do curl http://localhost:3100/health; done
# Should see 429 errors after 100 requests

# 2. Test authentication
curl http://localhost:3100/api/customers
# Should return 401 Unauthorized

# 3. Test webhook signature
curl -X POST http://localhost:3100/api/webhooks/stripe \
  -H "Content-Type: application/json" \
  -d '{"type":"test"}'
# Should return 400 Missing stripe-signature

# 4. Test HTTPS redirect
curl -I http://billing.zemfyre.com
# Should return 301 or 308 redirect to https://

# 5. Run security audit
npm audit
# Should report 0 vulnerabilities
```

---

## Post-Deployment Monitoring

Monitor these metrics:

- **Failed authentication attempts** (>10/hour = potential attack)
- **Rate limit hits** (adjust limits if legitimate traffic)
- **Webhook delivery failures** (check Stripe dashboard)
- **API response times** (should be <200ms for most endpoints)
- **Database connection pool** (should not exhaust connections)

Set up alerts for:
- 401/403 response rate >5%
- 500 errors >0.1%
- Response time >1s
- Database connection failures

---

## Emergency Procedures

### Rotate compromised API key:

```bash
# 1. Revoke old key
curl -X DELETE -H "Authorization: Bearer <admin_token>" \
  http://billing.zemfyre.com/api/customers/cust_abc123/api-key

# 2. Generate new key
curl -X POST -H "Authorization: Bearer <admin_token>" \
  http://billing.zemfyre.com/api/customers/cust_abc123/api-key

# 3. Update customer instance immediately
# Update api/.env with new BILLING_API_KEY
# Restart customer instance
```

### Rotate admin token:

```bash
# 1. Generate new token
openssl rand -hex 32

# 2. Update billing/.env
# 3. Restart billing service
# 4. Update all admin scripts/tools
```

---

## Next Steps

1. ✅ Install dependencies
2. ✅ Run migrations
3. ✅ Generate admin token
4. ✅ Enable authentication middleware
5. ✅ Test locally
6. ⏳ Deploy to staging
7. ⏳ Security audit
8. ⏳ Deploy to production with HTTPS
9. ⏳ Configure Stripe webhooks
10. ⏳ Monitor for 24 hours

**Do not deploy to production until all checkboxes are complete!**
