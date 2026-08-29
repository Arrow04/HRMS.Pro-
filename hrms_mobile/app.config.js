export default ({ config }) => {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.6:8000/api';
  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      apiBaseUrl,
    },
  };
};
