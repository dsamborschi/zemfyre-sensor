# Device CLI - Command-Line Interface

Complete CLI tool for managing device configuration and operations.

## Quick Start

```bash
# Development (TypeScript)
npm run cli -- config set-api https://cloud.example.com

# Production (compiled)
device-cli config set-api https://cloud.example.com
```

## Installation on Device

```bash
# Build the CLI
cd /home/iotistic/agent
npm run build

# Create symlink for easy access
sudo ln -s /home/iotistic/agent/dist/cli/device-cli.js /usr/local/bin/device-cli
sudo chmod +x /home/iotistic/agent/dist/cli/device-cli.js

# Now you can use it system-wide
device-cli help
```

## Commands

### Configuration Management

#### Set Cloud API Endpoint

```bash
device-cli config set-api https://api.iotistic.com

# With port
device-cli config set-api https://api.iotistic.com:3002

# Local development
device-cli config set-api http://localhost:3002
```

**Output:**
```
✅ Cloud API endpoint updated to: https://api.iotistic.com
⚠️  Restart the device agent for changes to take effect:
   sudo systemctl restart device-agent
```

#### Get Current API Endpoint

```bash
device-cli config get-api
```

**Output:**
```
📡 Cloud API Endpoint: https://api.iotistic.com
```

#### Set Any Configuration Value

```bash
# Set poll interval (60 seconds)
device-cli config set pollInterval 60000

# Set device name
device-cli config set deviceName "Living Room Sensor"

# Set boolean
device-cli config set enableMetrics true

# Set JSON object
device-cli config set customSettings '{"key":"value"}'
```

#### Get Specific Configuration Value

```bash
device-cli config get pollInterval
```

**Output:**
```
pollInterval: 60000
```

#### Show All Configuration

```bash
device-cli config show
```

**Output:**
```json
📋 Device Configuration:

{
  "cloudApiEndpoint": "https://api.iotistic.com",
  "pollInterval": 60000,
  "reportInterval": 10000,
  "deviceName": "Living Room Sensor"
}

📁 Config file: /app/data/device-config.json
```

#### Reset Configuration

```bash
device-cli config reset
```

### Device Management

#### Check Device Status

```bash
device-cli status
```

**Output:**
```
📊 Device Status:

✅ API Endpoint: https://api.iotistic.com
✅ Database: 2.45 KB
✅ Config File: /app/data/device-config.json

💡 Tip: Use "device-cli logs --follow" to monitor device activity
```

#### Restart Device Agent

```bash
device-cli restart
```

**Output:**
```
🔄 Restarting device agent...
   sudo systemctl restart device-agent
```

#### View Logs

```bash
device-cli logs
```

**Output:**
```
📜 Device Logs:
   sudo journalctl -u device-agent -f
```

### Help & Version

```bash
# Show help
device-cli help

# Show version
device-cli version
```

## Configuration Priority

The CLI uses a **layered configuration system** with the following priority (highest to lowest):

1. **CLI Config File** (`/app/data/device-config.json`) - Set via CLI commands
2. **Environment Variables** - Set in docker-compose or systemd
3. **Default Values** - Built-in defaults

### Example

```bash
# Set via CLI (highest priority)
device-cli config set-api https://cli.example.com

# Also set via environment variable (lower priority)
export CLOUD_API_ENDPOINT=https://env.example.com

# Result: CLI value wins
device-cli config get-api
# Output: https://cli.example.com
```

## Configuration File Format

Location: `/app/data/device-config.json`

```json
{
  "cloudApiEndpoint": "https://api.iotistic.com",
  "pollInterval": 60000,
  "reportInterval": 10000,
  "metricsInterval": 300000,
  "deviceName": "Raspberry Pi 4 - Office",
  "enableRemoteAccess": false,
  "logLevel": "info",
  "enableMetrics": true
}
```

## Environment Variables

All configuration can also be set via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `CLOUD_API_ENDPOINT` | Cloud API URL | - |
| `POLL_INTERVAL` | Target state poll interval (ms) | 60000 |
| `REPORT_INTERVAL` | Current state report interval (ms) | 10000 |
| `METRICS_INTERVAL` | Metrics collection interval (ms) | 300000 |
| `API_TIMEOUT` | API request timeout (ms) | 30000 |
| `DEVICE_NAME` | Device display name | - |
| `DEVICE_TYPE` | Device type (pi3, pi4, x86) | - |
| `LOG_LEVEL` | Log level (debug, info, warn, error) | info |
| `ENABLE_METRICS` | Enable metrics collection | true |
| `ENABLE_AUTO_UPDATE` | Enable automatic updates | false |

## Integration with Device Agent

The device agent automatically loads CLI configuration via `ConfigLoader`:

```typescript
import { getConfigLoader } from './config-loader';

const configLoader = getConfigLoader();
const config = configLoader.getConfig();

console.log('API Endpoint:', config.cloudApiEndpoint);
console.log('Poll Interval:', config.pollInterval);
```

### Watch for Configuration Changes

```typescript
configLoader.watchConfig((newConfig) => {
  console.log('Configuration changed:', newConfig);
  // Reload services with new config
});
```

## Use Cases

### Switching Between Mock and Production API

```bash
# Use mock server for testing
device-cli config set-api https://567cea7e-66b6-4e92-a622-ac53067b271a.mock.pstmn.io

# Switch to production
device-cli config set-api https://cloud.iotistic.com

# Restart to apply
sudo systemctl restart device-agent
```

### Adjusting Poll Intervals

```bash
# Poll every 30 seconds (more responsive)
device-cli config set pollInterval 30000

# Poll every 5 minutes (less bandwidth)
device-cli config set pollInterval 300000

sudo systemctl restart device-agent
```

### Setting Device Name

```bash
device-cli config set deviceName "Kitchen Sensor #3"
sudo systemctl restart device-agent
```

### Disable Metrics Collection

```bash
device-cli config set enableMetrics false
sudo systemctl restart device-agent
```

## Extending the CLI

### Adding New Commands

Edit `cli/device-cli.ts`:

```typescript
// Add new command handler
function myNewCommand(arg: string): void {
  console.log(`Executing new command with: ${arg}`);
  // Implementation here
}

// Register in main() switch statement
switch (command) {
  case 'mynew':
    myNewCommand(args[1]);
    break;
  // ... other cases
}
```

### Adding New Configuration Options

1. Add to `DeviceConfig` interface in `config-loader.ts`:

```typescript
export interface DeviceConfig {
  // ... existing fields
  myNewOption?: string;
}
```

2. Add environment variable mapping:

```typescript
private loadEnvConfig(): void {
  this.envConfig = {
    // ... existing mappings
    myNewOption: process.env.MY_NEW_OPTION,
  };
}
```

3. Add to defaults:

```typescript
const defaults: DeviceConfig = {
  // ... existing defaults
  myNewOption: 'default-value',
};
```

4. Use in CLI:

```bash
device-cli config set myNewOption "custom-value"
device-cli config get myNewOption
```

## Troubleshooting

### CLI Command Not Found

```bash
# Check if symlink exists
ls -la /usr/local/bin/device-cli

# Recreate symlink
sudo ln -sf /home/iotistic/agent/dist/cli/device-cli.js /usr/local/bin/device-cli
sudo chmod +x /home/iotistic/agent/dist/cli/device-cli.js
```

### Configuration Not Applied

```bash
# Verify config file exists
cat /app/data/device-config.json

# Restart device agent
sudo systemctl restart device-agent

# Check logs for errors
sudo journalctl -u device-agent -n 50
```

### Permission Denied

```bash
# CLI needs read/write access to /app/data
sudo chown -R iotistic:iotistic /app/data
sudo chmod 755 /app/data
```

## Best Practices

1. **Always restart after config changes**: Use `sudo systemctl restart device-agent`
2. **Use `config show` before changes**: Review current config before modifying
3. **Validate URLs**: CLI validates API endpoints, but double-check format
4. **Test in development first**: Use mock server before production API
5. **Backup config**: Copy `/app/data/device-config.json` before major changes

## Future Enhancements

Planned features for future versions:

- [ ] `device-cli provision <uuid>` - Provision device with UUID
- [ ] `device-cli deprovision` - Remove device provisioning
- [ ] `device-cli logs --follow` - Actually follow logs (not just show command)
- [ ] `device-cli restart --force` - Actually restart service with sudo
- [ ] `device-cli update` - Trigger device agent update
- [ ] `device-cli network` - Network diagnostics
- [ ] `device-cli apps` - List running applications
- [ ] `device-cli apps restart <app>` - Restart specific app
- [ ] `device-cli backup` - Backup device configuration
- [ ] `device-cli restore <backup>` - Restore from backup
- [ ] Interactive mode: `device-cli interactive`
- [ ] Tab completion for bash/zsh

## Examples

### Complete Workflow: Switch to Production

```bash
# 1. Check current status
device-cli status

# 2. Show current config
device-cli config show

# 3. Set production API
device-cli config set-api https://cloud.iotistic.com

# 4. Adjust intervals for production
device-cli config set pollInterval 60000
device-cli config set reportInterval 10000

# 5. Verify changes
device-cli config show

# 6. Restart agent
sudo systemctl restart device-agent

# 7. Monitor logs
sudo journalctl -u device-agent -f
```

### Quick Development Setup

```bash
# Use mock server
device-cli config set-api https://567cea7e-66b6-4e92-a622-ac53067b271a.mock.pstmn.io

# Fast polling for testing
device-cli config set pollInterval 10000

# Enable debug logging
device-cli config set logLevel debug

# Restart and test
sudo systemctl restart device-agent
```

---

**Status**: ✅ Fully implemented and ready for use!

**Location**: `agent/cli/device-cli.ts`  
**Config Loader**: `agent/src/config-loader.ts`
