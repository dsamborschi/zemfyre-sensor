-- Migration: Fix device_api_key_history trigger to avoid null key_hash errors
-- Created: 2025-10-19
-- Purpose: Only archive device API key if old key_hash is not null

-- Update the archive_device_api_key function to check for null
CREATE OR REPLACE FUNCTION archive_device_api_key()
RETURNS TRIGGER AS $$
BEGIN
    -- Only archive if key actually changed AND old key is not null
    IF OLD.device_api_key_hash IS DISTINCT FROM NEW.device_api_key_hash AND OLD.device_api_key_hash IS NOT NULL THEN
        INSERT INTO device_api_key_history (
            device_uuid,
            key_hash,
            issued_at,
            expires_at,
            is_active
        ) VALUES (
            OLD.uuid,
            OLD.device_api_key_hash,
            OLD.api_key_last_rotated_at,
            OLD.api_key_expires_at,
            false  -- Old key is no longer active
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- No need to recreate the trigger, just update the function
-- If you want to force recreation, uncomment below:
-- DROP TRIGGER IF EXISTS trigger_archive_device_api_key ON devices;
-- CREATE TRIGGER trigger_archive_device_api_key
--     BEFORE UPDATE OF device_api_key_hash ON devices
--     FOR EACH ROW
--     WHEN (OLD.device_api_key_hash IS DISTINCT FROM NEW.device_api_key_hash)
--     EXECUTE FUNCTION archive_device_api_key();
