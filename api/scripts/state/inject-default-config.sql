-- Inject Default Target State Config for Existing Device
-- Device UUID: cad1a747-44e0-4530-87c8-944d4981a42c
-- Run with: kubectl exec -n customer-a18ada74 deployment/customer-a18ada74-customer-instance-api -- psql -U postgres -d iotistic -f /path/to/this/file.sql

-- First, let's see what license data we have (optional, for reference)
\echo 'Current license data:'
SELECT value FROM system_config WHERE key = 'license_data';

\echo ''
\echo 'Current target state (if any):'
SELECT device_uuid, apps, config, version FROM device_target_state WHERE device_uuid = 'cad1a747-44e0-4530-87c8-944d4981a42c';

-- Insert or update default target state
-- Using Professional plan defaults: 30s metrics, cloud jobs enabled
INSERT INTO device_target_state (device_uuid, apps, config, version, updated_at)
VALUES (
  'cad1a747-44e0-4530-87c8-944d4981a42c',
  '{}',
  '{
    "logging": {
      "level": "info",
      "enableRemoteLogging": true
    },
    "features": {
      "enableShadow": true,
      "enableCloudJobs": true,
      "enableMetricsExport": false
    },
    "settings": {
      "metricsIntervalMs": 30000,
      "deviceReportIntervalMs": 20000,
      "stateReportIntervalMs": 10000
    }
  }',
  1,
  CURRENT_TIMESTAMP
)
ON CONFLICT (device_uuid) DO UPDATE SET
  apps = EXCLUDED.apps,
  config = EXCLUDED.config,
  version = device_target_state.version + 1,
  updated_at = CURRENT_TIMESTAMP;

\echo ''
\echo 'Target state created/updated successfully!'
\echo ''
\echo 'New target state:'
SELECT device_uuid, apps, config, version, updated_at FROM device_target_state WHERE device_uuid = 'cad1a747-44e0-4530-87c8-944d4981a42c';
