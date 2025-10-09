import { createJobsFeature, MqttConnection } from '../src';
import { EventEmitter } from 'events';

/**
 * Simple MQTT Connection Mock for demonstration
 * In real usage, you would use aws-iot-device-sdk-v2 or similar
 */
class MockMqttConnection extends EventEmitter implements MqttConnection {
  private subscriptions = new Map<string, Function>();

  async publish(topic: string, payload: string): Promise<void> {
    console.log(`[MQTT] Publishing to ${topic}:`, payload);
    
    // Simulate some responses for demo purposes
    if (topic.includes('/jobs/start-next')) {
      setTimeout(() => {
        const response = {
          execution: {
            jobId: 'demo-job-123',
            thingName: 'my-device',
            status: 'QUEUED',
            queuedAt: new Date().toISOString(),
            versionNumber: 1,
            executionNumber: 1,
            jobDocument: {
              version: '1.0',
              includeStdOut: true,
              steps: [
                {
                  name: 'Echo Hello World',
                  type: 'runCommand',
                  input: {
                    command: 'echo,Hello from AWS IoT Jobs!'
                  }
                }
              ]
            }
          }
        };
        
        const acceptedTopic = topic.replace('/start-next', '/start-next/accepted');
        const callback = this.subscriptions.get(acceptedTopic);
        if (callback) {
          callback(acceptedTopic, Buffer.from(JSON.stringify(response)));
        }
      }, 1000);
    }
  }

  async subscribe(topic: string, callback: (topic: string, payload: Buffer) => void): Promise<void> {
    console.log(`[MQTT] Subscribing to ${topic}`);
    this.subscriptions.set(topic, callback);
  }

  async unsubscribe(topic: string): Promise<void> {
    console.log(`[MQTT] Unsubscribing from ${topic}`);
    this.subscriptions.delete(topic);
  }

  isConnected(): boolean {
    return true;
  }
}

/**
 * Example usage of the Jobs Feature
 */
async function runExample() {
  console.log('=== AWS IoT Device Client Jobs Feature - Node.js Example ===\n');

  // Create mock MQTT connection
  const mqttConnection = new MockMqttConnection();

  // Create Jobs Feature with configuration
  const jobsFeature = createJobsFeature(mqttConnection, {
    thingName: 'my-device',
    handlerDirectory: './job-handlers',
    enabled: true
  });

  try {
    // Start the Jobs feature
    console.log('Starting Jobs feature...');
    await jobsFeature.start();

    // Let it run for a bit to process the demo job
    console.log('Jobs feature is running. Waiting for jobs...');
    await new Promise(resolve => setTimeout(resolve, 5000));

  } catch (error) {
    console.error('Error running Jobs feature:', error);
  } finally {
    // Stop the Jobs feature
    console.log('Stopping Jobs feature...');
    await jobsFeature.stop();
    console.log('Example completed.');
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  runExample().catch(console.error);
}