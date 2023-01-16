const baseConfig = require("../../jest.config.base");

module.exports = {
  ...baseConfig,
  // TODO: these treshold values should be 100 for all, but at this time they didn't have 100 coverage
  coverageThreshold: {
    global: {
      branches: 28.57,
      functions: 42.42,
      lines: 54.35,
      statements: 53.26,
    },
  },
  rootDir: ".",
};
