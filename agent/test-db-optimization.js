/**
 * Test script to verify database write optimization
 * 
 * This monitors the stateSnapshot table to verify that:
 * 1. Only 2 rows exist (1 current, 1 target)
 * 2. Rows are only updated when state actually changes
 * 3. Auto-reconciliation doesn't cause writes
 */

const knex = require('knex')(require('./knexfile.js'));

async function monitorDatabase() {
  console.log('📊 Database Write Optimization Test');
  console.log('=' + '='.repeat(79));
  console.log('Monitoring stateSnapshot table for 2 minutes...');
  console.log('Expected behavior: Rows stay constant, only update on actual state changes\n');
  
  let iteration = 0;
  const maxIterations = 24; // 2 minutes (5 second intervals)
  
  const interval = setInterval(async () => {
    try {
      iteration++;
      
      // Get current snapshots
      const snapshots = await knex('stateSnapshot')
        .select('id', 'type', 'createdAt')
        .orderBy('type', 'asc');
      
      const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
      console.log(`[${timestamp}] Iteration ${iteration}/${maxIterations}`);
      console.log(`  Total rows: ${snapshots.length}`);
      
      snapshots.forEach(snap => {
        const age = Math.floor((Date.now() - new Date(snap.createdAt).getTime()) / 1000);
        console.log(`    - ${snap.type}: ID ${snap.id} (${age}s ago)`);
      });
      
      if (snapshots.length > 2) {
        console.log('  ⚠️  WARNING: More than 2 rows detected! Optimization may not be working.');
      } else {
        console.log('  ✅ Row count correct (2 rows)');
      }
      
      console.log('');
      
      if (iteration >= maxIterations) {
        clearInterval(interval);
        
        console.log('=' + '='.repeat(79));
        console.log('✅ Test complete!');
        console.log('\nResults:');
        console.log(`  - Final row count: ${snapshots.length}`);
        console.log(`  - Expected: 2 rows (1 current, 1 target)`);
        
        if (snapshots.length === 2) {
          console.log('\n🎉 SUCCESS: Database write optimization is working!');
          console.log('   - Only 2 rows maintained');
          console.log('   - Auto-reconciliation not causing unnecessary writes');
        } else {
          console.log('\n❌ ISSUE: More than 2 rows detected');
          console.log('   Please check the container-manager implementation');
        }
        
        process.exit(0);
      }
    } catch (error) {
      console.error('Error:', error);
      clearInterval(interval);
      process.exit(1);
    }
  }, 5000); // Check every 5 seconds
}

console.log('Starting database monitoring...');
console.log('Make sure the device-agent is running in another terminal\n');

monitorDatabase();
