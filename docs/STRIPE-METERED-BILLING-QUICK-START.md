# Stripe Metered Billing - Quick Start

## ⚡ 5-Minute Setup

### 1. Create Metered Price in Stripe (2 min)

1. Go to [Stripe Dashboard → Products](https://dashboard.stripe.com/test/products)
2. Select your product (e.g., "Starter Plan")
3. Click **Add another price**
4. Configure:
   ```
   Price model: Usage is metered
   Unit label: device
   Billing period: Monthly
   Charge by: Sum of usage values
   Price: $5.00 per device
   Lookup key: device_usage  ← MUST match this exactly!
   ```
5. Click **Add price**

### 2. Update Subscription Creation (1 min)

When creating subscriptions, include the metered price:

```typescript
// billing/src/routes/customers.ts - in signup handler
const subscription = await stripe.subscriptions.create({
  customer: stripeCustomer.id,
  items: [
    { price: 'price_base_monthly' },      // Base $29/month
    { price: 'price_device_usage' }        // Metered devices
  ],
  trial_period_days: 14
});
```

### 3. Enable in Customer Deployment (1 min)

```yaml
# charts/customer-instance/values.yaml
billingExporter:
  env:
    ENABLE_USAGE_REPORTING: "true"
```

### 4. Test (1 min)

```powershell
cd billing/scripts
.\test-metered-billing.ps1 -CustomerId "cust_abc123..."
```

## 📊 Usage Reporting Flow

```
Every hour:
billing-exporter → counts devices → POST /api/usage/report → Stripe API
```

## 🧪 Manual Test

```bash
curl -X POST http://localhost:3100/api/usage/report \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_abc123...",
    "metrics": {
      "devices": 5,
      "mqtt_messages": 10000,
      "storage_gb": 3.2
    }
  }'
```

## 📈 Verify in Stripe

1. Dashboard → Customers → Find customer
2. Click subscription
3. See "Usage-based charges" section
4. Should show: `5 devices × $5.00 = $25.00`

## 💡 Pricing Examples

### Starter Plan
- Base: $29/month (includes 5 devices)
- Additional: $5/device

**Example:** 8 devices = $29 + (3 × $5) = **$44/month**

### Professional Plan
- Base: $99/month (includes 20 devices)
- Additional: $4/device

**Example:** 25 devices = $99 + (5 × $4) = **$119/month**

## 🔑 Important Lookup Keys

These **MUST** match in Stripe and code:

```
device_usage      ← Device count
mqtt_messages     ← MQTT message volume
storage_gb        ← Storage usage
```

## 🐛 Troubleshooting

**Usage not showing in Stripe?**
1. Check lookup key matches exactly
2. Verify subscription has metered price
3. Check `ENABLE_USAGE_REPORTING=true`
4. View logs: `kubectl logs -n customer-xxx deployment/billing-exporter`

**Double counting?**
- Use `action: 'set'` for devices (overwrites)
- Use `action: 'increment'` for messages (accumulates)

## 📚 Full Documentation

See: `docs/STRIPE-METERED-BILLING-GUIDE.md`
