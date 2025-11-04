# User Authentication & Management - Quick Setup

## ✅ What You Already Have

Your authentication system is **fully implemented** with:

### Backend (API)
- ✅ User authentication routes (`/api/v1/auth/*`)
- ✅ User management routes (`/api/v1/users/*`)
- ✅ JWT middleware with auto-refresh
- ✅ Role-based permissions (5 roles, 20+ permissions)
- ✅ Database schema (users, refresh_tokens, user_sessions tables)
- ✅ Auth service with bcrypt password hashing
- ✅ Rate limiting on auth endpoints
- ✅ JWT_SECRET configured in `.env`

### Frontend (Dashboard)
- ✅ Login/Register page
- ✅ User management page (admin panel)
- ✅ Auth context (state management)
- ✅ Auth interceptor (auto-add JWT to API calls)
- ✅ Protected routes
- ✅ Role-based UI (show/hide features by role)

## 🚀 Quick Test

### 1. Start Services

```powershell
# Terminal 1: Start API
cd api
npm run dev

# Terminal 2: Start Dashboard
cd dashboard
npm run dev
```

### 2. Create First User

**Option A: Via Dashboard** (Recommended)
1. Open http://localhost:5173
2. You'll see the login page
3. Click "Don't have an account? Sign up"
4. Fill in:
   - Username: `admin`
   - Email: `admin@iotistic.local`
   - Password: `Admin123!` (min 8 chars)
5. Click "Sign Up"
6. You'll be automatically logged in!

**Option B: Via API**
```powershell
curl -X POST http://localhost:3002/api/v1/auth/register `
  -H "Content-Type: application/json" `
  -d '{
    "username": "admin",
    "email": "admin@iotistic.local",
    "password": "Admin123!"
  }'
```

### 3. Test Login

1. If you registered via API, go to http://localhost:5173
2. Enter your username and password
3. Click "Sign In"
4. You should see the dashboard!

### 4. Access User Management

1. Click your avatar/username in the top-right corner
2. Click "User Management" (visible to owners/admins/managers only)
3. You can now:
   - Create new users
   - Assign roles
   - Edit user details
   - Delete users

## 👥 User Roles

| Role | Description | Can Access User Management? |
|------|-------------|----------------------------|
| **Owner** | Full access + billing | ✅ Yes |
| **Admin** | Full access except billing | ✅ Yes |
| **Manager** | Read all, write devices/users | ✅ Yes |
| **Operator** | Read all, control devices | ❌ No |
| **Viewer** | Read-only access | ❌ No |

**Default role for self-registration**: `viewer`

To promote a user to owner/admin, you need to be logged in as an owner.

## 🔒 First User Bootstrap

If you want the **first user to be an owner** (for full access), you have two options:

### Option 1: Direct SQL Insert
```sql
-- Connect to your PostgreSQL database
psql -U postgres -d iotistic

-- Create owner user (password: Admin123!)
INSERT INTO users (username, email, password_hash, role) 
VALUES (
  'admin',
  'admin@iotistic.local',
  '$2b$10$K3kzH.vJ9Y5QZXxT7.rF3eKyGxPNQz8bP5JcM9Lz.QxZYP4jK5QBi',
  'owner'
);
```

### Option 2: Modify Backend (Temporary)
In `api/src/routes/auth.ts`, line ~67, temporarily change:
```typescript
// From:
role: 'user' // Default role for self-registration

// To:
role: 'owner' // Default role for self-registration
```

Then register via dashboard, and change it back after creating your first user.

## 🧪 Test Authentication Flow

### Test 1: Registration
```powershell
$body = @{
  username = "testuser"
  email = "test@example.com"
  password = "Test1234"
} | ConvertTo-Json

curl -X POST http://localhost:3002/api/v1/auth/register `
  -H "Content-Type: application/json" `
  -d $body
```

Expected response:
```json
{
  "message": "User registered successfully",
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "user": {
      "id": 1,
      "username": "testuser",
      "email": "test@example.com",
      "role": "viewer"
    }
  }
}
```

### Test 2: Login
```powershell
$body = @{
  username = "testuser"
  password = "Test1234"
} | ConvertTo-Json

curl -X POST http://localhost:3002/api/v1/auth/login `
  -H "Content-Type: application/json" `
  -d $body
```

### Test 3: Protected Endpoint
```powershell
$token = "your-access-token-from-login"

curl http://localhost:3002/api/v1/auth/me `
  -H "Authorization: Bearer $token"
```

## 📊 Check Database

Verify users table:
```sql
-- View all users
SELECT id, username, email, role, is_active, created_at 
FROM users 
ORDER BY created_at DESC;

-- Count users by role
SELECT role, COUNT(*) 
FROM users 
GROUP BY role;
```

## 🐛 Troubleshooting

### "Unauthorized" on API calls
- Check if you're logged in
- Verify token hasn't expired (15min for access tokens)
- Check browser console for errors

### Can't see User Management menu
- Only **owner**, **admin**, and **manager** roles can access
- Check your role: Click avatar → should show email/username
- If you're a `viewer`, you need an admin to promote you

### Token expired
- Just log in again - refresh tokens last 7 days
- Auto-refresh happens automatically on API calls

### Can't create owner role
- Only owners can create other owners
- Use SQL insert for first owner (see above)

## 📝 Next Steps

Now that authentication is working:

1. **Create Users**: Add team members via User Management page
2. **Assign Roles**: Give appropriate permissions
3. **Test Permissions**: Try accessing features with different roles
4. **Secure Production**: Change JWT_SECRET before deploying

## 🔗 Related Files

- **Full Documentation**: `docs/USER-AUTHENTICATION-SYSTEM.md`
- **API Routes**: `api/src/routes/auth.ts`, `api/src/routes/users.ts`
- **Frontend**: `dashboard/src/pages/LoginPage.tsx`, `UserManagementPage.tsx`
- **Auth Context**: `dashboard/src/contexts/AuthContext.tsx`
- **Permissions**: `api/src/types/permissions.ts`

---

**Everything is ready!** Just start the services and visit http://localhost:5173 to see the login page. 🎉
