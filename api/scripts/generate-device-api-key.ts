/**
 * Generate a new API key for a device
 * Usage: npx ts-node scripts/generate-device-api-key.ts <device-uuid>
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'iotistic',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

/**
 * Generate cryptographically secure API key
 */
function generateApiKey(): string {
  return crypto.randomBytes(32).toString('base64url');
}

async function generateDeviceApiKey(deviceUuid: string) {
  const client = await pool.connect();
  
  try {
    // Check if device exists
    const deviceResult = await client.query(
      'SELECT uuid, device_name FROM devices WHERE uuid = $1',
      [deviceUuid]
    );
    
    if (deviceResult.rows.length === 0) {
      console.error(`❌ Device not found: ${deviceUuid}`);
      process.exit(1);
    }
    
    const device = deviceResult.rows[0];
    console.log(`\n📱 Device: ${device.device_name} (${device.uuid})`);
    
    // Generate new API key
    const newApiKey = generateApiKey();
    const hash = await bcrypt.hash(newApiKey, 10);
    
    // Update device with new API key
    await client.query(
      'UPDATE devices SET device_api_key_hash = $1 WHERE uuid = $2',
      [hash, deviceUuid]
    );
    
    console.log(`\n✅ New API key generated successfully!\n`);
    console.log(`🔑 API Key: ${newApiKey}\n`);
    console.log(`⚠️  Save this key securely - it cannot be retrieved again!\n`);
    console.log(`\n📖 Usage with update-target-state.ps1:`);
    console.log(`   .\\update-target-state.ps1 -DeviceUuid "${deviceUuid}" -ApiKey "${newApiKey}"\n`);
    
  } catch (error: any) {
    console.error('❌ Error generating API key:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Main execution
const deviceUuid = process.argv[2];

if (!deviceUuid) {
  console.error('\n❌ Usage: npx ts-node scripts/generate-device-api-key.ts <device-uuid>\n');
  process.exit(1);
}

generateDeviceApiKey(deviceUuid);
