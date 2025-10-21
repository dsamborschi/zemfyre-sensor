/**
 * Subscription Routes
 * Manage subscriptions and trials
 */

import { Router } from 'express';
import { CustomerModel } from '../db/customer-model';
import { SubscriptionModel } from '../db/subscription-model';
import { StripeService } from '../services/stripe-service';
import { LicenseGenerator } from '../services/license-generator';

const router = Router();

/**
 * POST /api/subscriptions/checkout
 * Create Stripe checkout session
 */
router.post('/checkout', async (req, res) => {
  try {
    const { customer_id, plan, success_url, cancel_url } = req.body;

    if (!customer_id || !plan) {
      return res.status(400).json({ error: 'customer_id and plan are required' });
    }

    if (!['starter', 'professional', 'enterprise'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const session = await StripeService.createCheckoutSession({
      customerId: customer_id,
      plan,
      successUrl: success_url || `${req.protocol}://${req.get('host')}/success`,
      cancelUrl: cancel_url || `${req.protocol}://${req.get('host')}/cancel`,
    });

    res.json({
      session_id: session.id,
      checkout_url: session.url,
    });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/subscriptions/trial
 * Create trial subscription (already done in customer creation, but kept for flexibility)
 */
router.post('/trial', async (req, res) => {
  try {
    const { customer_id } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id is required' });
    }

    const customer = await CustomerModel.getById(customer_id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if subscription exists
    const existing = await SubscriptionModel.getByCustomerId(customer_id);
    if (existing) {
      return res.status(409).json({ error: 'Subscription already exists' });
    }

    const subscription = await SubscriptionModel.createTrial(customer_id, { plan: 'starter' });
    const license = await LicenseGenerator.generateLicense(customer, subscription);

    res.status(201).json({
      subscription,
      license,
    });
  } catch (error: any) {
    console.error('Error creating trial:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/subscriptions/upgrade
 * Upgrade subscription plan
 */
router.post('/upgrade', async (req, res) => {
  try {
    const { customer_id, new_plan } = req.body;

    if (!customer_id || !new_plan) {
      return res.status(400).json({ error: 'customer_id and new_plan are required' });
    }

    if (!['starter', 'professional', 'enterprise'].includes(new_plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    await StripeService.upgradeSubscription(customer_id, new_plan);

    // Get updated subscription and regenerate license
    const subscription = await SubscriptionModel.getByCustomerId(customer_id);
    const customer = await CustomerModel.getById(customer_id);
    
    if (!subscription || !customer) {
      return res.status(404).json({ error: 'Customer or subscription not found' });
    }

    const license = await LicenseGenerator.generateLicense(customer, subscription);

    res.json({
      subscription,
      license,
    });
  } catch (error: any) {
    console.error('Error upgrading subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/subscriptions/cancel
 * Cancel subscription
 */
router.post('/cancel', async (req, res) => {
  try {
    const { customer_id } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id is required' });
    }

    await StripeService.cancelSubscription(customer_id);

    res.json({
      message: 'Subscription canceled successfully',
    });
  } catch (error: any) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/subscriptions/:customerId
 * Get subscription details
 */
router.get('/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    const subscription = await SubscriptionModel.getByCustomerId(customerId);
    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({ subscription });
  } catch (error: any) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
