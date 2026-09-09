import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { View, Text, Animated, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const ToastContext = createContext({
  showToast: () => {},
});

export function ToastProvider({ children }) {
  const { colors } = useTheme();
  const [toast, setToast] = useState(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);

  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, type });
    Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    timerRef.current = setTimeout(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setToast(null);
      });
    }, duration);
  }, [fadeAnim]);

  const bg = toast?.type === 'error' ? '#DC2626' : toast?.type === 'success' ? '#16A34A' : colors.primary;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <TouchableWithoutFeedback onPress={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setToast(null));
        }}>
          <Animated.View style={[styles.toast, { opacity: fadeAnim, backgroundColor: bg }]}>
            <Text style={styles.text}>{toast.message}</Text>
          </Animated.View>
        </TouchableWithoutFeedback>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 40,
    left: 16,
    right: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  text: { color: '#FFF', fontWeight: '600', fontSize: 14 },
});
