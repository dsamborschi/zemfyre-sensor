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

  constructor() {
    // Path to Helm chart (adjust based on your deployment structure)
    this.chartPath = process.env.HELM_CHART_PATH || path.join(__dirname, '../../../charts/customer-instance');
    this.baseDomain = process.env.BASE_DOMAIN || 'iotistic.ca';
  }

  /**
   * Deploy a customer instance to Kubernetes using Helm
   */
  async deployCustomerInstance(options: DeploymentOptions): Promise<DeploymentResult> {
    const namespace = options.namespace || `customer-${options.customerId}`;
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
      await execAsync(
        `kubectl create namespace ${namespace} ` +
        `--labels=customer-id=${customerId},managed-by=iotistic`
      );
    }
  }

  /**
   * Install or upgrade Helm release
   */
  private async installHelmRelease(namespace: string, options: DeploymentOptions): Promise<void> {
    const releaseName = `customer-${options.customerId}`;
    
    // Build Helm values arguments
    const helmValues = [
      `--set customer.id=${options.customerId}`,
      `--set customer.email=${options.email}`,
      `--set customer.companyName="${options.companyName}"`,
      `--set license.key="${options.licenseKey}"`,
      `--set domain.base=${this.baseDomain}`,
      `--namespace ${namespace}`,
      `--create-namespace`,
      `--wait`,
      `--timeout 5m`
    ].join(' ');

    // Try to upgrade if exists, otherwise install
    try {
      logger.info('Installing Helm release', { releaseName, namespace });
      
      const helmCommand = `helm upgrade --install ${releaseName} ${this.chartPath} ${helmValues}`;
      
      const { stdout, stderr } = await execAsync(helmCommand);
      
      if (stderr && !stderr.includes('STATUS: deployed')) {
        logger.warn('Helm deployment warnings', { stderr });
      }
      
      logger.info('Helm release deployed', { releaseName, stdout });
      
    } catch (error: any) {
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
    const namespace = `customer-${customerId}`;
    const releaseName = `customer-${customerId}`;

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

    const namespace = customer.instance_namespace || `customer-${customerId}`;
    const releaseName = `customer-${customerId}`;

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
