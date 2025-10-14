import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { 
  Feature,
  JobExecutionData, 
  JobExecutionStatusInfo,
  JobStatus,
  JobsConfig,
  JobsTopics,
  MqttConnection,
  Logger,
  ClientBaseNotifier
} from './types';
import { JobEngine } from './job-engine';

/**
 * Jobs Feature - Main orchestrator for AWS IoT Jobs
 * Ported from C++ JobsFeature class
 */
export class JobsFeature extends EventEmitter implements Feature {
  private static readonly NAME = 'Jobs';
  private static readonly TAG = 'JobsFeature';
  private static readonly MAX_STATUS_DETAIL_LENGTH = 1024;

  private mqttConnection: MqttConnection;
  private logger: Logger;
  private notifier: ClientBaseNotifier;
  private config: JobsConfig;
  private jobEngine: JobEngine;
  private topics: JobsTopics;
  
  private needStop = false;
  private handlingJob = false;
  private latestJobNotification: JobExecutionData | null = null;
  private updatePromises = new Map<string, { resolve: Function; reject: Function }>();

  constructor(
    mqttConnection: MqttConnection,
    logger: Logger,
    notifier: ClientBaseNotifier,
    config: JobsConfig
  ) {
    super();
    this.mqttConnection = mqttConnection;
    this.logger = logger;
    this.notifier = notifier;
    this.config = config;
    this.jobEngine = new JobEngine(logger);
    this.topics = this.buildTopics(config.deviceUuid);
  }

  getName(): string {
    return JobsFeature.NAME;
  }

  /**
   * Start the Jobs feature
   * Ported from C++ start() method
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info(`${JobsFeature.TAG}: Jobs feature is disabled`);
      return;
    }

    this.logger.info(`${JobsFeature.TAG}: Starting Jobs feature for device: ${this.config.deviceUuid}`);
    
    try {
      // Subscribe to all necessary topics
      await this.subscribeToJobsTopics();
      
      // Request the next pending job
      await this.publishStartNextPendingJobExecutionRequest();
      
      this.notifier.onEvent(JobsFeature.NAME, 'FEATURE_STARTED');
      this.logger.info(`${JobsFeature.TAG}: Jobs feature started successfully`);
      
    } catch (error) {
      const errorMessage = `Failed to start Jobs feature: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(`${JobsFeature.TAG}: ${errorMessage}`);
      this.notifier.onError(JobsFeature.NAME, 'STARTUP_FAILED', errorMessage);
      throw error;
    }
  }

  /**
   * Stop the Jobs feature
   * Ported from C++ stop() method
   */
  async stop(): Promise<void> {
    this.logger.info(`${JobsFeature.TAG}: Stopping Jobs feature`);
    this.needStop = true;
    
    try {
      // Wait for current job to complete if running
      while (this.handlingJob) {
        await this.sleep(100);
      }
      
      // Unsubscribe from all topics
      await this.unsubscribeFromJobsTopics();
      
      this.notifier.onEvent(JobsFeature.NAME, 'FEATURE_STOPPED');
      this.logger.info(`${JobsFeature.TAG}: Jobs feature stopped successfully`);
      
    } catch (error) {
      const errorMessage = `Error stopping Jobs feature: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(`${JobsFeature.TAG}: ${errorMessage}`);
      this.notifier.onError(JobsFeature.NAME, 'SHUTDOWN_ERROR', errorMessage);
    }
  }

  /**
   * Subscribe to all Jobs-related MQTT topics
   */
  private async subscribeToJobsTopics(): Promise<void> {
    const subscriptions = [
      { topic: this.topics.startNextAccepted, handler: this.handleStartNextJobAccepted.bind(this) },
      { topic: this.topics.startNextRejected, handler: this.handleStartNextJobRejected.bind(this) },
      { topic: this.topics.updateAccepted, handler: this.handleUpdateJobExecutionAccepted.bind(this) },
      { topic: this.topics.updateRejected, handler: this.handleUpdateJobExecutionRejected.bind(this) },
      { topic: this.topics.notifyNext, handler: this.handleNextJobChanged.bind(this) }
    ];

    for (const sub of subscriptions) {
      try {
        await this.mqttConnection.subscribe(sub.topic, (topic: string, payload: Buffer) => {
          try {
            const message = JSON.parse(payload.toString());
            sub.handler(message);
          } catch (error) {
            this.logger.error(`${JobsFeature.TAG}: Failed to parse message on topic ${topic}: ${error}`);
          }
        });
        this.logger.debug(`${JobsFeature.TAG}: Subscribed to topic: ${sub.topic}`);
      } catch (error) {
        this.logger.error(`${JobsFeature.TAG}: Failed to subscribe to topic ${sub.topic}: ${error}`);
        throw error;
      }
    }
  }

  /**
   * Unsubscribe from all Jobs-related MQTT topics
   */
  private async unsubscribeFromJobsTopics(): Promise<void> {
    const topics = [
      this.topics.startNextAccepted,
      this.topics.startNextRejected,
      this.topics.updateAccepted,
      this.topics.updateRejected,
      this.topics.notifyNext
    ];

    for (const topic of topics) {
      try {
        await this.mqttConnection.unsubscribe(topic);
        this.logger.debug(`${JobsFeature.TAG}: Unsubscribed from topic: ${topic}`);
      } catch (error) {
        this.logger.warn(`${JobsFeature.TAG}: Failed to unsubscribe from topic ${topic}: ${error}`);
      }
    }
  }

  /**
   * Publish a request to start the next pending job execution
   * Ported from C++ publishStartNextPendingJobExecutionRequest
   */
  private async publishStartNextPendingJobExecutionRequest(): Promise<void> {
    const request = {
      clientToken: randomUUID()
    };

    const payload = JSON.stringify(request);
    
    try {
      await this.mqttConnection.publish(this.topics.startNext, payload);
      this.logger.debug(`${JobsFeature.TAG}: Published StartNextPendingJobExecution request`);
    } catch (error) {
      this.logger.error(`${JobsFeature.TAG}: Failed to publish StartNextPendingJobExecution request: ${error}`);
      throw error;
    }
  }

  /**
   * Update job execution status
   * Ported from C++ publishUpdateJobExecutionStatus
   */
  private async publishUpdateJobExecutionStatus(
    jobData: JobExecutionData,
    statusInfo: JobExecutionStatusInfo
  ): Promise<void> {
    const statusDetails: Record<string, string> = {};
    
    if (statusInfo.reason) {
      statusDetails.reason = this.truncateStatusDetail(statusInfo.reason);
    }
    
    if (statusInfo.stdOutput && jobData.jobDocument.includeStdOut) {
      statusDetails.stdout = this.truncateStatusDetail(statusInfo.stdOutput);
    }
    
    if (statusInfo.stdError) {
      statusDetails.stderr = this.truncateStatusDetail(statusInfo.stdError);
    }

    const updateRequest = {
      status: statusInfo.status,
      statusDetails,
      expectedVersion: jobData.versionNumber,
      executionNumber: jobData.executionNumber,
      clientToken: randomUUID()
    };

    const topic = `$iot/device/${this.config.deviceUuid}/jobs/${jobData.jobId}/update`;
    const payload = JSON.stringify(updateRequest);

    try {
      await this.mqttConnection.publish(topic, payload);
      this.logger.info(`${JobsFeature.TAG}: Published job status update for job ${jobData.jobId}: ${statusInfo.status}`);
    } catch (error) {
      this.logger.error(`${JobsFeature.TAG}: Failed to publish job status update: ${error}`);
      throw error;
    }
  }

  /**
   * Handle StartNextJobAccepted response
   * Ported from C++ startNextPendingJobReceivedHandler
   */
  private async handleStartNextJobAccepted(response: any): Promise<void> {
    this.logger.debug(`${JobsFeature.TAG}: Received StartNextJobAccepted response`);
    
    if (!response.execution) {
      this.logger.info(`${JobsFeature.TAG}: No pending jobs available`);
      return;
    }

    const jobData: JobExecutionData = {
      jobId: response.execution.jobId,
      deviceUuid: response.execution.deviceUuid || response.execution.thingName,
      jobDocument: response.execution.jobDocument,
      status: response.execution.status,
      queuedAt: response.execution.queuedAt ? new Date(response.execution.queuedAt) : undefined,
      startedAt: response.execution.startedAt ? new Date(response.execution.startedAt) : undefined,
      lastUpdatedAt: response.execution.lastUpdatedAt ? new Date(response.execution.lastUpdatedAt) : undefined,
      versionNumber: response.execution.versionNumber,
      executionNumber: response.execution.executionNumber,
      statusDetails: response.execution.statusDetails || undefined
    };

    if (this.isDuplicateNotification(jobData)) {
      this.logger.debug(`${JobsFeature.TAG}: Ignoring duplicate job notification for job ${jobData.jobId}`);
      return;
    }

    await this.executeJob(jobData);
  }

  /**
   * Handle StartNextJobRejected response
   * Ported from C++ startNextPendingJobRejectedHandler
   */
  private handleStartNextJobRejected(error: any): void {
    this.logger.error(`${JobsFeature.TAG}: StartNextJob request rejected: ${JSON.stringify(error)}`);
    this.notifier.onError(JobsFeature.NAME, 'START_JOB_REJECTED', `Start job request rejected: ${error.message || 'Unknown error'}`);
  }

  /**
   * Handle job execution update accepted
   * Ported from C++ updateJobExecutionStatusAcceptedHandler
   */
  private handleUpdateJobExecutionAccepted(response: any): void {
    this.logger.debug(`${JobsFeature.TAG}: Job execution update accepted for job ${response.jobId}`);
    
    if (response.clientToken && this.updatePromises.has(response.clientToken)) {
      const promise = this.updatePromises.get(response.clientToken);
      promise?.resolve(response);
      this.updatePromises.delete(response.clientToken);
    }
  }

  /**
   * Handle job execution update rejected
   * Ported from C++ updateJobExecutionStatusRejectedHandler
   */
  private handleUpdateJobExecutionRejected(error: any): void {
    this.logger.error(`${JobsFeature.TAG}: Job execution update rejected: ${JSON.stringify(error)}`);
    
    if (error.clientToken && this.updatePromises.has(error.clientToken)) {
      const promise = this.updatePromises.get(error.clientToken);
      promise?.reject(new Error(`Update rejected: ${error.message || 'Unknown error'}`));
      this.updatePromises.delete(error.clientToken);
    }
  }

  /**
   * Handle next job changed notification
   * Ported from C++ nextJobChangedHandler
   */
  private async handleNextJobChanged(event: any): Promise<void> {
    this.logger.debug(`${JobsFeature.TAG}: Next job changed notification received`);
    
    if (event.execution) {
      const jobData: JobExecutionData = {
        jobId: event.execution.jobId,
        deviceUuid: event.execution.deviceUuid || event.execution.thingName,
        jobDocument: event.execution.jobDocument,
        status: event.execution.status,
        queuedAt: event.execution.queuedAt ? new Date(event.execution.queuedAt) : undefined,
        startedAt: event.execution.startedAt ? new Date(event.execution.startedAt) : undefined,
        lastUpdatedAt: event.execution.lastUpdatedAt ? new Date(event.execution.lastUpdatedAt) : undefined,
        versionNumber: event.execution.versionNumber,
        executionNumber: event.execution.executionNumber,
        statusDetails: event.execution.statusDetails || undefined
      };

      if (!this.isDuplicateNotification(jobData)) {
        await this.executeJob(jobData);
      }
    } else {
      this.logger.info(`${JobsFeature.TAG}: No more jobs to execute`);
    }
  }

  /**
   * Execute a job
   * Ported from C++ executeJob method
   */
  private async executeJob(jobData: JobExecutionData): Promise<void> {
    if (this.needStop) {
      this.logger.info(`${JobsFeature.TAG}: Ignoring job ${jobData.jobId} due to shutdown request`);
      return;
    }

    if (this.handlingJob) {
      this.logger.warn(`${JobsFeature.TAG}: Already handling a job, ignoring job ${jobData.jobId}`);
      return;
    }

    this.handlingJob = true;
    this.latestJobNotification = jobData;

    try {
      this.logger.info(`${JobsFeature.TAG}: Starting execution of job ${jobData.jobId}`);

      // Update job status to IN_PROGRESS
      await this.publishUpdateJobExecutionStatus(jobData, {
        status: JobStatus.IN_PROGRESS,
        reason: 'Job execution started'
      });

      // Execute the job
      const result = await this.jobEngine.executeSteps(jobData.jobDocument, this.config.handlerDirectory);

      // Update final job status
      const finalStatus = result.success ? JobStatus.SUCCEEDED : JobStatus.FAILED;
      await this.publishUpdateJobExecutionStatus(jobData, {
        status: finalStatus,
        reason: result.reason,
        stdOutput: result.stdout,
        stdError: result.stderr
      });

      this.logger.info(`${JobsFeature.TAG}: Job ${jobData.jobId} completed with status: ${finalStatus}`);

    } catch (error) {
      const errorMessage = `Job execution failed: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(`${JobsFeature.TAG}: ${errorMessage}`);

      try {
        await this.publishUpdateJobExecutionStatus(jobData, {
          status: JobStatus.FAILED,
          reason: errorMessage,
          stdError: errorMessage
        });
      } catch (updateError) {
        this.logger.error(`${JobsFeature.TAG}: Failed to update job status after error: ${updateError}`);
      }

      this.notifier.onError(JobsFeature.NAME, 'JOB_EXECUTION_FAILED', errorMessage);
    } finally {
      this.handlingJob = false;
    }
  }

  /**
   * Check if this is a duplicate job notification
   * Ported from C++ isDuplicateNotification method
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
   * Build MQTT topic patterns for the given device UUID
   */
  private buildTopics(deviceUuid: string): JobsTopics {
    return {
      startNext: `$iot/device/${deviceUuid}/jobs/start-next`,
      startNextAccepted: `$iot/device/${deviceUuid}/jobs/start-next/accepted`,
      startNextRejected: `$iot/device/${deviceUuid}/jobs/start-next/rejected`,
      updateAccepted: `$iot/device/${deviceUuid}/jobs/+/update/accepted`,
      updateRejected: `$iot/device/${deviceUuid}/jobs/+/update/rejected`,
      notifyNext: `$iot/device/${deviceUuid}/jobs/notify-next`
    };
  }

  /**
   * Truncate status detail to fit AWS IoT Jobs API limits
   */
  private truncateStatusDetail(detail: string): string {
    if (detail.length <= JobsFeature.MAX_STATUS_DETAIL_LENGTH) {
      return detail;
    }
    
    return detail.substring(0, JobsFeature.MAX_STATUS_DETAIL_LENGTH - 20) + '... [truncated]';
  }

  /**
   * Utility method for async sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}