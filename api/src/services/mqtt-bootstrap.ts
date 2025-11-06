/**
 * MQTT Bootstrap Service
 * 
 * Handles initialization of MQTT admin user and ACLs
 * Replaces the Kubernetes postgres-init-job
 */

import bcrypt from 'bcrypt';
import { query } from '../db/connection';
import logger from '../utils/logger';

export async function initializeMqttAdmin() {
  const username = process.env.MQTT_USERNAME || 'admin';
  const password = process.env.MQTT_PASSWORD;

  if (!password) {
    logger.warn('MQTT_PASSWORD not set, skipping MQTT admin user creation');
    return;
  }

  try {
    logger.info('Initializing MQTT admin user...');
    
    // Hash password with bcrypt (same as K8s job did)
    const passwordHash = await bcrypt.hash(password, 10);

    // Create/update admin user (idempotent)
    await query(`
      INSERT INTO mqtt_users (username, password_hash, is_superuser, is_active)
      VALUES ($1, $2, TRUE, TRUE)
      ON CONFLICT (username) 
      DO UPDATE SET 
        password_hash = EXCLUDED.password_hash,
        is_superuser = TRUE,
        is_active = TRUE
    `, [username, passwordHash]);

    // Grant full access ACL to all topics (check if exists first)
    const existingAcl = await query(`
      SELECT id FROM mqtt_acls 
      WHERE username = $1 AND topic = '#'
      LIMIT 1
    `, [username]);

    if (existingAcl.rows.length === 0) {
      await query(`
        INSERT INTO mqtt_acls (username, topic, access, priority)
        VALUES ($1, '#', 7, 100)
      `, [username]);
    }

    logger.info(`MQTT admin user '${username}' initialized`);
  } catch (error) {
    logger.error('Failed to initialize MQTT admin user:', error);
    // Don't throw - not critical for API startup
  }
}
