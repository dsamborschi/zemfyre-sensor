# Running Tests

## Quick Start

### Option 1: Simple Test (Recommended)td

```bash
npm install -D tsx
npx tsx test/simple-test.ts
```

This runs a quick test that:
- ✅ Initializes the application manager
- ✅ Gets current and target apps
- ✅ Calculates required steps
- ✅ Tests event listeners
- ✅ Shows summary stats

### Option 2: Comprehensive Test

```bash
npx tsx test/basic-test.ts
```

This runs a detailed test with:
- Step-by-step execution logging
- Error handling
- Detailed state inspection
- Event tracking
- Full test summary

### Option 3: Example Usage

```bash
npx tsx examples/basic-usage.ts
```

## Test Files

### `test/simple-test.ts`
Quick test to verify basic functionality. Good for development and debugging.

**Output:**
```
🚀 Starting Application Manager Test

📦 Initializing...
✅ Initialized!

📋 Getting current applications...
✅ Current apps: 0

🎯 Getting target applications...
✅ Target apps: 0

🔄 Calculating required steps...
✅ Generated 0 steps

📊 Getting application state...
✅ State: 0 apps

👂 Testing event listener...
✅ Event listener registered

========================================
✨ Test completed successfully!
========================================
Stats:
  - Fetches in progress: 0
  - Time spent fetching: 0ms
========================================
```

### `test/basic-test.ts`
Comprehensive test with detailed logging and error handling.

### `examples/basic-usage.ts`
Example showing practical usage patterns.

## Writing Your Own Test

Create a new test file:

```typescript
import applicationManager from '../src/index';

async function myTest() {
    // Initialize
    await applicationManager.initialized();
    
    // Your test code here
    const apps = await applicationManager.getCurrentApps();
    console.log('Apps:', apps);
    
    // Listen for changes
    applicationManager.on('change', (data) => {
        console.log('State changed:', data);
    });
}

myTest().catch(console.error);
```

Run it:
```bash
npx tsx my-test.ts
```

## What Gets Tested

### ✅ Core Functions
- `initialized()` - Initializes the manager
- `getCurrentApps()` - Gets current app state
- `getTargetApps()` - Gets target app state
- `getRequiredSteps()` - Calculates transition steps
- `executeStep()` - Executes a single step
- `getState()` - Gets detailed state

### ✅ Event System
- `on()` - Register event listeners
- `once()` - One-time event listeners
- `removeListener()` - Unregister listeners
- `removeAllListeners()` - Clear all listeners

### ✅ Utility Functions
- `fetchesInProgress()` - Check active fetches
- `timeSpentFetching()` - Check fetch time
- `resetTimeSpentFetching()` - Reset fetch timer

## Expected Results

Since this is a stub implementation, you'll see:
- ✅ All functions execute without errors
- ✅ Returns empty/default values (no real Docker containers)
- ✅ Event system works correctly
- ✅ All APIs are accessible

## Next Steps

To test with real Docker:
1. Implement real Docker operations in `src/stubs.ts`
2. Connect to a Docker daemon
3. Create test containers
4. Run tests against real state

## Troubleshooting

### "Cannot find module" errors
```bash
npm install
npm run build
```

### TypeScript errors
```bash
npm install -D tsx @types/node
```

### "process is not defined"
The tests use tsx which handles Node.js globals. Make sure you're running with:
```bash
npx tsx test/simple-test.ts
```

Not with:
```bash
node test/simple-test.ts  # Won't work - needs compilation
```
