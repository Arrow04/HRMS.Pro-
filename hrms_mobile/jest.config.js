const path = require('path');

module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@screens/(.*)$': '<rootDir>/src/screens/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^react-native$': '<rootDir>/node_modules/react-native',
  },
  transformIgnorePatterns: ['node_modules/(?!(react-native|@react-native|@expo|date-fns|zustand|formik|yup)/)'],
  collectCoverageFrom: ['src/**/*.{js,ts,tsx}', '!src/**/*.d.ts', '!src/**/__tests__/**'],
  coverageThreshold: { global: { branches: 50, functions: 50, lines: 50, statements: 50 } },
};
