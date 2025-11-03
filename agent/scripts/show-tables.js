#!/usr/bin/env node

/**
 * Show Database Tables
 * ====================
 * 
 * Shows all tables in the device.db database.
 */

const knex = require('knex');
const path = require('path');

async function showTables() {
  const db = knex({
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, '../data/device.sqlite'),
    },
    useNullAsDefault: true,
  });

  try {
    const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
    
    console.log('📋 Tables in device.db:\n');
    tables.forEach(row => {
      console.log(`  - ${row.name}`);
    });
    console.log();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

showTables();
