-- Create Redis Image Update Policy
-- This policy will manage updates for any Redis images

INSERT INTO image_update_policies (
  image_pattern,
  update_strategy,
  staged_batches,
  batch_delay_minutes,
  health_check_enabled,
  health_check_config,
  health_check_timeout_seconds,
  auto_rollback_enabled,
  max_failure_rate,
  enabled,
  description
) VALUES (
  'redis:*',                    -- Match any redis image with any tag
  'staged',                     -- Use staged rollout strategy
  3,                            -- 3 batches (10%, 50%, 100%)
  5,                            -- 5 minutes delay between batches
  true,                         -- Enable health checks
  '{"type": "tcp", "host": "{device_ip}", "port": 6379}'::jsonb,  -- Redis TCP check
  300,                          -- 5 minute timeout for health checks
  true,                         -- Enable automatic rollback on failures
  0.20,                         -- Pause if > 20% failure rate
  true,                         -- Policy is enabled
  'Automatic updates for Redis database images'
) ON CONFLICT DO NOTHING;

-- Verify the policy was created
SELECT id, image_pattern, update_strategy, health_check_enabled, enabled 
FROM image_update_policies 
WHERE image_pattern = 'redis:*';
