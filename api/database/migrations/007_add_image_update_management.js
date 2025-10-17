/**
 * Migration: Add Image Update Management Tables
 * 
 * Supports:
 * - Webhook-driven updates from Docker registries
 * - Multiple update strategies (auto, staged, manual, scheduled)
 * - Rollout tracking and health monitoring
 * - Automatic rollback on failures
 */

exports.up = async function(knex) {
  // 1. Image Update Policies
  await knex.schema.createTable('image_update_policies', (table) => {
    table.increments('id').primary();
    table.string('image_pattern', 255).notNullable().comment('e.g., iotistic/app:* or iotistic/*:latest');
    table.enum('update_strategy', ['auto', 'staged', 'manual', 'scheduled']).notNullable();
    
    // Staged rollout settings
    table.integer('staged_batches').defaultTo(3).comment('Number of batches for staged rollout');
    table.integer('batch_delay_minutes').defaultTo(30).comment('Wait time between batches');
    
    // Health check settings
    table.boolean('health_check_enabled').defaultTo(true);
    table.integer('health_check_timeout_seconds').defaultTo(300);
    table.boolean('auto_rollback').defaultTo(true);
    table.jsonb('health_check_config').comment('HTTP endpoint, expected status, etc.');
    
    // Scheduling
    table.time('maintenance_window_start').comment('e.g., 02:00:00 for 2 AM');
    table.time('maintenance_window_end').comment('e.g., 04:00:00 for 4 AM');
    
    // Filters
    table.string('fleet_id', 255).comment('Limit to specific fleet');
    table.jsonb('device_tags').comment('Only devices with these tags');
    table.specificType('device_uuids', 'TEXT[]').comment('Specific device list');
    
    // Metadata
    table.boolean('enabled').defaultTo(true);
    table.integer('priority').defaultTo(100).comment('Higher priority policies applied first');
    table.text('description');
    
    table.timestamps(true, true);
    
    // Indexes
    table.index('image_pattern');
    table.index('update_strategy');
    table.index('enabled');
  });

  // 2. Image Rollouts
  await knex.schema.createTable('image_rollouts', (table) => {
    table.increments('id').primary();
    table.string('rollout_id', 255).unique().notNullable();
    
    // Image info
    table.string('image_name', 255).notNullable();
    table.string('old_tag', 100);
    table.string('new_tag', 100).notNullable();
    table.string('registry', 255).defaultTo('hub.docker.com');
    
    // Policy reference
    table.integer('policy_id').unsigned().references('id').inTable('image_update_policies').onDelete('SET NULL');
    
    // Rollout settings
    table.enum('strategy', ['auto', 'staged', 'manual', 'scheduled']).notNullable();
    table.integer('total_devices').notNullable();
    table.jsonb('batch_sizes').comment('Array of device counts per batch');
    
    // Progress tracking
    table.enum('status', [
      'pending',
      'scheduled', 
      'in_progress',
      'paused',
      'completed',
      'failed',
      'cancelled',
      'rolled_back'
    ]).defaultTo('pending');
    
    table.integer('current_batch').defaultTo(0);
    table.integer('updated_devices').defaultTo(0);
    table.integer('failed_devices').defaultTo(0);
    table.integer('healthy_devices').defaultTo(0);
    table.integer('rolled_back_devices').defaultTo(0);
    
    // Failure tracking
    table.decimal('failure_rate', 5, 4).defaultTo(0).comment('0.0000 to 1.0000');
    table.boolean('auto_paused').defaultTo(false).comment('Auto-paused due to high failure rate');
    
    // Timestamps
    table.timestamp('scheduled_at');
    table.timestamp('started_at');
    table.timestamp('paused_at');
    table.timestamp('resumed_at');
    table.timestamp('completed_at');
    table.timestamps(true, true);
    
    // Metadata
    table.string('triggered_by', 100).comment('webhook, manual, scheduled, api');
    table.jsonb('webhook_payload').comment('Original webhook data');
    table.jsonb('filters_applied').comment('Fleet ID, tags, etc.');
    table.text('error_message');
    table.text('notes');
    
    // Indexes
    table.index('rollout_id');
    table.index('status');
    table.index(['image_name', 'new_tag']);
    table.index('created_at');
  });

  // 3. Device Rollout Status
  await knex.schema.createTable('device_rollout_status', (table) => {
    table.increments('id').primary();
    table.string('rollout_id', 255).notNullable();
    table.string('device_uuid', 255).notNullable();
    
    // Update progress
    table.integer('batch_number').notNullable();
    table.enum('status', [
      'pending',
      'scheduled',
      'pulling',
      'updating',
      'health_checking',
      'completed',
      'failed',
      'rolled_back',
      'skipped'
    ]).defaultTo('pending');
    
    // Image tracking
    table.string('old_image_tag', 100);
    table.string('new_image_tag', 100);
    table.string('current_image_tag', 100);
    
    // Health tracking
    table.boolean('health_check_passed');
    table.jsonb('health_check_details').comment('HTTP status, response time, etc.');
    table.integer('health_check_attempts').defaultTo(0);
    
    // Timestamps
    table.timestamp('scheduled_at');
    table.timestamp('update_started_at');
    table.timestamp('image_pulled_at');
    table.timestamp('container_restarted_at');
    table.timestamp('health_checked_at');
    table.timestamp('update_completed_at');
    table.timestamp('rolled_back_at');
    table.timestamps(true, true);
    
    // Error tracking
    table.text('error_message');
    table.jsonb('error_details');
    table.integer('retry_count').defaultTo(0);
    table.integer('max_retries').defaultTo(3);
    
    // Foreign keys
    table.foreign('rollout_id').references('rollout_id').inTable('image_rollouts').onDelete('CASCADE');
    table.foreign('device_uuid').references('device_uuid').inTable('devices').onDelete('CASCADE');
    
    // Indexes
    table.index(['rollout_id', 'device_uuid']);
    table.index('status');
    table.index('batch_number');
    table.unique(['rollout_id', 'device_uuid']); // One status per device per rollout
  });

  // 4. Rollout Events (optional - for detailed logging)
  await knex.schema.createTable('rollout_events', (table) => {
    table.increments('id').primary();
    table.string('rollout_id', 255).notNullable();
    table.string('device_uuid', 255);
    table.enum('event_type', [
      'rollout_created',
      'rollout_started',
      'batch_started',
      'batch_completed',
      'device_scheduled',
      'device_updated',
      'device_failed',
      'health_check_passed',
      'health_check_failed',
      'rollback_triggered',
      'rollout_paused',
      'rollout_resumed',
      'rollout_completed',
      'rollout_failed'
    ]).notNullable();
    
    table.jsonb('event_data');
    table.text('message');
    table.timestamp('timestamp').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('rollout_id');
    table.index('device_uuid');
    table.index('event_type');
    table.index('timestamp');
  });

  // 5. Add helpful views
  await knex.raw(`
    CREATE VIEW active_rollouts AS
    SELECT 
      r.*,
      p.image_pattern,
      p.description as policy_description,
      (r.updated_devices::float / NULLIF(r.total_devices, 0) * 100) as progress_percentage,
      COUNT(DISTINCT d.device_uuid) FILTER (WHERE d.status = 'completed') as devices_completed,
      COUNT(DISTINCT d.device_uuid) FILTER (WHERE d.status = 'failed') as devices_failed,
      COUNT(DISTINCT d.device_uuid) FILTER (WHERE d.status IN ('pending', 'scheduled')) as devices_pending
    FROM image_rollouts r
    LEFT JOIN image_update_policies p ON r.policy_id = p.id
    LEFT JOIN device_rollout_status d ON r.rollout_id = d.rollout_id
    WHERE r.status IN ('pending', 'scheduled', 'in_progress', 'paused')
    GROUP BY r.id, p.id;
  `);

  console.log('✅ Image update management tables created');
};

exports.down = async function(knex) {
  // Drop views
  await knex.raw('DROP VIEW IF EXISTS active_rollouts');
  
  // Drop tables in reverse order (respect foreign keys)
  await knex.schema.dropTableIfExists('rollout_events');
  await knex.schema.dropTableIfExists('device_rollout_status');
  await knex.schema.dropTableIfExists('image_rollouts');
  await knex.schema.dropTableIfExists('image_update_policies');
  
  console.log('✅ Image update management tables dropped');
};
