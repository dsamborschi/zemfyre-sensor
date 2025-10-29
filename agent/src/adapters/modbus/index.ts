#!/usr/bin/env node

import * as yargs from 'yargs';
import * as dotenv from 'dotenv';
import { ModbusAdapter } from './modbus-adapter';
import { ConfigLoader } from './config-loader';
import { ConsoleLogger } from '../common/logger';

// Load environment variables
dotenv.config();

/**
 * CLI interface for Modbus Adapter
 */
async function main() {
  const argv = await yargs
    .option('config', {
      alias: 'c',
      description: 'Path to configuration file',
      type: 'string'
    })
    .option('example-config', {
      description: 'Generate example configuration file',
      type: 'string'
    })
    .option('validate-config', {
      description: 'Validate configuration file',
      type: 'string'
    })
    .option('log-level', {
      alias: 'l',
      description: 'Log level (debug, info, warn, error)',
      type: 'string',
      default: 'info',
      choices: ['debug', 'info', 'warn', 'error']
    })
    .help()
    .alias('help', 'h')
    .version()
    .alias('version', 'v')
    .argv;

  try {
    // Generate example configuration
    if (argv.exampleConfig) {
      const exampleConfig = ConfigLoader.createExampleConfig();
      ConfigLoader.saveToFile(exampleConfig, argv.exampleConfig);
      console.log(`Example configuration saved to: ${argv.exampleConfig}`);
      process.exit(0);
    }

    // Validate configuration
    if (argv.validateConfig) {
      const config = ConfigLoader.loadFromFile(argv.validateConfig);
      console.log('Configuration is valid');
      console.log(`Devices: ${config.devices.length}`);
      console.log(`Output socket: ${config.output.socketPath}`);
      process.exit(0);
    }

    // Load configuration
    let config;
    if (argv.config) {
      config = ConfigLoader.loadFromFile(argv.config);
    } else {
      config = ConfigLoader.loadFromEnv();
    }

    // Create logger
    const logger = new ConsoleLogger(argv.logLevel, true);

    // Create and start adapter
    const adapter = new ModbusAdapter(config, logger);

    // Setup graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down Modbus Adapter...');
      try {
        await adapter.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGUSR2', shutdown); // nodemon restart

    // Setup event listeners
    adapter.on('started', () => {
      logger.info('Modbus Adapter is running');
      logger.info(`Socket server: ${config.output.socketPath}`);
      logger.info(`Active devices: ${config.devices.filter((d: any) => d.enabled).length}`);
    });

    adapter.on('device-connected', (deviceName: string) => {
      logger.info(`Device connected: ${deviceName}`);
    });

    adapter.on('device-disconnected', (deviceName: string) => {
      logger.warn(`Device disconnected: ${deviceName}`);
    });

    adapter.on('device-error', (deviceName: string, error: Error) => {
      logger.error(`Device error [${deviceName}]: ${error.message}`);
    });

    adapter.on('data-received', (deviceName: string, dataPoints: any[]) => {
      logger.debug(`Data received from ${deviceName}: ${dataPoints.length} points`);
    });

    // Start adapter
    await adapter.start();

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run CLI
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { ModbusAdapter, ConfigLoader, ConsoleLogger };