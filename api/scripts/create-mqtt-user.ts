import bcrypt from 'bcrypt';
import { query } from '../src/db/connection';

async function createMqttAdminUser(username: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await query(
    `INSERT INTO mqtt_users (username, password_hash, is_superuser, is_active)
     VALUES ($1, $2, true, true)
     ON CONFLICT (username) DO UPDATE SET password_hash = $2, is_superuser = true, is_active = true
     RETURNING id, username, is_superuser, is_active`,
    [username, passwordHash]
  );
  console.log('MQTT admin user created:', result.rows[0]);
}

createMqttAdminUser('admin', 'iotistic1234!').catch(console.error);