import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { logger } from '../utils/logger';
import { CustomerModel } from '../db/customer-model';

const execAsync = promisify(exec);

interface DeploymentOptions {
  customerId: string;
  email: string;
  companyName: string;
  licenseKey: string;
  namespace?: string;
  domain?: string;
}

interface DeploymentResult {
  success: boolean;
  namespace: string;
  instanceUrl?: string;
  error?: string;
}

export class K8sDeploymentService {
  private readonly chartPath: string;
  private readonly baseDomain: string;
  private readonly licensePublicKey: string;

  constructor() {
    // Path to Helm chart (adjust based on your deployment structure)
    this.chartPath = process.env.HELM_CHART_PATH || path.join(__dirname, '../../../charts/customer-instance');
    this.baseDomain = process.env.BASE_DOMAIN || 'iotistic.ca';
    
    // Load LICENSE_PUBLIC_KEY from environment (never store in values.yaml!)
    this.licensePublicKey = process.env.LICENSE_PUBLIC_KEY || '';
    
    if (!this.licensePublicKey) {
      logger.warn('⚠️  LICENSE_PUBLIC_KEY not set - customer instances will run in unlicensed mode');
    }
  }

  /**
   * Sanitize customer ID for use as Kubernetes namespace
   * K8s namespace rules: lowercase alphanumeric + hyphens, max 63 chars
   * Uses shortened customer ID to avoid length issues with Helm resource names
   */
  private sanitizeNamespace(customerId: string): string {
    // Extract short unique portion: "cust_dc5fec42901a..." -> "dc5fec42"
    // This keeps total length manageable for Helm-generated resource names
    const shortId = customerId.replace(/^cust_/, '').substring(0, 8);
    return `customer-${shortId}`;
  }

  /**
   * Sanitize customer ID for use in DNS names (ingress hosts)
   * DNS rules: lowercase alphanumeric + hyphens + dots, no underscores
   */
  private sanitizeCustomerId(customerId: string): string {
    return customerId.replace(/_/g, '-').toLowerCase();
  }

  /**
   * Deploy a customer instance to Kubernetes using Helm
   */
  async deployCustomerInstance(options: DeploymentOptions): Promise<DeploymentResult> {
    const namespace = options.namespace || this.sanitizeNamespace(options.customerId);
    const instanceUrl = `https://${options.customerId}.${this.baseDomain}`;

    try {
      logger.info('Starting Kubernetes deployment', { 
        customerId: options.customerId,
        namespace 
      });

      // Update customer deployment status to 'provisioning'
      await CustomerModel.updateDeploymentStatus(options.customerId, 'provisioning', {
        instanceNamespace: namespace,
        instanceUrl: instanceUrl
      });

      // 🎭 SIMULATION MODE - Skip actual K8s deployment for local testing
      if (process.env.SIMULATE_K8S_DEPLOYMENT === 'true') {
        logger.info('🎭 Simulating Kubernetes deployment (SIMULATE_K8S_DEPLOYMENT=true)', {
          customerId: options.customerId,
          namespace
        });

        // Simulate deployment time (3-5 seconds)
        const delay = 3000 + Math.random() * 2000;
        await new Promise(resolve => setTimeout(resolve, delay));

        logger.info('🎭 Simulated deployment complete', {
          customerId: options.customerId,
          namespace,
          duration: `${Math.round(delay / 1000)}s`
        });

        // Update to ready status
        await CustomerModel.updateDeploymentStatus(options.customerId, 'ready', {
          deploymentError: ''
        });

        return {
          success: true,
          namespace,
          instanceUrl
        };
      }

      // 1. Create namespace if it doesn't exist
      await this.createNamespace(namespace, options.customerId);

      // 2. Install/upgrade Helm release
      await this.installHelmRelease(namespace, options);

      // 3. Wait for deployment to be ready
      await this.waitForDeployment(namespace);

      // 4. Update customer deployment status to 'ready'
      await CustomerModel.updateDeploymentStatus(options.customerId, 'ready', {
        deploymentError: ''
      });

      logger.info('Kubernetes deployment successful', { 
        customerId: options.customerId,
        namespace,
        instanceUrl
      });

      return {
        success: true,
        namespace,
        instanceUrl
      };

    } catch (error: any) {
      const errorMessage = error.message || 'Unknown deployment error';
      
      logger.error('Kubernetes deployment failed', { 
        customerId: options.customerId,
        namespace,
        error: errorMessage 
      });

      // Update customer deployment status to 'failed'
      await CustomerModel.updateDeploymentStatus(options.customerId, 'failed', {
        deploymentError: errorMessage
      });

      return {
        success: false,
        namespace,
        error: errorMessage
      };
    }
  }

  /**
   * Create Kubernetes namespace with labels
   */
  private async createNamespace(namespace: string, customerId: string): Promise<void> {
    try {
      // Check if namespace exists
      await execAsync(`kubectl get namespace ${namespace}`);
      logger.info('Namespace already exists', { namespace });
    } catch (error) {
      // Namespace doesn't exist, create it
      logger.info('Creating namespace', { namespace });
      await execAsync(`kubectl create namespace ${namespace}`);
      
      // Add labels after creation
      await execAsync(
        `kubectl label namespace ${namespace} ` +
        `customer-id=${customerId} managed-by=iotistic`
      );
    }
  }

  /**
   * Install or upgrade Helm release
   */
  private async installHelmRelease(namespace: string, options: DeploymentOptions): Promise<void> {
    const releaseName = namespace;  // Use sanitized namespace as release name
    const sanitizedCustomerId = this.sanitizeCustomerId(options.customerId);
    // shortId: first 8 chars of the customer id (without 'cust_' prefix)
    const shortId = options.customerId.replace(/^cust_/, '').replace(/_/g, '-').substring(0, 8);
    
    // Decode license to extract monitoring configuration
    let monitoringConfig = {
      enabled: true,
      dedicated: false,
      scrapeInterval: '30s',
      retention: '7d',
      storageSize: '10Gi'
    };
    
    try {
      // Decode JWT without verification (we already trust it since we generated it)
      const decoded = require('jsonwebtoken').decode(options.licenseKey) as any;
      if (decoded && decoded.features) {
        const plan = decoded.plan || 'starter';
        const hasDedicatedPrometheus = decoded.features.hasDedicatedPrometheus || false;
        
        monitoringConfig = {
          enabled: true,
          dedicated: hasDedicatedPrometheus,
          scrapeInterval: '30s',
          retention: `${decoded.features.prometheusRetentionDays || 7}d`,
          storageSize: decoded.features.prometheusStorageGb > 0 
            ? `${decoded.features.prometheusStorageGb}Gi` 
            : '10Gi'
        };
        
        // Add Grafana configuration for Enterprise (dedicated monitoring)
        if (hasDedicatedPrometheus) {
          (monitoringConfig as any).grafana = {
            enabled: true,
            adminUser: 'admin',
            adminPassword: 'admin', // TODO: Generate secure password
            persistence: {
              enabled: true,
              size: '10Gi'
            }
          };
        }
        
        logger.info('Monitoring configuration extracted from license', { 
          customerId: options.customerId,
          plan,
          monitoring: monitoringConfig 
        });
      }
    } catch (error: any) {
      logger.warn('Failed to decode license for monitoring config, using defaults', { error: error.message });
    }
    
    // Create a temporary values file for complex values like LICENSE_PUBLIC_KEY
    const tempValuesFile = path.join('/tmp', `values-${namespace}.yaml`);
    
    // Build monitoring section with grafana if dedicated
    let monitoringSection = `
monitoring:
  enabled: ${monitoringConfig.enabled}
  dedicated: ${monitoringConfig.dedicated}
  scrapeInterval: "${monitoringConfig.scrapeInterval}"
  retention: "${monitoringConfig.retention}"
  storageSize: "${monitoringConfig.storageSize}"`;
    
    // Add Grafana configuration if present
    if ((monitoringConfig as any).grafana) {
      const grafana = (monitoringConfig as any).grafana;
      monitoringSection += `
  grafana:
    enabled: ${grafana.enabled}
    adminUser: "${grafana.adminUser}"
    adminPassword: "${grafana.adminPassword}"
    persistence:
      enabled: ${grafana.persistence.enabled}
      size: "${grafana.persistence.size}"`;
    }
    
    const valuesContent = `
customer:
  id: ${sanitizedCustomerId}
  shortId: ${shortId}
  originalId: ${options.customerId}
  email: ${options.email}
  companyName: "${options.companyName}"
license:
  key: "${options.licenseKey}"
  publicKey: |
${this.licensePublicKey.split('\n').map(line => '    ' + line).join('\n')}
domain:
  base: ${this.baseDomain}${monitoringSection}
`;
    
    await fs.writeFile(tempValuesFile, valuesContent, 'utf8');
    
    // Build Helm command using values file
    const helmCommand = [
      'helm upgrade --install',
      releaseName,
      this.chartPath,
      `-f ${tempValuesFile}`,
      `--namespace ${namespace}`,
      `--create-namespace`,
      `--wait`,
      `--timeout 5m`
    ].join(' ');

    // Try to upgrade if exists, otherwise install
    try {
      logger.info('Installing Helm release', { releaseName, namespace, valuesFile: tempValuesFile });
      
      const { stdout, stderr } = await execAsync(helmCommand);
      
      // Clean up temp values file
      await fs.unlink(tempValuesFile).catch(() => {});
      
      if (stderr && !stderr.includes('STATUS: deployed')) {
        logger.warn('Helm deployment warnings', { stderr });
      }
      
      logger.info('Helm release deployed', { releaseName, stdout });
      
    } catch (error: any) {
      // Clean up temp values file on error
      await fs.unlink(tempValuesFile).catch(() => {});
      
      logger.error('Helm deployment failed', { 
        releaseName, 
        error: error.message,
        stdout: error.stdout,
        stderr: error.stderr
      });
      throw new Error(`Helm deployment failed: ${error.stderr || error.message}`);
    }
  }

  /**
   * Wait for all deployments in namespace to be ready
   */
  private async waitForDeployment(namespace: string, timeoutSeconds: number = 300): Promise<void> {
    logger.info('Waiting for deployments to be ready', { namespace, timeoutSeconds });
    
    try {
      await execAsync(
        `kubectl wait --for=condition=available --timeout=${timeoutSeconds}s ` +
        `--all deployments -n ${namespace}`
      );
      
      logger.info('All deployments ready', { namespace });
      
    } catch (error: any) {
      logger.error('Deployment readiness timeout', { 
        namespace, 
        error: error.message 
      });
      throw new Error(`Deployments not ready after ${timeoutSeconds}s: ${error.message}`);
    }
  }

  /**
   * Delete a customer instance from Kubernetes
   */
  async deleteCustomerInstance(customerId: string): Promise<DeploymentResult> {
    const namespace = this.sanitizeNamespace(customerId);
    const releaseName = namespace;

    try {
      logger.info('Deleting Kubernetes deployment', { customerId, namespace });

      // 1. Uninstall Helm release
      try {
        await execAsync(`helm uninstall ${releaseName} --namespace ${namespace}`);
        logger.info('Helm release uninstalled', { releaseName });
      } catch (error: any) {
        logger.warn('Helm uninstall error (may not exist)', { error: error.message });
      }

      // 2. Delete namespace (will cascade delete all resources)
      try {
        await execAsync(`kubectl delete namespace ${namespace} --timeout=60s`);
        logger.info('Namespace deleted', { namespace });
      } catch (error: any) {
        logger.warn('Namespace delete error', { error: error.message });
      }

      // 3. Update customer record - set to pending (reset state)
      await CustomerModel.updateDeploymentStatus(customerId, 'pending', {
        instanceNamespace: '',
        instanceUrl: ''
      });

      logger.info('Customer instance deleted', { customerId });

      return {
        success: true,
        namespace
      };

    } catch (error: any) {
      logger.error('Failed to delete customer instance', { 
        customerId, 
        error: error.message 
      });

      return {
        success: false,
        namespace,
        error: error.message
      };
    }
  }

  /**
   * Get deployment status for a customer
   */
  async getDeploymentStatus(customerId: string): Promise<any> {
    const customer = await CustomerModel.getById(customerId);

    if (!customer) {
      throw new Error('Customer not found');
    }

    const namespace = customer.instance_namespace || this.sanitizeNamespace(customerId);
    const releaseName = namespace;

    try {
      // Get Helm release status
      const { stdout: helmStatus } = await execAsync(
        `helm status ${releaseName} --namespace ${namespace} --output json`
      );
      const helmData = JSON.parse(helmStatus);

      // Get pod status
      const { stdout: podStatus } = await execAsync(
        `kubectl get pods -n ${namespace} -o json`
      );
      const podData = JSON.parse(podStatus);

      return {
        customer: {
          id: customer.id,
          email: customer.email,
          deploymentStatus: customer.deployment_status,
          instanceUrl: customer.instance_url,
          deployedAt: customer.deployed_at,
          deploymentError: customer.deployment_error
        },
        helm: {
          status: helmData.info.status,
          version: helmData.version,
          lastDeployed: helmData.info.last_deployed
        },
        pods: podData.items.map((pod: any) => ({
          name: pod.metadata.name,
          status: pod.status.phase,
          ready: pod.status.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True'
        }))
      };

    } catch (error: any) {
      logger.warn('Could not get deployment status', { 
        customerId, 
        error: error.message 
      });

      return {
        customer: {
          id: customer.id,
          email: customer.email,
          deploymentStatus: customer.deployment_status,
          instanceUrl: customer.instance_url,
          deployedAt: customer.deployed_at,
          deploymentError: customer.deployment_error
        },
        error: error.message
      };
    }
  }

  /**
   * Update a customer instance (e.g., after license renewal)
   */
  async updateCustomerInstance(options: DeploymentOptions): Promise<DeploymentResult> {
    // Same as deploy - Helm will upgrade existing release
    return this.deployCustomerInstance(options);
  }
}

// Export singleton instance
export const k8sDeploymentService = new K8sDeploymentService();
