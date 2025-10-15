-- ============================================================================
-- Cloud API Target State Testing - SQL Examples (PostgreSQL)
-- ============================================================================
-- Database: PostgreSQL (Cloud API)
-- Table: device_target_state
-- 
-- Use these SQL statements to manually test device sync by changing target state
-- from the cloud side (backend testing without frontend)
-- ============================================================================

-- ============================================================================
-- VIEW CURRENT STATE
-- ============================================================================

-- View all devices
SELECT 
    uuid, 
    device_name, 
    device_type,
    is_online,
    last_connectivity_event,
    created_at 
FROM devices 
ORDER BY created_at DESC;

-- View target state for all devices
SELECT 
    d.uuid,
    d.device_name,
    ts.apps,
    ts.config,
    ts.version,
    ts.updated_at
FROM devices d
LEFT JOIN device_target_state ts ON d.uuid = ts.device_uuid
ORDER BY ts.updated_at DESC;

-- View target state for specific device
SELECT 
    device_uuid,
    apps,
    config,
    version,
    created_at,
    updated_at
FROM device_target_state
WHERE device_uuid = 'YOUR_DEVICE_UUID_HERE';

-- View current state for specific device (what device reports)
SELECT 
    device_uuid,
    apps,
    config,
    system_info,
    reported_at
FROM device_current_state
WHERE device_uuid = 'YOUR_DEVICE_UUID_HERE';

-- Compare target vs current state
SELECT 
    d.uuid,
    d.device_name,
    ts.apps as target_apps,
    cs.apps as current_apps,
    ts.version as target_version,
    ts.updated_at as target_updated,
    cs.reported_at as current_reported
FROM devices d
LEFT JOIN device_target_state ts ON d.uuid = ts.device_uuid
LEFT JOIN device_current_state cs ON d.uuid = cs.device_uuid
WHERE d.uuid = 'YOUR_DEVICE_UUID_HERE';

-- ============================================================================
-- INSERT INITIAL TARGET STATE (if device exists but no target state)
-- ============================================================================

-- Example 1: Single NGINX application
INSERT INTO device_target_state (device_uuid, apps, config, version)
VALUES (
    'YOUR_DEVICE_UUID_HERE',
    '{
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
    }'::jsonb,
    '{}'::jsonb,
    1
)
ON CONFLICT (device_uuid) DO UPDATE SET
    apps = EXCLUDED.apps,
    config = EXCLUDED.config,
    version = device_target_state.version + 1,
    updated_at = CURRENT_TIMESTAMP;

-- Example 2: Multiple applications (NGINX + PostgreSQL + Redis)
INSERT INTO device_target_state (device_uuid, apps, config, version)
VALUES (
    'YOUR_DEVICE_UUID_HERE',
    '{
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
        },
        "1003": {
            "appId": 1003,
            "appName": "redis-cache",
            "services": [
                {
                    "serviceId": 1,
                    "serviceName": "redis",
                    "imageName": "redis:7-alpine",
                    "appId": 1003,
                    "appName": "redis-cache",
                    "config": {
                        "image": "redis:7-alpine",
                        "ports": ["6379:6379"]
                    }
                }
            ]
        }
    }'::jsonb,
    '{}'::jsonb,
    1
)
ON CONFLICT (device_uuid) DO UPDATE SET
    apps = EXCLUDED.apps,
    config = EXCLUDED.config,
    version = device_target_state.version + 1,
    updated_at = CURRENT_TIMESTAMP;

-- ============================================================================
-- UPDATE EXISTING TARGET STATE
-- ============================================================================

-- Update 1: Add a new application to existing state
UPDATE device_target_state
SET 
    apps = apps || '{"1004": {
        "appId": 1004,
        "appName": "monitoring",
        "services": [{
            "serviceId": 1,
            "serviceName": "grafana",
            "imageName": "grafana/grafana:latest",
            "appId": 1004,
            "appName": "monitoring",
            "config": {
                "image": "grafana/grafana:latest",
                "ports": ["3000:3000"],
                "environment": {
                    "GF_SECURITY_ADMIN_PASSWORD": "admin"
                }
            }
        }]
    }}'::jsonb,
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE device_uuid = 'YOUR_DEVICE_UUID_HERE';

-- Update 2: Remove an application (remove app 1002)
UPDATE device_target_state
SET 
    apps = apps - '1002',
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE device_uuid = 'YOUR_DEVICE_UUID_HERE';

-- Update 3: Change environment variable for existing service
UPDATE device_target_state
SET 
    apps = jsonb_set(
        apps,
        '{1001,services,0,config,environment,ENV}',
        '"development"'
    ),
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE device_uuid = 'YOUR_DEVICE_UUID_HERE';

-- Update 4: Change port mapping
UPDATE device_target_state
SET 
    apps = jsonb_set(
        apps,
        '{1001,services,0,config,ports}',
        '["8090:80"]'::jsonb
    ),
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE device_uuid = 'YOUR_DEVICE_UUID_HERE';

-- Update 5: Add volume to existing service
UPDATE device_target_state
SET 
    apps = jsonb_set(
        apps,
        '{1001,services,0,config,volumes}',
        '["nginx-data:/usr/share/nginx/html"]'::jsonb
    ),
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE device_uuid = 'YOUR_DEVICE_UUID_HERE';

-- Update 6: Complete replacement of target state
UPDATE device_target_state
SET 
    apps = '{
        "2001": {
            "appId": 2001,
            "appName": "hello-world",
            "services": [{
                "serviceId": 1,
                "serviceName": "hello",
                "imageName": "hello-world:latest",
                "appId": 2001,
                "appName": "hello-world",
                "config": {
                    "image": "hello-world:latest"
                }
            }]
        }
    }'::jsonb,
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE device_uuid = 'YOUR_DEVICE_UUID_HERE';

-- Update 7: Add device configuration (non-app settings)
UPDATE device_target_state
SET 
    config = '{
        "logLevel": "debug",
        "updateInterval": 60,
        "enableTelemetry": true
    }'::jsonb,
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE device_uuid = 'YOUR_DEVICE_UUID_HERE';

-- ============================================================================
-- DELETE TARGET STATE (stop all apps)
-- ============================================================================

-- Option 1: Set target state to empty (all apps will be stopped)
UPDATE device_target_state
SET 
    apps = '{}'::jsonb,
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE device_uuid = 'YOUR_DEVICE_UUID_HERE';

-- Option 2: Delete target state entirely
DELETE FROM device_target_state 
WHERE device_uuid = 'YOUR_DEVICE_UUID_HERE';

-- ============================================================================
-- QUICK TEST SCENARIOS
-- ============================================================================

-- Scenario 1: Deploy single NGINX container
-- First, ensure device exists (get UUID from devices table)
-- Then set target state:
INSERT INTO device_target_state (device_uuid, apps, config, version)
VALUES (
    'YOUR_DEVICE_UUID_HERE',
    '{
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
    }'::jsonb,
    '{}'::jsonb,
    1
)
ON CONFLICT (device_uuid) DO UPDATE SET
    apps = EXCLUDED.apps,
    version = device_target_state.version + 1,
    updated_at = CURRENT_TIMESTAMP;

-- Scenario 2: Update NGINX port from 8080 to 8090
UPDATE device_target_state
SET 
    apps = jsonb_set(
        apps,
        '{1001,services,0,config,ports}',
        '["8090:80"]'::jsonb
    ),
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE device_uuid = 'YOUR_DEVICE_UUID_HERE';

-- Scenario 3: Add second application (Redis) to existing NGINX
UPDATE device_target_state
SET 
    apps = apps || '{
        "1002": {
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
        }
    }'::jsonb,
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE device_uuid = 'YOUR_DEVICE_UUID_HERE';

-- Scenario 4: Deploy different apps to multiple devices
-- Deploy NGINX to device 1
UPDATE device_target_state
SET 
    apps = '{"1001": {"appId": 1001, "appName": "nginx", "services": [{"serviceId": 1, "serviceName": "nginx", "imageName": "nginx:alpine", "appId": 1001, "appName": "nginx", "config": {"image": "nginx:alpine", "ports": ["8080:80"]}}]}}'::jsonb,
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE device_uuid = 'DEVICE_1_UUID';

-- Deploy Redis to device 2
UPDATE device_target_state
SET 
    apps = '{"1002": {"appId": 1002, "appName": "redis", "services": [{"serviceId": 1, "serviceName": "redis", "imageName": "redis:7-alpine", "appId": 1002, "appName": "redis", "config": {"image": "redis:7-alpine", "ports": ["6379:6379"]}}]}}'::jsonb,
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE device_uuid = 'DEVICE_2_UUID';

-- ============================================================================
-- DEBUGGING QUERIES
-- ============================================================================

-- Count apps in target state for each device
SELECT 
    device_uuid,
    jsonb_object_keys(apps) as app_id,
    apps -> jsonb_object_keys(apps) ->> 'appName' as app_name
FROM device_target_state;

-- List all services across all devices
SELECT 
    ts.device_uuid,
    d.device_name,
    jsonb_object_keys(ts.apps) as app_id,
    ts.apps -> jsonb_object_keys(ts.apps) ->> 'appName' as app_name,
    jsonb_array_elements(ts.apps -> jsonb_object_keys(ts.apps) -> 'services') ->> 'serviceName' as service_name,
    jsonb_array_elements(ts.apps -> jsonb_object_keys(ts.apps) -> 'services') ->> 'imageName' as image_name
FROM device_target_state ts
JOIN devices d ON d.uuid = ts.device_uuid;

-- Find devices with specific app
SELECT 
    ts.device_uuid,
    d.device_name,
    ts.apps -> '1001' ->> 'appName' as app_name,
    ts.version
FROM device_target_state ts
JOIN devices d ON d.uuid = ts.device_uuid
WHERE ts.apps ? '1001';  -- Check if app ID 1001 exists

-- Find devices running NGINX
SELECT DISTINCT
    ts.device_uuid,
    d.device_name
FROM device_target_state ts
JOIN devices d ON d.uuid = ts.device_uuid,
     jsonb_each(ts.apps) as app,
     jsonb_array_elements(app.value -> 'services') as service
WHERE service ->> 'imageName' LIKE '%nginx%';

-- Check version history (if you're tracking changes)
SELECT 
    device_uuid,
    version,
    updated_at,
    jsonb_object_keys(apps) as app_ids
FROM device_target_state
ORDER BY updated_at DESC;

-- ============================================================================
-- BULK OPERATIONS
-- ============================================================================

-- Deploy same app to all devices
UPDATE device_target_state
SET 
    apps = apps || '{
        "9999": {
            "appId": 9999,
            "appName": "monitoring-agent",
            "services": [{
                "serviceId": 1,
                "serviceName": "agent",
                "imageName": "monitoring-agent:latest",
                "appId": 9999,
                "appName": "monitoring-agent",
                "config": {
                    "image": "monitoring-agent:latest"
                }
            }]
        }
    }'::jsonb,
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP;

-- Remove specific app from all devices
UPDATE device_target_state
SET 
    apps = apps - '1002',
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP;

-- Stop all apps on all devices
UPDATE device_target_state
SET 
    apps = '{}'::jsonb,
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP;

-- ============================================================================
-- HELPER: Get your device UUID
-- ============================================================================

-- List all device UUIDs (replace YOUR_DEVICE_UUID_HERE with actual UUID)
SELECT uuid, device_name, device_type, is_online FROM devices;

-- If you know device name
SELECT uuid FROM devices WHERE device_name = 'my-device-name';

-- If you need to create a test device first
INSERT INTO devices (uuid, device_name, device_type, is_online)
VALUES (
    uuid_generate_v4(),
    'test-device-1',
    'raspberry-pi-4',
    true
)
RETURNING uuid;

-- ============================================================================
-- USAGE INSTRUCTIONS
-- ============================================================================
/*

1. Connect to PostgreSQL database:
   psql -h localhost -U your_user -d zemfyre_api

2. Get your device UUID:
   SELECT uuid, device_name FROM devices;

3. Replace 'YOUR_DEVICE_UUID_HERE' in the statements above

4. Execute INSERT or UPDATE to change target state

5. The device agent will:
   - Poll for target state changes (every 30s by default)
   - Detect the new target state
   - Calculate diff between current and target
   - Execute reconciliation steps
   - Report current state back to cloud

6. Monitor device sync:
   - Check device logs in cloud API
   - Watch agent logs on device
   - Query device_current_state table to see reported state

7. Verify deployment:
   docker ps  (on device)

IMPORTANT NOTES:
- Version is auto-incremented on each update
- Device agent must be configured with cloud API endpoint
- Agent polls cloud API periodically for target state
- Always use ON CONFLICT clause to handle existing records
- JSONB operators: || (merge), - (remove key), jsonb_set (update nested)

COMMON JSONB OPERATIONS:
- Add key:        apps || '{"key": "value"}'::jsonb
- Remove key:     apps - 'key'
- Update nested:  jsonb_set(apps, '{path,to,key}', '"value"')
- Check key:      apps ? 'key'
- Get value:      apps -> 'key' or apps ->> 'key' (as text)

API ENDPOINT (if using REST):
POST /devices/{uuid}/target-state
GET  /devices/{uuid}/target-state

*/
