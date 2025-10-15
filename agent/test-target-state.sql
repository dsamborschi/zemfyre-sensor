-- ============================================================================
-- Target State Testing - SQL Examples
-- ============================================================================
-- Database: SQLite (agent/data/database.sqlite)
-- Table: stateSnapshot
-- 
-- Use these SQL statements to manually test device sync by changing target state
-- ============================================================================

-- ============================================================================
-- VIEW CURRENT STATE
-- ============================================================================

-- View all state snapshots
SELECT * FROM stateSnapshot ORDER BY createdAt DESC;

-- View current state (what IS running)
SELECT 
    id, 
    type,
    json_extract(state, '$') as state_pretty,
    stateHash,
    createdAt 
FROM stateSnapshot 
WHERE type = 'current';

-- View target state (what SHOULD be running)
SELECT 
    id, 
    type,
    json_extract(state, '$') as state_pretty,
    stateHash,
    createdAt 
FROM stateSnapshot 
WHERE type = 'target';

-- ============================================================================
-- INSERT INITIAL TARGET STATE (if none exists)
-- ============================================================================

-- Example 1: Single NGINX application
INSERT INTO stateSnapshot (type, state, createdAt)
VALUES (
    'target',
    json('{
        "apps": {
            "1001": {
                "appId": 1001,
                "appName": "my-nginx-test",
                "services": [
                    {
                        "serviceId": 1,
                        "serviceName": "nginx",
                        "imageName": "nginx:alpine",
                        "appId": 1001,
                        "appName": "my-nginx-test",
                        "config": {
                            "image": "nginx:alpine",
                            "ports": ["8085:80"],
                            "environment": {
                                "ENV": "production"
                            }
                        }
                    }
                ]
            }
        }
    }'),
    datetime('now')
);

-- Example 2: Multiple applications (NGINX + PostgreSQL)
INSERT INTO stateSnapshot (type, state, createdAt)
VALUES (
    'target',
    json('{
        "apps": {
            "1001": {
                "appId": 1001,
                "appName": "web-server",
                "services": [
                    {
                        "serviceId": 1,
                        "serviceName": "nginx",
                        "imageName": "nginx:alpine",
                        "appId": 1001,
                        "appName": "web-server",
                        "config": {
                            "image": "nginx:alpine",
                            "ports": ["8080:80"]
                        }
                    }
                ]
            },
            "1002": {
                "appId": 1002,
                "appName": "database",
                "services": [
                    {
                        "serviceId": 1,
                        "serviceName": "postgres",
                        "imageName": "postgres:15-alpine",
                        "appId": 1002,
                        "appName": "database",
                        "config": {
                            "image": "postgres:15-alpine",
                            "environment": {
                                "POSTGRES_PASSWORD": "mysecretpassword",
                                "POSTGRES_DB": "testdb"
                            },
                            "volumes": ["postgres-data:/var/lib/postgresql/data"]
                        }
                    }
                ]
            }
        }
    }'),
    datetime('now')
);

-- ============================================================================
-- UPDATE EXISTING TARGET STATE
-- ============================================================================

-- Update 1: Add a new application to existing state
UPDATE stateSnapshot
SET 
    state = json_insert(
        state,
        '$.apps.1003',
        json('{
            "appId": 1003,
            "appName": "redis-cache",
            "services": [{
                "serviceId": 1,
                "serviceName": "redis",
                "imageName": "redis:7-alpine",
                "appId": 1003,
                "appName": "redis-cache",
                "config": {
                    "image": "redis:7-alpine",
                    "ports": ["6379:6379"]
                }
            }]
        }')
    ),
    createdAt = datetime('now')
WHERE type = 'target';

-- Update 2: Remove an application (remove app 1002)
UPDATE stateSnapshot
SET 
    state = json_remove(state, '$.apps.1002'),
    createdAt = datetime('now')
WHERE type = 'target';

-- Update 3: Change environment variable for existing service
UPDATE stateSnapshot
SET 
    state = json_set(
        state,
        '$.apps.1001.services[0].config.environment.ENV',
        'development'
    ),
    createdAt = datetime('now')
WHERE type = 'target';

-- Update 4: Change port mapping
UPDATE stateSnapshot
SET 
    state = json_set(
        state,
        '$.apps.1001.services[0].config.ports',
        json('["8090:80"]')
    ),
    createdAt = datetime('now')
WHERE type = 'target';

-- Update 5: Add volume to existing service
UPDATE stateSnapshot
SET 
    state = json_set(
        state,
        '$.apps.1001.services[0].config.volumes',
        json('["nginx-data:/usr/share/nginx/html"]')
    ),
    createdAt = datetime('now')
WHERE type = 'target';

-- Update 6: Complete replacement of target state (useful for testing)
UPDATE stateSnapshot
SET 
    state = json('{
        "apps": {
            "2001": {
                "appId": 2001,
                "appName": "hello-world",
                "services": [
                    {
                        "serviceId": 1,
                        "serviceName": "hello",
                        "imageName": "hello-world:latest",
                        "appId": 2001,
                        "appName": "hello-world",
                        "config": {
                            "image": "hello-world:latest"
                        }
                    }
                ]
            }
        }
    }'),
    createdAt = datetime('now'),
    stateHash = NULL
WHERE type = 'target';

-- ============================================================================
-- DELETE TARGET STATE (stop all apps)
-- ============================================================================

-- Option 1: Set target state to empty (all apps will be stopped)
UPDATE stateSnapshot
SET 
    state = json('{"apps": {}}'),
    createdAt = datetime('now'),
    stateHash = NULL
WHERE type = 'target';

-- Option 2: Delete target state entirely (agent will recreate empty state)
DELETE FROM stateSnapshot WHERE type = 'target';

-- ============================================================================
-- QUICK TEST SCENARIOS
-- ============================================================================

-- Scenario 1: Deploy single NGINX container
-- Step 1: Clear existing target state
DELETE FROM stateSnapshot WHERE type = 'target';

-- Step 2: Insert new target state
INSERT INTO stateSnapshot (type, state, createdAt)
VALUES (
    'target',
    json('{
        "apps": {
            "1001": {
                "appId": 1001,
                "appName": "test-nginx",
                "services": [{
                    "serviceId": 1,
                    "serviceName": "nginx",
                    "imageName": "nginx:alpine",
                    "appId": 1001,
                    "appName": "test-nginx",
                    "config": {
                        "image": "nginx:alpine",
                        "ports": ["8080:80"]
                    }
                }]
            }
        }
    }'),
    datetime('now')
);

-- Scenario 2: Update NGINX port from 8080 to 8090
UPDATE stateSnapshot
SET 
    state = json_set(
        state,
        '$.apps.1001.services[0].config.ports',
        json('["8090:80"]')
    ),
    createdAt = datetime('now'),
    stateHash = NULL  -- Force hash recalculation
WHERE type = 'target';

-- Scenario 3: Add second application (Redis)
UPDATE stateSnapshot
SET 
    state = json_insert(
        state,
        '$.apps.1002',
        json('{
            "appId": 1002,
            "appName": "redis",
            "services": [{
                "serviceId": 1,
                "serviceName": "redis",
                "imageName": "redis:7-alpine",
                "appId": 1002,
                "appName": "redis",
                "config": {
                    "image": "redis:7-alpine",
                    "ports": ["6379:6379"]
                }
            }]
        }')
    ),
    createdAt = datetime('now'),
    stateHash = NULL
WHERE type = 'target';

-- ============================================================================
-- DEBUGGING QUERIES
-- ============================================================================

-- Count apps in target state
SELECT 
    type,
    json_array_length(json_extract(state, '$.apps')) as app_count
FROM stateSnapshot
WHERE type = 'target';

-- List all app IDs in target state
SELECT 
    type,
    json_each.key as app_id,
    json_extract(json_each.value, '$.appName') as app_name
FROM stateSnapshot, json_each(state, '$.apps')
WHERE type = 'target';

-- List all services in target state
SELECT 
    json_extract(json_each.value, '$.appId') as app_id,
    json_extract(json_each.value, '$.appName') as app_name,
    json_extract(services.value, '$.serviceName') as service_name,
    json_extract(services.value, '$.imageName') as image_name
FROM stateSnapshot, 
     json_each(state, '$.apps'),
     json_each(json_each.value, '$.services') as services
WHERE type = 'target';

-- ============================================================================
-- USAGE INSTRUCTIONS
-- ============================================================================
/*

1. Open the database:
   sqlite3 agent/data/database.sqlite

2. View current state:
   SELECT * FROM stateSnapshot WHERE type = 'target';

3. Make changes using UPDATE statements above

4. The agent will detect changes and automatically:
   - Calculate diff between current and target state
   - Generate steps (download, start, stop containers)
   - Execute steps to reconcile state

5. Monitor the agent logs to see reconciliation in action

6. Check Docker containers:
   docker ps

IMPORTANT NOTES:
- After UPDATE, set stateHash = NULL to force recalculation
- The agent checks for state changes via polling (every 30s by default)
- For immediate reconciliation, restart the agent
- Always use valid JSON in the state column

COMMON ISSUES:
- Invalid JSON: Use json() function to validate
- Wrong appId: Must match between app and services
- Port conflicts: Check existing containers

*/
