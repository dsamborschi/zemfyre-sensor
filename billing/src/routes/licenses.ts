/**
 * License Routes
 * Generate and manage licenses
 */

import { Router } from 'express';
import { CustomerModel } from '../db/customer-model';
import { SubscriptionModel } from '../db/subscription-model';
import { LicenseGenerator } from '../services/license-generator';

const router = Router();

/**
 * GET /api/licenses/public-key
 * Get public key for license verification
 */
router.get('/public-key', async (req, res) => {
  try {
    const publicKey = LicenseGenerator.getPublicKey();
    
    res.json({
      public_key: publicKey,
      algorithm: 'RS256',
      usage: 'Place this key in customer instance environment variable: LICENSE_PUBLIC_KEY',
    });
  } catch (error: any) {
    console.error('Error fetching public key:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/licenses/:customerId
 * Get license for customer instance
 */
router.get('/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    const customer = await CustomerModel.getById(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const subscription = await SubscriptionModel.getByCustomerId(customerId);
    if (!subscription) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    // Generate fresh license
    const license = await LicenseGenerator.generateLicense(customer, subscription);

    res.json({
      license,
      customer_id: customer.customer_id,
      plan: subscription.plan,
      status: subscription.status,
    });
  } catch (error: any) {
    console.error('Error generating license:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/licenses/:customerId/revoke
 * Revoke license (cancel subscription)
 */
router.post('/:customerId/revoke', async (req, res) => {
  try {
    const { customerId } = req.params;

    await SubscriptionModel.cancel(customerId);

    res.json({
      message: 'License revoked successfully',
      customer_id: customerId,
    });
  } catch (error: any) {
    console.error('Error revoking license:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/licenses/verify
 * Verify license JWT (for testing)
 */
router.post('/verify', async (req, res) => {
  try {
    const { license } = req.body;

    if (!license) {
      return res.status(400).json({ error: 'License token required' });
    }

    const decoded = LicenseGenerator.verifyLicense(license);

    res.json({
      valid: true,
      data: decoded,
    });
  } catch (error: any) {
    res.status(401).json({
      valid: false,
      error: error.message,
    });
  }
});

export default router;
