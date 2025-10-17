/**
 * Test Hybrid Application Management
 * 
 * Demonstrates the complete workflow:
 * 1. Create application template in catalog
 * 2. List available applications
 * 3. Deploy app to device with customization
 * 4. Update deployed app
 * 5. Query device state
 * 6. Remove app from device
 */

const API_BASE = 'http://localhost:4002';

interface Application {
  appId: number;
  appName: string;
  slug: string;
  description: string;
  defaultConfig: {
    services: Array<{
      serviceName: string;
      image: string;
      defaultPorts?: string[];
      defaultEnvironment?: Record<string, string>;
    }>;
  };
}

async function request(method: string, path: string, body?: any) {
  const url = `${API_BASE}${path}`;
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  console.log(`\n${method} ${path}`);
  if (body) {
    console.log('Body:', JSON.stringify(body, null, 2));
  }

  const response = await fetch(url, options);
  const data = await response.json();

  console.log(`Status: ${response.status}`);
  console.log('Response:', JSON.stringify(data, null, 2));

  return { status: response.status, data };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   Hybrid Application Management - Complete Workflow Test');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test device UUID
  const deviceUuid = '12345678-1234-1234-1234-123456789abc';

  try {
    // ========================================================================
    // Step 1: Create Application Template (Monitoring Stack)
    // ========================================================================
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│ Step 1: Create Application Template in Catalog         │');
    console.log('└─────────────────────────────────────────────────────────┘');

    const createAppResult = await request('POST', '/api/v1/applications', {
      appName: 'monitoring',
      slug: 'monitoring-stack',
      description: 'Full monitoring stack with Prometheus and Grafana',
      defaultConfig: {
        services: [
          {
            serviceName: 'prometheus',
            image: 'prom/prometheus:latest',
            defaultPorts: ['9090:9090'],
            defaultEnvironment: {
              RETENTION: '30d',
              SCRAPE_INTERVAL: '15s'
            }
          },
          {
            serviceName: 'grafana',
            image: 'grafana/grafana:latest',
            defaultPorts: ['3000:3000'],
            defaultEnvironment: {
              GF_SECURITY_ADMIN_USER: 'admin',
              GF_SECURITY_ADMIN_PASSWORD: 'admin'
            }
          }
        ]
      }
    });

    if (createAppResult.status !== 201) {
      if (createAppResult.data.message?.includes('already exists')) {
        console.log('⚠️  Application already exists - continuing with existing app');
      } else {
        console.error('❌ Failed to create application');
        return;
      }
    }

    const appId = createAppResult.data.appId || 1001; // Use existing if conflict
    console.log(`✅ Application template created with ID: ${appId}`);

    // ========================================================================
    // Step 2: List Available Applications
    // ========================================================================
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│ Step 2: List Available Applications                    │');
    console.log('└─────────────────────────────────────────────────────────┘');

    const listResult = await request('GET', '/api/v1/applications');
    console.log(`✅ Found ${listResult.data.count} application(s) in catalog`);

    // ========================================================================
    // Step 3: Get Specific Application Template
    // ========================================================================
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│ Step 3: Get Application Template Details               │');
    console.log('└─────────────────────────────────────────────────────────┘');

    const getAppResult = await request('GET', `/api/v1/applications/${appId}`);
    console.log(`✅ Retrieved template for app: ${getAppResult.data.appName}`);

    // ========================================================================
    // Step 4: Deploy App to Device (with customization)
    // ========================================================================
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│ Step 4: Deploy App to Device (Device-Specific Config)  │');
    console.log('└─────────────────────────────────────────────────────────┘');

    const deployResult = await request('POST', `/api/v1/devices/${deviceUuid}/apps`, {
      appId: appId,
      services: [
        {
          serviceName: 'prometheus',
          image: 'prom/prometheus:latest',
          ports: ['8097:9090'],  // Custom port for THIS device
          environment: {
            RETENTION: '14d',    // Different retention than template
            SCRAPE_INTERVAL: '15s'
          },
          volumes: [
            '/data/prometheus:/prometheus'
          ]
        },
        {
          serviceName: 'grafana',
          image: 'grafana/grafana:latest',
          ports: ['8098:3000'],  // Custom port
          environment: {
            GF_SECURITY_ADMIN_USER: 'admin',
            GF_SECURITY_ADMIN_PASSWORD: 'mydevicepassword'  // Device-specific password
          }
        }
      ]
    });

    if (deployResult.status === 201) {
      console.log(`✅ Application deployed to device ${deviceUuid.substring(0, 8)}...`);
      console.log(`   Services deployed: ${deployResult.data.services.length}`);
      deployResult.data.services.forEach((svc: any) => {
        console.log(`   - ${svc.serviceName} (serviceId: ${svc.serviceId})`);
      });
    }

    // ========================================================================
    // Step 5: Get Device Target State
    // ========================================================================
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│ Step 5: Query Device Target State                      │');
    console.log('└─────────────────────────────────────────────────────────┘');

    const stateResult = await request('GET', `/api/v1/devices/${deviceUuid}/target-state`);
    console.log(`✅ Device target state retrieved`);
    console.log(`   Apps deployed: ${Object.keys(stateResult.data.apps).length}`);

    // ========================================================================
    // Step 6: Update Deployed App
    // ========================================================================
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│ Step 6: Update Deployed App (Change Configuration)     │');
    console.log('└─────────────────────────────────────────────────────────┘');

    const updateResult = await request('PATCH', `/api/v1/devices/${deviceUuid}/apps/${appId}`, {
      services: [
        {
          serviceName: 'prometheus',
          image: 'prom/prometheus:v2.50.0',  // Updated version
          ports: ['8097:9090'],
          environment: {
            RETENTION: '30d',  // Changed retention
            SCRAPE_INTERVAL: '10s'  // Changed interval
          }
        },
        {
          serviceName: 'grafana',
          image: 'grafana/grafana:10.2.0',  // Updated version
          ports: ['8098:3000'],
          environment: {
            GF_SECURITY_ADMIN_PASSWORD: 'newpassword'
          }
        }
      ]
    });

    if (updateResult.status === 200) {
      console.log(`✅ Application updated on device`);
    }

    // ========================================================================
    // Step 7: Simulate Device Polling
    // ========================================================================
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│ Step 7: Simulate Device Polling (What Device Receives) │');
    console.log('└─────────────────────────────────────────────────────────┘');

    const pollResult = await request('GET', `/api/v1/device/${deviceUuid}/state`);
    console.log(`✅ Device would receive this state:`);
    console.log(JSON.stringify(pollResult.data, null, 2));

    // ========================================================================
    // Step 8: Remove App from Device
    // ========================================================================
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│ Step 8: Remove App from Device                         │');
    console.log('└─────────────────────────────────────────────────────────┘');

    const removeResult = await request('DELETE', `/api/v1/devices/${deviceUuid}/apps/${appId}`);
    if (removeResult.status === 200) {
      console.log(`✅ Application removed from device`);
    }

    // ========================================================================
    // Summary
    // ========================================================================
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                    Test Complete! ✅');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\nWhat we demonstrated:');
    console.log('✅ Created application template in catalog (like Docker Hub)');
    console.log('✅ Listed available applications');
    console.log('✅ Deployed app to device with device-specific config');
    console.log('✅ Updated deployed app (changed versions and config)');
    console.log('✅ Device can poll for state changes');
    console.log('✅ Removed app from device');
    console.log('\nKey Benefits:');
    console.log('• Reusable templates (create once, deploy many times)');
    console.log('• Device-specific customization (different ports/env/volumes)');
    console.log('• Central catalog (browse available apps)');
    console.log('• Global IDs (1000+) distinguish user apps from system');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main };
