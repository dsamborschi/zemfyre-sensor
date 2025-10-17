-- Clean up approval requests created by image monitor during testing
-- This removes all approval requests with source='image_monitor' that are still pending

BEGIN;

-- Show what will be deleted
SELECT 
    COUNT(*) as total_monitor_requests,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_requests
FROM image_approval_requests 
WHERE source = 'image_monitor';

-- Delete pending approval requests created by monitor
DELETE FROM image_approval_requests 
WHERE source = 'image_monitor' 
  AND status = 'pending';

-- Show results
SELECT 
    COUNT(*) as remaining_monitor_requests
FROM image_approval_requests 
WHERE source = 'image_monitor';

COMMIT;

-- Show current monitoring status
SELECT 
    id,
    image_name,
    watch_for_updates,
    last_checked_at,
    next_check_at
FROM images
WHERE watch_for_updates = true
ORDER BY image_name;
