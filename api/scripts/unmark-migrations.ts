/**
 * Unmark migrations that were marked as applied but not actually run
 * This allows them to be re-applied by the migration system
 */

import { query } from '../src/db/connection';

async function unmarkMigrations(migrationNumbers: number[]) {
  console.log(`🔄 Unmarking migrations: ${migrationNumbers.join(', ')}\n`);
  
  for (const num of migrationNumbers) {
    try {
      const result = await query(
        'DELETE FROM schema_migrations WHERE migration_number = $1 RETURNING *',
        [num]
      );
      
      if (result.rowCount && result.rowCount > 0) {
        console.log(`   ✅ Unmarked migration ${num}: ${result.rows[0].name}`);
      } else {
        console.log(`   ⏭️  Migration ${num} was not marked as applied`);
      }
    } catch (error) {
      console.error(`   ❌ Failed to unmark migration ${num}:`, error);
    }
  }
  
  console.log('\n✅ Done unmarking migrations');
  console.log('\nNext step: Run `npm run dev` to apply these migrations');
  process.exit(0);
}

const args = process.argv.slice(2).map(n => parseInt(n, 10));

if (args.length === 0) {
  console.log('Unmark Migrations\n');
  console.log('Usage: npm run migrate:unmark <migration numbers>');
  console.log('Example: npm run migrate:unmark 13 14');
  process.exit(1);
}

unmarkMigrations(args);
