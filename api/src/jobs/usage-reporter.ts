/**
 * Usage Reporter Job
 * Reports device count to Global Billing API daily
 */

import { DeviceModel } from '../db/models';
import { LicenseValidator } from '../services/license-validator';
import { BillingClient } from '../services/billing-client';

/**
 * Usage Reporter Job
 * Reports device count to Global Billing API daily
 */
export async function usageReporterJob() {
  console.log('📊 Reporting usage to Global Billing API...');
  
  try {
    const license = LicenseValidator.getInstance();
    const licenseData = license.getLicense();
    
    // Don't report for unlicensed mode
    if (licenseData.customerId === 'unlicensed') {
      console.log('⏭️  Skipping usage report (unlicensed mode)');
      return;
    }
    
    // Count active devices
    const devices = await DeviceModel.list({ isActive: true });
    const deviceCount = devices.length;
    
    // Prepare usage data
    const totalDevices = (await DeviceModel.list()).length;
    
    // Send to Global Billing API
    const billingClient = BillingClient.getInstance();
    if (billingClient.isConfigured()) {
      try {
        await billingClient.reportUsage(deviceCount, totalDevices);
      } catch (error: any) {
        console.error('❌ Failed to report usage to billing API:', error.message);
      }
    } else {
      console.warn('⚠️  BILLING_API_URL not set, skipping usage report');
    }
    
    console.log(`📊 Usage: ${deviceCount}/${totalDevices} active devices (max: ${licenseData.features.maxDevices})`);
    
    // Check if approaching limit
    if (deviceCount >= licenseData.features.maxDevices * 0.8) {
      console.warn(`⚠️  Approaching device limit: ${deviceCount}/${licenseData.features.maxDevices}`);
      // TODO: Send email notification when postoffice is ready
    }
  } catch (error) {
    console.error('❌ Usage reporter job failed:', error);
  }
}
