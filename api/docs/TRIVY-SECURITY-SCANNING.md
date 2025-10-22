# Trivy Security Scanning Integration

## Overview

The Image Monitor Service integrates **Aqua Security's Trivy** to automatically scan Docker images for security vulnerabilities before approval. This provides automated CVE detection and helps prevent deployment of vulnerable images.

## Features

- 🔍 **Automatic Scanning**: Scans all newly discovered tags before creating approval requests
- 🎯 **Vulnerability Detection**: Identifies CRITICAL, HIGH, MEDIUM, LOW severity CVEs
- 🚫 **Auto-Rejection**: Optional auto-rejection of images with critical vulnerabilities
- 📊 **Detailed Reports**: Stores vulnerability counts and details in metadata
- 🔌 **Optional**: Can be disabled without breaking the monitoring workflow

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Image Monitor Service                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Detect new tag on Docker Hub                                 │
│           ↓                                                       │
│  2. Scan with Trivy (if enabled)                                 │
│           ↓                                                       │
│  3. Analyze vulnerabilities                                      │
│           ↓                                                       │
│  4. Create approval request with security metadata               │
│           ↓                                                       │
│  5. Auto-reject if critical vulnerabilities (optional)           │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Docker Hub Tag → Trivy Scanner → Security Report → Approval Request
                                                    ↓
                                     metadata.security_scan:
                                     {
                                       scanned_at,
                                       status,
                                       vulnerabilities,
                                       details
                                     }
```

---

## Installation

### Option 1: Docker Container (Recommended)

Install Trivy in the API container:

```dockerfile
# In api/Dockerfile
FROM node:18-alpine

# Install Trivy
RUN apk add --no-cache wget ca-certificates
RUN wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | apk add --allow-untrusted -
RUN wget https://github.com/aquasecurity/trivy/releases/download/v0.48.0/trivy_0.48.0_Linux-64bit.tar.gz
RUN tar zxvf trivy_0.48.0_Linux-64bit.tar.gz
RUN mv trivy /usr/local/bin/
RUN rm trivy_0.48.0_Linux-64bit.tar.gz

# Rest of Dockerfile...
```

### Option 2: Host Installation (Development)

Install Trivy on the host system:

**Linux/Mac:**
```bash
# Using installer script
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin v0.48.0

# Or using package manager
brew install aquasecurity/trivy/trivy  # macOS
apt-get install trivy                  # Debian/Ubuntu
```

**Windows:**
```powershell
# Using Chocolatey
choco install trivy

# Or download binary
https://github.com/aquasecurity/trivy/releases
```

### Verify Installation

```bash
trivy --version
```

---

## Configuration

### Environment Variables

Add these to your `.env` file or docker-compose:

```bash
# Enable/disable Trivy scanning (default: true)
TRIVY_ENABLED=true

# Path to Trivy binary (default: 'trivy')
TRIVY_PATH=/usr/local/bin/trivy

# Scan timeout in milliseconds (default: 300000 = 5 minutes)
TRIVY_TIMEOUT=300000

# Cache directory for vulnerability database (default: /tmp/trivy-cache)
TRIVY_CACHE_DIR=/tmp/trivy-cache

# Auto-reject images with critical vulnerabilities (default: false)
TRIVY_AUTO_REJECT_CRITICAL=false

# Threshold for critical vulnerabilities (default: 0 = any critical fails)
TRIVY_CRITICAL_THRESHOLD=0

# Threshold for high vulnerabilities to trigger warning (default: 999)
TRIVY_HIGH_THRESHOLD=10
```

### Docker Compose Example

```yaml
services:
  api:
    image: iotistic/Iotistic-api:latest
    environment:
      # Trivy Configuration
      TRIVY_ENABLED: "true"
      TRIVY_AUTO_REJECT_CRITICAL: "true"
      TRIVY_CRITICAL_THRESHOLD: "0"
      TRIVY_HIGH_THRESHOLD: "10"
      TRIVY_CACHE_DIR: "/app/trivy-cache"
    volumes:
      - trivy-cache:/app/trivy-cache  # Persist vulnerability database
    # ... other config

volumes:
  trivy-cache:
```

---

## How It Works

### 1. Automatic Scanning

When the Image Monitor detects a new tag:

```typescript
// In createApprovalRequest()
if (trivyEnabled) {
  const scanResult = await trivyScanner.scanImage(imageName, tag);
  
  metadata.security_scan = {
    scanned_at: scanResult.scannedAt,
    status: scanResult.scanStatus,  // 'passed', 'warning', 'failed'
    vulnerabilities: scanResult.vulnerabilities,
    summary: trivyScanner.getSecuritySummary(scanResult),
    details: scanResult.details  // Top 100 CVEs
  };
}
```

### 2. Vulnerability Counting

Trivy returns vulnerabilities by severity:

```json
{
  "vulnerabilities": {
    "critical": 2,
    "high": 15,
    "medium": 47,
    "low": 103,
    "unknown": 0,
    "total": 167
  }
}
```

### 3. Status Determination

```typescript
if (critical > TRIVY_CRITICAL_THRESHOLD) {
  status = 'failed';         // ❌ Critical issues
} else if (high > TRIVY_HIGH_THRESHOLD) {
  status = 'warning';        // ⚠️  High issues
} else {
  status = 'passed';         // ✅ Acceptable
}
```

### 4. Auto-Rejection (Optional)

If `TRIVY_AUTO_REJECT_CRITICAL=true`:

```typescript
if (scanResult.scanStatus === 'failed') {
  initialStatus = 'rejected';  // Don't create pending approval
}
```

---

## API Endpoints

### Manual Scan

Trigger a security scan for any image/tag:

```bash
POST /api/v1/images/:imageName/:tag/scan

# Example
curl -X POST http://localhost:4002/api/v1/images/redis/7.2-alpine/scan
```

Response:
```json
{
  "message": "Security scan completed",
  "scan": {
    "success": true,
    "scannedAt": "2025-10-17T17:30:00.000Z",
    "imageName": "redis",
    "tag": "7.2-alpine",
    "vulnerabilities": {
      "critical": 0,
      "high": 3,
      "medium": 12,
      "low": 45,
      "unknown": 0,
      "total": 60
    },
    "scanStatus": "passed"
  },
  "summary": "✅ PASSED: 12 medium, 45 low vulnerabilities"
}
```

### Get Security Results for Approval

```bash
GET /api/v1/images/approvals/:id/security

# Example
curl http://localhost:4002/api/v1/images/approvals/123/security
```

Response:
```json
{
  "image_name": "redis",
  "tag_name": "7.2-alpine",
  "security_scan": {
    "scanned_at": "2025-10-17T17:30:00.000Z",
    "status": "passed",
    "vulnerabilities": {
      "critical": 0,
      "high": 3,
      "medium": 12,
      "low": 45,
      "unknown": 0,
      "total": 60
    },
    "summary": "✅ PASSED: 12 medium, 45 low vulnerabilities",
    "details": [
      {
        "VulnerabilityID": "CVE-2023-1234",
        "PkgName": "openssl",
        "InstalledVersion": "1.1.1k",
        "FixedVersion": "1.1.1l",
        "Severity": "HIGH",
        "Title": "Buffer overflow in OpenSSL"
      }
    ]
  },
  "created_at": "2025-10-17T17:30:00.000Z"
}
```

### Security Summary Dashboard

Get overview of all scanned images:

```bash
GET /api/v1/images/security/summary

curl http://localhost:4002/api/v1/images/security/summary
```

Response:
```json
{
  "total": 10,
  "passed": 7,
  "warning": 2,
  "failed": 1,
  "approvals": [
    {
      "id": 123,
      "image_name": "redis",
      "tag_name": "7.2-alpine",
      "status": "pending",
      "scan_status": "passed",
      "vulnerabilities": {
        "critical": 0,
        "high": 3,
        "medium": 12,
        "low": 45
      },
      "scanned_at": "2025-10-17T17:30:00.000Z",
      "created_at": "2025-10-17T17:30:00.000Z"
    }
  ]
}
```

---

## Security Metadata Structure

Stored in `image_approval_requests.metadata.security_scan`:

```json
{
  "security_scan": {
    "scanned_at": "2025-10-17T17:30:00.000Z",
    "status": "passed",
    "vulnerabilities": {
      "critical": 0,
      "high": 3,
      "medium": 12,
      "low": 45,
      "unknown": 0,
      "total": 60
    },
    "summary": "✅ PASSED: 12 medium, 45 low vulnerabilities",
    "details": [
      {
        "VulnerabilityID": "CVE-2023-1234",
        "PkgName": "openssl",
        "InstalledVersion": "1.1.1k",
        "FixedVersion": "1.1.1l",
        "Severity": "HIGH",
        "Title": "Buffer overflow in OpenSSL"
      }
    ]
  }
}
```

---

## Workflows

### Development Workflow

1. **Discover new tag** on Docker Hub
2. **Download image** (Trivy pulls it automatically)
3. **Scan for CVEs** using Trivy database
4. **Store results** in approval request metadata
5. **Review security report** before approving
6. **Approve/Reject** based on vulnerability severity

### Production Workflow (Auto-Reject)

```bash
TRIVY_AUTO_REJECT_CRITICAL=true
TRIVY_CRITICAL_THRESHOLD=0
```

1. **Discover new tag** on Docker Hub
2. **Scan automatically**
3. **If critical vulnerabilities**: Auto-reject, notify admins
4. **If clean**: Create pending approval for manual review
5. **Approve after review**

---

## Recommended Thresholds

### Production Environment (Strict)

```bash
TRIVY_AUTO_REJECT_CRITICAL=true
TRIVY_CRITICAL_THRESHOLD=0     # No critical vulnerabilities allowed
TRIVY_HIGH_THRESHOLD=5         # Warning if >5 high vulnerabilities
```

### Staging Environment (Moderate)

```bash
TRIVY_AUTO_REJECT_CRITICAL=false
TRIVY_CRITICAL_THRESHOLD=1     # Allow 1 critical if fixable
TRIVY_HIGH_THRESHOLD=10        # Warning if >10 high vulnerabilities
```

### Development Environment (Permissive)

```bash
TRIVY_AUTO_REJECT_CRITICAL=false
TRIVY_CRITICAL_THRESHOLD=99    # Don't fail on critical
TRIVY_HIGH_THRESHOLD=99        # Don't warn on high
```

---

## Performance Considerations

### First Scan

- **Database download**: ~5 minutes (one-time)
- **Image pull**: Depends on size (redis:alpine ~30 seconds)
- **Scan time**: 10-30 seconds per image

### Subsequent Scans

- **Database update**: Daily, automatic
- **Cached images**: Scan in 5-10 seconds
- **New images**: Pull + scan time

### Optimization Tips

1. **Persistent Cache**: Mount `/tmp/trivy-cache` as volume
2. **Database Updates**: Run `trivy image --download-db-only` daily
3. **Parallel Scanning**: Image Monitor scans one at a time (sequential)
4. **Timeout**: Increase `TRIVY_TIMEOUT` for large images

---

## Troubleshooting

### Trivy Not Found

**Error**: `[Trivy] Not available: command not found`

**Solution**:
```bash
# Verify installation
which trivy

# Set path explicitly
TRIVY_PATH=/usr/local/bin/trivy
```

### Database Download Fails

**Error**: `failed to download vulnerability DB`

**Solution**:
```bash
# Check internet connectivity
ping ghcr.io

# Manual database download
trivy image --download-db-only

# Check proxy settings
HTTP_PROXY=http://proxy:8080 trivy ...
```

### Scan Timeout

**Error**: `scan exceeded timeout`

**Solution**:
```bash
# Increase timeout (10 minutes)
TRIVY_TIMEOUT=600000

# Or disable timeout
TRIVY_TIMEOUT=0
```

### High Memory Usage

**Symptom**: Node.js heap out of memory during scan

**Solution**:
```bash
# Increase Node.js heap size
NODE_OPTIONS="--max-old-space-size=4096"

# Or scan images outside Node.js process
# (already implemented - uses child_process.exec)
```

---

## Disabling Trivy

To disable security scanning without removing code:

```bash
TRIVY_ENABLED=false
```

The Image Monitor will:
- ✅ Continue monitoring Docker Hub
- ✅ Create approval requests normally
- ❌ Skip security scanning
- ✅ Metadata will not include `security_scan` field

---

## Integration with Admin UI

The Admin Panel can display security information:

```typescript
// In Admin UI
const approvals = await fetch('/api/v1/images/security/summary');

approvals.forEach(approval => {
  const { scan_status, vulnerabilities } = approval;
  
  // Display badge
  if (scan_status === 'failed') {
    showBadge('❌ Critical', 'red');
  } else if (scan_status === 'warning') {
    showBadge('⚠️ Warning', 'yellow');
  } else {
    showBadge('✅ Passed', 'green');
  }
  
  // Show vulnerability counts
  showCounts(vulnerabilities);
});
```

---

## Future Enhancements

### Planned Features

- [ ] **SBOM Generation**: Software Bill of Materials export
- [ ] **License Scanning**: Detect incompatible licenses
- [ ] **Secret Detection**: Find exposed API keys, passwords
- [ ] **Policy Enforcement**: Custom rules for auto-approve/reject
- [ ] **Trend Analysis**: Track vulnerabilities over time
- [ ] **Webhook Notifications**: Slack/Discord alerts for critical CVEs
- [ ] **Scheduled Rescans**: Re-scan approved images weekly

### Integration Ideas

- **Grafana Dashboard**: Visualize vulnerability trends
- **MQTT Alerts**: Publish security events to MQTT
- **Email Reports**: Daily/weekly security digest
- **AWS Security Hub**: Export findings to AWS

---

## References

- **Trivy Documentation**: https://aquasecurity.github.io/trivy/
- **CVE Database**: https://cve.mitre.org/
- **NVD (National Vulnerability Database)**: https://nvd.nist.gov/
- **Docker Security Best Practices**: https://docs.docker.com/engine/security/

---

## Summary

Trivy integration provides **automated vulnerability scanning** for Docker images, helping you:

1. ✅ Detect CVEs before deployment
2. 🚫 Block critical vulnerabilities automatically
3. 📊 Track security posture across all images
4. 🔍 Make informed approval decisions

**Default behavior**: Scan enabled, auto-reject disabled (manual review required).

**Recommended for production**: Enable auto-reject for critical CVEs, set reasonable thresholds.
