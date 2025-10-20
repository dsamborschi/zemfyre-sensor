/**
 * MQTT User Management Routes
 * 
 * Manages MQTT broker authentication and ACL (Access Control Lists)
 * Compatible with mosquitto-go-auth PostgreSQL backend
 */

import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db/connection';
import { jwtAuth, requireRole } from '../middleware/jwt-auth';

const router = express.Router();

const BCRYPT_ROUNDS = 10;

/**
 * GET /mqtt/users
 * 
 * List all MQTT users
 * Requires: admin role
 */
router.get('/users', jwtAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT 
        mu.id,
        mu.username,
        mu.is_superuser,
        mu.is_active,
        mu.created_at,
        mu.updated_at,
        d.uuid AS device_uuid,
        d.device_name,
        COUNT(ma.id) AS acl_rule_count
       FROM mqtt_users mu
       LEFT JOIN devices d ON d.mqtt_username = mu.username
       LEFT JOIN mqtt_acls ma ON ma.username = mu.username
       GROUP BY mu.id, mu.username, mu.is_superuser, mu.is_active, mu.created_at, mu.updated_at, d.uuid, d.device_name
       ORDER BY mu.created_at DESC`
    );

    res.status(200).json({
      data: {
        users: result.rows,
        total: result.rows.length
      }
    });

  } catch (error: any) {
    console.error('List MQTT users error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list MQTT users'
    });
  }
});

/**
 * POST /mqtt/users
 * 
 * Create a new MQTT user
 * Requires: admin role
 * 
 * Body:
 *   - username: string (required)
 *   - password: string (required)
 *   - isSuperuser: boolean (optional, default: false)
 *   - isActive: boolean (optional, default: true)
 */
router.post('/users', jwtAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { username, password, isSuperuser = false, isActive = true } = req.body;

    if (!username || !password) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Username and password are required'
      });
      return;
    }

    // Check if username already exists
    const existing = await query(
      'SELECT id FROM mqtt_users WHERE username = $1',
      [username]
    );

    if (existing.rows.length > 0) {
      res.status(409).json({
        error: 'Conflict',
        message: 'MQTT username already exists'
      });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Insert user
    const result = await query(
      `INSERT INTO mqtt_users (username, password_hash, is_superuser, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, is_superuser, is_active, created_at`,
      [username, passwordHash, isSuperuser, isActive]
    );

    // Log audit event
    await query(
      `INSERT INTO audit_logs (event_type, user_id, details, severity)
       VALUES ('mqtt_user_created', $1, $2, 'info')`,
      [req.user!.id, JSON.stringify({ username, isSuperuser })]
    );

    res.status(201).json({
      message: 'MQTT user created successfully',
      data: result.rows[0]
    });

  } catch (error: any) {
    console.error('Create MQTT user error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create MQTT user'
    });
  }
});

/**
 * PUT /mqtt/users/:username/password
 * 
 * Update MQTT user password
 * Requires: admin role
 * 
 * Body:
 *   - password: string (required)
 */
router.put('/users/:username/password', jwtAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { password } = req.body;

    if (!password) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Password is required'
      });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Update password
    const result = await query(
      `UPDATE mqtt_users
       SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE username = $2
       RETURNING id, username, is_superuser, is_active`,
      [passwordHash, username]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: 'MQTT user not found'
      });
      return;
    }

    // Log audit event
    await query(
      `INSERT INTO audit_logs (event_type, user_id, details, severity)
       VALUES ('mqtt_password_changed', $1, $2, 'info')`,
      [req.user!.id, JSON.stringify({ username })]
    );

    res.status(200).json({
      message: 'MQTT password updated successfully',
      data: result.rows[0]
    });

  } catch (error: any) {
    console.error('Update MQTT password error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update MQTT password'
    });
  }
});

/**
 * DELETE /mqtt/users/:username
 * 
 * Delete an MQTT user
 * Requires: admin role
 */
router.delete('/users/:username', jwtAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    // Delete user (CASCADE will delete associated ACLs)
    const result = await query(
      'DELETE FROM mqtt_users WHERE username = $1 RETURNING id',
      [username]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: 'MQTT user not found'
      });
      return;
    }

    // Log audit event
    await query(
      `INSERT INTO audit_logs (event_type, user_id, details, severity)
       VALUES ('mqtt_user_deleted', $1, $2, 'warning')`,
      [req.user!.id, JSON.stringify({ username })]
    );

    res.status(200).json({
      message: 'MQTT user deleted successfully'
    });

  } catch (error: any) {
    console.error('Delete MQTT user error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete MQTT user'
    });
  }
});

/**
 * GET /mqtt/acls
 * 
 * List all ACL rules
 * Requires: admin role
 * 
 * Query params:
 *   - username: filter by username (optional)
 *   - topic: filter by topic pattern (optional)
 */
router.get('/acls', jwtAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { username, topic } = req.query;

    let queryStr = `
      SELECT id, username, clientid, topic, access, priority, created_at
      FROM mqtt_acls
      WHERE 1=1
    `;
    const params: any[] = [];

    if (username) {
      params.push(username);
      queryStr += ` AND username = $${params.length}`;
    }

    if (topic) {
      params.push(topic);
      queryStr += ` AND topic LIKE $${params.length}`;
    }

    queryStr += ' ORDER BY priority DESC, created_at DESC';

    const result = await query(queryStr, params);

    // Map access codes to readable names
    const aclsWithReadableAccess = result.rows.map(acl => ({
      ...acl,
      accessName: acl.access === 1 ? 'read' : acl.access === 2 ? 'write' : 'read+write'
    }));

    res.status(200).json({
      data: {
        acls: aclsWithReadableAccess,
        total: result.rows.length
      }
    });

  } catch (error: any) {
    console.error('List ACLs error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list ACLs'
    });
  }
});

/**
 * POST /mqtt/acls
 * 
 * Create a new ACL rule
 * Requires: admin role
 * 
 * Body:
 *   - username: string (optional, null = applies to all)
 *   - clientid: string (optional, null = applies to all)
 *   - topic: string (required, supports wildcards: +, #)
 *   - access: 'read' | 'write' | 'readwrite' (required)
 *   - priority: number (optional, default: 0)
 */
router.post('/acls', jwtAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { username, clientid, topic, access, priority = 0 } = req.body;

    if (!topic || !access) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Topic and access are required'
      });
      return;
    }

    // Convert access string to code
    let accessCode: number;
    switch (access.toLowerCase()) {
      case 'read':
      case 'subscribe':
        accessCode = 1;
        break;
      case 'write':
      case 'publish':
        accessCode = 2;
        break;
      case 'readwrite':
      case 'read+write':
      case 'both':
        accessCode = 3;
        break;
      default:
        res.status(400).json({
          error: 'Bad Request',
          message: 'Access must be: read, write, or readwrite'
        });
        return;
    }

    // Insert ACL rule
    const result = await query(
      `INSERT INTO mqtt_acls (username, clientid, topic, access, priority)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, clientid, topic, access, priority, created_at`,
      [username || null, clientid || null, topic, accessCode, priority]
    );

    // Log audit event
    await query(
      `INSERT INTO audit_logs (event_type, user_id, details, severity)
       VALUES ('mqtt_acl_created', $1, $2, 'info')`,
      [req.user!.id, JSON.stringify({ username, topic, access, priority })]
    );

    res.status(201).json({
      message: 'ACL rule created successfully',
      data: result.rows[0]
    });

  } catch (error: any) {
    console.error('Create ACL error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create ACL rule'
    });
  }
});

/**
 * DELETE /mqtt/acls/:id
 * 
 * Delete an ACL rule
 * Requires: admin role
 */
router.delete('/acls/:id', jwtAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get ACL details before deletion (for audit log)
    const aclResult = await query(
      'SELECT username, topic FROM mqtt_acls WHERE id = $1',
      [id]
    );

    if (aclResult.rows.length === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: 'ACL rule not found'
      });
      return;
    }

    const aclData = aclResult.rows[0];

    // Delete ACL
    await query('DELETE FROM mqtt_acls WHERE id = $1', [id]);

    // Log audit event
    await query(
      `INSERT INTO audit_logs (event_type, user_id, details, severity)
       VALUES ('mqtt_acl_deleted', $1, $2, 'warning')`,
      [req.user!.id, JSON.stringify({ aclId: id, username: aclData.username, topic: aclData.topic })]
    );

    res.status(200).json({
      message: 'ACL rule deleted successfully'
    });

  } catch (error: any) {
    console.error('Delete ACL error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete ACL rule'
    });
  }
});

export default router;
