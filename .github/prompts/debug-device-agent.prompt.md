---
mode: agent
---

# Debug Device Agent TypeScript Build and Runtime Issues

## Context
The device agent is a TypeScript/Node.js application that manages Docker containers. Common issues include build failures, module resolution, and Docker integration problems.

## Common Issues

### 1. TypeScript Build Failures
- **Symptom**: TSC compilation errors, type mismatches
- **Check**: TypeScript version (`npm list typescript`)
- **Fix**: Clean rebuild (`npm run clean && npm run build`)

### 2. Module Not Found Errors
- **Symptom**: `Cannot find module` at runtime
- **Cause**: Missing dependencies or incorrect paths
- **Fix**: 
  - Check `tsconfig.json` paths configuration
  - Verify `package.json` dependencies
  - Run `npm install`

### 3. Docker Permission Issues
- **Symptom**: `Error: connect EACCES /var/run/docker.sock`
- **Fix**:
  - Ensure `/var/run/docker.sock` is mounted in docker-compose
  - Run with `privileged: true`
  - Set `USE_REAL_DOCKER=true` environment variable

### 4. Database Migration Failures
- **Symptom**: Knex migration errors
- **Check**: `agent/knexfile.js` configuration
- **Fix**: 
  - Verify DATABASE_PATH is set correctly
  - Run `npx knex migrate:latest`
  - Check SQLite file permissions

## Development Commands

```bash
cd agent

# Build
npm run build              # Compile TypeScript
npm run watch              # Watch mode for development
npm run clean              # Clean dist/ directory

# Run
npm run dev                # Development with ts-node
npm run start:device       # Production mode (requires built dist/)
USE_REAL_DOCKER=true npm run dev  # Dev mode with real Docker

# Database
npx knex migrate:latest    # Run pending migrations
npx knex migrate:make name # Create new migration

# Testing
npm test                   # Run tests
npx tsx test/simple-test.ts  # Run specific test
```

## Task

Debug and fix device agent build or runtime issues:
1. Check TypeScript compilation errors in `npm run build`
2. Verify all dependencies are installed
3. Check module resolution paths in tsconfig.json
4. Test Docker integration with `USE_REAL_DOCKER=true`
5. Verify database migrations run successfully
6. Check environment variables are set correctly
7. Test Device API endpoints (port 48484)

## Key Files
- `agent/package.json` - Dependencies and scripts
- `agent/tsconfig.json` - TypeScript configuration
- `agent/knexfile.js` - Database configuration
- `agent/src/supervisor.ts` - Main entry point
- `agent/src/container-manager.ts` - Docker operations
- `agent/src/device-api/` - HTTP API endpoints

## Success Criteria
- `npm run build` completes without errors
- Agent starts successfully in dev mode
- Device API responds on http://localhost:48484
- Docker operations work (if USE_REAL_DOCKER=true)
- Database migrations complete successfully
- All tests pass
