import axios, { AxiosInstance } from 'axios';
import { UsageMetrics } from './metrics-collector';
import { logger } from './logger';

export class BillingReporter {
  private client: AxiosInstance;
  private billingApiUrl: string;
  private customerId: string;

  constructor(billingApiUrl: string, customerId: string) {
    this.billingApiUrl = billingApiUrl;
    this.customerId = customerId;
    
    this.client = axios.create({
      baseURL: billingApiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Customer-ID': customerId
      }
    });
  }

  /**
   * Report usage metrics to billing API
   */
  async report(metrics: UsageMetrics): Promise<void> {
    logger.info('📤 Reporting usage to billing API...', {
      customer_id: metrics.customer_id,
      instance_id: metrics.instance_id
    });

    try {
      const response = await this.client.post('/api/usage/report', metrics);

      if (response.status === 200 || response.status === 201) {
        logger.info('✅ Usage reported successfully', {
          customer_id: metrics.customer_id,
          timestamp: metrics.timestamp
        });
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error: any) {
      if (error.response) {
        logger.error('❌ Failed to report usage - API error', {
          status: error.response.status,
          error: error.response.data?.error || error.message,
          customer_id: metrics.customer_id
        });
      } else if (error.request) {
        logger.error('❌ Failed to report usage - Network error', {
          error: error.message,
          billing_api: this.billingApiUrl
        });
      } else {
        logger.error('❌ Failed to report usage', {
          error: error.message
        });
      }
      throw error;
    }
  }

  /**
   * Health check - verify billing API is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      logger.warn('Billing API health check failed', { error });
      return false;
    }
  }
}
