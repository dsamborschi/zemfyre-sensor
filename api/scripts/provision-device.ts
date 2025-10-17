/**
 * Provision Device Script
 * 
 * Creates a device through proper provisioning process.
 * This is how devices should be registered before deploying applications.
 * 
 * Usage:
 *   npx ts-node scripts/provision-device.ts --uuid=<uuid> --name="My Device"
 *   npx ts-node scripts/provision-device.ts --list
 */

import { query } from '../src/db/connection';
import { randomBytes } from 'crypto';

async function generateApiKey(): Promise<string> {
  // Generate a secure random API key
  return randomBytes(32).toString('hex');
}

async function provisionDevice(
  uuid: string,
  deviceName?: string,
  deviceType: string = 'raspberry-pi'
): Promise<{ uuid: string; apiKey: string }> {
  console.log(`\n🔐 Provisioning device: ${uuid}`);

  // Check if device already exists
  const existing = await query(
    'SELECT uuid, api_key FROM devices WHERE uuid = $1',
    [uuid]
  );

  if (existing.rows.length > 0) {
    console.log(`   ⚠️  Device already provisioned`);
    console.log(`   UUID: ${existing.rows[0].uuid}`);
    console.log(`   API Key: ${existing.rows[0].api_key ? '***' + existing.rows[0].api_key.slice(-8) : 'Not set'}`);
    return {
      uuid: existing.rows[0].uuid,
      apiKey: existing.rows[0].api_key
    };
  }

  // Generate API key
  const apiKey = await generateApiKey();

  // Create device
  await query(
    `INSERT INTO devices (
      uuid, 
      device_name, 
      device_type, 
      api_key,
      is_online, 
      is_active,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      uuid,
      deviceName || `Device-${uuid.substring(0, 8)}`,
      deviceType,
      apiKey,
      false,
      true
    ]
  );

  // Create empty target state
  await query(
    `INSERT INTO device_target_state (
      device_uuid,
      apps,
      config,
      version
    ) VALUES ($1, $2, $3, $4)`,
    [uuid, '{}', '{}', 0]
  );

  console.log(`   ✅ Device provisioned successfully!`);
  console.log(`   UUID: ${uuid}`);
  console.log(`   Name: ${deviceName || `Device-${uuid.substring(0, 8)}`}`);
  console.log(`   Type: ${deviceType}`);
  console.log(`   API Key: ${apiKey}`);
  console.log(`\n   ⚠️  Save this API key - it won't be shown again!`);

  return { uuid, apiKey };
}

async function listDevices(): Promise<void> {
  console.log('\n📋 Provisioned devices:\n');

  const devices = await query(`
    SELECT 
      d.uuid, 
      d.device_name, 
      d.device_type, 
      d.is_online, 
      d.is_active,
      d.created_at,
      dts.apps
    FROM devices d
    LEFT JOIN device_target_state dts ON d.uuid = dts.device_uuid
    ORDER BY d.created_at DESC
  `);

  if (devices.rows.length === 0) {
    console.log('   No devices provisioned yet.');
    console.log('\n   To provision a device:');
    console.log('   npx ts-node scripts/provision-device.ts --uuid=<uuid> --name="Device Name"');
    return;
  }

  devices.rows.forEach((device, index) => {
    const apps = device.apps ? (typeof device.apps === 'string' ? JSON.parse(device.apps) : device.apps) : {};
    const appCount = Object.keys(apps).length;

    console.log(`${index + 1}. ${device.device_name}`);
    console.log(`   UUID: ${device.uuid}`);
    console.log(`   Type: ${device.device_type || 'unknown'}`);
    console.log(`   Status: ${device.is_online ? '🟢 Online' : '🔴 Offline'} | ${device.is_active ? '✅ Active' : '❌ Inactive'}`);
    console.log(`   Apps: ${appCount}`);
    console.log(`   Created: ${device.created_at}`);
    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total: ${devices.rows.length} device(s)`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   Device Provisioning Tool');
  console.log('═══════════════════════════════════════════════════════════');

  const args = process.argv.slice(2);
  const uuid = args.find(arg => arg.startsWith('--uuid='))?.split('=')[1];
  const name = args.find(arg => arg.startsWith('--name='))?.split('=')[1];
  const type = args.find(arg => arg.startsWith('--type='))?.split('=')[1] || 'raspberry-pi';
  const listOnly = args.includes('--list');

  try {
    if (listOnly) {
      await listDevices();
      return;
    }

    if (!uuid) {
      console.log('\n❌ Error: Device UUID is required');
      console.log('\nUsage:');
      console.log('  npx ts-node scripts/provision-device.ts --uuid=<uuid> [--name="Name"] [--type=<type>]');
      console.log('  npx ts-node scripts/provision-device.ts --list');
      console.log('\nExamples:');
      console.log('  npx ts-node scripts/provision-device.ts --uuid=abc123-456-789 --name="Kitchen Sensor"');
      console.log('  npx ts-node scripts/provision-device.ts --uuid=xyz789-012-345 --type=raspberry-pi');
      console.log('  npx ts-node scripts/provision-device.ts --list');
      process.exit(1);
    }

    // Provision the device
    const result = await provisionDevice(uuid, name, type);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   Next Steps');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n1. Configure device with API key:');
    console.log(`   API_KEY=${result.apiKey}`);
    console.log('\n2. Deploy applications:');
    console.log(`   npx ts-node scripts/create-and-deploy-app.ts --device=${uuid}`);
    console.log('\n3. List all devices:');
    console.log('   npx ts-node scripts/provision-device.ts --list\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { provisionDevice, listDevices };
