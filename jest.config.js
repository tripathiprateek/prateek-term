'use strict';

module.exports = {
  // Each subdirectory under tests/ is its own project so the suite name
  // shows clearly in output: "unit", "renderer", "e2e"
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
    },
    {
      displayName: 'renderer',
      testEnvironment: 'node', // renderer tests use source-contract checks + mocks
      testMatch: ['<rootDir>/tests/renderer/**/*.test.js'],
    },
  ],

  // Clear mock state between every test
  clearMocks: true,

  // Readable verbose output
  verbose: true,

  // Map native modules to stubs so unit tests run without node-pty / serialport
  moduleNameMapper: {
    '^node-pty$': '<rootDir>/tests/__mocks__/node-pty.js',
    '^serialport$': '<rootDir>/tests/__mocks__/serialport.js',
    '^electron$': '<rootDir>/tests/__mocks__/electron.js',
  },
};
