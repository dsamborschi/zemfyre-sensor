/**
 * Quick test to verify migration system can find files
 * Run with: npm run test:migrations
 */

import { getMigrationStatus } from '../src/db/migrations';
import * as path from 'path';
import * as fs from 'fs';

async function testMigrations() {
  console.log('🧪 Testing Migration System\n');
  
  // Test 1: Check __dirname
  console.log('1️⃣  Checking paths:');
  console.log(`   __dirname: ${__dirname}`);
  console.log(`   process.cwd(): ${process.cwd()}`);
  
  // Test 2: Check if migrations directory exists
  const migrationsDir = path.join(__dirname, '../database/migrations');
  console.log(`\n2️⃣  Checking migrations directory:`);
  console.log(`   Path: ${migrationsDir}`);
  console.log(`   Exists: ${fs.existsSync(migrationsDir)}`);
  
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    console.log(`   Files found: ${files.length}`);
    files.forEach(f => console.log(`      - ${f}`));
  }
  
  // Test 3: Try to get migration status
  try {
    console.log(`\n3️⃣  Getting migration status from database...`);
    const status = await getMigrationStatus();
    console.log(`   ✅ Applied: ${status.applied.length}`);
    console.log(`   ⏳ Pending: ${status.pending.length}`);
    console.log(`   📋 Total: ${status.total}`);
    
    if (status.pending.length > 0) {
      console.log(`\n   Pending migrations:`);
      status.pending.forEach(m => {
        console.log(`      ${String(m.id).padStart(3, '0')} - ${m.name}`);
      });
    }
    
    if (status.applied.length > 0) {
      console.log(`\n   Applied migrations:`);
      status.applied.forEach(m => {
        console.log(`      ${String(m.id).padStart(3, '0')} - ${m.name}`);
      });
    }
    
  } catch (error) {
    console.error('   ❌ Failed to get migration status:', error);
  }
  
  console.log('\n✅ Migration system test complete');
  process.exit(0);
}

testMigrations().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
