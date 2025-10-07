/**
 * Quick test script to check if process collection is working
 * Run with: npx tsx test-processes.ts
 */

import { getTopProcesses } from './src/system-metrics';

async function testProcesses() {
	console.log('Testing process collection...\n');
	
	try {
		const processes = await getTopProcesses();
		
		console.log(`\nFound ${processes.length} processes:`);
		console.log(JSON.stringify(processes, null, 2));
		
	} catch (error) {
		console.error('Error:', error);
	}
}

testProcesses();
