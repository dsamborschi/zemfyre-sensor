# License Enforcement Implementation

## Overview

The Iotistic API enforces license limits to ensure customers stay within their plan's device limits. This document explains how device limit enforcement works.

---

## Device Limit Enforcement

### Enforcement Point: Provisioning Key Generation

**Design Decision**: Device limits are checked **when provisioning keys are generated**, not during device registration.

#### Why Check at Provisioning Key Generation?

1. **Better user experience** - Customers know upfront if they can add more devices
2. **Cleaner separation of concerns** - Provisioning keys validate limits, device registration just uses the key
3. **Prevents wasted provisioning keys** - Don't generate keys that can't be used
4. **Earlier feedback** - Admins see the error when creating the key, not when devices try to register

### How It Works

When an admin tries to create a provisioning key via `POST /api/v1/provisioning-keys`, the system:

1. **Checks the license** - Retrieves the customer's license from the validator
2. **Counts active devices** - Queries the database for currently active devices
3. **Compares** - Checks if `currentDevices >= maxDevices`
4. **Blocks or allows** - Returns 403 if limit exceeded, or creates the provisioning key

### Implementation Location

**File**: `api/src/routes/provisioning.ts`
**Endpoint**: `POST /api/v1/provisioning-keys`

**Code**:

```typescript
// Check license device limit before creating provisioning key
const licenseValidator = (req as any).licenseValidator;
if (licenseValidator) {
  const license = licenseValidator.getLicense();
  const maxDevicesAllowed = license.features.maxDevices;
  
  // Count current active devices
  const deviceCountResult = await query(
    'SELECT COUNT(*) as count FROM devices WHERE is_active = true'
  );
  const currentDeviceCount = parseInt(deviceCountResult.rows[0].count);
  
  if (currentDeviceCount >= maxDevicesAllowed) {
    await logAuditEvent({
      eventType: AuditEventType.PROVISIONING_FAILED,
      severity: AuditSeverity.WARNING,
      details: {
        reason: 'Device limit exceeded - cannot create provisioning key',
        currentDevices: currentDeviceCount,
        maxDevices: maxDevicesAllowed,
        plan: license.plan,
        fleetId
      }
    });

    return res.status(403).json({
      error: 'Device limit exceeded',
      message: `Your ${license.plan} plan allows a maximum of ${maxDevicesAllowed} devices. You currently have ${currentDeviceCount} active devices. Please upgrade your plan to add more devices.`,
      details: {
        currentDevices: currentDeviceCount,
        maxDevices: maxDevicesAllowed,
        plan: license.plan
      }
    });
  }

  console.log(`✅ License check passed: ${currentDeviceCount}/${maxDevicesAllowed} devices`);
}
```

---

## Plan Limits

| Plan | Max Devices |
|------|-------------|
| Trial (Unlicensed) | 2 |
| Starter | 5 |
| Professional | 50 |
| Enterprise | 999999 (Unlimited) |

---

## Error Response

When provisioning key generation is blocked due to license limits:

**HTTP Status**: `403 Forbidden`

**Response Body**:
```json
{
  "error": "Device limit exceeded",
  "message": "Your professional plan allows a maximum of 50 devices. You currently have 50 active devices. Please upgrade your plan to add more devices.",
  "details": {
    "currentDevices": 50,
    "maxDevices": 50,
    "plan": "professional"
  }
}
```

---

## Testing

### Test Device Limit Enforcement

1. **Set up a Starter plan license** (maxDevices: 5)

2. **Register 5 devices** using provisioning keys

3. **Try to create a new provisioning key** (should fail):

```bash
curl -X POST http://localhost:3001/api/v1/provisioning-keys \
  -H "Content-Type: application/json" \
  -d '{
    "fleetId": "production-fleet",
    "maxDevices": 100,
    "expiresInDays": 365,
    "description": "New provisioning key"
  }'
```

**Expected Response**:
```json
{
  "error": "Device limit exceeded",
  "message": "Your starter plan allows a maximum of 5 devices. You currently have 5 active devices. Please upgrade your plan to add more devices.",
  "details": {
    "currentDevices": 5,
    "maxDevices": 5,
    "plan": "starter"
  }
}
```

4. **Audit Log Entry** - Check that the failed provisioning key creation is logged

---

## Upgrade Path

When a customer upgrades their plan (e.g., Starter → Professional):

1. **Billing service** updates subscription in Stripe
2. **Webhook** (`/api/webhooks/stripe`) receives subscription update
3. **New license generated** with updated `maxDevices` (5 → 50)
4. **Customer** updates their API instance with new license key
5. **Device registration** now allows up to 50 devices

### Manual License Update

```bash
# Set new license in customer API environment
IOTISTIC_LICENSE_KEY=<new-jwt-license>

# Restart API service
docker-compose restart api
```

---

## Monitoring

### Check Current Device Count

```bash
# PostgreSQL query
SELECT COUNT(*) FROM devices WHERE is_active = true;
```

### View License Limits

```bash
# API endpoint (if implemented)
curl http://localhost:3001/api/v1/license
```

**Response**:
```json
{
  "plan": "professional",
  "features": {
    "maxDevices": 50
  },
  "currentUsage": {
    "devices": 32
  }
}
```

---

## Future Enhancements

### Planned Features

1. **Usage Dashboard Endpoint**
   - `GET /api/v1/license/usage`
   - Returns current vs. max for all limits

2. **Soft Limits**
   - Warning at 80% capacity
   - Notification to upgrade

3. **Grace Period**
   - Allow 1-2 devices over limit for 7 days after plan downgrade

4. **Inactive Device Cleanup**
   - Auto-deactivate devices offline for 30+ days
   - Free up device slots

---

## Related Documentation

- **License Features**: `billing/docs/LICENSE-FEATURES-COMPARISON.md`
- **Stripe Integration**: `billing/docs/STRIPE-CLI-USAGE.md`
- **Device Provisioning**: `api/docs/PROVISIONING-FIX-COMPLETE.md`
