import axios, { AxiosError } from 'axios';

// Dev: Vite proxy sends /api -> localhost:8000 (vite.config.ts).
// Production (Vercel): set VITE_API_URL to your Render API origin, e.g.
// https://hrms-api.onrender.com — or use vercel.json rewrites with baseURL ''.
const apiOrigin = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

const api = axios.create({
  baseURL: apiOrigin,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Function to update the base URL dynamically
export const updateApiBaseUrl = (newBaseUrl: string) => {
  api.defaults.baseURL = newBaseUrl;
};

// Add a request interceptor to include the auth token and company filter
api.interceptors.request.use(
  (config) => {
    // Ensure URL starts with /api
    if (config.url && !config.url.startsWith('/api/')) {
      const cleanUrl = config.url.startsWith('/') ? config.url : `/${config.url}`;
      config.url = `/api${cleanUrl}`;
    }
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const companyId = localStorage.getItem('selectedCompanyId');
    if (companyId && companyId !== 'all') {
      config.headers['X-Company-Id'] = companyId;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor for global error handling
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if ((error as AxiosError).response?.status === 401) {
      if (!window.location.pathname.includes('/login')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
