/**
 * Database Migration Runner
 * Runs all SQL migration files in the migrations directory
 */

import fs from 'fs';
import path from 'path';
import { pool, query } from '../src/db/connection';

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '../database/migrations');
  
  try {
    console.log('🔄 Running database migrations...\n');

    // Check if migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      console.log('⚠️  No migrations directory found. Creating it...');
      fs.mkdirSync(migrationsDir, { recursive: true });
      console.log('✅ Migrations directory created.');
      return;
    }

    // Get all .sql files
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Run in alphabetical order

    if (files.length === 0) {
      console.log('⚠️  No migration files found.');
      return;
    }

    console.log(`Found ${files.length} migration file(s):\n`);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      console.log(`📝 Running migration: ${file}`);
      
      try {
        await query(sql);
        console.log(`   ✅ Success\n`);
      } catch (error: any) {
        // Check if error is "already exists" - that's okay
        if (error.message.includes('already exists')) {
          console.log(`   ℹ️  Already applied (skipping)\n`);
        } else {
          throw error;
        }
      }
    }

    console.log('✅ All migrations completed successfully!\n');

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
