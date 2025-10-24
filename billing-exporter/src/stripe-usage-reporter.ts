import Stripe from 'stripe';
import axios from 'axios';
import { logger } from './logger';

export interface UsageMetrics {
  deviceCount: number;
  mqttMessageCount: number;
  storageUsageGb: number;
  apiRequestCount: number;
  timestamp: Date;
}

export class StripeUsageReporter {
  private stripe: Stripe | null = null;
  private billingApiUrl: string;
  private customerId: string;

  constructor(billingApiUrl: string, customerId: string) {
    this.billingApiUrl = billingApiUrl;
    this.customerId = customerId;

    // Initialize Stripe if key is available (optional - can also report to billing API)
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey) {
      this.stripe = new Stripe(stripeKey, {
        apiVersion: '2024-12-18.acacia'
      });
      logger.info('✅ Stripe client initialized for direct usage reporting');
    } else {
      logger.info('ℹ️  No Stripe key - will report usage to billing API instead');
    }
  }

  /**
   * Collect usage metrics from Prometheus
   */
  async collectUsageMetrics(): Promise<UsageMetrics> {
    // Get device count from API
    const deviceCount = await this.getDeviceCount();
    
    // Get MQTT message count from Prometheus
    const mqttMessageCount = await this.getMqttMessageCount();
    
    // Get storage usage from Prometheus
    const storageUsageGb = await this.getStorageUsage();
    
    // Get API request count from Prometheus
    const apiRequestCount = await this.getApiRequestCount();

    return {
      deviceCount,
      mqttMessageCount,
      storageUsageGb,
      apiRequestCount,
      timestamp: new Date()
    };
  }

  /**
   * Get active device count from customer API
   */
  private async getDeviceCount(): Promise<number> {
    try {
      // TODO: Replace with actual customer API endpoint
      const apiUrl = process.env.CUSTOMER_API_URL || 'http://api:3002';
      const response = await axios.get(`${apiUrl}/api/devices/count`, {
        timeout: 5000
      });
      
      return response.data.count || 0;
    } catch (error: any) {
      logger.warn('Failed to get device count', { error: error.message });
      return 0;
    }
  }

  /**
   * Get MQTT message count from Prometheus
   */
  private async getMqttMessageCount(): Promise<number> {
    try {
      const prometheusUrl = process.env.PROMETHEUS_URL || 'http://prometheus-kube-prometheus-prometheus.monitoring:9090';
      
      // Query for total MQTT messages in last hour
      const query = encodeURIComponent(
        'sum(increase(mosquitto_messages_received_total[1h]))'
      );
      
      const response = await axios.get(
        `${prometheusUrl}/api/v1/query?query=${query}`,
        { timeout: 5000 }
      );

      const result = response.data?.data?.result?.[0]?.value?.[1];
      return result ? parseInt(result, 10) : 0;
    } catch (error: any) {
      logger.warn('Failed to get MQTT message count from Prometheus', { 
        error: error.message 
      });
      return 0;
    }
  }

  /**
   * Get storage usage from Prometheus (PostgreSQL + InfluxDB)
   */
  private async getStorageUsage(): Promise<number> {
    try {
      const prometheusUrl = process.env.PROMETHEUS_URL || 'http://prometheus-kube-prometheus-prometheus.monitoring:9090';
      
      // Query for PVC usage
      const query = encodeURIComponent(
        'sum(kubelet_volume_stats_used_bytes) / (1024^3)'
      );
      
      const response = await axios.get(
        `${prometheusUrl}/api/v1/query?query=${query}`,
        { timeout: 5000 }
      );

      const result = response.data?.data?.result?.[0]?.value?.[1];
      return result ? parseFloat(result).toFixed(2) : 0;
    } catch (error: any) {
      logger.warn('Failed to get storage usage from Prometheus', { 
        error: error.message 
      });
      return 0;
    }
  }

  /**
   * Get API request count from Prometheus
   */
  private async getApiRequestCount(): Promise<number> {
    try {
      const prometheusUrl = process.env.PROMETHEUS_URL || 'http://prometheus-kube-prometheus-prometheus.monitoring:9090';
      
      // Query for API requests in last hour
      const query = encodeURIComponent(
        'sum(increase(http_requests_total[1h]))'
      );
      
      const response = await axios.get(
        `${prometheusUrl}/api/v1/query?query=${query}`,
        { timeout: 5000 }
      );

      const result = response.data?.data?.result?.[0]?.value?.[1];
      return result ? parseInt(result, 10) : 0;
    } catch (error: any) {
      logger.warn('Failed to get API request count from Prometheus', { 
        error: error.message 
      });
      return 0;
    }
  }

  /**
   * Report usage to Stripe (if Stripe client is available)
   */
  async reportToStripe(metrics: UsageMetrics): Promise<void> {
    if (!this.stripe) {
      logger.debug('Skipping direct Stripe reporting - no Stripe client');
      return;
    }

    try {
      // Get customer's subscription from billing API
      const subscription = await this.getCustomerSubscription();
      
      if (!subscription) {
        logger.warn('No active subscription found for customer');
        return;
      }

      // Report device count
      const deviceMeterId = this.findMeteredItem(subscription, 'device_usage');
      if (deviceMeterId) {
        await this.stripe.subscriptionItems.createUsageRecord(deviceMeterId, {
          quantity: metrics.deviceCount,
          timestamp: Math.floor(metrics.timestamp.getTime() / 1000),
          action: 'set' // Set to current count (not increment)
        });
        logger.info('✅ Reported device usage to Stripe', { 
          devices: metrics.deviceCount 
        });
      }

      // Report MQTT messages (if metered)
      const mqttMeterId = this.findMeteredItem(subscription, 'mqtt_messages');
      if (mqttMeterId) {
        await this.stripe.subscriptionItems.createUsageRecord(mqttMeterId, {
          quantity: metrics.mqttMessageCount,
          timestamp: Math.floor(metrics.timestamp.getTime() / 1000),
          action: 'increment' // Increment for message count
        });
        logger.info('✅ Reported MQTT message usage to Stripe', { 
          messages: metrics.mqttMessageCount 
        });
      }

      // Report storage (if metered)
      const storageMeterId = this.findMeteredItem(subscription, 'storage_gb');
      if (storageMeterId) {
        await this.stripe.subscriptionItems.createUsageRecord(storageMeterId, {
          quantity: Math.ceil(metrics.storageUsageGb), // Round up to nearest GB
          timestamp: Math.floor(metrics.timestamp.getTime() / 1000),
          action: 'set'
        });
        logger.info('✅ Reported storage usage to Stripe', { 
          storage_gb: metrics.storageUsageGb 
        });
      }

    } catch (error: any) {
      logger.error('Failed to report usage to Stripe', { 
        error: error.message,
        customerId: this.customerId
      });
      throw error;
    }
  }

  /**
   * Report usage to billing API (alternative to direct Stripe reporting)
   */
  async reportToBillingApi(metrics: UsageMetrics): Promise<void> {
    try {
      await axios.post(
        `${this.billingApiUrl}/api/usage/report`,
        {
          customerId: this.customerId,
          metrics: {
            devices: metrics.deviceCount,
            mqtt_messages: metrics.mqttMessageCount,
            storage_gb: metrics.storageUsageGb,
            api_requests: metrics.apiRequestCount
          },
          timestamp: metrics.timestamp.toISOString()
        },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('✅ Reported usage to Billing API', {
        customerId: this.customerId,
        devices: metrics.deviceCount,
        mqtt_messages: metrics.mqttMessageCount
      });
    } catch (error: any) {
      logger.error('Failed to report usage to Billing API', { 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get customer subscription from billing API
   */
  private async getCustomerSubscription(): Promise<any> {
    try {
      const response = await axios.get(
        `${this.billingApiUrl}/api/subscriptions/customer/${this.customerId}`,
        { timeout: 5000 }
      );
      return response.data.subscription;
    } catch (error: any) {
      logger.warn('Failed to get customer subscription', { 
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Find metered subscription item by lookup key
   */
  private findMeteredItem(subscription: any, lookupKey: string): string | null {
    const item = subscription?.items?.data?.find(
      (item: any) => item.price?.lookup_key === lookupKey
    );
    return item?.id || null;
  }

  /**
   * Health check for Stripe connection
   */
  async healthCheck(): Promise<boolean> {
    if (!this.stripe) {
      return true; // OK if not using direct Stripe reporting
    }

    try {
      // Test Stripe API connectivity
      await this.stripe.customers.list({ limit: 1 });
      return true;
    } catch (error) {
      logger.warn('Stripe health check failed', { error });
      return false;
    }
  }
}
