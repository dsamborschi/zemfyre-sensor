/**
 * Authentication Routes
 * 
 * Handles user registration, login, logout, token refresh, and password management
 */

import express, { Request, Response } from 'express';
import * as authService from '../services/auth-service';
import { jwtAuth } from '../middleware/jwt-auth';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting for auth endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    error: 'Too Many Requests',
    message: 'Too many authentication attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour per IP
  message: {
    error: 'Too Many Requests',
    message: 'Too many registration attempts. Please try again later.'
  }
});

/**
 * POST /auth/register
 * 
 * Register a new user account
 * 
 * Body:
 *   - username: string (required, min 3 chars)
 *   - email: string (required, valid email)
 *   - password: string (required, min 8 chars)
 *   - fullName: string (optional)
 * 
 * Returns: { accessToken, refreshToken, user }
 */
router.post('/register', registerRateLimit, async (req: Request, res: Response) => {
  try {
    const { username, email, password, fullName } = req.body;

    if (!username || !email || !password) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Username, email, and password are required'
      });
      return;
    }

    const result = await authService.registerUser({
      username,
      email,
      password,
      fullName,
      role: 'user' // Default role for self-registration
    });

    res.status(201).json({
      message: 'User registered successfully',
      data: result
    });

  } catch (error: any) {
    console.error('Registration error:', error);
    
    if (error.message.includes('already exists') || 
        error.message.includes('at least') ||
        error.message.includes('required')) {
      res.status(400).json({
        error: 'Bad Request',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Registration failed'
    });
  }
});

/**
 * POST /auth/login
 * 
 * Authenticate user and receive JWT tokens
 * 
 * Body:
 *   - username: string (username or email)
 *   - password: string
 * 
 * Returns: { accessToken, refreshToken, user }
 */
router.post('/login', authRateLimit, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Username and password are required'
      });
      return;
    }

    // Extract client info
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                      req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await authService.loginUser(
      username,
      password,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      message: 'Login successful',
      data: result
    });

  } catch (error: any) {
    console.error('Login error:', error);
    
    if (error.message.includes('Invalid') || 
        error.message.includes('inactive')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Login failed'
    });
  }
});

/**
 * POST /auth/refresh
 * 
 * Refresh access token using refresh token
 * 
 * Body:
 *   - refreshToken: string
 * 
 * Returns: { accessToken }
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Refresh token is required'
      });
      return;
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                      req.socket.remoteAddress;

    const result = await authService.refreshAccessToken(refreshToken, ipAddress);

    res.status(200).json({
      message: 'Token refreshed successfully',
      data: result
    });

  } catch (error: any) {
    console.error('Token refresh error:', error);
    
    res.status(401).json({
      error: 'Unauthorized',
      message: error.message
    });
  }
});

/**
 * POST /auth/logout
 * 
 * Logout user (revoke refresh token)
 * Requires JWT authentication
 * 
 * Body:
 *   - refreshToken: string (optional - if not provided, revokes all tokens)
 * 
 * Returns: { message }
 */
router.post('/logout', jwtAuth, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    const userId = req.user!.id;

    await authService.logoutUser(userId, refreshToken);

    res.status(200).json({
      message: 'Logged out successfully'
    });

  } catch (error: any) {
    console.error('Logout error:', error);
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Logout failed'
    });
  }
});

/**
 * POST /auth/change-password
 * 
 * Change user password
 * Requires JWT authentication
 * 
 * Body:
 *   - currentPassword: string
 *   - newPassword: string
 * 
 * Returns: { message }
 */
router.post('/change-password', jwtAuth, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.id;

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Current password and new password are required'
      });
      return;
    }

    await authService.changePassword(userId, currentPassword, newPassword);

    res.status(200).json({
      message: 'Password changed successfully. Please login again with your new password.'
    });

  } catch (error: any) {
    console.error('Password change error:', error);
    
    if (error.message.includes('incorrect') || 
        error.message.includes('at least')) {
      res.status(400).json({
        error: 'Bad Request',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Password change failed'
    });
  }
});

/**
 * GET /auth/me
 * 
 * Get current authenticated user info
 * Requires JWT authentication
 * 
 * Returns: { user }
 */
router.get('/me', jwtAuth, async (req: Request, res: Response) => {
  try {
    res.status(200).json({
      data: {
        user: req.user
      }
    });
  } catch (error: any) {
    console.error('Get user error:', error);
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get user info'
    });
  }
});

export default router;
