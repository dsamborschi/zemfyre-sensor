# User Authentication & Management System

Complete JWT-based authentication system for the Iotistic dashboard with role-based access control (RBAC).

## 🔐 Features

### Authentication
- **JWT Tokens**: Secure access tokens (15min) + refresh tokens (7 days)
- **Automatic Token Refresh**: Seamless token renewal on API calls
- **Secure Password Storage**: Bcrypt hashing (10 rounds)
- **Rate Limiting**: Protection against brute force attacks
- **Session Management**: Track active logins across devices

### Authorization (RBAC)
- **5 Roles**: Owner → Admin → Manager → Operator → Viewer
- **Granular Permissions**: 20+ permissions using `resource:action` pattern
- **Permission Middleware**: Easy route protection
- **Role-Based UI**: Show/hide features based on user role

### User Management
- **Full CRUD**: Create, read, update, delete users
- **Self-Registration**: New users can sign up (as `viewer` by default)
- **Admin Panel**: Manage users, roles, and permissions
- **Account Settings**: Users can change their password

## 📁 File Structure

### Backend (API)
```
api/
├── src/
│   ├── routes/
│   │   ├── auth.ts                    # Auth endpoints (login, register, refresh, logout)
│   │   └── users.ts                   # User management CRUD
│   ├── services/
│   │   └── auth-service.ts            # Auth business logic
│   ├── middleware/
│   │   ├── jwt-auth.ts                # JWT verification middleware
│   │   └── permissions.ts             # Permission checking middleware
│   └── types/
│       └── permissions.ts             # Roles & permissions definitions
└── database/
    └── migrations/
        └── 017_add_user_auth_and_mqtt_acl.sql  # DB schema

### Frontend (Dashboard)
dashboard/
├── src/
│   ├── pages/
│   │   ├── LoginPage.tsx              # Login/register UI
│   │   └── UserManagementPage.tsx     # Admin user management
│   ├── contexts/
│   │   └── AuthContext.tsx            # Auth state management
│   ├── lib/
│   │   └── authInterceptor.ts         # Auto-add JWT to API calls
│   └── components/
│       └── Header.tsx                 # User dropdown with management link
```

## 🚀 Quick Start

### 1. Database Setup

The users table is already created by migration `017_add_user_auth_and_mqtt_acl.sql`:

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'viewer',
    is_active BOOLEAN DEFAULT true,
    ...
);
```

### 2. Environment Variables

Add to `api/.env`:

```bash
# JWT Configuration
JWT_SECRET=your-super-secret-key-change-in-production
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d
```

**⚠️ CRITICAL**: Change `JWT_SECRET` in production! Generate with:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Start Services

```bash
# Start API
cd api && npm run dev

# Start Dashboard
cd dashboard && npm run dev
```

### 4. Create First User

**Option A: Via API** (for initial setup)
```bash
curl -X POST http://localhost:3002/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@iotistic.local",
    "password": "YourSecurePassword123",
    "role": "owner"
  }'
```

**Option B: Via Dashboard**
1. Navigate to `http://localhost:5173`
2. Click "Don't have an account? Sign up"
3. Fill in registration form
4. First user is automatically granted `viewer` role

## 🎭 Roles & Permissions

### Role Hierarchy
```
Owner         (Full access + billing)
  └─ Admin    (Full access except billing)
      └─ Manager   (Read all, write devices/users)
          └─ Operator  (Read all, control devices)
              └─ Viewer    (Read-only)
```

### Permission Matrix

| Permission | Owner | Admin | Manager | Operator | Viewer |
|-----------|-------|-------|---------|----------|--------|
| **Users** |
| user:read | ✅ | ✅ | ✅ | ✅ | ✅ |
| user:write | ✅ | ✅ | ✅ | ❌ | ❌ |
| user:delete | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Devices** |
| device:read | ✅ | ✅ | ✅ | ✅ | ✅ |
| device:write | ✅ | ✅ | ✅ | ❌ | ❌ |
| device:delete | ✅ | ✅ | ❌ | ❌ | ❌ |
| device:control | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Data** |
| data:read | ✅ | ✅ | ✅ | ✅ | ✅ |
| data:export | ✅ | ✅ | ✅ | ❌ | ❌ |
| data:delete | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Settings** |
| settings:read | ✅ | ✅ | ✅ | ✅ | ✅ |
| settings:write | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Billing** |
| billing:read | ✅ | ❌ | ❌ | ❌ | ❌ |
| billing:manage | ✅ | ❌ | ❌ | ❌ | ❌ |

## 📚 API Reference

### Authentication Endpoints

#### POST /api/v1/auth/register
Register new user
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "SecurePass123",
  "fullName": "John Doe"  // optional
}
```

#### POST /api/v1/auth/login
Authenticate user
```json
{
  "username": "johndoe",  // or email
  "password": "SecurePass123"
}
```
**Returns:**
```json
{
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "user": {
      "id": 1,
      "username": "johndoe",
      "email": "john@example.com",
      "role": "viewer"
    }
  }
}
```

#### POST /api/v1/auth/refresh
Refresh access token
```json
{
  "refreshToken": "eyJhbGc..."
}
```

#### POST /api/v1/auth/logout
Logout (revoke refresh token)
```json
{
  "refreshToken": "eyJhbGc..."  // optional - if omitted, revokes ALL tokens
}
```
**Requires**: `Authorization: Bearer <accessToken>` header

#### POST /api/v1/auth/change-password
Change password
```json
{
  "currentPassword": "OldPass123",
  "newPassword": "NewPass123"
}
```
**Requires**: JWT authentication

#### GET /api/v1/auth/me
Get current user info

**Requires**: JWT authentication

### User Management Endpoints

All require JWT authentication + appropriate permissions.

#### GET /api/v1/users
List all users

**Requires**: `user:read` permission

#### GET /api/v1/users/:id
Get user by ID

**Requires**: `user:read` permission

#### POST /api/v1/users
Create new user
```json
{
  "username": "newuser",
  "email": "newuser@example.com",
  "password": "SecurePass123",
  "role": "viewer"
}
```
**Requires**: `user:write` permission

#### PUT /api/v1/users/:id
Update user
```json
{
  "email": "updated@example.com",
  "role": "operator",
  "isActive": true
}
```
**Requires**: `user:write` permission

#### DELETE /api/v1/users/:id
Delete user

**Requires**: `user:delete` permission

#### GET /api/v1/users/me/permissions
Get current user's permissions

## 🔧 Usage Examples

### Backend: Protect Routes

```typescript
import { Router } from 'express';
import { jwtAuth } from '../middleware/jwt-auth';
import { hasPermission } from '../middleware/permissions';
import { PERMISSIONS } from '../types/permissions';

const router = Router();

// Public endpoint (no auth)
router.get('/public', (req, res) => {
  res.json({ message: 'Public data' });
});

// Authenticated endpoint (any logged-in user)
router.get('/profile', jwtAuth, (req, res) => {
  res.json({ user: req.user });
});

// Permission-protected endpoint
router.post('/devices', 
  jwtAuth,
  hasPermission(PERMISSIONS.DEVICE_WRITE),
  async (req, res) => {
    // Only users with device:write permission can access
    // ...
  }
);

// Multiple permissions (user needs ALL)
router.delete('/data',
  jwtAuth,
  hasPermission(PERMISSIONS.DATA_DELETE, PERMISSIONS.DEVICE_WRITE),
  async (req, res) => {
    // ...
  }
);
```

### Frontend: Authenticated API Calls

**No manual work needed!** The `authInterceptor.ts` automatically:
1. Adds `Authorization: Bearer <token>` to all API calls
2. Refreshes tokens on 401 responses
3. Redirects to login if refresh fails

```typescript
// Just make normal API calls - auth is automatic
const response = await fetch(buildApiUrl('/api/v1/devices'), {
  method: 'GET'
});
// JWT token is automatically added by interceptor
```

### Frontend: Check User Role

```typescript
import { useAuth } from './contexts/AuthContext';

function MyComponent() {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <div>Please log in</div>;
  }

  return (
    <div>
      <h1>Welcome {user.username}!</h1>
      
      {(user.role === 'owner' || user.role === 'admin') && (
        <button>Admin Only Feature</button>
      )}
      
      {user.role === 'viewer' && (
        <p>You have read-only access</p>
      )}
    </div>
  );
}
```

## 🔒 Security Best Practices

### ✅ Implemented
- ✅ Bcrypt password hashing (10 rounds)
- ✅ JWT tokens with expiration
- ✅ Refresh token rotation
- ✅ Rate limiting on auth endpoints
- ✅ HTTPS (use reverse proxy in production)
- ✅ CORS configuration
- ✅ SQL injection prevention (parameterized queries)
- ✅ Token stored in localStorage (XSS mitigation needed)

### ⚠️ Production Recommendations
1. **Use HTTPS only** - Configure nginx/Caddy reverse proxy
2. **Change JWT_SECRET** - Generate strong random secret
3. **Add CAPTCHA** - Protect registration/login from bots
4. **Implement 2FA** - Time-based OTP for sensitive accounts
5. **Audit Logging** - Track authentication events
6. **Password Policy** - Enforce complexity, rotation, history
7. **Account Lockout** - Lock after N failed login attempts
8. **Email Verification** - Verify email addresses on signup

## 🐛 Troubleshooting

### Issue: "Unauthorized" on API calls
**Solution**: Check if JWT token is valid
```bash
# Decode token to check expiration
echo "eyJhbGc..." | cut -d'.' -f2 | base64 -d | jq
```

### Issue: Token refresh fails
**Cause**: Refresh token expired or revoked
**Solution**: User must log in again

### Issue: Permission denied
**Cause**: User role doesn't have required permission
**Solution**: Check `ROLE_PERMISSIONS` mapping in `api/src/types/permissions.ts`

### Issue: Can't create owner role
**Cause**: Only owners can create other owners
**Solution**: Use direct DB insert for first owner:
```sql
INSERT INTO users (username, email, password_hash, role) 
VALUES ('admin', 'admin@iotistic.local', '$2b$10$...', 'owner');
```

## 📖 Related Documentation

- [License System](../billing/docs/README.md) - Multi-tenant licensing
- [MQTT ACL](../docs/mqtt/MQTT-CENTRALIZATION.md) - MQTT user management
- [API Documentation](./API-DOCUMENTATION-MIGRATION.md) - All API endpoints
- [Deployment Guide](../charts/README.md) - K8s deployment

## 🔄 Migration from Unauthenticated

If you have an existing dashboard without auth:

1. **Database**: Migration already applied (017_add_user_auth_and_mqtt_acl.sql)
2. **Backend**: Routes already registered in `api/src/index.ts`
3. **Frontend**: Update `App.tsx` to check `isAuthenticated` (already done)
4. **Create first user**: Use registration endpoint or SQL insert

## 🎯 Roadmap

Future enhancements:
- [ ] OAuth2/SAML SSO integration
- [ ] Two-factor authentication (TOTP)
- [ ] API key management (alternative to JWT)
- [ ] Session management UI (view active sessions, revoke)
- [ ] Password reset via email
- [ ] User activity audit log
- [ ] Permission presets/templates
- [ ] Custom roles with permission builder

---

**Questions?** Check existing users table:
```sql
SELECT id, username, email, role, is_active FROM users;
```

**Test authentication**:
```bash
# Register
curl -X POST http://localhost:3002/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@example.com","password":"Test1234"}'

# Login
curl -X POST http://localhost:3002/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"Test1234"}'
```
