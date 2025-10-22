# Complete Stripe Checkout Flow Testing Guide

## Overview
This guide walks through testing the **complete customer journey** from scratch:
1. Create customer via API
2. Generate Stripe checkout session
3. Complete payment with test card
4. Verify webhook processing
5. Check subscription and license generation

---

## Prerequisites

1. **Services Running**:
```powershell
# In billing directory
docker-compose up -d

# Verify all services running
docker ps
# Should see: postgres, billing, billing-stripe-cli
```

2. **Test Data**: You can clear existing test data or keep it:
```powershell
# Optional: Clear test data
docker exec -it billing-postgres psql -U postgres -d billing -c "DELETE FROM subscriptions; DELETE FROM customers;"
```

---

## Step 1: Create Customer

Create a new customer to test the flow from scratch:

```powershell
# POST request to create customer
$body = @{
    email = "test@example.com"
    name = "Test User"
    company = "Test Company"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3100/api/customers" -Method POST -Body $body -ContentType "application/json"

# Save customer_id for next steps (use customer_id string, not id number)
$customerId = $response.customer.customer_id
Write-Host "Customer ID: $customerId"
Write-Host "Customer created with 14-day trial"
```

**Expected Response**:
```json
{
  "customer": {
    "id": "uuid-here",
    "email": "test@example.com",
    "name": "Test User",
    "company": "Test Company",
    "stripe_customer_id": "cus_xxxxx",
    "created_at": "2025-01-13T..."
  },
  "subscription": {
    "id": "uuid-here",
    "customer_id": "uuid-here",
    "plan": "starter",
    "status": "trial",
    "trial_end": "2025-01-27T...",
    ...
  },
  "license": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## Step 2: Generate Checkout Session

Create a Stripe checkout session for upgrading from trial to paid:

```powershell
# Use the customer_id from Step 1
$checkoutBody = @{
    customer_id = $customerId  # From previous step
    plan = "professional"  # Choose: starter, professional, enterprise
    success_url = "http://localhost:3100/success"
    cancel_url = "http://localhost:3100/cancel"
} | ConvertTo-Json

$checkout = Invoke-RestMethod -Uri "http://localhost:3100/api/subscriptions/checkout" -Method POST -Body $checkoutBody -ContentType "application/json"

Write-Host "Checkout URL: $($checkout.checkout_url)"
Write-Host "Session ID: $($checkout.session_id)"

# Open in browser
Start-Process $checkout.checkout_url
```

**Expected Response**:
```json
{
  "session_id": "cs_test_xxxxx",
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_xxxxx"
}
```

---

## Step 3: Complete Payment with Test Card

The checkout URL will open in your browser. Use Stripe's test card:

**Test Card Details**:
- **Card Number**: `4242 4242 4242 4242`
- **Expiry**: Any future date (e.g., `12/25`)
- **CVC**: Any 3 digits (e.g., `123`)
- **ZIP**: Any 5 digits (e.g., `12345`)

**What Happens**:
1. Enter test card details in Stripe Checkout
2. Click "Subscribe" or "Pay"
3. Stripe redirects to `success_url`
4. **Webhook fired**: `checkout.session.completed` → sent to billing service
5. Billing service processes webhook and updates database

---

## Step 4: Monitor Webhook Processing

Open a second PowerShell window to watch webhook logs:

```powershell
# Watch billing service logs in real-time
docker logs -f billing-billing-1
```

**Expected Log Output**:
```
🔔 Webhook received: checkout.session.completed
✅ Checkout session completed successfully
  Customer ID: cus_xxxxx
  Subscription ID: sub_xxxxx
  Status: active
```

You should also see Stripe CLI logs:
```powershell
docker logs -f billing-stripe-cli
```

**Expected Output**:
```
[200] POST http://billing:3100/api/webhooks/stripe [checkout.session.completed]
```

---

## Step 5: Verify Database Updates

Check that the subscription was updated correctly:

```powershell
# Get subscription details via API
$subscription = Invoke-RestMethod -Uri "http://localhost:3100/api/subscriptions/$customerId" -Method GET

Write-Host "Subscription Status: $($subscription.subscription.status)"
Write-Host "Subscription Plan: $($subscription.subscription.plan)"
Write-Host "Stripe Subscription ID: $($subscription.subscription.stripe_subscription_id)"
```

**Expected Output**:
```json
{
  "subscription": {
    "id": "uuid-here",
    "customer_id": "uuid-here",
    "plan": "professional",
    "status": "active",  // Changed from "trial"
    "stripe_subscription_id": "sub_xxxxx",  // Set by webhook
    "current_period_start": "2025-01-13T...",
    "current_period_end": "2025-02-13T...",
    "trial_end": null,
    "created_at": "2025-01-13T...",
    "updated_at": "2025-01-13T..."
  }
}
```

**Direct Database Check** (optional):
```powershell
docker exec -it billing-postgres psql -U postgres -d billing -c "SELECT id, plan, status, stripe_subscription_id FROM subscriptions WHERE customer_id = '$customerId';"
```

---

## Step 6: Get License JWT

Retrieve the updated license JWT:

```powershell
# Get license for customer
$license = Invoke-RestMethod -Uri "http://localhost:3100/api/licenses/$customerId" -Method GET

Write-Host "License JWT:"
Write-Host $license.license
Write-Host ""
Write-Host "Decoded License:"
$license.decoded | ConvertTo-Json -Depth 3
```

**Expected Output**:
```json
{
  "license": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "decoded": {
    "customer_id": "uuid-here",
    "email": "test@example.com",
    "plan": "professional",
    "features": {
      "max_devices": 20,
      "custom_dashboards": true,
      "api_access": true,
      "email_support": true,
      "priority_support": true,
      "phone_support": false,
      "sla": false
    },
    "status": "active",
    "trial": false,
    "trial_days_remaining": 0,
    "issued_at": 1736789123,
    "expires_at": 1739381123
  }
}
```

---

## Complete Test Script

Here's a complete PowerShell script to automate the entire flow:

```powershell
# billing/test-checkout-flow.ps1

Write-Host "=== Stripe Checkout Flow Test ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create Customer
Write-Host "Step 1: Creating customer..." -ForegroundColor Yellow
$customerBody = @{
    email = "test-$(Get-Date -Format 'yyyyMMddHHmmss')@example.com"
    name = "Test User"
    company = "Test Company"
} | ConvertTo-Json

$customerResponse = Invoke-RestMethod -Uri "http://localhost:3100/api/customers" -Method POST -Body $customerBody -ContentType "application/json"
$customerId = $customerResponse.customer.customer_id  # Use customer_id, not id

Write-Host "✓ Customer created: $customerId" -ForegroundColor Green
Write-Host "  Email: $($customerResponse.customer.email)" -ForegroundColor Gray
Write-Host ""

# Step 2: Create Checkout Session
Write-Host "Step 2: Creating checkout session..." -ForegroundColor Yellow
$checkoutBody = @{
    customer_id = $customerId
    plan = "professional"
    success_url = "http://localhost:3100/success"
    cancel_url = "http://localhost:3100/cancel"
} | ConvertTo-Json

$checkoutResponse = Invoke-RestMethod -Uri "http://localhost:3100/api/subscriptions/checkout" -Method POST -Body $checkoutBody -ContentType "application/json"

Write-Host "✓ Checkout session created" -ForegroundColor Green
Write-Host "  Session ID: $($checkoutResponse.session_id)" -ForegroundColor Gray
Write-Host ""

# Step 3: Open Checkout URL
Write-Host "Step 3: Opening checkout URL in browser..." -ForegroundColor Yellow
Write-Host "  URL: $($checkoutResponse.checkout_url)" -ForegroundColor Gray
Write-Host ""
Write-Host "Use test card: 4242 4242 4242 4242" -ForegroundColor Cyan
Write-Host "Complete the payment in your browser..." -ForegroundColor Cyan
Start-Process $checkoutResponse.checkout_url

# Wait for user to complete payment
Write-Host ""
Read-Host "Press Enter after completing payment in browser"

# Step 4: Verify Subscription
Write-Host ""
Write-Host "Step 4: Verifying subscription..." -ForegroundColor Yellow
Start-Sleep -Seconds 3  # Give webhook time to process

$subscription = Invoke-RestMethod -Uri "http://localhost:3100/api/subscriptions/$customerId" -Method GET

Write-Host "✓ Subscription verified" -ForegroundColor Green
Write-Host "  Status: $($subscription.subscription.status)" -ForegroundColor Gray
Write-Host "  Plan: $($subscription.subscription.plan)" -ForegroundColor Gray
Write-Host "  Stripe Sub ID: $($subscription.subscription.stripe_subscription_id)" -ForegroundColor Gray
Write-Host ""

# Step 5: Get License
Write-Host "Step 5: Getting license..." -ForegroundColor Yellow
$license = Invoke-RestMethod -Uri "http://localhost:3100/api/licenses/$customerId" -Method GET

Write-Host "✓ License retrieved" -ForegroundColor Green
Write-Host ""
Write-Host "License Features:" -ForegroundColor Cyan
$license.decoded.features | ConvertTo-Json -Depth 2
Write-Host ""

Write-Host "=== Test Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Customer ID: $customerId"
Write-Host "  Email: $($customerResponse.customer.email)"
Write-Host "  Plan: $($subscription.subscription.plan)"
Write-Host "  Status: $($subscription.subscription.status)"
Write-Host "  Max Devices: $($license.decoded.features.max_devices)"
```

**Run the Script**:
```powershell
cd c:\Users\Dan\Iotistic-sensor\billing
.\test-checkout-flow.ps1
```

---

## Troubleshooting

### Issue: "Customer not found" in webhook logs
**Cause**: Webhook is using test Stripe customer ID that doesn't exist in your database  
**Solution**: This is expected for `stripe trigger` test events. Use real checkout flow above.

### Issue: Checkout URL doesn't open
**Cause**: Browser security or URL encoding  
**Solution**: Copy the `checkout_url` and paste it manually in your browser

### Issue: Webhook not received
**Cause**: Stripe CLI not forwarding  
**Solution**: Check Stripe CLI logs:
```powershell
docker logs billing-stripe-cli
# Should see: Ready! Your webhook signing secret is whsec_xxxxx
```

### Issue: Subscription still shows "trial" status
**Cause**: Webhook not processed yet  
**Solution**: Wait 3-5 seconds after payment, then check again

### Issue: License not updated
**Cause**: License generation happens on next GET request (lazy generation)  
**Solution**: Call GET `/api/licenses/:customerId` to trigger license generation

---

## Next Steps

1. **Test Different Plans**: Try starter ($29) and enterprise ($99) plans
2. **Test Cancellation**: Use POST `/api/subscriptions/cancel`
3. **Test Upgrade**: Use POST `/api/subscriptions/upgrade` to change plans
4. **Integrate with Customer API**: Pass license JWT to customer API for validation
5. **Production Setup**: See `STRIPE-CLI-USAGE.md` for production webhook configuration

---

## Key Endpoints Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/customers` | POST | Create customer with trial |
| `/api/subscriptions/checkout` | POST | Create Stripe checkout session |
| `/api/subscriptions/:customerId` | GET | Get subscription details |
| `/api/licenses/:customerId` | GET | Get license JWT |
| `/api/subscriptions/upgrade` | POST | Upgrade plan |
| `/api/subscriptions/cancel` | POST | Cancel subscription |
| `/api/webhooks/stripe` | POST | Stripe webhook endpoint (internal) |

---

## Test Cards

Stripe provides many test cards for different scenarios:

| Card Number | Scenario |
|-------------|----------|
| `4242 4242 4242 4242` | ✅ Success |
| `4000 0000 0000 0002` | ❌ Card declined |
| `4000 0000 0000 9995` | ❌ Insufficient funds |
| `4000 0027 6000 3184` | 🔐 Requires 3D Secure |

**Full list**: https://stripe.com/docs/testing#cards
