/**
 * Main Jest configuration - runs all tests (unit + integration)
 */

module.exports = {
  projects: [
    '<rootDir>/jest.config.unit.js',
    '<rootDir>/jest.config.integration.js',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/migrations/**',
  ],
  coverageDirectory: 'coverage',
};
