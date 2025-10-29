import { promises as fs } from 'fs';
import { watch, FSWatcher } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { BaseFeature } from '../features/index.js';
import { AgentLogger } from '../logging/agent-logger.js';
import {
  ShadowConfig,
  ShadowTopics,
  ShadowUpdateRequest,
  ShadowUpdateResponse,
  ShadowErrorResponse,
  ShadowDeltaUpdatedEvent,
  ShadowUpdatedEvent,
  ShadowStats,
  ShadowDocument
} from './types';

/**
 * ShadowFeature - Manages AWS IoT Device Shadow
 * Ported from AWS IoT Device Client SampleShadowFeature.cpp
 * 
 * Features:
 * - Subscribe to shadow update/delta/documents topics
 * - Publish shadow updates from file or programmatic data
 * - Automatic sync on delta events
 * - File monitoring for automatic updates
 * - Persist shadow documents to output file
 */
export class ShadowFeature extends BaseFeature {
  private static readonly NAME = 'Shadow';
  private static readonly TAG = 'ShadowFeature';
  private static readonly DEFAULT_SHADOW_DOCUMENT = { welcome: 'aws-iot' };
  private static readonly QOS_AT_LEAST_ONCE: 1 = 1;
  
  private shadowTopics: ShadowTopics;
  private fileWatcher?: FSWatcher;
  private publishIntervalId?: NodeJS.Timeout;  // Track periodic publish interval
  private stats: ShadowStats;
  private subscriptionPromises: Map<string, Promise<void>> = new Map();

  constructor(
    config: ShadowConfig,
    agentLogger: AgentLogger,
    deviceUuid: string
  ) {
    super(
      config,
      agentLogger,
      ShadowFeature.NAME,
      deviceUuid,
      true, // Requires MQTT
      'SHADOW_DEBUG'
    );
    
    this.shadowTopics = new ShadowTopics(deviceUuid, config.shadowName);
    this.stats = this.initializeStats();
  }

  /**
   * Get feature name
   */
  public getName(): string {
    return ShadowFeature.NAME;
  }

  /**
   * Initialize - called by BaseFeature.start() before onStart()
   */
  protected async onInitialize(): Promise<void> {
    this.validateConfig();
    this.logger.info(`Starting Shadow feature for '${(this.config as ShadowConfig).shadowName}'`);
  }

  /**
   * Start the shadow feature
   */
  protected async onStart(): Promise<void> {
    if (!this.mqttConnection) {
      throw new Error('MQTT connection required for Shadow feature');
    }

    // Subscribe to all pertinent shadow topics
    await this.subscribeToPertinentShadowTopics();
    
    // Read and publish initial shadow state
    await this.readAndUpdateShadowFromFile();
    
    // Start file monitor if enabled
    const shadowConfig = this.config as ShadowConfig;
    if (shadowConfig.enableFileMonitor && shadowConfig.inputFile) {
      await this.startFileMonitor();
    }
    
    // Start periodic publish if configured
    if (shadowConfig.publishInterval) {
      this.startPeriodicPublish();
    }
    
    this.emit('started');
  }

  /**
   * Stop the shadow feature
   */
  protected async onStop(): Promise<void> {
    // Stop periodic publish interval
    if (this.publishIntervalId) {
      clearInterval(this.publishIntervalId);
      this.publishIntervalId = undefined;
      this.logger.info('Stopped periodic publish interval');
    }

    // Stop file watcher
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = undefined;
    }
    
    // Unsubscribe from topics
    await this.unsubscribeFromTopics();
    
    this.emit('stopped');
  }

  /**
   * Manually update shadow state
   */
  public async updateShadow(state: Record<string, any>, isReported = true): Promise<void> {
    const request: ShadowUpdateRequest = {
      state: isReported ? { reported: state } : { desired: state },
      clientToken: randomUUID()
    };

    await this.publishUpdateRequest(request);
  }

  /**
   * Get current shadow from cloud
   */
  public async getShadow(): Promise<void> {
    if (!this.mqttConnection) {
      throw new Error('MQTT connection not available');
    }

    const clientToken = randomUUID();
    const payload = JSON.stringify({ clientToken });
    
    this.logger.debug(`Requesting shadow with token ${clientToken}`);
    await this.mqttConnection.publish(
      this.shadowTopics.get,
      payload,
      { qos: ShadowFeature.QOS_AT_LEAST_ONCE }
    );
    
    this.stats.getRequestsSent++;
  }

  /**
   * Get statistics
   */
  public getStats(): ShadowStats {
    return { ...this.stats };
  }

  /**
   * Subscribe to all pertinent shadow topics
   */
  private async subscribeToPertinentShadowTopics(): Promise<void> {
    if (!this.mqttConnection) {
      throw new Error('MQTT connection not available');
    }

    this.logger.debug('Subscribing to shadow topics');
    
    const subscriptions: Promise<void>[] = [
      this.subscribeToUpdateAccepted(),
      this.subscribeToUpdateRejected(),
      this.subscribeToUpdateDocuments(),
      this.subscribeToUpdateDelta(),
      this.subscribeToGetAccepted(),
      this.subscribeToGetRejected(),
    ];

    try {
      await Promise.all(subscriptions);
      this.logger.info('Successfully subscribed to all shadow topics');
    } catch (error) {
      const errorMessage = `Failed to subscribe to shadow topics: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMessage, error);
      throw new Error(errorMessage);
    }
  }

  /**
   * Subscribe to update/accepted topic
   */
  private async subscribeToUpdateAccepted(): Promise<void> {
    await this.mqttConnection!.subscribe(
      this.shadowTopics.updateAccepted,
      { qos: ShadowFeature.QOS_AT_LEAST_ONCE },
      (topic, payload) => this.handleUpdateAccepted(payload)
    );
    this.logger.debug(`Subscribed to ${this.shadowTopics.updateAccepted}`);
  }

  /**
   * Subscribe to update/rejected topic
   */
  private async subscribeToUpdateRejected(): Promise<void> {
    await this.mqttConnection!.subscribe(
      this.shadowTopics.updateRejected,
      { qos: ShadowFeature.QOS_AT_LEAST_ONCE },
      (topic, payload) => this.handleUpdateRejected(payload)
    );
    this.logger.debug(`Subscribed to ${this.shadowTopics.updateRejected}`);
  }

  /**
   * Subscribe to update/documents topic
   */
  private async subscribeToUpdateDocuments(): Promise<void> {
    await this.mqttConnection!.subscribe(
      this.shadowTopics.updateDocuments,
      { qos: ShadowFeature.QOS_AT_LEAST_ONCE },
      (topic, payload) => this.handleUpdateDocuments(payload)
    );
    this.logger.debug(`Subscribed to ${this.shadowTopics.updateDocuments}`);
  }

  /**
   * Subscribe to update/delta topic
   */
  private async subscribeToUpdateDelta(): Promise<void> {
    await this.mqttConnection!.subscribe(
      this.shadowTopics.updateDelta,
      { qos: ShadowFeature.QOS_AT_LEAST_ONCE },
      (topic, payload) => this.handleUpdateDelta(payload)
    );
    this.logger.debug(`Subscribed to ${this.shadowTopics.updateDelta}`);
  }

  /**
   * Subscribe to get/accepted topic
   */
  private async subscribeToGetAccepted(): Promise<void> {
    await this.mqttConnection!.subscribe(
      this.shadowTopics.getAccepted,
      { qos: ShadowFeature.QOS_AT_LEAST_ONCE },
      (topic, payload) => this.handleGetAccepted(payload)
    );
    this.logger.debug(`Subscribed to ${this.shadowTopics.getAccepted}`);
  }

  /**
   * Subscribe to get/rejected topic
   */
  private async subscribeToGetRejected(): Promise<void> {
    await this.mqttConnection!.subscribe(
      this.shadowTopics.getRejected,
      { qos: ShadowFeature.QOS_AT_LEAST_ONCE },
      (topic, payload) => this.handleGetRejected(payload)
    );
    this.logger.debug(`Subscribed to ${this.shadowTopics.getRejected}`);
  }

  /**
   * Handle update/accepted response
   */
  private handleUpdateAccepted(payload: Buffer): void {
    try {
      const response: ShadowUpdateResponse = JSON.parse(payload.toString());
      this.logger.debug(`Shadow update accepted (version: ${response.version}, token: ${response.clientToken})`);
      
      this.stats.updatesAccepted++;
      this.stats.lastUpdateTime = new Date();
      
      this.emit('update-accepted', response);
    } catch (error) {
      this.logger.error('Error parsing update accepted', error);
    }
  }

  /**
   * Handle update/rejected response
   */
  private handleUpdateRejected(payload: Buffer): void {
    try {
      const errorResponse: ShadowErrorResponse = JSON.parse(payload.toString());
      this.logger.error(`Shadow update rejected: ${errorResponse.message} (code: ${errorResponse.code})`);
      
      this.stats.updatesRejected++;
      this.stats.lastErrorCode = errorResponse.code;
      this.stats.lastErrorMessage = errorResponse.message;
      
      this.emit('update-rejected', errorResponse);
    } catch (error) {
      this.logger.error('Error parsing update rejected', error);
    }
  }

  /**
   * Handle update/documents event (shadow updated)
   */
  private async handleUpdateDocuments(payload: Buffer): Promise<void> {
    try {
      const event: ShadowUpdatedEvent = JSON.parse(payload.toString());
      this.logger.debug(`Shadow document updated (version: ${event.current?.version})`);
      
      this.stats.documentEventsReceived++;
      
      // Write to output file if configured
      const shadowConfig = this.config as ShadowConfig;
      if (shadowConfig.outputFile && event.current) {
        await this.writeShadowToFile(event.current);
      }
      
      this.emit('shadow-updated', event);
    } catch (error) {
      this.logger.error('Error handling update documents', error);
    }
  }

  /**
   * Handle update/delta event (desired != reported)
   */
  private async handleUpdateDelta(payload: Buffer): Promise<void> {
    try {
      const event: ShadowDeltaUpdatedEvent = JSON.parse(payload.toString());
      this.logger.debug(`Shadow delta received (version: ${event.version})`);
      
      this.stats.deltaEventsReceived++;
      this.stats.lastDeltaTime = new Date();
      
      this.emit('delta-updated', event);
      
      // Auto-sync if enabled: update reported to match desired
      const shadowConfig = this.config as ShadowConfig;
      if (shadowConfig.syncOnDelta && event.state) {
        this.logger.info('Auto-syncing shadow (reporting delta as current state)');
        await this.updateShadow(event.state, true);
      }
    } catch (error) {
      this.logger.error('Error handling update delta', error);
    }
  }

  /**
   * Handle get/accepted response
   */
  private async handleGetAccepted(payload: Buffer): Promise<void> {
    try {
      const document: ShadowDocument = JSON.parse(payload.toString());
      this.logger.debug(`Shadow get accepted (version: ${document.version})`);
      
      // Write to output file if configured
      const shadowConfig = this.config as ShadowConfig;
      if (shadowConfig.outputFile) {
        await this.writeShadowToFile(document);
      }
      
      this.emit('get-accepted', document);
    } catch (error) {
      this.logger.error('Error handling get accepted', error);
    }
  }

  /**
   * Handle get/rejected response
   */
  private handleGetRejected(payload: Buffer): void {
    try {
      const errorResponse: ShadowErrorResponse = JSON.parse(payload.toString());
      this.logger.error(`Shadow get rejected: ${errorResponse.message} (code: ${errorResponse.code})`);
      
      this.stats.lastErrorCode = errorResponse.code;
      this.stats.lastErrorMessage = errorResponse.message;
      
      this.emit('get-rejected', errorResponse);
    } catch (error) {
      this.logger.error('Error parsing get rejected', error);
    }
  }

  /**
   * Read shadow data from input file and publish update
   */
  private async readAndUpdateShadowFromFile(): Promise<void> {
    let data: Record<string, any>;
    const shadowConfig = this.config as ShadowConfig;

    if (!shadowConfig.inputFile) {
      // Use default data
      this.logger.debug('No input file configured, using default shadow data');
      data = ShadowFeature.DEFAULT_SHADOW_DOCUMENT;
    } else {
      try {
        // Expand ~ in path
        const expandedPath = this.expandPath(shadowConfig.inputFile);
        const fileContent = await fs.readFile(expandedPath, 'utf-8');
        data = JSON.parse(fileContent);
        this.logger.debug(`Read shadow data from ${expandedPath}`);
      } catch (error) {
        const errorMessage = `Unable to read input file '${shadowConfig.inputFile}': ${error}`;
        this.logger.error(errorMessage, error);
        throw new Error(errorMessage);
      }
    }

    // Publish shadow update
    const request: ShadowUpdateRequest = {
      state: { reported: data },
      clientToken: randomUUID()
    };

    await this.publishUpdateRequest(request);
  }

  /**
   * Publish shadow update request
   */
  private async publishUpdateRequest(request: ShadowUpdateRequest): Promise<void> {
    if (!this.mqttConnection) {
      throw new Error('MQTT connection not available');
    }

    const payload = JSON.stringify(request);
    
    console.log(`📤 Publishing shadow update to: ${this.shadowTopics.update}`);
    console.log(`   Payload size: ${payload.length} bytes`);
    console.log(`   Token: ${request.clientToken}`);
    
    this.logger.debug(`Publishing shadow update (token: ${request.clientToken})`);
    
    await this.mqttConnection.publish(
      this.shadowTopics.update,
      payload,
      { qos: ShadowFeature.QOS_AT_LEAST_ONCE }
    );
    
    this.stats.updatesPublished++;
  }

  /**
   * Write shadow document to output file
   */
  private async writeShadowToFile(document: ShadowDocument): Promise<void> {
    const shadowConfig = this.config as ShadowConfig;
    if (!shadowConfig.outputFile) {
      return;
    }

    try {
      const expandedPath = this.expandPath(shadowConfig.outputFile);
      
      // Ensure directory exists
      const dir = path.dirname(expandedPath);
      await fs.mkdir(dir, { recursive: true });
      
      // Write formatted JSON
      const content = JSON.stringify(document, null, 2);
      await fs.writeFile(expandedPath, content, 'utf-8');
      
      this.logger.info(`Wrote shadow document to ${expandedPath}`);
    } catch (error) {
      this.logger.error('Failed to write shadow to file', error);
    }
  }

  /**
   * Start file monitor to detect changes to input file
   */
  private async startFileMonitor(): Promise<void> {
    const shadowConfig = this.config as ShadowConfig;
    if (!shadowConfig.inputFile) {
      return;
    }

    const expandedPath = this.expandPath(shadowConfig.inputFile);
    
    try {
      this.logger.info(`Starting file monitor for ${expandedPath}`);
      
      this.fileWatcher = watch(expandedPath, async (eventType, filename) => {
        if (eventType === 'change') {
          this.logger.debug('Input file changed, updating shadow');
          try {
            await this.readAndUpdateShadowFromFile();
          } catch (error) {
            this.logger.error('Error updating shadow from file', error);
          }
        }
      });

      this.fileWatcher.on('error', (error) => {
        this.logger.error('File watcher error', error);
        this.emit('error', error);
      });
      
    } catch (error) {
      this.logger.error('Failed to start file monitor', error);
    }
  }

  /**
   * Start periodic shadow publish
   */
  private startPeriodicPublish(): void {
    const shadowConfig = this.config as ShadowConfig;
    if (!shadowConfig.publishInterval) {
      return;
    }

    this.logger.info(`Starting periodic shadow publish (interval: ${shadowConfig.publishInterval}ms)`);

    this.publishIntervalId = setInterval(async () => {
      if (!this.isRunning) {
        if (this.publishIntervalId) {
          clearInterval(this.publishIntervalId);
          this.publishIntervalId = undefined;
        }
        return;
      }

      try {
        await this.readAndUpdateShadowFromFile();
      } catch (error) {
        this.logger.error('Error in periodic publish', error);
      }
    }, shadowConfig.publishInterval);
  }

  /**
   * Unsubscribe from all shadow topics
   */
  private async unsubscribeFromTopics(): Promise<void> {
    if (!this.mqttConnection) {
      return;
    }

    const topics = this.shadowTopics.getSubscriptionTopics();
    
    try {
      await Promise.all(topics.map(topic => this.mqttConnection!.unsubscribe(topic)));
      this.logger.debug('Unsubscribed from all shadow topics');
    } catch (error) {
      this.logger.error('Error unsubscribing from topics', error);
    }
  }

  /**
   * Validate configuration
   */
  protected validateConfig(): void {
    const shadowConfig = this.config as ShadowConfig;
    if (!shadowConfig.shadowName) {
      throw new Error('Shadow name is required');
    }

    if (shadowConfig.publishInterval && shadowConfig.publishInterval < 1000) {
      throw new Error('Publish interval must be at least 1000ms (1 second)');
    }

    this.logger.debug(`Configuration validated for shadow '${shadowConfig.shadowName}'`);
  }

  /**
   * Initialize statistics
   */
  private initializeStats(): ShadowStats {
    return {
      updatesPublished: 0,
      updatesAccepted: 0,
      updatesRejected: 0,
      deltaEventsReceived: 0,
      documentEventsReceived: 0,
      getRequestsSent: 0,
    };
  }

  /**
   * Expand ~ in file paths to home directory
   */
  private expandPath(filePath: string): string {
    if (filePath.startsWith('~/')) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
      return path.join(homeDir, filePath.slice(2));
    }
    return filePath;
  }
}
