import axios, { AxiosError } from 'axios';
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

interface RefreshRequestConfig extends AxiosRequestConfig {
  _skipRefresh?: boolean;
}

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
  _skipRefresh?: boolean;
}

const apiOrigin = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

const api = axios.create({
  baseURL: apiOrigin,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const updateApiBaseUrl = (newBaseUrl: string) => {
  api.defaults.baseURL = newBaseUrl;
};

/** Extracts a human-readable message from API errors.
 *  Backend envelope is { error: { message } }; FastAPI validation is { detail }. */
export const getErrorMessage = (err: unknown, fallback: string): string => {
  const data = (err as { response?: { data?: unknown } })?.response?.data as
    | { detail?: unknown; error?: { message?: unknown }; message?: unknown }
    | undefined;
  if (!data || typeof data !== 'object') {
    return err instanceof Error && err.message ? err.message : fallback;
  }
  const detail = data.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: unknown; loc?: unknown };
    if (typeof first?.msg === 'string') return first.msg;
  }
  if (typeof data.error?.message === 'string' && data.error.message) return data.error.message;
  if (typeof data.message === 'string' && data.message) return data.message;
  return fallback;
};

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
    const companyId = localStorage.getItem('selectedCompanyId');
    if (companyId && companyId !== 'all') {
      config.headers['X-Company-Id'] = companyId;
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
  localStorage.removeItem('refreshToken');
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
      const refreshConfig: RefreshRequestConfig = {
        headers: { Authorization: `Bearer ${currentToken}` },
        _skipRefresh: true,
      };
      const res = await api.post<{ token?: string }>('/auth/refresh', null, refreshConfig);
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
    const axiosError = error as AxiosError;
    const originalRequest: RetryableRequestConfig | undefined = axiosError.config;
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
