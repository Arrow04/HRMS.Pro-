import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { Avatar, EmptyState } from '../components/UI';
import { useApiData, normalizeResponse } from '../hooks/useApiData';
import {
  useAdminStyles,
  AdminHeader,
  AdminStatRow,
  AdminSearchBar,
  AdminListCard } from '../components/AdminScreenKit';

const EmployeeListScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const adminStyles = useAdminStyles();
  const [search, setSearch] = useState('');

  const { data: employees, loading, refreshing, refresh } = useApiData(
    async () => {
      const res = await api.get('/employees', { params: { status: 'active' } });
      return normalizeResponse(res);
    },
    [],
  );

  const empName = (e) => e.fullName || `${e.firstName || e.first_name || ''} ${e.lastName || e.last_name || ''}`.trim() || `EMP-${e.id}`;

  const filtered = (employees || []).filter((e) => {
    const q = search.toLowerCase();
    return !q
      || empName(e).toLowerCase().includes(q)
      || (e.email || '').toLowerCase().includes(q)
      || (e.employeeCode || '').toLowerCase().includes(q);
  });

  const withDept = (employees || []).filter((e) => e.department || e.departmentId).length;
  const withPhone = (employees || []).filter((e) => e.phone).length;

  const renderItem = useCallback(({ item }) => (
    <View style={{ paddingHorizontal: 16 }}>
    <AdminListCard onPress={() => navigation.navigate('EmployeeDetail', { employee: item })}>
      <Avatar firstName={item.firstName || item.first_name} lastName={item.lastName || item.last_name} size={42} status="online" />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={adminStyles.listTitle}>{empName(item)}</Text>
        <Text style={adminStyles.listSub} numberOfLines={1}>
          {[
            item.designation && (typeof item.designation === 'object' ? item.designation?.name : item.designation),
            item.department && (typeof item.department === 'object' ? item.department?.name : item.department),
          ].filter(Boolean).join(' • ') || 'No department'}
        </Text>
        {item.phone ? <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600', marginTop: 2 }}>{item.phone}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </AdminListCard>
    </View>
  ), [navigation]);

  const ListHeader = () => (
    <>
      <AdminHeader
        navigation={navigation}
        title="Employees"
        subtitle={`${filtered.length} active team members`}
      />
      <View style={adminStyles.body}>
        <AdminStatRow stats={[
          { val: employees?.length || 0, label: 'Total', color: '#2563EB', bg: '#DBEAFE' },
          { val: filtered.length, label: 'Showing', color: '#10B981', bg: '#DCFCE7' },
          { val: withDept, label: 'With Dept', color: '#4F46E5', bg: '#EEF2FF' },
          { val: withPhone, label: 'With Phone', color: '#D97706', bg: '#FEF3C7' },
        ]} />
        <AdminSearchBar value={search} onChangeText={setSearch} placeholder="Search employees..." />
      </View>
    </>
  );

  const ListEmpty = () => {
    if (loading) {
      return (
        <View style={{ paddingHorizontal: 20 }}>
          {[1, 2, 3, 4, 5].map((i) => <View key={i} style={adminStyles.skeleton} />)}
        </View>
      );
    }
    return <EmptyState icon="👥" title="No employees" message="No employees found." />;
  };

  return (
    <FlatList
      style={adminStyles.container}
      data={filtered}
      renderItem={renderItem}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={ListEmpty}
      contentContainerStyle={filtered.length === 0 ? { flex: 1 } : { paddingBottom: 32 }}
      refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={refresh} />}
      showsVerticalScrollIndicator={false}
    />
  );
};

export default EmployeeListScreen;
