/**
 * Update device API key in agent's SQLite database
 * Usage: npx ts-node scripts/update-device-api-key.ts <device-api-key>
 */

import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '../data/database.sqlite');

function updateApiKey(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(new Error(`Failed to open database: ${err.message}`));
        return;
      }

      console.log(`\n📂 Database: ${dbPath}`);
      
      // First, check current device info
      db.get('SELECT uuid, deviceName, deviceApiKey FROM device LIMIT 1', [], (err, row: any) => {
        if (err) {
          db.close();
          reject(new Error(`Failed to query device info: ${err.message}`));
          return;
        }

        if (!row) {
          db.close();
          reject(new Error('No device found in database. Agent may not be initialized.'));
          return;
        }

        console.log(`\n📱 Current Device:`);
        console.log(`   UUID: ${row.uuid}`);
        console.log(`   Name: ${row.deviceName || 'Not set'}`);
        console.log(`   Old API Key: ${row.deviceApiKey ? row.deviceApiKey.substring(0, 16) + '...' : 'None'}`);

        // Update the API key
        db.run(
          'UPDATE device SET deviceApiKey = ? WHERE uuid = ?',
          [apiKey, row.uuid],
          function(err) {
            if (err) {
              db.close();
              reject(new Error(`Failed to update API key: ${err.message}`));
              return;
            }

            console.log(`\n✅ API key updated successfully!`);
            console.log(`   New API Key: ${apiKey.substring(0, 16)}...`);
            console.log(`\n⚠️  Restart the agent for changes to take effect.\n`);

            db.close((err) => {
              if (err) {
                console.error('Warning: Failed to close database:', err.message);
              }
              resolve();
            });
          }
        );
      });
    });
  });
}

// Main execution
const apiKey = process.argv[2];

if (!apiKey) {
  console.error('\n❌ Usage: npx ts-node scripts/update-device-api-key.ts <device-api-key>\n');
  console.error('Example:');
  console.error('  npx ts-node scripts/update-device-api-key.ts "FIMWs8QhCUMpABlUnaQx869Fb4bruoPe1sp_d6sUiaI"\n');
  process.exit(1);
}

updateApiKey(apiKey)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error.message, '\n');
    process.exit(1);
  });
