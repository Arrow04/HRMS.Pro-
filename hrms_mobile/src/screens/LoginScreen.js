import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  Animated, Dimensions, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { setApiBaseUrl, API_URL_STORAGE_KEY, DEFAULT_API_BASE_URL } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { radii, spacing, shadows } from '../theme';
import { getStickyBarContentOffset } from '../components/ScrollTopBar';
import hrmsLogo from '../../assets/hrms_logo1.png';

const { width: W, height: H } = Dimensions.get('window');

const FEATURES = [
  { icon: 'finger-print-outline', label: 'Attendance' },
  { icon: 'calendar-outline', label: 'Leaves' },
  { icon: 'wallet-outline', label: 'Payroll' },
  { icon: 'chatbubbles-outline', label: 'AI Assist' },
];

const createStyles = (colors, isDark) => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A' },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  orb1: {
    position: 'absolute',
    width: W * 0.9,
    height: W * 0.9,
    borderRadius: W * 0.45,
    backgroundColor: 'rgba(28, 100, 242, 0.22)',
    top: -W * 0.35,
    right: -W * 0.25,
  },
  orb2: {
    position: 'absolute',
    width: W * 0.55,
    height: W * 0.55,
    borderRadius: W * 0.275,
    backgroundColor: 'rgba(79, 70, 229, 0.18)',
    top: H * 0.18,
    left: -W * 0.2,
  },
  orb3: {
    position: 'absolute',
    width: W * 0.7,
    height: W * 0.7,
    borderRadius: W * 0.35,
    backgroundColor: 'rgba(20, 184, 166, 0.12)',
    bottom: -W * 0.15,
    right: -W * 0.1,
  },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  logoRing: {
    padding: 3,
    borderRadius: 30,
    marginBottom: spacing.md,
    ...shadows.colored('#4F46E5', 0.45),
  },
  logoInner: {
    width: 84,
    height: 84,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { fontSize: 34, fontWeight: '800', color: '#FFF', letterSpacing: -0.6 },
  brandAccent: { color: '#A5B4FC' },
  tagline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 8,
    fontWeight: '500',
    textAlign: 'center',
  },
  featureRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.lg,
    maxWidth: 320,
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  featureChipText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.92)' },
  cardOuter: {
    borderRadius: radii.xl + 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    ...shadows.xl,
  },
  cardInner: {
    padding: spacing.xl,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.96)',
  },
  cardInnerDark: {
    padding: spacing.xl,
    backgroundColor: isDark ? 'rgba(30,41,59,0.92)' : 'rgba(255,255,255,0.96)',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: isDark ? '#F8FAFC' : colors.text,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 13,
    color: isDark ? colors.textSecondary : colors.textSecondary,
    marginBottom: spacing.lg,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: isDark ? 'rgba(15,23,42,0.5)' : colors.surfaceSecondary,
    borderRadius: radii.lg,
    padding: 4,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: isDark ? colors.border : colors.borderLight,
  },
  methodTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radii.md,
  },
  methodTabActive: {
    backgroundColor: isDark ? colors.surface : colors.surface,
    ...shadows.sm,
  },
  methodTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  methodTabTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
    marginLeft: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.surfaceSecondary : colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    paddingHorizontal: 4,
    minHeight: 54,
  },
  inputRowFocused: {
    borderColor: colors.primary,
    backgroundColor: isDark ? colors.surface : '#FFF',
  },
  inputIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    backgroundColor: colors.primarySurface,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
  },
  eyeBtn: { padding: 12 },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: spacing.lg, marginTop: -4 },
  forgotText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  primaryBtn: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    minHeight: 54,
    ...shadows.colored('#4F46E5', 0.35),
  },
  primaryBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: 0.2 },
  otpBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.infoSurface,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.infoBorder || colors.border,
  },
  otpBannerText: { flex: 1, fontSize: 13, color: colors.infoText || colors.primary, fontWeight: '600' },
  backBtn: { alignItems: 'center', marginTop: spacing.md, padding: 8 },
  backBtnText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  footer: { marginTop: spacing.xl, alignItems: 'center', gap: 10 },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  trustText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.55)' },
  versionText: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },
});

const PremiumInput = React.memo(({
  icon,
  value,
  onChangeText,
  placeholder,
  colors,
  styles,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  maxLength,
  textAlign,
  onToggleSecure,
  showSecureToggle,
  secureVisible,
  inputRef,
  returnKeyType,
  onSubmitEditing,
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.inputRow, focused && styles.inputRowFocused]}>
      <View style={styles.inputIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <TextInput
        ref={inputRef}
        style={[styles.input, textAlign === 'center' && { textAlign: 'center', letterSpacing: 8, fontWeight: '700' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        secureTextEntry={secureTextEntry && !secureVisible}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        maxLength={maxLength}
        blurOnSubmit={false}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {showSecureToggle ? (
        <TouchableOpacity style={styles.eyeBtn} onPress={onToggleSecure} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name={secureVisible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const LoginCard = React.memo(({ children, styles, isDark }) => {
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={40} tint="light" style={styles.cardOuter}>
        <View style={styles.cardInner}>{children}</View>
      </BlurView>
    );
  }
  return (
    <View style={styles.cardOuter}>
      <View style={styles.cardInnerDark}>{children}</View>
    </View>
  );
});

const LoginScreen = () => {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const passwordRef = useRef(null);
  const [loginMethod, setLoginMethod] = useState('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showServerPicker, setShowServerPicker] = useState(__DEV__);
  const [serverUrl, setServerUrl] = useState('');
  const { login, sendOTP, verifyOTP } = useAuth();

  useEffect(() => {
    if (!__DEV__) return;
    AsyncStorage.getItem(API_URL_STORAGE_KEY).then((v) => {
      if (v) setServerUrl(v);
      else setServerUrl(DEFAULT_API_BASE_URL);
    });
  }, []);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 48, friction: 9, useNativeDriver: true }),
    ]).start();

    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 2800, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 2800, useNativeDriver: true }),
      ]),
    );
    float.start();
    return () => float.stop();
  }, [fadeAnim, slideAnim, floatAnim]);

  const logoFloat = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });

  const handleEmailLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter both email and password.');
      return;
    }
    setLoading(true);
    const result = await login(email.trim(), password);
    setLoading(false);
    if (!result.success) Alert.alert('Login Failed', result.error);
  };

  const handleSendOTP = async () => {
    if (!phone.trim()) {
      Alert.alert('Missing phone', 'Please enter your phone number.');
      return;
    }
    setLoading(true);
    const result = await sendOTP(phone.trim());
    setLoading(false);
    if (result.success) {
      setOtpSent(true);
      Alert.alert('OTP Sent', 'Check your phone for the verification code.');
    } else {
      Alert.alert('Error', result.error);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim()) {
      Alert.alert('Missing OTP', 'Please enter the verification code.');
      return;
    }
    setLoading(true);
    const result = await verifyOTP(phone.trim(), otp.trim());
    setLoading(false);
    if (!result.success) Alert.alert('Verification Failed', result.error);
  };

  const renderPrimaryButton = (title, onPress, icon) => (
    <TouchableOpacity style={styles.primaryBtn} onPress={onPress} disabled={loading} activeOpacity={0.88}>
      <LinearGradient colors={['#1C64F2', '#4F46E5', '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryBtnInner}>
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name={icon} size={20} color="#FFF" />
            <Text style={styles.primaryBtnText}>{title}</Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#0F172A', '#1E3A8A', '#312E81', '#4F46E5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.orb1} />
      <View style={styles.orb2} />
      <View style={styles.orb3} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={0}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: getStickyBarContentOffset(insets) + 24, paddingBottom: spacing.xxl + insets.bottom + 16 }]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.hero, { opacity: fadeAnim, transform: [{ translateY: logoFloat }] }]}>
            <LinearGradient colors={['#60A5FA', '#4F46E5', '#14B8A6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logoRing}>
              <View style={styles.logoInner}>
                <Image source={hrmsLogo} style={{ width: 70, height: 70, borderRadius: 20 }} resizeMode="contain" />
              </View>
            </LinearGradient>
            <View style={styles.brandRow}>
              <Text style={styles.brandText}>
                HRMS<Text style={styles.brandAccent}>.Pro!</Text>
              </Text>
            </View>
            <Text style={styles.tagline}>Your premium employee workspace</Text>
            <View style={styles.featureRow}>
              {FEATURES.map((f) => (
                <View key={f.label} style={styles.featureChip}>
                  <Ionicons name={f.icon} size={12} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.featureChipText}>{f.label}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <LoginCard styles={styles} isDark={isDark}>
              <Text style={styles.cardTitle}>Welcome back</Text>
              <Text style={styles.cardSub}>Sign in to continue to your dashboard</Text>

              <View style={styles.tabRow}>
                <TouchableOpacity
                  style={[styles.methodTab, loginMethod === 'email' && styles.methodTabActive]}
                  onPress={() => setLoginMethod('email')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="mail-outline" size={16} color={loginMethod === 'email' ? colors.primary : colors.textTertiary} />
                  <Text style={[styles.methodTabText, loginMethod === 'email' && styles.methodTabTextActive]}>Email</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.methodTab, loginMethod === 'otp' && styles.methodTabActive]}
                  onPress={() => { setLoginMethod('otp'); setOtpSent(false); }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="phone-portrait-outline" size={16} color={loginMethod === 'otp' ? colors.primary : colors.textTertiary} />
                  <Text style={[styles.methodTabText, loginMethod === 'otp' && styles.methodTabTextActive]}>Phone OTP</Text>
                </TouchableOpacity>
              </View>

              {loginMethod === 'email' ? (
                <>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <PremiumInput
                    icon="mail-outline"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@company.com"
                    colors={colors}
                    styles={styles}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                  <Text style={styles.fieldLabel}>Password</Text>
                  <PremiumInput
                    icon="lock-closed-outline"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    colors={colors}
                    styles={styles}
                    inputRef={passwordRef}
                    secureTextEntry
                    showSecureToggle
                    secureVisible={showPassword}
                    onToggleSecure={() => setShowPassword((v) => !v)}
                    returnKeyType="done"
                    onSubmitEditing={handleEmailLogin}
                  />
                  <TouchableOpacity style={styles.forgotBtn}>
                    <Text style={styles.forgotText}>Forgot password?</Text>
                  </TouchableOpacity>
                  {renderPrimaryButton('Sign In', handleEmailLogin, 'log-in-outline')}
                </>
              ) : !otpSent ? (
                <>
                  <Text style={styles.fieldLabel}>Phone number</Text>
                  <PremiumInput
                    icon="call-outline"
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+91 98765 43210"
                    colors={colors}
                    styles={styles}
                    keyboardType="phone-pad"
                  />
                  {renderPrimaryButton('Send OTP', handleSendOTP, 'paper-plane-outline')}
                </>
              ) : (
                <>
                  <View style={styles.otpBanner}>
                    <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
                    <Text style={styles.otpBannerText}>Verification code sent to {phone}</Text>
                  </View>
                  <Text style={styles.fieldLabel}>OTP</Text>
                  <PremiumInput
                    icon="keypad-outline"
                    value={otp}
                    onChangeText={setOtp}
                    placeholder="000000"
                    colors={colors}
                    styles={styles}
                    keyboardType="number-pad"
                    maxLength={6}
                    textAlign="center"
                  />
                  {renderPrimaryButton('Verify & Sign In', handleVerifyOTP, 'checkmark-circle-outline')}
                  <TouchableOpacity onPress={() => setOtpSent(false)} style={styles.backBtn}>
                    <Text style={styles.backBtnText}>Change phone number</Text>
                  </TouchableOpacity>
                </>
              )}
            </LoginCard>
          </Animated.View>

          <View style={styles.footer}>
            <View style={styles.trustRow}>
              <View style={styles.trustItem}>
                <Ionicons name="shield-checkmark" size={14} color="rgba(255,255,255,0.5)" />
                <Text style={styles.trustText}>Enterprise secure</Text>
              </View>
              <View style={styles.trustItem}>
                <Ionicons name="lock-closed" size={14} color="rgba(255,255,255,0.5)" />
                <Text style={styles.trustText}>Encrypted</Text>
              </View>
              <View style={styles.trustItem}>
                <Ionicons name="cloud-done" size={14} color="rgba(255,255,255,0.5)" />
                <Text style={styles.trustText}>Cloud synced</Text>
              </View>
            </View>

            <TouchableOpacity onPress={() => setShowServerPicker(!showServerPicker)} style={{ alignSelf: 'center', paddingVertical: 6 }}>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                {showServerPicker ? 'Hide' : 'Server'} · {serverUrl ? (serverUrl.includes('localhost') || serverUrl.includes('192.168') ? 'Local' : 'Production') : 'Default'}
              </Text>
            </TouchableOpacity>

            {showServerPicker && (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>Server URL</Text>
                <TextInput
                  value={serverUrl}
                  onChangeText={setServerUrl}
                  placeholder="https://hrms-api-8yv3.onrender.com/api"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.15)',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    fontSize: 12,
                    color: '#FFF',
                  }}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      await setApiBaseUrl(serverUrl.trim());
                      Alert.alert('Saved', `Server URL updated to:\n${serverUrl.trim()}`);
                    }}
                    style={{ flex: 1, backgroundColor: '#4F46E5', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600' }}>Save & Connect</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      const local = 'http://192.168.1.1:8000/api';
                      setServerUrl(local);
                    }}
                    style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600' }}>Local Dev</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      await AsyncStorage.removeItem(API_URL_STORAGE_KEY);
                      setServerUrl(DEFAULT_API_BASE_URL);
                      Alert.alert('Reset', 'Server URL reset to default.');
                    }}
                    style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600' }}>Reset</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 6, textAlign: 'center' }}>
                  Tap "Local Dev" then edit IP to match your PC's WiFi IP
                </Text>
              </View>
            )}

            <Text style={styles.versionText}>HRMS.Pro!</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default LoginScreen;
