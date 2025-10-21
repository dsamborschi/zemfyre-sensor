/**
 * Create MQTT Admin User
 * 
 * Creates a superuser admin account in mqtt_users table with bcrypt password hash
 * Compatible with mosquitto-go-auth PostgreSQL backend
 */

import bcrypt from 'bcrypt';
import { query } from '../src/db/connection';
import readline from 'readline';

const BCRYPT_ROUNDS = 10;

/**
 * Generate bcrypt hash compatible with mosquitto-go-auth
 */
async function generateBcryptHash(password: string): Promise<string> {
  return await bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Prompt user for input
 */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Create MQTT admin user
 */
async function createMqttAdmin() {
  console.log('🔐 Create MQTT Admin User');
  console.log('=========================\n');

  // Get username
  const username = await prompt('Enter username (default: admin): ') || 'admin';
  
  // Get password
  const password = await prompt('Enter password (default: iotistic42!): ') || 'iotistic42!';
  
  if (password.length < 8) {
    console.error('\n❌ Password must be at least 8 characters long!');
    process.exit(1);
  }

  console.log('\n📋 User Details:');
  console.log('   Username:', username);
  console.log('   Password:', password);
  console.log('   Superuser: true');
  console.log('   Algorithm: bcrypt');
  console.log('   Cost factor:', BCRYPT_ROUNDS);

  // Confirm
  const confirm = await prompt('\nProceed? (y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('❌ Cancelled');
    process.exit(0);
  }

  console.log('\n🔐 Generating bcrypt password hash...');
  const bcryptHash = await generateBcryptHash(password);
  console.log('✅ Hash generated:', bcryptHash.substring(0, 30) + '...');

  try {
    // Check if user already exists
    console.log('\n🔍 Checking if user exists...');
    const existingUser = await query(
      'SELECT username FROM mqtt_users WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      console.log('⚠️  User already exists!');
      const update = await prompt('Update password? (y/N): ');
      
      if (update.toLowerCase() === 'y') {
        await query(
          `UPDATE mqtt_users 
           SET password_hash = $1, 
               updated_at = NOW() 
           WHERE username = $2
           RETURNING username, is_superuser`,
          [bcryptHash, username]
        );
        console.log('\n✅ Password updated successfully!');
      } else {
        console.log('❌ Cancelled');
        process.exit(0);
      }
    } else {
      // Create new user
      console.log('\n📝 Creating MQTT user...');
      await query(
        `INSERT INTO mqtt_users (username, password_hash, is_superuser, is_active)
         VALUES ($1, $2, true, true)
         RETURNING username, is_superuser`,
        [username, bcryptHash]
      );
      console.log('✅ MQTT admin user created successfully!');
    }

    // Create default ACLs for admin (allow all topics)
    console.log('\n📝 Creating ACL entries...');
    
    // Check if ACLs exist
    const existingAcls = await query(
      'SELECT COUNT(*) as count FROM mqtt_acls WHERE username = $1',
      [username]
    );

    if (parseInt(existingAcls.rows[0].count) === 0) {
      // Allow read/write to all topics
      await query(
        `INSERT INTO mqtt_acls (username, topic, access, priority)
         VALUES 
           ($1, '#', 3, 100),      -- Read + Write to all topics
           ($1, '$SYS/#', 1, 100)  -- Read system topics
         ON CONFLICT DO NOTHING`,
        [username]
      );
      console.log('✅ ACL entries created (full access to all topics)');
    } else {
      console.log('⚠️  ACL entries already exist');
    }

    console.log('\n✅ Setup Complete!');
    console.log('\n📋 MQTT Connection Details:');
    console.log('   Broker: mqtt://localhost:1883');
    console.log('   Username:', username);
    console.log('   Password:', password);
    console.log('\n💡 Add to your .env file:');
    console.log(`   MQTT_USERNAME=${username}`);
    console.log(`   MQTT_PASSWORD=${password}`);
    console.log('\n🧪 Test connection:');
    console.log(`   mosquitto_pub -h localhost -p 1883 -u ${username} -P ${password} -t test -m "hello"`);
    console.log(`   mosquitto_sub -h localhost -p 1883 -u ${username} -P ${password} -t test`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run if executed directly
if (require.main === module) {
  createMqttAdmin().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { generateBcryptHash, createMqttAdmin };
