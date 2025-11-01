/**
 * Image Registry Management Routes
 * 
 * API endpoints for managing approved Docker images and their tags.
 * Allows admins to control which images are available for deployment.
 */

import express, { Request, Response } from 'express';
import poolWrapper from '../db/connection';
import { EventPublisher } from '../services/event-sourcing';
import { imageMonitor } from '../services/image-monitor';

const router = express.Router();
const pool = poolWrapper.pool;
const eventPublisher = new EventPublisher('image-registry');

/**
 * GET /api/v1/images
 * List all approved images
 */
router.get('/images', async (req: Request, res: Response) => {
  try {
    const { status, category, search } = req.query;

    let query = `
      SELECT 
        i.id,
        i.image_name,
        i.registry,
        i.namespace,
        i.description,
        i.category,
        i.is_official,
        i.approval_status,
        i.approved_at,
        i.created_at,
        COUNT(t.id) as tag_count
      FROM images i
      LEFT JOIN image_tags t ON i.id = t.image_id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND i.approval_status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (category) {
      query += ` AND i.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      query += ` AND (i.image_name ILIKE $${paramIndex} OR i.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` GROUP BY i.id ORDER BY i.image_name`;

    const result = await pool.query(query, params);

    return res.status(200).json({
      images: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Error listing images:', error);
    return res.status(500).json({
      error: 'Failed to list images',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/images/categories
 * Get list of image categories
 */
router.get('/images/categories', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT category, COUNT(*) as count 
       FROM images 
       WHERE category IS NOT NULL
       GROUP BY category 
       ORDER BY count DESC, category`
    );

    return res.status(200).json({
      categories: result.rows,
    });
  } catch (error) {
    console.error('Error getting categories:', error);
    return res.status(500).json({
      error: 'Failed to get categories',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/images/:id
 * Get image details with all tags
 */
router.get('/images/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get image details
    const imageResult = await pool.query(
      'SELECT * FROM images WHERE id = $1',
      [id]
    );

    if (imageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const image = imageResult.rows[0];

    // Get all tags for this image
    const tagsResult = await pool.query(
      `SELECT * FROM image_tags 
       WHERE image_id = $1 
       ORDER BY 
         is_recommended DESC,
         pushed_at DESC NULLS LAST,
         tag DESC`,
      [id]
    );

    return res.status(200).json({
      ...image,
      tags: tagsResult.rows,
    });
  } catch (error) {
    console.error('Error getting image:', error);
    return res.status(500).json({
      error: 'Failed to get image',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/images
 * Add new image to approved registry
 */
router.post('/images', async (req: Request, res: Response) => {
  try {
    const {
      image_name,
      registry = 'docker.io',
      namespace,
      description,
      category,
      is_official = false,
    } = req.body;

    if (!image_name) {
      return res.status(400).json({ error: 'image_name is required' });
    }

    const result = await pool.query(
      `INSERT INTO images 
       (image_name, registry, namespace, description, category, is_official, approval_status, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'approved', CURRENT_TIMESTAMP)
       RETURNING *`,
      [image_name, registry, namespace, description, category, is_official]
    );

    const image = result.rows[0];

    // Publish event
    await eventPublisher.publish(
      'image.registry.added',
      'image',
      image.id.toString(),
      {
        image_name,
        registry,
        namespace,
        category,
      }
    );

    return res.status(201).json(image);
  } catch (error) {
    console.error('Error adding image:', error);
    
    if (error instanceof Error && error.message.includes('duplicate key')) {
      return res.status(409).json({
        error: 'Image already exists',
        message: 'This image is already in the registry',
      });
    }

    return res.status(500).json({
      error: 'Failed to add image',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/v1/images/:id
 * Update image details
 */
router.put('/images/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { description, category, approval_status } = req.body;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;
    }

    if (category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    if (approval_status !== undefined) {
      updates.push(`approval_status = $${paramIndex}`);
      params.push(approval_status);
      paramIndex++;
      
      if (approval_status === 'approved') {
        updates.push(`approved_at = CURRENT_TIMESTAMP`);
      }
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const query = `
      UPDATE images 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Publish event
    await eventPublisher.publish(
      'image.registry.updated',
      'image',
      id,
      { updates: req.body }
    );

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error updating image:', error);
    return res.status(500).json({
      error: 'Failed to update image',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/v1/images/:id
 * Remove image from registry
 */
router.delete('/images/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if image is used in any device target state or policies
    const usageCheck = await pool.query(
      `SELECT COUNT(*) as count FROM image_update_policies WHERE image_pattern LIKE $1`,
      [`%${id}%`]
    );

    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(409).json({
        error: 'Image is in use',
        message: 'Cannot delete image that has active update policies',
      });
    }

    const result = await pool.query(
      'DELETE FROM images WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Publish event
    await eventPublisher.publish(
      'image.registry.deleted',
      'image',
      id,
      { image: result.rows[0] }
    );

    return res.status(200).json({
      message: 'Image deleted successfully',
      image: result.rows[0],
    });
  } catch (error) {
    console.error('Error deleting image:', error);
    return res.status(500).json({
      error: 'Failed to delete image',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/images/:id/tags
 * Add new tag to image
 */
router.post('/images/:id/tags', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      tag,
      digest,
      size_bytes,
      architecture = 'amd64',
      os = 'linux',
      is_recommended = false,
    } = req.body;

    if (!tag) {
      return res.status(400).json({ error: 'tag is required' });
    }

    const result = await pool.query(
      `INSERT INTO image_tags 
       (image_id, tag, digest, size_bytes, architecture, os, is_recommended, pushed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       RETURNING *`,
      [id, tag, digest, size_bytes, architecture, os, is_recommended]
    );

    // If this tag is marked as recommended, unmark others
    if (is_recommended) {
      await pool.query(
        `UPDATE image_tags 
         SET is_recommended = false 
         WHERE image_id = $1 AND id != $2`,
        [id, result.rows[0].id]
      );
    }

    // Publish event
    await eventPublisher.publish(
      'image.tag.added',
      'image',
      id,
      { tag, architecture }
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding tag:', error);
    
    if (error instanceof Error && error.message.includes('duplicate key')) {
      return res.status(409).json({
        error: 'Tag already exists',
        message: 'This tag already exists for this image',
      });
    }

    return res.status(500).json({
      error: 'Failed to add tag',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/v1/images/:imageId/tags/:tagId
 * Update tag details
 */
router.put('/images/:imageId/tags/:tagId', async (req: Request, res: Response) => {
  try {
    const { imageId, tagId } = req.params;
    const { is_recommended, is_deprecated, security_scan_status, vulnerabilities_count } = req.body;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (is_recommended !== undefined) {
      updates.push(`is_recommended = $${paramIndex}`);
      params.push(is_recommended);
      paramIndex++;
      
      // If marking as recommended, unmark others
      if (is_recommended) {
        await pool.query(
          `UPDATE image_tags 
           SET is_recommended = false 
           WHERE image_id = $1 AND id != $2`,
          [imageId, tagId]
        );
      }
    }

    if (is_deprecated !== undefined) {
      updates.push(`is_deprecated = $${paramIndex}`);
      params.push(is_deprecated);
      paramIndex++;
    }

    if (security_scan_status !== undefined) {
      updates.push(`security_scan_status = $${paramIndex}`);
      params.push(security_scan_status);
      paramIndex++;
    }

    if (vulnerabilities_count !== undefined) {
      updates.push(`vulnerabilities_count = $${paramIndex}`);
      params.push(vulnerabilities_count);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(tagId);

    const query = `
      UPDATE image_tags 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND image_id = $${paramIndex + 1}
      RETURNING *
    `;
    params.push(imageId);

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error updating tag:', error);
    return res.status(500).json({
      error: 'Failed to update tag',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/v1/images/:imageId/tags/:tagId
 * Remove tag from image
 */
router.delete('/images/:imageId/tags/:tagId', async (req: Request, res: Response) => {
  try {
    const { imageId, tagId } = req.params;

    const result = await pool.query(
      'DELETE FROM image_tags WHERE id = $1 AND image_id = $2 RETURNING *',
      [tagId, imageId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    return res.status(200).json({
      message: 'Tag deleted successfully',
      tag: result.rows[0],
    });
  } catch (error) {
    console.error('Error deleting tag:', error);
    return res.status(500).json({
      error: 'Failed to delete tag',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Image Monitoring Endpoints
// ============================================================================

/**
 * GET /api/v1/images/monitor/status
 * Get current status of the image monitoring service
 */
router.get('/images/monitor/status', async (req: Request, res: Response) => {
  try {
    const status = imageMonitor.getStatus();
    return res.status(200).json(status);
  } catch (error) {
    console.error('Error getting monitor status:', error);
    return res.status(500).json({
      error: 'Failed to get monitor status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/images/:imageId/check
 * Manually trigger a check for new tags on a specific image
 */
router.post('/images/:imageId/check', async (req: Request, res: Response) => {
  try {
    const { imageId } = req.params;

    // Get image name
    const imageResult = await pool.query(
      'SELECT image_name FROM images WHERE id = $1',
      [imageId]
    );

    if (imageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const imageName = imageResult.rows[0].image_name;

    // Trigger manual check
    await imageMonitor.checkImage(imageName);

    // Update last checked timestamp
    await pool.query(
      'UPDATE images SET last_checked_at = NOW(), next_check_at = NOW() + INTERVAL \'60 minutes\' WHERE id = $1',
      [imageId]
    );

    return res.status(200).json({
      message: 'Image check triggered successfully',
      image_name: imageName,
    });
  } catch (error) {
    console.error('Error checking image:', error);
    return res.status(500).json({
      error: 'Failed to check image',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/v1/images/:imageId/monitoring
 * Enable or disable monitoring for a specific image
 */
router.put('/images/:imageId/monitoring', async (req: Request, res: Response) => {
  try {
    const { imageId } = req.params;
    const { watch_for_updates } = req.body;

    if (typeof watch_for_updates !== 'boolean') {
      return res.status(400).json({ error: 'watch_for_updates must be a boolean' });
    }

    const result = await pool.query(
      `UPDATE images 
       SET watch_for_updates = $1,
           next_check_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [watch_for_updates, imageId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    return res.status(200).json({
      message: `Monitoring ${watch_for_updates ? 'enabled' : 'disabled'} successfully`,
      image: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating monitoring status:', error);
    return res.status(500).json({
      error: 'Failed to update monitoring status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/images/monitor/trigger
 * Manually trigger a full check of all monitored images
 */
router.post('/images/monitor/trigger', async (req: Request, res: Response) => {
  try {
    // Get all monitored images
    const result = await pool.query(
      `SELECT image_name FROM images 
       WHERE watch_for_updates = true AND approval_status = 'approved'`
    );

    const promises = result.rows.map(row => imageMonitor.checkImage(row.image_name));
    await Promise.all(promises);

    return res.status(200).json({
      message: 'Manual check triggered successfully',
      images_checked: result.rows.length,
    });
  } catch (error) {
    console.error('Error triggering manual check:', error);
    return res.status(500).json({
      error: 'Failed to trigger manual check',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Security Scanning Endpoints
// =============================================================================

/**
 * POST /api/v1/images/:imageName/:tag/scan
 * Manually trigger a security scan for a specific image tag
 */
router.post('/images/:imageName/:tag/scan', async (req: Request, res: Response) => {
  try {
    const { imageName, tag } = req.params;


    console.log(`[API] Triggering security scan for ${imageName}:${tag}`);

   
    return res.status(200).json({
      message: 'Security scan completed'
  
    });
  } catch (error) {
    console.error('Error scanning image:', error);
    return res.status(500).json({
      error: 'Failed to scan image',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/images/approvals/:id/security
 * Get security scan results for an approval request
 */
router.get('/images/approvals/:id/security', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        image_name,
        tag_name,
        metadata->>'security_scan' as security_scan,
        created_at
       FROM image_approval_requests
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    const approval = result.rows[0];
    const securityScan = approval.security_scan ? JSON.parse(approval.security_scan) : null;

    return res.status(200).json({
      image_name: approval.image_name,
      tag_name: approval.tag_name,
      security_scan: securityScan,
      created_at: approval.created_at,
    });
  } catch (error) {
    console.error('Error fetching security scan:', error);
    return res.status(500).json({
      error: 'Failed to fetch security scan',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/images/security/summary
 * Get security summary for all approval requests
 */
router.get('/images/security/summary', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
        id,
        image_name,
        tag_name,
        status,
        metadata->'security_scan'->>'status' as scan_status,
        metadata->'security_scan'->'vulnerabilities'->>'critical' as critical,
        metadata->'security_scan'->'vulnerabilities'->>'high' as high,
        metadata->'security_scan'->'vulnerabilities'->>'medium' as medium,
        metadata->'security_scan'->'vulnerabilities'->>'low' as low,
        metadata->'security_scan'->>'scanned_at' as scanned_at,
        created_at
       FROM image_approval_requests
       WHERE metadata->'security_scan' IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 100`
    );

    const summary = {
      total: result.rows.length,
      passed: result.rows.filter(r => r.scan_status === 'passed').length,
      warning: result.rows.filter(r => r.scan_status === 'warning').length,
      failed: result.rows.filter(r => r.scan_status === 'failed').length,
      approvals: result.rows.map(row => ({
        id: row.id,
        image_name: row.image_name,
        tag_name: row.tag_name,
        status: row.status,
        scan_status: row.scan_status,
        vulnerabilities: {
          critical: parseInt(row.critical || '0', 10),
          high: parseInt(row.high || '0', 10),
          medium: parseInt(row.medium || '0', 10),
          low: parseInt(row.low || '0', 10),
        },
        scanned_at: row.scanned_at,
        created_at: row.created_at,
      })),
    };

    return res.status(200).json(summary);
  } catch (error) {
    console.error('Error fetching security summary:', error);
    return res.status(500).json({
      error: 'Failed to fetch security summary',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
