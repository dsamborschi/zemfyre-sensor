/**
 * MQTT Service Initialization
 * 
 * Sets up MQTT manager and registers message handlers
 */

import MqttManager from './mqtt-manager';
import {
  handleSensorData,
  handleShadowUpdate,
  handleLogMessage,
  handleMetrics,
  handleDeviceStatus
} from './handlers';

let mqttManager: MqttManager | null = null;

/**
 * Initialize MQTT service
 */
export async function initializeMqtt(): Promise<MqttManager | null> {
  const mqttBrokerUrl = process.env.MQTT_BROKER_URL || process.env.MQTT_BROKER;
  
  if (!mqttBrokerUrl) {
    console.log('⚠️  MQTT broker not configured. Set MQTT_BROKER_URL to enable MQTT features.');
    return null;
  }

  try {

    mqttManager = new MqttManager({
      brokerUrl: mqttBrokerUrl,
      clientId: process.env.MQTT_CLIENT_ID || `api-${process.env.HOSTNAME || 'server'}`,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      reconnectPeriod: parseInt(process.env.MQTT_RECONNECT_PERIOD || '5000'),
      keepalive: parseInt(process.env.MQTT_KEEPALIVE || '60'),
      qos: (parseInt(process.env.MQTT_QOS || '1') as 0 | 1 | 2)
    });

    // Connect to broker
    await mqttManager.connect();

    // Register event handlers
    mqttManager.on('sensor', async (data) => {
      try {
        await handleSensorData(data);
      } catch (error) {
        console.error('Error handling sensor data:', error);
      }
    });

    mqttManager.on('shadow', async (update) => {
      try {
        await handleShadowUpdate(update);
      } catch (error) {
        console.error('Error handling shadow update:', error);
      }
    });

    mqttManager.on('log', async (log) => {
      try {
        await handleLogMessage(log);
      } catch (error) {
        console.error('Error handling log message:', error);
      }
    });

    mqttManager.on('metrics', async (metrics) => {
      try {
        await handleMetrics(metrics);
      } catch (error) {
        console.error('Error handling metrics:', error);
      }
    });

    mqttManager.on('status', async ({ deviceUuid, status }) => {
      try {
        await handleDeviceStatus(deviceUuid, status);
      } catch (error) {
        console.error('Error handling device status:', error);
      }
    });

    // Subscribe to all device topics
    // Use '*' wildcard for all devices, or specific UUIDs for targeted subscriptions
    const subscribeToAll = process.env.MQTT_SUBSCRIBE_ALL !== 'false';
    
    if (subscribeToAll) {
      mqttManager.subscribeToAll([
        'sensor',
        'shadow-reported',
        'shadow-desired',
        'logs',
        'metrics',
        'status'
      ]);
    } else {
      console.log('⚠️  MQTT subscription disabled. Set MQTT_SUBSCRIBE_ALL=true to enable.');
    }

    return mqttManager;

  } catch (error) {
    console.error('❌ Failed to initialize MQTT service:', error);
    return null;
  }
}

/**
 * Get MQTT manager instance
 */
export function getMqttManager(): MqttManager | null {
  return mqttManager;
}

/**
 * Shutdown MQTT service
 */
export async function shutdownMqtt(): Promise<void> {
  if (mqttManager) {
    console.log('🔌 Shutting down MQTT service...');
    await mqttManager.disconnect();
    mqttManager = null;
    console.log('✅ MQTT service shut down');
  }
}

export default { initializeMqtt, getMqttManager, shutdownMqtt };
