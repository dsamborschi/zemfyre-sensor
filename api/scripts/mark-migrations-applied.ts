#!/usr/bin/env node
/**
 * Mark migrations as applied without running them
 * Use this when database already has schema but schema_migrations is empty
 * 
 * Usage: npm run migrate:mark-applied 1-13
 */

import { query } from '../src/db/connection';
import * as fs from 'fs';
import * as path from 'path';

async function calculateChecksum(sql: string): Promise<string> {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(sql).digest('hex');
}

async function markMigrationsAsApplied(rangeStr: string) {
  const [startStr, endStr] = rangeStr.split('-');
  const start = parseInt(startStr, 10);
  const end = parseInt(endStr, 10);
  
  if (isNaN(start) || isNaN(end)) {
    console.error('❌ Invalid range. Use format: 1-13');
    process.exit(1);
  }
  
  console.log(`📝 Marking migrations ${start} to ${end} as applied...\n`);
  
  const migrationsDir = path.join(__dirname, '../database/migrations');
  
  for (let num = start; num <= end; num++) {
    // Find migration file
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.startsWith(String(num).padStart(3, '0') + '_') && f.endsWith('.sql'));
    
    if (files.length === 0) {
      console.warn(`⚠️  Migration ${num} not found, skipping`);
      continue;
    }
    
    const filename = files[0];
    const filepath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filepath, 'utf8');
    const checksum = await calculateChecksum(sql);
    
    // Extract name from filename
    const match = filename.match(/^\d+_(.+)\.sql$/);
    const name = match ? match[1].replace(/_/g, ' ') : filename;
    
    try {
      // Check if already marked
      const existing = await query(
        'SELECT * FROM schema_migrations WHERE migration_number = $1',
        [num]
      );
      
      if (existing.rows.length > 0) {
        console.log(`   ⏭️  Migration ${num} already marked as applied`);
        continue;
      }
      
      // Mark as applied
      await query(
        `INSERT INTO schema_migrations 
         (migration_number, name, filename, checksum, execution_time_ms, applied_at) 
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [num, name, filename, checksum, 0]
      );
      
      console.log(`   ✅ Marked migration ${num}: ${name}`);
      
    } catch (error) {
      console.error(`   ❌ Failed to mark migration ${num}:`, error);
    }
  }
  
  console.log('\n✅ Done marking migrations as applied');
  process.exit(0);
}

const rangeArg = process.argv[2];

if (!rangeArg) {
  console.log('Mark Migrations as Applied\n');
  console.log('Usage: npm run migrate:mark-applied <range>');
  console.log('Example: npm run migrate:mark-applied 1-13');
  console.log('         npm run migrate:mark-applied 1-1   (single migration)');
  process.exit(1);
}

markMigrationsAsApplied(rangeArg).catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
