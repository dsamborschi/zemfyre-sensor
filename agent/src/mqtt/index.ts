/**
 * Centralized MQTT Module
 * 
 * Single MQTT connection shared across all features (jobs, shadows, logging).
 * 
 * Documentation: See agent/docs/mqtt/README.md
 * Quick Start: See agent/docs/mqtt/QUICK-START.md
 * 
 * Exports:
 * - MqttManager: Singleton MQTT connection manager
 * - JobsMqttConnectionAdapter: Adapter for Jobs feature
 * - ShadowMqttConnectionAdapter: Adapter for Shadow feature
 */

export { MqttManager } from './mqtt-manager';
export { JobsMqttConnectionAdapter, ShadowMqttConnectionAdapter } from './mqtt-connection-adapter';
export type { JobsMqttConnection, ShadowMqttConnection } from './mqtt-connection-adapter';
