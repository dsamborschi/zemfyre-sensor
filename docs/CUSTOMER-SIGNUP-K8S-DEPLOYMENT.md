# Customer Signup & Trial Provisioning - Best Practices

## Overview

Complete workflow from customer signup → trial creation → K8s deployment with license key provisioning.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Customer Signs Up (Marketing Site/Portal)                   │
│    - Email, Company Name, Password                             │
└─────────────────────────┬───────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Global Billing API (Your SaaS Backend)                      │
│    POST /api/customers/signup                                  │
│    - Create customer record                                    │
│    - Create 14-day trial subscription                          │
│    - Generate trial license JWT                                │
│    - Trigger K8s deployment                                    │
└─────────────────────────┬───────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. K8s Deployment (Customer's Isolated Namespace)              │
│    - Create namespace: customer-<id>                           │
│    - Deploy full stack (API, MQTT, InfluxDB, Grafana, etc.)   │
│    - Inject license key as Secret                             │
│    - Configure DNS/Ingress                                     │
└─────────────────────────┬───────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Customer Instance Ready                                     │
│    - URL: https://<customer-id>.yourdomain.com                │
│    - License: Validated on startup                            │
│    - Trial: 14 days remaining                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Guide

### Phase 1: Signup API Endpoint

**File**: `billing/src/routes/customers.ts`

Add a public signup endpoint:

```typescript
/**
 * POST /api/customers/signup
 * Public endpoint - Customer self-signup with trial
 * 
 * Body:
 * - email: Customer email (required)
 * - password: Password (required)
 * - company_name: Company name (required)
 * - full_name: Contact name (optional)
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, company_name, full_name } = req.body;

    // Validation
    if (!email || !password || !company_name) {
      return res.status(400).json({ 
        error: 'Email, password, and company name are required' 
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Password strength (min 8 chars, 1 uppercase, 1 number)
    if (password.length < 8) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters' 
      });
    }

    // Check if customer already exists
    const existingCustomer = await CustomerModel.getByEmail(email);
    if (existingCustomer) {
      return res.status(409).json({ 
        error: 'Email already registered',
        message: 'An account with this email already exists'
      });
    }

    // Step 1: Create customer
    const customerId = `cust_${uuidv4()}`;
    const customer = await CustomerModel.create({
      customer_id: customerId,
      email,
      company_name,
      full_name,
    });

    // Step 2: Hash password and store
    const passwordHash = await bcrypt.hash(password, 10);
    await query(
      'UPDATE customers SET password_hash = $1 WHERE customer_id = $2',
      [passwordHash, customerId]
    );

    // Step 3: Create 14-day trial subscription
    const subscription = await SubscriptionModel.createTrial(
      customerId, 
      'starter',  // Start with starter plan
      14          // 14-day trial
    );

    // Step 4: Generate trial license
    const license = await LicenseGenerator.generateLicense(customer, subscription);
    const decoded = LicenseGenerator.verifyLicense(license);

    // Step 5: Log audit trail
    const licenseHash = crypto.createHash('sha256').update(license).digest('hex');
    await LicenseHistoryModel.log({
      customerId,
      action: 'generated',
      plan: 'starter',
      maxDevices: decoded.features.maxDevices,
      licenseHash,
      generatedBy: 'signup',
      metadata: {
        type: 'trial_signup',
        trialDays: 14,
        features: decoded.features,
      }
    });

    // Step 6: Trigger K8s deployment (async)
    // Option A: Queue job (recommended for production)
    await deploymentQueue.add('deploy-customer-stack', {
      customerId,
      email,
      companyName: company_name,
      license,
    });

    // Option B: Direct call (simpler for MVP)
    // await K8sDeploymentService.deployCustomerStack(customerId, license);

    // Step 7: Send welcome email (async)
    await emailService.sendTrialWelcome({
      email,
      companyName: company_name,
      instanceUrl: `https://${customerId}.yourdomain.com`,
      trialDays: 14,
      loginInstructions: 'Your instance will be ready in 2-3 minutes',
    });

    console.log(`✅ Customer signup: ${email} (${customerId})`);

    res.status(201).json({
      message: 'Account created successfully! Your instance is being deployed.',
      customer: {
        customer_id: customerId,
        email: customer.email,
        company_name: customer.company_name,
      },
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        trial_ends_at: subscription.trial_ends_at,
      },
      deployment: {
        status: 'provisioning',
        estimated_time: '2-3 minutes',
        instance_url: `https://${customerId}.yourdomain.com`,
      },
      license: {
        jwt: license,  // Customer needs this to manage their instance
        expires_at: new Date(decoded.expiresAt * 1000).toISOString(),
        max_devices: decoded.features.maxDevices,
      },
      next_steps: [
        'Check your email for login instructions',
        'Your instance URL will be active in 2-3 minutes',
        'Start by connecting your first device',
      ]
    });

  } catch (error: any) {
    console.error('Signup error:', error);
    res.status(500).json({ 
      error: 'Signup failed', 
      message: error.message 
    });
  }
});
```

---

### Phase 2: Kubernetes Deployment Service

**File**: `billing/src/services/k8s-deployment-service.ts`

```typescript
import { AppsV1Api, CoreV1Api, KubeConfig, NetworkingV1Api } from '@kubernetes/client-node';
import { readFileSync } from 'fs';
import path from 'path';

export class K8sDeploymentService {
  private static k8sConfig: KubeConfig;
  private static coreApi: CoreV1Api;
  private static appsApi: AppsV1Api;
  private static networkingApi: NetworkingV1Api;

  /**
   * Initialize K8s client
   */
  static init() {
    this.k8sConfig = new KubeConfig();
    
    // Load from kubeconfig file or in-cluster config
    if (process.env.NODE_ENV === 'production') {
      this.k8sConfig.loadFromCluster();  // In-cluster
    } else {
      this.k8sConfig.loadFromDefault();  // ~/.kube/config
    }

    this.coreApi = this.k8sConfig.makeApiClient(CoreV1Api);
    this.appsApi = this.k8sConfig.makeApiClient(AppsV1Api);
    this.networkingApi = this.k8sConfig.makeApiClient(NetworkingV1Api);
  }

  /**
   * Deploy complete customer stack to K8s
   */
  static async deployCustomerStack(
    customerId: string,
    license: string,
    options: {
      plan?: string;
      domain?: string;
      region?: string;
    } = {}
  ): Promise<{
    namespace: string;
    instanceUrl: string;
    status: string;
  }> {
    const namespace = `customer-${customerId}`;
    const domain = options.domain || process.env.BASE_DOMAIN || 'yourdomain.com';
    const instanceUrl = `https://${customerId}.${domain}`;

    console.log(`🚀 Deploying stack for ${customerId} to namespace ${namespace}`);

    try {
      // Step 1: Create namespace
      await this.createNamespace(namespace, customerId);

      // Step 2: Create secrets (license key, DB passwords, etc.)
      await this.createSecrets(namespace, license, customerId);

      // Step 3: Create ConfigMaps (Nginx config, Grafana dashboards, etc.)
      await this.createConfigMaps(namespace, customerId);

      // Step 4: Create PersistentVolumeClaims
      await this.createPVCs(namespace);

      // Step 5: Deploy PostgreSQL
      await this.deployPostgreSQL(namespace);

      // Step 6: Deploy InfluxDB
      await this.deployInfluxDB(namespace);

      // Step 7: Deploy Mosquitto (MQTT)
      await this.deployMosquitto(namespace);

      // Step 8: Deploy API
      await this.deployAPI(namespace, customerId);

      // Step 9: Deploy Node-RED
      await this.deployNodeRED(namespace);

      // Step 10: Deploy Grafana
      await this.deployGrafana(namespace);

      // Step 11: Deploy Admin Panel
      await this.deployAdminPanel(namespace);

      // Step 12: Deploy Nginx (reverse proxy)
      await this.deployNginx(namespace);

      // Step 13: Create Ingress (HTTPS routing)
      await this.createIngress(namespace, customerId, domain);

      // Step 14: Wait for deployments to be ready
      await this.waitForDeployments(namespace);

      console.log(`✅ Stack deployed: ${instanceUrl}`);

      return {
        namespace,
        instanceUrl,
        status: 'ready',
      };

    } catch (error: any) {
      console.error(`❌ Deployment failed for ${customerId}:`, error);
      
      // Cleanup on failure
      await this.deleteNamespace(namespace);
      
      throw new Error(`Deployment failed: ${error.message}`);
    }
  }

  /**
   * Create namespace with labels
   */
  private static async createNamespace(namespace: string, customerId: string) {
    const ns = {
      metadata: {
        name: namespace,
        labels: {
          'app.kubernetes.io/managed-by': 'billing-api',
          'customer-id': customerId,
          'environment': 'production',
        },
        annotations: {
          'created-at': new Date().toISOString(),
        }
      },
    };

    await this.coreApi.createNamespace(ns);
    console.log(`  ✓ Namespace created: ${namespace}`);
  }

  /**
   * Create secrets (license, passwords, API keys)
   */
  private static async createSecrets(
    namespace: string, 
    license: string, 
    customerId: string
  ) {
    // Get public key from LicenseGenerator
    const publicKey = await readFileSync(
      path.join(__dirname, '../../keys/public-key.pem'),
      'utf-8'
    );

    const secrets = {
      metadata: {
        name: 'Iotistic-secrets',
        namespace,
      },
      type: 'Opaque',
      stringData: {
        // License keys
        IOTISTIC_LICENSE_KEY: license,
        LICENSE_PUBLIC_KEY: publicKey,
        
        // Database credentials
        POSTGRES_PASSWORD: this.generateSecurePassword(),
        INFLUXDB_PASSWORD: this.generateSecurePassword(),
        MQTT_PASSWORD: this.generateSecurePassword(),
        
        // API keys
        JWT_SECRET: this.generateSecurePassword(32),
        DEVICE_API_KEY: this.generateSecurePassword(32),
        
        // Customer info
        CUSTOMER_ID: customerId,
      },
    };

    await this.coreApi.createNamespacedSecret(namespace, secrets);
    console.log(`  ✓ Secrets created`);
  }

  /**
   * Deploy API service with license key
   */
  private static async deployAPI(namespace: string, customerId: string) {
    const deployment = {
      metadata: {
        name: 'api',
        namespace,
        labels: { app: 'api' },
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'api' } },
        template: {
          metadata: { labels: { app: 'api' } },
          spec: {
            containers: [{
              name: 'api',
              image: 'iotistic/api:latest',  // Your API image
              ports: [{ containerPort: 3001 }],
              env: [
                // License keys from secret
                {
                  name: 'IOTISTIC_LICENSE_KEY',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'Iotistic-secrets',
                      key: 'IOTISTIC_LICENSE_KEY',
                    }
                  }
                },
                {
                  name: 'LICENSE_PUBLIC_KEY',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'Iotistic-secrets',
                      key: 'LICENSE_PUBLIC_KEY',
                    }
                  }
                },
                // Database config
                {
                  name: 'DB_HOST',
                  value: 'postgres',
                },
                {
                  name: 'DB_PASSWORD',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'Iotistic-secrets',
                      key: 'POSTGRES_PASSWORD',
                    }
                  }
                },
                // Other env vars...
              ],
              resources: {
                requests: { memory: '256Mi', cpu: '250m' },
                limits: { memory: '512Mi', cpu: '500m' },
              },
            }],
          },
        },
      },
    };

    await this.appsApi.createNamespacedDeployment(namespace, deployment);
    
    // Create service
    const service = {
      metadata: { name: 'api', namespace },
      spec: {
        selector: { app: 'api' },
        ports: [{ port: 3001, targetPort: 3001 }],
      },
    };
    
    await this.coreApi.createNamespacedService(namespace, service);
    console.log(`  ✓ API deployed`);
  }

  /**
   * Create Ingress for HTTPS access
   */
  private static async createIngress(
    namespace: string,
    customerId: string,
    domain: string
  ) {
    const ingress = {
      metadata: {
        name: 'Iotistic-ingress',
        namespace,
        annotations: {
          'kubernetes.io/ingress.class': 'nginx',
          'cert-manager.io/cluster-issuer': 'letsencrypt-prod',  // Auto HTTPS
          'nginx.ingress.kubernetes.io/ssl-redirect': 'true',
        },
      },
      spec: {
        tls: [{
          hosts: [`${customerId}.${domain}`],
          secretName: `${customerId}-tls`,  // cert-manager will create this
        }],
        rules: [{
          host: `${customerId}.${domain}`,
          http: {
            paths: [
              {
                path: '/api',
                pathType: 'Prefix',
                backend: {
                  service: { name: 'api', port: { number: 3001 } }
                }
              },
              {
                path: '/grafana',
                pathType: 'Prefix',
                backend: {
                  service: { name: 'grafana', port: { number: 3000 } }
                }
              },
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: { name: 'admin', port: { number: 80 } }
                }
              },
            ],
          },
        }],
      },
    };

    await this.networkingApi.createNamespacedIngress(namespace, ingress);
    console.log(`  ✓ Ingress created: https://${customerId}.${domain}`);
  }

  /**
   * Wait for all deployments to be ready
   */
  private static async waitForDeployments(
    namespace: string,
    timeoutSeconds: number = 300
  ): Promise<void> {
    const startTime = Date.now();
    const deployments = ['api', 'postgres', 'influxdb', 'mosquitto', 'grafana', 'admin'];

    console.log(`  ⏳ Waiting for deployments to be ready...`);

    while (Date.now() - startTime < timeoutSeconds * 1000) {
      const readyDeployments = [];

      for (const name of deployments) {
        try {
          const deployment = await this.appsApi.readNamespacedDeploymentStatus(name, namespace);
          const ready = deployment.body.status?.readyReplicas || 0;
          const desired = deployment.body.spec?.replicas || 1;

          if (ready >= desired) {
            readyDeployments.push(name);
          }
        } catch (error) {
          // Deployment might not exist yet
        }
      }

      if (readyDeployments.length === deployments.length) {
        console.log(`  ✓ All deployments ready!`);
        return;
      }

      console.log(`  ⏳ ${readyDeployments.length}/${deployments.length} ready...`);
      await new Promise(resolve => setTimeout(resolve, 5000));  // Wait 5s
    }

    throw new Error(`Deployment timeout after ${timeoutSeconds}s`);
  }

  /**
   * Generate secure random password
   */
  private static generateSecurePassword(length: number = 24): string {
    return crypto.randomBytes(length).toString('base64').slice(0, length);
  }

  /**
   * Delete namespace (cleanup on failure)
   */
  private static async deleteNamespace(namespace: string) {
    try {
      await this.coreApi.deleteNamespace(namespace);
      console.log(`  🗑️  Namespace deleted: ${namespace}`);
    } catch (error) {
      console.error(`Failed to delete namespace ${namespace}:`, error);
    }
  }

  // Additional methods for other services (PostgreSQL, InfluxDB, etc.)
  // Similar pattern: deployment + service + configmaps/secrets
}
```

---

### Phase 3: Deployment Queue (Production)

For production, use a job queue to handle async deployments:

**File**: `billing/src/services/deployment-queue.ts`

```typescript
import Bull from 'bull';
import { K8sDeploymentService } from './k8s-deployment-service';
import { CustomerModel } from '../db/customer-model';

// Create queue
export const deploymentQueue = new Bull('customer-deployments', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

/**
 * Process deployment jobs
 */
deploymentQueue.process('deploy-customer-stack', async (job) => {
  const { customerId, email, companyName, license } = job.data;

  console.log(`📦 Processing deployment for ${customerId} (${email})`);

  try {
    // Update customer status
    await query(
      'UPDATE customers SET deployment_status = $1 WHERE customer_id = $2',
      ['provisioning', customerId]
    );

    // Deploy to K8s
    const deployment = await K8sDeploymentService.deployCustomerStack(
      customerId,
      license
    );

    // Update customer with instance URL
    await query(
      `UPDATE customers 
       SET deployment_status = $1, instance_url = $2, deployed_at = CURRENT_TIMESTAMP
       WHERE customer_id = $3`,
      ['ready', deployment.instanceUrl, customerId]
    );

    // Send ready email
    await emailService.sendInstanceReady({
      email,
      companyName,
      instanceUrl: deployment.instanceUrl,
      loginUrl: `${deployment.instanceUrl}/login`,
    });

    console.log(`✅ Deployment complete: ${deployment.instanceUrl}`);

    return { success: true, deployment };

  } catch (error: any) {
    console.error(`❌ Deployment failed for ${customerId}:`, error);

    // Update status to failed
    await query(
      `UPDATE customers 
       SET deployment_status = $1, deployment_error = $2
       WHERE customer_id = $3`,
      ['failed', error.message, customerId]
    );

    // Send failure email
    await emailService.sendDeploymentFailed({
      email,
      companyName,
      error: error.message,
    });

    throw error;
  }
});

// Monitor queue
deploymentQueue.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed:`, result);
});

deploymentQueue.on('failed', (job, error) => {
  console.error(`❌ Job ${job.id} failed:`, error);
});
```

---

### Phase 4: Database Schema Updates

Add deployment tracking to customers table:

```sql
-- Migration: 003_add_deployment_tracking.sql

ALTER TABLE customers 
ADD COLUMN deployment_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN instance_url VARCHAR(255),
ADD COLUMN deployed_at TIMESTAMP,
ADD COLUMN deployment_error TEXT;

CREATE INDEX idx_customers_deployment_status ON customers(deployment_status);

COMMENT ON COLUMN customers.deployment_status IS 'Deployment status: pending, provisioning, ready, failed';
COMMENT ON COLUMN customers.instance_url IS 'Customer instance URL (e.g., https://cust-123.yourdomain.com)';
```

---

## Best Practices

### 1. **Trial Duration & Expiration**

```typescript
// Recommended: 14-day trial
const TRIAL_DAYS = 14;

// Send reminder emails:
// - Day 7: "7 days left in your trial"
// - Day 12: "2 days left - time to upgrade!"
// - Day 14: "Trial expired - upgrade to continue"

// Grace period: 3 days after trial ends (read-only mode)
```

### 2. **Namespace Isolation**

- **One namespace per customer** for security & resource isolation
- Use `ResourceQuotas` to limit CPU/memory per customer
- Use `NetworkPolicies` to isolate traffic

### 3. **Resource Sizing by Plan**

```typescript
const PLAN_RESOURCES = {
  starter: {
    api: { cpu: '250m', memory: '256Mi' },
    postgres: { cpu: '500m', memory: '512Mi' },
  },
  professional: {
    api: { cpu: '500m', memory: '512Mi' },
    postgres: { cpu: '1000m', memory: '1Gi' },
  },
  enterprise: {
    api: { cpu: '2000m', memory: '2Gi' },
    postgres: { cpu: '4000m', memory: '4Gi' },
  },
};
```

### 4. **DNS & SSL**

- Use **cert-manager** for automatic HTTPS (Let's Encrypt)
- Wildcard DNS: `*.yourdomain.com` → K8s Ingress
- Each customer gets: `https://<customer-id>.yourdomain.com`

### 5. **Deployment Monitoring**

```typescript
// Track deployment metrics
await query(`
  INSERT INTO deployment_metrics (customer_id, duration_seconds, status)
  VALUES ($1, $2, $3)
`, [customerId, duration, 'success']);

// Average deployment time (target: < 3 minutes)
SELECT AVG(duration_seconds) FROM deployment_metrics WHERE status = 'success';
```

### 6. **Failure Handling**

- **Retry logic**: 3 attempts with exponential backoff
- **Cleanup on failure**: Delete namespace to avoid orphaned resources
- **Support notification**: Alert team on repeated failures

---

## Alternative Approaches

### Option A: Helm Charts (Recommended)

Instead of manual K8s API calls, use Helm:

```typescript
// Install via Helm
await exec(`helm install customer-${customerId} ./charts/Iotistic \\
  --namespace ${namespace} \\
  --set license.key="${license}" \\
  --set customer.id="${customerId}" \\
  --set domain="${domain}"`);
```

**Pros**: Version control, rollbacks, easier updates

### Option B: Terraform

Use Terraform K8s provider for infrastructure-as-code.

### Option C: ArgoCD

GitOps approach - commit customer config to Git, ArgoCD deploys automatically.

---

## Testing Locally

```powershell
# 1. Start billing API
cd billing
npm run dev

# 2. Sign up a test customer
$signup = @{
    email = "test@example.com"
    password = "SecurePass123"
    company_name = "Test Corp"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3100/api/customers/signup" `
    -Method POST `
    -Body $signup `
    -ContentType "application/json"

# 3. Check deployment status
docker exec -it billing-postgres-1 psql -U billing -d billing -c \
  "SELECT customer_id, email, deployment_status, instance_url FROM customers ORDER BY created_at DESC LIMIT 1;"
```

---

## Production Checklist

- [ ] Set up K8s cluster with Ingress Controller
- [ ] Install cert-manager for HTTPS
- [ ] Configure wildcard DNS (*.yourdomain.com)
- [ ] Set up Redis for job queue
- [ ] Configure email service (SendGrid, Mailgun, etc.)
- [ ] Set resource quotas per namespace
- [ ] Enable monitoring (Prometheus + Grafana)
- [ ] Set up backup strategy (Velero for K8s)
- [ ] Create runbooks for deployment failures
- [ ] Test trial-to-paid upgrade flow

---

**Next**: Would you like me to implement the complete signup endpoint or create the Helm chart for K8s deployment?
