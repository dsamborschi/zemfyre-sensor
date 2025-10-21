/**
 * License Validator Service
 * Validates JWT-based license keys from Global Billing API
 * Enforces feature flags and usage limits
 */

import jwt from 'jsonwebtoken';
import { SystemConfigModel } from '../db/system-config-model';

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
    expiresAt?: string; // ISO date
  };
  subscription: {
    status: 'active' | 'past_due' | 'canceled' | 'trialing';
    currentPeriodEndsAt: string;
  };
  issuedAt: number;
  expiresAt: number; // License expiry (separate from subscription)
}

export class LicenseValidator {
  private static instance: LicenseValidator;
  private licenseData: LicenseData | null = null;
  private licenseKey: string | null = null;
  
  // Public key for verifying JWT (Global Billing API signs with private key)
  private static readonly PUBLIC_KEY = process.env.LICENSE_PUBLIC_KEY || '';

  private constructor() {}

  static getInstance(): LicenseValidator {
    if (!this.instance) {
      this.instance = new LicenseValidator();
    }
    return this.instance;
  }

  /**
   * Initialize license from environment variable
   */
  async init(): Promise<void> {
    const licenseKey = process.env.ZEMFYRE_LICENSE_KEY;
    
    if (!licenseKey) {
      console.warn('⚠️  No license key found. Running in unlicensed mode (limited features).');
      this.licenseData = this.getDefaultUnlicensedMode();
      return;
    }

    try {
      this.licenseKey = licenseKey;
      this.licenseData = await this.validateLicense(licenseKey);
      
      // Cache license data in system_config
      await SystemConfigModel.set('license_data', this.licenseData);
      await SystemConfigModel.set('license_last_validated', new Date().toISOString());
      
      console.log(`✅ License validated for customer: ${this.licenseData.customerName}`);
      console.log(`   Plan: ${this.licenseData.plan.toUpperCase()}`);
      console.log(`   Max Devices: ${this.licenseData.features.maxDevices}`);
      console.log(`   Subscription Status: ${this.licenseData.subscription.status}`);
      
      if (this.licenseData.trial.isTrialMode) {
        const daysLeft = Math.ceil(
          (new Date(this.licenseData.trial.expiresAt!).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        );
        console.log(`   ⏰ TRIAL MODE - ${daysLeft} days remaining`);
      }
    } catch (error) {
      console.error('❌ License validation failed:', error);
      
      // Try to load cached license (offline mode)
      const cachedLicense = await SystemConfigModel.get<LicenseData>('license_data');
      const lastValidated = await SystemConfigModel.get<string>('license_last_validated');
      
      if (cachedLicense && lastValidated) {
        const daysSinceValidation = Math.floor(
          (Date.now() - new Date(lastValidated).getTime()) / (24 * 60 * 60 * 1000)
        );
        
        if (daysSinceValidation <= 30) {
          console.warn(`⚠️  Using cached license (offline mode, last validated ${daysSinceValidation} days ago)`);
          this.licenseData = cachedLicense;
          return;
        }
      }
      
      // Fallback to unlicensed mode
      console.warn('⚠️  Entering unlicensed mode (limited features)');
      this.licenseData = this.getDefaultUnlicensedMode();
    }
  }

  /**
   * Validate license JWT
   */
  private async validateLicense(licenseKey: string): Promise<LicenseData> {
    try {
      const decoded = jwt.verify(licenseKey, LicenseValidator.PUBLIC_KEY, {
        algorithms: ['RS256'], // Asymmetric signing
      }) as LicenseData;

      // Check license expiry
      if (decoded.expiresAt && decoded.expiresAt < Date.now() / 1000) {
        throw new Error('License has expired');
      }

      // Check subscription status
      if (decoded.subscription.status === 'canceled') {
        throw new Error('Subscription has been canceled');
      }

      return decoded;
    } catch (error: any) {
      throw new Error(`License validation failed: ${error.message}`);
    }
  }

  /**
   * Get default unlicensed mode (very limited)
   */
  private getDefaultUnlicensedMode(): LicenseData {
    return {
      customerId: 'unlicensed',
      customerName: 'Unlicensed Instance',
      plan: 'trial',
      features: {
        maxDevices: 3, // Very limited
        dataRetentionDays: 7,
        canExportData: false,
        hasAdvancedAlerts: false,
        hasApiAccess: true,
        hasMqttAccess: true,
        hasCustomBranding: false,
      },
      limits: {
        maxUsers: 1,
        maxAlertRules: 5,
        maxDashboards: 2,
      },
      trial: {
        isTrialMode: true,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      },
      subscription: {
        status: 'trialing',
        currentPeriodEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      issuedAt: Date.now() / 1000,
      expiresAt: (Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
    };
  }

  /**
   * Get current license data
   */
  getLicense(): LicenseData {
    if (!this.licenseData) {
      throw new Error('License not initialized. Call init() first.');
    }
    return this.licenseData;
  }

  /**
   * Check if feature is enabled
   */
  hasFeature(feature: keyof LicenseData['features']): boolean {
    return this.getLicense().features[feature] === true;
  }

  /**
   * Get feature limit
   */
  getLimit(limit: keyof LicenseData['limits']): number | undefined {
    return this.getLicense().limits[limit];
  }

  /**
   * Check if license is in trial mode
   */
  isTrialMode(): boolean {
    return this.getLicense().trial.isTrialMode;
  }

  /**
   * Check if subscription is active
   */
  isSubscriptionActive(): boolean {
    const status = this.getLicense().subscription.status;
    return status === 'active' || status === 'trialing';
  }

  /**
   * Get days until trial expires (returns null if not in trial)
   */
  getTrialDaysRemaining(): number | null {
    const license = this.getLicense();
    if (!license.trial.isTrialMode || !license.trial.expiresAt) {
      return null;
    }
    
    const daysLeft = Math.ceil(
      (new Date(license.trial.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );
    
    return Math.max(0, daysLeft);
  }
}
