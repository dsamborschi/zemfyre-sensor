# Trivy Security Scanning - Quick Start Guide

## Installation

### Windows (Chocolatey)
```powershell
choco install trivy
```

### Windows (Manual)
1. Download from: https://github.com/aquasecurity/trivy/releases
2. Extract `trivy.exe` to a directory
3. Add to PATH or set: `$env:TRIVY_PATH='C:\path\to\trivy.exe'`

### Linux/Mac
```bash
# Installer script
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# Or package manager
brew install aquasecurity/trivy/trivy  # macOS
apt-get install trivy                  # Debian/Ubuntu
```

## Verify Installation

```bash
trivy --version
```

## Configuration (Environment Variables)

```bash
# Enable scanning (default: true)
TRIVY_ENABLED=true

# Path to Trivy binary (default: 'trivy')
TRIVY_PATH=/usr/local/bin/trivy

# Scan timeout in ms (default: 300000 = 5 minutes)
TRIVY_TIMEOUT=300000

# Cache directory (default: /tmp/trivy-cache)
TRIVY_CACHE_DIR=/app/trivy-cache

# Auto-reject critical vulnerabilities (default: false)
TRIVY_AUTO_REJECT_CRITICAL=false

# Critical vulnerability threshold (default: 0)
TRIVY_CRITICAL_THRESHOLD=0

# High vulnerability warning threshold (default: 999)
TRIVY_HIGH_THRESHOLD=10
```

## Testing

### 1. Test Trivy Installation
```powershell
# Windows
.\test-trivy-integration.ps1
```

```bash
# Linux/Mac
npm run build
node test-trivy.js
```

### 2. Manual Image Scan
```bash
# Scan a specific image
curl -X POST http://localhost:4002/api/v1/images/redis/7.2-alpine/scan
```

### 3. View Security Summary
```bash
# Get all security scan results
curl http://localhost:4002/api/v1/images/security/summary
```

### 4. Get Approval Security Details
```bash
# Get security scan for specific approval request
curl http://localhost:4002/api/v1/images/approvals/123/security
```

## How It Works

1. **Image Monitor** detects new tag on Docker Hub
2. **Trivy Scanner** automatically scans the image for CVEs
3. **Vulnerability Analysis** counts critical/high/medium/low issues
4. **Approval Request** created with security metadata
5. **Auto-Rejection** (optional) if critical vulnerabilities exceed threshold

## Metadata Structure

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

## Status Badges

- ✅ **PASSED**: No critical, acceptable high vulnerabilities
- ⚠️ **WARNING**: High vulnerabilities exceed threshold
- ❌ **FAILED**: Critical vulnerabilities detected

## Recommended Production Settings

```bash
TRIVY_ENABLED=true
TRIVY_AUTO_REJECT_CRITICAL=true
TRIVY_CRITICAL_THRESHOLD=0      # Zero critical vulnerabilities
TRIVY_HIGH_THRESHOLD=5          # Warn if >5 high vulnerabilities
```

## Disabling Trivy

To skip security scanning:

```bash
TRIVY_ENABLED=false
```

Image monitoring continues, but no security scans are performed.

## Troubleshooting

**Trivy not found:**
- Verify installation: `trivy --version`
- Set explicit path: `TRIVY_PATH=/usr/local/bin/trivy`

**Scan timeout:**
- Increase timeout: `TRIVY_TIMEOUT=600000` (10 minutes)
- Check internet connectivity for database download

**Database download fails:**
- Manual download: `trivy image --download-db-only`
- Check proxy settings if behind corporate firewall

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/images/:name/:tag/scan` | Manually scan an image |
| GET | `/api/v1/images/approvals/:id/security` | Get security scan results |
| GET | `/api/v1/images/security/summary` | Get overview of all scans |

## Next Steps

1. ✅ Install Trivy
2. ✅ Configure environment variables
3. ✅ Test with `test-trivy-integration.ps1`
4. ✅ Start API with Trivy enabled
5. ✅ Monitor approval requests for security data
6. ✅ Review and approve/reject based on vulnerability reports

## Full Documentation

See `docs/TRIVY-SECURITY-SCANNING.md` for complete documentation.
