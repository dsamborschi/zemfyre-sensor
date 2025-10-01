/**
 * API CLIENT DEMO
 * ===============
 * 
 * Demonstrates how to use the Simple Container Manager API
 * from a Node.js client
 */

const API_URL = 'http://localhost:3000';

// ============================================================================
// Helper Functions
// ============================================================================

async function apiCall(method: string, path: string, body?: any) {
	const url = `${API_URL}${path}`;
	const options: RequestInit = {
		method,
		headers: {
			'Content-Type': 'application/json',
		},
	};

	if (body) {
		options.body = JSON.stringify(body);
	}

	console.log(`\n📡 ${method} ${path}`);
	if (body) {
		console.log('Body:', JSON.stringify(body, null, 2));
	}

	const response = await fetch(url, options);
	const data = await response.json();

	console.log(`Status: ${response.status}`);
	console.log('Response:', JSON.stringify(data, null, 2));

	return data;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Demo Workflow
// ============================================================================

async function main() {
	console.log('='.repeat(80));
	console.log('🚀 Simple Container Manager API - Client Demo');
	console.log('='.repeat(80));

	try {
		// Step 1: Check server health
		console.log('\n📋 Step 1: Check server health');
		console.log('-'.repeat(80));
		await apiCall('GET', '/');

		await sleep(1000);

		// Step 2: Get initial state
		console.log('\n📋 Step 2: Get initial state');
		console.log('-'.repeat(80));
		await apiCall('GET', '/api/v1/state');

		await sleep(1000);

		// Step 3: Deploy first app (nginx)
		console.log('\n📋 Step 3: Deploy nginx web server');
		console.log('-'.repeat(80));
		await apiCall('POST', '/api/v1/state/target', {
			apps: {
				1001: {
					appId: 1001,
					appName: 'Web Server',
					services: [
						{
							serviceId: 1,
							serviceName: 'nginx',
							imageName: 'nginx:alpine',
							appId: 1001,
							appName: 'Web Server',
							config: {
								image: 'nginx:alpine',
								ports: ['8080:80'],
								environment: {
									ENV: 'production',
								},
							},
						},
					],
				},
			},
		});

		await sleep(1000);

		// Step 4: Apply state
		console.log('\n📋 Step 4: Apply target state');
		console.log('-'.repeat(80));
		await apiCall('POST', '/api/v1/state/apply');

		// Wait for reconciliation
		console.log('\n⏳ Waiting for reconciliation...');
		await sleep(3000);

		// Step 5: Check status
		console.log('\n📋 Step 5: Check status');
		console.log('-'.repeat(80));
		await apiCall('GET', '/api/v1/status');

		await sleep(1000);

		// Step 6: List apps
		console.log('\n📋 Step 6: List all apps');
		console.log('-'.repeat(80));
		await apiCall('GET', '/api/v1/apps');

		await sleep(1000);

		// Step 7: Get specific app
		console.log('\n📋 Step 7: Get app details');
		console.log('-'.repeat(80));
		await apiCall('GET', '/api/v1/apps/1001');

		await sleep(1000);

		// Step 8: Update app (add database)
		console.log('\n📋 Step 8: Add database service to app');
		console.log('-'.repeat(80));
		await apiCall('POST', '/api/v1/apps/1001', {
			appId: 1001,
			appName: 'Web Server',
			services: [
				{
					serviceId: 1,
					serviceName: 'nginx',
					imageName: 'nginx:alpine',
					appId: 1001,
					appName: 'Web Server',
					config: {
						image: 'nginx:alpine',
						ports: ['8080:80'],
						environment: {
							ENV: 'production',
						},
					},
				},
				{
					serviceId: 2,
					serviceName: 'postgres',
					imageName: 'postgres:15-alpine',
					appId: 1001,
					appName: 'Web Server',
					config: {
						image: 'postgres:15-alpine',
						ports: ['5432:5432'],
						environment: {
							POSTGRES_PASSWORD: 'secret',
							POSTGRES_DB: 'myapp',
						},
						volumes: ['db-data:/var/lib/postgresql/data'],
					},
				},
			],
		});

		await sleep(1000);

		// Step 9: Apply changes
		console.log('\n📋 Step 9: Apply updated state');
		console.log('-'.repeat(80));
		await apiCall('POST', '/api/v1/state/apply');

		// Wait for reconciliation
		console.log('\n⏳ Waiting for reconciliation...');
		await sleep(3000);

		// Step 10: Check final state
		console.log('\n📋 Step 10: Check final state');
		console.log('-'.repeat(80));
		await apiCall('GET', '/api/v1/state');

		await sleep(1000);

		// Step 11: Deploy second app
		console.log('\n📋 Step 11: Deploy second app (Node.js API)');
		console.log('-'.repeat(80));
		await apiCall('POST', '/api/v1/apps/2002', {
			appId: 2002,
			appName: 'Node API',
			services: [
				{
					serviceId: 1,
					serviceName: 'api',
					imageName: 'node:20-alpine',
					appId: 2002,
					appName: 'Node API',
					config: {
						image: 'node:20-alpine',
						ports: ['3001:3000'],
						environment: {
							NODE_ENV: 'production',
							PORT: '3000',
						},
					},
				},
			],
		});

		await sleep(1000);

		// Step 12: Apply
		console.log('\n📋 Step 12: Apply second app');
		console.log('-'.repeat(80));
		await apiCall('POST', '/api/v1/state/apply');

		console.log('\n⏳ Waiting for reconciliation...');
		await sleep(3000);

		// Step 13: List all apps
		console.log('\n📋 Step 13: List all apps');
		console.log('-'.repeat(80));
		await apiCall('GET', '/api/v1/apps');

		await sleep(1000);

		// Step 14: Remove first app
		console.log('\n📋 Step 14: Remove web server app');
		console.log('-'.repeat(80));
		await apiCall('DELETE', '/api/v1/apps/1001');

		await sleep(1000);

		// Step 15: Apply removal
		console.log('\n📋 Step 15: Apply removal');
		console.log('-'.repeat(80));
		await apiCall('POST', '/api/v1/state/apply');

		console.log('\n⏳ Waiting for reconciliation...');
		await sleep(3000);

		// Step 16: Final state
		console.log('\n📋 Step 16: Check final state');
		console.log('-'.repeat(80));
		await apiCall('GET', '/api/v1/state');

		// Summary
		console.log('\n' + '='.repeat(80));
		console.log('✅ DEMO COMPLETE');
		console.log('='.repeat(80));
		console.log('\nWhat we did:');
		console.log('  1. Deployed nginx web server');
		console.log('  2. Added PostgreSQL database to web server app');
		console.log('  3. Deployed Node.js API as second app');
		console.log('  4. Removed web server app');
		console.log('  5. Left Node.js API running');
		console.log('\nThe API successfully managed multiple apps and services!');
		console.log('='.repeat(80));
	} catch (error) {
		console.error('\n❌ Error:', error);
	}
}

// Run demo
main().catch(console.error);
