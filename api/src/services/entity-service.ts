import { Pool } from 'pg';
import {
  Entity,
  EntityType,
  CreateEntityRequest,
  UpdateEntityRequest,
  EntityFilter,
  EntityWithRelationships,
  EntityProperty
} from '../types/entities';

/**
 * EntityService - Manages entity CRUD operations
 * 
 * Handles all operations related to entities in the digital twin graph.
 * Entities represent physical or logical things (buildings, devices, zones, etc.)
 */
export class EntityService {
  constructor(private pool: Pool) {}

  /**
   * Create a new entity
   */
  async createEntity(request: CreateEntityRequest): Promise<Entity> {
    const { entity_type, name, description, metadata = {}, device_uuid } = request;

    const result = await this.pool.query<Entity>(
      `INSERT INTO entities (entity_type, name, description, metadata, device_uuid)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [entity_type, name, description, JSON.stringify(metadata), device_uuid]
    );

    return result.rows[0];
  }

  /**
   * Get entity by ID
   */
  async getEntity(id: string): Promise<Entity | null> {
    const result = await this.pool.query<Entity>(
      `SELECT * FROM entities WHERE id = $1`,
      [id]
    );

    return result.rows[0] || null;
  }

  /**
   * Get entity with all relationships
   */
  async getEntityWithRelationships(id: string): Promise<EntityWithRelationships | null> {
    const entity = await this.getEntity(id);
    if (!entity) return null;

    const [outgoing, incoming] = await Promise.all([
      this.pool.query(
        `SELECT * FROM entity_relationships WHERE source_entity_id = $1`,
        [id]
      ),
      this.pool.query(
        `SELECT * FROM entity_relationships WHERE target_entity_id = $1`,
        [id]
      )
    ]);

    return {
      ...entity,
      relationships: {
        outgoing: outgoing.rows,
        incoming: incoming.rows
      }
    };
  }

  /**
   * List entities with optional filters
   */
  async listEntities(filter: EntityFilter = {}): Promise<Entity[]> {
    const { entity_type, name, device_uuid, metadata, limit = 100, offset = 0 } = filter;

    let query = `SELECT * FROM entities WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (entity_type) {
      query += ` AND entity_type = $${paramIndex++}`;
      params.push(entity_type);
    }

    if (name) {
      query += ` AND name ILIKE $${paramIndex++}`;
      params.push(`%${name}%`);
    }

    if (device_uuid) {
      query += ` AND device_uuid = $${paramIndex++}`;
      params.push(device_uuid);
    }

    if (metadata) {
      query += ` AND metadata @> $${paramIndex++}::jsonb`;
      params.push(JSON.stringify(metadata));
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await this.pool.query<Entity>(query, params);
    return result.rows;
  }

  /**
   * Update entity
   */
  async updateEntity(id: string, request: UpdateEntityRequest): Promise<Entity | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (request.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(request.name);
    }

    if (request.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(request.description);
    }

    if (request.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      params.push(JSON.stringify(request.metadata));
    }

    if (updates.length === 0) {
      return this.getEntity(id);
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const result = await this.pool.query<Entity>(
      `UPDATE entities SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    return result.rows[0] || null;
  }

  /**
   * Delete entity (cascades to relationships)
   */
  async deleteEntity(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM entities WHERE id = $1`,
      [id]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Link entity to device
   */
  async linkDevice(entityId: string, deviceUuid: string): Promise<Entity | null> {
    const result = await this.pool.query<Entity>(
      `UPDATE entities SET device_uuid = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [deviceUuid, entityId]
    );

    return result.rows[0] || null;
  }

  /**
   * Unlink device from entity
   */
  async unlinkDevice(entityId: string): Promise<Entity | null> {
    return this.linkDevice(entityId, null as any);
  }

  /**
   * Get all entity types
   */
  async getEntityTypes(): Promise<EntityType[]> {
    const result = await this.pool.query<EntityType>(
      `SELECT * FROM entity_types ORDER BY display_name`
    );

    return result.rows;
  }

  /**
   * Count entities by type
   */
  async countEntitiesByType(): Promise<Record<string, number>> {
    const result = await this.pool.query<{ entity_type: string; count: string }>(
      `SELECT entity_type, COUNT(*) as count
       FROM entities
       GROUP BY entity_type
       ORDER BY count DESC`
    );

    const counts: Record<string, number> = {};
    result.rows.forEach(row => {
      counts[row.entity_type] = parseInt(row.count, 10);
    });

    return counts;
  }

  /**
   * Get entity by device UUID
   */
  async getEntityByDeviceUuid(deviceUuid: string): Promise<Entity | null> {
    const result = await this.pool.query<Entity>(
      `SELECT * FROM entities WHERE device_uuid = $1`,
      [deviceUuid]
    );

    return result.rows[0] || null;
  }

  /**
   * Search entities by name (fuzzy)
   */
  async searchEntities(searchTerm: string, limit = 20): Promise<Entity[]> {
    const result = await this.pool.query<Entity>(
      `SELECT * FROM entities
       WHERE name ILIKE $1 OR description ILIKE $1
       ORDER BY 
         CASE 
           WHEN name ILIKE $2 THEN 1
           WHEN name ILIKE $1 THEN 2
           ELSE 3
         END,
         name
       LIMIT $3`,
      [`%${searchTerm}%`, `${searchTerm}%`, limit]
    );

    return result.rows;
  }

  /**
   * Set entity property (key-value)
   */
  async setProperty(entityId: string, key: string, value: any): Promise<EntityProperty> {
    const result = await this.pool.query<EntityProperty>(
      `INSERT INTO entity_properties (entity_id, property_key, property_value)
       VALUES ($1, $2, $3)
       ON CONFLICT (entity_id, property_key)
       DO UPDATE SET property_value = $3, updated_at = NOW()
       RETURNING *`,
      [entityId, key, JSON.stringify(value)]
    );

    return result.rows[0];
  }

  /**
   * Get entity property
   */
  async getProperty(entityId: string, key: string): Promise<any | null> {
    const result = await this.pool.query<EntityProperty>(
      `SELECT property_value FROM entity_properties
       WHERE entity_id = $1 AND property_key = $2`,
      [entityId, key]
    );

    return result.rows[0]?.property_value || null;
  }

  /**
   * Get all properties for an entity
   */
  async getAllProperties(entityId: string): Promise<Record<string, any>> {
    const result = await this.pool.query<EntityProperty>(
      `SELECT property_key, property_value
       FROM entity_properties
       WHERE entity_id = $1`,
      [entityId]
    );

    const properties: Record<string, any> = {};
    result.rows.forEach(row => {
      properties[row.property_key] = row.property_value;
    });

    return properties;
  }

  /**
   * Delete entity property
   */
  async deleteProperty(entityId: string, key: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM entity_properties
       WHERE entity_id = $1 AND property_key = $2`,
      [entityId, key]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Bulk create entities
   */
  async bulkCreateEntities(entities: CreateEntityRequest[]): Promise<Entity[]> {
    if (entities.length === 0) return [];

    const values: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    entities.forEach(entity => {
      values.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
      );
      params.push(
        entity.entity_type,
        entity.name,
        entity.description || null,
        JSON.stringify(entity.metadata || {}),
        entity.device_uuid || null
      );
    });

    const result = await this.pool.query<Entity>(
      `INSERT INTO entities (entity_type, name, description, metadata, device_uuid)
       VALUES ${values.join(', ')}
       RETURNING *`,
      params
    );

    return result.rows;
  }
}
