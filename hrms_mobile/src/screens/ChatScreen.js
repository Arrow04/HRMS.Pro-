import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  Platform, Animated, ScrollView, Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import api from '../services/api';
import { getTimezone } from '../utils/timezone';
import { useAuth } from '../context/AuthContext';
import { radii, spacing, shadows } from '../theme';
import { bannerShellStyle } from '../components/AdminScreenKit';
import { useScrollTopBar } from '../hooks/useScrollTopBar';
import { useKeyboardBottomInset } from '../hooks/useKeyboardBottomInset';

const QUICK_Q = [
  { icon: 'calendar-outline', label: 'Leave balance', query: "What's my leave balance?", color: '#4F46E5' },
  { icon: 'sunny-outline', label: 'Next holiday', query: 'When is the next holiday?', color: '#F59E0B' },
  { icon: 'time-outline', label: 'Office timings', query: 'What are the office timings?', color: '#3B82F6' },
  { icon: 'finger-print-outline', label: 'Attendance', query: 'What is my attendance summary?', color: '#10B981' },
  { icon: 'person-outline', label: 'Update profile', query: 'How do I update my profile?', color: '#8B5CF6' },
  { icon: 'cash-outline', label: 'Payroll info', query: 'Show my payroll summary', color: '#059669' },
];

const createStyles = (colors, isDark) => ({
  container: { flex: 1, backgroundColor: colors.bg },
  chatArea: { flex: 1, minHeight: 0 },
  hero: {
    paddingTop: 16,
    paddingBottom: spacing.xxl + 8,
    marginBottom: spacing.md,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  heroOrb1: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.08)', top: -50, right: -50 },
  heroOrb2: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(99,102,241,0.18)', bottom: -20, left: 24 },
  heroOrb3: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.05)', top: 30, left: 120 },
  heroRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, gap: 14 },
  botAvatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 20,
    padding: 2,
    backgroundColor: 'rgba(255,255,255,0.2)' },
  botAvatarInner: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)' },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#FFF', letterSpacing: -0.3 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2, fontWeight: '500' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34D399' },
  statusText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)', letterSpacing: 0.4 },
  aiBadge: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)' },
  aiBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFF', letterSpacing: 0.6 },
  chatBody: { flex: 1 },
  emptyScroll: { flex: 1 },
  emptyContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  welcomeCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#BFDBFE',
    marginBottom: spacing.lg,
    ...shadows.md },
  welcomeIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md },
  welcomeTitle: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  welcomeSub: { fontSize: 14, color: colors.textSecondary, marginTop: 6, lineHeight: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10 },
  quickLabel: { fontSize: 13, fontWeight: '700', color: colors.text, lineHeight: 18 },
  msgList: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row', marginBottom: spacing.md, maxWidth: '88%' },
  userRow: { alignSelf: 'flex-end' },
  botRow: { alignSelf: 'flex-start' },
  miniAvatar: {
    width: 32,
    height: 32,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 2,
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#99F6E4' },
  bubbleInner: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, maxWidth: '100%' },
  userBubble: { borderBottomRightRadius: 6, ...shadows.colored('#14B8A6', 0.25) },
  botBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm },
  bubbleText: { fontSize: 15, color: colors.text, lineHeight: 22 },
  userBubbleText: { color: '#FFF', fontWeight: '500' },
  timeText: { fontSize: 10, color: colors.textTertiary, marginTop: 6, fontWeight: '600' },
  userTime: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  typingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    gap: 8 },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: radii.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#14B8A6' },
  typingText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600', marginLeft: 4 },
  inputWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#E2E8F0',
    ...shadows.md,
    gap: 8 },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    maxHeight: 100,
    minHeight: 44,
    paddingTop: Platform.OS === 'ios' ? 12 : 10,
    paddingBottom: Platform.OS === 'ios' ? 12 : 10,
    lineHeight: 20,
    textAlignVertical: 'center',
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden' },
  sendBtnDisabled: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight },
  inputHint: {
    textAlign: 'center',
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 8,
    fontWeight: '600',
    letterSpacing: 0.3 } });

const TypingIndicator = ({ styles }) => {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = (anim, delay) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 350, useNativeDriver: true }),
      ]),
    );
    const a1 = pulse(dot1, 0);
    const a2 = pulse(dot2, 150);
    const a3 = pulse(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingWrap}>
      <LinearGradient colors={['#0D9488', '#14B8A6']} style={styles.miniAvatar}>
        <Ionicons name="sparkles" size={16} color="#FFF" />
      </LinearGradient>
      <View style={styles.typingBubble}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[styles.typingDot, { opacity: dot, transform: [{ scale: dot }] }]} />
        ))}
        <Text style={styles.typingText}>Thinking</Text>
      </View>
    </View>
  );
};

const formatTime = (id) => {
  const d = new Date(id);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: getTimezone() });
};

const ChatScreen = () => {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles((c) => createStyles(c, isDark));
  const { user } = useAuth();
  const scrollTopBar = useScrollTopBar();
  const insets = useSafeAreaInsets();
  const keyboardBottomInset = useKeyboardBottomInset();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef(null);

  const scrollToLatest = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const showSub = Keyboard.addListener(showEvent, () => scrollToLatest());
    return () => showSub.remove();
  }, [scrollToLatest]);

  const send = useCallback(async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    const userId = String(user?.id || user?.employeeId || 'guest');
    const userMsg = { id: Date.now(), role: 'user', text: msg };
    setMessages((p) => [...p, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await api.post('/chatbot/message', { user_id: userId, message: msg });
      const reply = res.data?.response || res.data?.reply || res.data?.message || 'I received your message.';
      const suggestions = res.data?.suggestions;
      setMessages((p) => [...p, {
        id: Date.now() + 1,
        role: 'bot',
        text: reply,
        suggestions: Array.isArray(suggestions) ? suggestions : null }]);
    } catch {
      setMessages((p) => [...p, {
        id: Date.now() + 1,
        role: 'bot',
        text: 'Sorry, I could not reach the assistant right now. Please try again in a moment.' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, user]);

  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubbleRow, isUser ? styles.userRow : styles.botRow]}>
        {!isUser && (
          <LinearGradient colors={['#0D9488', '#14B8A6']} style={styles.miniAvatar}>
            <Ionicons name="sparkles" size={16} color="#FFF" />
          </LinearGradient>
        )}
        {isUser ? (
          <LinearGradient colors={['#0D9488', '#14B8A6', '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubbleInner, styles.userBubble]}>
            <Text style={[styles.bubbleText, styles.userBubbleText]}>{item.text}</Text>
            <Text style={[styles.timeText, styles.userTime]}>{formatTime(item.id)}</Text>
          </LinearGradient>
        ) : (
          <View style={[styles.bubbleInner, styles.botBubble]}>
            <Text style={styles.bubbleText}>{item.text}</Text>
            <Text style={styles.timeText}>{formatTime(item.id)}</Text>
            {item.suggestions?.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {item.suggestions.slice(0, 3).map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => send(typeof s === 'string' ? s : s.query || s.label)}
                    style={{
                      backgroundColor: colors.tealSurface || colors.primarySurface,
                      borderRadius: radii.full,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderWidth: 1,
                      borderColor: isDark ? colors.border : '#99F6E4' }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#0D9488' }}>
                      {typeof s === 'string' ? s : s.label || s.query}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const firstName = user?.fullName?.split(' ')[0] || 'there';

  const welcomeContent = (
    <>
      <View style={styles.welcomeCard}>
        <LinearGradient colors={['#0D9488', '#14B8A6']} style={styles.welcomeIcon}>
          <Ionicons name="chatbubbles" size={24} color="#FFF" />
        </LinearGradient>
        <Text style={styles.welcomeTitle}>Hi {firstName}!</Text>
        <Text style={styles.welcomeSub}>
          I can help with leave balance, holidays, attendance, payroll, and HR policies. Pick a suggestion below or ask anything.
        </Text>
      </View>
      <Text style={styles.sectionLabel}>Quick suggestions</Text>
      <View style={styles.quickGrid}>
        {QUICK_Q.map((q, i) => (
          <TouchableOpacity key={i} style={styles.quickCard} onPress={() => send(q.query)} activeOpacity={0.75}>
            <View style={[styles.quickIcon, { backgroundColor: q.color + (isDark ? '22' : '14') }]}>
              <Ionicons name={q.icon} size={18} color={q.color} />
            </View>
            <Text style={styles.quickLabel}>{q.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0F766E', '#14B8A6', '#6366F1']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, bannerShellStyle(scrollTopBar)]}
      >
        <View style={styles.heroOrb1} />
        <View style={styles.heroOrb2} />
        <View style={styles.heroOrb3} />
        <View style={styles.heroRow}>
          <View style={styles.botAvatarWrap}>
            <View style={styles.botAvatarInner}>
              <Ionicons name="sparkles" size={26} color="#FFF" />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>HR Assistant</Text>
            <Text style={styles.heroSub}>Powered by HRMS.Pro AI</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>ONLINE</Text>
            </View>
          </View>
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>AI</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.chatArea}>
        {messages.length === 0 ? (
          <ScrollView
            style={styles.emptyScroll}
            contentContainerStyle={styles.emptyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {welcomeContent}
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            style={styles.chatBody}
            data={messages}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.msgList}
            renderItem={renderMessage}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            onContentSizeChange={() => scrollToLatest()}
            onLayout={() => scrollToLatest(false)}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          />
        )}
      </View>

      {loading && <TypingIndicator styles={styles} />}

      <View
        style={[
          styles.inputWrap,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            marginBottom: keyboardBottomInset,
          },
        ]}
      >
        <View style={styles.inputCard}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about leave, payroll, holidays..."
            placeholderTextColor={colors.textTertiary}
            onSubmitEditing={() => send()}
            onFocus={() => scrollToLatest()}
            returnKeyType="send"
            multiline
          />
          <TouchableOpacity
            onPress={() => send()}
            disabled={!input.trim() || loading}
            activeOpacity={0.85}
          >
            {input.trim() && !loading ? (
              <LinearGradient colors={['#0D9488', '#14B8A6']} style={styles.sendBtn}>
                <Ionicons name="arrow-up" size={22} color="#FFF" />
              </LinearGradient>
            ) : (
              <View style={[styles.sendBtn, styles.sendBtnDisabled]}>
                <Ionicons name="arrow-up" size={22} color={colors.textTertiary} />
              </View>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.inputHint}>AI responses are for guidance — verify with HR for official matters</Text>
      </View>
    </View>
  );
};

export default ChatScreen;
