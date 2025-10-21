/**
 * Database Vacuum Task
 * 
 * Runs PostgreSQL VACUUM ANALYZE maintenance operation
 */

import { HousekeeperTask } from '../index';
import { query } from '../../src/db/connection';

const task: HousekeeperTask = {
  name: 'database-vacuum',
  // Run weekly on Sunday at 4am
  schedule: '0 4 * * 0',
  
  run: async () => {
    console.log('🧹 Running database maintenance...');

    try {
      // PostgreSQL VACUUM ANALYZE
      await query('VACUUM ANALYZE');
      console.log('✅ PostgreSQL VACUUM ANALYZE completed');

    } catch (error: any) {
      console.error('❌ Failed to run database maintenance:', error.message);
      throw error;
    }
  }
};

export default task;
