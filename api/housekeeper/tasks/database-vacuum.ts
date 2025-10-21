/**
 * Database Vacuum Task
 * 
 * Runs database maintenance operations (PostgreSQL VACUUM, MongoDB compact, etc.)
 */

import { HousekeeperTask } from '../index';

const task: HousekeeperTask = {
  name: 'database-vacuum',
  // Run weekly on Sunday at 4am
  schedule: '0 4 * * 0',
  
  run: async (app) => {
    console.log('🧹 Running database maintenance...');

    const dbType = app.config?.database?.type || 'postgres';

    try {
      if (dbType === 'postgres') {
        // PostgreSQL VACUUM ANALYZE
        const db = app.db || app.pg;
        if (!db) {
          console.warn('Database connection not available, skipping vacuum');
          return;
        }

        await db.query('VACUUM ANALYZE');
        console.log('✅ PostgreSQL VACUUM ANALYZE completed');

      } else if (dbType === 'mongodb') {
        // MongoDB compact collections
        const mongoose = app.mongoose || require('mongoose');
        const collections = await mongoose.connection.db.listCollections().toArray();

        for (const collection of collections) {
          try {
            await mongoose.connection.db.command({
              compact: collection.name
            });
            console.log(`  Compacted: ${collection.name}`);
          } catch (error: any) {
            console.warn(`  Failed to compact ${collection.name}:`, error.message);
          }
        }

        console.log(`✅ MongoDB compact completed for ${collections.length} collections`);

      } else {
        console.log(`Unsupported database type: ${dbType}, skipping vacuum`);
      }

    } catch (error: any) {
      console.error('❌ Failed to run database maintenance:', error.message);
      throw error;
    }
  }
};

export default task;
