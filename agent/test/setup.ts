/**
 * Jest setup file
 * Runs before all tests
 */

// Mock fetch globally for all tests
(global as any).fetch = jest.fn();

// Suppress console.log during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   info: jest.fn(),
// };
