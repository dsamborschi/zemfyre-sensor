# State Management Unit Tests

Comprehensive unit tests for the agent's state management functionality, covering target state polling, current state reporting, and config handling.

## Test Coverage

### 1. `api-binder.unit.spec.ts` - API Communication
Tests for `ApiBinder` class focusing on state synchronization with the cloud API.

**Test Suites:**
- **Target State Polling** (8 tests)
  - ✅ Fetch target state with apps and config
  - ✅ Handle 304 Not Modified (ETag cached)
  - ✅ Handle empty target state
  - ✅ Detect config changes
  - ✅ No false positives when config unchanged
  - ✅ API error handling
  - ✅ Timeout handling

- **Current State Reporting** (5 tests)
  - ✅ Report state with apps and config
  - ✅ Include metrics when interval elapsed
  - ✅ Handle empty/undefined config
  - ✅ Skip reporting if not provisioned

- **State Diff Calculation** (4 tests)
  - ✅ Detect app additions
  - ✅ Detect app removals
  - ✅ Detect config changes
  - ✅ No changes when identical

- **ETag Handling** (3 tests)
  - ✅ Send If-None-Match header
  - ✅ Update ETag on new state
  - ✅ No header on first poll

- **Config Lifecycle** (1 integration test)
  - ✅ Complete flow: fetch → store → report

**Total:** 21 tests

### 2. `container-manager.unit.spec.ts` - State Management
Tests for `ContainerManager` class focusing on state storage and reconciliation.

**Test Suites:**
- **SimpleState Interface** (2 tests)
  - ✅ Includes apps and config
  - ✅ Config is optional

- **setTarget()** (3 tests)
  - ✅ Store apps and config
  - ✅ Handle empty config
  - ✅ Update existing state

- **getCurrentState()** (3 tests)
  - ✅ Include config from target
  - ✅ Handle missing config
  - ✅ Deep clone (no references)

- **getTargetState()** (1 test)
  - ✅ Return complete state

- **State Reconciliation** (4 tests)
  - ✅ Detect apps to start
  - ✅ Detect apps to stop
  - ✅ No changes when matched
  - ✅ Detect config modifications

- **Config Handling** (2 tests)
  - ✅ Preserve config when apps change
  - ✅ Update config without affecting apps

- **Mock Docker Sync** (2 tests)
  - ✅ Build state from containers
  - ✅ Handle empty container list

- **Edge Cases** (4 tests)
  - ✅ Undefined config
  - ✅ Null config
  - ✅ Deeply nested config
  - ✅ Large config objects

- **Performance** (1 test)
  - ✅ Efficient state comparison

**Total:** 22 tests

## Running Tests

### Run All State Tests
```bash
npm run test -- test/unit/state
```

### Run Specific Test File
```bash
# API Binder tests
npm run test -- test/unit/state/api-binder.unit.spec.ts

# Container Manager tests
npm run test -- test/unit/state/container-manager.unit.spec.ts
```

### Watch Mode (TDD)
```bash
npm run test:watch:unit -- test/unit/state
```

### Coverage Report
```bash
npm run test:coverage:unit -- test/unit/state
```

## Test Philosophy

### Pure Unit Tests
- ✅ **No real network calls** - All `fetch()` mocked
- ✅ **No real Docker** - All Docker operations mocked
- ✅ **No external dependencies** - Everything isolated
- ✅ **Fast execution** - Tests run in milliseconds
- ✅ **Deterministic** - Same input = same output

### What We Test
1. **Logic correctness** - State diff calculation, change detection
2. **Data structures** - Config handling, nested objects
3. **Edge cases** - Empty states, null/undefined, large payloads
4. **Error handling** - Network errors, timeouts, missing data
5. **Performance** - String comparison efficiency

### What We Don't Test
- ❌ Real Docker container operations (integration tests)
- ❌ Real network HTTP requests (integration tests)
- ❌ Database interactions (integration tests)
- ❌ File system operations (integration tests)

## Mocking Strategy

### Global Mocks
```typescript
// Mock fetch for API tests
global.fetch = jest.fn();
```

### Component Mocks
```typescript
// Mock ContainerManager
const mockContainerManager = {
  setTarget: jest.fn(),
  getCurrentState: jest.fn(),
  on: jest.fn(),
};

// Mock DeviceManager
const mockDeviceManager = {
  getDeviceInfo: jest.fn(() => ({
    uuid: 'test-device-uuid',
    provisioned: true,
  })),
};
```

### Docker Mocks
```typescript
// Mock DockerManager
const mockDockerManager = {
  listManagedContainers: jest.fn(),
  inspectContainer: jest.fn(),
  pullImage: jest.fn(),
  createContainer: jest.fn(),
};
```

## Key Test Scenarios

### 1. Config Addition Detection
```typescript
// Old: { apps: {...}, config: {} }
// New: { apps: {...}, config: { mqtt: {...} } }
// Expected: State change detected ✅
```

### 2. ETag Caching
```typescript
// First poll: No ETag → Fetch full state
// Second poll: ETag sent → 304 Not Modified
// Third poll (after update): ETag mismatch → 200 with new state
```

### 3. Config Lifecycle
```typescript
// 1. Fetch from API: { config: { mqtt: {...} } }
// 2. Store in targetState
// 3. Include in getCurrentState()
// 4. Report back to API
// Result: Config synchronized ✅
```

### 4. State Reconciliation
```typescript
// Target: { apps: { 1, 2 } }
// Current: { apps: { 1 } }
// Action: Start app 2 ✅
```

## Expected Results

All tests should pass:
```
PASS test/unit/state/api-binder.unit.spec.ts
  ApiBinder - State Management
    Target State Polling
      ✓ should fetch target state and detect config changes (5ms)
      ✓ should handle 304 Not Modified response (2ms)
      ... (19 more)
    
PASS test/unit/state/container-manager.unit.spec.ts
  ContainerManager - State Management
    SimpleState Interface
      ✓ should include apps and config fields (1ms)
      ... (21 more)

Test Suites: 2 passed, 2 total
Tests:       43 passed, 43 total
Snapshots:   0 total
Time:        2.145s
```

## Troubleshooting

### Tests Fail with "Cannot find module"
```bash
# Install dependencies
npm install

# Rebuild TypeScript
npm run build
```

### Tests Timeout
- Check for missing `await` keywords
- Ensure all mocks return resolved Promises
- Verify no actual network/Docker calls

### Coverage Too Low
- Add tests for error paths
- Test edge cases (null, undefined, empty)
- Test boundary conditions

## Next Steps

### Integration Tests
Create separate integration tests for:
- Real Docker container operations
- Real API communication
- Database state persistence
- End-to-end state synchronization

### Performance Tests
- Measure state comparison speed with large objects
- Test memory usage with many apps
- Benchmark JSON serialization performance

### Stress Tests
- 100+ apps in target state
- Rapid state changes
- Network failures and retries
