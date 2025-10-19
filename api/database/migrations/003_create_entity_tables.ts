import { Knex } from 'knex';

/**
 * Migration: Create Entity Relationship Tables for Digital Twin
 * 
 * This migration creates the foundation for a complete digital twin with relationships.
 * It allows modeling of hierarchies (buildings, floors, rooms) and relationships
 * between entities (CONTAINS, DEPENDS_ON, MONITORS, etc.)
 */

export async function up(knex: Knex): Promise<void> {
  // Enable UUID extension if not already enabled
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // 1. Create entity_types table - Define categories of entities
  await knex.schema.createTable('entity_types', (table) => {
    table.increments('id').primary();
    table.string('name', 50).notNullable().unique();
    table.string('display_name', 100).notNullable();
    table.string('icon', 50);
    table.jsonb('properties_schema');
    table.text('description');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // 2. Create entities table - Universal entity storage
  await knex.schema.createTable('entities', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('entity_type', 50).notNullable();
    table.string('name', 255).notNullable();
    table.text('description');
    table.jsonb('metadata').defaultTo('{}');
    
    // Optional link to device_shadows table
    table.uuid('device_uuid').nullable();
    table.foreign('device_uuid').references('device_uuid').inTable('device_shadows').onDelete('SET NULL');
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes for performance
    table.index('entity_type');
    table.index('device_uuid');
    table.index(['entity_type', 'name']);
  });

  // 3. Create entity_relationships table - The graph structure
  await knex.schema.createTable('entity_relationships', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    
    table.uuid('source_entity_id').notNullable();
    table.foreign('source_entity_id').references('id').inTable('entities').onDelete('CASCADE');
    
    table.uuid('target_entity_id').notNullable();
    table.foreign('target_entity_id').references('id').inTable('entities').onDelete('CASCADE');
    
    table.string('relationship_type', 50).notNullable();
    table.jsonb('metadata').defaultTo('{}');
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Prevent duplicate relationships
    table.unique(['source_entity_id', 'target_entity_id', 'relationship_type']);
    
    // Indexes for graph traversal
    table.index('source_entity_id');
    table.index('target_entity_id');
    table.index('relationship_type');
    table.index(['source_entity_id', 'relationship_type']);
    table.index(['target_entity_id', 'relationship_type']);
  });

  // 4. Create entity_properties table - Flexible key-value storage (optional)
  await knex.schema.createTable('entity_properties', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    
    table.uuid('entity_id').notNullable();
    table.foreign('entity_id').references('id').inTable('entities').onDelete('CASCADE');
    
    table.string('property_key', 100).notNullable();
    table.jsonb('property_value').notNullable();
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // One property per key per entity
    table.unique(['entity_id', 'property_key']);
    
    // Index for lookups
    table.index('entity_id');
    table.index(['entity_id', 'property_key']);
  });

  // 5. Seed default entity types
  await knex('entity_types').insert([
    {
      name: 'building',
      display_name: 'Building',
      icon: 'building',
      description: 'Physical building or facility',
      properties_schema: JSON.stringify({
        required: ['address'],
        optional: ['floors', 'area', 'coordinates']
      })
    },
    {
      name: 'floor',
      display_name: 'Floor',
      icon: 'layers',
      description: 'Floor within a building',
      properties_schema: JSON.stringify({
        required: ['level'],
        optional: ['area', 'purpose']
      })
    },
    {
      name: 'room',
      display_name: 'Room',
      icon: 'door-closed',
      description: 'Room or space within a floor',
      properties_schema: JSON.stringify({
        required: ['number'],
        optional: ['area', 'purpose', 'capacity']
      })
    },
    {
      name: 'zone',
      display_name: 'Zone',
      icon: 'map',
      description: 'Logical grouping of spaces or devices',
      properties_schema: JSON.stringify({
        optional: ['purpose', 'priority']
      })
    },
    {
      name: 'device',
      display_name: 'Device',
      icon: 'cpu',
      description: 'IoT device (links to device_shadows)',
      properties_schema: JSON.stringify({
        required: ['device_uuid'],
        optional: ['location', 'installation_date']
      })
    },
    {
      name: 'equipment',
      display_name: 'Equipment',
      icon: 'server',
      description: 'Physical equipment (HVAC, lighting, etc.)',
      properties_schema: JSON.stringify({
        optional: ['model', 'serial_number', 'installation_date']
      })
    },
    {
      name: 'gateway',
      display_name: 'Gateway',
      icon: 'network-wired',
      description: 'Network gateway or hub',
      properties_schema: JSON.stringify({
        optional: ['ip_address', 'protocol']
      })
    }
  ]);

  // 6. Create helpful views for common queries
  
  // View: Entity hierarchy with depth
  await knex.raw(`
    CREATE OR REPLACE VIEW entity_hierarchy AS
    WITH RECURSIVE hierarchy AS (
      -- Root entities (no parent)
      SELECT 
        e.id,
        e.entity_type,
        e.name,
        e.device_uuid,
        NULL::uuid as parent_id,
        0 as depth,
        ARRAY[e.id] as path
      FROM entities e
      WHERE NOT EXISTS (
        SELECT 1 FROM entity_relationships r
        WHERE r.target_entity_id = e.id 
        AND r.relationship_type = 'CONTAINS'
      )
      
      UNION ALL
      
      -- Child entities
      SELECT 
        e.id,
        e.entity_type,
        e.name,
        e.device_uuid,
        r.source_entity_id as parent_id,
        h.depth + 1,
        h.path || e.id
      FROM entities e
      JOIN entity_relationships r ON r.target_entity_id = e.id
      JOIN hierarchy h ON h.id = r.source_entity_id
      WHERE r.relationship_type = 'CONTAINS'
      AND e.id != ALL(h.path)  -- Prevent cycles
      AND h.depth < 20  -- Max depth limit
    )
    SELECT * FROM hierarchy;
  `);

  // View: Device locations (devices with their physical hierarchy)
  await knex.raw(`
    CREATE OR REPLACE VIEW device_locations AS
    SELECT 
      e.id as entity_id,
      e.name as device_name,
      e.device_uuid,
      ds.id as shadow_id,
      ds.reported as reported_state,
      building.name as building_name,
      floor.name as floor_name,
      room.name as room_name
    FROM entities e
    LEFT JOIN device_shadows ds ON e.device_uuid = ds.device_uuid
    LEFT JOIN entity_relationships r_room ON r_room.target_entity_id = e.id AND r_room.relationship_type = 'CONTAINS'
    LEFT JOIN entities room ON room.id = r_room.source_entity_id AND room.entity_type = 'room'
    LEFT JOIN entity_relationships r_floor ON r_floor.target_entity_id = room.id AND r_floor.relationship_type = 'CONTAINS'
    LEFT JOIN entities floor ON floor.id = r_floor.source_entity_id AND floor.entity_type = 'floor'
    LEFT JOIN entity_relationships r_building ON r_building.target_entity_id = floor.id AND r_building.relationship_type = 'CONTAINS'
    LEFT JOIN entities building ON building.id = r_building.source_entity_id AND building.entity_type = 'building'
    WHERE e.entity_type = 'device';
  `);

  console.log('✅ Entity tables created successfully');
  console.log('✅ Seeded 7 default entity types');
  console.log('✅ Created 2 helper views');
}

export async function down(knex: Knex): Promise<void> {
  // Drop views
  await knex.raw('DROP VIEW IF EXISTS device_locations');
  await knex.raw('DROP VIEW IF EXISTS entity_hierarchy');

  // Drop tables in reverse order (respecting foreign keys)
  await knex.schema.dropTableIfExists('entity_properties');
  await knex.schema.dropTableIfExists('entity_relationships');
  await knex.schema.dropTableIfExists('entities');
  await knex.schema.dropTableIfExists('entity_types');

  console.log('✅ Entity tables dropped');
}
