export * from './types';
export * from './job-engine';
export * from './jobs-feature';
export * from './utils';

// Main entry point for the library
import { JobsFeature } from './jobs-feature';
import { ConsoleLogger, DefaultClientBaseNotifier, ConfigUtils } from './utils';
import { JobsConfig, MqttConnection } from './types';

/**
 * Factory function to create a JobsFeature instance with sensible defaults
 */
export function createJobsFeature(
  mqttConnection: MqttConnection,
  config: Partial<JobsConfig> & { deviceUuid: string }
): JobsFeature {
  const logger = new ConsoleLogger();
  const notifier = new DefaultClientBaseNotifier(logger);
  
  const fullConfig: JobsConfig = {
    enabled: true,
    handlerDirectory: ConfigUtils.getDefaultJobsHandlerDir(),
    maxConcurrentJobs: 1,
    defaultHandlerTimeout: 60000, // 60 seconds
    ...config
  };

  ConfigUtils.validateJobsConfig(fullConfig);

  return new JobsFeature(mqttConnection, logger, notifier, fullConfig);
}

/**
 * Version information
 */
export const VERSION = '1.0.0';