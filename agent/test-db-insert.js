/**
 * Test script to debug SQLite JSON column persistence
 */
const knex = require('knex');
const path = require('path');

const db = knex({
	client: 'sqlite3',
	connection: {
		filename: path.join(__dirname, 'data', 'device.sqlite'),
	},
	useNullAsDefault: true,
});

const testState = {
	apps: {
		"1000": {
			appId: 1000,
			appName: "test-app"
		}
	},
	config: {
		features: {
			enableCloudJobs: true
		},
		protocolAdapterDevices: [
			{ name: "sensor1", protocol: "modbus" },
			{ name: "sensor2", protocol: "can" }
		]
	}
};

async function test() {
	console.log('\n🧪 Testing SQLite JSON persistence\n');
	
	// 1. Serialize state
	const stateJson = JSON.stringify(testState);
	console.log('1️⃣ State to insert:');
	console.log(JSON.stringify(testState, null, 2));
	console.log('\n2️⃣ Serialized JSON length:', stateJson.length);
	
	// 2. Delete existing test records
	await db('stateSnapshot').delete().where({ type: 'test' });
	console.log('\n3️⃣ Deleted old test records');
	
	// 3. Insert new record
	await db('stateSnapshot').insert({
		type: 'test',
		state: stateJson,
		stateHash: 'test-hash-123'
	});
	console.log('\n4️⃣ Inserted new record');
	
	// 4. Read back from database
	const records = await db('stateSnapshot')
		.select('*')
		.where({ type: 'test' });
	
	console.log('\n5️⃣ Retrieved from database:');
	console.log('Record count:', records.length);
	
	if (records.length > 0) {
		const record = records[0];
		console.log('\nRaw state column type:', typeof record.state);
		console.log('Raw state column value:', record.state);
		
		try {
			const parsed = typeof record.state === 'string' 
				? JSON.parse(record.state) 
				: record.state;
			
			console.log('\n6️⃣ Parsed state:');
			console.log(JSON.stringify(parsed, null, 2));
			
			console.log('\n7️⃣ Verification:');
			console.log('Has apps:', !!parsed.apps);
			console.log('Has config:', !!parsed.config);
			console.log('Config keys:', Object.keys(parsed.config || {}));
			console.log('Devices count:', parsed.config?.protocolAdapterDevices?.length || 0);
			
			// Check if data matches
			if (parsed.apps && parsed.config) {
				console.log('\n✅ SUCCESS: Both apps and config persisted correctly!');
			} else {
				console.log('\n❌ FAILURE: Data was not persisted correctly!');
			}
		} catch (e) {
			console.error('\n❌ Error parsing state:', e.message);
		}
	}
	
	// Cleanup
	await db('stateSnapshot').delete().where({ type: 'test' });
	console.log('\n8️⃣ Cleaned up test records');
	
	await db.destroy();
}

test().catch(err => {
	console.error('Test failed:', err);
	process.exit(1);
});
