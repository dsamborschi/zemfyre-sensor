-- ============================================================================
-- SOLUTION: Use Direct Assignment Instead of Merge (||)
-- ============================================================================
-- The || operator merges objects, but if app 1001 already exists with 
-- similar content, PostgreSQL might not detect it as a change.
-- ============================================================================

-- ✅ BETTER: Use direct assignment
UPDATE device_target_state
SET 
    apps = '{"1001": {
        "appId": 1001,
        "appName": "monitoring",
        "services": [
            {
                "serviceId": 1,
                "serviceName": "nginx",
                "imageName": "nginx:alpine",
                "appId": 1001,
                "appName": "my-nginx-test",
                "config": {
                    "image": "nginx:alpine",
                    "ports": ["8089:80"],
                    "environment": {
                        "ENV": "production",
                        "UPDATED": "2024-10-14T12:34:56"
                    }
                }
            }
        ]
    }}'::jsonb,
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE device_uuid = '7838cecf-567c-4d54-9e48-62b4471df6bd';

-- Or if you want to keep other apps and only update 1001:
UPDATE device_target_state
SET 
    apps = jsonb_set(
        apps,
        '{1001}',
        '{"appId": 1001, "appName": "monitoring", "services": [...]}'::jsonb
    ),
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE device_uuid = '7838cecf-567c-4d54-9e48-62b4471df6bd';

-- Or change just the port (guaranteed to be different):
UPDATE device_target_state
SET 
    apps = jsonb_set(
        apps,
        '{1001,services,0,config,ports}',
        '["8089:80"]'::jsonb
    ),
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE device_uuid = '7838cecf-567c-4d54-9e48-62b4471df6bd';

-- ============================================================================
-- Quick verification after UPDATE
-- ============================================================================
SELECT 
    version,
    updated_at,
    NOW() - updated_at as age,
    apps
FROM device_target_state
WHERE device_uuid = '7838cecf-567c-4d54-9e48-62b4471df6bd';

-- Expected:
-- version should have incremented
-- updated_at should be < 10 seconds old
-- apps should show your changes
