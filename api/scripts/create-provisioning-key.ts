/**
 * Script to create a provisioning key for testing
 * Usage: npx ts-node scripts/create-provisioning-key.ts
 */

import { createProvisioningKey } from '../src/utils/provisioning-keys';
import { pool } from '../src/db/connection';

async function main() {
  try {
    console.log('🔑 Creating provisioning key...\n');

    const fleetId = process.env.FLEET_ID || 'default-fleet';
    const maxDevices = parseInt(process.env.MAX_DEVICES || '100');
    const expiresInDays = parseInt(process.env.EXPIRES_IN_DAYS || '365');
    const description = process.env.DESCRIPTION || 'Test provisioning key';

    const { id, key } = await createProvisioningKey(
      fleetId,
      maxDevices,
      expiresInDays,
      description,
      'admin'
    );

    console.log('✅ Provisioning key created successfully!\n');
    console.log('══════════════════════════════════════════════════════════════');
    console.log(`Key ID:          ${id}`);
    console.log(`Fleet ID:        ${fleetId}`);
    console.log(`Max Devices:     ${maxDevices}`);
    console.log(`Expires in:      ${expiresInDays} days`);
    console.log(`Description:     ${description}`);
    console.log('══════════════════════════════════════════════════════════════');
    console.log('\n🔐 PROVISIONING KEY (save this securely):');
    console.log('──────────────────────────────────────────────────────────────');
    console.log(key);
    console.log('──────────────────────────────────────────────────────────────');
    console.log('\n⚠️  WARNING: This key will only be displayed once!');
    console.log('   Store it securely - it cannot be recovered.\n');
    console.log('Usage in install.sh:');
    console.log(`   PROVISIONING_API_KEY="${key}" ./bin/install.sh\n`);
    console.log('Or set in environment:');
    console.log(`   export PROVISIONING_API_KEY="${key}"`);
    console.log('   ./bin/install.sh\n');

  } catch (error: any) {
    console.error('❌ Error creating provisioning key:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
