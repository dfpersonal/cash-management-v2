/**
 * Test setup file for Jest
 */

// Set environment to test
process.env.NODE_ENV = 'test';

// Mock console methods during tests to reduce noise
global.console = {
  ...console,
  // Uncomment to silence logs during tests
  // log: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};