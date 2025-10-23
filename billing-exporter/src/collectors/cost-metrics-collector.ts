/**
 * Cost Metrics Collector
 * 
 * Collects infrastructure cost data from OpenCost/Prometheus
 * and reports to billing API for customer invoicing.
 */

import { PrometheusClient } from '../clients/prometheus-client';
import { BillingApiClient } from '../clients/billing-api-client';
import { logger } from '../utils/logger';

export interface CostBreakdown {
  cpu: number;
  memory: number;
  storage: number;
  network: number;
}

export interface CostData {
  customerId: string;
  namespace: string;
  hourly: number;
  daily: number;
  monthly: number;
  breakdown: CostBreakdown;
  timestamp: Date;
}

export class CostMetricsCollector {
  private prometheus: PrometheusClient;
  private billingApi: BillingApiClient;

  constructor(prometheusUrl: string, billingApiUrl: string) {
    this.prometheus = new PrometheusClient(prometheusUrl);
    this.billingApi = new BillingApiClient(billingApiUrl);
  }

  /**
   * Collect cost metrics for a customer namespace
   */
  async collectNamespaceCosts(namespace: string, customerId: string): Promise<CostData> {
    logger.info(`Collecting cost metrics for namespace: ${namespace}`);

    try {
      // Query OpenCost metrics from Prometheus
      const queries = {
        total: `sum(node_namespace_total_cost{namespace="${namespace}"})`,
        cpu: `sum(node_namespace_cpu_cost{namespace="${namespace}"})`,
        memory: `sum(node_namespace_memory_cost{namespace="${namespace}"})`,
        storage: `sum(node_namespace_pv_cost{namespace="${namespace}"})`,
        network: `sum(node_namespace_network_cost{namespace="${namespace}"})`
      };

      // Execute queries in parallel
      const results = await Promise.all(
        Object.entries(queries).map(async ([key, query]) => {
          const result = await this.prometheus.query(query);
          const value = result.data.result[0]?.value[1];
          return { key, value: parseFloat(value || '0') };
        })
      );

      // Extract values
      const total = results.find(r => r.key === 'total')?.value || 0;
      const cpu = results.find(r => r.key === 'cpu')?.value || 0;
      const memory = results.find(r => r.key === 'memory')?.value || 0;
      const storage = results.find(r => r.key === 'storage')?.value || 0;
      const network = results.find(r => r.key === 'network')?.value || 0;

      const costData: CostData = {
        customerId,
        namespace,
        hourly: total,
        daily: total * 24,
        monthly: total * 24 * 30, // Approximate month
        breakdown: {
          cpu,
          memory,
          storage,
          network
        },
        timestamp: new Date()
      };

      logger.info(`Cost metrics collected for ${namespace}: $${costData.monthly.toFixed(2)}/month`);
      return costData;

    } catch (error) {
      logger.error(`Failed to collect cost metrics for ${namespace}:`, error);
      throw error;
    }
  }

  /**
   * Collect costs for all customer namespaces
   */
  async collectAllCustomerCosts(): Promise<CostData[]> {
    logger.info('Collecting costs for all customer namespaces');

    try {
      // Query all customer namespaces from Prometheus
      const namespacesQuery = 'count by (namespace) (node_namespace_total_cost{namespace=~"customer-.*"})';
      const result = await this.prometheus.query(namespacesQuery);

      const namespaces = result.data.result.map((r: any) => r.metric.namespace);
      logger.info(`Found ${namespaces.length} customer namespaces`);

      // Collect costs for each namespace
      const costs = await Promise.all(
        namespaces.map(async (namespace: string) => {
          // Extract customer ID from namespace (customer-abc123 -> cust-abc123...)
          const customerId = await this.getCustomerIdFromNamespace(namespace);
          return this.collectNamespaceCosts(namespace, customerId);
        })
      );

      return costs;

    } catch (error) {
      logger.error('Failed to collect all customer costs:', error);
      throw error;
    }
  }

  /**
   * Report costs to billing API
   */
  async reportCosts(costData: CostData): Promise<void> {
    logger.info(`Reporting costs for ${costData.customerId} to billing API`);

    try {
      await this.billingApi.reportInfrastructureCost({
        customerId: costData.customerId,
        date: costData.timestamp.toISOString().split('T')[0],
        costTotal: costData.monthly,
        costCpu: costData.breakdown.cpu * 24 * 30,
        costMemory: costData.breakdown.memory * 24 * 30,
        costStorage: costData.breakdown.storage * 24 * 30,
        costNetwork: costData.breakdown.network * 24 * 30
      });

      logger.info(`Cost data reported successfully for ${costData.customerId}`);
    } catch (error) {
      logger.error(`Failed to report costs for ${costData.customerId}:`, error);
      throw error;
    }
  }

  /**
   * Get historical cost trend
   */
  async getCostTrend(namespace: string, days: number = 7): Promise<Array<{ date: string; cost: number }>> {
    logger.info(`Getting ${days}-day cost trend for ${namespace}`);

    try {
      // Query cost over time (hourly samples)
      const query = `sum_over_time(node_namespace_total_cost{namespace="${namespace}"}[${days}d:1h])`;
      const result = await this.prometheus.queryRange(query, days);

      const trend = result.data.result[0]?.values.map((v: any) => ({
        date: new Date(v[0] * 1000).toISOString().split('T')[0],
        cost: parseFloat(v[1]) * 24 // Convert hourly to daily
      })) || [];

      return trend;

    } catch (error) {
      logger.error(`Failed to get cost trend for ${namespace}:`, error);
      throw error;
    }
  }

  /**
   * Get cost breakdown by resource type
   */
  async getResourceCostBreakdown(namespace: string): Promise<CostBreakdown> {
    logger.info(`Getting resource cost breakdown for ${namespace}`);

    try {
      const queries = {
        cpu: `sum(node_namespace_cpu_cost{namespace="${namespace}"})`,
        memory: `sum(node_namespace_memory_cost{namespace="${namespace}"})`,
        storage: `sum(node_namespace_pv_cost{namespace="${namespace}"})`,
        network: `sum(node_namespace_network_cost{namespace="${namespace}"})`
      };

      const results = await Promise.all(
        Object.entries(queries).map(async ([key, query]) => {
          const result = await this.prometheus.query(query);
          const value = result.data.result[0]?.value[1];
          return { key, value: parseFloat(value || '0') };
        })
      );

      return {
        cpu: results.find(r => r.key === 'cpu')?.value || 0,
        memory: results.find(r => r.key === 'memory')?.value || 0,
        storage: results.find(r => r.key === 'storage')?.value || 0,
        network: results.find(r => r.key === 'network')?.value || 0
      };

    } catch (error) {
      logger.error(`Failed to get resource cost breakdown for ${namespace}:`, error);
      throw error;
    }
  }

  /**
   * Get top cost drivers
   */
  async getTopCostDrivers(namespace: string, limit: number = 5): Promise<Array<{ resource: string; cost: number }>> {
    logger.info(`Getting top ${limit} cost drivers for ${namespace}`);

    try {
      // Query pod-level costs
      const query = `topk(${limit}, sum by (pod) (pod_cpu_allocation_cost{namespace="${namespace}"} + pod_memory_allocation_cost{namespace="${namespace}"}))`;
      const result = await this.prometheus.query(query);

      const drivers = result.data.result.map((r: any) => ({
        resource: r.metric.pod,
        cost: parseFloat(r.value[1])
      }));

      return drivers;

    } catch (error) {
      logger.error(`Failed to get top cost drivers for ${namespace}:`, error);
      throw error;
    }
  }

  /**
   * Helper: Extract customer ID from namespace name
   */
  private async getCustomerIdFromNamespace(namespace: string): Promise<string> {
    // Namespace format: customer-{8-char-id}
    // Need to query billing API to get full customer ID
    try {
      const shortId = namespace.replace('customer-', '');
      const customer = await this.billingApi.getCustomerByNamespace(namespace);
      return customer.id;
    } catch (error) {
      logger.warn(`Could not resolve customer ID for namespace ${namespace}, using namespace as fallback`);
      return namespace;
    }
  }
}
