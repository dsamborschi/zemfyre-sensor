-- Migration: Create Device Traffic Stats Table
-- Description: Time-series table for tracking device API traffic metrics
-- Author: System
-- Date: 2025-10-31

-- ============================================================================
-- Create device_traffic_stats table
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_traffic_stats (
  id SERIAL PRIMARY KEY,
  device_id UUID NOT NULL,
  endpoint VARCHAR(500) NOT NULL,
  method VARCHAR(10) NOT NULL,
  time_bucket TIMESTAMP NOT NULL,  -- Hourly time bucket for aggregation
  request_count INTEGER DEFAULT 0,
  total_bytes BIGINT DEFAULT 0,
  total_time DOUBLE PRECISION DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status_codes JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_traffic_entry UNIQUE(device_id, endpoint, method, time_bucket)
);

-- ============================================================================
-- Create indexes for efficient querying
-- ============================================================================

-- Index for querying by device and time (most common query pattern)
CREATE INDEX idx_traffic_device_time ON device_traffic_stats(device_id, time_bucket DESC);

-- Index for querying by time only (for aggregate queries)
CREATE INDEX idx_traffic_time ON device_traffic_stats(time_bucket DESC);

-- Index for querying by device and endpoint
CREATE INDEX idx_traffic_device_endpoint ON device_traffic_stats(device_id, endpoint);

-- Index for JSON status codes queries
CREATE INDEX idx_traffic_status_codes ON device_traffic_stats USING GIN(status_codes);

-- ============================================================================
-- Add comments for documentation
-- ============================================================================

COMMENT ON TABLE device_traffic_stats IS 'Time-series storage for device API traffic metrics, aggregated by hour';
COMMENT ON COLUMN device_traffic_stats.device_id IS 'UUID of the device making the requests';
COMMENT ON COLUMN device_traffic_stats.endpoint IS 'API endpoint path (e.g., /api/v1/devices/:uuid/state)';
COMMENT ON COLUMN device_traffic_stats.method IS 'HTTP method (GET, POST, PUT, DELETE, PATCH)';
COMMENT ON COLUMN device_traffic_stats.time_bucket IS 'Hourly time bucket for aggregating metrics (truncated to hour)';
COMMENT ON COLUMN device_traffic_stats.request_count IS 'Total number of requests in this time bucket';
COMMENT ON COLUMN device_traffic_stats.total_bytes IS 'Total bytes transferred (response size)';
COMMENT ON COLUMN device_traffic_stats.total_time IS 'Total response time in milliseconds';
COMMENT ON COLUMN device_traffic_stats.success_count IS 'Number of successful requests (2xx status)';
COMMENT ON COLUMN device_traffic_stats.failed_count IS 'Number of failed requests (non-2xx status)';
COMMENT ON COLUMN device_traffic_stats.status_codes IS 'JSON object mapping status codes to counts, e.g., {"200": 15, "304": 5}';

-- ============================================================================
-- Create function to automatically update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_traffic_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER traffic_stats_updated_at
  BEFORE UPDATE ON device_traffic_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_traffic_stats_updated_at();

-- ============================================================================
-- Grant permissions (assuming postgres user and application user)
-- ============================================================================

-- Grant to postgres user (admin)
GRANT ALL PRIVILEGES ON device_traffic_stats TO postgres;
GRANT USAGE, SELECT ON SEQUENCE device_traffic_stats_id_seq TO postgres;

-- Grant to application user (if different from postgres)
-- Uncomment and modify if you have a specific application user
-- GRANT SELECT, INSERT, UPDATE ON device_traffic_stats TO app_user;
-- GRANT USAGE, SELECT ON SEQUENCE device_traffic_stats_id_seq TO app_user;

-- ============================================================================
-- Add retention policy helper function (optional)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_traffic_stats(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM device_traffic_stats
  WHERE time_bucket < NOW() - (retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_traffic_stats IS 'Deletes traffic stats older than specified days (default 90). Returns count of deleted rows.';

-- Example usage: SELECT cleanup_old_traffic_stats(90);
