/**
 * Configuration for Image Update Management
 */

export interface ImageUpdateConfig {
  /** Default update strategy if not specified in policy */
  DEFAULT_STRATEGY: 'auto' | 'staged' | 'manual' | 'scheduled';
  
  /** Default batch percentages for staged rollouts */
  STAGED_BATCHES: number[];
  
  /** Default delay between batches (minutes) */
  BATCH_DELAY_MINUTES: number;
  
  /** Timeout for health checks (seconds) */
  HEALTH_CHECK_TIMEOUT: number;
  
  /** Maximum failure rate before pausing rollout (0-1) */
  MAX_FAILURE_RATE: number;
  
  /** Enable automatic rollback on health check failures */
  AUTO_ROLLBACK: boolean;
  
  /** Maximum retry attempts for failed updates */
  MAX_RETRY_ATTEMPTS: number;
  
  /** Delay before retry (minutes) */
  RETRY_DELAY_MINUTES: number;
  
  /** Webhook secret for Docker Hub/GHCR verification */
  WEBHOOK_SECRET: string | undefined;
  
  /** Enable webhook signature verification */
  VERIFY_WEBHOOK_SIGNATURE: boolean;
}

export const imageUpdateConfig: ImageUpdateConfig = {
  DEFAULT_STRATEGY: 'staged',
  
  // Staged rollout: 10% → 50% → 100%
  STAGED_BATCHES: [0.1, 0.5, 1.0],
  
  // 30 minutes between batches by default
  BATCH_DELAY_MINUTES: 30,
  
  // 5 minute timeout for health checks
  HEALTH_CHECK_TIMEOUT: 300,
  
  // Pause if more than 20% of devices fail
  MAX_FAILURE_RATE: 0.2,
  
  // Auto-rollback failed devices
  AUTO_ROLLBACK: true,
  
  // Retry failed updates up to 3 times
  MAX_RETRY_ATTEMPTS: 3,
  
  // Wait 15 minutes before retry
  RETRY_DELAY_MINUTES: 15,
  
  // Optional webhook secret from environment
  WEBHOOK_SECRET: process.env.DOCKER_WEBHOOK_SECRET,
  
  // Verify webhook signatures if secret is set
  VERIFY_WEBHOOK_SIGNATURE: !!process.env.DOCKER_WEBHOOK_SECRET,
};

/**
 * Get config summary for logging
 */
export function getImageUpdateConfigSummary(): string {
  return JSON.stringify({
    strategy: imageUpdateConfig.DEFAULT_STRATEGY,
    batches: imageUpdateConfig.STAGED_BATCHES,
    batchDelay: `${imageUpdateConfig.BATCH_DELAY_MINUTES}m`,
    healthCheckTimeout: `${imageUpdateConfig.HEALTH_CHECK_TIMEOUT}s`,
    maxFailureRate: `${imageUpdateConfig.MAX_FAILURE_RATE * 100}%`,
    autoRollback: imageUpdateConfig.AUTO_ROLLBACK,
    webhookVerification: imageUpdateConfig.VERIFY_WEBHOOK_SIGNATURE,
  }, null, 2);
}
