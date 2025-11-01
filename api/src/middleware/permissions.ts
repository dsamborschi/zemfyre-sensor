/**
 * Permission Middleware
 * 
 * Provides middleware functions for checking user permissions and roles
 * in Express routes.
 */

import { Request, Response, NextFunction } from 'express';
import { Permission, Role, ROLE_PERMISSIONS, ROLES } from '../types/permissions';

// Note: Request.user is already defined in jwt-auth.ts
// We cast role to Role type where needed for type safety

/**
 * Middleware to check if user has ALL required permissions (AND logic)
 * 
 * @param requiredPermissions - Array of permissions that user must have
 * @returns Express middleware function
 * 
 * @example
 * router.post('/users', hasPermission(PERMISSIONS.USER_WRITE), createUser);
 */
export function hasPermission(...requiredPermissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    // Check if user is active
    if (!req.user.isActive) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Account is disabled'
      });
    }

    const userPermissions = ROLE_PERMISSIONS[req.user.role as Role] || [];
    
    // Check if user has ALL required permissions
    const missingPermissions = requiredPermissions.filter(
      perm => !userPermissions.includes(perm)
    );

    if (missingPermissions.length > 0) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Insufficient permissions',
        required: requiredPermissions,
        missing: missingPermissions,
        userRole: req.user.role
      });
    }

    next();
  };
}

/**
 * Middleware to check if user has ANY of the required permissions (OR logic)
 * 
 * @param requiredPermissions - Array of permissions (user needs at least one)
 * @returns Express middleware function
 * 
 * @example
 * router.get('/data', hasAnyPermission(PERMISSIONS.DATA_READ, PERMISSIONS.DATA_EXPORT), getData);
 */
export function hasAnyPermission(...requiredPermissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    if (!req.user.isActive) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Account is disabled'
      });
    }

    const userPermissions = ROLE_PERMISSIONS[req.user.role as Role] || [];
    
    // Check if user has ANY of the required permissions
    const hasAny = requiredPermissions.some(perm => 
      userPermissions.includes(perm)
    );

    if (!hasAny) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Insufficient permissions',
        required: 'At least one of: ' + requiredPermissions.join(', '),
        userRole: req.user.role
      });
    }

    next();
  };
}

/**
 * Middleware to check if user has specific role(s)
 * 
 * @param allowedRoles - Array of allowed roles
 * @returns Express middleware function
 * 
 * @example
 * router.get('/billing', hasRole(ROLES.OWNER), getBilling);
 * router.get('/admin', hasRole(ROLES.OWNER, ROLES.ADMIN), getAdminPanel);
 */
export function hasRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    if (!req.user.isActive) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Account is disabled'
      });
    }

    if (!allowedRoles.includes(req.user.role as Role)) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: `Access restricted to: ${allowedRoles.join(', ')}`,
        userRole: req.user.role
      });
    }

    next();
  };
}

/**
 * Middleware to check if user is owner (convenience function)
 * 
 * @returns Express middleware function
 * 
 * @example
 * router.post('/billing/subscribe', isOwner(), subscribe);
 */
export function isOwner() {
  return hasRole(ROLES.OWNER);
}

/**
 * Middleware to check if user is admin or owner
 * 
 * @returns Express middleware function
 * 
 * @example
 * router.delete('/users/:id', isAdminOrOwner(), deleteUser);
 */
export function isAdminOrOwner() {
  return hasRole(ROLES.OWNER, ROLES.ADMIN);
}

/**
 * Helper function to check permissions programmatically (not middleware)
 * Useful for conditional logic inside route handlers
 * 
 * @param user - User object
 * @param permissions - Permissions to check
 * @returns boolean
 * 
 * @example
 * if (checkUserPermissions(req.user, PERMISSIONS.USER_DELETE)) {
 *   // User can delete
 * }
 */
export function checkUserPermissions(
  user: Express.Request['user'],
  ...permissions: Permission[]
): boolean {
  if (!user || !user.isActive) return false;
  
  const userPermissions = ROLE_PERMISSIONS[user.role as Role] || [];
  return permissions.every(perm => userPermissions.includes(perm));
}
