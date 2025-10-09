# Sample Job Documents and Handlers

This directory contains complete examples for AWS IoT Jobs using the Node.js Jobs Client. The samples demonstrate both job document structures and corresponding handler implementations.

## Directory Structure

```
sample-job-docs/          # Job document examples (JSON)
├── echo-unix.json        # Simple echo command for Unix
├── echo-windows.json     # Simple echo command for Windows  
├── download-file.json    # File download job
├── install-packages.json # Package installation
├── reboot.json          # System reboot job
└── complex-job.json     # Multi-step job example

sample-job-handlers/      # Handler script implementations
├── health-check.sh/.cmd  # Basic connectivity test
├── reboot.sh/.cmd       # System reboot with verification
├── *-services.sh/.cmd   # Service management scripts
├── shutdown.sh/.cmd     # System shutdown
├── verify-packages-*.sh/.cmd # Package verification
└── README.md           # Handler documentation
```

## Getting Started

### 1. Job Documents

Job documents define what work should be performed. They specify:
- Job metadata (ID, operation name)
- Execution steps with actions
- Handler parameters and user context

Example:
```json
{
  "jobId": "example-001",
  "operation": "health-check",
  "steps": [
    {
      "action": {
        "name": "health-check",
        "type": "runHandler", 
        "input": {},
        "runAsUser": "root"
      }
    }
  ]
}
```

### 2. Job Handlers

Handlers are executable scripts that perform the actual work. The Node.js Jobs Client:
- Automatically selects platform-appropriate handlers (`.sh` vs `.cmd`)
- Passes parameters as command-line arguments
- Captures output and exit codes
- Reports results back to AWS IoT

### 3. Running Jobs

```typescript
import { JobsFeature } from '../src/jobs-feature';
import * as fs from 'fs';

// Load a job document
const jobDoc = JSON.parse(fs.readFileSync('./sample-job-docs/echo-unix.json', 'utf8'));

// Create jobs feature with mock MQTT
const jobsFeature = new JobsFeature();
await jobsFeature.init(mockManager, mockNotifier, config);

// Process the job
await jobsFeature.processJob(jobDoc);
```

## Sample Job Types

### Basic Operations

#### Health Check
- **Document**: `echo-unix.json`, `echo-windows.json`
- **Handler**: `health-check.sh/.cmd`
- **Purpose**: Verify device connectivity and job processing capability

#### File Operations
- **Document**: `download-file.json`
- **Handler**: `download-file.sh/.cmd` (from main C++ samples)
- **Purpose**: Download files from remote URLs

### System Administration

#### Package Management
- **Documents**: `install-packages.json`
- **Handlers**: `verify-packages-installed.sh/.cmd`
- **Purpose**: Install and verify system packages

#### Service Management
- **Handlers**: `start-services.sh/.cmd`, `stop-services.sh/.cmd`, `restart-services.sh/.cmd`
- **Purpose**: Control system services

#### System Control
- **Documents**: `reboot.json`
- **Handlers**: `reboot.sh/.cmd`, `shutdown.sh/.cmd`
- **Purpose**: System restart and shutdown operations

### Complex Workflows

#### Multi-Step Jobs
- **Document**: `complex-job.json`
- **Purpose**: Demonstrate sequential execution with multiple handlers

## Cross-Platform Compatibility

### Job Documents
Some job documents are platform-specific:
- **Unix variants**: Use shell commands and Unix paths
- **Windows variants**: Use cmd/PowerShell commands and Windows paths

### Handlers
All handlers have platform-specific implementations:
- **`.sh` files**: For Unix/Linux/macOS using shell scripting
- **`.cmd` files**: For Windows using batch files

### Platform Detection
The Node.js Jobs Client automatically detects the platform and:
1. Selects appropriate job documents (if platform-specific naming is used)
2. Executes the correct handler format
3. Uses platform-appropriate temporary directories and commands

## Configuration

### Handler Directory
Set the handler directory in your configuration:
```json
{
  "jobs": {
    "handlerDirectory": "./sample-job-handlers",
    "enabled": true
  }
}
```

### Permissions
Ensure handlers have execute permissions:
```bash
# Unix/Linux/macOS
chmod +x sample-job-handlers/*.sh

# Windows - no additional permissions needed for .cmd files
```

## Best Practices

### Job Document Design
1. **Clear Naming**: Use descriptive job IDs and operation names
2. **Parameter Validation**: Include input validation in handlers
3. **Error Handling**: Define failure scenarios and recovery actions
4. **Documentation**: Comment complex job logic

### Handler Implementation
1. **Exit Codes**: Use 0 for success, non-zero for failure
2. **Output**: Provide descriptive output for debugging
3. **Cleanup**: Remove temporary files and resources
4. **Security**: Validate inputs and use appropriate user contexts

### Testing
1. **Unit Testing**: Test handlers independently
2. **Integration Testing**: Test complete job workflows
3. **Platform Testing**: Verify cross-platform compatibility
4. **Error Scenarios**: Test failure cases and recovery

## Troubleshooting

### Common Issues

#### Handler Not Found
- Verify handler exists in configured directory
- Check file permissions (execute bit on Unix)
- Ensure platform-appropriate extension (`.sh` vs `.cmd`)

#### Permission Denied
- Check file permissions
- Verify `runAsUser` parameter
- Ensure user has necessary privileges

#### Command Not Found
- Verify required tools are installed
- Check PATH environment variable
- Use absolute paths for critical commands

### Debugging

Enable debug logging to see:
- Handler selection process
- Command execution details
- Output capture
- Exit code reporting

```typescript
const config = {
  logging: {
    level: "DEBUG"
  },
  jobs: {
    enabled: true,
    handlerDirectory: "./sample-job-handlers"
  }
};
```

## Contributing

To add new sample jobs:

1. Create job document in `sample-job-docs/`
2. Implement handlers in `sample-job-handlers/`
3. Provide both Unix and Windows versions
4. Add documentation and examples
5. Include error handling and validation

## Related Documentation

- [Main Jobs Client README](../README.md)
- [Handler Documentation](./sample-job-handlers/README.md)
- [AWS IoT Jobs Documentation](https://docs.aws.amazon.com/iot/latest/developerguide/iot-jobs.html)