import { exec } from 'child_process';
import { promisify } from 'util';
import pool from '../db/connection';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);
const db = pool;

export interface UpgradeOptions {
  component: 'api' | 'dashboard' | 'exporter' | 'mosquitto';
  version: string;
  strategy: 'all' | 'canary' | 'batch';
  batchSize?: number; // For batch strategy
  canaryPercent?: number; // For canary strategy (default 10%)
}

export interface UpgradeProgress {
  upgradeId: string;
  component: string;
  version: string;
  strategy: string;
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  startedAt: Date | null;
  completedAt: Date | null;
}

export class UpgradeService {
  private helmChartPath: string;

  constructor() {
    this.helmChartPath = process.env.HELM_CHART_PATH || '/app/charts/customer-instance';
  }

  /**
   * Start a system-wide upgrade
   */
  async startUpgrade(options: UpgradeOptions): Promise<string> {
    logger.info('Starting system upgrade', options);

    // Get all deployed customers
    const customers = await db('customers')
      .where('deployment_status', 'deployed')
      .whereNotNull('instance_namespace')
      .select('customer_id', 'instance_namespace', 'email');

    if (customers.length === 0) {
      throw new Error('No deployed customers found');
    }

    // Create upgrade record
    const [upgrade] = await db('system_upgrades')
      .insert({
        component: options.component,
        to_version: options.version,
        strategy: options.strategy,
        total_customers: customers.length,
        completed_customers: 0,
        failed_customers: 0,
        status: 'pending',
        created_at: new Date(),
      })
      .returning('*');

    logger.info('Upgrade record created', { upgradeId: upgrade.id, totalCustomers: customers.length });

    return upgrade.id;
  }

  /**
   * Execute upgrade for specific customers
   */
  async executeUpgrade(upgradeId: string, customerIds?: string[]): Promise<void> {
    const upgrade = await db('system_upgrades').where('id', upgradeId).first();
    
    if (!upgrade) {
      throw new Error(`Upgrade ${upgradeId} not found`);
    }

    // Update status to in_progress
    await db('system_upgrades')
      .where('id', upgradeId)
      .update({
        status: 'in_progress',
        started_at: new Date(),
      });

    let customersToUpgrade;
    
    if (customerIds) {
      customersToUpgrade = await db('customers')
        .whereIn('customer_id', customerIds)
        .where('deployment_status', 'deployed')
        .select('customer_id', 'instance_namespace', 'email');
    } else {
      // Get all deployed customers if no specific list provided
      customersToUpgrade = await db('customers')
        .where('deployment_status', 'deployed')
        .whereNotNull('instance_namespace')
        .select('customer_id', 'instance_namespace', 'email');
    }

    logger.info('Executing upgrade', { 
      upgradeId, 
      component: upgrade.component, 
      version: upgrade.to_version,
      customerCount: customersToUpgrade.length 
    });

    let completed = 0;
    let failed = 0;

    for (const customer of customersToUpgrade) {
      try {
        await this.upgradeCustomerComponent(
          upgradeId,
          customer.customer_id,
          customer.instance_namespace,
          upgrade.component,
          upgrade.to_version
        );
        completed++;
        
        logger.info('Customer upgraded successfully', {
          upgradeId,
          customerId: customer.customer_id,
          namespace: customer.instance_namespace,
        });
      } catch (error) {
        failed++;
        logger.error('Customer upgrade failed', {
          upgradeId,
          customerId: customer.customer_id,
          namespace: customer.instance_namespace,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Update progress
      await db('system_upgrades')
        .where('id', upgradeId)
        .update({
          completed_customers: completed,
          failed_customers: failed,
        });
    }

    // Mark upgrade as completed
    await db('system_upgrades')
      .where('id', upgradeId)
      .update({
        status: failed > 0 ? 'completed_with_errors' : 'completed',
        completed_at: new Date(),
      });

    logger.info('Upgrade execution completed', { 
      upgradeId, 
      completed, 
      failed,
      total: customersToUpgrade.length 
    });
  }

  /**
   * Upgrade a single customer's component
   */
  private async upgradeCustomerComponent(
    upgradeId: string,
    customerId: string,
    namespace: string,
    component: string,
    version: string
  ): Promise<void> {
    logger.info('Upgrading customer component', { 
      customerId, 
      namespace, 
      component, 
      version 
    });

    // Record the upgrade attempt
    const [upgradeLog] = await db('customer_upgrade_logs')
      .insert({
        upgrade_id: upgradeId,
        customer_id: customerId,
        component,
        from_version: 'current', // TODO: Track current version
        to_version: version,
        status: 'in_progress',
        started_at: new Date(),
      })
      .returning('*');

    try {
      // Get current Helm values
      const currentValues = await this.getCurrentHelmValues(namespace);

      // Build helm upgrade command
      const helmCommand = `helm upgrade ${namespace} ${this.helmChartPath} \
        --namespace ${namespace} \
        --reuse-values \
        --set ${component}.image.tag=${version} \
        --wait \
        --timeout 5m`;

      logger.debug('Executing helm command', { command: helmCommand });

      const { stdout, stderr } = await execAsync(helmCommand);

      logger.info('Helm upgrade completed', { 
        customerId, 
        namespace,
        stdout: stdout.substring(0, 500),
      });

      // Update upgrade log
      await db('customer_upgrade_logs')
        .where('id', upgradeLog.id)
        .update({
          status: 'completed',
          completed_at: new Date(),
          output: stdout,
        });

      // Update customer record
      await db('customers')
        .where('customer_id', customerId)
        .update({
          updated_at: new Date(),
          // Store component versions in metadata
          // metadata: db.raw(`jsonb_set(COALESCE(metadata, '{}'), '{versions,${component}}', '"${version}"')`)
        });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('Helm upgrade failed', { 
        customerId, 
        namespace, 
        component,
        error: errorMessage 
      });

      // Update upgrade log
      await db('customer_upgrade_logs')
        .where('id', upgradeLog.id)
        .update({
          status: 'failed',
          completed_at: new Date(),
          error: errorMessage,
        });

      throw error;
    }
  }

  /**
   * Get current Helm values for a release
   */
  private async getCurrentHelmValues(namespace: string): Promise<any> {
    try {
      const { stdout } = await execAsync(`helm get values ${namespace} -n ${namespace} -o json`);
      return JSON.parse(stdout);
    } catch (error) {
      logger.warn('Failed to get current helm values', { namespace, error });
      return {};
    }
  }

  /**
   * Get upgrade progress
   */
  async getUpgradeProgress(upgradeId: string): Promise<UpgradeProgress | null> {
    const upgrade = await db('system_upgrades')
      .where('id', upgradeId)
      .first();

    if (!upgrade) {
      return null;
    }

    return {
      upgradeId: upgrade.id,
      component: upgrade.component,
      version: upgrade.to_version,
      strategy: upgrade.strategy,
      total: upgrade.total_customers,
      completed: upgrade.completed_customers,
      failed: upgrade.failed_customers,
      inProgress: upgrade.total_customers - upgrade.completed_customers - upgrade.failed_customers,
      status: upgrade.status,
      startedAt: upgrade.started_at,
      completedAt: upgrade.completed_at,
    };
  }

  /**
   * Get canary customer IDs (random subset)
   */
  async getCanaryCustomers(percent: number = 10): Promise<string[]> {
    const customers = await db('customers')
      .where('deployment_status', 'deployed')
      .whereNotNull('instance_namespace')
      .select('customer_id');

    const canaryCount = Math.max(1, Math.ceil(customers.length * (percent / 100)));
    
    // Shuffle and take first N
    const shuffled = customers.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, canaryCount).map((c: any) => c.customer_id);
  }

  /**
   * Rollback a customer to previous version
   */
  async rollbackCustomer(customerId: string, namespace: string): Promise<void> {
    logger.info('Rolling back customer', { customerId, namespace });

    try {
      const { stdout, stderr } = await execAsync(
        `helm rollback ${namespace} -n ${namespace} --wait --timeout 5m`
      );

      logger.info('Rollback completed', { customerId, namespace, stdout });

      await db('customer_upgrade_logs').insert({
        customer_id: customerId,
        component: 'all',
        status: 'rolled_back',
        started_at: new Date(),
        completed_at: new Date(),
        output: stdout,
      });

    } catch (error) {
      logger.error('Rollback failed', { 
        customerId, 
        namespace, 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * List all upgrades
   */
  async listUpgrades(limit: number = 50): Promise<any[]> {
    return db('system_upgrades')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .select('*');
  }

  /**
   * Get upgrade logs for a specific upgrade
   */
  async getUpgradeLogs(upgradeId: string, limit: number = 100): Promise<any[]> {
    return db('customer_upgrade_logs')
      .where('upgrade_id', upgradeId)
      .orderBy('started_at', 'desc')
      .limit(limit)
      .select('*');
  }
}

export const upgradeService = new UpgradeService();
