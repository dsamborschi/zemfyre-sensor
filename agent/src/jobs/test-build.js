#!/usr/bin/env node

// Simple test to verify the build works
const { createJobsFeature, JobStatus, ActionType, VERSION } = require('./dist/index.js');

console.log('🎯 AWS IoT Device Client Jobs Feature - Node.js Implementation');
console.log(`📦 Version: ${VERSION}`);
console.log(`✅ Build successful!`);

// Test basic imports work
console.log(`📋 Available JobStatus values: ${Object.values(JobStatus).join(', ')}`);
console.log(`🔧 Available ActionType values: ${Object.values(ActionType).join(', ')}`);

// Test factory function
try {
  const mockConnection = {
    publish: async () => {},
    subscribe: async () => {},
    unsubscribe: async () => {},
    isConnected: () => true
  };

  const jobsFeature = createJobsFeature(mockConnection, {
    thingName: 'test-device'
  });

  console.log(`🚀 JobsFeature created successfully: ${jobsFeature.getName()}`);
  console.log('🎉 All tests passed!');
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}