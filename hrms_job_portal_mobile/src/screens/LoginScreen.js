import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import api, { getApiBaseUrl, setApiBaseUrl, API_BASE_URL } from '../services/api';
import { spacing, radii } from '../theme';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen({ navigation }) {
  const { colors } = useTheme();
  const themed = useThemedStyles((c, d) => ({
    container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl },
    title: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 8 },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.xxl },
    input: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      marginBottom: spacing.md,
      fontSize: 15,
    },
    btn: {
      paddingVertical: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.primary,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    btnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
    link: { color: colors.primary, fontWeight: '600', marginTop: spacing.lg, textAlign: 'center' },
    debugRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.lg },
    debugText: { fontSize: 11, color: colors.textTertiary, flex: 1 },
    debugBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    debugBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
    urlInput: {
      flex: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      fontSize: 12,
    },
  }));

  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiUrl, setApiUrl] = useState('');
  const [editableUrl, setEditableUrl] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => {
      const url = await getApiBaseUrl();
      const clean = url.replace(/\/+$/, '');
      setApiUrl(clean);
      setEditableUrl(clean);
    })();
  }, []);

  const testConnection = async () => {
    setTesting(true);
    try {
      const url = await getApiBaseUrl();
      const resp = await api.get('/auth/test');
      Alert.alert('Connection OK', `Backend reachable at:\n${url}`);
    } catch (e) {
      Alert.alert('Connection Failed', e?.message || 'Cannot reach backend');
    } finally {
      setTesting(false);
    }
  };

  const saveUrl = async () => {
    const url = editableUrl.trim().replace(/\/+$/, '');
    if (!url) return;
    await setApiBaseUrl(url);
    setApiUrl(url);
    Alert.alert('Saved', 'API URL updated. Try logging in now.');
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Validation', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      navigation.replace('MainTabs');
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Invalid credentials';
      Alert.alert('Login Failed', detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={themed.container}>
      <Text style={themed.title}>Welcome back</Text>
      <Text style={themed.subtitle}>Sign in to manage your job search</Text>

      <TextInput
        style={themed.input}
        placeholder="Email"
        placeholderTextColor={colors.textTertiary}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={themed.input}
        placeholder="Password"
        placeholderTextColor={colors.textTertiary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={themed.btn} onPress={handleLogin} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={themed.btnText}>Sign In</Text>
        )}
      </TouchableOpacity>

      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        <View style={themed.debugRow}>
          <Text style={themed.debugText} numberOfLines={1}>
            API: {apiUrl || API_BASE_URL}
          </Text>
          <TouchableOpacity style={themed.debugBtn} onPress={testConnection} disabled={testing}>
            <Text style={themed.debugBtnText}>{testing ? 'Testing...' : 'Test'}</Text>
          </TouchableOpacity>
        </View>

        <View style={themed.debugRow}>
          <TextInput
            style={themed.urlInput}
            placeholder="Set API URL"
            placeholderTextColor={colors.textTertiary}
            value={editableUrl}
            onChangeText={setEditableUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={themed.debugBtn} onPress={saveUrl}>
            <Text style={themed.debugBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={themed.link}>Don't have an account? Register</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({});