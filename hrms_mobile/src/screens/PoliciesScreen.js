import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, TextInput,
  ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useScrollTopBar } from '../hooks/useScrollTopBar';
import { scrollViewTopBarProps, bannerShellStyle } from '../components/AdminScreenKit';
import { TAB_BAR_CLEARANCE } from '../components/AppTabBar';
import { radii, spacing, shadows } from '../theme';
import api from '../services/api';
import { useIsAdmin } from '../hooks/useIsAdmin';

const ICON_OPTIONS = [
  'finger-print-outline', 'calendar-outline', 'wallet-outline', 'star-outline',
  'shield-checkmark-outline', 'laptop-outline', 'document-text-outline',
  'people-outline', 'briefcase-outline', 'lock-closed-outline',
];

const COLOR_OPTIONS = [
  '#3B82F6', '#4F46E5', '#059669', '#8B5CF6', '#DC2626',
  '#0D9488', '#D97706', '#EC4899', '#6366F1', '#14B8A6',
];

const emptyForm = {
  key: '',
  title: '',
  icon: 'document-text-outline',
  color: '#3B82F6',
  description: '',
  bullets: [''],
  sortOrder: 0,
};

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: {
    backgroundColor: colors.dark, paddingTop: spacing.xl, paddingBottom: spacing.xxl,
    borderRadius: 32, overflow: 'hidden',
  },
  heroOrb1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)', top: -40, right: -40 },
  heroOrb2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.08)', bottom: -10, left: 30 },
  heroContent: { paddingHorizontal: spacing.xl },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  body: { padding: spacing.xl, gap: 16 },
  section: {
    backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sectionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  sectionText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginTop: 4 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  adminActions: { flexDirection: 'row', gap: 6, marginLeft: 8 },
  iconBtn: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceSecondary,
  },
  fab: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.5)' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '80%', ...shadows.lg,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.text, marginLeft: 8 },
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: colors.textSecondary,
    marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: colors.text,
  },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  iconPill: {
    width: 36, height: 36, borderRadius: 10, borderWidth: 1.5,
    borderColor: colors.borderLight, alignItems: 'center', justifyContent: 'center',
  },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  colorPill: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 2,
    borderColor: colors.borderLight, alignItems: 'center', justifyContent: 'center',
  },
  bulletInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  bulletInput: { flex: 1 },
  addBulletBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderLight,
    borderStyle: 'dashed', justifyContent: 'center', marginTop: 4,
  },
  addBulletText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 14, marginTop: 16,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  skeleton: {
    height: 100, borderRadius: radii.xl, backgroundColor: colors.surfaceSecondary,
    opacity: 0.6, marginBottom: 8,
  },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 40 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.full, marginLeft: 8 },
  statusText: { fontSize: 10, fontWeight: '700' },

});

const PoliciesScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scrollTopBar = useScrollTopBar();
  const isAdmin = useIsAdmin();

  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await api.get('/policies');
      const items = res.data?.data || res.data || [];
      setPolicies(Array.isArray(items) ? items : []);
    } catch (e) {
      console.error('Failed to fetch policies', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const openCreate = () => {
    setEditingPolicy(null);
    setForm({ ...emptyForm, sortOrder: policies.length });
    setModalVisible(true);
  };

  const openEdit = (policy) => {
    setEditingPolicy(policy);
    setForm({
      key: policy.key || '',
      title: policy.title || '',
      icon: policy.icon || 'document-text-outline',
      color: policy.color || '#3B82F6',
      description: policy.description || '',
      bullets: policy.bullets?.length ? [...policy.bullets] : [''],
      sortOrder: policy.sortOrder ?? 0,
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingPolicy(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert('Required', 'Title is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        key: form.key.trim() || form.title.trim().toLowerCase().replace(/\s+/g, '_'),
        title: form.title.trim(),
        icon: form.icon,
        color: form.color,
        description: form.description.trim(),
        bullets: form.bullets.filter((b) => b.trim()),
        sortOrder: form.sortOrder,
      };
      if (editingPolicy) {
        await api.put(`/policies/${editingPolicy.id}`, payload);
      } else {
        await api.post('/policies', payload);
      }
      Alert.alert('Success', editingPolicy ? 'Policy updated.' : 'Policy created.');
      closeModal();
      fetchPolicies();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to save policy.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (policy) => {
    Alert.alert('Delete Policy', `Delete "${policy.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/policies/${policy.id}`);
            fetchPolicies();
          } catch {
            Alert.alert('Error', 'Failed to delete policy.');
          }
        },
      },
    ]);
  };

  const addBullet = () => setForm((f) => ({ ...f, bullets: [...f.bullets, ''] }));

  const updateBullet = (index, value) => {
    setForm((f) => {
      const bullets = [...f.bullets];
      bullets[index] = value;
      return { ...f, bullets };
    });
  };

  const removeBullet = (index) => {
    setForm((f) => {
      const bullets = f.bullets.filter((_, i) => i !== index);
      return { ...f, bullets: bullets.length ? bullets : [''] };
    });
  };

  const sortedPolicies = [...policies].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return (
    <View style={styles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar, { paddingBottom: TAB_BAR_CLEARANCE + 20 })}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, bannerShellStyle(scrollTopBar)]}>
          <View style={styles.heroOrb1} /><View style={styles.heroOrb2} />
          <View style={[styles.heroContent, { flexDirection: 'row', alignItems: 'center' }]}>
            {navigation?.canGoBack?.() && (
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}
              >
                <Ionicons name="chevron-back" size={22} color="#FFF" />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>HR Policies</Text>
              <Text style={styles.heroSub}>Company policies and guidelines</Text>
            </View>
            {isAdmin && (
              <TouchableOpacity onPress={openCreate} style={styles.fab}>
                <Ionicons name="add" size={22} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.body}>
          {loading ? (
            [1, 2, 3, 4].map((i) => <View key={i} style={styles.skeleton} />)
          ) : sortedPolicies.length === 0 ? (
            <Text style={styles.emptyText}>No policies found.</Text>
          ) : (
            sortedPolicies.map((s) => (
              <View style={styles.section} key={s.id || s.key}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionIcon, { backgroundColor: (s.color || '#3B82F6') + '18' }]}>
                    <Ionicons name={s.icon || 'document-text-outline'} size={18} color={s.color || '#3B82F6'} />
                  </View>
                  <Text style={styles.sectionTitle}>{s.title}</Text>
                  {s.status === 'inactive' && (
                    <View style={[styles.statusBadge, { backgroundColor: colors.dangerSurface }]}>
                      <Text style={[styles.statusText, { color: colors.dangerText }]}>Inactive</Text>
                    </View>
                  )}
                  {isAdmin && (
                    <View style={styles.adminActions}>
                      <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(s)}>
                        <Ionicons name="pencil" size={14} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(s)}>
                        <Ionicons name="trash-outline" size={14} color={colors.dangerText || '#DC2626'} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                {s.description ? <Text style={styles.sectionText}>{s.description}</Text> : null}
                {(s.bullets || []).map((b, i) => (
                  <View style={styles.bulletRow} key={i}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={styles.overlay}>
          <Pressable style={{ flex: 1 }} onPress={closeModal} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <TouchableOpacity onPress={closeModal} style={styles.iconBtn}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {editingPolicy ? 'Edit Policy' : 'Add Policy'}
              </Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={form.title}
                onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
                placeholder="Policy title"
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                value={form.description}
                onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                placeholder="Policy description"
                placeholderTextColor={colors.textTertiary}
                multiline
              />

              <Text style={styles.fieldLabel}>Key</Text>
              <TextInput
                style={styles.input}
                value={form.key}
                onChangeText={(v) => setForm((f) => ({ ...f, key: v }))}
                placeholder="auto-generated from title if empty"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>Icon</Text>
              <View style={styles.iconGrid}>
                {ICON_OPTIONS.map((ic) => {
                  const active = form.icon === ic;
                  return (
                    <TouchableOpacity
                      key={ic}
                      style={[styles.iconPill, active && { borderColor: colors.primary, backgroundColor: colors.primary + '18' }]}
                      onPress={() => setForm((f) => ({ ...f, icon: ic }))}
                    >
                      <Ionicons name={ic} size={16} color={active ? colors.primary : colors.textSecondary} />
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Color</Text>
              <View style={styles.colorGrid}>
                {COLOR_OPTIONS.map((c) => {
                  const active = form.color === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[styles.colorPill, active && { borderColor: colors.text, backgroundColor: c + '30' }]}
                      onPress={() => setForm((f) => ({ ...f, color: c }))}
                    >
                      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: c }} />
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Sort Order</Text>
              <TextInput
                style={styles.input}
                value={String(form.sortOrder)}
                onChangeText={(v) => setForm((f) => ({ ...f, sortOrder: parseInt(v, 10) || 0 }))}
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numeric"
              />

              <Text style={styles.fieldLabel}>Bullet Points</Text>
              {form.bullets.map((b, i) => (
                <View key={i} style={styles.bulletInputRow}>
                  <TextInput
                    style={[styles.input, styles.bulletInput]}
                    value={b}
                    onChangeText={(v) => updateBullet(i, v)}
                    placeholder={`Point ${i + 1}`}
                    placeholderTextColor={colors.textTertiary}
                  />
                  <TouchableOpacity style={styles.iconBtn} onPress={() => removeBullet(i)}>
                    <Ionicons name="close-circle" size={20} color={colors.dangerText || '#DC2626'} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addBulletBtn} onPress={addBullet}>
                <Ionicons name="add-circle-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.addBulletText}>Add point</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                )}
                <Text style={styles.saveBtnText}>
                  {saving ? 'Saving...' : editingPolicy ? 'Update Policy' : 'Create Policy'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default PoliciesScreen;
