import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { DeviceEventEmitter } from 'react-native';

export const API_URL_STORAGE_KEY = 'hrms_api_base_url';
export const DEFAULT_API_BASE_URL = 'https://hrms-api-8yv3.onrender.com/api';

function readEmbeddedApiUrl() {
  const candidates = [
    Constants.expoConfig?.extra?.apiBaseUrl,
    Constants.manifest2?.extra?.expoClient?.extra?.apiBaseUrl,
    Constants.manifest?.extra?.apiBaseUrl,
    process.env.EXPO_PUBLIC_API_URL,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim() && !value.includes('localhost')) {
      return value.trim().replace(/\/$/, '');
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
        url.includes('localhost') ||
        url.includes('192.168.') ||
        url.includes('10.0.') ||
        url.includes('127.0.') ||
        url.includes('100.') ||
        url.includes('vercel.app') ||
        url.includes('netlify.app')
      ) {
        await AsyncStorage.removeItem(API_URL_STORAGE_KEY);
        return DEFAULT_API_BASE_URL;
      }
      if (!url.startsWith('https://')) {
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

api.interceptors.request.use(
  async (config) => {
    if (!_currentBaseUrl || _currentBaseUrl === API_BASE_URL) {
      _currentBaseUrl = await getApiBaseUrl();
    }
    config.baseURL = _currentBaseUrl;
    const token = await SecureStore.getItemAsync('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      SecureStore.deleteItemAsync('auth_token');
      AsyncStorage.removeItem('user');
      AsyncStorage.removeItem('permissions');
      DeviceEventEmitter.emit('auth:logout');
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
