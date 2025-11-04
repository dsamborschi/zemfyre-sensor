import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db/connection';

const router = Router();

/**
 * Mosquitto HTTP Authentication Backend
 * 
 * This router provides HTTP endpoints for Mosquitto MQTT broker authentication
 * using the mosquitto-go-auth plugin's HTTP backend.
 * 
 * Endpoints:
 * - POST /user: Username/password authentication
 * - POST /superuser: Superuser privilege check
 * - POST /acl: Topic access control list check
 * 
 * All endpoints return:
 * - 200 OK: Access granted
 * - 403 Forbidden: Access denied
 * - 500 Internal Server Error: Server error
 */

/**
 * Helper function to match MQTT topics with wildcard patterns
 * 
 * MQTT wildcards:
 * - + : Single-level wildcard (matches exactly one level)
 * - # : Multi-level wildcard (matches zero or more levels, must be last)
 * 
 * Examples:
 * - sensor/+ matches sensor/temperature but not sensor/room/temperature
 * - sensor/# matches sensor/temperature AND sensor/room/temperature
 * 
 * @param topic - The actual MQTT topic to check
 * @param pattern - The pattern with wildcards to match against
 * @returns true if topic matches pattern, false otherwise
 */
function topicMatches(topic: string, pattern: string): boolean {
  // Exact match
  if (topic === pattern) {
    return true;
  }

  // Convert MQTT wildcard pattern to regex
  // + matches exactly one level (no forward slashes)
  // # matches zero or more levels (including forward slashes)
  const regexPattern = pattern
    .replace(/\+/g, '[^/]+')        // + becomes [^/]+ (one or more non-slash chars)
    .replace(/#/g, '.*')             // # becomes .* (zero or more of any char)
    .replace(/\//g, '\\/');          // Escape forward slashes

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(topic);
}

/**
 * POST /user
 * 
 * Authenticate username and password
 * 
 * Request body:
 * {
 *   "username": "string",
 *   "password": "string"
 * }
 * 
 * Response:
 * - 200 OK: Authentication successful
 * - 403 Forbidden: Invalid credentials or inactive user
 * - 500 Internal Server Error: Database error
 */
router.post('/user', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    console.log('[Mosquitto Auth] Missing credentials in request');
    return res.status(403).json({ error: 'Missing credentials' });
  }

  console.log(`[Mosquitto Auth] User authentication request: username=${username}`);

  try {
    // Query user from database
    const result = await pool.query(
      'SELECT password_hash, is_active FROM mqtt_users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      console.log(`[Mosquitto Auth] User not found: ${username}`);
      return res.status(403).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Check if user is active
    if (!user.is_active) {
      console.log(`[Mosquitto Auth] User inactive: ${username}`);
      return res.status(403).json({ error: 'User inactive' });
    }

    // Verify password using bcrypt
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      console.log(`[Mosquitto Auth] Invalid password for user: ${username}`);
      return res.status(403).json({ error: 'Invalid password' });
    }

    console.log(`[Mosquitto Auth] User authenticated successfully: ${username}`);
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('[Mosquitto Auth] Database error during user authentication:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /superuser
 * 
 * Check if user has superuser privileges
 * Superusers bypass all ACL checks and have full access
 * 
 * Request body:
 * {
 *   "username": "string"
 * }
 * 
 * Response:
 * - 200 OK: User is a superuser
 * - 403 Forbidden: User is not a superuser or not found
 * - 500 Internal Server Error: Database error
 */
router.post('/superuser', async (req: Request, res: Response) => {
  const { username } = req.body;

  if (!username) {
    console.log('[Mosquitto Auth] Missing username for superuser check');
    return res.status(403).json({ error: 'Missing username' });
  }

  console.log(`[Mosquitto Auth] Superuser check request: username=${username}`);

  try {
    // Query superuser status
    const result = await pool.query(
      'SELECT is_superuser FROM mqtt_users WHERE username = $1 AND is_active = true',
      [username]
    );

    if (result.rows.length === 0) {
      console.log(`[Mosquitto Auth] User not found or inactive: ${username}`);
      return res.status(403).json({ error: 'User not found or inactive' });
    }

    const isSuperuser = result.rows[0].is_superuser;

    if (isSuperuser) {
      console.log(`[Mosquitto Auth] User IS a superuser: ${username}`);
      return res.status(200).json({ success: true });
    } else {
      console.log(`[Mosquitto Auth] User is NOT a superuser: ${username}`);
      return res.status(403).json({ error: 'Not a superuser' });
    }

  } catch (error) {
    console.error('[Mosquitto Auth] Database error during superuser check:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /acl
 * 
 * Check if user has access to a specific topic
 * 
 * Request body:
 * {
 *   "username": "string",
 *   "topic": "string",
 *   "acc": number  // 1=read, 2=write
 * }
 * 
 * Response:
 * - 200 OK: Access granted
 * - 403 Forbidden: Access denied
 * - 500 Internal Server Error: Database error
 * 
 * Access codes:
 * - 1: Read access (subscribe)
 * - 2: Write access (publish)
 * 
 * ACL rules support MQTT wildcards in the topic pattern
 */
router.post('/acl', async (req: Request, res: Response) => {
  const { username, topic, acc } = req.body;

  if (!username || !topic || acc === undefined) {
    console.log('[Mosquitto Auth] Missing ACL parameters');
    return res.status(403).json({ error: 'Missing parameters' });
  }

  const accessType = acc === 1 ? 'READ' : acc === 2 ? 'WRITE' : `UNKNOWN(${acc})`;
  console.log(`[Mosquitto Auth] ACL check: username=${username}, topic=${topic}, access=${accessType}`);

  try {
    // First check if user is a superuser (superusers have full access)
    const superuserResult = await pool.query(
      'SELECT is_superuser FROM mqtt_users WHERE username = $1 AND is_active = true',
      [username]
    );

    if (superuserResult.rows.length > 0 && superuserResult.rows[0].is_superuser) {
      console.log(`[Mosquitto Auth] User is superuser, access GRANTED: ${username}`);
      return res.status(200).json({ success: true });
    }

    // Check ACL rules for this user
    const aclResult = await pool.query(
      'SELECT topic, access FROM mqtt_acls WHERE username = $1',
      [username]
    );

    if (aclResult.rows.length === 0) {
      console.log(`[Mosquitto Auth] No ACL rules found for user: ${username}, access DENIED`);
      return res.status(403).json({ error: 'No ACL rules found' });
    }

    // Check each ACL rule to find a match
    for (const rule of aclResult.rows) {
      if (topicMatches(topic, rule.topic)) {
        // Check if the access level includes the requested access
        // access is a bitwise field: 1=read, 2=write, 3=both
        const hasAccess = (rule.access & acc) === acc;

        if (hasAccess) {
          console.log(`[Mosquitto Auth] ACL matched pattern '${rule.topic}', access GRANTED`);
          return res.status(200).json({ success: true });
        } else {
          console.log(`[Mosquitto Auth] ACL matched pattern '${rule.topic}' but insufficient access level, access DENIED`);
          // Continue checking other rules
        }
      }
    }

    // No matching rule found or all matched rules had insufficient access
    console.log(`[Mosquitto Auth] No matching ACL rule for topic '${topic}', access DENIED`);
    return res.status(403).json({ error: 'Access denied' });

  } catch (error) {
    console.error('[Mosquitto Auth] Database error during ACL check:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
