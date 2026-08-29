import React, { createContext, useState, useContext, useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import api, { getApiBaseUrl } from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAuthData();
    const subscription = DeviceEventEmitter.addListener('auth:logout', () => {
      setToken(null);
      setUser(null);
      setPermissions(null);
      setIsLoading(false);
    });
    return () => subscription.remove();
  }, []);

  const loadAuthData = async () => {
    try {
      const storedToken = await SecureStore.getItemAsync('auth_token');
      const storedUser = await AsyncStorage.getItem('user');
      const storedPermissions = await AsyncStorage.getItem('permissions');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        if (storedPermissions) {
          setPermissions(JSON.parse(storedPermissions));
        }
      }
    } catch (error) {
      console.error('Error loading auth data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPermissions = async () => {
    try {
      const res = await api.get('/my-permissions');
      const perms = res.data?.modules || res.data;
      setPermissions(perms);
      await AsyncStorage.setItem('permissions', JSON.stringify(perms));
      return perms;
    } catch {
      return null;
    }
  };

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { token: newToken, user: userData } = response.data;

      await SecureStore.setItemAsync('auth_token', newToken);
      await AsyncStorage.setItem('user', JSON.stringify(userData));

      setToken(newToken);
      setUser(userData);

      await fetchPermissions();

      return { success: true };
    } catch (error) {
      if (!error.response) {
        const baseUrl = await getApiBaseUrl();
        return {
          success: false,
          error: `Cannot reach the server at ${baseUrl}. Check the Server URL on the login screen and try Test Connection.`,
        };
      }
      const detail = error.response?.data?.detail;
      return {
        success: false,
        error: typeof detail === 'string' ? detail : 'Login failed',
      };
    }
  };

  const sendOTP = async (phone) => {
    try {
      const response = await api.post('/auth/send-otp', { phone });
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Failed to send OTP',
      };
    }
  };

  const verifyOTP = async (phone, otp) => {
    try {
      const response = await api.post('/auth/verify-otp', { phone, otp });
      const { token: newToken, user: userData } = response.data;

      await SecureStore.setItemAsync('auth_token', newToken);
      await AsyncStorage.setItem('user', JSON.stringify(userData));

      setToken(newToken);
      setUser(userData);

      await fetchPermissions();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'OTP verification failed',
      };
    }
  };

  const logout = async () => {
    try {
      await SecureStore.deleteItemAsync('auth_token');
      await AsyncStorage.removeItem('user');
      await AsyncStorage.removeItem('permissions');
      setToken(null);
      setUser(null);
      setPermissions(null);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        permissions,
        isLoading,
        login,
        sendOTP,
        verifyOTP,
        logout,
        fetchPermissions,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
