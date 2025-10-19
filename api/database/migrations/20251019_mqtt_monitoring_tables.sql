-- MQTT Monitoring Tables
-- Stores topic schemas and statistics persistently

-- Table: mqtt_topics
-- Stores discovered MQTT topics with their schemas and metadata
CREATE TABLE IF NOT EXISTS mqtt_topics (
    id SERIAL PRIMARY KEY,
    topic VARCHAR(500) UNIQUE NOT NULL,
    message_type VARCHAR(20) CHECK (message_type IN ('json', 'xml', 'string', 'binary')),
    schema JSONB,
    last_message TEXT,
    message_count INTEGER DEFAULT 0,
    qos INTEGER,
    retain BOOLEAN,
    first_seen TIMESTAMP DEFAULT NOW(),
    last_seen TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast topic lookups
CREATE INDEX IF NOT EXISTS idx_mqtt_topics_topic ON mqtt_topics(topic);
CREATE INDEX IF NOT EXISTS idx_mqtt_topics_message_type ON mqtt_topics(message_type);
CREATE INDEX IF NOT EXISTS idx_mqtt_topics_last_seen ON mqtt_topics(last_seen);

-- Table: mqtt_topic_hierarchy
-- Stores the hierarchical topic tree structure
CREATE TABLE IF NOT EXISTS mqtt_topic_hierarchy (
    id SERIAL PRIMARY KEY,
    topic_path VARCHAR(500) UNIQUE NOT NULL,
    parent_path VARCHAR(500),
    level INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    messages_counter INTEGER DEFAULT 0,
    topics_counter INTEGER DEFAULT 0,
    last_message TEXT,
    message_type VARCHAR(20),
    schema JSONB,
    qos INTEGER,
    retain BOOLEAN,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (parent_path) REFERENCES mqtt_topic_hierarchy(topic_path) ON DELETE CASCADE
);

-- Index for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_mqtt_hierarchy_parent ON mqtt_topic_hierarchy(parent_path);
CREATE INDEX IF NOT EXISTS idx_mqtt_hierarchy_level ON mqtt_topic_hierarchy(level);

-- Table: mqtt_broker_stats
-- Stores broker statistics snapshots over time
CREATE TABLE IF NOT EXISTS mqtt_broker_stats (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW(),
    
    -- Connection stats
    connected_clients INTEGER,
    disconnected_clients INTEGER,
    total_clients INTEGER,
    subscriptions INTEGER,
    retained_messages INTEGER,
    
    -- Message stats
    messages_sent BIGINT,
    messages_received BIGINT,
    messages_published BIGINT,
    messages_dropped BIGINT,
    
    -- Throughput (bytes)
    bytes_sent BIGINT,
    bytes_received BIGINT,
    
    -- Calculated metrics
    message_rate_published DECIMAL(10, 2),
    message_rate_received DECIMAL(10, 2),
    throughput_inbound DECIMAL(10, 2),
    throughput_outbound DECIMAL(10, 2),
    
    -- Raw $SYS data
    sys_data JSONB,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_mqtt_stats_timestamp ON mqtt_broker_stats(timestamp DESC);

-- Table: mqtt_topic_metrics
-- Stores per-topic metrics history
CREATE TABLE IF NOT EXISTS mqtt_topic_metrics (
    id SERIAL PRIMARY KEY,
    topic VARCHAR(500) NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW(),
    message_count INTEGER DEFAULT 0,
    bytes_received BIGINT DEFAULT 0,
    message_rate DECIMAL(10, 2),
    avg_message_size INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (topic) REFERENCES mqtt_topics(topic) ON DELETE CASCADE
);

-- Index for topic metrics queries
CREATE INDEX IF NOT EXISTS idx_mqtt_topic_metrics_topic ON mqtt_topic_metrics(topic);
CREATE INDEX IF NOT EXISTS idx_mqtt_topic_metrics_timestamp ON mqtt_topic_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_mqtt_topic_metrics_topic_timestamp ON mqtt_topic_metrics(topic, timestamp DESC);

-- Table: mqtt_schema_history
-- Stores schema evolution over time
CREATE TABLE IF NOT EXISTS mqtt_schema_history (
    id SERIAL PRIMARY KEY,
    topic VARCHAR(500) NOT NULL,
    schema JSONB NOT NULL,
    schema_hash VARCHAR(64) NOT NULL,  -- MD5 hash of schema for change detection
    detected_at TIMESTAMP DEFAULT NOW(),
    sample_message TEXT,
    FOREIGN KEY (topic) REFERENCES mqtt_topics(topic) ON DELETE CASCADE
);

-- Index for schema history
CREATE INDEX IF NOT EXISTS idx_mqtt_schema_history_topic ON mqtt_schema_history(topic);
CREATE INDEX IF NOT EXISTS idx_mqtt_schema_history_detected ON mqtt_schema_history(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_mqtt_schema_history_hash ON mqtt_schema_history(schema_hash);

-- View: mqtt_topics_with_stats
-- Combines topic info with latest metrics
CREATE OR REPLACE VIEW mqtt_topics_with_stats AS
SELECT 
    t.id,
    t.topic,
    t.message_type,
    t.schema,
    t.last_message,
    t.message_count,
    t.qos,
    t.retain,
    t.first_seen,
    t.last_seen,
    m.message_rate,
    m.avg_message_size,
    m.bytes_received
FROM mqtt_topics t
LEFT JOIN LATERAL (
    SELECT 
        message_rate,
        avg_message_size,
        bytes_received
    FROM mqtt_topic_metrics
    WHERE topic = t.topic
    ORDER BY timestamp DESC
    LIMIT 1
) m ON true;

-- View: mqtt_broker_stats_latest
-- Gets the most recent broker statistics
CREATE OR REPLACE VIEW mqtt_broker_stats_latest AS
SELECT *
FROM mqtt_broker_stats
ORDER BY timestamp DESC
LIMIT 1;

-- Function: update_mqtt_topic_timestamp
-- Automatically updates the updated_at timestamp
CREATE OR REPLACE FUNCTION update_mqtt_topic_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_seen = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Update timestamp on mqtt_topics
CREATE TRIGGER mqtt_topics_update_timestamp
BEFORE UPDATE ON mqtt_topics
FOR EACH ROW
EXECUTE FUNCTION update_mqtt_topic_timestamp();

-- Trigger: Update timestamp on mqtt_topic_hierarchy
CREATE TRIGGER mqtt_hierarchy_update_timestamp
BEFORE UPDATE ON mqtt_topic_hierarchy
FOR EACH ROW
EXECUTE FUNCTION update_mqtt_topic_timestamp();

-- Function: cleanup_old_metrics
-- Removes metrics older than retention period
CREATE OR REPLACE FUNCTION cleanup_old_mqtt_metrics(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM mqtt_broker_stats
    WHERE timestamp < NOW() - INTERVAL '1 day' * retention_days;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    DELETE FROM mqtt_topic_metrics
    WHERE timestamp < NOW() - INTERVAL '1 day' * retention_days;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE mqtt_topics IS 'Stores discovered MQTT topics with schemas and metadata';
COMMENT ON TABLE mqtt_topic_hierarchy IS 'Hierarchical structure of MQTT topics';
COMMENT ON TABLE mqtt_broker_stats IS 'Time-series broker statistics';
COMMENT ON TABLE mqtt_topic_metrics IS 'Per-topic performance metrics';
COMMENT ON TABLE mqtt_schema_history IS 'Schema evolution tracking';
COMMENT ON VIEW mqtt_topics_with_stats IS 'Topics combined with latest metrics';
COMMENT ON VIEW mqtt_broker_stats_latest IS 'Most recent broker statistics';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO your_api_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_api_user;
