import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useAuth } from '../context/AuthContext';
import { spacing, radii, shadows } from '../theme';

export default function ProfileScreen({ navigation }) {
  const { colors } = useTheme();
  const themed = useThemedStyles((c, d) => ({
    container: { flex: 1, backgroundColor: colors.bg },
    scroll: { flex: 1 },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
    title: { fontSize: 24, fontWeight: '800', color: colors.text },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.xl,
      padding: spacing.lg,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.card,
    },
    label: { fontSize: 12, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
    value: { fontSize: 15, fontWeight: '600', color: colors.text },
    logoutBtn: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.xxl,
      paddingVertical: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    logoutText: { color: colors.danger || '#EF4444', fontWeight: '700', fontSize: 15 },
  }));

  const { user, logout, isLoading } = useAuth();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (user?.id) {
      loadProfile();
    }
  }, [user?.id]);

  const loadProfile = async () => {
    try {
      // This would call an auth/profile endpoint once available
      setProfile(user);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigation.replace('Login');
  };

  if (isLoading) {
    return (
      <View style={[themed.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={themed.container}>
        <View style={themed.header}>
          <Text style={themed.title}>Profile</Text>
        </View>
        <View style={themed.card}>
          <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
            Sign in to view your profile
          </Text>
          <TouchableOpacity
            style={{
              marginTop: spacing.md,
              paddingVertical: spacing.md,
              borderRadius: radii.lg,
              backgroundColor: colors.primary,
              alignItems: 'center',
            }}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={{ color: '#FFF', fontWeight: '700' }}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={themed.container}>
      <ScrollView style={themed.scroll} contentContainerStyle={themed.content}>
        <View style={themed.header}>
          <Text style={themed.title}>Profile</Text>
        </View>

        <View style={themed.card}>
          <Text style={themed.label}>Name</Text>
          <Text style={themed.value}>{user.full_name || user.name || 'User'}</Text>

          <View style={{ marginTop: spacing.md }}>
            <Text style={themed.label}>Email</Text>
            <Text style={themed.value}>{user.email}</Text>
          </View>

          {user.phone && (
            <View style={{ marginTop: spacing.md }}>
              <Text style={themed.label}>Phone</Text>
              <Text style={themed.value}>{user.phone}</Text>
            </View>
          )}

          {user.headline && (
            <View style={{ marginTop: spacing.md }}>
              <Text style={themed.label}>Headline</Text>
              <Text style={themed.value}>{user.headline}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <TouchableOpacity style={themed.logoutBtn} onPress={handleLogout}>
        <Text style={themed.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}