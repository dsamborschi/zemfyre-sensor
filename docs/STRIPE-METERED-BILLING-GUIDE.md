# Stripe Metered Billing Implementation Guide

Complete guide to setting up and using metered billing with Stripe for the Iotistic IoT platform.

## Overview

This implementation adds **usage-based billing** on top of the existing subscription model, allowing you to charge customers based on:
- **Device count** - Number of active IoT devices
- **MQTT messages** - Volume of MQTT messages processed (optional)
- **Storage usage** - Database and time-series storage in GB (optional)

## Architecture

```
Customer Instance (K8s)
  └─ billing-exporter
       ├─ Collects metrics from Prometheus
       ├─ Counts devices from API
       └─ Reports to Billing API

Billing Service
  └─ /api/usage/report endpoint
       ├─ Stores usage in database
       └─ Reports to Stripe via API
```

## Step 1: Create Metered Prices in Stripe Dashboard

### 1.1 Create Device Usage Price

1. Go to **Stripe Dashboard** → **Products** → Click your product (e.g., "Starter Plan")
2. Click **Add another price**
3. Configure:
   - **Price model**: `Usage is metered`
   - **Unit label**: `device`
   - **Billing period**: `Monthly`
   - **Charge for metered usage by**: `Sum of usage values during period`
   - **Price**: `$5.00` per device (or your desired price)
   - **Lookup key**: `device_usage` (IMPORTANT - this matches the code!)

4. Click **Add price**

### 1.2 Create MQTT Messages Price (Optional)

1. Add another price to the same product
2. Configure:
   - **Price model**: `Usage is metered`
   - **Unit label**: `thousand messages`
   - **Billing period**: `Monthly`
   - **Charge for metered usage by**: `Sum of usage values during period`
   - **Price**: `$0.10` per 1,000 messages
   - **Lookup key**: `mqtt_messages`
   - **Transform usage**: Check "Divide usage by 1000" (reports messages, bills per thousand)

3. Click **Add price**

### 1.3 Create Storage Price (Optional)

1. Add another price
2. Configure:
   - **Price model**: `Usage is metered`
   - **Unit label**: `GB`
   - **Billing period**: `Monthly`
   - **Charge for metered usage by**: `Maximum usage during period` (peak storage)
   - **Price**: `$0.50` per GB
   - **Lookup key**: `storage_gb`

3. Click **Add price**

### 1.4 Update Subscription Creation

Now when creating subscriptions, include both the base price AND metered prices:

```typescript
// In billing/src/services/stripe-service.ts or signup flow

const subscription = await stripe.subscriptions.create({
  customer: stripeCustomer.id,
  items: [
    {
      price: basePriceId, // e.g., "price_1234..." for $29/month base
    },
    {
      price: devicePriceId, // Price ID for device_usage
    },
    // Optionally add mqtt_messages and storage_gb prices
  ],
  trial_period_days: 14,
  metadata: {
    customer_id: customerId,
    plan: 'starter'
  }
});
```

## Step 2: Enable Usage Reporting in Customer Instances

### 2.1 Update Helm Chart Values

Add to `charts/customer-instance/values.yaml`:

```yaml
billingExporter:
  enabled: true
  env:
    ENABLE_USAGE_REPORTING: "true"  # Enable metered billing
    COLLECTION_INTERVAL: "3600000"   # Report every hour (ms)
```

### 2.2 Update Deployment (if not using Helm)

Add environment variable to billing-exporter deployment:

```yaml
env:
  - name: ENABLE_USAGE_REPORTING
    value: "true"
  - name: CUSTOMER_ID
    value: "cust_abc123..."
  - name: BILLING_API_URL
    value: "http://billing:3100"
```

## Step 3: Test Usage Reporting

### 3.1 Manual Test via API

```bash
# Report usage for a customer
curl -X POST http://localhost:3100/api/usage/report \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_abc123...",
    "instance_id": "k8s-cluster-1",
    "active_devices": 3,
    "total_devices": 5,
    "metrics": {
      "devices": 3,
      "mqtt_messages": 15000,
      "storage_gb": 2.5
    }
  }'

# Response:
{
  "message": "Usage reported successfully",
  "stripe_reported": true,
  "report": { ... }
}
```

### 3.2 Verify in Stripe Dashboard

1. Go to **Customers** → Find your test customer
2. Click on their subscription
3. Scroll to **Usage-based charges**
4. You should see:
   - Device usage: 3 devices
   - MQTT messages: 15 (if you enabled it with 1000 divisor)
   - Storage: 3 GB (rounded up from 2.5)

### 3.3 Check Billing Exporter Logs

```bash
# View logs from billing-exporter
kubectl logs -n customer-abc123 deployment/billing-exporter --tail=50

# Look for:
# ✅ Reported device usage to Stripe
# ✅ Usage metrics reported { devices: 3, mqtt_messages: 15000 }
```

## Step 4: Pricing Examples

### Starter Plan with Metered Devices
```
Base: $29/month
Includes: 5 devices
Additional devices: $5/device

Example bill for 8 devices:
- Base fee: $29.00
- 3 additional devices × $5.00: $15.00
- Total: $44.00/month
```

### Professional Plan with Messages
```
Base: $99/month
Includes: 20 devices, 1M messages
Additional devices: $4/device
Additional messages: $0.10/1000 messages

Example bill for 25 devices, 1.5M messages:
- Base fee: $99.00
- 5 additional devices × $4.00: $20.00
- 500,000 additional messages × $0.10/1000: $50.00
- Total: $169.00/month
```

## Step 5: Advanced Configuration

### 5.1 Tiered Pricing

Set up graduated pricing in Stripe:

1. Edit your device_usage price
2. Change to **Graduated pricing**:
   - Tier 1: 0-5 devices @ $10/device
   - Tier 2: 6-20 devices @ $8/device
   - Tier 3: 21+ devices @ $5/device

### 5.2 Package Pricing

Create a price with **Package pricing**:
- Package size: 10 devices
- Price per package: $40
- (Customer with 23 devices pays for 3 packages = $120)

### 5.3 Custom Reporting Interval

Change collection interval per customer:

```yaml
# In customer instance deployment
env:
  - name: COLLECTION_INTERVAL
    value: "1800000"  # 30 minutes for high-frequency customers
```

## Step 6: Invoice Preview & Customer Portal

### 6.1 Upcoming Invoice API

```typescript
// Get upcoming invoice with metered charges
const upcomingInvoice = await stripe.invoices.retrieveUpcoming({
  customer: stripeCustomerId
});

// Shows:
// - Base subscription: $29.00
// - Device usage (current period): $15.00
// - Total estimated: $44.00
```

### 6.2 Customer Portal

Stripe automatically shows metered usage in the customer portal:

1. Customer logs in
2. Sees current period usage:
   - "You've used 8 devices this month"
   - "Estimated additional charge: $15.00"

## Troubleshooting

### Usage Not Showing in Stripe

**Check:**
1. Lookup keys match exactly (`device_usage`, not `device-usage`)
2. Customer has an active subscription
3. Subscription includes the metered price
4. Billing exporter has `ENABLE_USAGE_REPORTING=true`

**Debug:**
```bash
# Check billing exporter logs
kubectl logs -n customer-abc123 deployment/billing-exporter

# Test manual reporting
curl -X POST http://localhost:3100/api/usage/report ...

# Check Stripe subscription items
curl https://api.stripe.com/v1/subscriptions/sub_abc123 \
  -u sk_test_...
```

### Duplicate Usage Records

**Solution:** Usage reporting uses `set` action for devices (not `increment`):
```typescript
action: 'set'  // ✅ Overwrites with current count
action: 'increment'  // ❌ Would add to previous value
```

### High Stripe API Usage

**Solution:** Reduce collection frequency:
```yaml
COLLECTION_INTERVAL: "86400000"  # Once per day (ms)
```

## Production Checklist

- [ ] Create production prices in Stripe (not test mode)
- [ ] Set appropriate per-unit prices
- [ ] Configure graduated/volume pricing if needed
- [ ] Test with trial customer first
- [ ] Enable usage reporting in customer deployments
- [ ] Set up monitoring for failed usage reports
- [ ] Add usage dashboard to customer portal
- [ ] Document pricing in customer-facing materials
- [ ] Set up alerts for unusual usage spikes
- [ ] Test billing cycle end-to-end (subscription + usage invoice)

## API Reference

### POST /api/usage/report

**Request:**
```json
{
  "customer_id": "cust_abc123...",
  "instance_id": "k8s-cluster-1",
  "active_devices": 3,
  "total_devices": 5,
  "metrics": {
    "devices": 3,
    "mqtt_messages": 15000,
    "storage_gb": 2.5,
    "api_requests": 50000
  }
}
```

**Response:**
```json
{
  "message": "Usage reported successfully",
  "stripe_reported": true,
  "report": {
    "id": 123,
    "customer_id": "cust_abc123...",
    "created_at": "2025-10-23T..."
  }
}
```

### GET /api/usage/:customerId

Get usage history for customer.

### GET /api/usage/:customerId/latest

Get latest usage report.

## Next Steps

1. **Set up metered prices** in Stripe Dashboard (Step 1)
2. **Deploy updated billing-exporter** with `ENABLE_USAGE_REPORTING=true`
3. **Test with trial customer** - verify usage appears in Stripe
4. **Monitor for 24-48 hours** - ensure reporting is reliable
5. **Roll out to all customers** - update Helm chart defaults
6. **Add usage dashboard** to customer portal (future enhancement)

## Resources

- [Stripe Metered Billing Docs](https://stripe.com/docs/billing/subscriptions/usage-based)
- [Stripe Usage Records API](https://stripe.com/docs/api/usage_records)
- [Billing Exporter Code](../billing-exporter/src/stripe-usage-reporter.ts)
- [Usage Routes Code](./src/routes/usage.ts)
