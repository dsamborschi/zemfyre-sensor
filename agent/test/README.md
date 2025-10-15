# Agent Test Suite

This directory contains tests for the device agent with a clear separation between unit and integration tests.

## Test Structure

```
test/
├── unit/                           # Pure unit tests (mocked dependencies)
│   └── device-manager.unit.spec.ts
├── integration/                    # Integration tests (real database, mocked APIs)
│   └── provisioning.integration.spec.ts
├── setup.ts                        # Global test setup (mocks fetch)
└── tsconfig.json                   # TypeScript config for tests
```

## Test Types

### Unit Tests (`test/unit/`)

**Purpose**: Test business logic in isolation

**Characteristics**:
- ✅ All external dependencies mocked (database, network, file system)
- ✅ Fast execution (milliseconds)
- ✅ No side effects
- ✅ Test pure functions and business logic
- ✅ Can run in any environment

**Example**:
```typescript
// Mocks database completely
jest.mock('../../src/db', () => ({
  getKnex: jest.fn(() => mockDb)
}));

it('should generate valid UUIDv4', async () => {
  await deviceManager.initialize();
  expect(deviceInfo.uuid).toMatch(/^[0-9a-f]{8}-...-[0-9a-f]{12}$/i);
});
```

**Run**:
```bash
npm run test:unit              # Run once
npm run test:watch:unit        # Watch mode
npm run test:coverage:unit     # With coverage
```

### Integration Tests (`test/integration/`)

**Purpose**: Test component integration with real dependencies

**Characteristics**:
- ✅ Real database (SQLite)
- ✅ Mocked external APIs (fetch)
- ✅ Tests data persistence
- ✅ Tests end-to-end workflows
- ⚠️  Slower execution
- ⚠️  Requires database setup/teardown

**Example**:
```typescript
// Uses real database
const db = getKnex();

beforeEach(async () => {
  await db('device').del();  // Real DB cleanup
});

it('should persist device to database', async () => {
  await deviceManager.initialize();
  const rows = await db('device').select('*');  // Real DB query
  expect(rows).toHaveLength(1);
});
```

**Run**:
```bash
npm run test:integration              # Run once
npm run test:watch:integration        # Watch mode
npm run test:coverage:integration     # With coverage
```

## Running Tests

### All Tests (Unit + Integration)
```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

### Specific Test Suites
```bash
# Unit tests only (fastest, recommended for TDD)
npm run test:unit

# Integration tests only (when testing data persistence)
npm run test:integration
```

### CI/CD
```bash
# Run all tests with coverage in CI
npm run test:coverage

# Or run separately
npm run test:coverage:unit
npm run test:coverage:integration
```

## Coverage Reports

Coverage is generated separately for each test type:
- `coverage/unit/` - Unit test coverage
- `coverage/integration/` - Integration test coverage
- `coverage/` - Combined coverage (when running all tests)

## Writing Tests

### When to Write Unit Tests

- Testing pure functions
- Testing business logic
- Testing validation
- Testing data transformation
- Testing error handling
- When you need fast feedback

### When to Write Integration Tests

- Testing database operations
- Testing API integration workflows
- Testing multi-step processes
- Testing state persistence
- When you need confidence in real behavior

## Best Practices

1. **Start with unit tests** - They're faster and easier to debug
2. **Mock external dependencies** in unit tests - Database, network, file system
3. **Use integration tests sparingly** - Only for critical paths that need real dependencies
4. **Clean up after integration tests** - Always reset database state
5. **Use descriptive test names** - "should do X when Y"
6. **One assertion per test** - Makes failures easier to diagnose
7. **Arrange-Act-Assert pattern** - Setup, execute, verify

## Examples

### Unit Test Template
```typescript
describe('MyClass - Feature (Unit)', () => {
  it('should do something', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = myFunction(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

### Integration Test Template
```typescript
describe('MyClass - Feature (Integration)', () => {
  beforeEach(async () => {
    await db('table').del();
  });
  
  it('should persist data', async () => {
    // Arrange
    const data = { name: 'test' };
    
    // Act
    await saveToDb(data);
    
    // Assert
    const rows = await db('table').select('*');
    expect(rows[0].name).toBe('test');
  });
});
```

## Troubleshooting

### Tests are slow
- Run unit tests only: `npm run test:unit`
- Use watch mode for faster feedback: `npm run test:watch:unit`
- Check if you're running integration tests unnecessarily

### Database connection errors
- Make sure you're in the integration test directory
- Check that database cleanup is happening in `beforeEach`
- Verify SQLite is installed

### Mock not working
- Ensure mocks are at the top of the file
- Use `jest.clearAllMocks()` in `beforeEach`
- Check mock implementation matches the interface

## Configuration Files

- `jest.config.js` - Main config (runs both unit + integration)
- `jest.config.unit.js` - Unit tests only
- `jest.config.integration.js` - Integration tests only
- `test/tsconfig.json` - TypeScript config for tests
- `test/setup.ts` - Global setup (mocks fetch)
