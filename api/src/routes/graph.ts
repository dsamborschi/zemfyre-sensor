import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { GraphService } from '../services/graph-service';

/**
 * Graph Routes - Advanced graph queries and analytics
 * 
 * Endpoints:
 * - GET /api/v1/graph/topology                    Get complete graph topology
 * - GET /api/v1/graph/tree/:id                    Get hierarchy tree
 * - GET /api/v1/graph/impact/:id                  Analyze impact of entity failure
 * - GET /api/v1/graph/metrics/:id                 Get aggregate metrics
 * - GET /api/v1/graph/building/:id/status         Get building status
 * - GET /api/v1/graph/device-locations            Get all device locations
 * - GET /api/v1/graph/correlated/:deviceUuid      Find correlated devices
 * - GET /api/v1/graph/statistics                  Get graph statistics
 * - GET /api/v1/graph/orphaned                    Find orphaned entities
 */
export function createGraphRouter(pool: Pool): Router {
  const router = Router();
  const graphService = new GraphService(pool);

  /**
   * Get complete graph topology for visualization
   */
  router.get('/topology', async (req: Request, res: Response) => {
    try {
      const entityType = req.query.type as string;
      const topology = await graphService.getTopology(entityType);

      res.json({
        success: true,
        data: topology,
        node_count: topology.nodes.length,
        edge_count: topology.edges.length
      });
    } catch (error: any) {
      console.error('Error getting topology:', error);
      res.status(500).json({
        error: 'Failed to get graph topology',
        message: error.message
      });
    }
  });

  /**
   * Get hierarchy tree with full structure
   */
  router.get('/tree/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const tree = await graphService.getHierarchyTree(id);

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
      console.error('Error getting hierarchy tree:', error);
      res.status(500).json({
        error: 'Failed to get hierarchy tree',
        message: error.message
      });
    }
  });

  /**
   * Analyze impact if entity fails
   */
  router.get('/impact/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const analysis = await graphService.analyzeImpact(id);

      res.json({
        success: true,
        data: analysis
      });
    } catch (error: any) {
      console.error('Error analyzing impact:', error);
      
      if (error.message === 'Entity not found') {
        return res.status(404).json({
          error: 'Entity not found'
        });
      }

      res.status(500).json({
        error: 'Failed to analyze impact',
        message: error.message
      });
    }
  });

  /**
   * Get aggregate metrics for entity
   */
  router.get('/metrics/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const metrics = await graphService.getAggregateMetrics(id);

      res.json({
        success: true,
        data: metrics
      });
    } catch (error: any) {
      console.error('Error getting metrics:', error);
      
      if (error.message === 'Entity not found') {
        return res.status(404).json({
          error: 'Entity not found'
        });
      }

      res.status(500).json({
        error: 'Failed to get aggregate metrics',
        message: error.message
      });
    }
  });

  /**
   * Get building status with all floors and rooms
   */
  router.get('/building/:id/status', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const status = await graphService.getBuildingStatus(id);

      res.json({
        success: true,
        data: status
      });
    } catch (error: any) {
      console.error('Error getting building status:', error);
      
      if (error.message.includes('not a building')) {
        return res.status(400).json({
          error: 'Entity is not a building'
        });
      }

      if (error.message === 'Entity not found') {
        return res.status(404).json({
          error: 'Building not found'
        });
      }

      res.status(500).json({
        error: 'Failed to get building status',
        message: error.message
      });
    }
  });

  /**
   * Get all device locations
   */
  router.get('/device-locations', async (req: Request, res: Response) => {
    try {
      const locations = await graphService.getDeviceLocations();

      res.json({
        success: true,
        data: locations,
        count: locations.length
      });
    } catch (error: any) {
      console.error('Error getting device locations:', error);
      res.status(500).json({
        error: 'Failed to get device locations',
        message: error.message
      });
    }
  });

  /**
   * Find correlated devices (in same room/zone)
   */
  router.get('/correlated/:deviceUuid', async (req: Request, res: Response) => {
    try {
      const { deviceUuid } = req.params;
      const correlatedUuids = await graphService.findCorrelatedDevices(deviceUuid);

      res.json({
        success: true,
        data: correlatedUuids,
        count: correlatedUuids.length
      });
    } catch (error: any) {
      console.error('Error finding correlated devices:', error);
      res.status(500).json({
        error: 'Failed to find correlated devices',
        message: error.message
      });
    }
  });

  /**
   * Get graph statistics
   */
  router.get('/statistics', async (req: Request, res: Response) => {
    try {
      const stats = await graphService.getStatistics();

      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      console.error('Error getting statistics:', error);
      res.status(500).json({
        error: 'Failed to get statistics',
        message: error.message
      });
    }
  });

  /**
   * Find orphaned entities (no relationships)
   */
  router.get('/orphaned', async (req: Request, res: Response) => {
    try {
      const orphaned = await graphService.findOrphanedEntities();

      res.json({
        success: true,
        data: orphaned,
        count: orphaned.length
      });
    } catch (error: any) {
      console.error('Error finding orphaned entities:', error);
      res.status(500).json({
        error: 'Failed to find orphaned entities',
        message: error.message
      });
    }
  });

  return router;
}
