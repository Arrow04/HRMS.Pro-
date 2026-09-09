import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

export const API_URL_STORAGE_KEY = 'job_portal_api_base_url';
export const DEFAULT_API_BASE_URL = 'http://localhost:8000/api';

function readEmbeddedApiUrl() {
  const candidates = [
    Constants.expoConfig?.extra?.apiBaseUrl,
    Constants.manifest2?.extra?.expoClient?.extra?.apiBaseUrl,
    Constants.manifest?.extra?.apiBaseUrl,
    process.env.EXPO_PUBLIC_API_URL,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      let url = value.trim().replace(/\/$/, '');
      if (!url.endsWith('/api')) url += '/api';
      return url;
    }
  }

  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoClient?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    return `http://${host}:8000/api`;
  }

  return DEFAULT_API_BASE_URL;
}

export const API_BASE_URL = readEmbeddedApiUrl();

export async function getApiBaseUrl() {
  try {
    const saved = await AsyncStorage.getItem(API_URL_STORAGE_KEY);
    if (saved?.trim()) {
      const url = saved.trim().replace(/\/+$/, '');
      if (
        url.includes('vercel.app') ||
        url.includes('netlify.app')
      ) {
        await AsyncStorage.removeItem(API_URL_STORAGE_KEY);
        return DEFAULT_API_BASE_URL;
      }
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        await AsyncStorage.removeItem(API_URL_STORAGE_KEY);
        return DEFAULT_API_BASE_URL;
      }
      return url;
    }
  } catch {
    // ignore storage errors
  }
  return API_BASE_URL;
}

export async function setApiBaseUrl(url) {
  const normalized = url.trim().replace(/\/+$/, '');
  await AsyncStorage.setItem(API_URL_STORAGE_KEY, normalized);
  api.defaults.baseURL = normalized;
  _currentBaseUrl = normalized;
  return normalized;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

let _currentBaseUrl = API_BASE_URL;

function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}

function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function normalize(obj) {
  if (obj === null || undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(normalize);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = (typeof v === 'object' && v !== null && !Array.isArray(v)) ? normalize(v)
           : Array.isArray(v) ? v.map(normalize)
           : v;
    if (/[A-Z]/.test(k)) {
      const sk = camelToSnake(k);
      if (!(sk in out)) out[sk] = out[k];
    } else if (/_/.test(k)) {
      const ck = snakeToCamel(k);
      if (!(ck in out)) out[ck] = out[k];
    }
  }
  return out;
}

api.interceptors.request.use(
  async (config) => {
    if (!_currentBaseUrl || _currentBaseUrl === API_BASE_URL) {
      _currentBaseUrl = await getApiBaseUrl();
    }
    config.baseURL = _currentBaseUrl;
    const token = await SecureStore.getItemAsync('job_portal_auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => {
    if (response.data && typeof response.data === 'object') {
      response.data = normalize(response.data);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      SecureStore.deleteItemAsync('job_portal_auth_token');
      AsyncStorage.removeItem('job_portal_user');
      AsyncStorage.removeItem('job_portal_permissions');
    }
    return Promise.reject(error);
  },
);

export async function testApiConnection() {
  const baseUrl = await getApiBaseUrl();
  const response = await axios.get(`${baseUrl}/auth/test`, { timeout: 10000 });
  return { baseUrl, data: response.data };
}

export default api;