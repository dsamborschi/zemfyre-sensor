const mqtt = require('mqtt');
const promClient = require('prom-client');
const http = require('http');

// Configuration from environment variables
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const MQTT_USERNAME = process.env.MQTT_USERNAME || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
const METRICS_PORT = process.env.METRICS_PORT || 9234;

// Create Prometheus metrics
const register = new promClient.Registry();

const mqttConnected = new promClient.Gauge({
  name: 'mqtt_broker_connected',
  help: 'MQTT broker connection status (1 = connected, 0 = disconnected)',
  registers: [register]
});

const mqttMessagesReceived = new promClient.Counter({
  name: 'mqtt_messages_received_total',
  help: 'Total number of MQTT messages received',
  labelNames: ['topic'],
  registers: [register]
});

const mqttBytesReceived = new promClient.Counter({
  name: 'mqtt_bytes_received_total',
  help: 'Total bytes received from MQTT',
  registers: [register]
});

const mqttTopicGauge = new promClient.Gauge({
  name: 'mqtt_topic_value',
  help: 'Numeric values from MQTT topics',
  labelNames: ['topic'],
  registers: [register]
});

// Metrics from $SYS topics
const sysMetrics = {
  'uptime': new promClient.Gauge({
    name: 'mosquitto_broker_uptime_seconds',
    help: 'Broker uptime in seconds',
    registers: [register]
  }),
  'clients_connected': new promClient.Gauge({
    name: 'mosquitto_broker_clients_connected',
    help: 'Currently connected clients',
    registers: [register]
  }),
  'clients_maximum': new promClient.Gauge({
    name: 'mosquitto_broker_clients_maximum',
    help: 'Maximum concurrent clients',
    registers: [register]
  }),
  'clients_total': new promClient.Gauge({
    name: 'mosquitto_broker_clients_total',
    help: 'Total clients ever',
    registers: [register]
  }),
  'messages_sent': new promClient.Gauge({
    name: 'mosquitto_broker_messages_sent',
    help: 'Messages sent by broker',
    registers: [register]
  }),
  'messages_received': new promClient.Gauge({
    name: 'mosquitto_broker_messages_received',
    help: 'Messages received by broker',
    registers: [register]
  }),
  'subscriptions': new promClient.Gauge({
    name: 'mosquitto_broker_subscriptions',
    help: 'Active subscriptions',
    registers: [register]
  }),
  'bytes_sent': new promClient.Gauge({
    name: 'mosquitto_broker_bytes_sent',
    help: 'Bytes sent by broker',
    registers: [register]
  }),
  'bytes_received': new promClient.Gauge({
    name: 'mosquitto_broker_bytes_received',
    help: 'Bytes received by broker',
    registers: [register]
  })
};

// MQTT client options
const options = {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  reconnectPeriod: 5000,
  clientId: `mqtt-exporter-${Math.random().toString(16).substr(2, 8)}`
};

console.log(`Connecting to MQTT broker: ${MQTT_BROKER}`);
const client = mqtt.connect(MQTT_BROKER, options);

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  mqttConnected.set(1);
  
  // Subscribe to $SYS topics for broker stats
  client.subscribe('$SYS/#', (err) => {
    if (err) {
      console.error('Failed to subscribe to $SYS topics:', err);
    } else {
      console.log('Subscribed to $SYS/# topics');
    }
  });
  
  // Subscribe to all sensor topics
  client.subscribe('sensor/#', (err) => {
    if (err) {
      console.error('Failed to subscribe to sensor topics:', err);
    } else {
      console.log('Subscribed to sensor/# topics');
    }
  });
});

client.on('error', (err) => {
  console.error('MQTT connection error:', err);
  mqttConnected.set(0);
});

client.on('close', () => {
  console.log('MQTT connection closed');
  mqttConnected.set(0);
});

client.on('message', (topic, message) => {
  // Count all messages
  mqttMessagesReceived.inc({ topic });
  mqttBytesReceived.inc(message.length);
  
  const value = message.toString();
  
  // Parse $SYS metrics
  if (topic.startsWith('$SYS/')) {
    const parts = topic.split('/');
    const metricName = parts[parts.length - 1];
    const numValue = parseFloat(value);
    
    if (!isNaN(numValue)) {
      // Map $SYS topics to our metrics
      if (topic.includes('/uptime')) {
        sysMetrics.uptime.set(numValue);
      } else if (topic.includes('/clients/connected')) {
        sysMetrics.clients_connected.set(numValue);
      } else if (topic.includes('/clients/maximum')) {
        sysMetrics.clients_maximum.set(numValue);
      } else if (topic.includes('/clients/total')) {
        sysMetrics.clients_total.set(numValue);
      } else if (topic.includes('/messages/sent')) {
        sysMetrics.messages_sent.set(numValue);
      } else if (topic.includes('/messages/received')) {
        sysMetrics.messages_received.set(numValue);
      } else if (topic.includes('/subscriptions/count')) {
        sysMetrics.subscriptions.set(numValue);
      } else if (topic.includes('/bytes/sent')) {
        sysMetrics.bytes_sent.set(numValue);
      } else if (topic.includes('/bytes/received')) {
        sysMetrics.bytes_received.set(numValue);
      }
    }
  }
  
  // Parse sensor data (try to extract numeric values)
  try {
    const data = JSON.parse(value);
    if (typeof data.value === 'number') {
      mqttTopicGauge.set({ topic }, data.value);
    }
  } catch (e) {
    // Not JSON, try as plain number
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      mqttTopicGauge.set({ topic }, numValue);
    }
  }
});

// HTTP server for Prometheus metrics
const server = http.createServer(async (req, res) => {
  if (req.url === '/metrics') {
    res.setHeader('Content-Type', register.contentType);
    res.end(await register.metrics());
  } else if (req.url === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok', connected: client.connected }));
  } else {
    res.statusCode = 404;
    res.end('Not found');
  }
});

server.listen(METRICS_PORT, () => {
  console.log(`Metrics server listening on port ${METRICS_PORT}`);
  console.log(`Metrics: http://localhost:${METRICS_PORT}/metrics`);
  console.log(`Health: http://localhost:${METRICS_PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing connections...');
  client.end();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
