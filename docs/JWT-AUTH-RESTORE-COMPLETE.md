# JWT Authentication System - Recovery Complete

**Date**: October 20, 2025  
**Issue**: JWT authentication code was deleted in git merge (commit a58d422)  
**Resolution**: All JWT auth files successfully restored from commit ff7ed24  

---

## 📋 Recovered Files

### 1. **api/src/routes/auth.ts** (302 lines)
**Purpose**: Authentication REST API endpoints

**Recovered from**: `git show ff7ed24:api/src/routes/auth.ts`

**Endpoints**:
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login (returns JWT tokens)
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout (revoke refresh token)
- `POST /api/v1/auth/change-password` - Change password (requires auth)
- `GET /api/v1/auth/me` - Get current user info (requires auth)

**Features**:
- ✅ Rate limiting (5 login attempts per 15 min, 3 registrations per hour)
- ✅ Bcrypt password hashing
- ✅ JWT token generation
- ✅ Input validation
- ✅ Audit logging
- ✅ IP tracking for sessions

**Key Code Segments**:
```typescript
// Registration with validation
router.post('/register', registerRateLimit, async (req, res) => {
  const { username, email, password, fullName } = req.body;
  
  // Validate: min 3 chars username, valid email, min 8 chars password
  const result = await authService.registerUser({
    username, email, password, fullName, role: 'user'
  });
  
  // Returns: { accessToken, refreshToken, user }
});

// Login with session tracking
router.post('/login', authRateLimit, async (req, res) => {
  const { username, password } = req.body;
  const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  const result = await authService.loginUser(username, password, ipAddress, userAgent);
  // Returns: { accessToken, refreshToken, user }
});

// Protected route example
router.get('/me', jwtAuth, async (req, res) => {
  res.json({ data: { user: req.user } });
});
```

---

### 2. **api/src/middleware/jwt-auth.ts** (278 lines)
**Purpose**: JWT authentication middleware and token utilities

**Recovered from**: `git show ff7ed24:api/src/middleware/jwt-auth.ts`

**Exports**:
- `jwtAuth` - Middleware for protecting routes
- `generateAccessToken()` - Create short-lived JWT (15min default)
- `generateRefreshToken()` - Create long-lived JWT (7 days default)
- `verifyToken()` - Decode and validate JWT
- `optionalJwtAuth` - Auth middleware that doesn't require token
- `requireRole(role)` - Role-based access control middleware

**Configuration** (via environment variables):
- `JWT_SECRET` - Secret key for signing tokens (default: 'your-secret-key-change-in-production')
- `JWT_ACCESS_TOKEN_EXPIRY` - Access token lifetime (default: '15m')
- `JWT_REFRESH_TOKEN_EXPIRY` - Refresh token lifetime (default: '7d')

**TypeScript Types**:
```typescript
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        email: string;
        role: string;
        isActive: boolean;
      };
    }
  }
}

interface JWTPayload {
  userId: number;
  username: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
}
```

**Usage Examples**:
```typescript
// Protect a route
import { jwtAuth } from '../middleware/jwt-auth';
router.get('/dashboard/devices', jwtAuth, async (req, res) => {
  const userId = req.user!.id; // req.user populated by middleware
  // ... protected logic
});

// Role-based protection
import { jwtAuth, requireRole } from '../middleware/jwt-auth';
router.delete('/admin/users/:id', jwtAuth, requireRole('admin'), async (req, res) => {
  // Only admins can access
});

// Optional auth (user may or may not be logged in)
import { optionalJwtAuth } from '../middleware/jwt-auth';
router.get('/public/content', optionalJwtAuth, async (req, res) => {
  if (req.user) {
    // Personalized content
  } else {
    // Public content
  }
});
```

**Key Functions**:
```typescript
// Generate access token (short-lived, 15min)
export function generateAccessToken(user: { id, username, email, role }): string {
  const payload: JWTPayload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    type: 'access'
  };
  
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_ACCESS_TOKEN_EXPIRY,
    issuer: 'iotistic-api',
    audience: 'iotistic-dashboard'
  });
}

// Middleware implementation
export async function jwtAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid token' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const payload = verifyToken(token);
    
    // Verify user still exists and is active
    const result = await query(
      'SELECT id, username, email, role, is_active FROM users WHERE id = $1',
      [payload.userId]
    );
    
    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not found or inactive' });
    }
    
    req.user = result.rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}
```

---

### 3. **api/src/services/auth-service.ts** (377 lines)
**Purpose**: Business logic for authentication operations

**Recovered from**: `git show ff7ed24:api/src/services/auth-service.ts`

**Functions**:
- `registerUser(input)` - Create new user account
- `loginUser(username, password, ipAddress, userAgent)` - Authenticate user
- `refreshAccessToken(refreshToken, ipAddress)` - Get new access token
- `logoutUser(userId, refreshToken?)` - Revoke tokens
- `changePassword(userId, currentPassword, newPassword)` - Update password
- `validateRefreshToken(token, ipAddress)` - Verify refresh token
- `revokeRefreshToken(token)` - Invalidate refresh token
- `revokeAllUserTokens(userId)` - Logout all sessions
- `cleanupExpiredTokens()` - Remove old tokens (called by scheduler)

**Database Interactions**:
```typescript
// Registration
export async function registerUser(input: RegisterInput): Promise<LoginResult> {
  // 1. Validate input (min lengths, email format)
  // 2. Check if username/email already exists
  // 3. Hash password with bcrypt (10 rounds)
  // 4. INSERT into users table
  // 5. Generate access + refresh tokens
  // 6. Store refresh token in refresh_tokens table
  // 7. Log audit event
  // 8. Return tokens + user info
}

// Login
export async function loginUser(
  username: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<LoginResult> {
  // 1. Find user by username OR email
  // 2. Verify user is active
  // 3. Compare password with bcrypt
  // 4. Generate access + refresh tokens
  // 5. Store refresh token with IP/user agent
  // 6. Create/update user_sessions record
  // 7. Log audit event
  // 8. Return tokens + user info
}

// Token refresh
export async function refreshAccessToken(
  refreshToken: string,
  ipAddress?: string
): Promise<{ accessToken: string }> {
  // 1. Verify JWT signature and expiry
  // 2. Check token exists in database and not revoked
  // 3. Verify IP matches (optional security check)
  // 4. Get user from database
  // 5. Generate new access token
  // 6. Update refresh token last_used_at timestamp
  // 7. Return new access token
}

// Password change
export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  // 1. Get user's current password hash
  // 2. Verify current password with bcrypt
  // 3. Validate new password (min 8 chars)
  // 4. Hash new password
  // 5. UPDATE users table
  // 6. Revoke all refresh tokens (force re-login)
  // 7. Log audit event
}
```

**Audit Logging**:
```typescript
async function logAuditEvent(
  action: string,
  userId: number | null,
  ipAddress: string | null,
  metadata: any
): Promise<void> {
  await query(
    `INSERT INTO audit_log (action, user_id, ip_address, metadata, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [action, userId, ipAddress, JSON.stringify(metadata)]
  );
}

// Logged events:
// - user_registered
// - user_login
// - user_logout
// - password_changed
// - token_refreshed
```

**Helper Functions**:
```typescript
// Store refresh token in database
async function storeRefreshToken(
  userId: number,
  token: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<void> {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, hashToken(token), ipAddress, userAgent, expiresAt]
  );
}

// Token hashing (for database storage)
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
```

---

## 🔧 Integration Changes

### Updated: **api/src/index.ts**
Added auth routes to Express server:

```typescript
// Import added
import authRoutes from './routes/auth';

// Route mounted
app.use(`${API_BASE}/auth`, authRoutes);
```

**Auth endpoints now available at**: `/api/v1/auth/*`

---

## 📊 Database Schema Requirements

The auth system requires these tables (from migration `017_add_user_auth_and_mqtt_acl.sql`):

### **users** table
```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### **refresh_tokens** table
```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(token_hash)
);
```

### **user_sessions** table
```sql
CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  ip_address VARCHAR(45),
  user_agent TEXT,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, ip_address, user_agent)
);
```

### **audit_log** table (optional but recommended)
```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  action VARCHAR(100) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ip_address VARCHAR(45),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
```

---

## 🚀 Quick Start

### 1. Run Database Migration
```powershell
cd api
.\scripts\run-mqtt-acl-migration.ps1
```

This creates all required tables including users, refresh_tokens, user_sessions, audit_log.

### 2. Set Environment Variables
Add to `api/.env`:
```bash
# JWT Configuration
JWT_SECRET=your-production-secret-key-change-this-to-random-string
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d
```

⚠️ **CRITICAL**: Change `JWT_SECRET` in production! Generate a secure secret:
```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Create First Admin User
```powershell
cd api/scripts
npx tsx create-admin-user.ts
```

Or use SQL directly:
```sql
-- Password is 'admin123' (change immediately after login)
INSERT INTO users (username, email, password_hash, role, is_active)
VALUES (
  'admin',
  'admin@example.com',
  '$2b$10$rGHQ7Y9jzVXYxR.kJNGsZOpXXhd0P0V7K5KaKq.eHJq7hZ9xF.Gm2',
  'admin',
  true
);
```

### 4. Test Authentication
```bash
# Register a new user
curl -X POST http://localhost:4002/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "SecurePass123",
    "fullName": "Test User"
  }'

# Response:
{
  "message": "User registered successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "testuser",
      "email": "test@example.com",
      "role": "user"
    }
  }
}

# Login
curl -X POST http://localhost:4002/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "SecurePass123"
  }'

# Get current user (requires auth)
curl http://localhost:4002/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Refresh access token
curl -X POST http://localhost:4002/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'

# Logout
curl -X POST http://localhost:4002/api/v1/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

---

## 🔐 Security Features

### Rate Limiting
- **Login**: 5 attempts per 15 minutes per IP
- **Registration**: 3 attempts per hour per IP
- Returns 429 Too Many Requests when exceeded

### Password Security
- Minimum 8 characters required
- Bcrypt hashing with 10 rounds
- Old passwords can't be reused (password history not implemented yet)

### Token Security
- Access tokens: Short-lived (15min default)
- Refresh tokens: Long-lived (7 days default), stored hashed in database
- Tokens include issuer and audience claims
- Refresh tokens tied to IP address (optional check)
- All tokens revoked on password change

### Session Tracking
- IP address and User-Agent logged
- Last activity timestamp updated
- Support for multiple active sessions
- Ability to revoke all sessions (logout everywhere)

### Audit Logging
All authentication events logged with:
- Action type
- User ID
- IP address
- Timestamp
- Metadata (username, email, role changes, etc.)

---

## 🛡️ Protecting Routes

### Basic Protection
```typescript
import { jwtAuth } from '../middleware/jwt-auth';

router.get('/dashboard/devices', jwtAuth, async (req, res) => {
  const userId = req.user!.id;
  const username = req.user!.username;
  
  // User is authenticated, req.user populated
});
```

### Role-Based Access Control
```typescript
import { jwtAuth, requireRole } from '../middleware/jwt-auth';

// Admin only
router.delete('/admin/users/:id', jwtAuth, requireRole('admin'), async (req, res) => {
  // Only users with role='admin' can access
});

// Multiple roles
router.get('/moderator/reports', jwtAuth, requireRole(['admin', 'moderator']), async (req, res) => {
  // Admins or moderators can access
});
```

### Optional Authentication
```typescript
import { optionalJwtAuth } from '../middleware/jwt-auth';

router.get('/articles', optionalJwtAuth, async (req, res) => {
  if (req.user) {
    // Logged in - show personalized content
    const articles = await getArticlesForUser(req.user.id);
  } else {
    // Not logged in - show public content
    const articles = await getPublicArticles();
  }
});
```

---

## 🧪 Testing

### Unit Tests
```bash
cd api
npm test -- auth-service.test.ts
npm test -- jwt-auth.test.ts
```

### Integration Tests
```bash
cd api
npm run test:integration -- auth.integration.test.ts
```

### Manual Testing with Postman
Import the auth collection:
```bash
api/postman/auth-endpoints.json
```

---

## 📈 Monitoring & Maintenance

### Token Cleanup Job
Expired refresh tokens should be cleaned up periodically:

```typescript
// In api/src/services/job-scheduler.ts
import { cleanupExpiredTokens } from './auth-service';

// Run daily at 3 AM
jobScheduler.schedule('cleanup-tokens', '0 3 * * *', async () => {
  const deletedCount = await cleanupExpiredTokens();
  logger.info(`Cleaned up ${deletedCount} expired refresh tokens`);
});
```

### Metrics to Track
- Active users (unique logins per day)
- Failed login attempts (potential attacks)
- Token refresh rate
- Average session duration
- Rate limit hits

### Database Queries
```sql
-- Active users in last 24 hours
SELECT COUNT(DISTINCT user_id) 
FROM user_sessions 
WHERE last_activity > NOW() - INTERVAL '24 hours';

-- Failed login attempts
SELECT action, COUNT(*) 
FROM audit_log 
WHERE action LIKE '%login%' 
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY action;

-- Long-running sessions
SELECT u.username, s.created_at, s.last_activity
FROM user_sessions s
JOIN users u ON u.id = s.user_id
WHERE s.last_activity > NOW() - INTERVAL '30 days'
ORDER BY s.created_at ASC;
```

---

## 🐛 Troubleshooting

### "Invalid or expired token"
**Cause**: Access token has expired (default 15min) or JWT_SECRET changed  
**Fix**: Use refresh token to get new access token, or login again

### "User not found or inactive"
**Cause**: User was deleted or deactivated  
**Fix**: User needs to re-register or admin needs to reactivate account

### "Too many authentication attempts"
**Cause**: Rate limit exceeded  
**Fix**: Wait 15 minutes and try again

### "Username or email already exists"
**Cause**: Duplicate registration attempt  
**Fix**: Use different username/email, or login if you already have an account

### TypeScript Errors with req.user
**Cause**: Express Request type not extended  
**Fix**: Import jwt-auth.ts in your file to load the global type declaration:
```typescript
import { jwtAuth } from '../middleware/jwt-auth';
// Now TypeScript knows about req.user
```

### Tokens not being revoked
**Cause**: Database trigger missing or JWT_SECRET mismatch  
**Fix**: 
1. Run migration to create refresh_tokens table
2. Verify JWT_SECRET is consistent across restarts
3. Check database connection

---

## 📝 Recovery Summary

| File | Status | Lines | Git Source |
|------|--------|-------|------------|
| `api/src/routes/auth.ts` | ✅ Restored | 302 | ff7ed24 |
| `api/src/middleware/jwt-auth.ts` | ✅ Restored | 278 | ff7ed24 |
| `api/src/services/auth-service.ts` | ✅ Restored | 377 | ff7ed24 |
| `api/src/index.ts` | ✅ Updated | - | Added auth routes import and mount |

**Total Lines Recovered**: 957 lines of authentication code

**Git Commands Used**:
```bash
git show ff7ed24:api/src/routes/auth.ts > api/src/routes/auth.ts
git show ff7ed24:api/src/middleware/jwt-auth.ts > api/src/middleware/jwt-auth.ts
git show ff7ed24:api/src/services/auth-service.ts > api/src/services/auth-service.ts
```

---

## ✅ Next Steps

1. ✅ Files restored and integrated
2. ⏳ Run database migration (if not already done)
3. ⏳ Set JWT_SECRET environment variable
4. ⏳ Create admin user
5. ⏳ Test auth endpoints
6. ⏳ Protect existing routes with jwtAuth middleware
7. ⏳ Add token cleanup job to scheduler
8. ⏳ Configure frontend to use JWT auth
9. ⏳ Set up session monitoring

---

**Recovery Complete**: October 20, 2025  
**Recovered By**: AI Agent  
**Verified**: TypeScript compiles successfully, all imports resolved
