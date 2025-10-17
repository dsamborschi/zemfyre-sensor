/**
 * Manually apply event sourcing migration
 */

import pool from '../src/db/connection';
import fs from 'fs';
import path from 'path';

async function applyEventSourcingMigration() {
  console.log('🚀 Applying Event Sourcing Migration (006)...\n');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '../database/migrations/006_add_event_sourcing.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Executing migration SQL...');
    await pool.query(sql);

    console.log('\n✅ Event sourcing migration complete!\n');

    // Check results
    const eventTypes = await pool.query('SELECT COUNT(*) FROM event_types');
    console.log(`📊 Event types registered: ${eventTypes.rows[0].count}`);

    const partitions = await pool.query(`
      SELECT COUNT(*) FROM pg_tables 
      WHERE tablename LIKE 'events_%'
    `);
    console.log(`📦 Event partitions created: ${partitions.rows[0].count}`);

    // List recent event types
    const recentTypes = await pool.query(`
      SELECT event_type, aggregate_type, description 
      FROM event_types 
      ORDER BY event_type 
      LIMIT 10
    `);

    console.log('\n🏷️  Sample event types:');
    for (const type of recentTypes.rows) {
      console.log(`   ${type.event_type.padEnd(35)} (${type.aggregate_type})`);
    }

    console.log('\n🎉 Event sourcing is ready to use!');
    console.log('\n💡 Next steps:');
    console.log('   1. Test: npx ts-node scripts/test-event-sourcing.ts');
    console.log('   2. Read guide: docs/EVENT-SOURCING-GUIDE.md');
    console.log('   3. Integrate: Add EventPublisher to your code\n');

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.close();
  }
}

applyEventSourcingMigration();
