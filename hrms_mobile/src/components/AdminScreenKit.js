/**
 * Shared admin screen layout — matches AdminAttendance / AdminLeaves design.
 */
import React, { useMemo, useCallback, useId } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Modal, ActivityIndicator, Platform, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { lightColors as staticColors, radii, shadows, resolveStatChip } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { ScrollTopBar, bannerShellStyle } from './ScrollTopBar';
import { useScrollTopBar } from '../hooks/useScrollTopBar';
import { useRegisterScrollTopBar } from '../hooks/useScrollTopBar';
import { useScrollTopBarHost } from '../context/ScrollTopBarHost';
import { getTimezone, dateToISO } from '../utils/timezone';

export { useScrollTopBar, useRegisterScrollTopBar, ScrollTopBar };
export { STICKY_BAR_TITLE, bannerUnderBarStyle, bannerShellStyle, BANNER_HORIZONTAL_INSET, BANNER_TOP_INSET } from './ScrollTopBar';

const createAdminStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, overflow: 'visible' },
  headerBg: {
    backgroundColor: colors.primary,
    paddingTop: 16,
    paddingBottom: 20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  bgOrb: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -40,
    right: -40,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  body: { padding: 20 },
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  dateText: { fontSize: 16, fontWeight: '700', color: colors.text },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statItem: { width: '48%', borderRadius: radii.md, padding: 10, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  tabRow: { gap: 6, marginBottom: 12 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: '#FFF' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.text },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  listTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  listSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  skeleton: {
    height: 70,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSecondary,
    opacity: 0.6,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    height: '70%',
    maxHeight: '70%',
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.text, marginLeft: 8 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
  },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    backgroundColor: colors.surfaceSecondary,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 12, fontWeight: '700', color: colors.text },
  pillTextActive: { color: '#FFF' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: 14,
    marginTop: 16,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  detailField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  detailLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  detailValue: { fontSize: 14, fontWeight: '700', color: colors.text, textTransform: 'capitalize', maxWidth: '58%', textAlign: 'right' },
  deleteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.dangerSurface,
    marginTop: 16,
  },
  deleteActionText: { fontSize: 14, fontWeight: '700', color: colors.dangerText },
});

export const adminStyles = createAdminStyles(staticColors);

export function useAdminStyles() {
  const { colors } = useTheme();
  return useMemo(() => createAdminStyles(colors), [colors]);
}

export function AdminHeader({
  navigation,
  title,
  subtitle,
  onAdd,
  showBack = true,
  rightAction,
  scrollTopBar: scrollTopBarProp,
}) {
  const adminStyles = useAdminStyles();
  const scrollTopBar = scrollTopBarProp ?? useScrollTopBar();
  return (
    <View style={[adminStyles.headerBg, bannerShellStyle(scrollTopBar)]}>
      <View style={adminStyles.bgOrb} />
      <View style={adminStyles.headerRow}>
        {showBack && navigation ? (
          <TouchableOpacity onPress={() => navigation.goBack()} style={adminStyles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 0 }} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={adminStyles.headerTitle}>{title}</Text>
          {subtitle ? <Text style={adminStyles.headerSub}>{subtitle}</Text> : null}
        </View>
        {rightAction || (onAdd ? (
          <TouchableOpacity onPress={onAdd} style={adminStyles.addBtn}>
            <Ionicons name="add" size={22} color="#FFF" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        ))}
      </View>
    </View>
  );
}

export function AdminStatRow({ stats = [] }) {
  const adminStyles = useAdminStyles();
  const { colors, isDark } = useTheme();
  return (
    <View style={adminStyles.statRow}>
      {stats.map((s, i) => {
        const chip = resolveStatChip(s, colors, isDark);
        return (
          <View key={i} style={[adminStyles.statItem, { backgroundColor: chip.bg }]}>
            <Text style={[adminStyles.statVal, { color: chip.color }]}>{s.val}</Text>
            <Text style={[adminStyles.statLabel, { color: chip.labelColor }]}>{s.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function AdminTabPills({ tabs = [], active, onChange }) {
  const adminStyles = useAdminStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={adminStyles.tabRow}>
      {tabs.map((t) => (
        <TouchableOpacity
          key={t.key}
          style={[adminStyles.tab, active === t.key && adminStyles.tabActive]}
          onPress={() => onChange(t.key)}
          activeOpacity={0.7}
        >
          <Text style={[adminStyles.tabText, active === t.key && adminStyles.tabTextActive]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export function AdminSearchBar({ value, onChangeText, placeholder = 'Search...' }) {
  const adminStyles = useAdminStyles();
  const { colors } = useTheme();
  return (
    <View style={adminStyles.searchRow}>
      <Ionicons name="search" size={16} color={colors.textTertiary} style={{ marginRight: 8 }} />
      <TextInput
        style={adminStyles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
      />
    </View>
  );
}

export function AdminListCard({ children, onPress, style }) {
  const adminStyles = useAdminStyles();
  if (onPress) {
    return (
      <TouchableOpacity style={[adminStyles.listCard, style]} onPress={onPress} activeOpacity={0.7}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[adminStyles.listCard, style]}>{children}</View>;
}

export function AdminModalShell({
  visible,
  onClose,
  onRequestClose,
  children,
  contentStyle,
}) {
  const adminStyles = useAdminStyles();
  const handleRequestClose = onRequestClose || onClose;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleRequestClose}>
      <View style={adminStyles.modalOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <Pressable style={[adminStyles.modalContent, contentStyle]} onPress={() => {}}>
          {children}
        </Pressable>
      </View>
    </Modal>
  );
}

export function AdminFormSheet({
  visible,
  title,
  onClose,
  children,
  onSave,
  saveLabel = 'Save',
  saving = false,
  headerRight,
}) {
  const adminStyles = useAdminStyles();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={adminStyles.modalOverlay}>
        <Pressable onPress={onClose} style={{ flex: 1 }} />
        <View style={adminStyles.modalContent}>
          <View style={adminStyles.modalHeader}>
            <TouchableOpacity onPress={onClose} style={adminStyles.iconBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={adminStyles.modalTitle}>{title}</Text>
            {headerRight || <View style={{ width: 36 }} />}
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {children}
            {onSave ? (
              <TouchableOpacity
                style={[adminStyles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={onSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                )}
                <Text style={adminStyles.saveBtnText}>{saving ? 'Saving...' : saveLabel}</Text>
              </TouchableOpacity>
            ) : null}
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function AdminFieldLabel({ children }) {
  const adminStyles = useAdminStyles();
  return <Text style={adminStyles.fieldLabel}>{children}</Text>;
}

export function AdminInput({ style, ...props }) {
  const adminStyles = useAdminStyles();
  const { colors } = useTheme();
  return <TextInput style={[adminStyles.input, style]} placeholderTextColor={colors.textTertiary} {...props} />;
}

export function AdminPillGrid({ options = [], value, onChange }) {
  const adminStyles = useAdminStyles();
  return (
    <View style={adminStyles.pillGrid}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[adminStyles.pill, active && adminStyles.pillActive]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[adminStyles.pillText, active && adminStyles.pillTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function AdminDateRow({ value, onChange, label }) {
  const adminStyles = useAdminStyles();
  const { colors } = useTheme();
  const [show, setShow] = React.useState(false);
  const display = value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: getTimezone() })
    : label || 'Select date';

  return (
    <>
      <TouchableOpacity style={adminStyles.datePickerRow} onPress={() => setShow(true)} activeOpacity={0.7}>
        <Ionicons name="calendar-outline" size={18} color={colors.primary} />
        <Text style={adminStyles.dateText}>{display}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={value ? new Date(`${value}T00:00:00`) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_, date) => {
            setShow(Platform.OS === 'ios');
            if (date) onChange(dateToISO(date));
          }}
        />
      )}
    </>
  );
}

export function AdminMonthRow({ value, onChange, maxMonth }) {
  const adminStyles = useAdminStyles();
  const { colors } = useTheme();
  const [y, m] = value.split('-').map(Number);
  const now = new Date();
  const currentKey = maxMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [maxY, maxM] = currentKey.split('-').map(Number);
  const atMax = y > maxY || (y === maxY && m >= maxM);
  const shift = (delta) => {
    let month = m + delta;
    let year = y;
    while (month < 1) { month += 12; year -= 1; }
    while (month > 12) { month -= 12; year += 1; }
    if (year > maxY || (year === maxY && month > maxM)) return;
    onChange(`${year}-${String(month).padStart(2, '0')}`);
  };

  return (
    <TouchableOpacity style={adminStyles.datePickerRow} activeOpacity={0.85}>
      <TouchableOpacity onPress={() => shift(-1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={18} color={colors.primary} />
      </TouchableOpacity>
      <Text style={[adminStyles.dateText, { flex: 1, textAlign: 'center' }]}>
        {new Date(`${value}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: getTimezone() })}
      </Text>
      <TouchableOpacity onPress={() => shift(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} disabled={atMax} style={{ opacity: atMax ? 0.3 : 1 }}>
        <Ionicons name="chevron-forward" size={18} color={colors.primary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export function AdminDetailSheet({ visible, title, onClose, children }) {
  const adminStyles = useAdminStyles();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={adminStyles.modalOverlay}>
        <Pressable onPress={onClose} style={{ flex: 1 }} />
        <View style={adminStyles.modalContent}>
          <View style={adminStyles.modalHeader}>
            <TouchableOpacity onPress={onClose} style={adminStyles.iconBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={adminStyles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={adminStyles.iconBtn}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Renders label/value rows in detail modals. */
export function AdminDetailRows({ rows = [] }) {
  const adminStyles = useAdminStyles();
  return rows.map((row, i) => (
    <View key={row.label || i} style={adminStyles.detailField}>
      <Text style={adminStyles.detailLabel}>{row.label}</Text>
      <Text style={[adminStyles.detailValue, row.valueStyle]} numberOfLines={row.numberOfLines}>
        {row.value ?? '—'}
      </Text>
    </View>
  ));
}

/**
 * Attendance-style CRUD modal: view detail → edit → save / delete.
 * Pass viewContent for read-only mode; children for edit/create form fields.
 */
export function AdminCrudSheet({
  visible,
  detailTitle = 'Detail',
  createTitle = 'Create',
  editTitle = 'Edit',
  onClose,
  onCancelEdit,
  isEditing = false,
  isCreating = false,
  onStartEdit,
  onSave,
  onDelete,
  saving = false,
  saveLabel = 'Save',
  showEdit = true,
  showDelete = true,
  viewContent,
  footerContent,
  children,
}) {
  const adminStyles = useAdminStyles();
  const { colors } = useTheme();
  const title = isCreating ? createTitle : isEditing ? editTitle : detailTitle;

  const handleBack = () => {
    if (isEditing && !isCreating && onCancelEdit) onCancelEdit();
    else onClose();
  };

  const inFormMode = isEditing || isCreating;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleBack}>
      <View style={adminStyles.modalOverlay}>
        <Pressable onPress={handleBack} style={{ flex: 1 }} />
        <View style={adminStyles.modalContent}>
          <View style={adminStyles.modalHeader}>
            <TouchableOpacity onPress={handleBack} style={adminStyles.iconBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[adminStyles.modalTitle, { marginLeft: 8 }]} numberOfLines={1}>{title}</Text>
            {!inFormMode && showEdit && onStartEdit ? (
              <TouchableOpacity onPress={onStartEdit} style={adminStyles.iconBtn}>
                <Ionicons name="create-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            ) : inFormMode && !isCreating ? (
              <TouchableOpacity onPress={onCancelEdit || onClose} style={adminStyles.iconBtn}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 36 }} />
            )}
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {!inFormMode && viewContent}
        {!inFormMode && footerContent}
        {!inFormMode && showDelete && onDelete ? (
          <TouchableOpacity style={adminStyles.deleteActionBtn} onPress={onDelete}>
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
            <Text style={adminStyles.deleteActionText}>Delete</Text>
          </TouchableOpacity>
        ) : null}
        {inFormMode && children}
        {inFormMode && onSave ? (
          <TouchableOpacity
            style={[adminStyles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={onSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Ionicons name="checkmark-circle" size={20} color="#FFF" />
            )}
            <Text style={adminStyles.saveBtnText}>{saving ? 'Saving...' : saveLabel}</Text>
          </TouchableOpacity>
        ) : null}
        <View style={{ height: 24 }} />
      </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function ScreenTopBar({
  rightAction,
  scrollTopBar,
}) {
  const host = useScrollTopBarHost();
  const id = useId();

  useFocusEffect(
    useCallback(() => {
      if (!host || !scrollTopBar) return undefined;

      host.register({
        id,
        rightAction,
        visible: true,
        barStyle: scrollTopBar.barStyle,
      });

      return () => host.unregister(id);
    }, [host, id, rightAction, scrollTopBar]),
  );

  return null;
}

export function scrollViewTopBarProps(scrollTopBar, contentContainerStyle) {
  return {
    style: { flex: 1 },
    scrollEventThrottle: scrollTopBar.scrollEventThrottle,
    contentContainerStyle: contentContainerStyle || undefined,
  };
}
