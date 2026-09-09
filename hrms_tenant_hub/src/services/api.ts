import axios from 'axios';

// Dev: Vite proxy → localhost:8000. Production: set VITE_API_URL to Render API origin.
const apiOrigin = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

const api = axios.create({
  baseURL: apiOrigin,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(
  (config) => {
    if (config.url && !config.url.startsWith('/api/')) {
      const cleanUrl = config.url.startsWith('/') ? config.url : `/${config.url}`;
      config.url = `/api${cleanUrl}`;
    }
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRedirecting = false;
let refreshPromise: Promise<string> | null = null;

function handleSessionExpired() {
  if (isRedirecting) return;
  isRedirecting = true;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login?expired=1';
  }
}

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const currentToken = localStorage.getItem('token');
      if (!currentToken) throw new Error('No token');
      const res = await api.post('/auth/refresh', null, {
        headers: { Authorization: `Bearer ${currentToken}` },
        _skipRefresh: true,
      } as any);
      const newToken = res.data?.token;
      if (!newToken) throw new Error('No token in refresh response');
      localStorage.setItem('token', newToken);
      return newToken;
    } catch {
      refreshPromise = null;
      handleSessionExpired();
      throw new Error('Session expired');
    }
  })();
  try {
    const token = await refreshPromise;
    return token;
  } finally {
    refreshPromise = null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const axiosError = error as any;
    const originalRequest = axiosError.config;
    if (
      axiosError.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retried &&
      !originalRequest._skipRefresh
    ) {
      originalRequest._retried = true;
      try {
        const newToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
