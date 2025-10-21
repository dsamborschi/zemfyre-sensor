import axios, { AxiosInstance } from 'axios';
import { logger } from './logger';

export interface PrometheusQueryResult {
  status: string;
  data: {
    resultType: string;
    result: Array<{
      metric: Record<string, string>;
      value: [number, string];
    }>;
  };
}

export class PrometheusClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(prometheusUrl: string) {
    this.baseUrl = prometheusUrl;
    this.client = axios.create({
      baseURL: `${prometheusUrl}/api/v1`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
  }

  /**
   * Execute instant query against Prometheus
   */
  async instantQuery(query: string): Promise<PrometheusQueryResult> {
    try {
      const response = await this.client.get('/query', {
        params: { query }
      });

      if (response.data.status !== 'success') {
        throw new Error(`Prometheus query failed: ${response.data.error}`);
      }

      return response.data;
    } catch (error: any) {
      logger.error('Prometheus query failed', {
        query,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Extract numeric value from query result
   */
  extractValue(result: PrometheusQueryResult, defaultValue: number = 0): number {
    if (
      result?.data?.result &&
      result.data.result.length > 0 &&
      result.data.result[0]?.value?.[1]
    ) {
      const value = parseFloat(result.data.result[0].value[1]);
      return isNaN(value) ? defaultValue : value;
    }
    return defaultValue;
  }

  /**
   * Health check - verify Prometheus is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/-/healthy', {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      logger.error('Prometheus health check failed', { error });
      return false;
    }
  }
}
