export default ({ config }) => {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL || config?.extra?.apiBaseUrl || 'https://hrms-api-8yv3.onrender.com/api';
  const jobPortalUrl = process.env.EXPO_PUBLIC_JOB_PORTAL_URL || config?.extra?.jobPortalUrl || 'http://localhost:3001';
  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      apiBaseUrl,
      jobPortalUrl,
    },
  };
};
