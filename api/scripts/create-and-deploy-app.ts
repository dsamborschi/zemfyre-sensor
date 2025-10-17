/**
 * Create Application and Deploy to Device
 * 
 * This script demonstrates the complete workflow:
 * 1. Create application template in catalog
 * 2. Deploy to specific device with customization
 * 
 * Usage:
 *   npx ts-node scripts/create-and-deploy-app.ts
 *   npx ts-node scripts/create-and-deploy-app.ts --device=abc123 --app=monitoring
 */

import { query } from '../src/db/connection';

interface ServiceConfig {
  serviceName: string;
  image: string;
  ports?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  labels?: Record<string, string>;
  networks?: string[];
}

interface ApplicationTemplate {
  appName: string;
  slug: string;
  description: string;
  defaultConfig: {
    services: ServiceConfig[];
  };
}

// ============================================================================
// Sample Application Templates
// ============================================================================

const MONITORING_TEMPLATE: ApplicationTemplate = {
  appName: 'monitoring',
  slug: 'monitoring-stack',
  description: 'Complete monitoring stack with Prometheus and Grafana',
  defaultConfig: {
    services: [
      {
        serviceName: 'prometheus',
        image: 'prom/prometheus:latest',
        ports: ['9090:9090'],
        environment: {
          RETENTION: '30d',
          SCRAPE_INTERVAL: '15s'
        },
        volumes: [
          '/data/prometheus:/prometheus'
        ]
      },
      {
        serviceName: 'grafana',
        image: 'grafana/grafana:latest',
        ports: ['3000:3000'],
        environment: {
          GF_SECURITY_ADMIN_USER: 'admin',
          GF_SECURITY_ADMIN_PASSWORD: 'admin',
          GF_INSTALL_PLUGINS: 'grafana-clock-panel'
        },
        volumes: [
          '/data/grafana:/var/lib/grafana'
        ]
      }
    ]
  }
};

const WEB_SERVER_TEMPLATE: ApplicationTemplate = {
  appName: 'web-server',
  slug: 'nginx-web-server',
  description: 'Nginx web server with SSL support',
  defaultConfig: {
    services: [
      {
        serviceName: 'nginx',
        image: 'nginx:alpine',
        ports: ['80:80', '443:443'],
        environment: {
          NGINX_HOST: 'localhost',
          NGINX_PORT: '80'
        },
        volumes: [
          '/data/nginx/html:/usr/share/nginx/html',
          '/data/nginx/conf:/etc/nginx/conf.d'
        ]
      }
    ]
  }
};

const DATABASE_TEMPLATE: ApplicationTemplate = {
  appName: 'database',
  slug: 'postgresql-database',
  description: 'PostgreSQL database server',
  defaultConfig: {
    services: [
      {
        serviceName: 'postgres',
        image: 'postgres:16-alpine',
        ports: ['5432:5432'],
        environment: {
          POSTGRES_USER: 'admin',
          POSTGRES_PASSWORD: 'changeme',
          POSTGRES_DB: 'myapp'
        },
        volumes: [
          '/data/postgres:/var/lib/postgresql/data'
        ]
      }
    ]
  }
};

const MQTT_TEMPLATE: ApplicationTemplate = {
  appName: 'mqtt-broker',
  slug: 'mosquitto-mqtt',
  description: 'Eclipse Mosquitto MQTT broker',
  defaultConfig: {
    services: [
      {
        serviceName: 'mosquitto',
        image: 'eclipse-mosquitto:latest',
        ports: ['1883:1883', '9001:9001'],
        volumes: [
          '/data/mosquitto/config:/mosquitto/config',
          '/data/mosquitto/data:/mosquitto/data',
          '/data/mosquitto/log:/mosquitto/log'
        ]
      }
    ]
  }
};

const ALL_TEMPLATES = {
  monitoring: MONITORING_TEMPLATE,
  'web-server': WEB_SERVER_TEMPLATE,
  database: DATABASE_TEMPLATE,
  'mqtt-broker': MQTT_TEMPLATE
};

// ============================================================================
// Helper Functions
// ============================================================================

async function createApplication(template: ApplicationTemplate): Promise<number> {
  console.log(`\n📦 Creating application: ${template.appName}`);
  
  // Check if already exists
  const existing = await query(
    'SELECT id FROM applications WHERE slug = $1',
    [template.slug]
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
      template.appName,
      template.slug,
      template.description,
      JSON.stringify(template.defaultConfig)
    ]
  );

  // Register in registry
  await query(
    `INSERT INTO app_service_ids (entity_type, entity_id, entity_name, metadata, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      'app',
      appId,
      template.appName,
      JSON.stringify({ slug: template.slug, description: template.description }),
      'script'
    ]
  );

  console.log(`   ✅ Application created with ID: ${appId}`);
  console.log(`   Services in template: ${template.defaultConfig.services.length}`);
  
  return appId;
}

async function deployToDevice(
  deviceUuid: string,
  appId: number,
  appName: string,
  services: ServiceConfig[]
): Promise<void> {
  console.log(`\n🚀 Deploying to device: ${deviceUuid.substring(0, 8)}...`);

  // Check if device exists (must be provisioned first)
  const deviceCheck = await query(
    'SELECT uuid, device_name, is_active FROM devices WHERE uuid = $1',
    [deviceUuid]
  );

  if (deviceCheck.rows.length === 0) {
    throw new Error(
      `Device ${deviceUuid} not found.\n` +
      `   Devices must be created through the provisioning process first.\n` +
      `   Use the device provisioning API endpoint to register new devices.`
    );
  }

  const device = deviceCheck.rows[0];
  console.log(`   ✓ Device found: ${device.device_name || 'Unnamed'}`);
  
  if (!device.is_active) {
    console.log(`   ⚠️  Warning: Device is inactive`);
  }

  // Get current target state
  const currentState = await query(
    'SELECT apps, config FROM device_target_state WHERE device_uuid = $1',
    [deviceUuid]
  );

  let currentApps = {};
  let currentConfig = {};

  if (currentState.rows.length > 0) {
    currentApps = typeof currentState.rows[0].apps === 'string' 
      ? JSON.parse(currentState.rows[0].apps)
      : currentState.rows[0].apps;
    currentConfig = typeof currentState.rows[0].config === 'string'
      ? JSON.parse(currentState.rows[0].config)
      : currentState.rows[0].config;
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
          'script'
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

  // Add app to target state
  const newApps = {
    ...currentApps,
    [appId]: {
      appId,
      appName,
      services: servicesWithIds
    }
  };

  // Upsert target state
  const version = currentState.rows.length > 0 ? (currentState.rows[0].version || 0) + 1 : 1;

  await query(
    `INSERT INTO device_target_state (device_uuid, apps, config, version, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (device_uuid) DO UPDATE SET
       apps = $2,
       config = $3,
       version = $4,
       updated_at = NOW()`,
    [deviceUuid, JSON.stringify(newApps), JSON.stringify(currentConfig), version]
  );

  console.log(`   ✅ Deployed successfully!`);
  console.log(`   App ID: ${appId}`);
  console.log(`   Services deployed: ${servicesWithIds.length}`);
  servicesWithIds.forEach((svc) => {
    console.log(`     - ${svc.serviceName} (ID: ${svc.serviceId}, Image: ${svc.imageName})`);
  });
  console.log(`   Target state version: ${version}`);
}

async function listDevices(): Promise<void> {
  console.log('\n📋 Listing all devices:\n');
  
  const devices = await query(`
    SELECT d.uuid, d.device_name, d.device_type, d.is_online, d.is_active,
           dts.apps, dts.version
    FROM devices d
    LEFT JOIN device_target_state dts ON d.uuid = dts.device_uuid
    ORDER BY d.created_at DESC
  `);

  if (devices.rows.length === 0) {
    console.log('   No devices found.');
    return;
  }

  devices.rows.forEach((device, index) => {
    console.log(`${index + 1}. ${device.uuid.substring(0, 8)}... (${device.device_name || 'Unnamed'})`);
    console.log(`   Type: ${device.device_type || 'unknown'}`);
    console.log(`   Status: ${device.is_online ? '🟢 Online' : '🔴 Offline'} | ${device.is_active ? '✅ Active' : '❌ Inactive'}`);
    
    if (device.apps) {
      const apps = typeof device.apps === 'string' ? JSON.parse(device.apps) : device.apps;
      const appCount = Object.keys(apps).length;
      console.log(`   Apps deployed: ${appCount}`);
      Object.entries(apps).forEach(([appId, app]: [string, any]) => {
        console.log(`     - ${app.appName} (ID: ${appId}, Services: ${app.services?.length || 0})`);
      });
      console.log(`   Version: ${device.version || 1}`);
    } else {
      console.log(`   Apps deployed: 0`);
    }
    console.log('');
  });
}

async function listApplications(): Promise<void> {
  console.log('\n📚 Available application templates:\n');
  
  const apps = await query('SELECT * FROM applications ORDER BY id');

  if (apps.rows.length === 0) {
    console.log('   No applications in catalog.');
    return;
  }

  apps.rows.forEach((app, index) => {
    console.log(`${index + 1}. ${app.app_name} (ID: ${app.id})`);
    console.log(`   Slug: ${app.slug}`);
    console.log(`   Description: ${app.description}`);
    
    const config = typeof app.default_config === 'string' 
      ? JSON.parse(app.default_config)
      : app.default_config;
    
    if (config.services) {
      console.log(`   Services: ${config.services.length}`);
      config.services.forEach((svc: any) => {
        console.log(`     - ${svc.serviceName} (${svc.image})`);
      });
    }
    console.log('');
  });
}

// ============================================================================
// Main Script
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   Application Creator & Deployer');
  console.log('═══════════════════════════════════════════════════════════');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const deviceUuid = args.find(arg => arg.startsWith('--device='))?.split('=')[1];
  const appName = args.find(arg => arg.startsWith('--app='))?.split('=')[1];
  const customPort = args.find(arg => arg.startsWith('--port='))?.split('=')[1];
  const listOnly = args.includes('--list');
  const listDevicesOnly = args.includes('--list-devices');

  try {
    // List applications
    if (listOnly) {
      await listApplications();
      return;
    }

    // List devices
    if (listDevicesOnly) {
      await listDevices();
      return;
    }

    // Show available templates
    console.log('\n📦 Available templates:');
    Object.keys(ALL_TEMPLATES).forEach((key, index) => {
      const template = ALL_TEMPLATES[key as keyof typeof ALL_TEMPLATES];
      console.log(`   ${index + 1}. ${key} - ${template.description}`);
    });

    // Determine which app to create
    let selectedTemplate: ApplicationTemplate;
    let selectedAppName: string;

    if (appName && appName in ALL_TEMPLATES) {
      selectedAppName = appName;
      selectedTemplate = ALL_TEMPLATES[appName as keyof typeof ALL_TEMPLATES];
    } else {
      // Default to monitoring
      selectedAppName = 'monitoring';
      selectedTemplate = MONITORING_TEMPLATE;
      console.log(`\n   ℹ️  No app specified, using default: ${selectedAppName}`);
      console.log(`   (Use --app=<name> to select: ${Object.keys(ALL_TEMPLATES).join(', ')})`);
    }

    // Create application
    const appId = await createApplication(selectedTemplate);

    // Determine device UUID
    let targetDeviceUuid: string;
    
    if (deviceUuid) {
      targetDeviceUuid = deviceUuid;
    } else {
      // Use test device UUID (must exist in database via provisioning)
      targetDeviceUuid = '12345678-1234-1234-1234-123456789abc';
      console.log(`\n   ℹ️  No device specified, using test device: ${targetDeviceUuid.substring(0, 8)}...`);
      console.log(`   (Use --device=<uuid> to specify a provisioned device)`);
      console.log(`   ⚠️  Note: Device must exist (created via provisioning process)`);
    }

    // Customize services if custom port specified
    let services = [...selectedTemplate.defaultConfig.services];
    
    if (customPort) {
      console.log(`\n   🔧 Customizing ports: Using ${customPort} as base port`);
      const basePort = parseInt(customPort);
      services = services.map((service, index) => {
        const customPortMapping = service.ports ? 
          service.ports.map(p => {
            const [, internal] = p.split(':');
            return `${basePort + index}:${internal}`;
          }) : 
          undefined;
        
        return {
          ...service,
          ...(customPortMapping && { ports: customPortMapping })
        };
      });
    }

    // Deploy to device
    await deployToDevice(targetDeviceUuid, appId, selectedTemplate.appName, services);

    // Show what the device will receive
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   ✅ Complete! Device can now poll for state');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\nDevice will poll: GET /api/v1/device/${targetDeviceUuid}/state`);
    console.log('\nTo check the state:');
    console.log(`  curl http://localhost:3002/api/v1/devices/${targetDeviceUuid}/target-state`);
    console.log('\nTo list all applications:');
    console.log('  npx ts-node scripts/create-and-deploy-app.ts --list');
    console.log('\nTo list all devices:');
    console.log('  npx ts-node scripts/create-and-deploy-app.ts --list-devices');
    console.log('\nTo deploy different app:');
    console.log('  npx ts-node scripts/create-and-deploy-app.ts --app=web-server --device=<uuid>');
    console.log('\nTo customize ports:');
    console.log('  npx ts-node scripts/create-and-deploy-app.ts --app=monitoring --port=8097\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main };
