import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { RelationshipService } from '../services/relationship-service';
import { CreateRelationshipRequest, RelationshipFilter } from '../types/entities';

/**
 * Relationship Routes - Manage entity relationships
 * 
 * Endpoints:
 * - POST   /api/v1/relationships                    Create relationship
 * - GET    /api/v1/relationships                    List relationships
 * - GET    /api/v1/relationships/:id                Get relationship by ID
 * - DELETE /api/v1/relationships/:id                Delete relationship
 * - GET    /api/v1/relationships/:id/children       Get children
 * - GET    /api/v1/relationships/:id/parent         Get parent
 * - GET    /api/v1/relationships/:id/descendants    Get all descendants
 * - GET    /api/v1/relationships/:id/ancestors      Get all ancestors
 * - GET    /api/v1/relationships/:id/dependencies   Get dependencies
 * - GET    /api/v1/relationships/:id/dependents     Get dependents
 * - GET    /api/v1/relationships/:id/related        Get related entities
 */
export function createRelationshipsRouter(pool: Pool): Router {
  const router = Router();
  const relationshipService = new RelationshipService(pool);

  /**
   * Create a new relationship
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const request: CreateRelationshipRequest = req.body;

      // Validate required fields
      if (!request.source_entity_id || !request.target_entity_id || !request.relationship_type) {
        return res.status(400).json({
          error: 'Missing required fields: source_entity_id, target_entity_id, relationship_type'
        });
      }

      const relationship = await relationshipService.createRelationship(request);

      res.status(201).json({
        success: true,
        data: relationship
      });
    } catch (error: any) {
      console.error('Error creating relationship:', error);
      
      // Handle duplicate relationship error
      if (error.message.includes('duplicate') || error.code === '23505') {
        return res.status(409).json({
          error: 'Relationship already exists',
          message: error.message
        });
      }

      res.status(500).json({
        error: 'Failed to create relationship',
        message: error.message
      });
    }
  });

  /**
   * List relationships with filters
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const filter: RelationshipFilter = {
        source_entity_id: req.query.source_id as string,
        target_entity_id: req.query.target_id as string,
        relationship_type: req.query.type as any,
        direction: (req.query.direction as any) || 'both'
      };

      const relationships = await relationshipService.listRelationships(filter);

      res.json({
        success: true,
        data: relationships,
        count: relationships.length
      });
    } catch (error: any) {
      console.error('Error listing relationships:', error);
      res.status(500).json({
        error: 'Failed to list relationships',
        message: error.message
      });
    }
  });

  /**
   * Get relationship by ID
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const relationship = await relationshipService.getRelationship(id);

      if (!relationship) {
        return res.status(404).json({
          error: 'Relationship not found'
        });
      }

      res.json({
        success: true,
        data: relationship
      });
    } catch (error: any) {
      console.error('Error getting relationship:', error);
      res.status(500).json({
        error: 'Failed to get relationship',
        message: error.message
      });
    }
  });

  /**
   * Delete relationship
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const deleted = await relationshipService.deleteRelationship(id);

      if (!deleted) {
        return res.status(404).json({
          error: 'Relationship not found'
        });
      }

      res.json({
        success: true,
        message: 'Relationship deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting relationship:', error);
      res.status(500).json({
        error: 'Failed to delete relationship',
        message: error.message
      });
    }
  });

  /**
   * Get direct children (entities this entity CONTAINS)
   */
  router.get('/:id/children', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const children = await relationshipService.getChildren(id);

      res.json({
        success: true,
        data: children,
        count: children.length
      });
    } catch (error: any) {
      console.error('Error getting children:', error);
      res.status(500).json({
        error: 'Failed to get children',
        message: error.message
      });
    }
  });

  /**
   * Get parent (entity that CONTAINS this entity)
   */
  router.get('/:id/parent', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const parent = await relationshipService.getParent(id);

      res.json({
        success: true,
        data: parent
      });
    } catch (error: any) {
      console.error('Error getting parent:', error);
      res.status(500).json({
        error: 'Failed to get parent',
        message: error.message
      });
    }
  });

  /**
   * Get all descendants (recursive)
   */
  router.get('/:id/descendants', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const maxDepth = req.query.max_depth ? parseInt(req.query.max_depth as string, 10) : 10;

      const descendants = await relationshipService.getDescendants(id, maxDepth);

      res.json({
        success: true,
        data: descendants,
        count: descendants.length
      });
    } catch (error: any) {
      console.error('Error getting descendants:', error);
      res.status(500).json({
        error: 'Failed to get descendants',
        message: error.message
      });
    }
  });

  /**
   * Get all ancestors (recursive)
   */
  router.get('/:id/ancestors', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const maxDepth = req.query.max_depth ? parseInt(req.query.max_depth as string, 10) : 10;

      const ancestors = await relationshipService.getAncestors(id, maxDepth);

      res.json({
        success: true,
        data: ancestors,
        count: ancestors.length
      });
    } catch (error: any) {
      console.error('Error getting ancestors:', error);
      res.status(500).json({
        error: 'Failed to get ancestors',
        message: error.message
      });
    }
  });

  /**
   * Get hierarchy tree
   */
  router.get('/:id/tree', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const maxDepth = req.query.max_depth ? parseInt(req.query.max_depth as string, 10) : 10;

      const tree = await relationshipService.buildHierarchyTree(id, maxDepth);

      if (!tree) {
        return res.status(404).json({
          error: 'Entity not found'
        });
      }

      res.json({
        success: true,
        data: tree
      });
    } catch (error: any) {
      console.error('Error building tree:', error);
      res.status(500).json({
        error: 'Failed to build hierarchy tree',
        message: error.message
      });
    }
  });

  /**
   * Get entities that depend on this entity
   */
  router.get('/:id/dependents', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const maxDepth = req.query.max_depth ? parseInt(req.query.max_depth as string, 10) : 5;

      const dependents = await relationshipService.getDependentEntities(id, maxDepth);

      res.json({
        success: true,
        data: dependents,
        count: dependents.length
      });
    } catch (error: any) {
      console.error('Error getting dependents:', error);
      res.status(500).json({
        error: 'Failed to get dependent entities',
        message: error.message
      });
    }
  });

  /**
   * Get entities this entity depends on
   */
  router.get('/:id/dependencies', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const maxDepth = req.query.max_depth ? parseInt(req.query.max_depth as string, 10) : 5;

      const dependencies = await relationshipService.getDependencies(id, maxDepth);

      res.json({
        success: true,
        data: dependencies,
        count: dependencies.length
      });
    } catch (error: any) {
      console.error('Error getting dependencies:', error);
      res.status(500).json({
        error: 'Failed to get dependencies',
        message: error.message
      });
    }
  });

  /**
   * Get related entities by relationship type
   */
  router.get('/:id/related', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const relationshipType = req.query.type as string;
      const direction = (req.query.direction as any) || 'both';

      if (!relationshipType) {
        return res.status(400).json({
          error: 'Missing required query parameter: type'
        });
      }

      const related = await relationshipService.getRelatedEntities(id, relationshipType, direction);

      res.json({
        success: true,
        data: related,
        count: related.length
      });
    } catch (error: any) {
      console.error('Error getting related entities:', error);
      res.status(500).json({
        error: 'Failed to get related entities',
        message: error.message
      });
    }
  });

  /**
   * Find path between two entities
   */
  router.get('/path/:fromId/:toId', async (req: Request, res: Response) => {
    try {
      const { fromId, toId } = req.params;
      const maxDepth = req.query.max_depth ? parseInt(req.query.max_depth as string, 10) : 10;

      const path = await relationshipService.findPath(fromId, toId, maxDepth);

      if (!path) {
        return res.status(404).json({
          error: 'No path found between entities'
        });
      }

      res.json({
        success: true,
        data: path
      });
    } catch (error: any) {
      console.error('Error finding path:', error);
      res.status(500).json({
        error: 'Failed to find path',
        message: error.message
      });
    }
  });

  return router;
}
