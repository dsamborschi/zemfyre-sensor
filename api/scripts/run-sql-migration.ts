/**
 * Run SQL Migration
 * Executes SQL migration files against PostgreSQL
 */

import pool from '../src/db/connection';
import fs from 'fs';
import path from 'path';

async function runMigration(filename: string) {
  console.log(`🔄 Running migration: ${filename}\n`);
  
  const sqlPath = path.join(__dirname, '..', 'database', 'migrations', filename);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  
  // Remove psql-specific commands
  const cleanSql = sql
    .split('\n')
    .filter(line => !line.trim().startsWith('\\'))
    .join('\n');
  
  try {
    await pool.query(cleanSql);
    console.log(`✅ Migration ${filename} completed successfully\n`);
  } catch (error: any) {
    console.error(`❌ Migration ${filename} failed:`);
    console.error(error.message);
    throw error;
  }
}

async function main() {
  const migrationFile = process.argv[2] || '007_add_image_update_management.sql';
  
  try {
    await runMigration(migrationFile);
    console.log('Done!');
  } catch (error) {
    process.exit(1);
  } finally {
    await pool.close();
  }
}

main();
