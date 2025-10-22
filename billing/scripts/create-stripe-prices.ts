/**
 * Create Stripe Products and Prices
 * Run this once to set up your Stripe test mode products
 */

import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

interface PlanConfig {
  name: string;
  description: string;
  amount: number; // in cents
  features: string[];
}

const plans: Record<string, PlanConfig> = {
  starter: {
    name: 'Starter',
    description: 'Perfect for small teams getting started',
    amount: 2900, // $29/month
    features: [
      'Up to 5 devices',
      'Basic dashboards',
      'API access',
      'Email support',
    ],
  },
  professional: {
    name: 'Professional',
    description: 'For growing businesses with advanced needs',
    amount: 9900, // $99/month
    features: [
      'Up to 20 devices',
      'Custom dashboards',
      'Full API access',
      'Priority support',
      'Advanced analytics',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    description: 'Complete solution for large organizations',
    amount: 29900, // $299/month
    features: [
      'Unlimited devices',
      'Custom dashboards',
      'Full API access',
      'Phone & email support',
      'SLA guarantee',
      'Dedicated account manager',
    ],
  },
};

async function createPrices() {
  console.log('🚀 Creating Stripe Products and Prices...\n');

  const priceIds: Record<string, string> = {};

  for (const [key, config] of Object.entries(plans)) {
    try {
      console.log(`Creating ${config.name} plan...`);

      // Create product
      const product = await stripe.products.create({
        name: `Iotistic ${config.name}`,
        description: config.description,
        metadata: {
          plan: key,
          features: config.features.join(', '),
        },
      });

      console.log(`  ✓ Product created: ${product.id}`);

      // Create recurring price
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: config.amount,
        currency: 'usd',
        recurring: {
          interval: 'month',
        },
        metadata: {
          plan: key,
        },
      });

      console.log(`  ✓ Price created: ${price.id}`);
      console.log(`  Amount: $${(config.amount / 100).toFixed(2)}/month\n`);

      priceIds[key] = price.id;
    } catch (error: any) {
      console.error(`❌ Error creating ${config.name}:`, error.message);
    }
  }

  // Output environment variables
  console.log('✅ All products and prices created!\n');
  console.log('Add these to your .env file:\n');
  console.log(`STRIPE_PRICE_STARTER=${priceIds.starter}`);
  console.log(`STRIPE_PRICE_PROFESSIONAL=${priceIds.professional}`);
  console.log(`STRIPE_PRICE_ENTERPRISE=${priceIds.enterprise}`);
  console.log('\n');
}

// Run the script
createPrices().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
