#!/usr/bin/env node
/**
 * Database Migration CLI
 * 
 * Usage:
 *   npm run migrate              - Run pending migrations
 *   npm run migrate:status       - Show migration status
 *   npm run migrate:create name  - Create new migration file
 */

import { runMigrations, getMigrationStatus } from '../src/db/migrations';
import * as fs from 'fs';
import * as path from 'path';

const command = process.argv[2];
const args = process.argv.slice(3);

async function showStatus() {
  console.log('📊 Database Migration Status\n');
  
  const status = await getMigrationStatus();
  
  console.log(`Applied migrations: ${status.applied.length}`);
  console.log(`Pending migrations: ${status.pending.length}`);
  console.log(`Total migrations:   ${status.total}\n`);
  
  if (status.applied.length > 0) {
    console.log('✅ Applied:');
    status.applied.forEach(m => {
      console.log(`   ${String(m.id).padStart(3, '0')} - ${m.name} (${m.applied_at.toISOString()})`);
    });
    console.log();
  }
  
  if (status.pending.length > 0) {
    console.log('⏳ Pending:');
    status.pending.forEach(m => {
      console.log(`   ${String(m.id).padStart(3, '0')} - ${m.name}`);
    });
    console.log();
  } else {
    console.log('✅ Database is up to date!\n');
  }
}

async function runPendingMigrations() {
  await runMigrations();
}

function createMigration(name: string) {
  if (!name) {
    console.error('❌ Migration name required');
    console.log('Usage: npm run migrate:create add_new_feature');
    process.exit(1);
  }
  
  const migrationsDir = path.join(__dirname, '../database/migrations');
  
  // Find next migration number
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  let nextNumber = 1;
  if (files.length > 0) {
    const lastFile = files[files.length - 1];
    const match = lastFile.match(/^(\d+)_/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }
  
  const filename = `${String(nextNumber).padStart(3, '0')}_${name}.sql`;
  const filepath = path.join(migrationsDir, filename);
  
  const template = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}
-- Description: Add description here

-- Add your SQL statements here
-- Example:
-- CREATE TABLE new_table (
--   id SERIAL PRIMARY KEY,
--   name VARCHAR(255) NOT NULL,
--   created_at TIMESTAMP DEFAULT NOW()
-- );

-- CREATE INDEX idx_new_table_name ON new_table(name);
`;
  
  fs.writeFileSync(filepath, template, 'utf8');
  
  console.log('✅ Created migration file:');
  console.log(`   ${filename}`);
  console.log(`   ${filepath}\n`);
}

async function main() {
  try {
    switch (command) {
      case 'status':
        await showStatus();
        break;
      
      case 'create':
        createMigration(args[0]);
        break;
      
      case 'run':
      case undefined:
        await runPendingMigrations();
        break;
      
      default:
        console.log('Database Migration CLI\n');
        console.log('Commands:');
        console.log('  npm run migrate              - Run pending migrations');
        console.log('  npm run migrate:status       - Show migration status');
        console.log('  npm run migrate:create name  - Create new migration file');
        process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
