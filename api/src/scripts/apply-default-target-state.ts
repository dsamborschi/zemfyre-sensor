/**
 * Apply Default Target State to Existing Devices
 * 
 * This script finds all devices without target state and creates
 * default configuration based on the customer's license features.
 * 
 * Run with:
 *   npm run apply-default-target-state
 * 
 * Or manually:
 *   npx ts-node src/scripts/apply-default-target-state.ts
 */

import { query } from '../db/connection';
import { DeviceTargetStateModel } from '../db/models';
import { SystemConfigModel } from '../db/system-config-model';
import { generateDefaultTargetState } from '../services/default-target-state-generator';

interface Device {
  uuid: string;
  device_name: string | null;
  provisioned_at: Date | null;
}

async function applyDefaultTargetState() {
  console.log('🔄 Starting default target state application...\n');

  try {
    // Get license data
    const licenseData = await SystemConfigModel.get('license_data');
    if (!licenseData) {
      console.log('⚠️  No license data found in system_config');
      console.log('   Using default configuration (trial mode)');
    } else {
      console.log(`📋 License: ${licenseData.plan || 'unknown'} plan`);
      console.log(`   Subscription: ${licenseData.subscription?.status || 'unknown'}`);
    }

    // Find devices without target state
    const result = await query<Device>(
      `SELECT d.uuid, d.device_name, d.provisioned_at
       FROM devices d
       LEFT JOIN device_target_state dts ON d.uuid = dts.device_uuid
       WHERE dts.device_uuid IS NULL
       AND d.provisioned_at IS NOT NULL
       ORDER BY d.provisioned_at DESC`
    );

    const devicesWithoutState = result.rows;

    if (devicesWithoutState.length === 0) {
      console.log('✅ All provisioned devices already have target state!');
      console.log('   Nothing to do.');
      return;
    }

    console.log(`\n📊 Found ${devicesWithoutState.length} device(s) without target state:\n`);

    // Generate default config
    const { apps, config } = generateDefaultTargetState(licenseData);

    console.log('   Default Config:');
    console.log(`   - Logging Level: ${config.logging.level}`);
    console.log(`   - Metrics Interval: ${config.settings.metricsIntervalMs}ms (${config.settings.metricsIntervalMs / 1000}s)`);
    console.log(`   - Device Report Interval: ${config.settings.deviceReportIntervalMs}ms`);
    console.log(`   - Cloud Jobs: ${config.features.enableCloudJobs ? 'Enabled' : 'Disabled'}`);
    console.log(`   - Metrics Export: ${config.features.enableMetricsExport ? 'Enabled' : 'Disabled'}`);
    console.log('');

    // Apply to each device
    let successCount = 0;
    let errorCount = 0;

    for (const device of devicesWithoutState) {
      try {
        console.log(`   Processing: ${device.device_name || device.uuid.substring(0, 8)}`);
        console.log(`      UUID: ${device.uuid}`);
        console.log(`      Provisioned: ${device.provisioned_at?.toISOString() || 'unknown'}`);

        // Set target state
        await DeviceTargetStateModel.set(device.uuid, apps, config);
        
        console.log(`      ✅ Target state created`);
        successCount++;

      } catch (error) {
        console.error(`      ❌ Error:`, error instanceof Error ? error.message : String(error));
        errorCount++;
      }
      console.log('');
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n✅ Summary:`);
    console.log(`   Total Devices: ${devicesWithoutState.length}`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);

    if (successCount > 0) {
      console.log(`\n💡 Devices will receive new target state on next poll (within 10 seconds)`);
      console.log(`   Metrics should start appearing in dashboard within ${config.settings.metricsIntervalMs / 1000}s`);
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  applyDefaultTargetState()
    .then(() => {
      console.log('\n✅ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

export { applyDefaultTargetState };
