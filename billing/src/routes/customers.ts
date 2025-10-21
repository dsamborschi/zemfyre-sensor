/**
 * Customer Routes
 * Manage customers
 */

import { Router } from 'express';
import { CustomerModel } from '../db/customer-model';
import { SubscriptionModel } from '../db/subscription-model';
import { LicenseGenerator } from '../services/license-generator';

const router = Router();

/**
 * POST /api/customers
 * Create new customer
 */
router.post('/', async (req, res) => {
  try {
    const { email, company_name } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if customer exists
    const existing = await CustomerModel.getByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Customer already exists' });
    }

    // Create customer
    const customer = await CustomerModel.create({ 
      email, 
      companyName: company_name 
    });

    // Create trial subscription
    const subscription = await SubscriptionModel.createTrial(
      customer.customer_id,
      'starter',
      14
    );

    // Generate license
    const license = await LicenseGenerator.generateLicense(customer, subscription);

    res.status(201).json({
      customer,
      subscription,
      license,
    });
  } catch (error: any) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/customers/:id
 * Get customer details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await CustomerModel.getById(id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const subscription = await SubscriptionModel.getByCustomerId(id);

    res.json({
      customer,
      subscription,
    });
  } catch (error: any) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/customers
 * List all customers
 */
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const customers = await CustomerModel.list(limit, offset);
    res.json({ customers, limit, offset });
  } catch (error: any) {
    console.error('Error listing customers:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/customers/:id
 * Update customer
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { company_name } = req.body;

    const customer = await CustomerModel.update(id, {
      company_name,
    });

    res.json({ customer });
  } catch (error: any) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
