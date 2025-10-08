module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*Tests.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      diagnostics: {
        warnOnly: true,  // Show type errors as warnings during test execution
        ignoreCodes: [
          7006,  // Parameter implicitly has an 'any' type
          2307,  // Cannot find module (only for files not under test)
          2571,  // Object is of type 'unknown'
          18046  // Variable is of type 'unknown'
        ]
      }
    }]
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@cash-mgmt/(.*)$': '<rootDir>/../$1/src'
  },
  moduleDirectories: ['node_modules', '<rootDir>'],
  testTimeout: 90000,
  maxWorkers: 1  // Run tests sequentially to avoid database conflicts
};
