/**
 * Health Checker Service
 * 
 * Performs health checks on devices after image updates to verify
 * successful deployment. Supports multiple check types:
 * - HTTP endpoint checks
 * - TCP port checks
 * - Container running status
 * - Custom health scripts
 */

import { Pool } from 'pg';
import http from 'http';
import https from 'https';
import net from 'net';
import { EventPublisher } from './event-sourcing';
import { imageUpdateConfig } from '../config/image-updates';

export interface HealthCheckConfig {
  type: 'http' | 'tcp' | 'container' | 'custom';
  
  // HTTP check
  endpoint?: string;
  expectedStatusCode?: number;
  expectedBody?: string;
  
  // TCP check
  host?: string;
  port?: number;
  
  // Container check
  containerName?: string;
  
  // Custom check
  script?: string;
  
  // Common
  timeout?: number;
  retries?: number;
}

export interface HealthCheckResult {
  healthy: boolean;
  message: string;
  checkType: string;
  duration: number;
  details?: any;
}

export class HealthChecker {
  constructor(
    private pool: Pool,
    private eventPublisher: EventPublisher
  ) {}

  /**
   * Run health check for a device after image update
   */
  async checkDeviceHealth(
    deviceUuid: string,
    rolloutId: string,
    healthCheckConfig: HealthCheckConfig
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();
    console.log(`[HealthChecker] Running ${healthCheckConfig.type} check for device ${deviceUuid}`);

    try {
      let result: HealthCheckResult;

      switch (healthCheckConfig.type) {
        case 'http':
          result = await this.httpCheck(deviceUuid, healthCheckConfig);
          break;
        case 'tcp':
          result = await this.tcpCheck(healthCheckConfig);
          break;
        case 'container':
          result = await this.containerCheck(deviceUuid, healthCheckConfig);
          break;
        case 'custom':
          result = await this.customCheck(healthCheckConfig);
          break;
        default:
          throw new Error(`Unknown health check type: ${healthCheckConfig.type}`);
      }

      // Update device rollout status with health check result
      await this.updateDeviceHealthStatus(deviceUuid, rolloutId, result);

      // Publish event
      await this.eventPublisher.publish(
        result.healthy ? 'image.health_check_passed' : 'image.health_check_failed',
        'device',
        deviceUuid,
        {
          rollout_id: rolloutId,
          check_type: healthCheckConfig.type,
          duration: result.duration,
          message: result.message,
          details: result.details,
        }
      );

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorResult: HealthCheckResult = {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        checkType: healthCheckConfig.type,
        duration,
        details: { error: String(error) },
      };

      await this.updateDeviceHealthStatus(deviceUuid, rolloutId, errorResult);

      await this.eventPublisher.publish(
        'image.health_check_failed',
        'device',
        deviceUuid,
        {
          rollout_id: rolloutId,
          check_type: healthCheckConfig.type,
          error: errorResult.message,
          duration,
        }
      );

      return errorResult;
    }
  }

  /**
   * HTTP health check
   */
  private async httpCheck(
    deviceUuid: string,
    config: HealthCheckConfig
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();

    if (!config.endpoint) {
      throw new Error('HTTP check requires endpoint');
    }

    // Get device info to construct URL
    const deviceQuery = await this.pool.query(
      'SELECT device_name, last_ip FROM devices WHERE uuid = $1',
      [deviceUuid]
    );

    if (deviceQuery.rows.length === 0) {
      throw new Error(`Device not found: ${deviceUuid}`);
    }

    const device = deviceQuery.rows[0];
    const deviceIp = device.last_ip || 'localhost';
    
    // Replace placeholders in endpoint
    const endpoint = config.endpoint
      .replace('{device_ip}', deviceIp)
      .replace('{device_name}', device.device_name);

    const url = new URL(endpoint);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const timeout = config.timeout || imageUpdateConfig.HEALTH_CHECK_TIMEOUT;
      const expectedStatusCode = config.expectedStatusCode || 200;

      const request = httpModule.get(endpoint, {
        timeout: timeout * 1000,
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          const duration = Date.now() - startTime;
          const statusMatch = res.statusCode === expectedStatusCode;
          const bodyMatch = !config.expectedBody || body.includes(config.expectedBody);

          if (statusMatch && bodyMatch) {
            resolve({
              healthy: true,
              message: `HTTP check passed: ${res.statusCode}`,
              checkType: 'http',
              duration,
              details: {
                statusCode: res.statusCode,
                endpoint,
                bodyLength: body.length,
              },
            });
          } else {
            resolve({
              healthy: false,
              message: `HTTP check failed: expected ${expectedStatusCode}, got ${res.statusCode}`,
              checkType: 'http',
              duration,
              details: {
                statusCode: res.statusCode,
                expectedStatusCode,
                endpoint,
                bodyMatch,
              },
            });
          }
        });
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error(`HTTP check timeout after ${timeout}s`));
      });

      request.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * TCP port check
   */
  private async tcpCheck(config: HealthCheckConfig): Promise<HealthCheckResult> {
    const startTime = Date.now();

    if (!config.host || !config.port) {
      throw new Error('TCP check requires host and port');
    }

    return new Promise((resolve, reject) => {
      const timeout = config.timeout || imageUpdateConfig.HEALTH_CHECK_TIMEOUT;
      const socket = new net.Socket();

      socket.setTimeout(timeout * 1000);

      socket.connect(config.port, config.host, () => {
        const duration = Date.now() - startTime;
        socket.destroy();
        resolve({
          healthy: true,
          message: `TCP port ${config.port} is open`,
          checkType: 'tcp',
          duration,
          details: {
            host: config.host,
            port: config.port,
          },
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error(`TCP check timeout after ${timeout}s`));
      });

      socket.on('error', (err) => {
        socket.destroy();
        const duration = Date.now() - startTime;
        resolve({
          healthy: false,
          message: `TCP port ${config.port} is not reachable: ${err.message}`,
          checkType: 'tcp',
          duration,
          details: {
            host: config.host,
            port: config.port,
            error: err.message,
          },
        });
      });
    });
  }

  /**
   * Container running check
   * Verifies container is running on device by checking current state
   */
  private async containerCheck(
    deviceUuid: string,
    config: HealthCheckConfig
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();

    if (!config.containerName) {
      throw new Error('Container check requires containerName');
    }

    // Get device current state
    const stateQuery = await this.pool.query(
      'SELECT apps, config, system_info FROM device_current_state WHERE device_uuid = $1',
      [deviceUuid]
    );

    if (stateQuery.rows.length === 0) {
      return {
        healthy: false,
        message: 'Device has not reported current state yet',
        checkType: 'container',
        duration: Date.now() - startTime,
      };
    }

    const { apps, config: deviceConfig, system_info } = stateQuery.rows[0];
    
    // Look for container in apps structure
    let containerStatus = null;
    for (const appKey in apps) {
      const app = apps[appKey];
      if (app.services && Array.isArray(app.services)) {
        const service = app.services.find((s: any) => 
          s.serviceName === config.containerName || s.appName === config.containerName
        );
        if (service) {
          containerStatus = service;
          break;
        }
      }
    }

    if (!containerStatus) {
      return {
        healthy: false,
        message: `Container ${config.containerName} not found in current state`,
        checkType: 'container',
        duration: Date.now() - startTime,
      };
    }

    const isRunning = containerStatus.status === 'running';

    return {
      healthy: isRunning,
      message: isRunning 
        ? `Container ${config.containerName} is running`
        : `Container ${config.containerName} is ${containerStatus.status}`,
      checkType: 'container',
      duration: Date.now() - startTime,
      details: {
        containerName: config.containerName,
        status: containerStatus.status,
        imageTag: containerStatus.imageTag,
      },
    };
  }

  /**
   * Custom health check script
   * (Placeholder - would need secure script execution mechanism)
   */
  private async customCheck(config: HealthCheckConfig): Promise<HealthCheckResult> {
    const startTime = Date.now();

    // TODO: Implement secure script execution
    // For now, return a placeholder result
    console.warn('[HealthChecker] Custom health checks not yet implemented');

    return {
      healthy: true,
      message: 'Custom check not implemented',
      checkType: 'custom',
      duration: Date.now() - startTime,
      details: {
        script: config.script,
      },
    };
  }

  /**
   * Update device rollout status with health check result
   */
  private async updateDeviceHealthStatus(
    deviceUuid: string,
    rolloutId: string,
    result: HealthCheckResult
  ): Promise<void> {
    const newStatus = result.healthy ? 'healthy' : 'unhealthy';

    await this.pool.query(
      `UPDATE device_rollout_status
       SET status = $1,
           health_check_result = $2,
           health_check_at = NOW(),
           updated_at = NOW()
       WHERE device_uuid = $3 AND rollout_id = $4`,
      [newStatus, JSON.stringify(result), deviceUuid, rolloutId]
    );

    console.log(`[HealthChecker] Updated device ${deviceUuid} status to ${newStatus}`);
  }

  /**
   * Run health checks for all devices in a batch
   */
  async checkBatchHealth(
    rolloutId: string,
    batchNumber: number,
    healthCheckConfig: HealthCheckConfig
  ): Promise<{ total: number; healthy: number; unhealthy: number }> {
    console.log(`[HealthChecker] Checking health for batch ${batchNumber} in rollout ${rolloutId}`);

    // Get devices in batch that have been updated
    const devicesQuery = await this.pool.query(
      `SELECT device_uuid
       FROM device_rollout_status
       WHERE rollout_id = $1 
         AND batch_number = $2 
         AND status IN ('updated', 'healthy', 'unhealthy')`,
      [rolloutId, batchNumber]
    );

    const devices = devicesQuery.rows;
    const results = {
      total: devices.length,
      healthy: 0,
      unhealthy: 0,
    };

    // Run health checks in parallel (with concurrency limit)
    const concurrency = 5;
    for (let i = 0; i < devices.length; i += concurrency) {
      const batch = devices.slice(i, i + concurrency);
      const promises = batch.map(device =>
        this.checkDeviceHealth(device.device_uuid, rolloutId, healthCheckConfig)
      );

      const batchResults = await Promise.allSettled(promises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value.healthy) {
          results.healthy++;
        } else {
          results.unhealthy++;
        }
      }
    }

    console.log(`[HealthChecker] Batch ${batchNumber} health check complete: ${results.healthy}/${results.total} healthy`);

    return results;
  }

  /**
   * Parse health check config from policy JSONB
   */
  static parseHealthCheckConfig(configJson: any): HealthCheckConfig {
    if (!configJson) {
      // Default HTTP check
      return {
        type: 'http',
        endpoint: 'http://{device_ip}:80/health',
        expectedStatusCode: 200,
        timeout: 30,
        retries: 3,
      };
    }

    return configJson as HealthCheckConfig;
  }
}
