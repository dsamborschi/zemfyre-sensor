/**
 * BME688 Sensor Simulator
 * 
 * Simulates multiple BME688 environmental sensors writing data to Unix domain sockets.
 * Generates realistic sensor data with optional failure simulation.
 */

const net = require('net');
const fs = require('fs');
const path = require('path');

// ========================================
// Configuration from Environment Variables
// ========================================

const CONFIG = {
  numSensors: parseInt(process.env.NUM_SENSORS || '3', 10),
  socketDir: process.env.SOCKET_DIR || '/tmp/sensors',
  publishInterval: parseInt(process.env.PUBLISH_INTERVAL_MS || '60000', 10), // 1 minute
  enableFailures: process.env.ENABLE_FAILURES !== 'false', // Default: true
  failureChance: parseFloat(process.env.FAILURE_CHANCE || '0.05'), // 5% chance per interval
  reconnectDelay: parseInt(process.env.RECONNECT_DELAY_MS || '10000', 10), // 10 seconds
  dataFormat: process.env.DATA_FORMAT || 'json', // json or csv
  eomDelimiter: process.env.EOM_DELIMITER || '\n',
  logLevel: process.env.LOG_LEVEL || 'info', // debug, info, warn, error
};

console.log('🚀 Starting Sensor Simulator...');
console.log('Configuration:', JSON.stringify(CONFIG, null, 2));

// ========================================
// Sensor Data Generator
// ========================================

class SensorDataGenerator {
  constructor(sensorName) {
    this.sensorName = sensorName;
    
    // Base values with slight variations per sensor
    this.baseTemp = 20 + Math.random() * 10; // 20-30°C
    this.baseHumidity = 40 + Math.random() * 20; // 40-60%
    this.basePressure = 1000 + Math.random() * 30; // 1000-1030 hPa
    this.baseGas = 100000 + Math.random() * 200000; // 100k-300k ohms
    
    // Drift parameters for realistic variations
    this.tempDrift = 0;
    this.humidityDrift = 0;
    this.pressureDrift = 0;
    this.gasDrift = 0;
  }

  generate() {
    // Update drift (slow changes over time)
    this.tempDrift += (Math.random() - 0.5) * 0.1;
    this.humidityDrift += (Math.random() - 0.5) * 0.2;
    this.pressureDrift += (Math.random() - 0.5) * 0.5;
    this.gasDrift += (Math.random() - 0.5) * 1000;

    // Clamp drift to reasonable ranges
    this.tempDrift = Math.max(-2, Math.min(2, this.tempDrift));
    this.humidityDrift = Math.max(-5, Math.min(5, this.humidityDrift));
    this.pressureDrift = Math.max(-10, Math.min(10, this.pressureDrift));
    this.gasDrift = Math.max(-50000, Math.min(50000, this.gasDrift));

    // Generate current values with drift and noise
    const temperature = this.baseTemp + this.tempDrift + (Math.random() - 0.5) * 0.5;
    const humidity = this.baseHumidity + this.humidityDrift + (Math.random() - 0.5);
    const pressure = this.basePressure + this.pressureDrift + (Math.random() - 0.5) * 0.2;
    const gas_resistance = this.baseGas + this.gasDrift + (Math.random() - 0.5) * 5000;

    return {
      sensor_name: this.sensorName,
      temperature: parseFloat(temperature.toFixed(2)),
      humidity: parseFloat(humidity.toFixed(2)),
      pressure: parseFloat(pressure.toFixed(2)),
      gas_resistance: Math.round(gas_resistance),
      timestamp: new Date().toISOString(),
    };
  }

  formatData(data) {
    if (CONFIG.dataFormat === 'csv') {
      return `${data.sensor_name},${data.temperature},${data.humidity},${data.pressure},${data.gas_resistance},${data.timestamp}`;
    }
    // Default: JSON
    return JSON.stringify(data);
  }
}

// ========================================
// Sensor Socket Server
// ========================================

class SensorSocket {
  constructor(sensorName, socketPath) {
    this.sensorName = sensorName;
    this.socketPath = socketPath;
    this.server = null;
    this.clients = [];
    this.generator = new SensorDataGenerator(sensorName);
    this.publishTimer = null;
    this.isFailed = false;
    this.isRunning = false;
  }

  async start() {
    try {
      // Remove existing socket file if it exists
      if (fs.existsSync(this.socketPath)) {
        fs.unlinkSync(this.socketPath);
        this.log('debug', `Removed existing socket: ${this.socketPath}`);
      }

      // Create Unix domain socket server
      this.server = net.createServer((client) => {
        this.log('info', `Client connected`);
        this.clients.push(client);

        client.on('end', () => {
          this.log('info', `Client disconnected`);
          this.clients = this.clients.filter(c => c !== client);
        });

        client.on('error', (err) => {
          this.log('warn', `Client error: ${err.message}`);
          this.clients = this.clients.filter(c => c !== client);
        });
      });

      // Listen on Unix socket
      this.server.listen(this.socketPath, () => {
        this.log('info', `Socket listening: ${this.socketPath}`);
        this.isRunning = true;
        this.startPublishing();
      });

      this.server.on('error', (err) => {
        this.log('error', `Socket error: ${err.message}`);
        this.stop();
      });

    } catch (error) {
      this.log('error', `Failed to start: ${error.message}`);
      throw error;
    }
  }

  startPublishing() {
    this.publishTimer = setInterval(() => {
      this.publishData();
    }, CONFIG.publishInterval);

    // Publish immediately on start
    this.publishData();
  }

  publishData() {
    // Simulate random failures
    if (CONFIG.enableFailures && !this.isFailed && Math.random() < CONFIG.failureChance) {
      this.simulateFailure();
      return;
    }

    // Skip publishing if failed
    if (this.isFailed) {
      return;
    }

    // Generate and send data
    try {
      const data = this.generator.generate();
      const formattedData = this.generator.formatData(data) + CONFIG.eomDelimiter;

      if (this.clients.length === 0) {
        this.log('debug', `No clients connected, data not sent`);
        return;
      }

      // Send to all connected clients
      this.clients.forEach((client) => {
        if (!client.destroyed) {
          client.write(formattedData, (err) => {
            if (err) {
              this.log('warn', `Write error: ${err.message}`);
            }
          });
        }
      });

      this.log('debug', `Published: ${formattedData.trim()}`);

    } catch (error) {
      this.log('error', `Publish error: ${error.message}`);
    }
  }

  simulateFailure() {
    this.isFailed = true;
    this.log('warn', `⚠️  SIMULATED FAILURE - Sensor offline`);

    // Stop publishing
    if (this.publishTimer) {
      clearInterval(this.publishTimer);
      this.publishTimer = null;
    }

    // Disconnect all clients
    this.clients.forEach(client => {
      if (!client.destroyed) {
        client.destroy();
      }
    });
    this.clients = [];

    // Close server
    if (this.server) {
      this.server.close();
    }

    // Schedule reconnection
    setTimeout(() => {
      this.recover();
    }, CONFIG.reconnectDelay);
  }

  async recover() {
    this.log('info', `♻️  Recovering from failure...`);
    this.isFailed = false;
    this.isRunning = false;

    try {
      await this.start();
      this.log('info', `✅ Recovery successful`);
    } catch (error) {
      this.log('error', `❌ Recovery failed: ${error.message}`);
      // Try again after delay
      setTimeout(() => this.recover(), CONFIG.reconnectDelay);
    }
  }

  stop() {
    this.isRunning = false;

    if (this.publishTimer) {
      clearInterval(this.publishTimer);
      this.publishTimer = null;
    }

    this.clients.forEach(client => {
      if (!client.destroyed) {
        client.destroy();
      }
    });
    this.clients = [];

    if (this.server) {
      this.server.close();
    }

    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    this.log('info', `Stopped`);
  }

  log(level, message) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const configLevel = levels[CONFIG.logLevel] || 1;
    const messageLevel = levels[level] || 1;

    if (messageLevel >= configLevel) {
      const timestamp = new Date().toISOString();
      const emoji = { debug: '🔍', info: '📡', warn: '⚠️', error: '❌' }[level] || '📡';
      console.log(`${timestamp} ${emoji} [${this.sensorName}] ${message}`);
    }
  }
}

// ========================================
// Simulator Manager
// ========================================

class SimulatorManager {
  constructor() {
    this.sensors = [];
  }

  async start() {
    // Ensure socket directory exists
    if (!fs.existsSync(CONFIG.socketDir)) {
      fs.mkdirSync(CONFIG.socketDir, { recursive: true });
      console.log(`✅ Created socket directory: ${CONFIG.socketDir}`);
    }

    // Create sensor sockets
    for (let i = 1; i <= CONFIG.numSensors; i++) {
      const sensorName = `sensor${i}`;
      const socketPath = path.join(CONFIG.socketDir, `${sensorName}.sock`);
      
      const sensor = new SensorSocket(sensorName, socketPath);
      this.sensors.push(sensor);

      try {
        await sensor.start();
      } catch (error) {
        console.error(`❌ Failed to start ${sensorName}:`, error.message);
      }
    }

    console.log('='.repeat(80));
    console.log('✅ Sensor Simulator Started Successfully!');
    console.log('='.repeat(80));
    console.log(`📊 Active Sensors: ${this.sensors.length}`);
    console.log(`📁 Socket Directory: ${CONFIG.socketDir}`);
    console.log(`⏱️  Publish Interval: ${CONFIG.publishInterval}ms (${CONFIG.publishInterval / 1000}s)`);
    console.log(`⚠️  Failure Simulation: ${CONFIG.enableFailures ? 'Enabled' : 'Disabled'}`);
    if (CONFIG.enableFailures) {
      console.log(`   Failure Chance: ${CONFIG.failureChance * 100}% per interval`);
      console.log(`   Reconnect Delay: ${CONFIG.reconnectDelay}ms`);
    }
    console.log('='.repeat(80));
  }

  async stop() {
    console.log('🛑 Stopping Sensor Simulator...');
    
    for (const sensor of this.sensors) {
      sensor.stop();
    }

    console.log('✅ Sensor Simulator Stopped');
  }
}

// ========================================
// Main
// ========================================

const manager = new SimulatorManager();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await manager.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await manager.stop();
  process.exit(0);
});

// Start simulator
manager.start().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
