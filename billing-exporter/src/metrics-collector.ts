import { PrometheusClient } from './prometheus-client';
import { logger } from './logger';

export interface UsageMetrics {
  customer_id: string;
  instance_id: string;
  timestamp: string;
  network_bytes_sent: number;
  network_bytes_received: number;
  storage_used_gb: number;
  cpu_hours: number;
  memory_gb_hours: number;
  http_requests: number;
}

export class MetricsCollector {
  private prometheus: PrometheusClient;
  private namespace: string;
  private customerId: string;
  private instanceId: string;

  constructor(
    prometheusUrl: string,
    namespace: string,
    customerId: string,
    instanceId: string
  ) {
    this.prometheus = new PrometheusClient(prometheusUrl);
    this.namespace = namespace;
    this.customerId = customerId;
    this.instanceId = instanceId;
  }

  /**
   * Collect all usage metrics from Kubernetes
   */
  async collect(): Promise<UsageMetrics> {
    logger.info('📊 Collecting metrics from Kubernetes...', {
      namespace: this.namespace,
      customer_id: this.customerId
    });

    const timeRange = '1h'; // Last hour

    try {
      // Collect metrics in parallel
      const [
        networkSent,
        networkReceived,
        storage,
        cpuHours,
        memoryGBHours,
        httpRequests
      ] = await Promise.all([
        this.collectNetworkSent(timeRange),
        this.collectNetworkReceived(timeRange),
        this.collectStorage(),
        this.collectCPUHours(timeRange),
        this.collectMemoryGBHours(timeRange),
        this.collectHTTPRequests(timeRange)
      ]);

      const metrics: UsageMetrics = {
        customer_id: this.customerId,
        instance_id: this.instanceId,
        timestamp: new Date().toISOString(),
        network_bytes_sent: networkSent,
        network_bytes_received: networkReceived,
        storage_used_gb: storage,
        cpu_hours: cpuHours,
        memory_gb_hours: memoryGBHours,
        http_requests: httpRequests
      };

      logger.info('✅ Metrics collected successfully', {
        network_gb: ((networkSent + networkReceived) / 1024 / 1024 / 1024).toFixed(2),
        storage_gb: storage.toFixed(2),
        cpu_hours: cpuHours.toFixed(2),
        memory_gb_hours: memoryGBHours.toFixed(2),
        http_requests: httpRequests
      });

      return metrics;
    } catch (error: any) {
      logger.error('Failed to collect metrics', {
        error: error.message,
        namespace: this.namespace
      });
      throw error;
    }
  }

  /**
   * Collect network bytes sent (egress)
   */
  private async collectNetworkSent(timeRange: string): Promise<number> {
    const query = `sum(increase(container_network_transmit_bytes_total{namespace="${this.namespace}"}[${timeRange}]))`;
    const result = await this.prometheus.instantQuery(query);
    return this.prometheus.extractValue(result);
  }

  /**
   * Collect network bytes received (ingress)
   */
  private async collectNetworkReceived(timeRange: string): Promise<number> {
    const query = `sum(increase(container_network_receive_bytes_total{namespace="${this.namespace}"}[${timeRange}]))`;
    const result = await this.prometheus.instantQuery(query);
    return this.prometheus.extractValue(result);
  }

  /**
   * Collect storage usage (PersistentVolumeClaims)
   */
  private async collectStorage(): Promise<number> {
    const query = `sum(kubelet_volume_stats_used_bytes{namespace="${this.namespace}"}) / 1024 / 1024 / 1024`;
    const result = await this.prometheus.instantQuery(query);
    return this.prometheus.extractValue(result);
  }

  /**
   * Collect CPU usage in core-hours
   */
  private async collectCPUHours(timeRange: string): Promise<number> {
    // Get average CPU usage rate over the period and multiply by hours
    const query = `sum(rate(container_cpu_usage_seconds_total{namespace="${this.namespace}",container!="",container!="POD"}[${timeRange}])) * 3600`;
    const result = await this.prometheus.instantQuery(query);
    return this.prometheus.extractValue(result);
  }

  /**
   * Collect memory usage in GB-hours
   */
  private async collectMemoryGBHours(timeRange: string): Promise<number> {
    // Average memory over the period
    const query = `sum(avg_over_time(container_memory_working_set_bytes{namespace="${this.namespace}",container!="",container!="POD"}[${timeRange}])) / 1024 / 1024 / 1024`;
    const result = await this.prometheus.instantQuery(query);
    return this.prometheus.extractValue(result);
  }

  /**
   * Collect HTTP requests (via Nginx Ingress Controller)
   */
  private async collectHTTPRequests(timeRange: string): Promise<number> {
    // Try Nginx Ingress metrics first
    try {
      const query = `sum(increase(nginx_ingress_controller_requests{namespace="${this.namespace}"}[${timeRange}]))`;
      const result = await this.prometheus.instantQuery(query);
      const value = this.prometheus.extractValue(result);
      
      if (value > 0) {
        return value;
      }
    } catch (error) {
      logger.debug('Nginx Ingress metrics not available, trying Istio...');
    }

    // Fallback to Istio metrics if available
    try {
      const query = `sum(increase(istio_requests_total{destination_namespace="${this.namespace}"}[${timeRange}]))`;
      const result = await this.prometheus.instantQuery(query);
      return this.prometheus.extractValue(result);
    } catch (error) {
      logger.debug('Istio metrics not available, HTTP requests will be 0');
      return 0;
    }
  }

  /**
   * Health check - verify Prometheus connection
   */
  async healthCheck(): Promise<boolean> {
    return await this.prometheus.healthCheck();
  }
}
