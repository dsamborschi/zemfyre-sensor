import * as dotenv from 'dotenv';
import { MetricsCollector } from './metrics-collector';
import { BillingReporter } from './billing-reporter';
import { StripeUsageReporter } from './stripe-usage-reporter';
import { HealthServer } from './health-server';
import { logger } from './logger';

// Load environment variables
dotenv.config();

// Configuration
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus-kube-prometheus-prometheus.monitoring:9090';
const BILLING_API_URL = process.env.BILLING_API_URL || 'https://billing.Iotistic.com';
const CUSTOMER_ID = process.env.CUSTOMER_ID;
const INSTANCE_ID = process.env.INSTANCE_ID || 'k8s-cluster-1';
const NAMESPACE = process.env.NAMESPACE || 'default';
const COLLECTION_INTERVAL = parseInt(process.env.COLLECTION_INTERVAL || '3600000', 10); // 1 hour
const HEALTH_CHECK_PORT = parseInt(process.env.HEALTH_CHECK_PORT || '8080', 10);
const ENABLE_USAGE_REPORTING = process.env.ENABLE_USAGE_REPORTING === 'true'; // Feature flag

class BillingExporter {
  private collector: MetricsCollector;
  private reporter: BillingReporter;
  private usageReporter: StripeUsageReporter;
  private healthServer: HealthServer;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    // Validate required configuration
    if (!CUSTOMER_ID) {
      throw new Error('CUSTOMER_ID environment variable is required');
    }

    this.collector = new MetricsCollector(
      PROMETHEUS_URL,
      NAMESPACE,
      CUSTOMER_ID,
      INSTANCE_ID
    );

    this.reporter = new BillingReporter(BILLING_API_URL, CUSTOMER_ID);
    this.usageReporter = new StripeUsageReporter(BILLING_API_URL, CUSTOMER_ID);
    this.healthServer = new HealthServer(HEALTH_CHECK_PORT);
  }

  /**
   * Collect metrics and report to billing API
   */
  async collectAndReport() {
    try {
      logger.info('🔄 Starting billing export cycle...');

      // Collect metrics from Kubernetes
      const metrics = await this.collector.collect();

      // Report to billing API
      await this.reporter.report(metrics);

      // Report usage metrics if enabled
      if (ENABLE_USAGE_REPORTING) {
        logger.info('📊 Collecting usage metrics for metered billing...');
        const usageMetrics = await this.usageReporter.collectUsageMetrics();
        
        // Report to billing API (billing API will forward to Stripe)
        await this.usageReporter.reportToBillingApi(usageMetrics);
        
        logger.info('✅ Usage metrics reported', {
          devices: usageMetrics.deviceCount,
          mqtt_messages: usageMetrics.mqttMessageCount,
          storage_gb: usageMetrics.storageUsageGb
        });
      }

      // Update health status
      this.healthServer.setLastCollectionTime(new Date());
      this.healthServer.setReady(true);

      logger.info('✅ Billing export cycle completed successfully');
    } catch (error: any) {
      logger.error('❌ Billing export cycle failed', {
        error: error.message,
        stack: error.stack
      });

      this.healthServer.setLastCollectionError(error);
      
      // Don't set ready to false - we'll retry on next cycle
      // Only mark as not ready if we can't connect to Prometheus
      if (error.message.includes('Prometheus')) {
        this.healthServer.setReady(false);
      }
    }
  }

  /**
   * Start the exporter
   */
  async start() {
    logger.info('🚀 Starting Billing Exporter...', {
      prometheus_url: PROMETHEUS_URL,
      billing_api_url: BILLING_API_URL,
      customer_id: CUSTOMER_ID,
      instance_id: INSTANCE_ID,
      namespace: NAMESPACE,
      collection_interval_ms: COLLECTION_INTERVAL
    });

    // Start health check server
    this.healthServer.start();

    // Verify connectivity
    logger.info('🔍 Verifying connectivity...');
    
    const [prometheusHealthy, billingApiHealthy] = await Promise.all([
      this.collector.healthCheck(),
      this.reporter.healthCheck()
    ]);

    if (!prometheusHealthy) {
      logger.warn('⚠️  Prometheus health check failed - metrics collection may fail');
    } else {
      logger.info('✅ Prometheus is reachable');
    }

    if (!billingApiHealthy) {
      logger.warn('⚠️  Billing API health check failed - reporting may fail');
    } else {
      logger.info('✅ Billing API is reachable');
    }

    // Run initial collection
    await this.collectAndReport();

    // Schedule periodic collection
    this.intervalId = setInterval(() => {
      this.collectAndReport().catch(error => {
        logger.error('Scheduled collection failed', { error: error.message });
      });
    }, COLLECTION_INTERVAL);

    logger.info(`✅ Billing Exporter started - collecting every ${COLLECTION_INTERVAL / 1000 / 60} minutes`);
  }

  /**
   * Stop the exporter gracefully
   */
  stop() {
    logger.info('🛑 Stopping Billing Exporter...');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logger.info('✅ Billing Exporter stopped');
  }
}

// Main execution
const exporter = new BillingExporter();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal');
  exporter.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT signal');
  exporter.stop();
  process.exit(0);
});

// Handle unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Start the exporter
exporter.start().catch(error => {
  logger.error('Failed to start billing exporter', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
