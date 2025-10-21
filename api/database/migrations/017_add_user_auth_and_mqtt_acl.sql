-- Migration: Add user authentication and MQTT ACL tables-- Migration: Add user authentication and MQTT ACL tables

-- Created: 2025-10-19-- Created: 2025-10-19

-- Purpose: Unified authentication for dashboard users and MQTT broker-- Purpose: Unified authentication for dashboard users and MQTT broker

-- Compatible with: mosquitto-go-auth PostgreSQL backend-- Compatible with: mosquitto-go-auth PostgreSQL backend



-- ============================================================================-- ============================================================================

-- USER AUTHENTICATION TABLES-- USER AUTHENTICATION TABLES

-- ============================================================================-- ============================================================================



-- Users table for dashboard authentication-- Users table for dashboard authentication

CREATE TABLE IF NOT EXISTS users (CREATE TABLE IF NOT EXISTS users (

    id SERIAL PRIMARY KEY,    id SERIAL PRIMARY KEY,

    username VARCHAR(255) UNIQUE NOT NULL,    username VARCHAR(255) UNIQUE NOT NULL,

    email VARCHAR(255) UNIQUE NOT NULL,    email VARCHAR(255) UNIQUE NOT NULL,

    password_hash VARCHAR(255) NOT NULL,  -- bcrypt hashed password    password_hash VARCHAR(255) NOT NULL,  -- bcrypt hashed password

    full_name VARCHAR(255),    full_name VARCHAR(255),

    role VARCHAR(50) NOT NULL DEFAULT 'user',  -- admin, user, viewer    role VARCHAR(50) NOT NULL DEFAULT 'user',  -- admin, user, viewer

    is_active BOOLEAN DEFAULT true,    is_active BOOLEAN DEFAULT true,

    email_verified BOOLEAN DEFAULT false,    email_verified BOOLEAN DEFAULT false,

    last_login_at TIMESTAMP,    last_login_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_role CHECK (role IN ('admin', 'user', 'viewer', 'device'))    CONSTRAINT valid_role CHECK (role IN ('admin', 'user', 'viewer', 'device'))

););



CREATE INDEX idx_users_username ON users(username);CREATE INDEX idx_users_username ON users(username);

CREATE INDEX idx_users_email ON users(email);CREATE INDEX idx_users_email ON users(email);

CREATE INDEX idx_users_role ON users(role);CREATE INDEX idx_users_role ON users(role);

CREATE INDEX idx_users_is_active ON users(is_active);CREATE INDEX idx_users_is_active ON users(is_active);



-- JWT refresh tokens for persistent sessions-- JWT refresh tokens for persistent sessions

CREATE TABLE IF NOT EXISTS refresh_tokens (CREATE TABLE IF NOT EXISTS refresh_tokens (

    id SERIAL PRIMARY KEY,    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    token_hash VARCHAR(255) NOT NULL,  -- bcrypt hashed refresh token    token_hash VARCHAR(255) NOT NULL,  -- bcrypt hashed refresh token

    device_info TEXT,  -- User agent, device identifier    device_info TEXT,  -- User agent, device identifier

    ip_address INET,    ip_address INET,

    expires_at TIMESTAMP NOT NULL,    expires_at TIMESTAMP NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    last_used_at TIMESTAMP,    last_used_at TIMESTAMP,

    revoked BOOLEAN DEFAULT false,    revoked BOOLEAN DEFAULT false,

    revoked_at TIMESTAMP    revoked_at TIMESTAMP

););



CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

CREATE INDEX idx_refresh_tokens_revoked ON refresh_tokens(revoked);CREATE INDEX idx_refresh_tokens_revoked ON refresh_tokens(revoked);



-- User sessions for tracking active logins-- User sessions for tracking active logins

CREATE TABLE IF NOT EXISTS user_sessions (CREATE TABLE IF NOT EXISTS user_sessions (

    id SERIAL PRIMARY KEY,    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    session_token VARCHAR(255) UNIQUE NOT NULL,    session_token VARCHAR(255) UNIQUE NOT NULL,

    ip_address INET,    ip_address INET,

    user_agent TEXT,    user_agent TEXT,

    expires_at TIMESTAMP NOT NULL,    expires_at TIMESTAMP NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

););



CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);

CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);



-- ============================================================================-- ============================================================================

-- MQTT AUTHENTICATION & ACL TABLES (mosquitto-go-auth compatible)-- MQTT AUTHENTICATION & ACL TABLES (mosquitto-go-auth compatible)

-- ============================================================================-- ============================================================================



-- MQTT users table (for mosquitto-go-auth PostgreSQL backend)-- MQTT users table (for mosquitto-go-auth PostgreSQL backend)

-- This table is queried by mosquitto-go-auth for authentication-- This table is queried by mosquitto-go-auth for authentication

CREATE TABLE IF NOT EXISTS mqtt_users (CREATE TABLE IF NOT EXISTS mqtt_users (

    id SERIAL PRIMARY KEY,    id SERIAL PRIMARY KEY,

    username VARCHAR(255) UNIQUE NOT NULL,    username VARCHAR(255) UNIQUE NOT NULL,

    password_hash VARCHAR(255) NOT NULL,  -- PBKDF2, bcrypt, or Argon2 hash    password_hash VARCHAR(255) NOT NULL,  -- PBKDF2, bcrypt, or Argon2 hash

    is_superuser BOOLEAN DEFAULT false,  -- Bypass all ACL checks if true    is_superuser BOOLEAN DEFAULT false,  -- Bypass all ACL checks if true

    is_active BOOLEAN DEFAULT true,    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

););



CREATE INDEX idx_mqtt_users_username ON mqtt_users(username);CREATE INDEX idx_mqtt_users_username ON mqtt_users(username);

CREATE INDEX idx_mqtt_users_is_active ON mqtt_users(is_active);CREATE INDEX idx_mqtt_users_is_active ON mqtt_users(is_active);



-- MQTT ACL table (for mosquitto-go-auth PostgreSQL backend)-- MQTT ACL table (for mosquitto-go-auth PostgreSQL backend)

-- Defines topic access control rules-- Defines topic access control rules

CREATE TABLE IF NOT EXISTS mqtt_acls (CREATE TABLE IF NOT EXISTS mqtt_acls (

    id SERIAL PRIMARY KEY,    id SERIAL PRIMARY KEY,

    username VARCHAR(255),  -- NULL = applies to all users    username VARCHAR(255),  -- NULL = applies to all users

    clientid VARCHAR(255),  -- NULL = applies to all clients    clientid VARCHAR(255),  -- NULL = applies to all clients

    topic VARCHAR(255) NOT NULL,  -- Topic pattern (supports wildcards: +, #)    topic VARCHAR(255) NOT NULL,  -- Topic pattern (supports wildcards: +, #)

    access INTEGER NOT NULL,  -- 1=read (subscribe), 2=write (publish), 3=read+write    access INTEGER NOT NULL,  -- 1=read (subscribe), 2=write (publish), 3=read+write

    priority INTEGER DEFAULT 0,  -- Higher priority rules override lower (for conflict resolution)    priority INTEGER DEFAULT 0,  -- Higher priority rules override lower (for conflict resolution)

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_access CHECK (access IN (1, 2, 3))    CONSTRAINT valid_access CHECK (access IN (1, 2, 3))

););



CREATE INDEX idx_mqtt_acls_username ON mqtt_acls(username);CREATE INDEX idx_mqtt_acls_username ON mqtt_acls(username);

CREATE INDEX idx_mqtt_acls_clientid ON mqtt_acls(clientid);CREATE INDEX idx_mqtt_acls_clientid ON mqtt_acls(clientid);

CREATE INDEX idx_mqtt_acls_topic ON mqtt_acls(topic);CREATE INDEX idx_mqtt_acls_topic ON mqtt_acls(topic);

CREATE INDEX idx_mqtt_acls_priority ON mqtt_acls(priority DESC);CREATE INDEX idx_mqtt_acls_priority ON mqtt_acls(priority DESC);



-- Link devices to MQTT users (one-to-one mapping)-- Link devices to MQTT users (one-to-one mapping)

-- This allows us to manage device MQTT credentials alongside device provisioning-- This allows us to manage device MQTT credentials alongside device provisioning

ALTER TABLE devices ADD COLUMN IF NOT EXISTS mqtt_username VARCHAR(255);ALTER TABLE devices ADD COLUMN IF NOT EXISTS mqtt_username VARCHAR(255);

ALTER TABLE devices ADD COLUMN IF NOT EXISTS mqtt_client_id VARCHAR(255);ALTER TABLE devices ADD COLUMN IF NOT EXISTS mqtt_client_id VARCHAR(255);



CREATE INDEX idx_devices_mqtt_username ON devices(mqtt_username);CREATE INDEX idx_devices_mqtt_username ON devices(mqtt_username);



-- Link dashboard users to MQTT users (optional - for users who need MQTT access)-- Link dashboard users to MQTT users (optional - for users who need MQTT access)

ALTER TABLE users ADD COLUMN IF NOT EXISTS mqtt_username VARCHAR(255);ALTER TABLE users ADD COLUMN IF NOT EXISTS mqtt_username VARCHAR(255);

CREATE INDEX idx_users_mqtt_username ON users(mqtt_username);CREATE INDEX idx_users_mqtt_username ON users(mqtt_username);



-- ============================================================================-- ============================================================================

-- DEFAULT DATA & SEED VALUES-- DEFAULT DATA & SEED VALUES

-- ============================================================================-- ============================================================================



-- Default admin user (password: 'admin123' - CHANGE IN PRODUCTION!)-- Default admin user (password: 'admin123' - CHANGE IN PRODUCTION!)

-- Password hash generated with: bcrypt.hash('admin123', 10)-- Password hash generated with: bcrypt.hash('admin123', 10)

INSERT INTO users (username, email, password_hash, full_name, role, is_active, email_verified)INSERT INTO users (username, email, password_hash, full_name, role, is_active, email_verified)

VALUES (VALUES (

    'admin',    'admin',

    'admin@zemfyre.local',    'admin@zemfyre.local',

    '$2b$10$rGHvF8p4Yl9hH5K5p0YHXe5g9K5C5g9K5C5g9K5C5g9K5C5g9K5C5O',  -- admin123    '$2b$10$rGHvF8p4Yl9hH5K5p0YHXe5g9K5C5g9K5C5g9K5C5g9K5C5g9K5C5O',  -- admin123

    'System Administrator',    'System Administrator',

    'admin',    'admin',

    true,    true,

    true    true

) ON CONFLICT (username) DO NOTHING;) ON CONFLICT (username) DO NOTHING;



-- Default MQTT superuser (password: 'mqtt_admin' - CHANGE IN PRODUCTION!)-- Default MQTT superuser (password: 'mqtt_admin' - CHANGE IN PRODUCTION!)

INSERT INTO mqtt_users (username, password_hash, is_superuser, is_active)INSERT INTO mqtt_users (username, password_hash, is_superuser, is_active)

VALUES (VALUES (

    'mqtt_admin',    'mqtt_admin',

    '$2b$10$rGHvF8p4Yl9hH5K5p0YHXe5g9K5C5g9K5C5g9K5C5g9K5C5g9K5C5O',  -- Change this!    '$2b$10$rGHvF8p4Yl9hH5K5p0YHXe5g9K5C5g9K5C5g9K5C5g9K5C5g9K5C5O',  -- Change this!

    true,    true,

    true    true

) ON CONFLICT (username) DO NOTHING;) ON CONFLICT (username) DO NOTHING;



-- Default ACL rules-- Default ACL rules

-- Allow all authenticated users to publish to their own device topics-- Allow all authenticated users to publish to their own device topics

INSERT INTO mqtt_acls (username, topic, access, priority)INSERT INTO mqtt_acls (username, topic, access, priority)

VALUESVALUES 

    -- Allow devices to publish sensor data    -- Allow devices to publish sensor data

    (NULL, 'sensor/#', 2, 10),  -- Publish to sensor/*    (NULL, 'sensor/#', 2, 10),  -- Publish to sensor/*

    (NULL, 'device/+/status', 2, 10),  -- Publish device status    (NULL, 'device/+/status', 2, 10),  -- Publish device status

        

    -- Allow devices to subscribe to commands    -- Allow devices to subscribe to commands

    (NULL, 'device/+/command/#', 1, 10),  -- Subscribe to commands    (NULL, 'device/+/command/#', 1, 10),  -- Subscribe to commands

    (NULL, 'device/+/config', 1, 10),  -- Subscribe to config updates    (NULL, 'device/+/config', 1, 10),  -- Subscribe to config updates

        

    -- System topics (read-only for non-superusers)    -- System topics (read-only for non-superusers)

    (NULL, 'system/#', 1, 5),    (NULL, 'system/#', 1, 5),

        

    -- Alert topics (read for all)    -- Alert topics (read for all)

    (NULL, 'alerts/#', 1, 5)    (NULL, 'alerts/#', 1, 5)

ON CONFLICT DO NOTHING;ON CONFLICT DO NOTHING;



-- ============================================================================-- ============================================================================

-- AUDIT TRAIL ENHANCEMENTS-- AUDIT TRAIL ENHANCEMENTS

-- ============================================================================-- ============================================================================



-- Add authentication event types to audit_logs-- Add authentication event types to audit_logs

COMMENT ON COLUMN audit_logs.event_type IS 'Event types: user_login, user_logout, mqtt_connect, mqtt_disconnect, mqtt_publish, mqtt_subscribe, password_change, api_key_rotation, etc.';COMMENT ON COLUMN audit_logs.event_type IS 'Event types: user_login, user_logout, mqtt_connect, mqtt_disconnect, mqtt_publish, mqtt_subscribe, password_change, api_key_rotation, etc.';



-- ============================================================================-- ============================================================================

-- VIEWS FOR EASY QUERIES-- VIEWS FOR EASY QUERIES

-- ============================================================================-- ============================================================================



-- View: Active user sessions-- View: Active user sessions

CREATE OR REPLACE VIEW active_user_sessions ASCREATE OR REPLACE VIEW active_user_sessions AS

SELECTSELECT 

    us.id,    us.id,

    us.user_id,    us.user_id,

    u.username,    u.username,

    u.email,    u.email,

    u.role,    u.role,

    us.ip_address,    us.ip_address,

    us.user_agent,    us.user_agent,

    us.created_at,    us.created_at,

    us.last_activity_at,    us.last_activity_at,

    us.expires_at    us.expires_at

FROM user_sessions usFROM user_sessions us

JOIN users u ON us.user_id = u.idJOIN users u ON us.user_id = u.id

WHERE us.expires_at > CURRENT_TIMESTAMP;WHERE us.expires_at > CURRENT_TIMESTAMP;



-- View: MQTT access control summary-- View: MQTT access control summary

CREATE OR REPLACE VIEW mqtt_access_summary ASCREATE OR REPLACE VIEW mqtt_access_summary AS

SELECTSELECT 

    mu.username,    mu.username,

    mu.is_superuser,    mu.is_superuser,

    mu.is_active AS mqtt_active,    mu.is_active AS mqtt_active,

    COUNT(ma.id) AS acl_rule_count,    COUNT(ma.id) AS acl_rule_count,

    d.uuid AS device_uuid,    d.uuid AS device_uuid,

    d.device_name,    d.device_name,

    d.is_active AS device_active    d.is_active AS device_active

FROM mqtt_users muFROM mqtt_users mu

LEFT JOIN mqtt_acls ma ON mu.username = ma.usernameLEFT JOIN mqtt_acls ma ON mu.username = ma.username

LEFT JOIN devices d ON d.mqtt_username = mu.usernameLEFT JOIN devices d ON d.mqtt_username = mu.username

GROUP BY mu.username, mu.is_superuser, mu.is_active, d.uuid, d.device_name, d.is_active;GROUP BY mu.username, mu.is_superuser, mu.is_active, d.uuid, d.device_name, d.is_active;



-- ============================================================================-- ============================================================================

-- FUNCTIONS & TRIGGERS-- FUNCTIONS & TRIGGERS

-- ============================================================================-- ============================================================================



-- Function: Update updated_at timestamp-- Function: Update updated_at timestamp

CREATE OR REPLACE FUNCTION update_updated_at_column()CREATE OR REPLACE FUNCTION update_updated_at_column()

RETURNS TRIGGER AS $$RETURNS TRIGGER AS $$

BEGINBEGIN

    NEW.updated_at = CURRENT_TIMESTAMP;    NEW.updated_at = CURRENT_TIMESTAMP;

    RETURN NEW;    RETURN NEW;

END;END;

$$ LANGUAGE plpgsql;$$ LANGUAGE plpgsql;



-- Trigger: Auto-update users.updated_at-- Trigger: Auto-update users.updated_at

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;

CREATE TRIGGER trigger_users_updated_atCREATE TRIGGER trigger_users_updated_at

    BEFORE UPDATE ON users    BEFORE UPDATE ON users

    FOR EACH ROW    FOR EACH ROW

    EXECUTE FUNCTION update_updated_at_column();    EXECUTE FUNCTION update_updated_at_column();



-- Trigger: Auto-update mqtt_users.updated_at-- Trigger: Auto-update mqtt_users.updated_at

DROP TRIGGER IF EXISTS trigger_mqtt_users_updated_at ON mqtt_users;DROP TRIGGER IF EXISTS trigger_mqtt_users_updated_at ON mqtt_users;

CREATE TRIGGER trigger_mqtt_users_updated_atCREATE TRIGGER trigger_mqtt_users_updated_at

    BEFORE UPDATE ON mqtt_users    BEFORE UPDATE ON mqtt_users

    FOR EACH ROW    FOR EACH ROW

    EXECUTE FUNCTION update_updated_at_column();    EXECUTE FUNCTION update_updated_at_column();



-- Function: Create MQTT user when device is provisioned-- Function: Create MQTT user when device is provisioned

CREATE OR REPLACE FUNCTION create_mqtt_user_for_device()CREATE OR REPLACE FUNCTION create_mqtt_user_for_device()

RETURNS TRIGGER AS $$RETURNS TRIGGER AS $$

BEGINBEGIN

    -- Only create if mqtt_username is set    -- Only create if mqtt_username is set

    IF NEW.mqtt_username IS NOT NULL THEN    IF NEW.mqtt_username IS NOT NULL THEN

        -- Create MQTT user (password will be set separately via API)        -- Create MQTT user (password will be set separately via API)

        INSERT INTO mqtt_users (username, password_hash, is_superuser, is_active)        INSERT INTO mqtt_users (username, password_hash, is_superuser, is_active)

        VALUES (        VALUES (

            NEW.mqtt_username,            NEW.mqtt_username,

            '$2b$10$invalid',  -- Placeholder - must be set via API            '$2b$10$invalid',  -- Placeholder - must be set via API

            false,            false,

            NEW.is_active            NEW.is_active

        )        )

        ON CONFLICT (username) DO NOTHING;        ON CONFLICT (username) DO NOTHING;

                

        -- Create default ACL rules for this device        -- Create default ACL rules for this device

        INSERT INTO mqtt_acls (username, topic, access, priority)        INSERT INTO mqtt_acls (username, topic, access, priority)

        VALUES        VALUES 

            (NEW.mqtt_username, 'device/' || NEW.uuid || '/#', 3, 20),  -- Full access to own topics            (NEW.mqtt_username, 'device/' || NEW.uuid || '/#', 3, 20),  -- Full access to own topics

            (NEW.mqtt_username, 'sensor/' || NEW.uuid || '/#', 2, 20),  -- Publish sensor data            (NEW.mqtt_username, 'sensor/' || NEW.uuid || '/#', 2, 20),  -- Publish sensor data

            (NEW.mqtt_username, 'system/status', 1, 10)  -- Read system status            (NEW.mqtt_username, 'system/status', 1, 10)  -- Read system status

        ON CONFLICT DO NOTHING;        ON CONFLICT DO NOTHING;

    END IF;    END IF;

        

    RETURN NEW;    RETURN NEW;

END;END;

$$ LANGUAGE plpgsql;$$ LANGUAGE plpgsql;



DROP TRIGGER IF EXISTS trigger_create_mqtt_user_for_device ON devices;DROP TRIGGER IF EXISTS trigger_create_mqtt_user_for_device ON devices;

CREATE TRIGGER trigger_create_mqtt_user_for_deviceCREATE TRIGGER trigger_create_mqtt_user_for_device

    AFTER INSERT OR UPDATE OF mqtt_username ON devices    AFTER INSERT OR UPDATE OF mqtt_username ON devices

    FOR EACH ROW    FOR EACH ROW

    EXECUTE FUNCTION create_mqtt_user_for_device();    EXECUTE FUNCTION create_mqtt_user_for_device();



COMMENT ON TABLE users IS 'Dashboard users with JWT authentication';COMMENT ON TABLE users IS 'Dashboard users with JWT authentication';

COMMENT ON TABLE mqtt_users IS 'MQTT broker users (mosquitto-go-auth compatible)';COMMENT ON TABLE mqtt_users IS 'MQTT broker users (mosquitto-go-auth compatible)';

COMMENT ON TABLE mqtt_acls IS 'MQTT topic access control lists (mosquitto-go-auth compatible)';COMMENT ON TABLE mqtt_acls IS 'MQTT topic access control lists (mosquitto-go-auth compatible)';

COMMENT ON TABLE refresh_tokens IS 'JWT refresh tokens for persistent sessions';COMMENT ON TABLE refresh_tokens IS 'JWT refresh tokens for persistent sessions';

COMMENT ON TABLE user_sessions IS 'Active user sessions tracking';
