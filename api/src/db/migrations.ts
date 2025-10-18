/**
 * Database Migration System
 * 
 * Automatically applies pending migrations on API startup
 * Tracks which migrations have been applied in a migrations table
 */

import { query, transaction } from './connection';
import * as fs from 'fs';
import * as path from 'path';

interface Migration {
  id: number;
  name: string;
  filename: string;
  sql: string;
}

interface AppliedMigration {
  id: number;
  name: string;
  applied_at: Date;
}

/**
 * Ensure migrations tracking table exists
 */
async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_number INTEGER NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      filename VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW(),
      checksum VARCHAR(64),
      execution_time_ms INTEGER
    );
    
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_number 
    ON schema_migrations(migration_number);
  `);
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(): Promise<AppliedMigration[]> {
  const result = await query<AppliedMigration>(`
    SELECT migration_number as id, name, applied_at 
    FROM schema_migrations 
    ORDER BY migration_number ASC
  `);
  return result.rows;
}

/**
 * Get all migration files from migrations directory
 */
function getMigrationFiles(): Migration[] {
  // When compiled, __dirname is dist/db/, so we need to go up to project root
  // In development (ts-node): __dirname = src/db/
  // In production (compiled): __dirname = dist/db/
  // Both need to find: database/migrations/
  const migrationsDir = path.join(__dirname, '../../database/migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.warn('⚠️  Migrations directory not found:', migrationsDir);
    console.warn(`   Looked in: ${migrationsDir}`);
    console.warn(`   __dirname: ${__dirname}`);
    return [];
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Sort by filename (001_, 002_, etc.)

  const migrations: Migration[] = [];

  for (const filename of files) {
    // Extract migration number from filename (e.g., "001_add_security_tables.sql" -> 1)
    const match = filename.match(/^(\d+)_(.+)\.sql$/);
    if (!match) {
      console.warn(`⚠️  Skipping invalid migration filename: ${filename}`);
      continue;
    }

    const id = parseInt(match[1], 10);
    const name = match[2].replace(/_/g, ' ');
    const filepath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filepath, 'utf8');

    migrations.push({ id, name, filename, sql });
  }

  return migrations;
}

/**
 * Calculate simple checksum for migration file
 */
function calculateChecksum(sql: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(sql).digest('hex');
}

/**
 * Apply a single migration
 */
async function applyMigration(migration: Migration): Promise<void> {
  const startTime = Date.now();
  
  console.log(`📄 Applying migration ${migration.id}: ${migration.name}`);
  
  await transaction(async (client) => {
    // Execute migration SQL
    await client.query(migration.sql);
    
    // Record migration as applied
    const executionTime = Date.now() - startTime;
    const checksum = calculateChecksum(migration.sql);
    
    await client.query(
      `INSERT INTO schema_migrations 
       (migration_number, name, filename, checksum, execution_time_ms) 
       VALUES ($1, $2, $3, $4, $5)`,
      [migration.id, migration.name, migration.filename, checksum, executionTime]
    );
  });
  
  const executionTime = Date.now() - startTime;
  console.log(`   ✅ Applied in ${executionTime}ms`);
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
  console.log('🔄 Checking for database migrations...\n');
  
  try {
    // Ensure migrations tracking table exists
    await ensureMigrationsTable();
    
    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map(m => m.id));
    
    console.log(`📊 Applied migrations: ${appliedMigrations.length}`);
    
    // Get all migration files
    const allMigrations = getMigrationFiles();
    console.log(`📋 Total migrations available: ${allMigrations.length}`);
    
    if (allMigrations.length === 0) {
      console.warn('⚠️  No migration files found!');
      console.warn('   This might indicate a path issue.');
      return;
    }
    
    console.log();
    
    // Find pending migrations
    const pendingMigrations = allMigrations.filter(m => !appliedIds.has(m.id));
    
    if (pendingMigrations.length === 0) {
      console.log('✅ Database is up to date (no pending migrations)\n');
      return;
    }
    
    console.log(`🔨 Found ${pendingMigrations.length} pending migration(s):\n`);
    
    // Apply each pending migration in order
    for (const migration of pendingMigrations) {
      try {
        await applyMigration(migration);
      } catch (error) {
        console.error(`\n❌ Migration ${migration.id} failed:`, error);
        console.error(`   File: ${migration.filename}`);
        throw new Error(`Migration ${migration.id} failed: ${(error as Error).message}`);
      }
    }
    
    console.log(`\n✅ Successfully applied ${pendingMigrations.length} migration(s)\n`);
    
  } catch (error) {
    console.error('❌ Migration system error:', error);
    throw error;
  }
}

/**
 * Get migration status (for CLI or admin endpoints)
 */
export async function getMigrationStatus(): Promise<{
  applied: AppliedMigration[];
  pending: Migration[];
  total: number;
}> {
  await ensureMigrationsTable();
  
  const appliedMigrations = await getAppliedMigrations();
  const appliedIds = new Set(appliedMigrations.map(m => m.id));
  
  const allMigrations = getMigrationFiles();
  const pendingMigrations = allMigrations.filter(m => !appliedIds.has(m.id));
  
  return {
    applied: appliedMigrations,
    pending: pendingMigrations,
    total: allMigrations.length
  };
}

/**
 * Rollback last migration (use with caution!)
 */
export async function rollbackLastMigration(): Promise<void> {
  console.warn('⚠️  Rollback functionality not implemented');
  console.warn('⚠️  Rollbacks should be done manually or with dedicated down migrations');
  throw new Error('Rollback not supported - create a new forward migration instead');
}

export default {
  runMigrations,
  getMigrationStatus,
  rollbackLastMigration
};
