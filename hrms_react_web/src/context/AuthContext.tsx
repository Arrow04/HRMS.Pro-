import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Permission {
  module: string;
  level?: 'none' | 'view' | 'edit' | 'full';
  menu_visible?: boolean;
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
}

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: 'superadmin' | 'admin' | 'hr_admin' | 'hr_manager' | 'hr_executive' | 'employee';
  organizationId: number | null;
  organizationName?: string | null;
  departmentId: number | null;
  employeeId: number | null;
  permissions: Permission[];
  allowedModules: string[];
  planFeatures?: string[];
  themeSettings?: { fontFamily: string };
}

interface LoginUserData {
  id: number;
  email: string;
  fullName: string;
  role: AuthUser['role'];
  organizationId: number | null;
  organizationName?: string | null;
  departmentId: number | null;
  employeeId: number | null;
  planFeatures?: string[];
  themeSettings?: { fontFamily: string };
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginPasskey: (identifier: string, passcode: string) => Promise<void>;
  logout: () => void;
  hasPermission: (module: string, action: 'read' | 'write' | 'delete') => boolean;
  hasRole: (roles: string[]) => boolean;
  isRole: (role: string) => boolean;
  refreshPermissions: () => Promise<void>;
  canAccessModule: (module: string) => boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ═══════════════════════════════════════════════════════════════════════════
  // APP BOOTSTRAP - Validate token and fetch user from backend
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const bootstrap = async () => {
      // Superadmin impersonation: the control hub stores a scoped tenant token
      // and opens HRMS with ?impersonate=1. Use it and promote it to the session.
      const impersonated = localStorage.getItem('impersonated_token');
      const isImpersonating = new URLSearchParams(window.location.search).has('impersonate');
      let token = localStorage.getItem('token');
      if (impersonated && isImpersonating) {
        token = impersonated;
        localStorage.setItem('token', impersonated);
        localStorage.removeItem('impersonated_token');
        window.history.replaceState({}, '', window.location.pathname);
      }
      if (!token) {
        setIsLoading(false);
        return;
      }

      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      try {
        // Fetch user data
        const res = await api.get('/auth/me');
        const userData = res.data;

        // Fetch permissions
        let permissions = [];
        let allowed_modules = [];
        try {
          const permsRes = await api.get('/permissions/me/current');
          permissions = permsRes.data.permissions || [];
          allowed_modules = permsRes.data.allowed_modules || [];
        } catch (permErr) {

          // Fallback for admin
          if (userData.role === 'admin') {
            allowed_modules = ['dashboard', 'company', 'employees', 'recruitment', 'holidays', 'attendance', 'leaves', 'payroll', 'expenses', 'performance', 'reports', 'settings'];
          }
        }

        setUser({
          id: userData.id,
          email: userData.email,
          fullName: userData.fullName,
          role: userData.role,
          organizationId: userData.organizationId,
          organizationName: userData.organizationName,
          departmentId: userData.departmentId,
          employeeId: userData.employeeId,
          permissions: permissions,
          allowedModules: allowed_modules,
          planFeatures: userData.planFeatures || [],
          themeSettings: userData.themeSettings || { fontFamily: 'Inter' },
        });
      } catch (error) {
        console.error('[AuthContext] Bootstrap failed:', error);
        localStorage.clear();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════════════════════════════════════════

const generateDeviceFingerprint = (): string => {
    const nav = navigator;
    const screen = window.screen;
    const components = [
      nav.userAgent, nav.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      nav.hardwareConcurrency || 'unknown',
      nav.platform
    ];
    let hash = 0;
    const str = components.join('|');
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  };

  const finishLogin = useCallback(async (token: string, userData: LoginUserData, isNewDevice: boolean) => {
        localStorage.setItem('token', token);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

        // Show notification if this is a new device
        if (isNewDevice) {
          toast.success('New device registered successfully', {
            duration: 5000,
            icon: '🔒'
          });
        }

        let permissions: Permission[] = [];
        let allowedModules: string[] = [];
        try {
          const permsRes = await api.get('/permissions/me/current');
          permissions = permsRes.data.permissions || [];
          allowedModules = permsRes.data.allowed_modules || [];
        } catch (permErr) {

          if (userData.role === 'admin') {
            allowedModules = ['dashboard', 'company', 'employees', 'recruitment', 'holidays', 'attendance', 'leaves', 'payroll', 'expenses', 'performance', 'reports', 'settings'];
          } else if (userData.role === 'superadmin') {
            allowedModules = ['dashboard', 'company', 'employees', 'recruitment', 'holidays', 'attendance', 'leaves', 'payroll', 'expenses', 'performance', 'reports', 'settings',
              'tenants', 'permissions', 'audit', 'system_health', 'feature_flags', 'billing'];
          }
        }

        const authUser: AuthUser = {
          id: userData.id,
          email: userData.email,
          fullName: userData.fullName,
          role: userData.role,
          organizationId: userData.organizationId,
          organizationName: userData.organizationName,
          departmentId: userData.departmentId,
          employeeId: userData.employeeId,
          permissions,
          allowedModules,
          planFeatures: userData.planFeatures || [],
          themeSettings: userData.themeSettings || { fontFamily: 'Inter' },
        };

        localStorage.setItem('user', JSON.stringify(authUser));
        setUser(authUser);
      }, []);

  const login = useCallback(async (email: string, password: string) => {
      setIsLoading(true);
      try {
        const fingerprint = generateDeviceFingerprint();
        const response = await api.post('/auth/login', {
          email,
          password,
          deviceId: fingerprint,
          deviceFingerprint: fingerprint,
          deviceInfo: {
            fingerprint,
            type: /mobile|android|iphone|ipad/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
            browser: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        });

        await finishLogin(response.data.token, response.data.user, response.data.is_new_device);
      } catch (err: unknown) {
        // Error logged
        throw err;
      } finally {
        setIsLoading(false);
      }
    }, [finishLogin]);

  const loginPasskey = useCallback(async (identifier: string, passcode: string) => {
      setIsLoading(true);
      try {
        const fingerprint = generateDeviceFingerprint();
        const response = await api.post('/auth/login-passkey', {
          identifier,
          passcode,
          deviceId: fingerprint,
          deviceFingerprint: fingerprint,
          deviceInfo: {
            fingerprint,
            type: /mobile|android|iphone|ipad/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
            browser: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        });

        await finishLogin(response.data.token, response.data.user, response.data.is_new_device);
      } catch (err: unknown) {
        // Error logged
        throw err;
      } finally {
        setIsLoading(false);
      }
    }, [finishLogin]);

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════════════════════════════════

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    window.location.href = '/login';
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // PERMISSION CHECKERS
  // ═══════════════════════════════════════════════════════════════════════════

  const hasPermission = useCallback(
    (module: string, action: 'read' | 'write' | 'delete'): boolean => {
      if (!user) return false;

      // Admins & superadmins have full access to every module.
      if (user.role === 'admin' || user.role === 'superadmin') return true;

      // Trust backend permissions - single source of truth
      const perm = user.permissions.find((p) => p.module === module);
      if (!perm) return false;

      switch (action) {
        case 'read': return perm.can_read;
        case 'write': return perm.can_write;
        case 'delete': return perm.can_delete;
        default: return false;
      }
    },
    [user]
  );

  const hasRole = useCallback(
    (roles: string[]): boolean => {
      if (!user) return false;
      return roles.includes(user.role);
    },
    [user]
  );

  const isRole = useCallback(
    (role: string): boolean => {
      if (!user) return false;
      return user.role === role;
    },
    [user]
  );

  const canAccessModule = useCallback(
    (module: string): boolean => {
      // Plan gating: if the org's plan lists modules, the module must be included.
      const features = user?.planFeatures;
      if (features && Array.isArray(features) && features.length > 0 && !features.includes(module)) {
        return false;
      }
      // Admins/superadmins without explicit permission lists see everything
      // their plan allows (permission fallback leaves allowedModules empty).
      const role = user?.role;
      if (role === 'admin' || role === 'superadmin') {
        return true;
      }
      return user?.allowedModules?.includes(module) ?? false;
    },
    [user]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // REFRESH PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const refreshPermissions = useCallback(async () => {
    if (!user) return;
    
    try {
      const response = await api.get('/permissions/me/current');
      const { permissions, allowed_modules } = response.data;
      
      const updatedUser = {
        ...user,
        permissions: permissions || [],
        allowedModules: allowed_modules || [],
      };
      
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    } catch (error) {
      // Error logged
    }
  }, [user]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTEXT VALUE
  // ═══════════════════════════════════════════════════════════════════════════

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    loginPasskey,
    logout,
    hasPermission,
    hasRole,
    isRole,
    refreshPermissions,
    canAccessModule,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
