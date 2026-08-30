import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useScrollTopBar } from '../hooks/useScrollTopBar';
import { scrollViewTopBarProps, bannerShellStyle } from '../components/AdminScreenKit';
import { Card, EmptyState, Badge } from '../components/UI';
import { radii, spacing, shadows } from '../theme';
import { TAB_BAR_CLEARANCE } from '../components/AppTabBar';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import api from '../services/api';

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { backgroundColor: colors.dark, paddingTop: spacing.xl, paddingBottom: spacing.xxl, borderRadius: 32, overflow: 'hidden' },
  heroOrb1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)', top: -40, right: -40 },
  heroOrb2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.08)', bottom: -10, left: 30 },
  heroContent: { paddingHorizontal: spacing.xl },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  body: { padding: spacing.xl },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radii.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  categoryLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  docCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md,
    borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surface,
    marginBottom: spacing.sm, ...shadows.sm,
  },
  docIconWrap: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  docName: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  docMeta: { fontSize: 11, color: colors.textTertiary },
  skeletonBlock: { height: 80, backgroundColor: colors.shimmer, borderRadius: 16, marginBottom: 12, opacity: 0.6 },
});

const DOCUMENT_CATEGORIES = [
  { key: 'all', label: 'All', icon: 'documents-outline' },
  { key: 'id_proof', label: 'ID Proof', icon: 'card-outline' },
  { key: 'address_proof', label: 'Address', icon: 'location-outline' },
  { key: 'education', label: 'Education', icon: 'school-outline' },
  { key: 'experience', label: 'Experience', icon: 'briefcase-outline' },
  { key: 'offer', label: 'Offer Letter', icon: 'document-text-outline' },
  { key: 'payslip', label: 'Payslips', icon: 'wallet-outline' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

const FILE_ICONS = {
  pdf: { icon: 'document-text', color: '#DC2626' },
  doc: { icon: 'document', color: '#2563EB' },
  docx: { icon: 'document', color: '#2563EB' },
  jpg: { icon: 'image', color: '#059669' },
  jpeg: { icon: 'image', color: '#059669' },
  png: { icon: 'image', color: '#059669' },
  xls: { icon: 'grid', color: '#059669' },
  xlsx: { icon: 'grid', color: '#059669' },
};

const DocumentsScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scrollTopBar = useScrollTopBar();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await api.get('/documents');
      const data = res.data;
      setDocuments(data?.data || data?.items || (Array.isArray(data) ? data : []));
    } catch (e) {
      setDocuments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const onRefresh = useCallback(() => { setRefreshing(true); fetchDocuments(); }, [fetchDocuments]);

  const getFileIcon = (filename) => {
    if (!filename) return { icon: 'document-outline', color: colors.textTertiary };
    const ext = filename.split('.').pop().toLowerCase();
    return FILE_ICONS[ext] || { icon: 'document-outline', color: colors.textTertiary };
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const filteredDocuments = activeCategory === 'all'
    ? documents
    : documents.filter(d => d.category === activeCategory);

  return (
    <ScrollView
      {...scrollViewTopBarProps(scrollTopBar, { paddingBottom: TAB_BAR_CLEARANCE + 16 })}
      style={styles.container}
      refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.hero, bannerShellStyle(scrollTopBar)]}>
        <View style={styles.heroOrb1} /><View style={styles.heroOrb2} />
        <View style={[styles.heroContent, { flexDirection: 'row', alignItems: 'center' }]}>
          {navigation?.canGoBack?.() && (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
              <Ionicons name="chevron-back" size={22} color="#FFF" />
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.heroTitle}>Documents</Text>
            <Text style={styles.heroSub}>{documents.length} document{documents.length !== 1 ? 's' : ''}</Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.categoryRow}>
          {DOCUMENT_CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.categoryChip, isActive && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => setActiveCategory(cat.key)}
                activeOpacity={0.7}
              >
                <Ionicons name={cat.icon} size={14} color={isActive ? '#FFF' : colors.textSecondary} />
                <Text style={[styles.categoryLabel, isActive && { color: '#FFF' }]}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <>
            <View style={styles.skeletonBlock} />
            <View style={styles.skeletonBlock} />
            <View style={styles.skeletonBlock} />
          </>
        ) : filteredDocuments.length === 0 ? (
          <EmptyState icon="📂" title="No documents" message={activeCategory === 'all' ? "No documents uploaded yet." : "No documents in this category."} />
        ) : (
          filteredDocuments.map((item, i) => {
            const fileIcon = getFileIcon(item.name || item.filename || item.file_name);
            const isUploaded = item.status === 'uploaded' || item.status === 'approved';
            const sizeStr = formatFileSize(item.size || item.file_size);
            const dateStr = formatDate(item.uploaded_at || item.created_at);
            const meta = [item.category ? item.category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : null, sizeStr, dateStr].filter(Boolean).join(' • ');
            return (
              <Card key={item.id || i}>
                <View style={styles.docCard}>
                  <View style={[styles.docIconWrap, { backgroundColor: fileIcon.color + '15' }]}>
                    <Ionicons name={fileIcon.icon} size={24} color={fileIcon.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docName} numberOfLines={1}>{item.name || item.filename || item.file_name || 'Untitled'}</Text>
                    <Text style={styles.docMeta}>{meta}</Text>
                  </View>
                  <Badge status={isUploaded ? 'active' : 'warning'} label={item.status || 'uploaded'} size="sm" />
                </View>
              </Card>
            );
          })
        )}
      </View>
    </ScrollView>
  );
};

export default DocumentsScreen;
