/**
 * API Utils Tests
 * ================
 * 
 * Tests for API endpoint normalization utilities.
 * Run with: npm test -- api-utils.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { 
	normalizeApiEndpoint, 
	buildApiEndpoint, 
	buildDeviceEndpoint, 
	getApiVersion 
} from '../../src/utils/api-utils';

describe('API Utils', () => {
	const originalApiVersion = process.env.API_VERSION;

	afterEach(() => {
		// Restore original API_VERSION
		if (originalApiVersion) {
			process.env.API_VERSION = originalApiVersion;
		} else {
			delete process.env.API_VERSION;
		}
	});

	describe('getApiVersion', () => {
		it('should return v1 by default', () => {
			delete process.env.API_VERSION;
			expect(getApiVersion()).toBe('v1');
		});

		it('should return custom version from env', () => {
			process.env.API_VERSION = 'v2';
			expect(getApiVersion()).toBe('v2');
		});
	});

	describe('normalizeApiEndpoint', () => {
		it('should keep endpoint with /api as-is', () => {
			const result = normalizeApiEndpoint('http://7f05d0d2.localhost/api');
			expect(result).toBe('http://7f05d0d2.localhost/api');
		});

		it('should append /api if missing', () => {
			const result = normalizeApiEndpoint('http://localhost:4002');
			expect(result).toBe('http://localhost:4002/api');
		});

		it('should handle trailing slashes', () => {
			const result = normalizeApiEndpoint('http://localhost:4002/');
			expect(result).toBe('http://localhost:4002/api');
		});

		it('should handle endpoint with /api and trailing slash', () => {
			const result = normalizeApiEndpoint('http://7f05d0d2.localhost/api/');
			expect(result).toBe('http://7f05d0d2.localhost/api');
		});

		it('should handle https endpoints', () => {
			const result = normalizeApiEndpoint('https://api.example.com');
			expect(result).toBe('https://api.example.com/api');
		});
	});

	describe('buildApiEndpoint', () => {
		it('should build endpoint with K8s ingress format', () => {
			const result = buildApiEndpoint('http://7f05d0d2.localhost/api', '/device/state');
			expect(result).toBe('http://7f05d0d2.localhost/api/v1/device/state');
		});

		it('should build endpoint with direct API format', () => {
			const result = buildApiEndpoint('http://localhost:4002', '/device/state');
			expect(result).toBe('http://localhost:4002/api/v1/device/state');
		});

		it('should handle path without leading slash', () => {
			const result = buildApiEndpoint('http://localhost:4002', 'device/state');
			expect(result).toBe('http://localhost:4002/api/v1/device/state');
		});

		it('should skip version when requested', () => {
			const result = buildApiEndpoint('http://localhost:4002', '/device/state', false);
			expect(result).toBe('http://localhost:4002/api/device/state');
		});

		it('should use custom API version from env', () => {
			process.env.API_VERSION = 'v2';
			const result = buildApiEndpoint('http://localhost:4002', '/device/state');
			expect(result).toBe('http://localhost:4002/api/v2/device/state');
		});

		it('should handle complex paths', () => {
			const result = buildApiEndpoint('http://localhost:4002', '/devices/abc-123/jobs/456/status');
			expect(result).toBe('http://localhost:4002/api/v1/devices/abc-123/jobs/456/status');
		});
	});

	describe('buildDeviceEndpoint', () => {
		it('should build device state endpoint', () => {
			const result = buildDeviceEndpoint('http://localhost:4002', 'abc-123', '/state');
			expect(result).toBe('http://localhost:4002/api/v1/device/abc-123/state');
		});

		it('should build device jobs endpoint', () => {
			const result = buildDeviceEndpoint('http://7f05d0d2.localhost/api', 'abc-123', '/jobs/next');
			expect(result).toBe('http://7f05d0d2.localhost/api/v1/device/abc-123/jobs/next');
		});

		it('should handle path without leading slash', () => {
			const result = buildDeviceEndpoint('http://localhost:4002', 'abc-123', 'logs');
			expect(result).toBe('http://localhost:4002/api/v1/device/abc-123/logs');
		});

		it('should handle UUIDs with special characters', () => {
			const uuid = '5c629f26-8495-4747-86e3-c2d98851aa62';
			const result = buildDeviceEndpoint('http://localhost:4002', uuid, '/state');
			expect(result).toBe('http://localhost:4002/api/v1/device/5c629f26-8495-4747-86e3-c2d98851aa62/state');
		});
	});

	describe('Real-world scenarios', () => {
		it('should work for local development', () => {
			const endpoint = 'http://localhost:4002';
			const deviceUuid = 'test-device-123';

			// Polling target state
			const pollUrl = buildDeviceEndpoint(endpoint, deviceUuid, '/state');
			expect(pollUrl).toBe('http://localhost:4002/api/v1/device/test-device-123/state');

			// Reporting current state
			const reportUrl = buildApiEndpoint(endpoint, '/device/state');
			expect(reportUrl).toBe('http://localhost:4002/api/v1/device/state');

			// Fetching jobs
			const jobsUrl = buildDeviceEndpoint(endpoint, deviceUuid, '/jobs/next');
			expect(jobsUrl).toBe('http://localhost:4002/api/v1/device/test-device-123/jobs/next');
		});

		it('should work for K8s deployment', () => {
			const endpoint = 'http://7f05d0d2.localhost/api';
			const deviceUuid = '5c629f26-8495-4747-86e3-c2d98851aa62';

			// Polling target state
			const pollUrl = buildDeviceEndpoint(endpoint, deviceUuid, '/state');
			expect(pollUrl).toBe('http://7f05d0d2.localhost/api/v1/device/5c629f26-8495-4747-86e3-c2d98851aa62/state');

			// Reporting current state
			const reportUrl = buildApiEndpoint(endpoint, '/device/state');
			expect(reportUrl).toBe('http://7f05d0d2.localhost/api/v1/device/state');

			// Sending logs
			const logsUrl = buildApiEndpoint(endpoint, `/device/${deviceUuid}/logs`);
			expect(logsUrl).toBe('http://7f05d0d2.localhost/api/v1/device/5c629f26-8495-4747-86e3-c2d98851aa62/logs');
		});

		it('should work for provisioning endpoints', () => {
			const endpoint = 'http://localhost:4002';
			const deviceUuid = 'new-device-456';

			// Device registration
			const registerUrl = buildApiEndpoint(endpoint, '/device/register');
			expect(registerUrl).toBe('http://localhost:4002/api/v1/device/register');

			// Key exchange
			const keyExchangeUrl = buildApiEndpoint(endpoint, `/device/${deviceUuid}/key-exchange`);
			expect(keyExchangeUrl).toBe('http://localhost:4002/api/v1/device/new-device-456/key-exchange');

			// Fetch device
			const fetchUrl = buildApiEndpoint(endpoint, `/devices/${deviceUuid}`);
			expect(fetchUrl).toBe('http://localhost:4002/api/v1/devices/new-device-456');
		});

		it('should work for axios baseURL setup', () => {
			const endpoint = 'http://7f05d0d2.localhost/api';
			const normalized = normalizeApiEndpoint(endpoint);
			const version = getApiVersion();
			const baseURL = `${normalized}/${version}`;

			expect(baseURL).toBe('http://7f05d0d2.localhost/api/v1');

			// Verify relative paths work
			const deviceId = 'abc-123';
			const jobsPath = `/devices/${deviceId}/jobs/next`;
			expect(`${baseURL}${jobsPath}`).toBe('http://7f05d0d2.localhost/api/v1/devices/abc-123/jobs/next');
		});
	});
});
