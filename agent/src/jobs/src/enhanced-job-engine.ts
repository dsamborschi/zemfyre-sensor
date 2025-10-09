import { JobEngine } from './job-engine';
import { JobDocument, JobExecutionType, ActionResult } from './types';
import * as cron from 'node-cron';

/**
 * Enhanced Job Engine with support for recurring and continuous jobs
 * This is a simplified version demonstrating the concept - for production use,
 * you'd want more robust error handling and state management.
 */
export class EnhancedJobEngine extends JobEngine {
    private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
    private runningJobs: Map<string, NodeJS.Timeout> = new Map();
    private executionCounts: Map<string, number> = new Map();

    /**
     * Process a job with enhanced execution type support
     */
    public async processJob(jobDocument: JobDocument, jobId: string): Promise<ActionResult> {
        const executionType = jobDocument.executionType || JobExecutionType.ONE_TIME;

        switch (executionType) {
            case JobExecutionType.ONE_TIME:
                return await this.executeSteps(jobDocument, jobId);

            case JobExecutionType.RECURRING:
                return await this.scheduleRecurringJob(jobDocument, jobId);

            case JobExecutionType.CONTINUOUS:
                return await this.startContinuousJob(jobDocument, jobId);

            default:
                throw new Error(`Unsupported execution type: ${executionType}`);
        }
    }

    /**
     * Schedule a recurring job (simplified implementation)
     */
    private async scheduleRecurringJob(jobDocument: JobDocument, jobId: string): Promise<ActionResult> {
        if (!jobDocument.schedule) {
            throw new Error('Recurring job requires schedule configuration');
        }

        const schedule = jobDocument.schedule;
        const maxExecutions = jobDocument.maxExecutions;

        const executeJob = async () => {
            try {
                const currentCount = this.executionCounts.get(jobId) || 0;
                if (maxExecutions && currentCount >= maxExecutions) {
                    console.log(`Job ${jobId} reached maximum executions`);
                    this.stopRecurringJob(jobId);
                    return;
                }

                console.log(`Executing recurring job ${jobId} (execution #${currentCount + 1})`);
                await this.executeSteps(jobDocument, jobId);
                this.executionCounts.set(jobId, currentCount + 1);

            } catch (error) {
                console.error(`Error executing recurring job ${jobId}:`, error);
            }
        };

        // Simple interval-based scheduling
        if (schedule.type === 'interval' && schedule.intervalMinutes) {
            const intervalMs = schedule.intervalMinutes * 60 * 1000;
            const interval = setInterval(executeJob, intervalMs);
            this.runningJobs.set(jobId, interval);

            // Execute immediately if no start time specified
            if (!schedule.startTime) {
                await executeJob();
            }
        } else if (schedule.type === 'cron' && schedule.cronExpression) {
            const task = cron.schedule(schedule.cronExpression, executeJob);
            this.scheduledJobs.set(jobId, task);
        } else {
            throw new Error('Invalid schedule configuration');
        }

        return {
            success: true,
            stdout: `Recurring job ${jobId} scheduled successfully`,
            stderr: '',
            exitCode: 0
        };
    }

    /**
     * Start a continuous job (simplified implementation)
     */
    private async startContinuousJob(jobDocument: JobDocument, jobId: string): Promise<ActionResult> {
        console.log(`Starting continuous job ${jobId}`);

        try {
            // Execute the job steps immediately
            const result = await this.executeSteps(jobDocument, jobId);

            // Set up progress reporting if requested
            if (jobDocument.reportProgress) {
                const progressInterval = jobDocument.progressIntervalSeconds || 60;
                const progressTimer = setInterval(() => {
                    console.log(`Progress update for continuous job ${jobId}`);
                }, progressInterval * 1000);

                this.runningJobs.set(jobId, progressTimer);

                // Auto-stop after max duration if specified
                if (jobDocument.maxDurationMinutes) {
                    setTimeout(() => {
                        console.log(`Job ${jobId} reached maximum duration`);
                        this.stopContinuousJob(jobId);
                    }, jobDocument.maxDurationMinutes * 60 * 1000);
                }
            }

            return result;

        } catch (error) {
            console.error(`Error in continuous job ${jobId}:`, error);
            return {
                success: false,
                stdout: '',
                stderr: error instanceof Error ? error.message : String(error),
                exitCode: 1
            };
        }
    }

    /**
     * Stop a recurring job
     */
    public stopRecurringJob(jobId: string): void {
        const task = this.scheduledJobs.get(jobId);
        if (task) {
            task.stop();
            this.scheduledJobs.delete(jobId);
        }

        const interval = this.runningJobs.get(jobId);
        if (interval) {
            clearInterval(interval);
            this.runningJobs.delete(jobId);
        }

        this.executionCounts.delete(jobId);
        console.log(`Stopped recurring job: ${jobId}`);
    }

    /**
     * Stop a continuous job
     */
    public stopContinuousJob(jobId: string): void {
        const timer = this.runningJobs.get(jobId);
        if (timer) {
            clearInterval(timer);
            this.runningJobs.delete(jobId);
        }
        console.log(`Stopped continuous job: ${jobId}`);
    }

    /**
     * Stop all running jobs
     */
    public stopAllJobs(): void {
        for (const [, task] of this.scheduledJobs) {
            task.stop();
        }
        this.scheduledJobs.clear();

        for (const [, timer] of this.runningJobs) {
            clearInterval(timer);
        }
        this.runningJobs.clear();

        this.executionCounts.clear();
        console.log('All jobs stopped');
    }

    /**
     * Get status of all running jobs
     */
    public getJobStatus(): { [jobId: string]: any } {
        const status: { [jobId: string]: any } = {};

        for (const [jobId] of this.scheduledJobs) {
            status[jobId] = {
                type: 'recurring',
                running: true,
                executions: this.executionCounts.get(jobId) || 0
            };
        }

        for (const [jobId] of this.runningJobs) {
            if (!status[jobId]) {
                status[jobId] = {
                    type: 'continuous',
                    running: true
                };
            }
        }

        return status;
    }
}