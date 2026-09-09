import api from './api';
import { logger } from '../utils/logger';

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    email: string;
    fullName: string;
    role: string;
    organizationId?: number;
    departmentId?: number;
    employeeId?: number;
    themeSettings?: {
      fontFamily: string;
      primaryColor?: string;
      isDarkMode?: boolean;
    };
    deviceBindingActive?: boolean;
  };
}

// Generate a simple device fingerprint from browser info
// Note: This is not cryptographically secure but sufficient for device identification
const generateDeviceFingerprint = (): string => {
  const nav = navigator;
  const screen = window.screen;
  
  const components = [
    nav.userAgent,
    nav.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    nav.hardwareConcurrency || 'unknown',
    nav.platform
  ];
  
  // Create a simple hash
  let hash = 0;
  const str = components.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString(16).padStart(16, '0');
};

// Get or create device fingerprint
const getDeviceFingerprint = (): string => {
  const stored = localStorage.getItem('deviceFingerprint');
  if (stored) return stored;
  
  const fingerprint = generateDeviceFingerprint();
  localStorage.setItem('deviceFingerprint', fingerprint);
  return fingerprint;
};

// Detect device type
const detectDeviceType = (): string => {
  const userAgent = navigator.userAgent.toLowerCase();
  if (/mobile|android|iphone|ipad|ipod/.test(userAgent)) {
    return /ipad|tablet/.test(userAgent) ? 'tablet' : 'mobile_phone';
  }
  if (/windows|macintosh|linux/.test(userAgent)) {
    return 'desktop';
  }
  return 'other';
};

// Get device info for logging
const getDeviceInfo = () => {
  return {
    fingerprint: getDeviceFingerprint(),
    type: detectDeviceType(),
    browser: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
};

export const login = async (email: string, password: string, deviceId?: string): Promise<LoginResponse> => {
  const deviceInfo = getDeviceInfo();
  
const response = await api.post<LoginResponse>('/auth/login', {
    email,
    password,
    deviceId: deviceId || deviceInfo.fingerprint,
    deviceFingerprint: deviceInfo.fingerprint,
    deviceInfo
  });
  
if (response.data.token) {
     localStorage.setItem('token', response.data.token);
     // User data is stored by AuthContext.login() after permissions are fetched
   }
  
  return response.data;
};

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

export const getCurrentUser = () => {
  try {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  } catch (e) {
    logger.error('Error parsing user from localStorage:', e);
    return null;
  }
};

export const isAuthenticated = () => {
  return !!localStorage.getItem('token');
};
