# Running Examples

This guide shows you how to run the examples in the `examples/` folder.

## Available Examples

1. **`basic-usage.ts`** - Basic demo with simple echo command (may fail on Windows)
2. **`windows-example.ts`** - Windows-compatible demo with cmd commands (succeeds on Windows)

## Methods to Run Examples

### Method 1: Using npm scripts (Recommended) ⭐

```bash
# Run the basic example
npm run example:basic

# Run the Windows-compatible example  
npm run example:windows

# Run default examples
npm run examples
```

### Method 2: Using ts-node directly

```bash
# Run basic example
npx ts-node examples/basic-usage.ts

# Run Windows example
npx ts-node examples/windows-example.ts
```

### Method 3: Compile to JavaScript first

```bash
# Build the project first
npm run build

# Compile the example (replace filename as needed)
npx tsc examples/windows-example.ts --outDir dist/examples --esModuleInterop --skipLibCheck --target ES2020 --module commonjs

# Run the compiled JavaScript
node dist/examples/windows-example.js
```

## Example Output

When you run the Windows example (`npm run example:windows`), you'll see:

```
🪟 AWS IoT Device Client Jobs Feature - Windows Example

Starting Jobs feature...
[INFO] JobsFeature: Starting Jobs feature for thing: my-windows-device
[MQTT] Subscribing to $aws/things/my-windows-device/jobs/start-next/accepted
[MQTT] Publishing to $aws/things/my-windows-device/jobs/start-next: {...}
[INFO] JobsFeature: Jobs feature started successfully

Jobs feature is running. Waiting for Windows-compatible jobs...
[INFO] JobsFeature: Starting execution of job windows-demo-job-456
[INFO] JobEngine: Starting job execution with 2 steps
[INFO] JobEngine: Executing step: Get Current Directory
[INFO] JobEngine: Executing step: List Files  
[INFO] JobEngine: Executing final step: Say Goodbye

[INFO] JobsFeature: Job windows-demo-job-456 completed with status: SUCCEEDED
Stopping Jobs feature...
[INFO] JobsFeature: Jobs feature stopped successfully
```

## What the Examples Demonstrate

### Features Shown
- ✅ **MQTT Connection**: Mock MQTT client with topic subscriptions
- ✅ **Job Document Processing**: Parse v1.0 schema job documents  
- ✅ **Multi-Step Jobs**: Execute sequential job steps
- ✅ **Command Execution**: Run shell commands with output capture
- ✅ **Status Reporting**: Publish job status updates (IN_PROGRESS → SUCCEEDED/FAILED)
- ✅ **Error Handling**: Graceful handling of failed commands
- ✅ **Final Steps**: Execute cleanup/final steps after main steps
- ✅ **Logging**: Comprehensive logging throughout execution

### Job Document Examples

**Basic Unix Command:**
```json
{
  "version": "1.0", 
  "includeStdOut": true,
  "steps": [
    {
      "name": "Echo Hello World",
      "type": "runCommand",
      "input": {
        "command": "echo,Hello from AWS IoT Jobs!"
      }
    }
  ]
}
```

**Windows-Compatible Commands:**
```json
{
  "version": "1.0",
  "includeStdOut": true, 
  "steps": [
    {
      "name": "Get Current Directory",
      "type": "runCommand",
      "input": {
        "command": "cmd,/c,cd"
      }
    },
    {
      "name": "List Files", 
      "type": "runCommand",
      "input": {
        "command": "cmd,/c,dir,/b"
      }
    }
  ],
  "finalStep": {
    "name": "Say Goodbye",
    "type": "runCommand", 
    "input": {
      "command": "cmd,/c,echo,Job completed successfully!"
    }
  }
}
```

## Creating Custom Examples

To create your own example:

1. Create a new `.ts` file in the `examples/` folder
2. Import the library: `import { createJobsFeature } from '../src';`
3. Create a mock MQTT connection or use a real one
4. Create job documents with your desired commands
5. Add an npm script to `package.json` for easy running

## Troubleshooting

### "Command not found" errors
- Use Windows-compatible commands (`cmd /c command`) on Windows
- Use shell-compatible commands (`bash -c "command"`) on Unix
- Test commands in your terminal first

### TypeScript compilation errors
- Run `npm install` to ensure dependencies are installed
- Use `ts-node` for direct TypeScript execution
- Check that Node.js types are available

### Permission errors  
- Ensure you have execute permissions for any handler scripts
- On Unix systems, job handlers need 700 permissions
- Run with appropriate user privileges if using `runAsUser`

## Next Steps

- Try creating your own job handlers in `~/.aws-iot-device-client/jobs/`
- Integrate with real AWS IoT Device SDK v2 for actual MQTT connectivity
- Experiment with different job document schemas and command types