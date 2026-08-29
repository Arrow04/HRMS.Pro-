import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { Avatar, EmptyState } from '../components/UI';
import {
  useAdminStyles, AdminHeader, AdminStatRow, AdminTabPills, AdminSearchBar,
  AdminListCard, AdminFieldLabel, AdminInput, AdminCrudSheet, AdminDetailRows, scrollViewTopBarProps, useScrollTopBar } from '../components/AdminScreenKit';

const createLocalStyles = (colors) => ({
  ratingText: { fontSize: 12, fontWeight: '600', color: '#D97706', marginTop: 4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  progressBar: { flex: 1, height: 6, backgroundColor: colors.borderLight, borderRadius: 3 },
  progressFill: { height: 6, borderRadius: 3 },
  progressText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, minWidth: 35, textAlign: 'right' } });
const TABS = [
  { key: 'reviews', label: 'Reviews' },
  { key: 'goals', label: 'Goals' },
  { key: 'feedback', label: 'Feedback' },
];

const emptyForm = { title: '', description: '', rating: '', target: '', current: '', employeeId: '', content: '' };

const PerformanceScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const localStyles = useThemedStyles(createLocalStyles);
  const adminStyles = useAdminStyles();
  const scrollTopBar = useScrollTopBar();
  const [tab, setTab] = useState('reviews');
  const [reviews, setReviews] = useState([]);
  const [goals, setGoals] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const isModalOpen = !!selectedItem || isCreating;
  const addType = tab === 'reviews' ? 'review' : tab === 'goals' ? 'goal' : 'feedback';

  const fetchData = useCallback(async () => {
    try {
      const [rRes, gRes, fRes] = await Promise.allSettled([
        api.get('/performance/reviews'),
        api.get('/performance/goals'),
        api.get('/performance/feedback'),
      ]);
      const pick = (res) => {
        if (res.status !== 'fulfilled') return [];
        const d = res.value.data;
        return d?.data || d?.items || (Array.isArray(d) ? d : []);
      };
      setReviews(pick(rRes));
      setGoals(pick(gRes));
      setFeedback(pick(fRes));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

  const closeModal = () => {
    setSelectedItem(null);
    setIsEditing(false);
    setIsCreating(false);
    setForm(emptyForm);
  };

  const openCreate = () => {
    setSelectedItem(null);
    setForm(emptyForm);
    setIsCreating(true);
    setIsEditing(true);
  };

  const openDetail = (item) => {
    setSelectedItem(item);
    setForm({
      title: item.title || '',
      description: item.description || '',
      rating: String(item.rating || ''),
      target: String(item.target_value || ''),
      current: String(item.current_value || ''),
      employeeId: String(item.employee_id || ''),
      content: item.content || item.text || '' });
    setIsEditing(false);
    setIsCreating(false);
  };

  const endpoint = () => (addType === 'review' ? 'reviews' : addType === 'goal' ? 'goals' : 'feedback');

  const handleSave = async () => {
    setSaving(true);
    try {
      if (addType === 'review') {
        if (!form.title.trim()) { Alert.alert('Error', 'Title required.'); setSaving(false); return; }
        const payload = { title: form.title.trim(), description: form.description.trim(), rating: parseFloat(form.rating) || 0, employee_id: parseInt(form.employeeId) || undefined };
        if (isCreating) await api.post('/performance/reviews', payload);
        else await api.put(`/performance/reviews/${selectedItem.id}`, payload);
      } else if (addType === 'goal') {
        if (!form.title.trim()) { Alert.alert('Error', 'Title required.'); setSaving(false); return; }
        const payload = { title: form.title.trim(), description: form.description.trim(), target_value: parseFloat(form.target) || 100, current_value: parseFloat(form.current) || 0, employee_id: parseInt(form.employeeId) || undefined };
        if (isCreating) await api.post('/performance/goals', payload);
        else await api.put(`/performance/goals/${selectedItem.id}`, payload);
      } else {
        if (!form.content.trim()) { Alert.alert('Error', 'Feedback text required.'); setSaving(false); return; }
        const payload = { content: form.content.trim(), employee_id: parseInt(form.employeeId) || undefined };
        if (isCreating) await api.post('/performance/feedback', payload);
        else await api.put(`/performance/feedback/${selectedItem.id}`, payload);
      }
      Alert.alert('Success', isCreating ? `${addType} created.` : `${addType} updated.`);
      closeModal();
      fetchData();
    } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
    finally { setSaving(false); }
  };

  const handleDelete = () => {
    if (!selectedItem) return;
    Alert.alert('Delete', 'Delete this item?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/performance/${endpoint()}/${selectedItem.id}`); closeModal(); fetchData(); }
        catch { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const filterList = (list, keys) => list.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return keys.some((k) => (item[k] || '').toString().toLowerCase().includes(q));
  });

  const filteredReviews = filterList(reviews, ['employee_name', 'title', 'reviewer_name']);
  const filteredGoals = filterList(goals, ['employee_name', 'title', 'description']);
  const filteredFeedback = filterList(feedback, ['employee_name', 'reviewer_name', 'content']);

  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + (parseFloat(r.rating) || 0), 0) / reviews.length).toFixed(1) : '0';
  const completedGoals = goals.filter((g) => (parseFloat(g.current_value) || 0) >= (parseFloat(g.target_value) || 1)).length;

  const renderViewContent = () => {
    if (!selectedItem) return null;
    if (tab === 'reviews') {
      return (
        <AdminDetailRows rows={[
          { label: 'Title', value: selectedItem.title, valueStyle: { textTransform: 'none' } },
          { label: 'Employee', value: selectedItem.employee_name || 'N/A', valueStyle: { textTransform: 'none' } },
          { label: 'Reviewer', value: selectedItem.reviewer_name || 'N/A', valueStyle: { textTransform: 'none' } },
          { label: 'Rating', value: `⭐ ${parseFloat(selectedItem.rating || 0).toFixed(1)}`, valueStyle: { textTransform: 'none' } },
          { label: 'Description', value: selectedItem.description || '—', valueStyle: { textTransform: 'none' }, numberOfLines: 4 },
        ]} />
      );
    }
    if (tab === 'goals') {
      const target = parseFloat(selectedItem.target_value) || 100;
      const current = parseFloat(selectedItem.current_value) || 0;
      const pct = Math.min(100, Math.round((current / target) * 100));
      return (
        <AdminDetailRows rows={[
          { label: 'Title', value: selectedItem.title, valueStyle: { textTransform: 'none' } },
          { label: 'Employee', value: selectedItem.employee_name || 'N/A', valueStyle: { textTransform: 'none' } },
          { label: 'Progress', value: `${pct}%`, valueStyle: { textTransform: 'none' } },
          { label: 'Target', value: target },
          { label: 'Current', value: current },
          { label: 'Description', value: selectedItem.description || '—', valueStyle: { textTransform: 'none' }, numberOfLines: 4 },
        ]} />
      );
    }
    return (
      <AdminDetailRows rows={[
        { label: 'From', value: selectedItem.reviewer_name || 'N/A', valueStyle: { textTransform: 'none' } },
        { label: 'To', value: selectedItem.employee_name || 'N/A', valueStyle: { textTransform: 'none' } },
        { label: 'Feedback', value: selectedItem.content || selectedItem.text, valueStyle: { textTransform: 'none' }, numberOfLines: 6 },
        { label: 'Date', value: selectedItem.created_at ? new Date(selectedItem.created_at).toLocaleDateString() : '—', valueStyle: { textTransform: 'none' } },
      ]} />
    );
  };

  const renderEditForm = () => {
    if (addType === 'feedback') {
      return (
        <>
          <AdminFieldLabel>Employee ID</AdminFieldLabel>
          <AdminInput value={form.employeeId} onChangeText={(v) => setForm((f) => ({ ...f, employeeId: v }))} placeholder="Employee ID" keyboardType="number-pad" />
          <AdminFieldLabel>Feedback *</AdminFieldLabel>
          <AdminInput value={form.content} onChangeText={(v) => setForm((f) => ({ ...f, content: v }))} placeholder="Write feedback..." multiline style={{ height: 120, textAlignVertical: 'top' }} />
        </>
      );
    }
    return (
      <>
        <AdminFieldLabel>Title *</AdminFieldLabel>
        <AdminInput value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="Title" />
        {addType === 'review' && (
          <>
            <AdminFieldLabel>Rating (1-5)</AdminFieldLabel>
            <AdminInput value={form.rating} onChangeText={(v) => setForm((f) => ({ ...f, rating: v }))} placeholder="Rating" keyboardType="decimal-pad" />
          </>
        )}
        {addType === 'goal' && (
          <>
            <AdminFieldLabel>Target</AdminFieldLabel>
            <AdminInput value={form.target} onChangeText={(v) => setForm((f) => ({ ...f, target: v }))} placeholder="Target value" keyboardType="number-pad" />
            <AdminFieldLabel>Current</AdminFieldLabel>
            <AdminInput value={form.current} onChangeText={(v) => setForm((f) => ({ ...f, current: v }))} placeholder="Current value" keyboardType="number-pad" />
          </>
        )}
        <AdminFieldLabel>Employee ID</AdminFieldLabel>
        <AdminInput value={form.employeeId} onChangeText={(v) => setForm((f) => ({ ...f, employeeId: v }))} placeholder="Employee ID" keyboardType="number-pad" />
        <AdminFieldLabel>Description</AdminFieldLabel>
        <AdminInput value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="Description" multiline style={{ height: 80, textAlignVertical: 'top' }} />
      </>
    );
  };

  return (
    <View style={adminStyles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar)}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <AdminHeader navigation={navigation} title="Performance" subtitle="Reviews, goals & feedback" onAdd={openCreate} />
        <View style={adminStyles.body}>
          <AdminStatRow stats={[
            { val: avgRating, label: 'Avg Rating', color: '#D97706', bg: '#FEF3C7' },
            { val: `${completedGoals}/${goals.length}`, label: 'Goals Done', color: '#10B981', bg: '#DCFCE7' },
            { val: reviews.length, label: 'Reviews', color: '#4F46E5', bg: '#EEF2FF' },
            { val: feedback.length, label: 'Feedback', color: '#2563EB', bg: '#DBEAFE' },
          ]} />
          <AdminTabPills tabs={TABS} active={tab} onChange={(t) => { setTab(t); setSearch(''); closeModal(); }} />
          <AdminSearchBar value={search} onChangeText={setSearch} placeholder={`Search ${tab}...`} />
          {loading ? (
            <View>{[1, 2, 3].map((i) => <View key={i} style={adminStyles.skeleton} />)}</View>
          ) : (
            <>
              {tab === 'reviews' && (filteredReviews.length === 0 ? (
                <EmptyState icon="⭐" title="No reviews" message="Create performance reviews." />
              ) : filteredReviews.map((r) => (
                <AdminListCard key={r.id} onPress={() => openDetail(r)}>
                  <Avatar firstName={r.employee_name?.split(' ')[0]} lastName={r.employee_name?.split(' ').slice(1).join(' ')} size={44} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={adminStyles.listTitle}>{r.title || `Review #${r.id}`}</Text>
                    <Text style={adminStyles.listSub}>{r.employee_name || 'N/A'} • {r.reviewer_name || 'N/A'}</Text>
                    <Text style={localStyles.ratingText}>⭐ {parseFloat(r.rating || 0).toFixed(1)}</Text>
                  </View>
                </AdminListCard>
              )))}
              {tab === 'goals' && (filteredGoals.length === 0 ? (
                <EmptyState icon="🎯" title="No goals" message="Set performance goals." />
              ) : filteredGoals.map((g) => {
                const target = parseFloat(g.target_value) || 100;
                const current = parseFloat(g.current_value) || 0;
                const pct = Math.min(100, Math.round((current / target) * 100));
                return (
                  <AdminListCard key={g.id} onPress={() => openDetail(g)}>
                    <View style={{ flex: 1 }}>
                      <Text style={adminStyles.listTitle}>{g.title || `Goal #${g.id}`}</Text>
                      <Text style={adminStyles.listSub}>{g.employee_name || 'N/A'}</Text>
                      <View style={localStyles.progressRow}>
                        <View style={localStyles.progressBar}>
                          <View style={[localStyles.progressFill, { width: `${pct}%`, backgroundColor: pct >= 100 ? colors.success : colors.primary }]} />
                        </View>
                        <Text style={localStyles.progressText}>{pct}%</Text>
                      </View>
                    </View>
                  </AdminListCard>
                );
              }))}
              {tab === 'feedback' && (filteredFeedback.length === 0 ? (
                <EmptyState icon="💬" title="No feedback" message="Give performance feedback." />
              ) : filteredFeedback.map((f) => (
                <AdminListCard key={f.id} onPress={() => openDetail(f)}>
                  <Avatar firstName={f.reviewer_name?.split(' ')[0]} lastName={f.reviewer_name?.split(' ').slice(1).join(' ')} size={40} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={adminStyles.listSub}>{f.reviewer_name || 'N/A'} → {f.employee_name || 'N/A'}</Text>
                    <Text style={adminStyles.listTitle} numberOfLines={2}>{f.content || f.text}</Text>
                  </View>
                </AdminListCard>
              )))}
            </>
          )}
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      <AdminCrudSheet
        visible={isModalOpen}
        detailTitle={`${addType.charAt(0).toUpperCase() + addType.slice(1)} Detail`}
        createTitle={`Add ${addType}`}
        editTitle={`Edit ${addType}`}
        onClose={closeModal}
        onCancelEdit={() => setIsEditing(false)}
        isEditing={isEditing}
        isCreating={isCreating}
        onStartEdit={() => setIsEditing(true)}
        onSave={handleSave}
        onDelete={handleDelete}
        saving={saving}
        saveLabel={isCreating ? `Create ${addType}` : `Update ${addType}`}
        viewContent={renderViewContent()}
      >
        {renderEditForm()}
      </AdminCrudSheet>
    </View>
  );
};


export default PerformanceScreen;
