import { createJobsFeature, MqttConnection } from '../src';
import { EventEmitter } from 'events';

/**
 * Windows-compatible MQTT Connection Mock
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
            jobId: 'windows-demo-job-456',
            thingName: 'my-windows-device',
            status: 'QUEUED',
            queuedAt: new Date().toISOString(),
            versionNumber: 1,
            executionNumber: 1,
            jobDocument: {
              version: '1.0',
              includeStdOut: true,
              steps: [
                {
                  name: 'Get Current Directory',
                  type: 'runCommand',
                  input: {
                    command: 'cmd,/c,cd'  // Windows command to get current directory
                  }
                },
                {
                  name: 'List Files',
                  type: 'runCommand',
                  input: {
                    command: 'cmd,/c,dir,/b'  // Windows command to list files
                  }
                }
              ],
              finalStep: {
                name: 'Say Goodbye',
                type: 'runCommand',
                input: {
                  command: 'cmd,/c,echo,Job completed successfully!'
                }
              }
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
 * Windows-compatible example with working commands
 */
async function runWindowsExample() {
  console.log('🪟 AWS IoT Device Client Jobs Feature - Windows Example\n');

  // Create mock MQTT connection
  const mqttConnection = new MockMqttConnection();

  // Create Jobs Feature with configuration
  const jobsFeature = createJobsFeature(mqttConnection, {
    thingName: 'my-windows-device',
    handlerDirectory: './job-handlers',
    enabled: true
  });

  try {
    // Start the Jobs feature
    console.log('Starting Jobs feature...');
    await jobsFeature.start();

    // Let it run for a bit to process the demo job
    console.log('Jobs feature is running. Waiting for Windows-compatible jobs...');
    await new Promise(resolve => setTimeout(resolve, 8000));

  } catch (error) {
    console.error('Error running Jobs feature:', error);
  } finally {
    // Stop the Jobs feature
    console.log('Stopping Jobs feature...');
    await jobsFeature.stop();
    console.log('Windows example completed.');
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  runWindowsExample().catch(console.error);
}