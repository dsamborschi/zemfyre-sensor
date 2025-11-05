# Mosquitto HTTP Authentication Backend

This directory contains configuration for Mosquitto MQTT broker using the `mosquitto-go-auth` plugin with HTTP backend.

## Architecture

```
MQTT Client → Mosquitto → HTTP Auth Backend (API) → PostgreSQL
                ↓                                      ↑
          (Optional Redis Cache) ←──────────────────────┘
```

## Configuration Files

### `mosquitto.conf` (Current - HTTP Auth)
- **Backend**: HTTP
- **Auth Endpoint**: `http://api:3002/mosquitto-auth`
- **Caching**: None (all requests go to API)
- **Use Case**: Standard setup, API handles all auth

### `mosquitto-http-cached.conf` (Optional - HTTP + Redis Cache)
- **Backend**: HTTP + Redis
- **Auth Endpoint**: `http://api:3002/mosquitto-auth`
- **Caching**: Redis (5 min TTL)
- **Use Case**: High-traffic deployments, reduces API load by 80-90%

## HTTP Endpoints

The API provides three endpoints for mosquitto-go-auth:

### 1. User Authentication
**Endpoint**: `POST /mosquitto-auth/user`

**Request Body**:
```json
{
  "username": "device123",
  "password": "secret",
  "clientid": "device123-client"
}
```

**Response**:
- `200 OK`: Authentication successful
- `403 Forbidden`: Authentication failed
- `500 Error`: Server error

### 2. Superuser Check
**Endpoint**: `POST /mosquitto-auth/superuser`

**Request Body**:
```json
{
  "username": "admin"
}
```

**Response**:
- `200 OK`: User is superuser (bypasses ACL checks)
- `403 Forbidden`: User is not superuser
- `500 Error`: Server error

### 3. ACL Authorization
**Endpoint**: `POST /mosquitto-auth/acl`

**Request Body**:
```json
{
  "username": "device123",
  "clientid": "device123-client",
  "topic": "device/123/temperature",
  "acc": 1
}
```

**Access Values**:
- `1`: Read/Subscribe
- `2`: Write/Publish
- `3`: Read + Write
- `4`: Subscribe (with pattern matching)

**Response**:
- `200 OK`: Access granted
- `403 Forbidden`: Access denied
- `500 Error`: Server error

## Topic Wildcard Matching

The API supports MQTT wildcard patterns in ACL rules:

- **Single-level wildcard** (`+`): Matches any single topic level
  - Example: `device/+/temperature` matches `device/123/temperature`, `device/abc/temperature`

- **Multi-level wildcard** (`#`): Matches any number of levels
  - Example: `device/#` matches `device/123`, `device/123/temperature`, `device/123/status/online`

## Database Schema

The HTTP backend queries the same PostgreSQL tables as the previous direct PostgreSQL backend:

### `mqtt_users` Table
```sql
CREATE TABLE mqtt_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_superuser BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### `mqtt_acls` Table
```sql
CREATE TABLE mqtt_acls (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    topic VARCHAR(255) NOT NULL,
    access INT NOT NULL,  -- 1=read, 2=write, 3=read+write, 4=subscribe
    priority INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (username) REFERENCES mqtt_users(username) ON DELETE CASCADE
);
```

## Docker Compose Configuration

### Standard (HTTP Auth)
```yaml
mosquitto:
  image: iegomez/mosquitto-go-auth
  restart: always
  container_name: iotistic-mosquitto
  ports:
    - "5883:1883"    # MQTT
    - "59002:9001"   # WebSockets
  volumes:
    - ./mosquitto/mosquitto.conf:/etc/mosquitto/mosquitto.conf
  depends_on:
    postgres:
      condition: service_healthy
  networks:
    - iotistic-net
```

### With Redis Cache
```yaml
mosquitto:
  image: iegomez/mosquitto-go-auth
  restart: always
  container_name: iotistic-mosquitto
  ports:
    - "5883:1883"
    - "59002:9001"
  volumes:
    - ./mosquitto/mosquitto-http-cached.conf:/etc/mosquitto/mosquitto.conf
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
  networks:
    - iotistic-net
```

## Testing Authentication

### Test User Login
```bash
# Install mosquitto_pub if not available
# Ubuntu/Debian: sudo apt-get install mosquitto-clients
# macOS: brew install mosquitto

# Test authentication (should succeed if user exists)
mosquitto_pub -h localhost -p 5883 \
  -u device123 -P secret \
  -t test/topic -m "hello"

# Test with invalid credentials (should fail)
mosquitto_pub -h localhost -p 5883 \
  -u device123 -P wrongpassword \
  -t test/topic -m "hello"
```

### Test ACL Authorization
```bash
# Test topic access (check API logs for ACL decision)
mosquitto_pub -h localhost -p 5883 \
  -u device123 -P secret \
  -t device/123/temperature -m '{"value": 25.5}'

# Test unauthorized topic (should fail if no ACL rule matches)
mosquitto_pub -h localhost -p 5883 \
  -u device123 -P secret \
  -t unauthorized/topic -m "test"
```

### Monitor API Logs
```bash
# Watch authentication requests in real-time
docker logs -f iotistic-api | grep "Mosquitto Auth"
```

**Expected output**:
```
[Mosquitto Auth] User auth request: username=device123, clientid=device123-client
[Mosquitto Auth] User authenticated successfully: device123
[Mosquitto Auth] ACL check: username=device123, topic=device/123/temperature, acc=2, clientid=device123-client
[Mosquitto Auth] ACL check: access GRANTED for device123 on device/123/temperature (rule: device/+/temperature)
```

## Migration from PostgreSQL Backend

The HTTP backend is backward compatible - no database changes needed!

**Before** (Direct PostgreSQL):
```
Mosquitto → mosquitto-go-auth → PostgreSQL
```

**After** (HTTP Backend):
```
Mosquitto → mosquitto-go-auth → HTTP API → PostgreSQL
```

**Migration steps**:
1. Update `mosquitto.conf` to use HTTP backend (already done)
2. Restart mosquitto: `docker-compose restart mosquitto`
3. Test authentication (see above)
4. Monitor API logs for auth requests
5. (Optional) Enable Redis caching for performance

**No user migration needed** - all existing users and ACLs continue to work!

## Performance Considerations

### Without Redis Cache
- **Latency**: ~10-50ms per auth request (HTTP round-trip + PostgreSQL query)
- **Load**: Every MQTT connection and publish generates API requests
- **Bottleneck**: API server and PostgreSQL

### With Redis Cache (Recommended for Production)
- **Latency**: ~1-5ms (Redis memory lookup)
- **Load**: ~80-90% reduction in API requests (5 min cache)
- **Bottleneck**: Redis memory (very scalable)
- **Cache Hit Rate**: 90-95% typical

**Recommendation**: Start without cache, add Redis when you see high API load or need lower latency.

## Security Notes

1. **Password Security**: Passwords are hashed with bcrypt (cost 10) before storage
2. **HTTPS**: Consider using TLS for production (configure in `listener` section)
3. **API Security**: The `/mosquitto-auth` endpoints have no authentication - restrict access to internal network
4. **Rate Limiting**: Consider adding rate limiting to auth endpoints for DDoS protection

## Troubleshooting

### Authentication Fails
1. Check API logs: `docker logs -f iotistic-api | grep "Mosquitto Auth"`
2. Verify user exists: `psql -U postgres -d iotistic -c "SELECT * FROM mqtt_users WHERE username='device123'"`
3. Test API endpoint directly:
   ```bash
   curl -X POST http://localhost:3002/mosquitto-auth/user \
     -H "Content-Type: application/json" \
     -d '{"username":"device123","password":"secret"}'
   ```

### ACL Denies Access
1. Check ACL rules: `psql -U postgres -d iotistic -c "SELECT * FROM mqtt_acls WHERE username='device123'"`
2. Verify topic pattern matches: Use `device/+/temperature` for `device/123/temperature`
3. Check access bits: 1=read, 2=write, 3=read+write
4. Review API logs for ACL decision

### Mosquitto Won't Start
1. Check config syntax: `docker exec iotistic-mosquitto cat /etc/mosquitto/mosquitto.conf`
2. Verify API is reachable: `docker exec iotistic-mosquitto ping api`
3. Check mosquitto logs: `docker logs iotistic-mosquitto`

### High Latency
1. Enable Redis caching (see `mosquitto-http-cached.conf`)
2. Monitor API response times
3. Check database connection pool size
4. Consider increasing `auth_opt_http_timeout` if network is slow

## References

- [mosquitto-go-auth HTTP backend](https://github.com/iegomez/mosquitto-go-auth#http)
- [Mosquitto configuration](https://mosquitto.org/man/mosquitto-conf-5.html)
- [MQTT topic wildcards](https://mosquitto.org/man/mqtt-7.html)
