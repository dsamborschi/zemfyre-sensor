/**
 * Jobs Feature
 * 
 * Unified job delivery system combining MQTT (primary) and HTTP polling (fallback).
 * Automatically handles failover between MQTT and HTTP based on connection status.
 * 
 * Architecture:
 * - Job Notifications:
 *   - Primary: MQTT push notifications (iot/device/{uuid}/jobs/notify-next, instant ~ms latency)
 *   - Fallback: HTTP polling (GET /api/v1/devices/:uuid/jobs/next, configurable interval, default 30s)
 *   - Automatic failover: Internal monitor switches delivery method based on MQTT connection
 * 
 * - Job Status Updates:
 *   - Primary: MQTT publish (iot/device/{uuid}/jobs/{jobId}/update, instant, QoS 1)
 *   - Fallback: HTTP PATCH (PATCH /api/v1/devices/:uuid/jobs/:jobId/status)
 *   - API responds with: iot/device/{uuid}/jobs/{jobId}/update/accepted
 * 
 * - Unified execution: Single JobEngine handles jobs from both delivery methods
 */

import axios, { AxiosInstance } from 'axios';
import { BaseFeature, FeatureConfig } from '../../../features/base-feature.js';
import { AgentLogger } from '../../../logging/agent-logger.js';
import { MqttManager } from '../../../mqtt/mqtt-manager.js';
import { JobEngine } from './job-engine.js';
import { JobDocument, JobStatus, JobExecutionData } from './types.js';
import { normalizeApiEndpoint, getApiVersion } from '../../../utils/api-utils.js';

export interface JobsConfig extends FeatureConfig {
  enabled: boolean;
  cloudApiUrl: string;
  deviceApiKey?: string;
  pollingIntervalMs?: number;
  maxRetries?: number;
  handlerDirectory?: string;
  maxConcurrentJobs?: number;
  defaultHandlerTimeout?: number;
}

interface CloudJob {
  job_id: string;
  job_name: string;
  job_document: JobDocument;
  timeout_seconds: number;
  created_at: string;
}

interface JobStatusUpdate {
  status: 'QUEUED' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'CANCELED';
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  status_details?: {
    message?: string;
    progress?: number;
    error?: string;
    timestamp?: string;
    [key: string]: any;
  };
}

/**
 * Jobs Feature
 * 
 * Unified job delivery system managing both MQTT (primary) and HTTP (fallback).
 * Automatically switches between them based on MQTT connection status.
 */
export class JobsFeature extends BaseFeature {
  private jobEngine: JobEngine;
  private httpClient: AxiosInstance;
  private httpPollingInterval?: NodeJS.Timeout;
  private connectionMonitor?: NodeJS.Timeout;
  private lastMqttState: boolean = false;
  private httpPaused: boolean = false;
  private handlingJob: boolean = false;
  private needStop: boolean = false;
  private latestJobNotification: JobExecutionData | null = null;
  private mqttSubscribed: boolean = false;

  constructor(
    config: JobsConfig,
    agentLogger: AgentLogger,
    deviceUuid: string
  ) {
    super(
      config,
      agentLogger,
      'Jobs',
      deviceUuid,
      false, // We'll manage MQTT ourselves
      'JOBS_DEBUG'
    );

    // Create shared JobEngine
    this.jobEngine = new JobEngine(this.logger);

    // Create HTTP client for polling with normalized endpoint
    const jobConfig = this.config as JobsConfig;
    const apiVersion = getApiVersion();
    const normalizedBaseUrl = normalizeApiEndpoint(jobConfig.cloudApiUrl);
    
    this.httpClient = axios.create({
      baseURL: `${normalizedBaseUrl}/${apiVersion}`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `Iotistic-agent/${deviceUuid}`,
        'X-Device-API-Key': jobConfig.deviceApiKey || ''
      }
    });
  }

  /**
   * Validate configuration
   */
  protected validateConfig(): void {
    const config = this.config as JobsConfig;
    
    if (!config.cloudApiUrl) {
      throw new Error('cloudApiUrl is required for Jobs feature');
    }

    this.logger.debug(`Jobs configuration validated`);
  }

  /**
   * Initialize - called before start
   */
  protected async onInitialize(): Promise<void> {
    const config = this.config as JobsConfig;
    
    this.logger.info(`Initializing Jobs Feature`);
    this.logger.info(`Cloud API: ${config.cloudApiUrl}`);
    this.logger.info(`Polling interval: ${config.pollingIntervalMs || 30000}ms`);
    this.logger.info(`Handler directory: ${config.handlerDirectory || '/app/data/job-handlers'}`);
  }

  /**
   * Start the unified jobs feature
   */
  protected async onStart(): Promise<void> {
    const config = this.config as JobsConfig;

    // 1. Start HTTP polling (always available as fallback)
    await this.startHttpPolling(config);

    // 2. Initialize MQTT subscriptions (if available)
    await this.initializeMqttSubscriptions();

    // 3. Start connection monitor for automatic fallback
    this.startConnectionMonitor();

    this.logger.info(`Jobs Feature started - Mode: ${this.mqttSubscribed ? 'MQTT-primary with HTTP fallback' : 'HTTP-only'}`);
  }

  /**
   * Stop the jobs feature
   */
  protected async onStop(): Promise<void> {
    this.logger.info(`Stopping Jobs Feature`);
    this.needStop = true;

    // Stop connection monitor
    if (this.connectionMonitor) {
      clearInterval(this.connectionMonitor);
      this.connectionMonitor = undefined;
    }

    // Stop HTTP polling
    if (this.httpPollingInterval) {
      clearInterval(this.httpPollingInterval);
      this.httpPollingInterval = undefined;
      this.logger.info(`HTTP polling stopped`);
    }

    // Unsubscribe from MQTT topics
    if (this.mqttSubscribed) {
      await this.unsubscribeFromMqtt();
    }

    // Wait for current job to complete
    while (this.handlingJob) {
      await this.sleep(100);
    }

    this.logger.info(`Jobs Feature stopped`);
  }

  /**
   * Start HTTP polling (always available as fallback)
   */
  private async startHttpPolling(config: JobsConfig): Promise<void> {
    const pollingIntervalMs = config.pollingIntervalMs || 30000;
    
    this.logger.info(`Starting HTTP polling (interval: ${pollingIntervalMs}ms)`);

    // Initial poll
    await this.pollForJobs();

    // Set up recurring polls
    this.httpPollingInterval = setInterval(async () => {
      if (!this.httpPaused && !this.handlingJob && !this.needStop) {
        await this.pollForJobs();
      }
    }, pollingIntervalMs);

    this.logger.info(`HTTP polling started`);
  }

  /**
   * Poll cloud API for pending jobs
   */
  private async pollForJobs(): Promise<void> {
    try {
      const response = await this.httpClient.get<CloudJob | null>(
        `/devices/${this.deviceUuid}/jobs/next`
      );

      if (response.data) {
        const cloudJob = response.data;
        this.logger.info(`Received job from HTTP polling: ${cloudJob.job_id}`);
        
        // Convert to JobExecutionData format
        const jobData: JobExecutionData = {
          jobId: cloudJob.job_id,
          deviceUuid: this.deviceUuid,
          jobDocument: cloudJob.job_document,
          status: 'QUEUED' as any,
          versionNumber: 1,
          executionNumber: 1
        };

        await this.executeJob(jobData);
      }
    } catch (error: any) {
      if (error.response?.status !== 404) {
        this.logger.error(`HTTP polling error: ${error.message}`);
      }
    }
  }

  /**
   * Initialize MQTT subscriptions (optional, primary method)
   */
  private async initializeMqttSubscriptions(): Promise<void> {
    try {
      const mqttManager = MqttManager.getInstance();
      if (!mqttManager.isConnected()) {
        this.logger.warn(`MQTT not connected, using HTTP-only mode`);
        return;
      }

      this.logger.info(`Initializing MQTT job notifications (primary)`);

      // Subscribe to job notification topic
      const notifyTopic = `iot/device/${this.deviceUuid}/jobs/notify-next`;
      
      await mqttManager.subscribe(notifyTopic, { qos: 1 }, async (topic: string, payload: Buffer) => {
        try {
          const message = JSON.parse(payload.toString());
          await this.handleMqttJobNotification(message);
        } catch (error) {
          this.logger.error(`Failed to parse MQTT job notification: ${error}`);
        }
      });

      this.mqttSubscribed = true;
      this.logger.info(`MQTT job notifications initialized`);

    } catch (error) {
      this.logger.warn(`Failed to initialize MQTT subscriptions (will use HTTP fallback): ${error}`);
      this.mqttSubscribed = false;
    }
  }

  /**
   * Handle MQTT job notification
   */
  private async handleMqttJobNotification(message: any): Promise<void> {
    this.logger.debug(`Received MQTT job notification`);
    
    if (!message.execution) {
      this.logger.info(`No pending jobs available`);
      return;
    }

    const jobData: JobExecutionData = {
      jobId: message.execution.jobId,
      deviceUuid: message.execution.deviceUuid || message.execution.thingName || this.deviceUuid,
      jobDocument: message.execution.jobDocument,
      status: message.execution.status || 'QUEUED',
      queuedAt: message.execution.queuedAt ? new Date(message.execution.queuedAt) : undefined,
      startedAt: message.execution.startedAt ? new Date(message.execution.startedAt) : undefined,
      lastUpdatedAt: message.execution.lastUpdatedAt ? new Date(message.execution.lastUpdatedAt) : undefined,
      versionNumber: message.execution.versionNumber || 1,
      executionNumber: message.execution.executionNumber || 1,
      statusDetails: message.execution.statusDetails
    };

    if (this.isDuplicateNotification(jobData)) {
      this.logger.debug(`Ignoring duplicate job notification for job ${jobData.jobId}`);
      return;
    }

    await this.executeJob(jobData);
  }

  /**
   * Unsubscribe from MQTT topics
   */
  private async unsubscribeFromMqtt(): Promise<void> {
    try {
      const mqttManager = MqttManager.getInstance();
      const notifyTopic = `iot/device/${this.deviceUuid}/jobs/notify-next`;
      await mqttManager.unsubscribe(notifyTopic);
      this.mqttSubscribed = false;
      this.logger.info(`Unsubscribed from MQTT job notifications`);
    } catch (error) {
      this.logger.warn(`Failed to unsubscribe from MQTT: ${error}`);
    }
  }

  /**
   * Execute a job
   */
  private async executeJob(jobData: JobExecutionData): Promise<void> {
    if (this.needStop) {
      this.logger.info(`Ignoring job ${jobData.jobId} due to shutdown request`);
      return;
    }

    if (this.handlingJob) {
      this.logger.warn(`Already handling a job, ignoring job ${jobData.jobId}`);
      return;
    }

    this.handlingJob = true;
    this.latestJobNotification = jobData;

    try {
      this.logger.info(`Starting execution of job ${jobData.jobId}`);

      // Update job status to IN_PROGRESS
      await this.updateJobStatus(jobData.jobId, {
        status: 'IN_PROGRESS',
        status_details: {
          message: 'Job execution started',
          timestamp: new Date().toISOString()
        }
      });

      // Execute the job
      const config = this.config as JobsConfig;
      const result = await this.jobEngine.executeSteps(
        jobData.jobDocument,
        config.handlerDirectory || '/app/data/job-handlers'
      );

      // Update final job status
      const finalStatus = result.success ? 'SUCCEEDED' : 'FAILED';
      await this.updateJobStatus(jobData.jobId, {
        status: finalStatus,
        exit_code: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        status_details: {
          message: result.reason || (result.success ? 'Job completed successfully' : 'Job failed'),
          timestamp: new Date().toISOString()
        }
      });

      this.logger.info(`Job ${jobData.jobId} completed with status: ${finalStatus}`);

    } catch (error) {
      const errorMessage = `Job execution failed: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMessage);

      try {
        await this.updateJobStatus(jobData.jobId, {
          status: 'FAILED',
          stderr: errorMessage,
          status_details: {
            error: errorMessage,
            timestamp: new Date().toISOString()
          }
        });
      } catch (updateError) {
        this.logger.error(`Failed to update job status after error: ${updateError}`);
      }
    } finally {
      this.handlingJob = false;
    }
  }

  /**
   * Update job status (MQTT primary, HTTP fallback)
   */
  private async updateJobStatus(jobId: string, update: JobStatusUpdate): Promise<void> {
    const mqttManager = MqttManager.getInstance();
    let mqttSuccess = false;

    // Try MQTT first (primary method)
    if (mqttManager.isConnected()) {
      try {
        const updateTopic = `iot/device/${this.deviceUuid}/jobs/${jobId}/update`;
        
        this.logger.debug(`Updating job status via MQTT: ${updateTopic}`, { status: update.status });
        
        await mqttManager.publish(updateTopic, JSON.stringify(update), { qos: 1 });
        
        mqttSuccess = true;
        this.logger.debug(`Updated job ${jobId} status to ${update.status} via MQTT`);
        return; // Success, exit early
      } catch (error: any) {
        this.logger.warn(`MQTT status update failed, falling back to HTTP: ${error.message}`);
      }
    } else {
      this.logger.debug(`MQTT not connected, using HTTP for status update`);
    }

    // Fallback to HTTP if MQTT failed or not available
    const url = `/devices/${this.deviceUuid}/jobs/${jobId}/status`;
    try {
      this.logger.debug(`Updating job status via HTTP: PATCH ${url}`, { status: update.status });
      
      await this.httpClient.patch(url, update);
      
      this.logger.debug(`Updated job ${jobId} status to ${update.status} via HTTP`);
    } catch (error: any) {
      this.logger.error(`Failed to update job status (MQTT: ${mqttSuccess ? 'succeeded' : 'failed'}, HTTP: failed): ${error.message}`, {
        url,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Check if this is a duplicate job notification
   */
  private isDuplicateNotification(jobData: JobExecutionData): boolean {
    if (!this.latestJobNotification) {
      return false;
    }

    return this.latestJobNotification.jobId === jobData.jobId &&
           this.latestJobNotification.versionNumber === jobData.versionNumber &&
           this.latestJobNotification.executionNumber === jobData.executionNumber;
  }

  /**
   * Monitor MQTT connection and coordinate HTTP pause/resume
   */
  private startConnectionMonitor(): void {
    const mqttManager = MqttManager.getInstance();
    this.lastMqttState = mqttManager.isConnected();

    // Initially pause HTTP if MQTT is connected
    if (this.lastMqttState && this.mqttSubscribed) {
      this.httpPaused = true;
      this.logger.info(`MQTT connected - HTTP polling paused (MQTT-primary mode)`);
    }

    // Monitor MQTT connection every 5 seconds
    this.connectionMonitor = setInterval(() => {
      const currentMqttState = mqttManager.isConnected();

      // MQTT state changed
      if (currentMqttState !== this.lastMqttState) {
        if (currentMqttState && this.mqttSubscribed) {
          // MQTT reconnected - pause HTTP polling
          this.httpPaused = true;
          this.logger.info(`MQTT reconnected - switching to MQTT-primary mode`);
        } else {
          // MQTT disconnected - resume HTTP polling
          this.httpPaused = false;
          this.logger.warn(`MQTT disconnected - falling back to HTTP polling`);
        }

        this.lastMqttState = currentMqttState;
      }
    }, 5000); // Check every 5 seconds

    this.logger.info(`Connection monitor started - Initial mode: ${this.lastMqttState && this.mqttSubscribed ? 'MQTT-primary' : 'HTTP-fallback'}`);
  }

  /**
   * Utility method for async sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get the shared JobEngine instance
   */
  public getJobEngine(): JobEngine {
    return this.jobEngine;
  }

  /**
   * Check if MQTT jobs are active
   */
  public isMqttActive(): boolean {
    return this.mqttSubscribed && MqttManager.getInstance().isConnected();
  }

  /**
   * Check if HTTP jobs are active
   */
  public isHttpActive(): boolean {
    return !this.httpPaused;
  }

  /**
   * Get current delivery mode
   */
  public getCurrentMode(): 'mqtt' | 'http' {
    return this.isMqttActive() ? 'mqtt' : 'http';
  }
}
