/**
 * Stripe Service
 * Handles Stripe integration for subscriptions
 */

import Stripe from 'stripe';
import { CustomerModel } from '../db/customer-model';
import { SubscriptionModel } from '../db/subscription-model';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-10-28.acacia',
});

// Stripe Price IDs (configure these in Stripe dashboard)
const PRICE_IDS = {
  starter: process.env.STRIPE_PRICE_STARTER || 'price_starter',
  professional: process.env.STRIPE_PRICE_PROFESSIONAL || 'price_professional',
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE || 'price_enterprise',
};

export class StripeService {
  /**
   * Create checkout session for subscription
   */
  static async createCheckoutSession(data: {
    customerId: string;
    plan: 'starter' | 'professional' | 'enterprise';
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
    const customer = await CustomerModel.getById(data.customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Get or create Stripe customer
    let stripeCustomerId = customer.stripe_customer_id;
    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: customer.email,
        metadata: {
          customer_id: customer.customer_id,
        },
      });
      stripeCustomerId = stripeCustomer.id;

      // Update customer with Stripe ID
      await CustomerModel.update(customer.customer_id, {
        stripe_customer_id: stripeCustomerId,
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: PRICE_IDS[data.plan],
          quantity: 1,
        },
      ],
      success_url: data.successUrl,
      cancel_url: data.cancelUrl,
      metadata: {
        customer_id: customer.customer_id,
        plan: data.plan,
      },
    });

    return session;
  }

  /**
   * Handle successful checkout
   */
  static async handleCheckoutCompleted(
    session: Stripe.Checkout.Session
  ): Promise<void> {
    const customerId = session.metadata?.customer_id;
    const plan = session.metadata?.plan as 'starter' | 'professional' | 'enterprise';

    if (!customerId || !plan) {
      console.error('Missing metadata in checkout session:', session.id);
      return;
    }

    // Get subscription from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(
      session.subscription as string
    );

    // Create or update subscription in database
    const existingSub = await SubscriptionModel.getByCustomerId(customerId);
    
    if (existingSub) {
      await SubscriptionModel.update(customerId, {
        stripe_subscription_id: stripeSubscription.id,
        status: 'active',
        plan,
        current_period_ends_at: new Date(stripeSubscription.current_period_end * 1000),
      });
    } else {
      await SubscriptionModel.createPaid(
        customerId,
        plan,
        stripeSubscription.id,
        new Date(stripeSubscription.current_period_end * 1000)
      );
    }

    console.log(`✅ Subscription created for customer ${customerId}`);
  }

  /**
   * Handle subscription updated
   */
  static async handleSubscriptionUpdated(
    subscription: Stripe.Subscription
  ): Promise<void> {
    const dbSubscription = await SubscriptionModel.getByStripeId(subscription.id);
    if (!dbSubscription) {
      console.warn('Subscription not found in database:', subscription.id);
      return;
    }

    // Map Stripe status to our status
    const statusMap: Record<string, any> = {
      active: 'active',
      past_due: 'past_due',
      canceled: 'canceled',
      unpaid: 'unpaid',
      trialing: 'trialing',
    };

    await SubscriptionModel.update(dbSubscription.customer_id, {
      status: statusMap[subscription.status] || 'active',
      current_period_ends_at: new Date(subscription.current_period_end * 1000),
    });

    console.log(`✅ Subscription updated for customer ${dbSubscription.customer_id}`);
  }

  /**
   * Handle subscription deleted/canceled
   */
  static async handleSubscriptionDeleted(
    subscription: Stripe.Subscription
  ): Promise<void> {
    const dbSubscription = await SubscriptionModel.getByStripeId(subscription.id);
    if (!dbSubscription) {
      console.warn('Subscription not found in database:', subscription.id);
      return;
    }

    await SubscriptionModel.cancel(dbSubscription.customer_id);
    console.log(`✅ Subscription canceled for customer ${dbSubscription.customer_id}`);
  }

  /**
   * Cancel subscription
   */
  static async cancelSubscription(customerId: string): Promise<void> {
    const subscription = await SubscriptionModel.getByCustomerId(customerId);
    if (!subscription || !subscription.stripe_subscription_id) {
      throw new Error('No active subscription found');
    }

    await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
    await SubscriptionModel.cancel(customerId);
  }

  /**
   * Upgrade subscription plan
   */
  static async upgradeSubscription(
    customerId: string,
    newPlan: 'starter' | 'professional' | 'enterprise'
  ): Promise<void> {
    const subscription = await SubscriptionModel.getByCustomerId(customerId);
    if (!subscription || !subscription.stripe_subscription_id) {
      throw new Error('No active subscription found');
    }

    // Get current subscription from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id
    );

    // Update subscription with new price
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      items: [
        {
          id: stripeSubscription.items.data[0].id,
          price: PRICE_IDS[newPlan],
        },
      ],
      proration_behavior: 'always_invoice', // Immediate upgrade
    });

    // Update database
    await SubscriptionModel.update(customerId, {
      plan: newPlan,
    });

    console.log(`✅ Subscription upgraded for customer ${customerId} to ${newPlan}`);
  }

  /**
   * Construct webhook event
   */
  static constructWebhookEvent(
    payload: string | Buffer,
    signature: string
  ): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }
}
