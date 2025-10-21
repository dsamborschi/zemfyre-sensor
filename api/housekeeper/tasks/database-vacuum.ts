/**
 * Database Vacuum Task
 * 
 * Runs PostgreSQL VACUUM ANALYZE maintenance operation
 */

import { HousekeeperTask } from '../index';

const task: HousekeeperTask = {
  name: 'database-vacuum',
  // Run weekly on Sunday at 4am
  schedule: '0 4 * * 0',
  
  run: async (app) => {
    console.log('🧹 Running database maintenance...');

    try {
      const db = app.db || app.pg;
      if (!db) {
        console.warn('Database connection not available, skipping vacuum');
        return;
      }

      // PostgreSQL VACUUM ANALYZE
      await db.query('VACUUM ANALYZE');
      console.log('✅ PostgreSQL VACUUM ANALYZE completed');

    } catch (error: any) {
      console.error('❌ Failed to run database maintenance:', error.message);
      throw error;
    }
  }
};

export default task;
