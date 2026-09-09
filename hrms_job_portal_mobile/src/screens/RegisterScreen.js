import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useAuth } from '../context/AuthContext';
import { spacing, radii } from '../theme';

export default function RegisterScreen({ navigation }) {
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
  }));

  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!fullName || !email || !password) {
      Alert.alert('Validation', 'Please fill required fields');
      return;
    }
    setLoading(true);
    try {
      await register({ full_name: fullName, email, phone, password });
      navigation.replace('MainTabs');
    } catch (e) {
      Alert.alert('Registration Failed', e?.response?.data?.detail || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={themed.container}>
      <Text style={themed.title}>Create account</Text>
      <Text style={themed.subtitle}>Join the job portal for free</Text>

      <TextInput
        style={themed.input}
        placeholder="Full Name"
        placeholderTextColor={colors.textTertiary}
        value={fullName}
        onChangeText={setFullName}
      />
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
        placeholder="Phone"
        placeholderTextColor={colors.textTertiary}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <TextInput
        style={themed.input}
        placeholder="Password"
        placeholderTextColor={colors.textTertiary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={themed.btn} onPress={handleRegister} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={themed.btnText}>Create Account</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={themed.link}>Already have an account? Sign in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({});