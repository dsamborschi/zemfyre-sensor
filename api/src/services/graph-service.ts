import { Pool } from 'pg';
import {
  GraphTopology,
  GraphNode,
  GraphEdge,
  ImpactAnalysis,
  EntityTreeResponse,
  EntityAggregateMetrics,
  BuildingStatus,
  FloorStatus,
  DeviceLocationView
} from '../types/entities';
import { RelationshipService } from './relationship-service';
import { EntityService } from './entity-service';

/**
 * GraphService - Advanced graph operations and analytics
 * 
 * Provides high-level graph operations like topology generation,
 * impact analysis, and aggregate metrics across entity hierarchies.
 */
export class GraphService {
  private relationshipService: RelationshipService;
  private entityService: EntityService;

  constructor(private pool: Pool) {
    this.relationshipService = new RelationshipService(pool);
    this.entityService = new EntityService(pool);
  }

  /**
   * Get complete graph topology for visualization
   */
  async getTopology(entityType?: string): Promise<GraphTopology> {
    // Get all entities (optionally filtered by type)
    let entityQuery = `SELECT * FROM entities`;
    const params: any[] = [];

    if (entityType) {
      entityQuery += ` WHERE entity_type = $1`;
      params.push(entityType);
    }

    const [entities, relationships] = await Promise.all([
      this.pool.query(entityQuery, params),
      this.pool.query(`SELECT * FROM entity_relationships`)
    ]);

    // Convert to graph nodes
    const nodes: GraphNode[] = entities.rows.map(e => ({
      id: e.id,
      label: e.name,
      type: e.entity_type,
      properties: e.metadata,
      device_uuid: e.device_uuid
    }));

    // Convert to graph edges
    const edges: GraphEdge[] = relationships.rows.map(r => ({
      id: r.id,
      source: r.source_entity_id,
      target: r.target_entity_id,
      type: r.relationship_type,
      metadata: r.metadata
    }));

    return { nodes, edges };
  }

  /**
   * Get hierarchy tree with full structure
   */
  async getHierarchyTree(rootId: string): Promise<EntityTreeResponse | null> {
    const root = await this.entityService.getEntity(rootId);
    if (!root) return null;

    const tree = await this.relationshipService.buildHierarchyTree(rootId);
    if (!tree) return null;

    const descendants = await this.relationshipService.getDescendants(rootId);

    // Calculate max depth
    let maxDepth = 0;
    const calculateDepth = (node: any, depth: number) => {
      maxDepth = Math.max(maxDepth, depth);
      if (node.children) {
        node.children.forEach((child: any) => calculateDepth(child, depth + 1));
      }
    };
    calculateDepth(tree, 0);

    return {
      root,
      tree,
      total_descendants: descendants.length,
      max_depth: maxDepth
    };
  }

  /**
   * Analyze impact if entity fails
   */
  async analyzeImpact(entityId: string): Promise<ImpactAnalysis> {
    const entity = await this.entityService.getEntity(entityId);
    if (!entity) {
      throw new Error('Entity not found');
    }

    // Get all dependent entities
    const dependents = await this.relationshipService.getDependentEntities(entityId);

    // Get entities contained by this one (if it fails, they lose their parent)
    const contained = await this.relationshipService.getChildren(entityId);

    // Combine all impacted entities
    const allImpacted = [...dependents, ...contained];

    // Categorize by severity
    const impacted = allImpacted.map(impactedEntity => {
      let severity: 'critical' | 'high' | 'medium' | 'low' = 'medium';

      // Critical if it's a gateway or infrastructure
      if (impactedEntity.entity_type === 'gateway' || impactedEntity.entity_type === 'equipment') {
        severity = 'critical';
      }
      // High if many things depend on it
      else if (dependents.length > 5) {
        severity = 'high';
      }
      // Low if it's a leaf node
      else if (impactedEntity.entity_type === 'device') {
        severity = 'low';
      }

      return {
        entity: impactedEntity,
        relationship_path: [entityId, impactedEntity.id], // Simplified
        severity
      };
    });

    return {
      entity,
      impacted,
      affected_count: impacted.length
    };
  }

  /**
   * Get aggregate metrics for an entity (roll up from children)
   */
  async getAggregateMetrics(entityId: string): Promise<EntityAggregateMetrics> {
    const entity = await this.entityService.getEntity(entityId);
    if (!entity) {
      throw new Error('Entity not found');
    }

    // Get all descendant devices
    const descendants = await this.relationshipService.getDescendants(entityId);
    const deviceEntities = descendants.filter(e => e.device_uuid);

    if (deviceEntities.length === 0) {
      return {
        entity,
        device_count: 0,
        online_devices: 0,
        offline_devices: 0
      };
    }

    // Get device shadows for all descendant devices
    const deviceUuids = deviceEntities.map(e => e.device_uuid!);
    const shadows = await this.pool.query(
      `SELECT 
        uuid,
        reported_state,
        (reported_state->>'timestamp')::bigint as last_seen
      FROM device_shadows
      WHERE uuid = ANY($1::uuid[])`,
      [deviceUuids]
    );

    // Calculate online/offline (device is online if seen in last 5 minutes)
    const now = Date.now();
    const onlineThreshold = 5 * 60 * 1000; // 5 minutes

    let onlineCount = 0;
    const metrics: any = {
      temperatures: [],
      humidities: [],
      cpuUsages: [],
      memoryUsages: []
    };

    shadows.rows.forEach(shadow => {
      const lastSeen = shadow.last_seen || 0;
      const isOnline = (now - lastSeen) < onlineThreshold;

      if (isOnline) {
        onlineCount++;

        // Extract metrics if available
        const state = shadow.reported_state;
        if (state?.temperature) metrics.temperatures.push(state.temperature);
        if (state?.humidity) metrics.humidities.push(state.humidity);
        if (state?.system?.cpuUsage) metrics.cpuUsages.push(state.system.cpuUsage);
        if (state?.system?.memoryUsage) metrics.memoryUsages.push(state.system.memoryUsage);
      }
    });

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : undefined;

    return {
      entity,
      device_count: deviceEntities.length,
      online_devices: onlineCount,
      offline_devices: deviceEntities.length - onlineCount,
      avg_metrics: {
        temperature: avg(metrics.temperatures),
        humidity: avg(metrics.humidities),
        cpu_usage: avg(metrics.cpuUsages),
        memory_usage: avg(metrics.memoryUsages)
      },
      health_score: deviceEntities.length > 0 
        ? Math.round((onlineCount / deviceEntities.length) * 100)
        : undefined
    };
  }

  /**
   * Get building status with all floors and rooms
   */
  async getBuildingStatus(buildingId: string): Promise<BuildingStatus> {
    const building = await this.entityService.getEntity(buildingId);
    if (!building || building.entity_type !== 'building') {
      throw new Error('Entity is not a building');
    }

    // Get building aggregate metrics
    const buildingMetrics = await this.getAggregateMetrics(buildingId);

    // Get all floors
    const floors = await this.relationshipService.getChildren(buildingId);
    const floorStatuses: FloorStatus[] = [];

    for (const floor of floors) {
      if (floor.entity_type !== 'floor') continue;

      const floorMetrics = await this.getAggregateMetrics(floor.id);

      // Get rooms in this floor
      const rooms = await this.relationshipService.getChildren(floor.id);
      const roomStatuses: EntityAggregateMetrics[] = [];

      for (const room of rooms) {
        const roomMetrics = await this.getAggregateMetrics(room.id);
        roomStatuses.push(roomMetrics);
      }

      floorStatuses.push({
        ...floorMetrics,
        rooms: roomStatuses
      });
    }

    return {
      ...buildingMetrics,
      floors: floorStatuses
    };
  }

  /**
   * Get all device locations using the view
   */
  async getDeviceLocations(): Promise<DeviceLocationView[]> {
    const result = await this.pool.query<DeviceLocationView>(
      `SELECT * FROM device_locations ORDER BY building_name, floor_name, room_name`
    );

    return result.rows;
  }

  /**
   * Find correlated devices (devices in same room/zone)
   */
  async findCorrelatedDevices(deviceUuid: string): Promise<string[]> {
    // Find the device entity
    const deviceEntity = await this.entityService.getEntityByDeviceUuid(deviceUuid);
    if (!deviceEntity) return [];

    // Find the parent (room or zone)
    const parent = await this.relationshipService.getParent(deviceEntity.id);
    if (!parent) return [];

    // Find all sibling devices (other devices in same parent)
    const siblings = await this.relationshipService.getChildren(parent.id);
    const correlatedUuids = siblings
      .filter(s => s.device_uuid && s.device_uuid !== deviceUuid)
      .map(s => s.device_uuid!);

    return correlatedUuids;
  }

  /**
   * Get entity statistics
   */
  async getStatistics() {
    const [entityCounts, relationshipCounts, deviceCount] = await Promise.all([
      this.pool.query(`
        SELECT entity_type, COUNT(*) as count
        FROM entities
        GROUP BY entity_type
      `),
      this.pool.query(`
        SELECT relationship_type, COUNT(*) as count
        FROM entity_relationships
        GROUP BY relationship_type
      `),
      this.pool.query(`
        SELECT COUNT(*) as count
        FROM entities
        WHERE device_uuid IS NOT NULL
      `)
    ]);

    return {
      entities_by_type: entityCounts.rows.reduce((acc: any, row: any) => {
        acc[row.entity_type] = parseInt(row.count, 10);
        return acc;
      }, {}),
      relationships_by_type: relationshipCounts.rows.reduce((acc: any, row: any) => {
        acc[row.relationship_type] = parseInt(row.count, 10);
        return acc;
      }, {}),
      total_entities: Object.values(entityCounts.rows).reduce((sum: number, row: any) => 
        sum + parseInt(row.count, 10), 0
      ),
      total_relationships: Object.values(relationshipCounts.rows).reduce((sum: number, row: any) =>
        sum + parseInt(row.count, 10), 0
      ),
      linked_devices: parseInt(deviceCount.rows[0].count, 10)
    };
  }

  /**
   * Detect orphaned entities (no relationships)
   */
  async findOrphanedEntities(): Promise<any[]> {
    const result = await this.pool.query(`
      SELECT e.*
      FROM entities e
      LEFT JOIN entity_relationships r ON e.id = r.source_entity_id OR e.id = r.target_entity_id
      WHERE r.id IS NULL
    `);

    return result.rows;
  }
}
