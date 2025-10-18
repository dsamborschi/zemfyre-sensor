/**
 * Cloud Jobs Adapter
 * 
 * Bridges the gap between device-side job execution (JobEngine) and cloud-based
 * job management. Polls the cloud API for pending jobs and reports status back.
 * 
 * This replaces the MQTT-based AWS IoT Jobs approach with HTTP polling for
 * simpler cloud integration.
 */

import axios, { AxiosInstance } from 'axios';
import { JobEngine } from './src/job-engine';
import { JobDocument, JobExecutionData } from './src/types';

export interface CloudJobsAdapterConfig {
  cloudApiUrl: string;
  deviceUuid: string;
  deviceApiKey?: string;
  pollingIntervalMs?: number;
  maxRetries?: number;
  enableLogging?: boolean;
}

export interface CloudJob {
  job_id: string;
  job_name: string;
  job_document: JobDocument;
  timeout_seconds: number;
  created_at: string;
}

export interface JobStatusUpdate {
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

export class CloudJobsAdapter {
  private polling: boolean = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private currentJobId: string | null = null;
  private httpClient: AxiosInstance;
  private config: Required<CloudJobsAdapterConfig>;
  private apiVersion: string;

  constructor(
    config: CloudJobsAdapterConfig,
    private jobEngine: JobEngine
  ) {
    // Set defaults
    this.config = {
      cloudApiUrl: config.cloudApiUrl,
      deviceUuid: config.deviceUuid,
      deviceApiKey: config.deviceApiKey || '',
      pollingIntervalMs: config.pollingIntervalMs || 30000, // 30 seconds default
      maxRetries: config.maxRetries || 3,
      enableLogging: config.enableLogging !== false // Default true
    };
    
    // Get API version from environment or default to v1
    this.apiVersion = process.env.API_VERSION || 'v1';

    // Create HTTP client
    this.httpClient = axios.create({
      baseURL: this.config.cloudApiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `zemfyre-agent/${this.config.deviceUuid}`,
        'X-Device-API-Key': this.config.deviceApiKey || ''
      }
    });

    this.log('CloudJobsAdapter initialized', {
      cloudApiUrl: this.config.cloudApiUrl,
      deviceUuid: this.config.deviceUuid,
      pollingIntervalMs: this.config.pollingIntervalMs,
      hasApiKey: !!this.config.deviceApiKey,
      apiKeyLength: this.config.deviceApiKey?.length || 0
    });
  }

  /**
   * Start polling for jobs
   */
  start(): void {
    if (this.polling) {
      this.log('Already polling, ignoring start request');
      return;
    }

    this.polling = true;
    this.log('Starting job polling');

    // Poll immediately, then at intervals
    this.poll();
    this.pollingInterval = setInterval(() => this.poll(), this.config.pollingIntervalMs);
  }

  /**
   * Stop polling for jobs
   */
  stop(): void {
    if (!this.polling) {
      return;
    }

    this.polling = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.log('Stopped job polling');
  }

  /**
   * Poll for next pending job
   */
  private async poll(): Promise<void> {
    if (!this.polling) {
      return;
    }

    // Don't poll if already executing a job
    if (this.currentJobId) {
      this.log('Job currently executing, skipping poll', { currentJobId: this.currentJobId });
      return;
    }

    try {
      this.log('Polling for jobs', {
        endpoint: `/api/${this.apiVersion}/devices/${this.config.deviceUuid}/jobs/next`,
        hasApiKey: !!this.config.deviceApiKey
      }, 'debug');
      
      const response = await this.httpClient.get<CloudJob>(
        `/api/${this.apiVersion}/devices/${this.config.deviceUuid}/jobs/next`
      );

      // Check if there's a job
      if (response.data && response.data.job_id) {
        this.log('Received job from cloud', {
          jobId: response.data.job_id,
          jobName: response.data.job_name
        });
        
        await this.executeJob(response.data);
      } else {
        this.log('No pending jobs', undefined, 'debug');
      }
    } catch (error: any) {
      if (error.response?.status === 404 || error.response?.data?.message === 'No pending jobs') {
        // No jobs available - this is normal, not an error
        this.log('No pending jobs', undefined, 'debug');
      } else {
        this.log('Poll error', {
          error: error.message,
          status: error.response?.status,
          data: error.response?.data
        }, 'error');
      }
    }
  }

  /**
   * Execute a job received from cloud
   */
  private async executeJob(job: CloudJob): Promise<void> {
    this.currentJobId = job.job_id;

    try {
      this.log('Starting job execution', {
        jobId: job.job_id,
        jobName: job.job_name,
        steps: job.job_document.steps?.length || 0
      });

      // Report IN_PROGRESS status
      await this.updateJobStatus({
        status: 'IN_PROGRESS',
        status_details: {
          message: 'Job execution started',
          timestamp: new Date().toISOString()
        }
      });

      // Execute the job document using JobEngine
      const startTime = Date.now();
      
      // Execute job document
      const jobHandlerDir = process.env.JOB_HANDLER_DIR || '/app/data/job-handlers';
      const result = await this.jobEngine.executeSteps(job.job_document, jobHandlerDir);
      const duration = Date.now() - startTime;

      this.log('Job execution completed', {
        jobId: job.job_id,
        exitCode: result.exitCode,
        duration: `${duration}ms`
      });

      // Check exit code to determine success/failure (0 = success, non-zero = failure)
      const isSuccess = (result.exitCode || 0) === 0;
      
      await this.updateJobStatus({
        status: isSuccess ? 'SUCCEEDED' : 'FAILED',
        exit_code: result.exitCode || 0,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        status_details: {
          message: isSuccess ? 'Job completed successfully' : 'Job failed with non-zero exit code',
          duration: duration,
          completedAt: new Date().toISOString()
        }
      });

    } catch (error: any) {
      this.log('Job execution failed', {
        jobId: job.job_id,
        error: error.message
      }, 'error');

      // Report failure
      try {
        await this.updateJobStatus({
          status: 'FAILED',
          exit_code: error.exitCode || 1,
          stdout: error.stdout || '',
          stderr: error.stderr || error.message,
          status_details: {
            message: error.message,
            error: error.toString(),
            timestamp: new Date().toISOString()
          }
        });
      } catch (statusError: any) {
        this.log('Failed to report job failure', {
          jobId: job.job_id,
          error: statusError.message
        }, 'error');
      }
    } finally {
      // Clear current job
      this.currentJobId = null;
    }
  }

  /**
   * Update job status on cloud
   */
  private async updateJobStatus(update: JobStatusUpdate, retryCount: number = 0): Promise<void> {
    if (!this.currentJobId) {
      this.log('No current job to update status for', undefined, 'warn');
      return;
    }

    try {
      await this.httpClient.patch(
        `/api/${this.apiVersion}/devices/${this.config.deviceUuid}/jobs/${this.currentJobId}/status`,
        update
      );

      this.log('Job status updated', {
        jobId: this.currentJobId,
        status: update.status
      }, 'debug');
    } catch (error: any) {
      this.log('Failed to update job status', {
        jobId: this.currentJobId,
        status: update.status,
        error: error.message,
        retryCount
      }, 'error');

      // Retry with exponential backoff
      if (retryCount < this.config.maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        this.log(`Retrying status update in ${delay}ms`, { retryCount: retryCount + 1 });
        
        await new Promise(resolve => setTimeout(resolve, delay));
        await this.updateJobStatus(update, retryCount + 1);
      } else {
        this.log('Max retries reached for status update', { jobId: this.currentJobId }, 'error');
      }
    }
  }

  /**
   * Get current polling status
   */
  getStatus(): {
    polling: boolean;
    currentJobId: string | null;
    config: CloudJobsAdapterConfig;
  } {
    return {
      polling: this.polling,
      currentJobId: this.currentJobId,
      config: {
        cloudApiUrl: this.config.cloudApiUrl,
        deviceUuid: this.config.deviceUuid,
        pollingIntervalMs: this.config.pollingIntervalMs,
        maxRetries: this.config.maxRetries,
        enableLogging: this.config.enableLogging
      }
    };
  }

  /**
   * Manual job status query
   */
  async queryJobStatus(jobId: string): Promise<any> {
    try {
      const response = await this.httpClient.get(
        `/api/${this.apiVersion}/devices/${this.config.deviceUuid}/jobs/${jobId}`
      );
      return response.data;
    } catch (error: any) {
      this.log('Failed to query job status', {
        jobId,
        error: error.message
      }, 'error');
      throw error;
    }
  }

  /**
   * Get job history for this device
   */
  async getJobHistory(limit: number = 10): Promise<any> {
    try {
      const response = await this.httpClient.get(
        `/api/${this.apiVersion}/devices/${this.config.deviceUuid}/jobs`,
        { params: { limit } }
      );
      return response.data;
    } catch (error: any) {
      this.log('Failed to get job history', {
        error: error.message
      }, 'error');
      throw error;
    }
  }

  /**
   * Logging helper
   */
  private log(message: string, data?: any, level: 'info' | 'warn' | 'error' | 'debug' = 'info'): void {
    if (!this.config.enableLogging) {
      return;
    }

    const timestamp = new Date().toISOString();
    const prefix = '[CloudJobsAdapter]';

    const logData = data ? ` ${JSON.stringify(data)}` : '';

    switch (level) {
      case 'error':
        console.error(`${timestamp} ${prefix} ❌ ${message}${logData}`);
        break;
      case 'warn':
        console.warn(`${timestamp} ${prefix} ⚠️  ${message}${logData}`);
        break;
      case 'debug':
        // Only log debug in verbose mode
        if (process.env.DEBUG === 'true') {
          console.debug(`${timestamp} ${prefix} 🔍 ${message}${logData}`);
        }
        break;
      default:
        console.log(`${timestamp} ${prefix} ${message}${logData}`);
    }
  }
}
