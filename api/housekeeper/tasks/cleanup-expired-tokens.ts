/**
 * Cleanup Expired Tokens Task
 * 
 * Removes expired access tokens and old OAuth sessions
 */

import { HousekeeperTask } from '../index';

const task: HousekeeperTask = {
  name: 'cleanup-expired-tokens',
  startup: true, // Run on startup
  // Run daily at random time (2-3am) to avoid clustering if multiple instances
  schedule: `${Math.floor(Math.random() * 60)} ${2 + Math.floor(Math.random() * 2)} * * *`,
  
  run: async (app) => {
    console.log('🧹 Cleaning up expired tokens...');

    try {
      const db = app.db || app.pg;
      if (!db) {
        console.warn('Database connection not available, skipping cleanup');
        return;
      }

      // Remove expired access tokens
      const tokenResult = await db.query(
        'DELETE FROM access_tokens WHERE expires_at < NOW()'
      );
      const tokensDeleted = tokenResult.rowCount || 0;
      console.log(`✅ Deleted ${tokensDeleted} expired access tokens`);

      // Remove OAuth sessions older than 5 minutes (abandoned auth flows)
      const sessionResult = await db.query(
        "DELETE FROM oauth_sessions WHERE created_at < NOW() - INTERVAL '5 minutes'"
      );
      const sessionsDeleted = sessionResult.rowCount || 0;
      console.log(`✅ Deleted ${sessionsDeleted} abandoned OAuth sessions`);

    } catch (error: any) {
      console.error('❌ Failed to cleanup expired tokens:', error.message);
      throw error;
    }
  }
};

export default task;
