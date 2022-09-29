module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!**/test/**',
    '!**/dist/**',
    '!**/__benchmarks__/**',
    '!**/playground.{js,ts}',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverage: true,
  // TODO: these treshold values should be 100 for all, but at this time they didn't have 100 coverage
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 93,
      statements: 93,
    },
  },
};
