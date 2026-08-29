import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { Avatar, Badge, EmptyState } from '../components/UI';
import {
  useAdminStyles,
  AdminHeader,
  AdminStatRow,
  AdminTabPills,
  AdminSearchBar,
  AdminListCard,
  AdminFieldLabel,
  AdminInput,
  AdminCrudSheet,
  AdminDetailRows,
  AdminPillGrid,
  scrollViewTopBarProps,
  useScrollTopBar } from '../components/AdminScreenKit';

const TABS = [
  { key: 'reviews', label: 'Reviews' },
  { key: 'goals', label: 'Goals' },
  { key: 'received', label: 'Received' },
];

const FEEDBACK_MODES = [
  { value: 'peer', label: 'Peer' },
  { value: 'self', label: 'Self' },
];

const RATING_FIELDS = [
  { key: 'communicationRating', label: 'Communication' },
  { key: 'teamworkRating', label: 'Teamwork' },
  { key: 'reliabilityRating', label: 'Reliability' },
  { key: 'problemSolvingRating', label: 'Problem solving' },
];

const emptyFeedbackForm = {
  mode: 'peer',
  targetEmployeeId: null,
  strengths: '',
  areasForImprovement: '',
  collaborationFeedback: '',
  additionalComments: '',
  communicationRating: 4,
  teamworkRating: 4,
  reliabilityRating: 4,
  problemSolvingRating: 4 };

const createLocalStyles = (colors) => ({
  ratingText: { fontSize: 12, fontWeight: '600', color: '#D97706', marginTop: 4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  progressBar: { flex: 1, height: 6, backgroundColor: colors.borderLight, borderRadius: 3 },
  progressFill: { height: 6, borderRadius: 3 },
  progressText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, minWidth: 35, textAlign: 'right' },
  ratingRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  ratingBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface },
  ratingBtnActive: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
  ratingBtnText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  ratingBtnTextActive: { color: '#D97706' },
  employeeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8 } });

const pickList = (res) => {
  if (res.status !== 'fulfilled') return [];
  const d = res.value.data;
  return d?.data || d?.items || (Array.isArray(d) ? d : []);
};

const empName = (e) => e.fullName
  || `${e.firstName || e.first_name || ''} ${e.lastName || e.last_name || ''}`.trim()
  || e.employeeName
  || `Employee #${e.id}`;

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const avgFromRatings = (item) => {
  const vals = [
    item.overallRating,
    item.communicationRating,
    item.teamworkRating,
    item.reliabilityRating,
    item.problemSolvingRating,
    item.rating,
    item.overallScore,
  ].map((v) => parseFloat(v)).filter((v) => !Number.isNaN(v) && v > 0);
  if (!vals.length) return null;
  return (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1);
};

const feedbackPreview = (item) => item.collaborationFeedback
  || item.whatEmployeeDoesWell
  || item.strengths
  || item.additionalComments
  || item.notes
  || '—';

const MyPerformanceScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const adminStyles = useAdminStyles();
  const scrollTopBar = useScrollTopBar();
  const localStyles = useThemedStyles(createLocalStyles);
  const { user } = useAuth();

  const employeeId = user?.employeeId ?? user?.employee_id;

  const [tab, setTab] = useState('reviews');
  const [reviews, setReviews] = useState([]);
  const [goals, setGoals] = useState([]);
  const [receivedFeedback, setReceivedFeedback] = useState([]);
  const [colleagues, setColleagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [isGivingFeedback, setIsGivingFeedback] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState(emptyFeedbackForm);
  const [saving, setSaving] = useState(false);
  const [colleagueSearch, setColleagueSearch] = useState('');

  const isModalOpen = !!selectedItem || isGivingFeedback;

  const fetchData = useCallback(async () => {
    if (!employeeId) {
      setReviews([]);
      setGoals([]);
      setReceivedFeedback([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [rRes, gRes, fRes, eRes] = await Promise.allSettled([
        api.get('/performance/reviews', { params: { employeeId } }),
        api.get('/goals', { params: { employeeId } }),
        api.get('/feedback', { params: { employeeId } }),
        api.get('/employees', { params: { status: 'active' } }),
      ]);
      setReviews(pickList(rRes));
      setGoals(pickList(gRes));
      setReceivedFeedback(pickList(fRes));
      const allEmployees = pickList(eRes);
      setColleagues(allEmployees.filter((e) => e.id !== employeeId));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employeeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const closeModal = () => {
    setSelectedItem(null);
    setIsGivingFeedback(false);
    setFeedbackForm({ ...emptyFeedbackForm });
    setColleagueSearch('');
  };

  const openGiveFeedback = () => {
    setSelectedItem(null);
    setFeedbackForm({ ...emptyFeedbackForm });
    setIsGivingFeedback(true);
  };

  const filteredColleagues = useMemo(() => {
    const q = colleagueSearch.toLowerCase();
    if (!q) return colleagues.slice(0, 12);
    return colleagues.filter((e) => {
      const name = empName(e).toLowerCase();
      return name.includes(q)
        || (e.email || '').toLowerCase().includes(q)
        || (e.employeeCode || e.employee_code || '').toLowerCase().includes(q);
    }).slice(0, 12);
  }, [colleagues, colleagueSearch]);

  const filterList = (list, keys) => list.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return keys.some((k) => (item[k] || '').toString().toLowerCase().includes(q));
  });

  const filteredReviews = filterList(reviews, ['employeeName', 'reviewerName', 'reviewPeriod', 'status']);
  const filteredGoals = filterList(goals, ['title', 'description', 'status', 'category']);
  const filteredReceived = filterList(receivedFeedback, ['reviewerName', 'feedbackType', 'strengths', 'collaborationFeedback']);

  const avgReviewScore = reviews.length
    ? (reviews.reduce((s, r) => s + (parseFloat(r.overallScore ?? r.rating) || 0), 0) / reviews.length).toFixed(1)
    : '—';
  const activeGoals = goals.filter((g) => g.status !== 'completed').length;
  const completedGoals = goals.filter((g) => g.status === 'completed' || (g.progress || 0) >= 100).length;
  const peerFeedbackCount = receivedFeedback.filter((f) => f.feedbackType === 'peer').length;

  const setRating = (field, value) => {
    setFeedbackForm((f) => ({ ...f, [field]: value }));
  };

  const handleSubmitFeedback = async () => {
    if (!employeeId) {
      Alert.alert('Profile incomplete', 'Your account is not linked to an employee record.');
      return;
    }
    const targetId = feedbackForm.mode === 'self' ? employeeId : feedbackForm.targetEmployeeId;
    if (!targetId) {
      Alert.alert('Select colleague', 'Choose a colleague to give feedback to.');
      return;
    }
    const hasContent = feedbackForm.strengths.trim()
      || feedbackForm.areasForImprovement.trim()
      || feedbackForm.collaborationFeedback.trim()
      || feedbackForm.additionalComments.trim();
    if (!hasContent) {
      Alert.alert('Add feedback', 'Write at least one comment or rating note.');
      return;
    }

    const ratings = RATING_FIELDS.map((f) => feedbackForm[f.key]).filter(Boolean);
    const overallRating = ratings.length
      ? Math.round(ratings.reduce((s, v) => s + v, 0) / ratings.length)
      : undefined;

    setSaving(true);
    try {
      await api.post('/feedback', {
        employeeId: targetId,
        feedbackType: feedbackForm.mode === 'self' ? 'self' : 'peer',
        feedbackYear: new Date().getFullYear(),
        communicationRating: feedbackForm.communicationRating,
        teamworkRating: feedbackForm.teamworkRating,
        reliabilityRating: feedbackForm.reliabilityRating,
        problemSolvingRating: feedbackForm.problemSolvingRating,
        overallRating,
        strengths: feedbackForm.strengths.trim() || undefined,
        areasForImprovement: feedbackForm.areasForImprovement.trim() || undefined,
        collaborationFeedback: feedbackForm.collaborationFeedback.trim() || undefined,
        additionalComments: feedbackForm.additionalComments.trim() || undefined });
      Alert.alert(
        'Submitted',
        feedbackForm.mode === 'self'
          ? 'Your self-assessment has been recorded.'
          : 'Your peer feedback has been submitted.',
      );
      closeModal();
      fetchData();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to submit feedback.');
    } finally {
      setSaving(false);
    }
  };

  const renderRatingPicker = (field, label) => (
    <View key={field}>
      <AdminFieldLabel>{label}</AdminFieldLabel>
      <View style={localStyles.ratingRow}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = feedbackForm[field] === n;
          return (
            <TouchableOpacity
              key={n}
              style={[localStyles.ratingBtn, active && localStyles.ratingBtnActive]}
              onPress={() => setRating(field, n)}
            >
              <Text style={[localStyles.ratingBtnText, active && localStyles.ratingBtnTextActive]}>{n}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderDetail = () => {
    if (!selectedItem) return null;
    if (tab === 'reviews') {
      return (
        <AdminDetailRows rows={[
          { label: 'Period', value: selectedItem.reviewPeriod || selectedItem.reviewCycle || '—', valueStyle: { textTransform: 'none' } },
          { label: 'Year', value: selectedItem.reviewYear || '—' },
          { label: 'Reviewer', value: selectedItem.reviewerName || '—', valueStyle: { textTransform: 'none' } },
          { label: 'Score', value: avgFromRatings(selectedItem) ? `⭐ ${avgFromRatings(selectedItem)}` : '—', valueStyle: { textTransform: 'none' } },
          { label: 'Status', value: selectedItem.status || '—' },
          { label: 'Strengths', value: selectedItem.strengths || '—', valueStyle: { textTransform: 'none' }, numberOfLines: 4 },
          { label: 'Areas to improve', value: selectedItem.areasForImprovement || selectedItem.areas_for_improvement || '—', valueStyle: { textTransform: 'none' }, numberOfLines: 4 },
          { label: 'Comments', value: selectedItem.reviewerComments || '—', valueStyle: { textTransform: 'none' }, numberOfLines: 5 },
        ]} />
      );
    }
    if (tab === 'goals') {
      const progress = selectedItem.progress ?? 0;
      return (
        <AdminDetailRows rows={[
          { label: 'Goal', value: selectedItem.title || '—', valueStyle: { textTransform: 'none' } },
          { label: 'Category', value: selectedItem.category || selectedItem.goalType || '—', valueStyle: { textTransform: 'none' } },
          { label: 'Progress', value: `${progress}%` },
          { label: 'Status', value: selectedItem.status || '—' },
          { label: 'Target date', value: formatDate(selectedItem.endDate || selectedItem.targetDate), valueStyle: { textTransform: 'none' } },
          { label: 'Description', value: selectedItem.description || selectedItem.objective || '—', valueStyle: { textTransform: 'none' }, numberOfLines: 5 },
        ]} />
      );
    }
    return (
      <AdminDetailRows rows={[
        { label: 'From', value: selectedItem.isAnonymous ? 'Anonymous' : (selectedItem.reviewerName || '—'), valueStyle: { textTransform: 'none' } },
        { label: 'Type', value: selectedItem.feedbackType || '—' },
        { label: 'Overall', value: avgFromRatings(selectedItem) ? `⭐ ${avgFromRatings(selectedItem)}` : '—', valueStyle: { textTransform: 'none' } },
        { label: 'Strengths', value: selectedItem.strengths || selectedItem.whatEmployeeDoesWell || '—', valueStyle: { textTransform: 'none' }, numberOfLines: 4 },
        { label: 'Improvement', value: selectedItem.areasForImprovement || selectedItem.whatEmployeeCouldImprove || '—', valueStyle: { textTransform: 'none' }, numberOfLines: 4 },
        { label: 'Feedback', value: feedbackPreview(selectedItem), valueStyle: { textTransform: 'none' }, numberOfLines: 6 },
        { label: 'Date', value: formatDate(selectedItem.submittedAt || selectedItem.createdAt), valueStyle: { textTransform: 'none' } },
      ]} />
    );
  };

  if (!employeeId) {
    return (
      <View style={adminStyles.container}>
        <AdminHeader navigation={navigation} title="Performance" subtitle="Reviews, goals & feedback" showBack />
        <View style={adminStyles.body}>
          <EmptyState icon="⭐" title="Employee profile required" message="Link your user account to an employee record to view performance." />
        </View>
      </View>
    );
  }

  return (
    <View style={adminStyles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar)}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <AdminHeader
          navigation={navigation}
          title="Performance"
          subtitle="Your reviews, goals & peer feedback"
          onAdd={openGiveFeedback}
          showBack={navigation?.canGoBack?.() ?? false}
        />
        <View style={adminStyles.body}>
          <AdminStatRow stats={[
            { val: avgReviewScore, label: 'Avg Score', color: '#D97706', bg: '#FEF3C7' },
            { val: `${completedGoals}/${goals.length}`, label: 'Goals', color: '#10B981', bg: '#DCFCE7' },
            { val: reviews.length, label: 'Reviews', color: '#4F46E5', bg: '#EEF2FF' },
            { val: peerFeedbackCount, label: 'Peer FB', color: '#2563EB', bg: '#DBEAFE' },
          ]} />

          <AdminTabPills tabs={TABS} active={tab} onChange={(t) => { setTab(t); setSearch(''); closeModal(); }} />
          <AdminSearchBar value={search} onChangeText={setSearch} placeholder={`Search ${tab}...`} />

          {loading ? (
            <View>{[1, 2, 3].map((i) => <View key={i} style={adminStyles.skeleton} />)}</View>
          ) : (
            <>
              {tab === 'reviews' && (filteredReviews.length === 0 ? (
                <EmptyState icon="⭐" title="No reviews yet" message="Your performance reviews will appear here." />
              ) : filteredReviews.map((r) => (
                <AdminListCard key={r.id} onPress={() => setSelectedItem(r)}>
                  <View style={{
                    width: 42, height: 42, borderRadius: 14,
                    backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="star" size={20} color="#D97706" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={adminStyles.listTitle}>
                      {r.reviewPeriod || r.reviewCycle || `Review ${r.reviewYear || ''}`.trim()}
                    </Text>
                    <Text style={adminStyles.listSub}>{r.reviewerName || 'Reviewer pending'}</Text>
                    {avgFromRatings(r) ? <Text style={localStyles.ratingText}>⭐ {avgFromRatings(r)}</Text> : null}
                  </View>
                  {r.status ? <Badge status={r.status} size="sm" /> : null}
                </AdminListCard>
              )))}

              {tab === 'goals' && (filteredGoals.length === 0 ? (
                <EmptyState icon="🎯" title="No goals yet" message="Goals set for you will show up here." />
              ) : filteredGoals.map((g) => {
                const progress = Math.min(100, g.progress ?? 0);
                return (
                  <AdminListCard key={g.id} onPress={() => setSelectedItem(g)}>
                    <View style={{ flex: 1 }}>
                      <Text style={adminStyles.listTitle}>{g.title || `Goal #${g.id}`}</Text>
                      <Text style={adminStyles.listSub}>{g.category || g.goalType || 'Goal'} • {g.status || 'active'}</Text>
                      <View style={localStyles.progressRow}>
                        <View style={localStyles.progressBar}>
                          <View style={[localStyles.progressFill, {
                            width: `${progress}%`,
                            backgroundColor: progress >= 100 ? colors.success : colors.primary }]}
                          />
                        </View>
                        <Text style={localStyles.progressText}>{progress}%</Text>
                      </View>
                    </View>
                  </AdminListCard>
                );
              }))}

              {tab === 'received' && (filteredReceived.length === 0 ? (
                <EmptyState icon="💬" title="No feedback yet" message="Peer and manager feedback about you will appear here." />
              ) : filteredReceived.map((f) => (
                <AdminListCard key={f.id} onPress={() => setSelectedItem(f)}>
                  <Avatar
                    firstName={f.isAnonymous ? 'A' : f.reviewerName?.split(' ')[0]}
                    lastName={f.isAnonymous ? 'N' : f.reviewerName?.split(' ').slice(1).join(' ')}
                    size={40}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={adminStyles.listSub}>
                      {f.isAnonymous ? 'Anonymous' : (f.reviewerName || 'Colleague')} • {f.feedbackType || 'feedback'}
                    </Text>
                    <Text style={adminStyles.listTitle} numberOfLines={2}>{feedbackPreview(f)}</Text>
                    {avgFromRatings(f) ? <Text style={localStyles.ratingText}>⭐ {avgFromRatings(f)}</Text> : null}
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
        detailTitle={isGivingFeedback ? 'Give Feedback' : 'Detail'}
        createTitle={feedbackForm.mode === 'self' ? 'Self Assessment' : 'Give Peer Feedback'}
        onClose={closeModal}
        isEditing={isGivingFeedback}
        isCreating={isGivingFeedback}
        onSave={isGivingFeedback ? handleSubmitFeedback : undefined}
        saving={saving}
        saveLabel={feedbackForm.mode === 'self' ? 'Submit Self Assessment' : 'Submit Feedback'}
        showEdit={false}
        showDelete={false}
        viewContent={!isGivingFeedback ? renderDetail() : null}
      >
        {isGivingFeedback && (
          <>
            <AdminFieldLabel>Feedback type</AdminFieldLabel>
            <AdminPillGrid
              options={FEEDBACK_MODES}
              value={feedbackForm.mode}
              onChange={(v) => setFeedbackForm((f) => ({
                ...f,
                mode: v,
                targetEmployeeId: v === 'self' ? employeeId : null }))}
            />

            {feedbackForm.mode === 'peer' && (
              <>
                <AdminFieldLabel>Select colleague *</AdminFieldLabel>
                <AdminSearchBar
                  value={colleagueSearch}
                  onChangeText={setColleagueSearch}
                  placeholder="Search by name or email..."
                />
                {filteredColleagues.map((e) => {
                  const selected = feedbackForm.targetEmployeeId === e.id;
                  return (
                    <TouchableOpacity
                      key={e.id}
                      style={[localStyles.employeeOption, {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primarySurface : colors.surface }]}
                      onPress={() => setFeedbackForm((f) => ({ ...f, targetEmployeeId: e.id }))}
                    >
                      <Avatar firstName={e.firstName || e.first_name} lastName={e.lastName || e.last_name} size={36} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={adminStyles.listTitle}>{empName(e)}</Text>
                        <Text style={adminStyles.listSub} numberOfLines={1}>{e.email || e.employeeCode}</Text>
                      </View>
                      {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            <Text style={[adminStyles.sectionLabel, { marginTop: 8 }]}>Ratings (1–5)</Text>
            {RATING_FIELDS.map((f) => renderRatingPicker(f.key, f.label))}

            <AdminFieldLabel>Strengths</AdminFieldLabel>
            <AdminInput
              value={feedbackForm.strengths}
              onChangeText={(v) => setFeedbackForm((f) => ({ ...f, strengths: v }))}
              placeholder="What do they do well?"
              multiline
              style={{ height: 72, textAlignVertical: 'top' }}
            />
            <AdminFieldLabel>Areas for improvement</AdminFieldLabel>
            <AdminInput
              value={feedbackForm.areasForImprovement}
              onChangeText={(v) => setFeedbackForm((f) => ({ ...f, areasForImprovement: v }))}
              placeholder="What could be better?"
              multiline
              style={{ height: 72, textAlignVertical: 'top' }}
            />
            <AdminFieldLabel>Collaboration feedback</AdminFieldLabel>
            <AdminInput
              value={feedbackForm.collaborationFeedback}
              onChangeText={(v) => setFeedbackForm((f) => ({ ...f, collaborationFeedback: v }))}
              placeholder="How is it working together?"
              multiline
              style={{ height: 72, textAlignVertical: 'top' }}
            />
            <AdminFieldLabel>Additional comments</AdminFieldLabel>
            <AdminInput
              value={feedbackForm.additionalComments}
              onChangeText={(v) => setFeedbackForm((f) => ({ ...f, additionalComments: v }))}
              placeholder="Anything else to add..."
              multiline
              style={{ height: 72, textAlignVertical: 'top' }}
            />
          </>
        )}
      </AdminCrudSheet>
    </View>
  );
};

export default MyPerformanceScreen;
