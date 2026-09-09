import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
  id: number;
  email: string;
  fullName: string;
  employeeId?: number;
  role: string;
  organizationId?: number;
  avatar?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setAuthenticated: (authenticated: boolean) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
        AsyncStorage.removeItem('auth_token');
        AsyncStorage.removeItem('user');
      },
    }),
    {
      name: 'hrms-auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ token: state.token, isAuthenticated: state.isAuthenticated }),
    }
  )
);

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
}

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  addNotification: (notification: { title: string; body: string; status?: string }) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  setNotifications: (notifications: NotificationItem[]) => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],
  unreadCount: 0,
  addNotification: (notification) =>
    set((state) => ({
      notifications: [{ ...notification, id: `${Date.now()}`, status: notification.status || 'unread', createdAt: new Date().toISOString() }, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    })),
  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, status: 'read' } : n)),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, status: 'read' })),
      unreadCount: 0,
    })),
  setNotifications: (notifications) =>
    set({ notifications, unreadCount: notifications.filter((n) => n.status === 'unread').length }),
}));

interface AppState {
  theme: 'light' | 'dark' | 'system';
  isLoading: boolean;
  isOnline: boolean;
  lastSyncAt: string | null;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setOnline: (isOnline: boolean) => void;
  setLastSyncAt: (date: string) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  theme: 'system',
  isLoading: false,
  isOnline: true,
  lastSyncAt: null,
  setTheme: (theme) => set({ theme }),
  setOnline: (isOnline) => set({ isOnline }),
  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
  setLoading: (isLoading) => set({ isLoading }),
}));

export type { User };
