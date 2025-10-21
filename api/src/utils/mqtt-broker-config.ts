/**
 * MQTT Broker Configuration Utilities
 * Helper functions for managing and retrieving MQTT broker configurations
 */

import { query } from '../db/connection';

export interface MqttBrokerConfig {
  id: number;
  name: string;
  protocol: string;
  host: string;
  port: number;
  username: string | null;
  use_tls: boolean;
  ca_cert: string | null;
  client_cert: string | null;
  verify_certificate: boolean;
  client_id_prefix: string;
  keep_alive: number;
  clean_session: boolean;
  reconnect_period: number;
  connect_timeout: number;
  broker_type: string;
}

/**
 * Get broker configuration for a specific device
 * Falls back to default broker if device has no specific broker assigned
 * 
 * @param deviceUuid - Device UUID
 * @returns Broker configuration or null if not found
 */
export async function getBrokerConfigForDevice(deviceUuid: string): Promise<MqttBrokerConfig | null> {
  try {
    const result = await query(
      `SELECT 
        id, name, protocol, host, port, username, 
        use_tls, ca_cert, client_cert, verify_certificate,
        client_id_prefix, keep_alive, clean_session, 
        reconnect_period, connect_timeout, broker_type
      FROM mqtt_broker_config 
      WHERE id = COALESCE(
        (SELECT mqtt_broker_id FROM devices WHERE uuid = $1),
        (SELECT id FROM mqtt_broker_config WHERE is_default = true LIMIT 1)
      )
      LIMIT 1`,
      [deviceUuid]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error fetching broker config for device:', error);
    return null;
  }
}

/**
 * Get the default broker configuration
 * 
 * @returns Default broker configuration or null if not found
 */
export async function getDefaultBrokerConfig(): Promise<MqttBrokerConfig | null> {
  try {
    const result = await query(
      `SELECT 
        id, name, protocol, host, port, username, 
        use_tls, ca_cert, client_cert, verify_certificate,
        client_id_prefix, keep_alive, clean_session, 
        reconnect_period, connect_timeout, broker_type
      FROM mqtt_broker_config 
      WHERE is_default = true
      LIMIT 1`
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error fetching default broker config:', error);
    return null;
  }
}

/**
 * Build broker URL from configuration
 * 
 * @param config - Broker configuration
 * @returns Full broker URL (e.g., "mqtt://localhost:1883")
 */
export function buildBrokerUrl(config: MqttBrokerConfig): string {
  return `${config.protocol}://${config.host}:${config.port}`;
}

/**
 * Format broker configuration for API response
 * Removes sensitive information and formats for client consumption
 * 
 * @param config - Broker configuration
 * @returns Sanitized broker configuration object
 */
export function formatBrokerConfigForClient(config: MqttBrokerConfig) {
  return {
    protocol: config.protocol,
    host: config.host,
    port: config.port,
    useTls: config.use_tls,
    verifyCertificate: config.verify_certificate,
    clientIdPrefix: config.client_id_prefix,
    keepAlive: config.keep_alive,
    cleanSession: config.clean_session,
    reconnectPeriod: config.reconnect_period,
    connectTimeout: config.connect_timeout,
    // Include CA certificate if present (client may need it for TLS)
    ...(config.ca_cert && { caCert: config.ca_cert }),
    // Include client certificate if present
    ...(config.client_cert && { clientCert: config.client_cert })
  };
}

/**
 * Assign a broker to a device
 * 
 * @param deviceUuid - Device UUID
 * @param brokerId - Broker configuration ID (null to use default)
 * @returns Success status
 */
export async function assignBrokerToDevice(deviceUuid: string, brokerId: number | null): Promise<boolean> {
  try {
    await query(
      `UPDATE devices 
       SET mqtt_broker_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE uuid = $2`,
      [brokerId, deviceUuid]
    );
    return true;
  } catch (error) {
    console.error('Error assigning broker to device:', error);
    return false;
  }
}
