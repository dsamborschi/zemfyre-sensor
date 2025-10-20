# Provisioning Skip Feature - Quick Reference

## Summary

The `install.sh` script now **automatically skips provisioning prompts** for devices that are already provisioned.

## How It Works

### First Installation
```bash
./bin/install.sh

# Prompts:
# 🔐 Device Provisioning Setup
# Enter your provisioning API key: [you enter key]
# Cloud API Endpoint [http://10.0.0.60:4002]: [press Enter or enter URL]
```

### Subsequent Updates
```bash
cd ~/iotistic
git pull
./bin/install.sh

# Output:
# ✅ Device Already Provisioned
# Device UUID: 550e8400-e29b-41d4-a716-446655440000
# Device Name: my-device
# [No prompts - continues with installation]
```

## Manual Override

If you need to force re-provisioning:

```bash
# Option 1: Set environment variables
PROVISIONING_API_KEY=your-key CLOUD_API_ENDPOINT=http://your-cloud:4002 ./bin/install.sh

# Option 2: Reset database (CAUTION!)
rm ~/iotistic/agent/data/database.sqlite
./bin/install.sh
```

## Checking Provisioning Status

```bash
# Quick check
sqlite3 ~/iotistic/agent/data/database.sqlite "SELECT uuid, deviceName, provisioned FROM device;"

# Or use the test script
cd ~/iotistic/bin
bash test-provisioning-skip.sh
```

## Troubleshooting

### Issue: Script still prompts for provisioning
**Possible causes:**
1. Database doesn't exist yet (first installation)
2. `sqlite3` command not installed
3. Device record has `provisioned=0`

**Solution:**
```bash
# Check if database exists
ls -lh ~/iotistic/agent/data/database.sqlite

# Check if sqlite3 is installed
which sqlite3

# Check provisioning status
sqlite3 ~/iotistic/agent/data/database.sqlite "SELECT provisioned FROM device;"
```

### Issue: Want to re-provision an already provisioned device
**Solution:**
```bash
# Method 1: Use environment variable (recommended)
PROVISIONING_API_KEY=new-key ./bin/install.sh

# Method 2: Reset via database
sqlite3 ~/iotistic/agent/data/database.sqlite "UPDATE device SET provisioned = 0;"
./bin/install.sh

# Method 3: Delete database (loses device identity)
rm ~/iotistic/agent/data/database.sqlite
./bin/install.sh
```

## Technical Details

- **Database**: `~/iotistic/agent/data/database.sqlite`
- **Table**: `device`
- **Column**: `provisioned` (0 = not provisioned, 1 = provisioned)
- **Check runs**: Before prompting for provisioning credentials
- **Fallback**: If check fails, continues normally (may prompt)

## Related Documentation

- **Full Implementation**: `docs/PROVISIONING-SKIP-IMPLEMENTATION.md`
- **Provisioning Guide**: `agent/docs/PROVISIONING.md`
- **Two-Phase Auth**: `agent/docs/TWO-PHASE-AUTH.md`
