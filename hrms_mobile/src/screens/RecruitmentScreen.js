import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { Badge, EmptyState, Avatar } from '../components/UI';
import {
  useAdminStyles, AdminHeader, AdminStatRow, AdminTabPills, AdminSearchBar,
  AdminListCard, AdminFieldLabel, AdminInput, AdminCrudSheet, AdminDetailRows, scrollViewTopBarProps, useScrollTopBar } from '../components/AdminScreenKit';
import { getTimezone } from '../utils/timezone';

const createLocalStyles = (colors) => ({
  actionBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  actionBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' } });
const TABS = [
  { key: 'jobs', label: 'Jobs' },
  { key: 'candidates', label: 'Candidates' },
  { key: 'interviews', label: 'Interviews' },
];

const emptyJobForm = { title: '', department: '', description: '', positions_count: '1' };

const RecruitmentScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const localStyles = useThemedStyles(createLocalStyles);
  const adminStyles = useAdminStyles();
  const scrollTopBar = useScrollTopBar();
  const [tab, setTab] = useState('jobs');
  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(emptyJobForm);
  const [saving, setSaving] = useState(false);

  const isModalOpen = !!selectedItem || isCreating;

  const fetchData = useCallback(async () => {
    try {
      const [jRes, cRes, iRes] = await Promise.allSettled([
        api.get('/recruitment/jobs'),
        api.get('/recruitment/candidates'),
        api.get('/recruitment/interviews'),
      ]);
      const pick = (res) => {
        if (res.status !== 'fulfilled') return [];
        const d = res.value.data;
        return d?.data || d?.items || (Array.isArray(d) ? d : []);
      };
      setJobs(pick(jRes));
      setCandidates(pick(cRes));
      setInterviews(pick(iRes));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

  const closeModal = () => {
    setSelectedItem(null);
    setIsEditing(false);
    setIsCreating(false);
    setForm(emptyJobForm);
  };

  const openCreate = () => {
    if (tab !== 'jobs') return;
    setSelectedItem(null);
    setForm(emptyJobForm);
    setIsCreating(true);
    setIsEditing(true);
  };

  const openDetail = (item) => {
    setSelectedItem(item);
    if (tab === 'jobs') {
      setForm({
        title: item.title || '',
        department: typeof item.department === 'object' ? item.department?.name : item.department || '',
        description: item.description || '',
        positions_count: String(item.positions_count || 1) });
    }
    setIsEditing(false);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (tab !== 'jobs') return;
    if (!form.title.trim()) { Alert.alert('Error', 'Title required.'); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        department: form.department.trim(),
        description: form.description.trim(),
        positions_count: parseInt(form.positions_count) || 1 };
      if (isCreating) await api.post('/recruitment/jobs', payload);
      else await api.put(`/recruitment/jobs/${selectedItem.id}`, payload);
      Alert.alert('Success', isCreating ? 'Job posted.' : 'Job updated.');
      closeModal();
      fetchData();
    } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
    finally { setSaving(false); }
  };

  const handleDelete = () => {
    if (!selectedItem || tab !== 'jobs') return;
    Alert.alert('Delete', `Delete "${selectedItem.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/recruitment/jobs/${selectedItem.id}`); closeModal(); fetchData(); }
        catch { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const handleSchedule = () => {
    if (!selectedItem) return;
    Alert.alert('Update', 'Set status to "interview"?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'OK', onPress: async () => {
        try { await api.put(`/recruitment/candidates/${selectedItem.id}`, { status: 'interview' }); closeModal(); fetchData(); }
        catch { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const filterList = (list, keys) => list.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return keys.some((k) => (item[k] || '').toLowerCase().includes(q));
  });

  const filteredJobs = filterList(jobs, ['title', 'department', 'status']);
  const filteredCandidates = filterList(candidates, ['name', 'email', 'job_title', 'status']);
  const filteredInterviews = filterList(interviews, ['candidate_name', 'job_title', 'interviewer', 'status']);

  const detailTitle = tab === 'jobs' ? 'Job Detail' : tab === 'candidates' ? 'Candidate Detail' : 'Interview Detail';

  const renderViewContent = () => {
    if (!selectedItem) return null;
    if (tab === 'jobs') {
      return (
        <AdminDetailRows rows={[
          { label: 'Title', value: selectedItem.title, valueStyle: { textTransform: 'none' } },
          { label: 'Department', value: typeof selectedItem.department === 'object' ? selectedItem.department?.name : selectedItem.department || 'General', valueStyle: { textTransform: 'none' } },
          { label: 'Positions', value: selectedItem.positions_count || 1 },
          { label: 'Status', value: selectedItem.status || 'open' },
          { label: 'Description', value: selectedItem.description || '—', valueStyle: { textTransform: 'none' }, numberOfLines: 4 },
        ]} />
      );
    }
    if (tab === 'candidates') {
      return (
        <AdminDetailRows rows={[
          { label: 'Name', value: selectedItem.name, valueStyle: { textTransform: 'none' } },
          { label: 'Email', value: selectedItem.email || 'N/A', valueStyle: { textTransform: 'none' } },
          { label: 'Job', value: selectedItem.job_title || 'N/A', valueStyle: { textTransform: 'none' } },
          { label: 'Status', value: selectedItem.status || 'submitted' },
        ]} />
      );
    }
    return (
      <AdminDetailRows rows={[
        { label: 'Candidate', value: selectedItem.candidate_name, valueStyle: { textTransform: 'none' } },
        { label: 'Job', value: selectedItem.job_title || 'N/A', valueStyle: { textTransform: 'none' } },
        { label: 'Interviewer', value: selectedItem.interviewer || 'TBD', valueStyle: { textTransform: 'none' } },
        { label: 'Scheduled', value: selectedItem.scheduled_at ? new Date(selectedItem.scheduled_at).toLocaleString('en-US', { timeZone: getTimezone() }) : '—', valueStyle: { textTransform: 'none' } },
        { label: 'Status', value: selectedItem.status || 'scheduled' },
      ]} />
    );
  };

  return (
    <View style={adminStyles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar)}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <AdminHeader navigation={navigation} title="Recruitment" subtitle="Manage hiring pipeline" onAdd={tab === 'jobs' ? openCreate : undefined} />
        <View style={adminStyles.body}>
          <AdminStatRow stats={[
            { val: jobs.length, label: 'Jobs', color: '#2563EB', bg: '#DBEAFE' },
            { val: candidates.length, label: 'Candidates', color: '#4F46E5', bg: '#EEF2FF' },
            { val: interviews.length, label: 'Interviews', color: '#10B981', bg: '#DCFCE7' },
            { val: candidates.filter((c) => c.status === 'hired').length, label: 'Hired', color: '#D97706', bg: '#FEF3C7' },
          ]} />
          <AdminTabPills tabs={TABS} active={tab} onChange={(t) => { setTab(t); setSearch(''); closeModal(); }} />
          <AdminSearchBar value={search} onChangeText={setSearch} placeholder={`Search ${tab}...`} />
          {loading ? (
            <View>{[1, 2, 3].map((i) => <View key={i} style={adminStyles.skeleton} />)}</View>
          ) : (
            <>
              {tab === 'jobs' && (filteredJobs.length === 0 ? (
                <EmptyState icon="📋" title="No jobs" message="Post your first job opening." />
              ) : filteredJobs.map((job) => (
                <AdminListCard key={job.id} onPress={() => openDetail(job)}>
                  <View style={{ flex: 1 }}>
                    <Text style={adminStyles.listTitle}>{job.title}</Text>
                    <Text style={adminStyles.listSub}>
                      {typeof job.department === 'object' ? job.department?.name : job.department || 'General'} • {job.positions_count || 1} position{(job.positions_count || 1) > 1 ? 's' : ''}
                    </Text>
                    <View style={{ marginTop: 6 }}>
                      <Badge status={job.status === 'open' ? 'active' : job.status === 'closed' ? 'inactive' : 'pending'} label={job.status || 'open'} size="sm" />
                    </View>
                  </View>
                </AdminListCard>
              )))}
              {tab === 'candidates' && (filteredCandidates.length === 0 ? (
                <EmptyState icon="👤" title="No candidates" message="Candidates will appear here." />
              ) : filteredCandidates.map((c) => (
                <AdminListCard key={c.id} onPress={() => openDetail(c)}>
                  <Avatar firstName={c.name?.split(' ')[0]} lastName={c.name?.split(' ').slice(1).join(' ')} size={44} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={adminStyles.listTitle}>{c.name || `Candidate-${c.id}`}</Text>
                    <Text style={adminStyles.listSub}>{c.email || 'N/A'} • {c.job_title || 'N/A'}</Text>
                    <View style={{ marginTop: 6 }}>
                      <Badge status={c.status === 'hired' ? 'active' : c.status === 'rejected' ? 'rejected' : 'pending'} label={c.status || 'submitted'} size="sm" />
                    </View>
                  </View>
                </AdminListCard>
              )))}
              {tab === 'interviews' && (filteredInterviews.length === 0 ? (
                <EmptyState icon="🎙️" title="No interviews" message="Schedule interviews for candidates." />
              ) : filteredInterviews.map((int) => (
                <AdminListCard key={int.id} onPress={() => openDetail(int)}>
                  <View style={{ flex: 1 }}>
                    <Text style={adminStyles.listTitle}>{int.candidate_name || `Interview-${int.id}`}</Text>
                    <Text style={adminStyles.listSub}>{int.job_title || 'N/A'} • {int.interviewer || 'TBD'}</Text>
                    {int.scheduled_at ? <Text style={adminStyles.listSub}>{new Date(int.scheduled_at).toLocaleString('en-US', { timeZone: getTimezone() })}</Text> : null}
                    <View style={{ marginTop: 6 }}>
                      <Badge status={int.status === 'completed' ? 'completed' : 'pending'} label={int.status || 'scheduled'} size="sm" />
                    </View>
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
        detailTitle={detailTitle}
        createTitle="Post New Job"
        editTitle="Edit Job"
        onClose={closeModal}
        onCancelEdit={() => setIsEditing(false)}
        isEditing={isEditing}
        isCreating={isCreating}
        onStartEdit={tab === 'jobs' ? () => setIsEditing(true) : undefined}
        onSave={tab === 'jobs' ? handleSave : undefined}
        onDelete={tab === 'jobs' ? handleDelete : undefined}
        saving={saving}
        saveLabel={isCreating ? 'Post Job' : 'Update Job'}
        showEdit={tab === 'jobs'}
        showDelete={tab === 'jobs'}
        footerContent={tab === 'candidates' && selectedItem?.status === 'submitted' && !isEditing ? (
          <TouchableOpacity style={localStyles.actionBtn} onPress={handleSchedule}>
            <Text style={localStyles.actionBtnText}>Schedule Interview</Text>
          </TouchableOpacity>
        ) : null}
        viewContent={renderViewContent()}
      >
        <AdminFieldLabel>Job Title *</AdminFieldLabel>
        <AdminInput value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="Job title" />
        <AdminFieldLabel>Department</AdminFieldLabel>
        <AdminInput value={form.department} onChangeText={(v) => setForm((f) => ({ ...f, department: v }))} placeholder="Department" />
        <AdminFieldLabel>Positions</AdminFieldLabel>
        <AdminInput value={form.positions_count} onChangeText={(v) => setForm((f) => ({ ...f, positions_count: v }))} placeholder="Number of positions" keyboardType="number-pad" />
        <AdminFieldLabel>Description</AdminFieldLabel>
        <AdminInput value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="Job description" multiline style={{ height: 80, textAlignVertical: 'top' }} />
      </AdminCrudSheet>
    </View>
  );
};


export default RecruitmentScreen;
