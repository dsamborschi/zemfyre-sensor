# Metered Billing for Existing Plans

## Your Current Plan Structure

You already have feature-based plans with device limits:

| Plan | Base Price | Included Devices | Overage Price |
|------|-----------|------------------|---------------|
| **Starter** | $29/month | 5 devices | **$5/device** |
| **Professional** | $99/month | 50 devices | **$4/device** |
| **Enterprise** | $499/month | Unlimited | **No overages** |

## How It Works

### Metered Billing = Overages on Top of Base Plans

1. **Customer subscribes to Starter** ($29/month base)
2. **Adds metered "device_usage" price** ($5/device over limit)
3. **Usage is reported hourly** from their K8s instance
4. **Stripe calculates overages automatically**:
   - 5 devices or less → Only $29 (base price)
   - 8 devices → $29 + (3 × $5) = $44
   - 10 devices → $29 + (5 × $5) = $54

### Why This is Better Than Fixed Tiers

**Before (without metered billing):**
- Customer with 6 devices forced to upgrade from Starter ($29) to Pro ($99)
- Waste: Paying for 50 devices when they only need 6

**After (with metered billing):**
- Customer with 6 devices stays on Starter
- Pays $29 + (1 × $5) = $34/month
- Fair pricing for actual usage

## Implementation for Your Platform

### Step 1: Create Metered Prices in Stripe

#### For Starter Plan

1. Go to Stripe Dashboard → Your "Starter Plan" product
2. Add new price:
   ```
   Price model: Usage is metered
   Unit label: device
   Billing period: Monthly
   Charge by: Sum of usage values during period
   Price: $5.00 per device
   Lookup key: device_usage_starter
   ```

#### For Professional Plan

1. Go to your "Professional Plan" product
2. Add new price:
   ```
   Price model: Usage is metered
   Unit label: device
   Billing period: Monthly
   Charge by: Sum of usage values during period
   Price: $4.00 per device
   Lookup key: device_usage_professional
   ```

#### For Enterprise Plan

**No metered price needed** - unlimited devices included!

### Step 2: Update Subscription Creation

Modify your subscription creation to include metered prices:

```typescript
// billing/src/services/stripe-service.ts

async createSubscription(params: CreateSubscriptionParams) {
  const { customerId, plan } = params;
  
  // Get base price ID for the plan
  const basePriceId = STRIPE_PRICES[plan];
  
  // Build subscription items
  const subscriptionItems: Stripe.SubscriptionCreateParams.Item[] = [
    {
      price: basePriceId  // Base plan price
    }
  ];
  
  // Add metered device price for Starter and Professional
  if (plan === 'starter') {
    subscriptionItems.push({
      price: process.env.STRIPE_PRICE_DEVICE_USAGE_STARTER || 'price_device_starter'
    });
  } else if (plan === 'professional') {
    subscriptionItems.push({
      price: process.env.STRIPE_PRICE_DEVICE_USAGE_PRO || 'price_device_pro'
    });
  }
  // Enterprise: No metered price - unlimited devices
  
  // Create subscription
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: subscriptionItems,
    trial_period_days: 14,
    metadata: {
      plan,
      customer_id: params.iotisticCustomerId
    }
  });
  
  return subscription;
}
```

### Step 3: Smart Usage Reporting

Report **only overage devices** to Stripe:

```typescript
// billing/src/routes/usage.ts - Enhanced logic

router.post('/report', async (req, res) => {
  const { customer_id, metrics } = req.body;
  const actualDevices = metrics.devices;
  
  // Get customer and their plan
  const customer = await CustomerModel.getById(customer_id);
  const subscription = await SubscriptionModel.getByCustomerId(customer_id);
  
  // Get plan limits
  const planLimits = {
    starter: 5,
    professional: 50,
    enterprise: Infinity
  };
  
  const includedDevices = planLimits[subscription.plan];
  const overageDevices = Math.max(0, actualDevices - includedDevices);
  
  console.log(`Plan: ${subscription.plan}, Devices: ${actualDevices}, Included: ${includedDevices}, Overage: ${overageDevices}`);
  
  // Report ONLY overages to Stripe
  if (overageDevices > 0 && subscription.plan !== 'enterprise') {
    const stripeSubscription = await stripe.subscriptions.retrieve(
      customer.stripe_subscription_id
    );
    
    const deviceItem = stripeSubscription.items.data.find(
      item => item.price.lookup_key === `device_usage_${subscription.plan}`
    );
    
    if (deviceItem) {
      await stripe.subscriptionItems.createUsageRecord(deviceItem.id, {
        quantity: overageDevices,  // Report only overages
        timestamp: Math.floor(Date.now() / 1000),
        action: 'set'
      });
      
      console.log(`✅ Reported ${overageDevices} overage devices to Stripe`);
    }
  }
  
  res.json({ success: true, overage_devices: overageDevices });
});
```

### Step 4: Environment Variables

Add to your `.env`:

```bash
# Stripe Price IDs for base plans
STRIPE_PRICE_STARTER=price_1234...
STRIPE_PRICE_PROFESSIONAL=price_5678...
STRIPE_PRICE_ENTERPRISE=price_9012...

# Stripe Price IDs for metered device usage
STRIPE_PRICE_DEVICE_USAGE_STARTER=price_device_starter_abc...
STRIPE_PRICE_DEVICE_USAGE_PRO=price_device_pro_def...
# No Enterprise metered price - unlimited devices
```

## Pricing Examples

### Example 1: Starter Customer with 8 Devices

**Monthly Bill:**
```
Starter Base Plan            $29.00
Included: 5 devices
─────────────────────────────────
Overage: 3 devices × $5      $15.00
─────────────────────────────────
Total                        $44.00
```

### Example 2: Professional Customer with 75 Devices

**Monthly Bill:**
```
Professional Base Plan       $99.00
Included: 50 devices
─────────────────────────────────
Overage: 25 devices × $4    $100.00
─────────────────────────────────
Total                       $199.00
```

### Example 3: Enterprise Customer with 500 Devices

**Monthly Bill:**
```
Enterprise Base Plan        $499.00
Included: Unlimited devices
─────────────────────────────────
Overage: None                 $0.00
─────────────────────────────────
Total                       $499.00
```

## Testing

### 1. Test Starter Plan Overage

```powershell
cd c:\Users\Dan\zemfyre-sensor\billing\scripts

# Report 8 devices for Starter customer (5 included + 3 overage)
.\test-metered-billing.ps1 -CustomerId "cust_starter..." -DeviceCount 8
```

**Expected in Stripe:**
- Device usage: 3 devices
- Upcoming invoice: $29 + (3 × $5) = $44

### 2. Test Professional Plan Overage

```powershell
# Report 75 devices for Pro customer (50 included + 25 overage)
.\test-metered-billing.ps1 -CustomerId "cust_pro..." -DeviceCount 75
```

**Expected in Stripe:**
- Device usage: 25 devices
- Upcoming invoice: $99 + (25 × $4) = $199

### 3. Test Enterprise (No Overage)

```powershell
# Report 500 devices for Enterprise (all included)
.\test-metered-billing.ps1 -CustomerId "cust_enterprise..." -DeviceCount 500
```

**Expected in Stripe:**
- Device usage: Not reported (unlimited plan)
- Upcoming invoice: $499 (base only)

## Customer Communication

### Invoice Email Example

```
Your October 2025 Invoice

Starter Plan                             $29.00
  • 5 devices included

Additional Device Usage                  $15.00
  • 3 devices over plan limit
  • $5.00 per device

Total                                    $44.00
```

### Portal Message

When customer logs in to portal:

```
Current Usage (Oct 1 - Oct 31)

Devices: 8 of 5 included
  ✓ 5 devices included in plan
  ⚠ 3 additional devices at $5.00 each

Estimated additional charge: $15.00
Need more devices? Upgrade to Professional for 50 included devices.
```

## Upgrade Paths

### Smart Upgrade Logic

When customer consistently exceeds limits:

```typescript
// Auto-suggest upgrade when overages > 50% of base price for 3 months

if (overageDevices >= 7) {
  // 7 devices × $5 = $35 overage
  // $35 > 50% of $29 base price
  // Suggest upgrade to Professional ($99 for 50 devices)
  
  sendUpgradeEmail({
    message: "You're paying $44/month for 8 devices. " +
             "Upgrade to Professional for $99/month and get 50 devices!"
  });
}
```

## Benefits vs. Traditional Tiered Pricing

| Scenario | Traditional Tiers | With Metered Billing |
|----------|------------------|---------------------|
| 6 devices | Force upgrade to Pro ($99) | Stay on Starter ($29 + $5 = $34) |
| 10 devices | Stuck on Pro ($99) | Starter + overages ($29 + $25 = $54) |
| 55 devices | Force upgrade to Enterprise ($499) | Pro + overages ($99 + $20 = $119) |

**Result:** Fair pricing + happier customers + more revenue from mid-tier usage

## Production Checklist

- [ ] Create metered prices in Stripe for Starter and Pro
- [ ] Copy price IDs to environment variables
- [ ] Update subscription creation to include metered prices
- [ ] Implement overage calculation (devices - plan limit)
- [ ] Test with trial customers (all 3 plans)
- [ ] Verify upcoming invoices show correct overages
- [ ] Update customer-facing pricing page
- [ ] Add usage dashboard to customer portal
- [ ] Set up billing alerts (e.g., approaching limits)

## Next: Optional Metered Services

Once device overages are working, you can add:

### MQTT Message Metering (All Plans)

```
All plans: First 1M messages included
Additional: $0.10 per 1,000 messages
```

### Storage Metering (Starter/Pro)

```
Starter: 10GB included, $0.50/GB overage
Professional: 100GB included, $0.40/GB overage
Enterprise: Unlimited
```

Would you like me to implement the overage calculation logic for device count?
