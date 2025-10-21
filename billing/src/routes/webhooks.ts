/**
 * Webhook Routes
 * Handle Stripe webhooks
 */

import { Router } from 'express';
import { StripeService } from '../services/stripe-service';

const router = Router();

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events
 */
router.post('/stripe', async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    // Construct event from webhook (verifies signature)
    const event = StripeService.constructWebhookEvent(
      req.body, // Raw body (see index.ts for express.raw() middleware)
      signature
    );

    console.log(`📥 Webhook received: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await StripeService.handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.updated':
        await StripeService.handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await StripeService.handleSubscriptionDeleted(event.data.object);
        break;

      default:
        console.log(`⚠️ Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('❌ Webhook error:', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;
