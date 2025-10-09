import { EnhancedJobEngine } from '../src/enhanced-job-engine';
import { JobDocument, JobExecutionType, ActionType } from '../src/types';

/**
 * Example demonstrating different job execution types:
 * - One-time jobs (default)
 * - Recurring jobs 
 * - Continuous jobs
 */

async function demonstrateJobTypes() {
    // Create job engine with required handler directory
    const jobEngine = new EnhancedJobEngine('./sample-job-handlers');

    console.log('=== Job Types Demonstration ===\n');

    // 1. One-time job (default behavior)
    console.log('1. ONE-TIME JOB:');
    const oneTimeJob: JobDocument = {
        version: '1.0',
        executionType: JobExecutionType.ONE_TIME,
        steps: [
            {
                name: 'health-check',
                type: ActionType.RUN_HANDLER,
                input: {
                    handler: 'health-check'
                },
                ignoreStepFailure: false,
                runAsUser: 'root'
            }
        ]
    };

    console.log('One-time job: Executes once and reports completion');

    console.log('\n2. RECURRING JOB:');
    const recurringJob: JobDocument = {
        version: '1.0',
        executionType: JobExecutionType.RECURRING,
        schedule: {
            type: 'interval',
            intervalMinutes: 5  // Every 5 minutes
        },
        maxExecutions: 10,      // Stop after 10 executions
        reportProgress: true,
        steps: [
            {
                name: 'health-check',
                type: ActionType.RUN_HANDLER,
                input: {
                    handler: 'health-check'
                },
                ignoreStepFailure: false,
                runAsUser: 'root'
            }
        ]
    };

    console.log('Recurring job: Executes every 5 minutes, up to 10 times');

    console.log('\n3. CONTINUOUS JOB:');
    const continuousJob: JobDocument = {
        version: '1.0',
        executionType: JobExecutionType.CONTINUOUS,
        maxDurationMinutes: 60,     // Run for 1 hour max
        reportProgress: true,
        progressIntervalSeconds: 300, // Report progress every 5 minutes
        steps: [
            {
                name: 'system-monitor',
                type: ActionType.RUN_COMMAND,
                input: {
                    command: 'echo "Monitoring system..."'
                },
                ignoreStepFailure: false,
                runAsUser: 'root'
            }
        ]
    };

    console.log('Continuous job: Runs continuously for up to 1 hour with progress reports');

    console.log('\n4. CRON-BASED RECURRING JOB:');
    const cronJob: JobDocument = {
        version: '1.0',
        executionType: JobExecutionType.RECURRING,
        schedule: {
            type: 'cron',
            cronExpression: '0 */6 * * *'  // Every 6 hours
        },
        maxExecutions: 20,  // Stop after 20 executions (5 days)
        steps: [
            {
                name: 'echo',
                type: ActionType.RUN_COMMAND,
                input: {
                    command: 'echo "Scheduled maintenance check completed"'
                },
                ignoreStepFailure: false,
                runAsUser: 'root'
            }
        ]
    };

    console.log('Cron job: Executes every 6 hours using cron expression');

    console.log('\n=== COMPARISON ===');
    console.log(`
    ┌─────────────┬─────────────────┬──────────────────┬─────────────────┐
    │ Job Type    │ Execution       │ Use Cases        │ AWS IoT Status  │
    ├─────────────┼─────────────────┼──────────────────┼─────────────────┤
    │ One-Time    │ Execute once    │ Updates, config  │ Standard Jobs   │
    │             │ and complete    │ changes, reboots │                 │
    ├─────────────┼─────────────────┼──────────────────┼─────────────────┤
    │ Recurring   │ Execute on      │ Health checks,   │ Multiple Jobs   │
    │             │ schedule until  │ maintenance,     │ (scheduled)     │
    │             │ limit reached   │ monitoring       │                 │
    ├─────────────┼─────────────────┼──────────────────┼─────────────────┤
    │ Continuous  │ Long-running    │ Data collection, │ Long Jobs with  │
    │             │ with progress   │ streaming,       │ progress        │
    │             │ reports         │ real-time apps   │                 │
    └─────────────┴─────────────────┴──────────────────┴─────────────────┘
    `);

    console.log('\n=== IMPLEMENTATION NOTES ===');
    console.log('• One-time jobs: Use standard AWS IoT Jobs (most common)');
    console.log('• Recurring jobs: Implemented via job scheduling on device');
    console.log('• Continuous jobs: Long-running with periodic progress updates');
    console.log('• All types can report progress and be cancelled remotely');

    return {
        oneTimeJob,
        recurringJob,
        continuousJob,
        cronJob
    };
}

// Export for use in other examples
export { demonstrateJobTypes };

// Run demonstration if called directly
async function main() {
    try {
        await demonstrateJobTypes();
    } catch (error) {
        console.error('Demo error:', error);
    }
}

if (typeof require !== 'undefined' && require.main === module) {
    main();
}