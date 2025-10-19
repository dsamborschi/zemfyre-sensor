import { Pool } from 'pg';
import {
  EntityRelationship,
  CreateRelationshipRequest,
  RelationshipFilter,
  Entity,
  HierarchyNode,
  EntityPath
} from '../types/entities';

/**
 * RelationshipService - Manages entity relationships and graph traversal
 * 
 * Handles creation, deletion, and querying of relationships between entities.
 * Provides graph traversal methods for finding paths, dependencies, etc.
 */
export class RelationshipService {
  constructor(private pool: Pool) {}

  /**
   * Create a new relationship
   */
  async createRelationship(request: CreateRelationshipRequest): Promise<EntityRelationship> {
    const { source_entity_id, target_entity_id, relationship_type, metadata = {} } = request;

    // Prevent self-relationships
    if (source_entity_id === target_entity_id) {
      throw new Error('Cannot create relationship to self');
    }

    const result = await this.pool.query<EntityRelationship>(
      `INSERT INTO entity_relationships (source_entity_id, target_entity_id, relationship_type, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [source_entity_id, target_entity_id, relationship_type, JSON.stringify(metadata)]
    );

    return result.rows[0];
  }

  /**
   * Get relationship by ID
   */
  async getRelationship(id: string): Promise<EntityRelationship | null> {
    const result = await this.pool.query<EntityRelationship>(
      `SELECT * FROM entity_relationships WHERE id = $1`,
      [id]
    );

    return result.rows[0] || null;
  }

  /**
   * List relationships with filters
   */
  async listRelationships(filter: RelationshipFilter = {}): Promise<EntityRelationship[]> {
    const { source_entity_id, target_entity_id, relationship_type, direction = 'both' } = filter;

    let query = `SELECT * FROM entity_relationships WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (source_entity_id && (direction === 'outgoing' || direction === 'both')) {
      query += ` AND source_entity_id = $${paramIndex++}`;
      params.push(source_entity_id);
    }

    if (target_entity_id && (direction === 'incoming' || direction === 'both')) {
      query += ` AND target_entity_id = $${paramIndex++}`;
      params.push(target_entity_id);
    }

    if (relationship_type) {
      query += ` AND relationship_type = $${paramIndex++}`;
      params.push(relationship_type);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await this.pool.query<EntityRelationship>(query, params);
    return result.rows;
  }

  /**
   * Delete relationship
   */
  async deleteRelationship(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM entity_relationships WHERE id = $1`,
      [id]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Get direct children (entities that this entity CONTAINS)
   */
  async getChildren(entityId: string): Promise<Entity[]> {
    const result = await this.pool.query<Entity>(
      `SELECT e.*
       FROM entities e
       JOIN entity_relationships r ON r.target_entity_id = e.id
       WHERE r.source_entity_id = $1 AND r.relationship_type = 'CONTAINS'
       ORDER BY e.name`,
      [entityId]
    );

    return result.rows;
  }

  /**
   * Get direct parent (entity that CONTAINS this entity)
   */
  async getParent(entityId: string): Promise<Entity | null> {
    const result = await this.pool.query<Entity>(
      `SELECT e.*
       FROM entities e
       JOIN entity_relationships r ON r.source_entity_id = e.id
       WHERE r.target_entity_id = $1 AND r.relationship_type = 'CONTAINS'
       LIMIT 1`,
      [entityId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all descendants (recursive - everything this entity contains)
   */
  async getDescendants(entityId: string, maxDepth = 10): Promise<Entity[]> {
    const result = await this.pool.query<Entity>(
      `WITH RECURSIVE descendants AS (
        -- Base case: direct children
        SELECT e.*, 1 as depth
        FROM entities e
        JOIN entity_relationships r ON r.target_entity_id = e.id
        WHERE r.source_entity_id = $1 AND r.relationship_type = 'CONTAINS'
        
        UNION ALL
        
        -- Recursive case: children of children
        SELECT e.*, d.depth + 1
        FROM entities e
        JOIN entity_relationships r ON r.target_entity_id = e.id
        JOIN descendants d ON d.id = r.source_entity_id
        WHERE r.relationship_type = 'CONTAINS'
        AND d.depth < $2
      )
      SELECT * FROM descendants
      ORDER BY depth, name`,
      [entityId, maxDepth]
    );

    return result.rows;
  }

  /**
   * Get all ancestors (recursive - chain of parents)
   */
  async getAncestors(entityId: string, maxDepth = 10): Promise<Entity[]> {
    const result = await this.pool.query<Entity>(
      `WITH RECURSIVE ancestors AS (
        -- Base case: direct parent
        SELECT e.*, 1 as depth
        FROM entities e
        JOIN entity_relationships r ON r.source_entity_id = e.id
        WHERE r.target_entity_id = $1 AND r.relationship_type = 'CONTAINS'
        
        UNION ALL
        
        -- Recursive case: parents of parents
        SELECT e.*, a.depth + 1
        FROM entities e
        JOIN entity_relationships r ON r.source_entity_id = e.id
        JOIN ancestors a ON a.id = r.target_entity_id
        WHERE r.relationship_type = 'CONTAINS'
        AND a.depth < $2
      )
      SELECT * FROM ancestors
      ORDER BY depth DESC`,
      [entityId, maxDepth]
    );

    return result.rows;
  }

  /**
   * Build hierarchy tree from entity
   */
  async buildHierarchyTree(rootId: string, maxDepth = 10): Promise<HierarchyNode | null> {
    // Get the root entity
    const rootResult = await this.pool.query<Entity>(
      `SELECT * FROM entities WHERE id = $1`,
      [rootId]
    );

    if (rootResult.rows.length === 0) return null;

    const root = rootResult.rows[0];

    // Recursive function to build tree
    const buildNode = async (entity: Entity, depth: number): Promise<HierarchyNode> => {
      const node: HierarchyNode = {
        ...entity,
        depth,
        children: []
      };

      if (depth < maxDepth) {
        const children = await this.getChildren(entity.id);
        node.children = await Promise.all(
          children.map(child => buildNode(child, depth + 1))
        );
      }

      return node;
    };

    return buildNode(root, 0);
  }

  /**
   * Get entities that depend on this entity (impact analysis)
   */
  async getDependentEntities(entityId: string, maxDepth = 5): Promise<Entity[]> {
    const result = await this.pool.query<Entity>(
      `WITH RECURSIVE dependents AS (
        -- Base case: entities that directly depend on this one
        SELECT e.*, 1 as depth
        FROM entities e
        JOIN entity_relationships r ON r.source_entity_id = e.id
        WHERE r.target_entity_id = $1 AND r.relationship_type = 'DEPENDS_ON'
        
        UNION ALL
        
        -- Recursive case: transitive dependencies
        SELECT e.*, d.depth + 1
        FROM entities e
        JOIN entity_relationships r ON r.source_entity_id = e.id
        JOIN dependents d ON d.id = r.target_entity_id
        WHERE r.relationship_type = 'DEPENDS_ON'
        AND d.depth < $2
      )
      SELECT DISTINCT * FROM dependents
      ORDER BY depth, name`,
      [entityId, maxDepth]
    );

    return result.rows;
  }

  /**
   * Get entities this entity depends on
   */
  async getDependencies(entityId: string, maxDepth = 5): Promise<Entity[]> {
    const result = await this.pool.query<Entity>(
      `WITH RECURSIVE dependencies AS (
        -- Base case: direct dependencies
        SELECT e.*, 1 as depth
        FROM entities e
        JOIN entity_relationships r ON r.target_entity_id = e.id
        WHERE r.source_entity_id = $1 AND r.relationship_type = 'DEPENDS_ON'
        
        UNION ALL
        
        -- Recursive case: dependencies of dependencies
        SELECT e.*, dep.depth + 1
        FROM entities e
        JOIN entity_relationships r ON r.target_entity_id = e.id
        JOIN dependencies dep ON dep.id = r.source_entity_id
        WHERE r.relationship_type = 'DEPENDS_ON'
        AND dep.depth < $2
      )
      SELECT DISTINCT * FROM dependencies
      ORDER BY depth, name`,
      [entityId, maxDepth]
    );

    return result.rows;
  }

  /**
   * Find path between two entities
   */
  async findPath(fromId: string, toId: string, maxDepth = 10): Promise<EntityPath | null> {
    const result = await this.pool.query<any>(
      `WITH RECURSIVE path AS (
        -- Base case: start entity
        SELECT 
          $1::uuid as entity_id,
          NULL::uuid as relationship_id,
          NULL::varchar as relationship_type,
          ARRAY[$1::uuid] as visited,
          0 as depth
        
        UNION ALL
        
        -- Recursive case: follow relationships
        SELECT 
          r.target_entity_id,
          r.id,
          r.relationship_type,
          p.visited || r.target_entity_id,
          p.depth + 1
        FROM entity_relationships r
        JOIN path p ON p.entity_id = r.source_entity_id
        WHERE r.target_entity_id != ALL(p.visited)  -- Prevent cycles
        AND p.depth < $3
        AND p.entity_id != $2  -- Continue until we reach target
      )
      SELECT * FROM path WHERE entity_id = $2 LIMIT 1`,
      [fromId, toId, maxDepth]
    );

    if (result.rows.length === 0) return null;

    // Reconstruct the path
    const pathData = result.rows[0];
    const entities = await this.pool.query<Entity>(
      `SELECT * FROM entities WHERE id = ANY($1::uuid[])`,
      [pathData.visited]
    );

    const from = entities.rows.find(e => e.id === fromId)!;
    const to = entities.rows.find(e => e.id === toId)!;

    return {
      from,
      to,
      path: [], // Simplified - would need to reconstruct full path with relationships
      length: pathData.depth
    };
  }

  /**
   * Get related entities by relationship type
   */
  async getRelatedEntities(
    entityId: string,
    relationshipType: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both'
  ): Promise<Entity[]> {
    let query = '';
    const params: any[] = [entityId, relationshipType];

    if (direction === 'outgoing') {
      query = `
        SELECT e.*
        FROM entities e
        JOIN entity_relationships r ON r.target_entity_id = e.id
        WHERE r.source_entity_id = $1 AND r.relationship_type = $2
      `;
    } else if (direction === 'incoming') {
      query = `
        SELECT e.*
        FROM entities e
        JOIN entity_relationships r ON r.source_entity_id = e.id
        WHERE r.target_entity_id = $1 AND r.relationship_type = $2
      `;
    } else {
      query = `
        SELECT e.*
        FROM entities e
        JOIN entity_relationships r ON (r.target_entity_id = e.id AND r.source_entity_id = $1)
           OR (r.source_entity_id = e.id AND r.target_entity_id = $1)
        WHERE r.relationship_type = $2
      `;
    }

    const result = await this.pool.query<Entity>(query, params);
    return result.rows;
  }

  /**
   * Check if relationship exists
   */
  async relationshipExists(
    sourceId: string,
    targetId: string,
    relationshipType?: string
  ): Promise<boolean> {
    let query = `
      SELECT 1 FROM entity_relationships
      WHERE source_entity_id = $1 AND target_entity_id = $2
    `;
    const params: any[] = [sourceId, targetId];

    if (relationshipType) {
      query += ` AND relationship_type = $3`;
      params.push(relationshipType);
    }

    const result = await this.pool.query(query, params);
    return result.rows.length > 0;
  }

  /**
   * Delete all relationships for an entity
   */
  async deleteAllRelationships(entityId: string): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM entity_relationships
       WHERE source_entity_id = $1 OR target_entity_id = $1`,
      [entityId]
    );

    return result.rowCount || 0;
  }
}
