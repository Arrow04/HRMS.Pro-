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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (!window.location.pathname.includes('/login')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
