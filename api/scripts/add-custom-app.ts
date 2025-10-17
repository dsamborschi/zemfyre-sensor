/**
 * Add Custom Application to Device
 * 
 * Interactive script to create a custom application with custom services
 * and deploy it to a specific provisioned device.
 * 
 * Usage:
 *   npx ts-node scripts/add-custom-app.ts --device=<uuid>
 *   npx ts-node scripts/add-custom-app.ts --device=<uuid> --interactive
 */

import { query } from '../src/db/connection';
import * as readline from 'readline';

interface ServiceConfig {
  serviceName: string;
  image: string;
  ports?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  labels?: Record<string, string>;
  networks?: string[];
}

interface ApplicationConfig {
  appName: string;
  slug: string;
  description: string;
  services: ServiceConfig[];
}

// ============================================================================
// Helper Functions
// ============================================================================

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function verifyDevice(deviceUuid: string): Promise<{ name: string; isOnline: boolean; isActive: boolean }> {
  const result = await query(
    'SELECT device_name, is_online, is_active FROM devices WHERE uuid = $1',
    [deviceUuid]
  );

  if (result.rows.length === 0) {
    throw new Error(
      `Device ${deviceUuid} not found.\n` +
      `   Device must be provisioned first.\n` +
      `   Use: npx ts-node scripts/provision-device.ts --list`
    );
  }

  return {
    name: result.rows[0].device_name,
    isOnline: result.rows[0].is_online,
    isActive: result.rows[0].is_active
  };
}

async function createApplication(appConfig: ApplicationConfig): Promise<number> {
  console.log(`\n📦 Creating application: ${appConfig.appName}`);
  
  // Check if already exists
  const existing = await query(
    'SELECT id FROM applications WHERE slug = $1',
    [appConfig.slug]
  );

  if (existing.rows.length > 0) {
    const existingId = existing.rows[0].id;
    console.log(`   ⚠️  Application already exists with ID: ${existingId}`);
    console.log(`   Using existing application...`);
    return existingId;
  }

  // Get next app ID from sequence
  const idResult = await query<{ nextval: number }>(
    "SELECT nextval('global_app_id_seq') as nextval"
  );
  const appId = idResult.rows[0].nextval;

  // Insert application
  await query(
    `INSERT INTO applications (id, app_name, slug, description, default_config)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      appId,
      appConfig.appName,
      appConfig.slug,
      appConfig.description,
      JSON.stringify({ services: appConfig.services })
    ]
  );

  // Register in registry
  await query(
    `INSERT INTO app_service_ids (entity_type, entity_id, entity_name, metadata, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      'app',
      appId,
      appConfig.appName,
      JSON.stringify({ slug: appConfig.slug, description: appConfig.description }),
      'custom-script'
    ]
  );

  console.log(`   ✅ Application created with ID: ${appId}`);
  return appId;
}

async function deployToDevice(
  deviceUuid: string,
  appId: number,
  appName: string,
  services: ServiceConfig[]
): Promise<void> {
  console.log(`\n🚀 Deploying to device: ${deviceUuid.substring(0, 8)}...`);

  // Get current target state
  const currentState = await query(
    'SELECT apps, config, version FROM device_target_state WHERE device_uuid = $1',
    [deviceUuid]
  );

  let currentApps: any = {};
  let currentConfig: any = {};
  let currentVersion = 0;

  if (currentState.rows.length > 0) {
    currentApps = typeof currentState.rows[0].apps === 'string' 
      ? JSON.parse(currentState.rows[0].apps)
      : currentState.rows[0].apps;
    currentConfig = typeof currentState.rows[0].config === 'string'
      ? JSON.parse(currentState.rows[0].config)
      : currentState.rows[0].config;
    currentVersion = currentState.rows[0].version || 0;
  }

  // Check if app already deployed
  if (currentApps[appId]) {
    console.log(`   ⚠️  App ${appId} already deployed to this device`);
    console.log(`   Current services: ${currentApps[appId].services?.length || 0}`);
    const answer = await question(
      createInterface(),
      '   Overwrite? (y/n): '
    );
    if (answer.toLowerCase() !== 'y') {
      console.log('   ❌ Cancelled');
      return;
    }
  }

  // Generate service IDs and build services array
  const servicesWithIds = await Promise.all(
    services.map(async (service) => {
      const idResult = await query<{ nextval: number }>(
        "SELECT nextval('global_service_id_seq') as nextval"
      );
      const serviceId = idResult.rows[0].nextval;

      // Register service
      await query(
        `INSERT INTO app_service_ids (entity_type, entity_id, entity_name, metadata, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'service',
          serviceId,
          service.serviceName,
          JSON.stringify({ 
            appId, 
            appName,
            imageName: service.image 
          }),
          'custom-script'
        ]
      );

      return {
        serviceId,
        serviceName: service.serviceName,
        imageName: service.image,
        config: {
          ...(service.ports && { ports: service.ports }),
          ...(service.environment && { environment: service.environment }),
          ...(service.volumes && { volumes: service.volumes }),
          ...(service.labels && { labels: service.labels }),
          ...(service.networks && { networks: service.networks })
        }
      };
    })
  );

  // Add/update app in target state
  const newApps = {
    ...currentApps,
    [appId]: {
      appId,
      appName,
      services: servicesWithIds
    }
  };

  // Update target state
  const newVersion = currentVersion + 1;

  await query(
    `INSERT INTO device_target_state (device_uuid, apps, config, version, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (device_uuid) DO UPDATE SET
       apps = $2,
       config = $3,
       version = $4,
       updated_at = NOW()`,
    [deviceUuid, JSON.stringify(newApps), JSON.stringify(currentConfig), newVersion]
  );

  console.log(`   ✅ Deployed successfully!`);
  console.log(`   App ID: ${appId}`);
  console.log(`   Services deployed: ${servicesWithIds.length}`);
  servicesWithIds.forEach((svc) => {
    console.log(`     - ${svc.serviceName} (ID: ${svc.serviceId}, Image: ${svc.imageName})`);
  });
  console.log(`   Target state version: ${newVersion}`);
}

// ============================================================================
// Interactive Mode
// ============================================================================

async function interactiveMode(deviceUuid: string): Promise<void> {
  const rl = createInterface();

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Custom Application Builder (Interactive)             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Application details
    const appName = await question(rl, '📦 Application name: ');
    const slug = await question(rl, '🔗 Slug (url-friendly name): ');
    const description = await question(rl, '📝 Description: ');

    const services: ServiceConfig[] = [];
    let addMore = true;

    while (addMore) {
      console.log(`\n--- Service ${services.length + 1} ---`);
      
      const serviceName = await question(rl, 'Service name: ');
      const image = await question(rl, 'Docker image (e.g., nginx:alpine): ');
      const portsStr = await question(rl, 'Ports (e.g., 80:80,443:443 or press Enter to skip): ');
      
      const ports = portsStr.trim() ? portsStr.split(',').map(p => p.trim()) : undefined;

      // Environment variables
      const envVars: Record<string, string> = {};
      let addEnv = true;
      const hasEnv = await question(rl, 'Add environment variables? (y/n): ');
      
      if (hasEnv.toLowerCase() === 'y') {
        while (addEnv) {
          const envKey = await question(rl, '  Env key (or press Enter to finish): ');
          if (!envKey.trim()) {
            addEnv = false;
            break;
          }
          const envValue = await question(rl, `  Env value for ${envKey}: `);
          envVars[envKey] = envValue;
        }
      }

      // Volumes
      const volumesStr = await question(rl, 'Volumes (e.g., /data:/app/data or press Enter to skip): ');
      const volumes = volumesStr.trim() ? [volumesStr] : undefined;

      services.push({
        serviceName,
        image,
        ...(ports && { ports }),
        ...(Object.keys(envVars).length > 0 && { environment: envVars }),
        ...(volumes && { volumes })
      });

      const more = await question(rl, '\nAdd another service? (y/n): ');
      addMore = more.toLowerCase() === 'y';
    }

    rl.close();

    // Create and deploy
    const appConfig: ApplicationConfig = {
      appName,
      slug,
      description,
      services
    };

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║     Summary                                               ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`\nApplication: ${appName}`);
    console.log(`Slug: ${slug}`);
    console.log(`Description: ${description}`);
    console.log(`Services: ${services.length}`);
    services.forEach((svc, idx) => {
      console.log(`  ${idx + 1}. ${svc.serviceName} (${svc.image})`);
      if (svc.ports) console.log(`     Ports: ${svc.ports.join(', ')}`);
      if (svc.environment) console.log(`     Env vars: ${Object.keys(svc.environment).length}`);
    });

    const appId = await createApplication(appConfig);
    await deployToDevice(deviceUuid, appId, appConfig.appName, appConfig.services);

  } catch (error) {
    rl.close();
    throw error;
  }
}

// ============================================================================
// Quick Mode (JSON input)
// ============================================================================

async function quickMode(deviceUuid: string, appConfig: ApplicationConfig): Promise<void> {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Custom Application Builder (Quick Mode)              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  const appId = await createApplication(appConfig);
  await deployToDevice(deviceUuid, appId, appConfig.appName, appConfig.services);
}

// ============================================================================
// Example Configurations
// ============================================================================

const EXAMPLE_CONFIGS: Record<string, ApplicationConfig> = {
  'node-app': {
    appName: 'node-application',
    slug: 'node-app',
    description: 'Node.js application with Redis',
    services: [
      {
        serviceName: 'node-server',
        image: 'node:18-alpine',
        ports: ['3000:3000'],
        environment: {
          NODE_ENV: 'production',
          REDIS_HOST: 'redis'
        },
        volumes: ['/app/data:/data']
      },
      {
        serviceName: 'redis',
        image: 'redis:7-alpine',
        ports: ['6379:6379'],
        volumes: ['/data/redis:/data']
      }
    ]
  },
  'python-app': {
    appName: 'python-application',
    slug: 'python-app',
    description: 'Python Flask application',
    services: [
      {
        serviceName: 'flask-app',
        image: 'python:3.11-slim',
        ports: ['5000:5000'],
        environment: {
          FLASK_APP: 'app.py',
          FLASK_ENV: 'production'
        },
        volumes: ['/app:/app']
      }
    ]
  },
  'docker-registry': {
    appName: 'docker-registry',
    slug: 'docker-registry',
    description: 'Private Docker registry',
    services: [
      {
        serviceName: 'registry',
        image: 'registry:2',
        ports: ['5000:5000'],
        environment: {
          REGISTRY_STORAGE_FILESYSTEM_ROOTDIRECTORY: '/data'
        },
        volumes: ['/data/registry:/data']
      }
    ]
  }
};

// ============================================================================
// Main Script
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   Custom Application Deployment Tool');
  console.log('═══════════════════════════════════════════════════════════');

  const args = process.argv.slice(2);
  const deviceUuid = args.find(arg => arg.startsWith('--device='))?.split('=')[1];
  const interactive = args.includes('--interactive') || args.includes('-i');
  const example = args.find(arg => arg.startsWith('--example='))?.split('=')[1];
  const listExamples = args.includes('--list-examples');

  try {
    // List examples
    if (listExamples) {
      console.log('\n📚 Available example configurations:\n');
      Object.entries(EXAMPLE_CONFIGS).forEach(([key, config]) => {
        console.log(`${key}:`);
        console.log(`  Name: ${config.appName}`);
        console.log(`  Description: ${config.description}`);
        console.log(`  Services: ${config.services.length}`);
        config.services.forEach(svc => {
          console.log(`    - ${svc.serviceName} (${svc.image})`);
        });
        console.log('');
      });
      console.log('Usage:');
      console.log('  npx ts-node scripts/add-custom-app.ts --device=<uuid> --example=<name>');
      return;
    }

    // Validate device UUID
    if (!deviceUuid) {
      console.log('\n❌ Error: Device UUID is required');
      console.log('\nUsage:');
      console.log('  Interactive mode:');
      console.log('    npx ts-node scripts/add-custom-app.ts --device=<uuid> --interactive');
      console.log('\n  Quick mode with example:');
      console.log('    npx ts-node scripts/add-custom-app.ts --device=<uuid> --example=node-app');
      console.log('\n  List examples:');
      console.log('    npx ts-node scripts/add-custom-app.ts --list-examples');
      process.exit(1);
    }

    // Verify device exists
    console.log(`\n🔍 Verifying device: ${deviceUuid.substring(0, 8)}...`);
    const device = await verifyDevice(deviceUuid);
    console.log(`   ✓ Device found: ${device.name}`);
    console.log(`   Status: ${device.isOnline ? '🟢 Online' : '🔴 Offline'} | ${device.isActive ? '✅ Active' : '❌ Inactive'}`);

    // Choose mode
    if (interactive) {
      await interactiveMode(deviceUuid);
    } else if (example && EXAMPLE_CONFIGS[example]) {
      await quickMode(deviceUuid, EXAMPLE_CONFIGS[example]);
    } else if (example) {
      console.log(`\n❌ Error: Example '${example}' not found`);
      console.log('\nAvailable examples:');
      Object.keys(EXAMPLE_CONFIGS).forEach(key => {
        console.log(`  - ${key}`);
      });
      console.log('\nUse --list-examples to see details');
      process.exit(1);
    } else {
      console.log('\n❌ Error: Please specify --interactive or --example=<name>');
      console.log('\nUsage:');
      console.log('  npx ts-node scripts/add-custom-app.ts --device=<uuid> --interactive');
      console.log('  npx ts-node scripts/add-custom-app.ts --device=<uuid> --example=node-app');
      console.log('  npx ts-node scripts/add-custom-app.ts --list-examples');
      process.exit(1);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   ✅ Complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\nDevice will receive update on next poll.`);
    console.log(`\nTo check current state:`);
    console.log(`  npx ts-node scripts/create-and-deploy-app.ts --list-devices`);
    console.log(`\nTo verify target state:`);
    console.log(`  curl http://localhost:3002/api/v1/devices/${deviceUuid}/target-state\n`);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { interactiveMode, quickMode };
