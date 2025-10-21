/**
 * License Generator
 * Generates JWT-based licenses for customer instances
 */

import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { Subscription } from '../db/subscription-model';
import { Customer } from '../db/customer-model';

export interface LicenseData {
  customerId: string;
  customerName: string;
  plan: 'trial' | 'starter' | 'professional' | 'enterprise';
  features: {
    maxDevices: number;
    dataRetentionDays: number;
    canExportData: boolean;
    hasAdvancedAlerts: boolean;
    hasApiAccess: boolean;
    hasMqttAccess: boolean;
    hasCustomBranding: boolean;
  };
  limits: {
    maxUsers?: number;
    maxAlertRules?: number;
    maxDashboards?: number;
  };
  trial: {
    isTrialMode: boolean;
    expiresAt?: string;
  };
  subscription: {
    status: 'active' | 'past_due' | 'canceled' | 'trialing';
    currentPeriodEndsAt: string;
  };
  issuedAt: number;
  expiresAt: number;
}

// Plan configurations
const PLAN_CONFIG = {
  starter: {
    maxDevices: 10,
    dataRetentionDays: 30,
    canExportData: true,
    hasAdvancedAlerts: false,
    hasApiAccess: true,
    hasMqttAccess: true,
    hasCustomBranding: false,
    maxUsers: 5,
    maxAlertRules: 25,
    maxDashboards: 10,
  },
  professional: {
    maxDevices: 50,
    dataRetentionDays: 365,
    canExportData: true,
    hasAdvancedAlerts: true,
    hasApiAccess: true,
    hasMqttAccess: true,
    hasCustomBranding: false,
    maxUsers: 10,
    maxAlertRules: 100,
    maxDashboards: 20,
  },
  enterprise: {
    maxDevices: 999999, // Unlimited
    dataRetentionDays: 999999, // Unlimited
    canExportData: true,
    hasAdvancedAlerts: true,
    hasApiAccess: true,
    hasMqttAccess: true,
    hasCustomBranding: true,
    maxUsers: undefined, // Unlimited
    maxAlertRules: undefined, // Unlimited
    maxDashboards: undefined, // Unlimited
  },
};

export class LicenseGenerator {
  private static privateKey: string | null = null;
  private static publicKey: string | null = null;

  /**
   * Load RSA keys
   */
  static init() {
    try {
      const privateKeyPath = process.env.LICENSE_PRIVATE_KEY_PATH || './keys/private-key.pem';
      const publicKeyPath = process.env.LICENSE_PUBLIC_KEY_PATH || './keys/public-key.pem';

      this.privateKey = fs.readFileSync(path.resolve(privateKeyPath), 'utf8');
      this.publicKey = fs.readFileSync(path.resolve(publicKeyPath), 'utf8');

      console.log('✅ License keys loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load license keys:', error);
      throw new Error('License keys not found. Run: npm run generate-keys');
    }
  }

  /**
   * Generate license JWT for customer
   */
  static async generateLicense(
    customer: Customer,
    subscription: Subscription
  ): Promise<string> {
    if (!this.privateKey) {
      throw new Error('License generator not initialized. Call init() first.');
    }

    const planConfig = PLAN_CONFIG[subscription.plan] || PLAN_CONFIG.starter;

    const licenseData: LicenseData = {
      customerId: customer.customer_id,
      customerName: customer.company_name || customer.email,
      plan: subscription.plan as any,
      features: {
        maxDevices: planConfig.maxDevices,
        dataRetentionDays: planConfig.dataRetentionDays,
        canExportData: planConfig.canExportData,
        hasAdvancedAlerts: planConfig.hasAdvancedAlerts,
        hasApiAccess: planConfig.hasApiAccess,
        hasMqttAccess: planConfig.hasMqttAccess,
        hasCustomBranding: planConfig.hasCustomBranding,
      },
      limits: {
        maxUsers: planConfig.maxUsers,
        maxAlertRules: planConfig.maxAlertRules,
        maxDashboards: planConfig.maxDashboards,
      },
      trial: {
        isTrialMode: subscription.status === 'trialing',
        expiresAt: subscription.trial_ends_at?.toISOString(),
      },
      subscription: {
        status: subscription.status as any,
        currentPeriodEndsAt: subscription.current_period_ends_at?.toISOString() || '',
      },
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year
    };

    // Sign with RS256
    const token = jwt.sign(licenseData, this.privateKey, {
      algorithm: 'RS256',
      expiresIn: '365d',
    });

    return token;
  }

  /**
   * Get public key (to share with customer instances)
   */
  static getPublicKey(): string {
    if (!this.publicKey) {
      throw new Error('License generator not initialized. Call init() first.');
    }
    return this.publicKey;
  }

  /**
   * Verify license (for testing)
   */
  static verifyLicense(token: string): LicenseData {
    if (!this.publicKey) {
      throw new Error('License generator not initialized. Call init() first.');
    }

    try {
      const decoded = jwt.verify(token, this.publicKey, {
        algorithms: ['RS256'],
      }) as LicenseData;

      return decoded;
    } catch (error: any) {
      throw new Error(`License verification failed: ${error.message}`);
    }
  }
}
