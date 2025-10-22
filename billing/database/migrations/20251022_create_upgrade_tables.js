/**
 * Migration: Create system_upgrades and customer_upgrade_logs tables
 */

exports.up = function(knex) {
  return Promise.all([
    // Create system_upgrades table
    knex.schema.createTable('system_upgrades', table => {
      table.increments('id').primary();
      table.string('component', 50).notNullable();
      table.string('from_version', 50);
      table.string('to_version', 50).notNullable();
      table.string('strategy', 20).notNullable(); // all, canary, batch
      table.integer('total_customers').notNullable().defaultTo(0);
      table.integer('completed_customers').notNullable().defaultTo(0);
      table.integer('failed_customers').notNullable().defaultTo(0);
      table.string('status', 50).notNullable().defaultTo('pending');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('started_at');
      table.timestamp('completed_at');
      table.jsonb('metadata'); // Additional upgrade metadata
      
      table.index('status');
      table.index('created_at');
      table.index('component');
    }),

    // Create customer_upgrade_logs table
    knex.schema.createTable('customer_upgrade_logs', table => {
      table.increments('id').primary();
      table.integer('upgrade_id').references('id').inTable('system_upgrades').onDelete('CASCADE');
      table.string('customer_id', 255).notNullable();
      table.string('component', 50).notNullable();
      table.string('from_version', 50);
      table.string('to_version', 50).notNullable();
      table.string('status', 50).notNullable().defaultTo('pending');
      table.timestamp('started_at');
      table.timestamp('completed_at');
      table.text('output'); // Helm output
      table.text('error'); // Error message if failed
      
      table.index('upgrade_id');
      table.index('customer_id');
      table.index('status');
      table.index('started_at');
    })
  ]);
};

exports.down = function(knex) {
  return Promise.all([
    knex.schema.dropTableIfExists('customer_upgrade_logs'),
    knex.schema.dropTableIfExists('system_upgrades')
  ]);
};
