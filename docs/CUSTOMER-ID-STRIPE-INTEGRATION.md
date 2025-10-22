# Customer ID and Stripe Integration - Explained

## Your Question

> "You generated the customer ID in customers table. How will that work with Stripe once customer upgrades from trial to paid plan?"

## Short Answer

**Two separate customer IDs** with a **link between them**:

1. **Your System**: `customer_id` (e.g., `cust_de4228f6157b4cf2968c4204938006e9`)
2. **Stripe**: `stripe_customer_id` (e.g., `cus_ABC123xyz`) - stored in your database

They're linked via the `stripe_customer_id` column in the `customers` table.

---

## How It Works

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ YOUR CUSTOMERS TABLE                                            │
├─────────────────────────────────────────────────────────────────┤
│ id  | customer_id    | email           | stripe_customer_id    │
│ 1   | cust_abc123... | john@email.com  | NULL (trial)          │
│ 2   | cust_def456... | jane@email.com  | cus_XYZ789 (paid)     │
└─────────────────────────────────────────────────────────────────┘
                                                    │
                                                    │ Links to
                                                    ↓
                                          ┌─────────────────────┐
                                          │ STRIPE CUSTOMER     │
                                          │ ID: cus_XYZ789      │
                                          │ Email: jane@...     │
                                          │ Subscriptions: 1    │
                                          └─────────────────────┘
```

---

## Detailed Flow

### 1. Customer Signs Up (Trial)

**What happens**:
```typescript
// POST /api/customers/signup
const customer = await CustomerModel.create({
  email: "john@example.com",
  password: "SecurePass123",
  companyName: "Acme Corp"
});
// Result: customer_id = "cust_abc123..."
// stripe_customer_id = NULL (not yet in Stripe)
```

**Database state**:
```sql
customer_id: cust_abc123...
email: john@example.com
stripe_customer_id: NULL  -- ⬅️ Not yet created in Stripe
```

**License generated**: With your `customer_id` embedded in the JWT.

---

### 2. Customer Upgrades to Paid Plan

**Flow when checkout button clicked**:

```typescript
// Frontend: Customer clicks "Upgrade to Pro"
POST /api/subscriptions/checkout
{
  "customer_id": "cust_abc123...",  // YOUR customer ID
  "plan": "professional",
  "success_url": "https://app.com/success",
  "cancel_url": "https://app.com/cancel"
}
```

**Backend processing** (`StripeService.createCheckoutSession`):

```typescript
// Step 1: Get customer from YOUR database
const customer = await CustomerModel.getById("cust_abc123...");

// Step 2: Check if Stripe customer already exists
let stripeCustomerId = customer.stripe_customer_id;

if (!stripeCustomerId) {
  // Step 3: Create customer in Stripe
  const stripeCustomer = await stripe.customers.create({
    email: customer.email,
    metadata: {
      customer_id: customer.customer_id  // ⬅️ YOUR ID stored in Stripe
    }
  });
  stripeCustomerId = stripeCustomer.id;  // e.g., "cus_XYZ789"

  // Step 4: Save Stripe customer ID back to YOUR database
  await CustomerModel.update(customer.customer_id, {
    stripe_customer_id: stripeCustomerId
  });
}

// Step 5: Create Stripe checkout session
const session = await stripe.checkout.sessions.create({
  customer: stripeCustomerId,  // ⬅️ Use Stripe customer ID
  mode: 'subscription',
  line_items: [{ price: 'price_pro_monthly', quantity: 1 }],
  metadata: {
    customer_id: customer.customer_id  // ⬅️ YOUR ID for webhook mapping
  }
});

// Return checkout URL to frontend
return session.url;
```

**Database state AFTER checkout created**:
```sql
customer_id: cust_abc123...
email: john@example.com
stripe_customer_id: cus_XYZ789  -- ⬅️ NOW linked to Stripe
```

---

### 3. Customer Completes Payment

**Stripe sends webhook** → `checkout.session.completed`

```typescript
// POST /api/webhooks/stripe (webhook handler)
const session = event.data.object;

// Extract YOUR customer ID from metadata
const customerId = session.metadata.customer_id;  // "cust_abc123..."

// Get Stripe subscription
const stripeSubscription = await stripe.subscriptions.retrieve(
  session.subscription
);

// Update YOUR database
await SubscriptionModel.update(customerId, {
  stripe_subscription_id: stripeSubscription.id,  // "sub_ABC123..."
  status: 'active',
  plan: 'professional',
  current_period_ends_at: new Date(stripeSubscription.current_period_end * 1000)
});

// Regenerate license with new plan features
const customer = await CustomerModel.getById(customerId);
const subscription = await SubscriptionModel.getByCustomerId(customerId);
const newLicense = await LicenseGenerator.generateLicense(customer, subscription);

// Send email with new license
await emailService.sendUpgradeSuccess({
  email: customer.email,
  newLicense,
  plan: 'professional'
});
```

**Database state AFTER payment**:
```sql
-- customers table
customer_id: cust_abc123...
email: john@example.com
stripe_customer_id: cus_XYZ789

-- subscriptions table
customer_id: cust_abc123...
stripe_subscription_id: sub_ABC123...
plan: professional
status: active
```

---

## ID Mapping Strategy

### Primary Key: YOUR customer_id

**Always use YOUR `customer_id` as the primary identifier**:

```typescript
// ✅ GOOD: YOUR customer_id is the source of truth
const customer = await CustomerModel.getById("cust_abc123...");
const subscription = await SubscriptionModel.getByCustomerId("cust_abc123...");
```

### Foreign Key: Stripe's customer_id

**Stripe IDs are stored but treated as foreign keys**:

```typescript
// ✅ GOOD: Stripe ID is just a reference
const customer = await CustomerModel.getByStripeCustomerId("cus_XYZ789");

// Stripe customer metadata ALWAYS contains YOUR customer_id
const stripeCustomer = await stripe.customers.retrieve("cus_XYZ789");
console.log(stripeCustomer.metadata.customer_id);  // "cust_abc123..."
```

---

## Why This Approach?

### ✅ Advantages

1. **Trial users don't need Stripe**: Customers can use your platform during trial without ever touching Stripe
2. **Single source of truth**: YOUR database is authoritative, Stripe is for payments only
3. **Billing system independence**: Can switch from Stripe to another provider without changing customer IDs
4. **License continuity**: License JWTs always use YOUR customer_id, never changes
5. **Offline capability**: Can generate licenses without Stripe API calls

### 🔄 Data Flow

```
YOUR customer_id (cust_abc...)
   │
   ├─> Embedded in License JWT ✅
   ├─> Stored in Stripe metadata ✅
   ├─> Used in all YOUR APIs ✅
   └─> Primary key in YOUR database ✅

Stripe customer_id (cus_XYZ...)
   │
   ├─> Stored in YOUR database (stripe_customer_id column) ✅
   ├─> Used ONLY for Stripe API calls ✅
   └─> Never exposed to end users ❌
```

---

## Complete Database Schema

```sql
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    customer_id VARCHAR(100) UNIQUE NOT NULL,        -- YOUR ID (primary)
    email VARCHAR(255) UNIQUE NOT NULL,
    company_name VARCHAR(255),
    stripe_customer_id VARCHAR(100) UNIQUE,          -- Stripe ID (foreign)
    -- ... other fields
);

CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    customer_id VARCHAR(100) UNIQUE NOT NULL         -- YOUR ID (primary)
        REFERENCES customers(customer_id) ON DELETE CASCADE,
    stripe_subscription_id VARCHAR(100) UNIQUE,      -- Stripe ID (foreign)
    plan VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    -- ... other fields
);
```

**Foreign keys**:
- `customers.stripe_customer_id` → Stripe customer
- `subscriptions.stripe_subscription_id` → Stripe subscription
- `subscriptions.customer_id` → `customers.customer_id` (YOUR IDs)

---

## Webhook Mapping

### Challenge: Stripe webhooks only know Stripe IDs

**Solution**: Store YOUR customer_id in two places:

1. **Stripe customer metadata**:
```typescript
const stripeCustomer = await stripe.customers.create({
  email: customer.email,
  metadata: {
    customer_id: "cust_abc123..."  // ⬅️ YOUR ID
  }
});
```

2. **Checkout session metadata**:
```typescript
const session = await stripe.checkout.sessions.create({
  customer: stripeCustomerId,
  metadata: {
    customer_id: "cust_abc123...",  // ⬅️ YOUR ID
    plan: "professional"
  }
});
```

### Webhook Handler Example

```typescript
// Stripe webhook: checkout.session.completed
const session = event.data.object;

// Option A: Get from session metadata
const customerId = session.metadata.customer_id;

// Option B: Lookup from Stripe customer ID
const customer = await CustomerModel.getByStripeCustomerId(session.customer);
const customerId = customer.customer_id;

// Now use YOUR customer_id for all operations
await SubscriptionModel.update(customerId, { status: 'active' });
```

---

## Example: Complete Upgrade Flow

### Frontend Code

```typescript
// Customer clicks "Upgrade to Pro"
async function handleUpgrade() {
  const response = await fetch('/api/subscriptions/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_id: currentUser.customer_id,  // YOUR customer ID
      plan: 'professional',
      success_url: window.location.origin + '/success',
      cancel_url: window.location.origin + '/pricing'
    })
  });

  const { checkout_url } = await response.json();
  window.location.href = checkout_url;  // Redirect to Stripe
}
```

### Backend: Create Checkout

```typescript
// POST /api/subscriptions/checkout
const customer = await CustomerModel.getById(req.body.customer_id);

// Create or get Stripe customer
if (!customer.stripe_customer_id) {
  const stripeCustomer = await stripe.customers.create({
    email: customer.email,
    metadata: { customer_id: customer.customer_id }
  });
  
  customer.stripe_customer_id = stripeCustomer.id;
  await CustomerModel.update(customer.customer_id, {
    stripe_customer_id: stripeCustomer.id
  });
}

// Create checkout session
const session = await stripe.checkout.sessions.create({
  customer: customer.stripe_customer_id,
  mode: 'subscription',
  line_items: [{ price: PRICE_IDS[req.body.plan], quantity: 1 }],
  success_url: req.body.success_url,
  cancel_url: req.body.cancel_url,
  metadata: {
    customer_id: customer.customer_id,  // ⬅️ For webhook mapping
    plan: req.body.plan
  }
});

res.json({ checkout_url: session.url });
```

### Backend: Handle Webhook

```typescript
// POST /api/webhooks/stripe
const event = stripe.webhooks.constructEvent(req.body, signature, secret);

if (event.type === 'checkout.session.completed') {
  const session = event.data.object;
  const customerId = session.metadata.customer_id;  // YOUR customer ID
  const plan = session.metadata.plan;

  // Get Stripe subscription
  const stripeSub = await stripe.subscriptions.retrieve(session.subscription);

  // Update YOUR database
  await SubscriptionModel.update(customerId, {
    stripe_subscription_id: stripeSub.id,
    status: 'active',
    plan: plan,
    current_period_ends_at: new Date(stripeSub.current_period_end * 1000)
  });

  // Regenerate license with new plan
  const customer = await CustomerModel.getById(customerId);
  const subscription = await SubscriptionModel.getByCustomerId(customerId);
  const newLicense = await LicenseGenerator.generateLicense(customer, subscription);

  // Send new license to customer
  await emailService.sendLicenseUpdate({
    email: customer.email,
    license: newLicense,
    plan: plan
  });
}
```

---

## Key Takeaways

1. **YOUR `customer_id`** = Primary identifier, never changes
2. **Stripe `customer_id`** = Created on first payment, stored in your DB
3. **Mapping**: Your DB links the two via `stripe_customer_id` column
4. **Metadata**: Stripe objects store YOUR `customer_id` for reverse lookup
5. **License**: Always uses YOUR `customer_id`, never Stripe's
6. **Trial → Paid**: Seamless transition, just adds `stripe_customer_id` to existing record

---

## Testing the Flow

```powershell
# 1. Create trial customer
$signup = @{
    email = "test@example.com"
    password = "SecurePass123"
    company_name = "Test Corp"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:3100/api/customers/signup" `
    -Method POST -Body $signup -ContentType "application/json"

$customerId = $result.customer.customer_id
Write-Host "Customer ID: $customerId"
Write-Host "Stripe ID: $($result.customer.stripe_customer_id)"  # Should be NULL

# 2. Create checkout session (upgrade to paid)
$checkout = @{
    customer_id = $customerId
    plan = "professional"
    success_url = "http://localhost:3000/success"
    cancel_url = "http://localhost:3000/cancel"
} | ConvertTo-Json

$session = Invoke-RestMethod -Uri "http://localhost:3100/api/subscriptions/checkout" `
    -Method POST -Body $checkout -ContentType "application/json"

Write-Host "Checkout URL: $($session.checkout_url)"

# 3. Check database - stripe_customer_id should now be populated
docker exec -it billing-postgres-1 psql -U billing -d billing -c \
  "SELECT customer_id, email, stripe_customer_id FROM customers WHERE customer_id = '$customerId';"
```

---

**Bottom Line**: Your system maintains control with YOUR customer IDs. Stripe IDs are just stored references for payment processing. The two systems stay loosely coupled and map via your database.
