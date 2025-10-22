# Customer Signup - Quick Reference

## Test the Signup Flow

```powershell
# Run comprehensive test suite
cd c:\Users\Dan\Iotistic-sensor\billing\scripts
.\test-signup-flow.ps1
```

---

## API Endpoints

### 1. Customer Signup (Self-Service)

**Endpoint**: `POST /api/customers/signup`

**Request**:
```json
{
  "email": "customer@example.com",
  "password": "SecurePass123",
  "company_name": "My Company",
  "full_name": "John Doe"
}
```

**Response** (201):
```json
{
  "customer": { "customer_id": "cust_xxx", "email": "...", ... },
  "subscription": { "plan": "starter", "status": "trialing", "trial_ends_at": "..." },
  "license": { "jwt": "eyJ...", "features": {...}, "limits": {...} },
  "deployment": { "status": "pending" }
}
```

**Errors**:
- `400` - Invalid email, weak password, missing fields
- `409` - Email already registered
- `500` - Server error

---

### 2. Customer Login

**Endpoint**: `POST /api/customers/login`

**Request**:
```json
{
  "email": "customer@example.com",
  "password": "SecurePass123"
}
```

**Response** (200):
```json
{
  "customer": { ... },
  "subscription": { ... },
  "license": { "jwt": "eyJ...", ... },
  "deployment": { "status": "pending", "instance_url": null }
}
```

**Errors**:
- `400` - Missing email or password
- `401` - Invalid credentials
- `500` - Server error

---

## PowerShell Examples

### Signup

```powershell
$signup = @{
    email = "test@example.com"
    password = "MyPassword123"
    company_name = "Test Company"
    full_name = "Test User"
} | ConvertTo-Json

$result = Invoke-RestMethod `
    -Uri "http://localhost:3100/api/customers/signup" `
    -Method POST `
    -Body $signup `
    -ContentType "application/json"

# Save license
$licenseKey = $result.license.jwt
Write-Host "License: $licenseKey"
```

### Login

```powershell
$login = @{
    email = "test@example.com"
    password = "MyPassword123"
} | ConvertTo-Json

$session = Invoke-RestMethod `
    -Uri "http://localhost:3100/api/customers/login" `
    -Method POST `
    -Body $login `
    -ContentType "application/json"

# Get fresh license
$licenseKey = $session.license.jwt
```

---

## Database Queries

### Check Recent Signups

```sql
SELECT customer_id, email, company_name, deployment_status, created_at
FROM customers
ORDER BY created_at DESC
LIMIT 10;
```

### Check Trial Subscriptions

```sql
SELECT 
  c.email,
  c.company_name,
  s.plan,
  s.status,
  s.trial_ends_at,
  EXTRACT(DAY FROM (s.trial_ends_at - CURRENT_TIMESTAMP)) as days_remaining
FROM customers c
JOIN subscriptions s ON c.customer_id = s.customer_id
WHERE s.status = 'trialing'
ORDER BY s.trial_ends_at ASC;
```

### Check License Audit Log

```sql
SELECT 
  lh.customer_id,
  c.email,
  lh.action,
  lh.plan,
  lh.max_devices,
  lh.generated_by,
  lh.generated_at
FROM license_history lh
JOIN customers c ON lh.customer_id = c.customer_id
ORDER BY lh.generated_at DESC
LIMIT 20;
```

---

## Validation Rules

### Email
- Format: Valid email regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Uniqueness: Cannot use same email twice

### Password
- Minimum length: 8 characters
- Recommendations: Include uppercase, lowercase, numbers

### Company Name
- Required field
- No format restrictions

---

## Trial Details

- **Duration**: 14 days from signup
- **Plan**: Starter (5 devices max)
- **Features**:
  - ✅ Can execute jobs
  - ❌ Cannot schedule jobs
  - ✅ Remote access
  - ❌ OTA updates
  - ✅ Export data
  - ❌ Advanced alerts
  - ❌ Custom dashboards

- **Limits**:
  - Job templates: 10
  - Alert rules: 25
  - Users: 2

---

## Deployment Status

Currently: `pending` (K8s deployment not yet implemented)

**Future states**:
- `pending` - Initial state after signup
- `provisioning` - K8s deployment in progress
- `ready` - Instance deployed and accessible
- `failed` - Deployment error

---

## Security Notes

1. **Passwords**: Stored as bcrypt hashes (10 rounds), never plaintext
2. **Licenses**: Signed with RS256 asymmetric encryption
3. **Audit Log**: Stores SHA-256 hash of JWT, NOT the actual token
4. **Input Validation**: Email format, password strength, duplicate checks

---

## Troubleshooting

### "Email already registered"
- Email must be unique
- Try a different email or use login endpoint

### "Password too weak"
- Use at least 8 characters
- Include mix of letters, numbers, symbols

### "License verification failed"
- Check if billing service is running
- Verify RSA keys exist in `billing/keys/`
- Check server logs: `docker compose logs billing`

### No audit log entry
- Check if migration was applied: `docker exec -it billing-postgres-1 psql -U billing -d billing -c "\d license_history"`
- Verify LicenseHistoryModel is imported in routes

---

## Next Steps

1. **Deploy Instance**: Use the license JWT to configure your Iotistic stack
2. **Test Features**: Connect BME688 sensors, test device limits
3. **Monitor Trial**: Track days remaining, plan upgrade flow
4. **Upgrade Flow**: Implement Stripe checkout for paid plans

---

## Files Modified

- `billing/migrations/003_add_signup_fields.sql` - Database schema
- `billing/src/db/customer-model.ts` - Customer operations
- `billing/src/routes/customers.ts` - API endpoints
- `billing/scripts/test-signup-flow.ps1` - Test suite

## Documentation

- `docs/CUSTOMER-SIGNUP-K8S-DEPLOYMENT.md` - Full K8s deployment guide
- `docs/SIGNUP-IMPLEMENTATION-COMPLETE.md` - Implementation summary

---

**Last Updated**: 2025-10-21  
**Status**: ✅ Production Ready (except K8s deployment)
