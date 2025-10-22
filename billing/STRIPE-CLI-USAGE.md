# Stripe CLI Docker Setup - Quick Reference

## How It Works

The Stripe CLI container listens to Stripe webhook events and forwards them to your local billing service at `http://billing:3100/api/webhooks/stripe`.

## Initial Setup

### 1. Start Services
```powershell
cd billing
docker compose up -d
```

### 2. Get Webhook Signing Secret
```powershell
docker logs billing-stripe-cli
```

Look for:
```
Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx
```

### 3. Update Environment Variable

**Option A: Using .env file (recommended)**
Create `billing/.env`:
```bash
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

**Option B: Restart with new secret**
```powershell
docker compose down
# Update STRIPE_WEBHOOK_SECRET in docker-compose.yml
docker compose up -d
```

## Testing Webhooks

### Trigger Test Events
```powershell
# Enter the Stripe CLI container
docker exec -it billing-stripe-cli sh

# Trigger specific events
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_succeeded
stripe trigger invoice.payment_failed

# Exit container
exit
```

### View Webhook Logs
```powershell
# Billing service logs (webhook processing)
docker compose logs -f billing

# Stripe CLI logs (webhook forwarding)
docker logs -f billing-stripe-cli
```

## Common Test Scenarios

### 1. Test Subscription Creation
```powershell
docker exec -it billing-stripe-cli stripe trigger customer.subscription.created
```

Expected:
- Billing service logs: `✅ Webhook processed: customer.subscription.created`
- License generated for customer
- Subscription status updated in database

### 2. Test Payment Success
```powershell
docker exec -it billing-stripe-cli stripe trigger invoice.payment_succeeded
```

Expected:
- Subscription status set to `active`
- License refreshed with new expiry

### 3. Test Payment Failure
```powershell
docker exec -it billing-stripe-cli stripe trigger invoice.payment_failed
```

Expected:
- Subscription status set to `past_due`
- Customer notified (if notification system exists)

### 4. Test Subscription Cancellation
```powershell
docker exec -it billing-stripe-cli stripe trigger customer.subscription.deleted
```

Expected:
- Subscription status set to `canceled`
- License revoked or marked as inactive

## Webhook Events Handled by Billing Service

| Event | Description | Action |
|-------|-------------|--------|
| `customer.subscription.created` | New subscription | Create license, set trial period |
| `customer.subscription.updated` | Subscription changed | Update license features |
| `customer.subscription.deleted` | Subscription canceled | Revoke license |
| `invoice.payment_succeeded` | Payment successful | Activate/extend subscription |
| `invoice.payment_failed` | Payment failed | Set subscription to past_due |
| `checkout.session.completed` | Checkout completed | Link subscription to customer |

## Troubleshooting

### Webhook Secret Mismatch
```
Error: Webhook signature verification failed
```

**Solution:**
1. Get fresh secret: `docker logs billing-stripe-cli`
2. Update `STRIPE_WEBHOOK_SECRET` in docker-compose.yml
3. Restart: `docker compose restart billing`

### Events Not Reaching Billing Service
```powershell
# Check Stripe CLI is running
docker ps | grep stripe-cli

# Check Stripe CLI logs
docker logs billing-stripe-cli

# Check billing service is accessible from stripe-cli
docker exec -it billing-stripe-cli wget -O- http://billing:3100/health
```

### Test Direct Webhook Call
```powershell
# From your host machine
curl -X POST http://localhost:3100/api/webhooks/stripe \
  -H "Content-Type: application/json" \
  -d '{"type":"ping","data":{}}'
```

## Production Setup

⚠️ **Important:** The Stripe CLI is for **local development only**.

In production:
1. Remove the `stripe-cli` service from docker-compose
2. Configure real webhooks in Stripe Dashboard:
   - Go to: https://dashboard.stripe.com/webhooks
   - Add endpoint: `https://yourdomain.com/api/webhooks/stripe`
   - Select events to listen for
   - Copy webhook signing secret to production env

## Quick Commands

```powershell
# Start everything
docker compose up -d

# View all logs
docker compose logs -f

# Restart billing only
docker compose restart billing

# Trigger a test webhook
docker exec -it billing-stripe-cli stripe trigger payment_intent.succeeded

# Stop everything
docker compose down

# Clean restart
docker compose down -v && docker compose up -d
```

## Environment Variables

```bash
# Required in docker-compose.yml or .env
STRIPE_API_KEY=sk_test_xxx                    # From Stripe Dashboard
STRIPE_WEBHOOK_SECRET=whsec_xxx               # From docker logs billing-stripe-cli
STRIPE_PRICE_STARTER=price_xxx                # From Stripe Products
STRIPE_PRICE_PROFESSIONAL=price_xxx           # From Stripe Products  
STRIPE_PRICE_ENTERPRISE=price_xxx             # From Stripe Products
```

## Useful Stripe CLI Commands

Inside the container (`docker exec -it billing-stripe-cli sh`):

```bash
# List recent events
stripe events list

# Get event details
stripe events retrieve evt_xxxxx

# List customers
stripe customers list

# Get customer details
stripe customers retrieve cus_xxxxx

# List subscriptions
stripe subscriptions list

# Cancel subscription
stripe subscriptions cancel sub_xxxxx
```
