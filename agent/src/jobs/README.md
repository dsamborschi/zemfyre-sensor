# AWS IoT Device Client Jobs Feature - Node.js TypeScript

A Node.js TypeScript implementation of the AWS IoT Device Client Jobs Feature, ported from the original C++ implementation.

## Features

- **Full Job Document Support**: Supports both new (v1.0) and legacy job document schemas
- **Handler Execution**: Execute custom job handler scripts with proper permissions
- **Command Execution**: Run arbitrary shell commands as part of job steps  
- **User Switching**: Support for `runAsUser` parameter for security isolation
- **MQTT Integration**: Complete MQTT topic handling matching AWS IoT Jobs API
- **Error Handling**: Comprehensive error handling with STDOUT/STDERR capture
- **Type Safety**: Full TypeScript type definitions with runtime validation

## Installation

```bash
npm install @aws-iot/device-client-jobs
```

## Quick Start

```typescript
import { createJobsFeature } from '@aws-iot/device-client-jobs';
import { mqtt } from 'aws-iot-device-sdk-v2';

// Create MQTT connection (using AWS IoT Device SDK v2)
const connection = /* your MQTT connection */;

// Create and start Jobs feature
const jobsFeature = createJobsFeature(connection, {
  thingName: 'my-iot-device',
  handlerDirectory: '~/.aws-iot-device-client/jobs/',
  enabled: true
});

await jobsFeature.start();
```

## Job Document Schema

### New Schema (v1.0) - Recommended

```json
{
  "version": "1.0",
  "includeStdOut": true,
  "steps": [
    {
      "name": "Install Package",
      "type": "runHandler",
      "input": {
        "handler": "install-package.sh",
        "args": ["nginx"],
        "path": "default"
      },
      "runAsUser": "root",
      "ignoreStepFailure": false
    },
    {
      "name": "Start Service",
      "type": "runCommand", 
      "input": {
        "command": "systemctl,start,nginx"
      }
    }
  ],
  "finalStep": {
    "name": "Cleanup",
    "type": "runHandler",
    "input": {
      "handler": "cleanup.sh"
    }
  }
}
```

### Legacy Schema (backward compatibility)

```json
{
  "operation": "install-package.sh",
  "args": ["nginx"],
  "path": "default",
  "includeStdOut": true,
  "allowStdErr": 2
}
```

## Job Handler Scripts

Create executable scripts in your handler directory (default: `~/.aws-iot-device-client/jobs/`):

### install-package.sh
```bash
#!/bin/bash
# Script receives runAsUser as first argument, then job args
USER=$1
PACKAGE=$2

echo "Installing package: $PACKAGE"
apt-get update && apt-get install -y "$PACKAGE"
```

**Important**: Handler scripts must have 700 permissions:
```bash
chmod 700 ~/.aws-iot-device-client/jobs/install-package.sh
```

## Advanced Usage

### Custom Logger

```typescript
import { JobsFeature, Logger } from '@aws-iot/device-client-jobs';

class CustomLogger implements Logger {
  debug(message: string, ...args: any[]): void {
    // Custom debug logging
  }
  
  info(message: string, ...args: any[]): void {
    // Custom info logging  
  }
  
  warn(message: string, ...args: any[]): void {
    // Custom warning logging
  }
  
  error(message: string, ...args: any[]): void {
    // Custom error logging
  }
}

const jobsFeature = new JobsFeature(
  mqttConnection,
  new CustomLogger(),
  notifier,
  config
);
```

### Custom MQTT Connection

```typescript
import { MqttConnection } from '@aws-iot/device-client-jobs';

class MyMqttConnection implements MqttConnection {
  async publish(topic: string, payload: string): Promise<void> {
    // Your MQTT publish implementation
  }
  
  async subscribe(topic: string, callback: (topic: string, payload: Buffer) => void): Promise<void> {
    // Your MQTT subscribe implementation
  }
  
  async unsubscribe(topic: string): Promise<void> {
    // Your MQTT unsubscribe implementation
  }
  
  isConnected(): boolean {
    // Return connection status
    return true;
  }
}
```

## API Reference

### JobsFeature

Main class that orchestrates job execution.

#### Methods

- `start(): Promise<void>` - Start the Jobs feature
- `stop(): Promise<void>` - Stop the Jobs feature  
- `getName(): string` - Get feature name ("Jobs")

### JobEngine

Handles execution of job actions and commands.

#### Methods

- `executeSteps(jobDocument: JobDocument, handlerDir: string): Promise<JobResult>` - Execute job steps

### Utility Functions

- `createJobsFeature(connection, config)` - Factory function with sensible defaults
- `ConfigUtils.validateJobsConfig(config)` - Validate configuration
- `JobDocumentUtils.validateJobDocument(doc)` - Validate job document

## Configuration

```typescript
interface JobsConfig {
  enabled: boolean;                    // Enable/disable feature
  thingName: string;                  // AWS IoT Thing name
  handlerDirectory: string;           // Path to job handlers
  maxConcurrentJobs?: number;         // Max concurrent jobs (default: 1)
  defaultHandlerTimeout?: number;     // Handler timeout in ms (default: 60000)
}
```

## Error Handling

The library provides comprehensive error handling:

- **Validation Errors**: Invalid job documents or configuration
- **Execution Errors**: Handler script failures, permission issues
- **MQTT Errors**: Connection failures, subscription rejections
- **Timeout Errors**: Handler execution timeouts

All errors are logged and reported via the `ClientBaseNotifier` interface.

## Security Considerations

- **Handler Permissions**: Scripts must have 700 permissions (owner read/write/execute only)
- **User Isolation**: Use `runAsUser` to execute jobs under specific user accounts
- **Path Validation**: Handler paths are validated to prevent directory traversal
- **Output Limits**: STDOUT/STDERR output is limited to prevent log flooding

## Comparison with C++ Implementation

| Feature | C++ Implementation | Node.js Implementation |
|---------|-------------------|------------------------|
| Job Document Schemas | ✅ Both v1.0 and legacy | ✅ Both v1.0 and legacy |
| Handler Execution | ✅ execvp() with pipes | ✅ child_process.spawn() |
| User Switching | ✅ sudo support | ✅ sudo support |
| MQTT Topics | ✅ Full AWS IoT Jobs API | ✅ Full AWS IoT Jobs API |
| Error Handling | ✅ Status codes + logging | ✅ Promises + logging |
| Memory Management | Manual (RAII/smart pointers) | Automatic (GC) |
| Type Safety | Compile-time (C++) | Runtime + compile-time (TS) |
| Dependencies | AWS SDK + OpenSSL | Node.js standard library |

## Examples

See the `examples/` directory for complete usage examples:

- `basic-usage.ts` - Simple job execution example
- `advanced-usage.ts` - Custom logger and error handling
- `aws-sdk-integration.ts` - Integration with AWS IoT Device SDK v2

## License

Apache 2.0 - See LICENSE file for details.