const { getDefaultConfig } = require('expo/metro-config');

module.exports = (() => {
  try {
    const config = getDefaultConfig(__dirname);
    return {
      ...config,
      cache: true,
      plugins: [...(config.plugins || []), '@babel/plugin-proposal-class-properties'],
    };
  } catch {
    return {
      cache: true,
      presets: ['babel-preset-expo'],
      plugins: ['@babel/plugin-proposal-class-properties'],
    };
  }
})();
