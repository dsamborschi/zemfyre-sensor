# Sample Job Handlers

This directory contains sample job handler scripts that demonstrate how to implement AWS IoT Jobs using the Node.js Jobs Client. These handlers provide cross-platform support for common system administration tasks.

## Cross-Platform Support

Each handler is provided in two versions:
- **Unix/Linux/macOS**: `.sh` shell scripts
- **Windows**: `.cmd` batch files

The Node.js Jobs Client automatically selects the appropriate handler based on the platform:
- Windows: Uses `.cmd` files
- Unix-like systems: Uses `.sh` files

## Available Handlers

### health-check
- **Purpose**: Simple connectivity test that always succeeds
- **Usage**: Verifies the device can process jobs
- **Parameters**: None
- **Files**: `health-check.sh`, `health-check.cmd`

### reboot
- **Purpose**: System reboot with verification
- **Usage**: Reboots the system and verifies success on next boot
- **Parameters**: `username` (optional, for sudo operations)
- **Files**: `reboot.sh`, `reboot.cmd`
- **Notes**: Uses lock files to track reboot state

### Service Management

#### restart-services
- **Purpose**: Restart one or more system services
- **Parameters**: `username` (optional), `service1 service2 ...`
- **Files**: `restart-services.sh`, `restart-services.cmd`

#### start-services
- **Purpose**: Start one or more system services
- **Parameters**: `username` (optional), `service1 service2 ...`
- **Files**: `start-services.sh`, `start-services.cmd`

#### stop-services
- **Purpose**: Stop one or more system services
- **Parameters**: `username` (optional), `service1 service2 ...`
- **Files**: `stop-services.sh`, `stop-services.cmd`

### shutdown
- **Purpose**: System shutdown with 1-minute delay
- **Parameters**: `username` (optional, for sudo operations)
- **Files**: `shutdown.sh`, `shutdown.cmd`

### Package Verification

#### verify-packages-installed
- **Purpose**: Verify that specified packages are installed
- **Parameters**: `username` (optional), `package1 package2 ...`
- **Files**: `verify-packages-installed.sh`, `verify-packages-installed.cmd`
- **Package Managers**: 
  - Linux: RPM, DPKG
  - macOS: Homebrew
  - Windows: Chocolatey

#### verify-packages-removed
- **Purpose**: Verify that specified packages are NOT installed
- **Parameters**: `username` (optional), `package1 package2 ...`
- **Files**: `verify-packages-removed.sh`, `verify-packages-removed.cmd`

## Usage Examples

### Basic Health Check
```typescript
import { JobsFeature } from '../src/jobs-feature';

const jobDocument = {
  jobId: "health-check-001",
  operation: "health-check",
  steps: [
    {
      action: {
        name: "health-check",
        type: "runHandler",
        input: {},
        runAsUser: "root"
      }
    }
  ]
};
```

### Service Management
```typescript
const restartJob = {
  jobId: "restart-services-001",
  operation: "restart-services",
  steps: [
    {
      action: {
        name: "restart-services",
        type: "runHandler",
        input: {
          services: ["nginx", "mongodb"]
        },
        runAsUser: "admin"
      }
    }
  ]
};
```

### Package Verification
```typescript
const verifyJob = {
  jobId: "verify-packages-001",
  operation: "verify-packages-installed",
  steps: [
    {
      action: {
        name: "verify-packages-installed",
        type: "runHandler",
        input: {
          packages: ["curl", "wget", "git"]
        },
        runAsUser: "root"
      }
    }
  ]
};
```

## Platform-Specific Notes

### Unix/Linux/macOS (.sh files)
- Use `#!/usr/bin/env sh` for maximum compatibility
- Support both `systemctl` and `service` commands
- Include `sudo` support with user parameter
- Use `/tmp/` for temporary files

### Windows (.cmd files)
- Use batch file syntax with error handling
- Support Windows Service Manager (`net start/stop`)
- Use `%TEMP%` for temporary files
- Include Chocolatey package manager support

## Security Considerations

1. **File Permissions**: Ensure handler scripts have appropriate execute permissions
2. **User Context**: Use the `runAsUser` parameter for privilege separation
3. **Input Validation**: Handlers should validate input parameters
4. **Lock Files**: Use temporary lock files to prevent concurrent execution issues

## Custom Handlers

To create custom handlers:

1. Create both `.sh` and `.cmd` versions
2. Follow the parameter convention: `handler username param1 param2 ...`
3. Use appropriate exit codes (0 = success, non-zero = failure)
4. Include descriptive output for debugging
5. Handle edge cases and provide meaningful error messages

## Error Handling

All handlers follow these conventions:
- Exit code 0: Success
- Exit code 1: Failure
- Descriptive output to stdout/stderr
- Proper cleanup of temporary files
- Graceful handling of missing dependencies