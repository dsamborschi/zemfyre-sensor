/**
 * Stripe Service
 * Handles Stripe integration for subscriptions
 */

import Stripe from 'stripe';
import { CustomerModel } from '../db/customer-model';
import { SubscriptionModel } from '../db/subscription-model';
import pool from '../db/connection';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
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
        trial_ends_at: null, // Clear trial date when upgrading to paid
        current_period_start: new Date(stripeSubscription.current_period_start * 1000),
        current_period_ends_at: new Date(stripeSubscription.current_period_end * 1000),
      });
    } else {
      await SubscriptionModel.createPaid(
        customerId,
        plan,
        stripeSubscription.id,
        new Date(stripeSubscription.current_period_end * 1000),
        new Date(stripeSubscription.current_period_start * 1000)
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
    // Try to find existing subscription
    let dbSubscription = await SubscriptionModel.getByStripeId(subscription.id);
    
    // If not found, this might be a new subscription - try to find by Stripe customer ID
    if (!dbSubscription) {
      const stripeCustomerId = typeof subscription.customer === 'string' 
        ? subscription.customer 
        : subscription.customer.id;
      
      const customer = await CustomerModel.getByStripeCustomerId(stripeCustomerId);
      
      if (!customer) {
        console.warn(`⚠️  Customer not found for Stripe subscription ${subscription.id}`);
        console.warn(`   Stripe customer ID: ${stripeCustomerId}`);
        console.warn(`   ℹ️  This is normal for test webhooks. Real webhooks will have a customer in the database.`);
        return;
      }

      // Determine plan from price ID
      const priceId = subscription.items.data[0]?.price.id;
      let plan: 'starter' | 'professional' | 'enterprise' | 'trial' = 'starter';
      
      if (priceId === process.env.STRIPE_PRICE_STARTER) plan = 'starter';
      else if (priceId === process.env.STRIPE_PRICE_PROFESSIONAL) plan = 'professional';
      else if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) plan = 'enterprise';

      // Create new subscription
      await SubscriptionModel.createPaid(
        customer.customer_id,
        plan,
        subscription.id,
        new Date(subscription.current_period_end * 1000),
        new Date(subscription.current_period_start * 1000)
      );

      console.log(`✅ New subscription created for customer ${customer.customer_id} (${plan})`);
      return;
    }

    // Update existing subscription
    const statusMap: Record<string, any> = {
      active: 'active',
      past_due: 'past_due',
      canceled: 'canceled',
      unpaid: 'unpaid',
      trialing: 'trialing',
    };

    const mappedStatus = statusMap[subscription.status] || 'active';
    
    await SubscriptionModel.update(dbSubscription.customer_id, {
      status: mappedStatus,
      current_period_start: new Date(subscription.current_period_start * 1000),
      current_period_ends_at: new Date(subscription.current_period_end * 1000),
      // Clear trial_ends_at when subscription becomes active (paid)
      ...(mappedStatus === 'active' && { trial_ends_at: null }),
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
   * Handle successful payment
   */
  static async handlePaymentSucceeded(
    invoice: Stripe.Invoice
  ): Promise<void> {
    if (!invoice.subscription) {
      console.log('Invoice is not for a subscription, skipping');
      return;
    }

    const dbSubscription = await SubscriptionModel.getByStripeId(
      invoice.subscription as string
    );
    
    if (!dbSubscription) {
      console.warn('Subscription not found in database:', invoice.subscription);
      return;
    }

    // Update subscription to active status
    await SubscriptionModel.update(dbSubscription.customer_id, {
      status: 'active',
      current_period_ends_at: new Date(invoice.period_end * 1000),
    });

    console.log(`✅ Payment succeeded for customer ${dbSubscription.customer_id}`);
  }

  /**
   * Handle failed payment
   */
  static async handlePaymentFailed(
    invoice: Stripe.Invoice
  ): Promise<void> {
    if (!invoice.subscription) {
      console.log('Invoice is not for a subscription, skipping');
      return;
    }

    const dbSubscription = await SubscriptionModel.getByStripeId(
      invoice.subscription as string
    );
    
    if (!dbSubscription) {
      console.warn('Subscription not found in database:', invoice.subscription);
      return;
    }

    // Update subscription to past_due status
    await SubscriptionModel.update(dbSubscription.customer_id, {
      status: 'past_due',
    });

    console.log(`❌ Payment failed for customer ${dbSubscription.customer_id}`);
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
   * Cancel subscription at period end (graceful cancellation)
   */
  static async cancelAtPeriodEnd(customerId: string): Promise<void> {
    const subscription = await SubscriptionModel.getByCustomerId(customerId);
    if (!subscription || !subscription.stripe_subscription_id) {
      throw new Error('No active subscription found');
    }

    // Update subscription to cancel at period end
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    // Update database status
    await pool.query(
      `UPDATE subscriptions 
       SET cancel_at_period_end = true,
           updated_at = NOW()
       WHERE customer_id = $1`,
      [customerId]
    );
  }

  /**
   * Keep subscription (undo cancel at period end)
   */
  static async keepSubscription(customerId: string): Promise<void> {
    const subscription = await SubscriptionModel.getByCustomerId(customerId);
    if (!subscription || !subscription.stripe_subscription_id) {
      throw new Error('No active subscription found');
    }

    // Remove cancel at period end flag
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: false,
    });

    // Update database status
    await pool.query(
      `UPDATE subscriptions 
       SET cancel_at_period_end = false,
           updated_at = NOW()
       WHERE customer_id = $1`,
      [customerId]
    );
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
