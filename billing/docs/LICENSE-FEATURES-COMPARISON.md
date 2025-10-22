# License Features Comparison

## Plan Feature Matrix

| Feature | Starter | Professional | Enterprise |
|---------|---------|--------------|------------|
| **💰 Price** | $29/month | $99/month | $299/month |

### 🔧 Core Device Management

| Feature | Starter | Professional | Enterprise |
|---------|---------|--------------|------------|
| Max Devices | 5 | 50 | Unlimited |

### ⚙️ Job Execution Capabilities

| Feature | Starter | Professional | Enterprise |
|---------|---------|--------------|------------|
| Can Execute Jobs | ✅ | ✅ | ✅ |
| Can Schedule Jobs | ❌ | ✅ | ✅ |

### 🔐 Remote Access & Control

| Feature | Starter | Professional | Enterprise |
|---------|---------|--------------|------------|
| Remote Access | ✅ | ✅ | ✅ |
| OTA Updates | ❌ | ✅ | ✅ |

### 📊 Data Management

| Feature | Starter | Professional | Enterprise |
|---------|---------|--------------|------------|
| Can Export Data | ✅ | ✅ | ✅ |

### 🎯 Advanced Features

| Feature | Starter | Professional | Enterprise |
|---------|---------|--------------|------------|
| Advanced Alerts | ❌ | ✅ | ✅ |
| Custom Dashboards | ❌ | ✅ | ✅ |
| API Access | ✅ | ✅ | ✅ |
| MQTT Access | ✅ | ✅ | ✅ |

### 📈 Limits

| Limit | Starter | Professional | Enterprise |
|-------|---------|--------------|------------|
| Max Job Templates | 10 | 100 | Unlimited |
| Max Alert Rules | 25 | 100 | Unlimited |
| Max Users | 2 | 10 | Unlimited |

---

## Feature Descriptions

### Device Management
- **Max Devices**: Maximum number of IoT devices that can be provisioned

### Job Execution
- **Can Execute Jobs**: Run commands and scripts on remote devices
- **Can Schedule Jobs**: Set up recurring or scheduled job executions

### Remote Access & Control
- **Remote Access**: SSH tunnel and remote device access
- **OTA Updates**: Over-the-air firmware and system updates

### Data Management
- **Data Retention**: How long telemetry and metrics data is stored
- **Can Export Data**: Export data to CSV, JSON, or external systems

### Advanced Features
- **Advanced Alerts**: Complex alert rules with multiple conditions
- **Custom Dashboards**: Create custom Grafana dashboards
- **API Access**: Full REST API access for integrations
- **MQTT Access**: Direct MQTT broker access for custom clients

### Limits
- **Max Job Templates**: Number of reusable job templates
- **Max Alert Rules**: Number of alert rules that can be created
- **Max Users**: Number of user accounts for the portal

---

## License Validation in API

The customer API validates these features at runtime:

```typescript
// Check if feature is enabled
if (licenseValidator.hasFeature('canScheduleJobs')) {
  // Allow scheduled job creation
}

// Get limit
const maxDevices = licenseValidator.getLicense().features.maxDevices;
if (currentDeviceCount >= maxDevices) {
  throw new Error('Device limit reached');
}

// Check specific limit
const maxKeys = licenseValidator.getLimit('maxProvisioningKeys');
if (maxKeys && currentKeys >= maxKeys) {
  throw new Error('Provisioning key limit reached');
}
```

---

## Unlicensed Mode (Fallback)

If no valid license is provided, the system runs in **unlicensed mode** with minimal features:

| Feature | Unlicensed Mode |
|---------|-----------------|
| Max Devices | 2 |
| Can Execute Jobs | ✅ |
| Can Schedule Jobs | ❌ |
| Remote Access | ✅ |
| OTA Updates | ❌ |
| Can Export Data | ❌ |
| Trial Duration | 7 days |

---

## Testing

Test the license endpoint:

```bash
# Get license for customer
curl http://localhost:3100/api/licenses/{customerId}

# Verify license JWT
curl -X POST http://localhost:3100/api/licenses/verify \
  -H "Content-Type: application/json" \
  -d '{"license": "eyJhbGci..."}'
```

PowerShell:
```powershell
# Get license
$license = Invoke-RestMethod -Uri "http://localhost:3100/api/licenses/{customerId}"

# Display features
$license.decoded.features | ConvertTo-Json -Depth 2

# Display limits
$license.decoded.limits | ConvertTo-Json -Depth 2
```

---

## Related Documentation

- **Billing Service**: `billing/README.md`
- **Stripe Integration**: `billing/docs/STRIPE-CLI-USAGE.md`
- **Checkout Flow**: `billing/docs/CHECKOUT-TESTING-GUIDE.md`
- **License Validator**: `api/src/services/license-validator.ts`
