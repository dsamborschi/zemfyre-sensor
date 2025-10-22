# Stripe CLI Setup for Webhook Testing

## Overview

The Stripe CLI is included in the docker-compose setup to forward Stripe webhook events to your local billing service for testing.

## Quick Start

### 1. Start the Services

```bash
cd billing
docker compose up -d
```

### 2. Get the Webhook Signing Secret

After starting, check the Stripe CLI logs to get the webhook signing secret:

```bash
docker logs billing-stripe-cli
```

Look for output like:
```
Ready! Your webhook signing secret is whsec_abc123xyz...
```

### 3. Update docker-compose.yml

Copy the `whsec_...` secret and update the `STRIPE_WEBHOOK_SECRET` in `docker-compose.yml`:

```yaml
environment:
  STRIPE_WEBHOOK_SECRET: whsec_abc123xyz...  # Replace with actual secret
```

### 4. Restart the Billing Service

```bash
docker compose restart billing
```

## Testing Webhooks

### Trigger Test Events

You can trigger test Stripe events using the CLI:

```bash
# Trigger a successful payment
docker exec billing-stripe-cli stripe trigger payment_intent.succeeded

# Trigger a subscription created event
docker exec billing-stripe-cli stripe trigger customer.subscription.created

# Trigger a subscription updated event
docker exec billing-stripe-cli stripe trigger customer.subscription.updated

# Trigger a subscription deleted (canceled) event
docker exec billing-stripe-cli stripe trigger customer.subscription.deleted
```

### Monitor Webhook Activity

Watch the billing service logs to see webhook events being processed:

```bash
docker compose logs -f billing
```

### Available Events to Trigger

Common events for testing:

- `payment_intent.succeeded` - Payment completed successfully
- `payment_intent.payment_failed` - Payment failed
- `customer.subscription.created` - New subscription
- `customer.subscription.updated` - Subscription changed
- `customer.subscription.deleted` - Subscription canceled
- `invoice.payment_succeeded` - Invoice paid
- `invoice.payment_failed` - Invoice payment failed
- `checkout.session.completed` - Checkout completed

Full list: https://stripe.com/docs/cli/trigger

## Stripe CLI Commands

### Interactive Mode

Run commands inside the Stripe CLI container:

```bash
docker exec -it billing-stripe-cli sh
```

Then you can run Stripe commands:

```bash
stripe customers list
stripe products list
stripe prices list
```

### Create Test Products/Prices

```bash
# Create a product
docker exec billing-stripe-cli stripe products create \
  --name="Starter Plan" \
  --description="10 devices, 30 days retention"

# Create a price
docker exec billing-stripe-cli stripe prices create \
  --product=prod_xxx \
  --currency=usd \
  --unit-amount=2900 \
  --recurring[interval]=month
```

### View Recent Events

```bash
docker exec billing-stripe-cli stripe events list --limit 10
```

## Troubleshooting

### Stripe CLI Not Forwarding Events

1. Check if the container is running:
   ```bash
   docker ps | grep stripe-cli
   ```

2. Check the logs:
   ```bash
   docker logs billing-stripe-cli
   ```

3. Make sure the billing service is accessible from the stripe-cli container:
   ```bash
   docker exec billing-stripe-cli wget -O- http://billing:3100/health
   ```

### Wrong Webhook Secret

If you see signature verification errors in the billing logs:

1. Get the current webhook secret:
   ```bash
   docker logs billing-stripe-cli | grep "webhook signing secret"
   ```

2. Update `docker-compose.yml` with the correct secret
3. Restart: `docker compose restart billing`

### Test Without Docker

If you prefer to run Stripe CLI locally (not in Docker):

1. Install: https://stripe.com/docs/stripe-cli#install
2. Login: `stripe login`
3. Forward webhooks:
   ```bash
   stripe listen --forward-to http://localhost:3100/api/webhooks/stripe
   ```

## Production Setup

⚠️ **Important**: The Stripe CLI is only for local development!

In production:
1. Configure webhooks in the Stripe Dashboard
2. Point to your production URL: `https://billing.yourdomain.com/api/webhooks/stripe`
3. Use the webhook signing secret from the Stripe Dashboard
4. Enable webhook signature verification in your code

## Reference

- Stripe CLI Docs: https://stripe.com/docs/cli
- Webhook Testing: https://stripe.com/docs/webhooks/test
- Docker Image: https://hub.docker.com/r/stripe/stripe-cli
