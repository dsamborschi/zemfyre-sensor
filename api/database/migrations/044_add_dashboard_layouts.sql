-- Migration 044: Add dashboard layouts table for persistent user dashboard configurations
-- Created: 2025-11-03
-- Description: Stores custom dashboard layouts per user/device with JSON widget configurations

CREATE TABLE IF NOT EXISTS dashboard_layouts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_uuid UUID NOT NULL REFERENCES devices(uuid) ON DELETE CASCADE,
    layout_name VARCHAR(255) DEFAULT 'Default',
    widgets JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique layout names per user/device
    CONSTRAINT unique_layout_name UNIQUE (user_id, device_uuid, layout_name)
);

-- Partial unique index to ensure only one default layout per user/device
CREATE UNIQUE INDEX idx_dashboard_layouts_one_default 
    ON dashboard_layouts(user_id, device_uuid) 
    WHERE is_default = true;

-- Indexes for performance
CREATE INDEX idx_dashboard_layouts_user_device ON dashboard_layouts(user_id, device_uuid);
CREATE INDEX idx_dashboard_layouts_device ON dashboard_layouts(device_uuid);
CREATE INDEX idx_dashboard_layouts_user ON dashboard_layouts(user_id);
CREATE INDEX idx_dashboard_layouts_widgets ON dashboard_layouts USING GIN (widgets);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_dashboard_layouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dashboard_layouts_updated_at
    BEFORE UPDATE ON dashboard_layouts
    FOR EACH ROW
    EXECUTE FUNCTION update_dashboard_layouts_updated_at();

-- Grant permissions (adjust role as needed)
GRANT SELECT, INSERT, UPDATE, DELETE ON dashboard_layouts TO postgres;
GRANT USAGE, SELECT ON SEQUENCE dashboard_layouts_id_seq TO postgres;

-- Add comment
COMMENT ON TABLE dashboard_layouts IS 'Stores custom dashboard widget layouts per user and device';
COMMENT ON COLUMN dashboard_layouts.widgets IS 'JSON array of widget configurations with type, position, size';
COMMENT ON COLUMN dashboard_layouts.is_default IS 'Marks the default layout to load for this user/device combination';
