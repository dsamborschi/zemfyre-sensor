# Standalone Application Manager

A standalone application manager service extracted from the Balena Supervisor. This package provides container orchestration capabilities for managing Docker-based applications.

## 🐳 Docker Integration - NEW!

This manager now has **REAL Docker support**! Deploy, update, and manage containers just like Balena does.

### Quick Start (30 seconds)

```bash
# Make sure Docker is running
docker ps

# Deploy your first container!
npx tsx quick-start.ts

# Visit http://localhost:8080
```

### Documentation

- **[DOCKER-SUMMARY.md](./DOCKER-SUMMARY.md)** - Quick overview & examples
- **[DOCKER-QUICKSTART.md](./DOCKER-QUICKSTART.md)** - Quick reference guide
- **[DOCKER-GUIDE.md](./DOCKER-GUIDE.md)** - Complete API documentation
- **[SIMPLE-MANAGER-README.md](./SIMPLE-MANAGER-README.md)** - Core concepts

### Features

✅ **Real Docker Integration** - Uses dockerode for actual Docker operations  
✅ **State Reconciliation** - Automatically calculates and applies changes  
✅ **Multi-Container Apps** - Deploy complex stacks (like docker-compose)  
✅ **Rolling Updates** - Zero-downtime container updates  
✅ **REST API** - Control via HTTP (see `api/` folder)  
✅ **Simulated Mode** - Test without Docker  

---

## Overview

This package provides two application managers:

1. **ContainerManager** (`src/container-manager.ts`) - **RECOMMENDED**
   - Clean, simplified design without commit logic
   - Real Docker support with `new ContainerManager(true)`
   - State reconciliation (current → target)
   - REST API available (`api/server.ts`)
   - **Start here!** See examples in `examples/docker-integration.ts`

2. **ApplicationManager** (`src/application-manager.ts`) - Original extraction
   - Full Balena-style commit tracking
   - More complex, closer to original Balena code
   - Uses stubs for dependencies

## Project Structure

```
standalone-application-manager/
├── src/
│   ├── application-manager.ts  # Main application manager logic
│   ├── app.ts                  # App class for managing application state
│   ├── composition-steps.ts    # Composition step generation and execution
│   ├── types.ts                # TypeScript type definitions
│   ├── stubs.ts                # Stub implementations for dependencies
│   └── index.ts                # Main entry point
├── examples/
│   └── basic-usage.ts          # Example usage
├── package.json
├── tsconfig.json
└── README.md
```

## Installation

```bash
cd standalone-application-manager
npm install
```

## Building

```bash
npm run build
```

This will compile the TypeScript files to JavaScript in the `dist/` directory.

## Testing

Run the test suite to verify the application manager works correctly:

```bash
# Install test runner
npm install -D tsx

# Run simple test
npx tsx test/simple-test.ts

# Run test with mock data
npx tsx test/mock-data-test.ts

# Run comprehensive test
npx tsx test/basic-test.ts
```

See [test/README.md](test/README.md) for more testing options.

## Usage

### Basic Example

```typescript
import applicationManager from 'standalone-application-manager';

// Initialize the application manager
await applicationManager.initialized();

// Get current applications
const currentApps = await applicationManager.getCurrentApps();

// Get target applications (from your configuration source)
const targetApps = await applicationManager.getTargetApps();

// Calculate required steps to reach target state
const steps = await applicationManager.getRequiredSteps(
	currentApps,
	targetApps,
	false, // keepImages
	false, // keepVolumes
	false  // force
);

// Execute each step
for (const step of steps) {
	await applicationManager.executeStep(step);
}
```

### Listening to Events

```typescript
// Listen for application state changes
applicationManager.on('change', (report) => {
	console.log('Application state changed:', report);
});
```

## Key Concepts

### Applications

Applications are composed of:
- **Services**: Docker containers running your application code
- **Networks**: Network configurations for inter-service communication
- **Volumes**: Persistent storage for application data

### Composition Steps

The application manager generates "composition steps" that represent atomic operations needed to transition from the current state to the target state. Step types include:

- `fetch`: Download a container image
- `start`: Start a service
- `stop`: Stop a service
- `kill`: Kill a service (forceful stop)
- `remove`: Remove a stopped service
- `createNetwork`: Create a network
- `createVolume`: Create a volume
- `removeNetwork`: Remove a network
- `removeVolume`: Remove a volume
- `updateMetadata`: Update service metadata
- `takeLock`: Acquire update locks
- `releaseLock`: Release update locks

### Update Strategies

The manager supports different update strategies:
- **Download then kill**: Download new image first, then replace
- **Kill then download**: Stop service first, then download
- **Delete then download**: Remove everything first (for major changes)
- **Handover**: Gradual transition between versions

## Architecture

### Simplified Design

This standalone version uses stub implementations for external dependencies like:
- Database operations (replaced with in-memory or no-op stubs)
- Docker API calls (stubbed for demonstration)
- System configuration (using defaults)
- Logging infrastructure (console-based)

### Extension Points

To use this in production, you would need to implement:

1. **Docker Integration**: Replace stubs in `stubs.ts` with real Docker API calls using `dockerode`
2. **Database**: Implement actual persistence for target state and configuration
3. **Network Layer**: Implement real network management
4. **Volume Management**: Implement real volume lifecycle management
5. **Image Management**: Implement real image download, delta updates, and cleanup
6. **Service Manager**: Implement actual container lifecycle management
7. **Logging**: Integrate with your logging infrastructure

## API Reference

### Main Functions

#### `initialized(): Promise<void>`
Initializes the application manager. Must be called before other operations.

#### `getCurrentApps(): Promise<InstancedAppState>`
Returns the current state of all applications.

#### `getTargetApps(): Promise<TargetApps>`
Returns the desired target state for applications.

#### `getRequiredSteps(currentApps, targetApps, keepImages?, keepVolumes?, force?): Promise<CompositionStep[]>`
Calculates the steps needed to transition from current to target state.

Parameters:
- `currentApps`: Current application state
- `targetApps`: Desired application state
- `keepImages`: Don't remove unused images (optional, default: false)
- `keepVolumes`: Don't remove unused volumes (optional, default: false)
- `force`: Force updates even if locked (optional, default: false)

#### `executeStep(step, options?): Promise<void>`
Executes a single composition step.

#### `setTarget(apps, source, transaction): Promise<void>`
Sets the target state for applications.

#### `getState(): Promise<AppState>`
Returns the current state formatted for reporting.

### Events

The application manager emits the following events:

- `change`: Emitted when application state changes

## Development

### Project Setup

1. Clone or extract to a separate folder
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Watch mode: `npm run watch`

### Testing

Currently, this is a demonstration extraction. To make it production-ready:

1. Implement actual Docker operations
2. Add comprehensive unit tests
3. Add integration tests with real Docker daemon
4. Implement error handling and retry logic
5. Add monitoring and observability

## Limitations

This standalone version is a simplified extraction that:
- Uses stub implementations for external dependencies
- Lacks full error handling
- Doesn't include all features of the original Balena Supervisor
- Requires additional work to be production-ready

## Original Source

This code is extracted from the [Balena Supervisor](https://github.com/balena-os/balena-supervisor), which is licensed under Apache 2.0.

## License

Apache-2.0

## Contributing

This is an extraction for standalone use. If you want to contribute to the full Balena Supervisor, visit the [official repository](https://github.com/balena-os/balena-supervisor).

## Next Steps

To make this production-ready:

1. **Implement Real Docker Operations**
   - Replace stub service manager with actual dockerode calls
   - Implement container lifecycle management
   - Handle Docker API errors properly

2. **Add Persistence**
   - Implement database layer for target state
   - Store application metadata
   - Track update history

3. **Network & Volume Management**
   - Implement real network creation/deletion
   - Handle volume lifecycle properly
   - Manage network configurations

4. **Image Management**
   - Implement image download with progress
   - Add delta update support
   - Implement image cleanup policies

5. **Testing & Validation**
   - Add comprehensive test suite
   - Implement integration tests
   - Add performance benchmarks

6. **Production Hardening**
   - Add proper error handling
   - Implement retry logic
   - Add logging and monitoring
   - Handle edge cases

## Support

For questions about the original Balena Supervisor, visit [Balena Forums](https://forums.balena.io/).
