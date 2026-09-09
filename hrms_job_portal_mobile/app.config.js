export default ({ config }) => {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL || config?.extra?.apiBaseUrl || 'http://localhost:8000/api';
  const jobPortalBaseUrl = process.env.EXPO_PUBLIC_JOB_PORTAL_BASE_URL || config?.extra?.jobPortalBaseUrl || 'http://localhost:3001';
  return {
    ...config,
    plugins: [
      'expo-font',
      'expo-status-bar',
    ],
    extra: {
      ...(config.extra || {}),
      apiBaseUrl,
      jobPortalBaseUrl,
    },
  };
};