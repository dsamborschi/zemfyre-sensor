/**
 * Add API key authentication to customers table
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('customers', (table) => {
    // API key for customer instance authentication
    table.string('api_key_hash', 255).nullable();
    table.timestamp('api_key_created_at').nullable();
    table.timestamp('api_key_last_used').nullable();
    
    // Add indexes
    table.index('api_key_hash');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('customers', (table) => {
    table.dropColumn('api_key_hash');
    table.dropColumn('api_key_created_at');
    table.dropColumn('api_key_last_used');
  });
}
