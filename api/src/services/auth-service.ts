/**
 * Authentication Service
 * 
 * Handles user registration, login, logout, token refresh, and password management
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { query } from '../db/connection';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../middleware/jwt-auth';
import logger from '../utils/logger';

const BCRYPT_ROUNDS = 10;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: number;
    username: string;
    email: string;
    role: string;
    fullName?: string;
  };
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  fullName?: string;
  role?: string;
}

/**
 * Register a new user
 */
export async function registerUser(input: RegisterInput): Promise<LoginResult> {
  const { username, email, password, fullName, role = 'user' } = input;

  // Validate input
  if (!username || username.length < 3) {
    throw new Error('Username must be at least 3 characters');
  }

  if (!email || !email.includes('@')) {
    throw new Error('Valid email address required');
  }

  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  // Check if user already exists
  const existingUser = await query(
    'SELECT id FROM users WHERE username = $1 OR email = $2',
    [username, email]
  );

  if (existingUser.rows.length > 0) {
    throw new Error('Username or email already exists');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Insert user
  const result = await query(
    `INSERT INTO users (username, email, password_hash, full_name, role, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id, username, email, role, full_name`,
    [username, email, passwordHash, fullName || null, role]
  );

  const user = result.rows[0];

  // Log audit event
  await logAuditEvent('user_registered', user.id, null, {
    username,
    email,
    role
  });

  logger.info(`New user registered: ${username} (${email})`);

  // Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Store refresh token
  await storeRefreshToken(user.id, refreshToken, null, null);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      fullName: user.full_name
    }
  };
}

/**
 * Authenticate user and generate tokens
 */
export async function loginUser(
  usernameOrEmail: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<LoginResult> {
  // Find user by username or email
  const result = await query(
    `SELECT id, username, email, password_hash, role, full_name, is_active
     FROM users
     WHERE username = $1 OR email = $1`,
    [usernameOrEmail]
  );

  if (result.rows.length === 0) {
    await logAuditEvent('login_failed', null, ipAddress, {
      reason: 'user_not_found',
      usernameOrEmail
    });
    throw new Error('Invalid username or password');
  }

  const user = result.rows[0];

  // Check if user is active
  if (!user.is_active) {
    await logAuditEvent('login_failed', user.id, ipAddress, {
      reason: 'account_inactive',
      username: user.username
    });
    throw new Error('Account is inactive. Contact administrator.');
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password_hash);

  if (!isValidPassword) {
    await logAuditEvent('login_failed', user.id, ipAddress, {
      reason: 'invalid_password',
      username: user.username
    });
    throw new Error('Invalid username or password');
  }

  // Update last login timestamp
  await query(
    'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
    [user.id]
  );

  // Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Store refresh token
  await storeRefreshToken(user.id, refreshToken, ipAddress, userAgent);

  // Log successful login
  await logAuditEvent('user_login', user.id, ipAddress, {
    username: user.username,
    userAgent
  });

  logger.info(`User logged in: ${user.username} from ${ipAddress || 'unknown'}`);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      fullName: user.full_name
    }
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  ipAddress?: string
): Promise<{ accessToken: string }> {
  try {
    // Verify refresh token
    const payload = verifyToken(refreshToken);

    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    // Check if refresh token exists and is not revoked
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const result = await query(
      `SELECT rt.id, rt.user_id, rt.revoked, u.username, u.email, u.role, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.user_id = $1 AND rt.revoked = false AND rt.expires_at > CURRENT_TIMESTAMP
       ORDER BY rt.created_at DESC
       LIMIT 1`,
      [payload.userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid or expired refresh token');
    }

    const tokenData = result.rows[0];

    if (!tokenData.is_active) {
      throw new Error('User account is inactive');
    }

    // Update last used timestamp
    await query(
      'UPDATE refresh_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [tokenData.id]
    );

    // Generate new access token
    const accessToken = generateAccessToken({
      id: tokenData.user_id,
      username: tokenData.username,
      email: tokenData.email,
      role: tokenData.role
    });

    await logAuditEvent('token_refreshed', tokenData.user_id, ipAddress, {
      username: tokenData.username
    });

    return { accessToken };

  } catch (error: any) {
    await logAuditEvent('token_refresh_failed', null, ipAddress, {
      error: error.message
    });
    throw new Error('Failed to refresh token: ' + error.message);
  }
}

/**
 * Logout user (revoke refresh token)
 */
export async function logoutUser(userId: number, refreshToken?: string): Promise<void> {
  if (refreshToken) {
    // Revoke specific refresh token
    await query(
      `UPDATE refresh_tokens
       SET revoked = true, revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND revoked = false`,
      [userId]
    );
  } else {
    // Revoke all refresh tokens for user
    await query(
      `UPDATE refresh_tokens
       SET revoked = true, revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND revoked = false`,
      [userId]
    );
  }

  await logAuditEvent('user_logout', userId, null, {});
  logger.info(`User logged out: userId=${userId}`);
}

/**
 * Change user password
 */
export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  // Validate new password
  if (newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters');
  }

  // Fetch current password hash
  const result = await query(
    'SELECT password_hash, username FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  const user = result.rows[0];

  // Verify current password
  const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);

  if (!isValidPassword) {
    await logAuditEvent('password_change_failed', userId, null, {
      reason: 'invalid_current_password'
    });
    throw new Error('Current password is incorrect');
  }

  // Hash new password
  const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  // Update password
  await query(
    'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [newPasswordHash, userId]
  );

  // Revoke all refresh tokens (force re-login)
  await query(
    `UPDATE refresh_tokens
     SET revoked = true, revoked_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND revoked = false`,
    [userId]
  );

  await logAuditEvent('password_changed', userId, null, {
    username: user.username
  });

  logger.info(`Password changed for user: ${user.username}`);
}

/**
 * Store refresh token in database
 */
async function storeRefreshToken(
  userId: number,
  refreshToken: string,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> {
  const tokenHash = await bcrypt.hash(refreshToken, 10);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, userAgent || null, ipAddress || null, expiresAt]
  );
}

/**
 * Log audit event
 */
async function logAuditEvent(
  eventType: string,
  userId: number | null,
  ipAddress: string | null | undefined,
  details: any
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (event_type, device_uuid, user_id, ip_address, details, severity)
       VALUES ($1, NULL, $2, $3, $4, $5)`,
      [eventType, userId, ipAddress || null, JSON.stringify(details), 'info']
    );
  } catch (error) {
    logger.error('Failed to log audit event:', error);
  }
}
