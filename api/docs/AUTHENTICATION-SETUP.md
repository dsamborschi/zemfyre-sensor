# Authentication System - Complete Setup Guide

## 🔐 Overview

This authentication system provides unified access control for:
1. **Dashboard Users** - JWT-based authentication for web UI
2. **MQTT Clients** - PostgreSQL-backed authentication via mosquitto-go-auth
3. **Device API** - API key authentication (existing system)

All authentication data is stored in a single PostgreSQL database.

---

## 📋 Prerequisites

1. **PostgreSQL 12+** with `uuid-ossp` extension
2. **Mosquitto-Go-Auth Plugin** installed in Mosquitto container
3. **Node.js 18+** for API server
4. **jsonwebtoken** npm package

---

## 🚀 Installation Steps

### Step 1: Install Dependencies

```bash
cd api
npm install jsonwebtoken @types/jsonwebtoken
```

### Step 2: Run Database Migrations

```bash
cd api
npm run migrate
```

This creates:
- `users` table (dashboard users)
- `refresh_tokens` table (JWT persistence)
- `user_sessions` table (session tracking)
- `mqtt_users` table (MQTT authentication)
- `mqtt_acls` table (MQTT authorization)

### Step 3: Configure Environment Variables

Edit `api/.env`:

```bash
# JWT Configuration
JWT_SECRET=your-256-bit-secret-change-this-in-production
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d

# Database (existing)
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=zemfyre
```

Generate a secure JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4: Build Mosquitto with Go-Auth Plugin

You have two options:

#### Option A: Use Pre-Built Docker Image

```dockerfile
# In docker-compose.cloud.yml
mosquitto:
  image: iegomez/mosquitto-go-auth:latest  # Includes plugin
  ports:
    - "${MOSQUITTO_PORT_EXT:-5883}:1883"
    - "${MOSQUITTO_WS_PORT_EXT:-59002}:9001"
  volumes:
    - ./mosquitto-go-auth.conf:/mosquitto/config/mosquitto.conf
  environment:
    - DB_HOST=${DB_HOST:-postgres}
    - DB_PORT=${DB_PORT:-5432}
    - DB_USER=${DB_USER:-postgres}
    - DB_PASSWORD=${DB_PASSWORD}
    - DB_NAME=${DB_NAME:-zemfyre}
  networks:
    - zemfyre-net
```

#### Option B: Build Custom Image

Create `api/mosquitto.Dockerfile`:

```dockerfile
FROM eclipse-mosquitto:2.0

# Install dependencies
RUN apk add --no-cache \
    wget \
    ca-certificates \
    libpq

# Download mosquitto-go-auth plugin
RUN wget -O /usr/lib/mosquitto-go-auth.so \
    https://github.com/iegomez/mosquitto-go-auth/releases/download/v2.0.0/mosquitto-go-auth-v2.0.0-linux-amd64.so

# Make plugin executable
RUN chmod +x /usr/lib/mosquitto-go-auth.so

# Copy configuration
COPY mosquitto-go-auth.conf /mosquitto/config/mosquitto.conf

EXPOSE 1883 9001

CMD ["/usr/sbin/mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]
```

Build and run:
```bash
docker build -f mosquitto.Dockerfile -t zemfyre-mosquitto:latest .
docker-compose up -d
```

### Step 5: Update API Routes

Edit `api/src/index.ts` to register new routes:

```typescript
import authRoutes from './routes/auth';
import mqttManagementRoutes from './routes/mqtt-management';

// ... existing routes

// Authentication routes
app.use('/api/v1/auth', authRoutes);

// MQTT management routes (admin only)
app.use('/api/v1/mqtt', mqttManagementRoutes);
```

### Step 6: Start Services

```bash
cd api
docker-compose -f docker-compose.cloud.yml up -d
npm run dev
```

---

## 🧪 Testing the System

### 1. Register a New User

```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john",
    "email": "john@example.com",
    "password": "SecurePass123",
    "fullName": "John Doe"
  }'
```

Response:
```json
{
  "message": "User registered successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "john",
      "email": "john@example.com",
      "role": "user"
    }
  }
}
```

### 2. Login

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john",
    "password": "SecurePass123"
  }'
```

### 3. Access Protected Route

```bash
# Save access token from login response
ACCESS_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl http://localhost:3001/api/v1/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 4. Create MQTT User (Admin Only)

First, promote your user to admin:
```sql
UPDATE users SET role = 'admin' WHERE username = 'john';
```

Then:
```bash
curl -X POST http://localhost:3001/api/v1/mqtt/users \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "device001",
    "password": "MqttPass123",
    "isSuperuser": false,
    "isActive": true
  }'
```

### 5. Create ACL Rule

```bash
curl -X POST http://localhost:3001/api/v1/mqtt/acls \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "device001",
    "topic": "sensor/device001/#",
    "access": "readwrite",
    "priority": 10
  }'
```

### 6. Test MQTT Authentication

```bash
# Install mosquitto clients
sudo apt-get install mosquitto-clients

# Test successful auth
mosquitto_pub -h localhost -p 5883 \
  -u device001 \
  -P MqttPass123 \
  -t sensor/device001/temperature \
  -m '{"value": 25.5}'

# Test ACL (should succeed)
mosquitto_sub -h localhost -p 5883 \
  -u device001 \
  -P MqttPass123 \
  -t sensor/device001/#

# Test ACL violation (should fail)
mosquitto_pub -h localhost -p 5883 \
  -u device001 \
  -P MqttPass123 \
  -t sensor/other_device/temperature \
  -m '{"value": 25.5}'
```

---

## 🔒 Security Best Practices

### 1. Change Default Credentials

After installation, immediately change:
```sql
-- Change admin user password
UPDATE users SET password_hash = '$2b$10$...' WHERE username = 'admin';

-- Change MQTT superuser password
UPDATE mqtt_users SET password_hash = '$2b$10$...' WHERE username = 'mqtt_admin';
```

### 2. Use Strong JWT Secret

Generate with:
```bash
openssl rand -base64 32
```

### 3. Enable HTTPS

Use Nginx as reverse proxy:
```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 4. Rate Limiting

Already configured in routes:
- Login: 5 attempts per 15 minutes
- Registration: 3 attempts per hour

### 5. Enable MQTT TLS

Uncomment in `mosquitto-go-auth.conf`:
```conf
listener 8883
protocol mqtt
cafile /mosquitto/certs/ca.crt
certfile /mosquitto/certs/server.crt
keyfile /mosquitto/certs/server.key
tls_version tlsv1.2
```

---

## 📊 Database Schema

### Users Table
```sql
users (
  id, username, email, password_hash, full_name, role,
  is_active, email_verified, last_login_at, created_at, updated_at
)
```

### MQTT Users Table
```sql
mqtt_users (
  id, username, password_hash, is_superuser, is_active,
  created_at, updated_at
)
```

### MQTT ACLs Table
```sql
mqtt_acls (
  id, username, clientid, topic, access, priority, created_at
)
```

**Access Codes:**
- 1 = Read (subscribe)
- 2 = Write (publish)
- 3 = Read + Write

---

## 🔌 API Endpoints

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/auth/register` | Register new user | No |
| POST | `/api/v1/auth/login` | Login user | No |
| POST | `/api/v1/auth/refresh` | Refresh access token | No |
| POST | `/api/v1/auth/logout` | Logout user | JWT |
| POST | `/api/v1/auth/change-password` | Change password | JWT |
| GET | `/api/v1/auth/me` | Get current user | JWT |

### MQTT Management Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/v1/mqtt/users` | List MQTT users | JWT (Admin) |
| POST | `/api/v1/mqtt/users` | Create MQTT user | JWT (Admin) |
| PUT | `/api/v1/mqtt/users/:username/password` | Update password | JWT (Admin) |
| DELETE | `/api/v1/mqtt/users/:username` | Delete user | JWT (Admin) |
| GET | `/api/v1/mqtt/acls` | List ACL rules | JWT (Admin) |
| POST | `/api/v1/mqtt/acls` | Create ACL rule | JWT (Admin) |
| DELETE | `/api/v1/mqtt/acls/:id` | Delete ACL rule | JWT (Admin) |

---

## 🐛 Troubleshooting

### Issue: "Cannot find module 'jsonwebtoken'"

```bash
cd api
npm install jsonwebtoken @types/jsonwebtoken
```

### Issue: Mosquitto fails to load plugin

Check plugin path in `mosquitto-go-auth.conf`:
```bash
docker exec -it mosquitto ls -la /usr/lib/mosquitto-go-auth.so
```

### Issue: MQTT authentication always fails

1. Check PostgreSQL connection in Mosquitto logs:
```bash
docker logs mosquitto 2>&1 | grep -i postgres
```

2. Test database query manually:
```sql
SELECT password_hash FROM mqtt_users WHERE username = 'device001' AND is_active = true;
```

3. Verify password hash format (should start with `$2b$10$`):
```bash
node -e "console.log(require('bcrypt').hashSync('test123', 10))"
```

### Issue: ACL rules not working

1. Check ACL query returns results:
```sql
SELECT * FROM mqtt_acls 
WHERE (username = 'device001' OR username IS NULL)
AND topic = 'sensor/device001/temperature';
```

2. Enable debug logging in Mosquitto:
```conf
log_type all
auth_opt_log_level debug
```

### Issue: JWT token invalid

1. Verify JWT_SECRET matches in environment
2. Check token expiry: decode at https://jwt.io
3. Ensure clock sync between servers

---

## 🔄 Migration from Existing System

If you have existing devices with API keys:

1. Keep `device-auth` middleware for device endpoints
2. Use `jwtAuth` for dashboard/admin endpoints
3. Optionally create MQTT users for devices:

```typescript
// In provisioning flow, after creating device:
await query(
  `INSERT INTO mqtt_users (username, password_hash, is_superuser, is_active)
   VALUES ($1, $2, false, true)`,
  [`device_${deviceUuid}`, mqttPasswordHash]
);

// Create ACL rules
await query(
  `INSERT INTO mqtt_acls (username, topic, access, priority)
   VALUES 
     ($1, $2, 3, 20),  -- Full access to own topics
     ($1, $3, 2, 10)`, -- Publish sensor data
  [
    `device_${deviceUuid}`,
    `device/${deviceUuid}/#`,
    `sensor/${deviceUuid}/#`
  ]
);
```

---

## 📚 Additional Resources

- [Mosquitto-Go-Auth Documentation](https://github.com/iegomez/mosquitto-go-auth)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [MQTT Security](https://www.hivemq.com/blog/mqtt-security-fundamentals/)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/auth-pg-hba-conf.html)

---

## 🆘 Support

For issues or questions:
1. Check application logs: `docker logs api`
2. Check Mosquitto logs: `docker logs mosquitto`
3. Check database connections: `docker exec -it postgres psql -U postgres -d zemfyre`
