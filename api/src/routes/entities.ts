import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { EntityService } from '../services/entity-service';
import { CreateEntityRequest, UpdateEntityRequest, EntityFilter } from '../types/entities';

/**
 * Entity Routes - CRUD operations for entities
 * 
 * Endpoints:
 * - POST   /api/v1/entities              Create entity
 * - GET    /api/v1/entities              List entities (with filters)
 * - GET    /api/v1/entities/:id          Get entity by ID
 * - PUT    /api/v1/entities/:id          Update entity
 * - DELETE /api/v1/entities/:id          Delete entity
 * - GET    /api/v1/entities/search       Search entities
 * - GET    /api/v1/entities/types        Get entity types
 * - GET    /api/v1/entities/stats        Get statistics
 */
export function createEntitiesRouter(pool: Pool): Router {
  const router = Router();
  const entityService = new EntityService(pool);

  /**
   * Create a new entity
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const request: CreateEntityRequest = req.body;

      // Validate required fields
      if (!request.entity_type || !request.name) {
        return res.status(400).json({
          error: 'Missing required fields: entity_type, name'
        });
      }

      const entity = await entityService.createEntity(request);

      res.status(201).json({
        success: true,
        data: entity
      });
    } catch (error: any) {
      console.error('Error creating entity:', error);
      res.status(500).json({
        error: 'Failed to create entity',
        message: error.message
      });
    }
  });

  /**
   * List entities with optional filters
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const filter: EntityFilter = {
        entity_type: req.query.type as string,
        name: req.query.name as string,
        device_uuid: req.query.device_uuid as string,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0
      };

      // Handle metadata filter (JSON string)
      if (req.query.metadata) {
        try {
          filter.metadata = JSON.parse(req.query.metadata as string);
        } catch (e) {
          return res.status(400).json({
            error: 'Invalid metadata filter (must be valid JSON)'
          });
        }
      }

      const entities = await entityService.listEntities(filter);

      res.json({
        success: true,
        data: entities,
        count: entities.length,
        filter
      });
    } catch (error: any) {
      console.error('Error listing entities:', error);
      res.status(500).json({
        error: 'Failed to list entities',
        message: error.message
      });
    }
  });

  /**
   * Search entities by name
   */
  router.get('/search', async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      if (!query) {
        return res.status(400).json({
          error: 'Missing search query parameter: q'
        });
      }

      const entities = await entityService.searchEntities(query, limit);

      res.json({
        success: true,
        data: entities,
        count: entities.length,
        query
      });
    } catch (error: any) {
      console.error('Error searching entities:', error);
      res.status(500).json({
        error: 'Failed to search entities',
        message: error.message
      });
    }
  });

  /**
   * Get all entity types
   */
  router.get('/types', async (req: Request, res: Response) => {
    try {
      const types = await entityService.getEntityTypes();

      res.json({
        success: true,
        data: types
      });
    } catch (error: any) {
      console.error('Error getting entity types:', error);
      res.status(500).json({
        error: 'Failed to get entity types',
        message: error.message
      });
    }
  });

  /**
   * Get entity statistics
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const counts = await entityService.countEntitiesByType();

      res.json({
        success: true,
        data: {
          by_type: counts,
          total: Object.values(counts).reduce((sum, count) => sum + count, 0)
        }
      });
    } catch (error: any) {
      console.error('Error getting entity stats:', error);
      res.status(500).json({
        error: 'Failed to get entity statistics',
        message: error.message
      });
    }
  });

  /**
   * Get entity by ID
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const includeRelationships = req.query.include_relationships === 'true';

      const entity = includeRelationships
        ? await entityService.getEntityWithRelationships(id)
        : await entityService.getEntity(id);

      if (!entity) {
        return res.status(404).json({
          error: 'Entity not found'
        });
      }

      res.json({
        success: true,
        data: entity
      });
    } catch (error: any) {
      console.error('Error getting entity:', error);
      res.status(500).json({
        error: 'Failed to get entity',
        message: error.message
      });
    }
  });

  /**
   * Update entity
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const request: UpdateEntityRequest = req.body;

      const entity = await entityService.updateEntity(id, request);

      if (!entity) {
        return res.status(404).json({
          error: 'Entity not found'
        });
      }

      res.json({
        success: true,
        data: entity
      });
    } catch (error: any) {
      console.error('Error updating entity:', error);
      res.status(500).json({
        error: 'Failed to update entity',
        message: error.message
      });
    }
  });

  /**
   * Delete entity
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const deleted = await entityService.deleteEntity(id);

      if (!deleted) {
        return res.status(404).json({
          error: 'Entity not found'
        });
      }

      res.json({
        success: true,
        message: 'Entity deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting entity:', error);
      res.status(500).json({
        error: 'Failed to delete entity',
        message: error.message
      });
    }
  });

  /**
   * Link device to entity
   */
  router.post('/:id/link-device', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { device_uuid } = req.body;

      if (!device_uuid) {
        return res.status(400).json({
          error: 'Missing required field: device_uuid'
        });
      }

      const entity = await entityService.linkDevice(id, device_uuid);

      if (!entity) {
        return res.status(404).json({
          error: 'Entity not found'
        });
      }

      res.json({
        success: true,
        data: entity
      });
    } catch (error: any) {
      console.error('Error linking device:', error);
      res.status(500).json({
        error: 'Failed to link device',
        message: error.message
      });
    }
  });

  /**
   * Get/set entity properties
   */
  router.get('/:id/properties', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const properties = await entityService.getAllProperties(id);

      res.json({
        success: true,
        data: properties
      });
    } catch (error: any) {
      console.error('Error getting properties:', error);
      res.status(500).json({
        error: 'Failed to get properties',
        message: error.message
      });
    }
  });

  router.put('/:id/properties/:key', async (req: Request, res: Response) => {
    try {
      const { id, key } = req.params;
      const { value } = req.body;

      const property = await entityService.setProperty(id, key, value);

      res.json({
        success: true,
        data: property
      });
    } catch (error: any) {
      console.error('Error setting property:', error);
      res.status(500).json({
        error: 'Failed to set property',
        message: error.message
      });
    }
  });

  return router;
}
