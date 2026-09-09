process.env.NODE_ENV = 'development';
global.__DEV__ = true;
module.exports = { clearMocks: true, restoreMocks: true };
require('@testing-library/jest-native/setup');
