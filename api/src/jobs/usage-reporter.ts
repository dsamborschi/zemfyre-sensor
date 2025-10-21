/**
 * Usage Reporter Job
 * Reports device count to Global Billing API daily
 * 
 * NOTE: Currently commented out until postoffice is ready
 * Will send daily usage reports to billing API for metered billing
 */

import { DeviceModel } from '../db/models';
import { LicenseValidator } from '../services/license-validator';
// import axios from 'axios'; // Uncomment when ready

/**
 * Usage Reporter Job
 * Reports device count to Global Billing API daily
 */
export async function usageReporterJob() {
  // COMMENTED OUT: Wait for postoffice to be ready
  // console.log('📊 Reporting usage to Global Billing API...');
  
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
    const usageData = {
      customerId: licenseData.customerId,
      instanceId: process.env.INSTANCE_ID || 'default',
      timestamp: new Date().toISOString(),
      metrics: {
        activeDevices: deviceCount,
        totalDevices: (await DeviceModel.list()).length,
      },
      license: {
        plan: licenseData.plan,
        maxDevices: licenseData.features.maxDevices,
      },
    };
    
    // COMMENTED OUT: Send to Global Billing API (when ready)
    /*
    const billingApiUrl = process.env.BILLING_API_URL;
    if (billingApiUrl) {
      await axios.post(
        `${billingApiUrl}/api/v1/usage/report`,
        usageData,
        {
          headers: {
            'Authorization': `Bearer ${process.env.ZEMFYRE_LICENSE_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        }
      );
      console.log(`✅ Usage reported: ${deviceCount} active devices`);
    } else {
      console.warn('⚠️  BILLING_API_URL not set, skipping usage report');
    }
    */
    
    console.log(`📊 Usage: ${deviceCount} active devices (max: ${licenseData.features.maxDevices})`);
    
    // Check if approaching limit
    if (deviceCount >= licenseData.features.maxDevices * 0.8) {
      console.warn(`⚠️  Approaching device limit: ${deviceCount}/${licenseData.features.maxDevices}`);
      
      // COMMENTED OUT: Send email notification (when postoffice ready)
      /*
      await sendEmail(
        licenseData.customerName,
        EmailTemplate.ApproachingDeviceLimit,
        {
          currentDevices: deviceCount,
          maxDevices: licenseData.features.maxDevices,
          upgradeUrl: process.env.BILLING_UPGRADE_URL,
        }
      );
      */
    }
  } catch (error) {
    console.error('❌ Usage reporter job failed:', error);
  }
}
