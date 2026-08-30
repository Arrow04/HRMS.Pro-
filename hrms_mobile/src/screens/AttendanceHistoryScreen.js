import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { getTimezone, currentMonthISO, dateToMonthISO } from '../utils/timezone';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { Badge, EmptyState } from '../components/UI';
import {
  useAdminStyles,
  AdminHeader,
  AdminStatRow,
  AdminMonthRow,
  AdminSearchBar,
  AdminListCard,
  AdminCrudSheet,
  AdminDetailRows,
  scrollViewTopBarProps,
  useScrollTopBar } from '../components/AdminScreenKit';

const getMyEmployeeId = (user) => user?.employeeId ?? user?.employee_id ?? null;

const normRecord = (r) => ({
  ...r,
  checkIn: r.checkIn || r.check_in,
  checkOut: r.checkOut || r.check_out,
  workHours: r.workHours ?? r.work_hours,
  scheduledHours: r.scheduledHours ?? r.scheduled_hours,
  overtimeHours: r.overtimeHours ?? r.overtime_hours,
  breakHours: r.breakHours ?? r.break_hours,
  isLate: r.isLate ?? r.is_late,
  lateMinutes: r.lateMinutes ?? r.late_minutes,
  isEarlyDeparture: r.isEarlyDeparture ?? r.is_early_departure,
  earlyDepartureMinutes: r.earlyDepartureMinutes ?? r.early_departure_minutes,
  checkInLocation: r.checkInLocationName || r.check_in_location_name || r.location,
  checkOutLocation: r.checkOutLocationName || r.check_out_location_name,
  isWorkFromHome: r.isWorkFromHome ?? r.is_work_from_home,
  isManualEntry: r.isManualEntry ?? r.is_manual_entry,
  isOnLeave: r.isOnLeave ?? r.is_on_leave,
  isHoliday: r.isHoliday ?? r.is_holiday,
  selfieVerified: r.selfieVerified ?? r.selfie_verified,
  notes: r.notes || r.comments,
  reason: r.reason });

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: getTimezone() });
};

const formatShortDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: getTimezone() });
};

const formatTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: getTimezone() });
};

const formatHours = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isNaN(n) ? '—' : `${n.toFixed(1)}h`;
};

const statusBadgeStatus = (status) => {
  if (status === 'present') return 'present';
  if (status === 'late') return 'late';
  if (status === 'absent') return 'absent';
  if (status === 'on_leave' || status === 'leave') return 'on_leave';
  return 'pending';
};

const statusColor = (status) => {
  if (status === 'present') return '#16A34A';
  if (status === 'late') return '#D97706';
  if (status === 'absent') return '#DC2626';
  if (status === 'on_leave' || status === 'leave') return '#2563EB';
  return '#64748B';
};

const detailRows = (item) => {
  if (!item) return [];
  const rows = [
    { label: 'Date', value: formatDate(item.date), valueStyle: { textTransform: 'none' } },
    { label: 'Status', value: (item.status || 'N/A').replace(/_/g, ' '), valueStyle: { color: statusColor(item.status), textTransform: 'capitalize' } },
    { label: 'Check in', value: formatTime(item.checkIn), valueStyle: { textTransform: 'none' } },
    { label: 'Check out', value: formatTime(item.checkOut), valueStyle: { textTransform: 'none' } },
    { label: 'Work hours', value: formatHours(item.workHours) },
    { label: 'Scheduled', value: formatHours(item.scheduledHours) },
    { label: 'Overtime', value: formatHours(item.overtimeHours) },
    { label: 'Break', value: formatHours(item.breakHours) },
  ];
  if (item.isLate) rows.push({ label: 'Late by', value: item.lateMinutes ? `${item.lateMinutes} min` : 'Yes' });
  if (item.isEarlyDeparture) rows.push({ label: 'Early departure', value: item.earlyDepartureMinutes ? `${item.earlyDepartureMinutes} min` : 'Yes' });
  if (item.clockOutViolation || (item.checkIn && !item.checkOut)) rows.push({ label: 'Violation', value: 'Clock-out missing', valueStyle: { color: '#DC2626' } });
  if (item.checkInLocation) rows.push({ label: 'Check-in location', value: item.checkInLocation, valueStyle: { textTransform: 'none' }, numberOfLines: 2 });
  if (item.checkOutLocation) rows.push({ label: 'Check-out location', value: item.checkOutLocation, valueStyle: { textTransform: 'none' }, numberOfLines: 2 });
  if (item.isWorkFromHome) rows.push({ label: 'Work mode', value: 'Work from home' });
  if (item.isManualEntry) rows.push({ label: 'Entry type', value: 'Manual entry' });
  if (item.isOnLeave) rows.push({ label: 'On leave', value: 'Yes' });
  if (item.isHoliday) rows.push({ label: 'Holiday', value: 'Yes' });
  if (item.selfieVerified != null) rows.push({ label: 'Selfie verified', value: item.selfieVerified ? 'Yes' : 'No' });
  if (item.notes) rows.push({ label: 'Notes', value: item.notes, valueStyle: { textTransform: 'none' }, numberOfLines: 4 });
  if (item.reason) rows.push({ label: 'Reason', value: item.reason, valueStyle: { textTransform: 'none' }, numberOfLines: 3 });
  return rows;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const dayColor = (status) => {
  if (status === 'present') return '#10B981';
  if (status === 'late') return '#D97706';
  if (status === 'absent') return '#DC2626';
  if (status === 'on_leave' || status === 'leave') return '#2563EB';
  return null;
};

const AttendanceCalendar = ({ records, selectedMonth, selectedDate, colors, onSelectDate }) => {
  const [year, month] = selectedMonth.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const recordMap = useMemo(() => {
    const map = {};
    records.forEach((r) => {
      if (r.date) {
        const day = Number(r.date.slice(8, 10));
        map[day] = r.status;
      }
    });
    return map;
  }, [records]);

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {WEEKDAYS.map((wd) => (
          <View key={wd} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase' }}>{wd}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((day, i) => {
          if (day === null) return <View key={`e${i}`} style={{ width: '14.28%', aspectRatio: 1 }} />;
          const status = recordMap[day];
          const bg = dayColor(status);
          const isToday = isCurrentMonth && day === today.getDate();
          const isSelected = selectedDate === `${selectedMonth}-${String(day).padStart(2, '0')}`;
          return (
            <TouchableOpacity
              key={day}
              activeOpacity={0.7}
              onPress={() => onSelectDate(`${selectedMonth}-${String(day).padStart(2, '0')}`)}
              style={{
                width: '14.28%',
                aspectRatio: 1,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: isSelected ? colors.primary : bg ? bg + '22' : 'transparent',
                borderWidth: isToday ? 2 : isSelected ? 0 : 0,
                borderColor: isToday ? colors.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text style={{
                  fontSize: 12,
                  fontWeight: isToday || isSelected ? '800' : '500',
                  color: isSelected ? '#FFF' : bg || colors.textSecondary,
                }}>{day}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, justifyContent: 'center' }}>
        {[{ s: 'present', l: 'Present', c: '#10B981' }, { s: 'late', l: 'Late', c: '#D97706' }, { s: 'absent', l: 'Absent', c: '#DC2626' }, { s: 'leave', l: 'Leave', c: '#2563EB' }].map((item) => (
          <View key={item.s} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: item.c }} />
            <Text style={{ fontSize: 10, color: colors.textTertiary }}>{item.l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const AttendanceHistoryScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const adminStyles = useAdminStyles();
  const { user } = useAuth();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthISO());
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const scrollTopBar = useScrollTopBar();

  const myEmployeeId = getMyEmployeeId(user);
  const isModalOpen = !!selectedItem;

  const fetchData = useCallback(async () => {
    if (!myEmployeeId) {
      setRecords([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const startDate = `${selectedMonth}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
      const res = await api.get('/attendance', {
        params: { employeeId: myEmployeeId, startDate, endDate } });
      const raw = res.data?.data || res.data || [];
      setRecords(Array.isArray(raw) ? raw.map(normRecord) : []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedMonth, myEmployeeId]);

  useEffect(() => { setLoading(true); setSelectedDate(null); fetchData(); }, [fetchData]);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

  const filtered = records.filter((r) => {
    const matchSearch = !search || (r.date || '').includes(search) || (r.status || '').toLowerCase().includes(search.toLowerCase());
    const matchDate = !selectedDate || (r.date || '').slice(0, 10) === selectedDate;
    return matchSearch && matchDate;
  });

  const summary = {
    present: records.filter((r) => r.status === 'present').length,
    absent: records.filter((r) => r.status === 'absent').length,
    late: records.filter((r) => r.status === 'late').length,
    leave: records.filter((r) => r.status === 'on_leave' || r.status === 'leave' || r.isOnLeave).length };

  return (
    <View style={adminStyles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar)}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <AdminHeader
          navigation={navigation}
          title="My Attendance History"
          subtitle={user?.fullName || user?.email || 'Your records only'}
          showBack={navigation?.canGoBack?.() ?? false}
        />

        <View style={adminStyles.body}>
          {!myEmployeeId ? (
            <EmptyState icon="👤" title="No employee profile" message="Your account is not linked to an employee record." />
          ) : (
            <>
              <AdminMonthRow value={selectedMonth} onChange={setSelectedMonth} />

              <TouchableOpacity
                onPress={() => setShowCalendar((v) => !v)}
                activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.primarySurface, borderWidth: 1, borderColor: colors.primary + '30' }}
              >
                <Ionicons name={showCalendar ? 'calendar' : 'calendar-outline'} size={16} color={colors.primary} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>{showCalendar ? 'Hide Calendar' : 'Show Calendar'}</Text>
                <Ionicons name={showCalendar ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
              </TouchableOpacity>

              {showCalendar && (
                <AttendanceCalendar
                  records={records}
                  selectedMonth={selectedMonth}
                  selectedDate={selectedDate}
                  colors={colors}
                  onSelectDate={(date) => setSelectedDate((prev) => prev === date ? null : date)}
                />
              )}

              {selectedDate && (
                <TouchableOpacity onPress={() => setSelectedDate(null)} style={{ alignSelf: 'center', marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#FEE2E2' }}>
                  <Ionicons name="filter" size={12} color="#DC2626" />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#DC2626' }}>
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                  <Ionicons name="close-circle" size={14} color="#DC2626" />
                </TouchableOpacity>
              )}

              <AdminStatRow stats={[
                { val: summary.present, label: 'Present', color: '#10B981', bg: '#DCFCE7' },
                { val: summary.absent, label: 'Absent', color: '#DC2626', bg: '#FEE2E2' },
                { val: summary.late, label: 'Late', color: '#D97706', bg: '#FEF3C7' },
                { val: summary.leave, label: 'Leave', color: '#2563EB', bg: '#DBEAFE' },
              ]} />

              <AdminSearchBar value={search} onChangeText={setSearch} placeholder="Search by date or status..." />

              {loading ? (
                <View>{[1, 2, 3, 4, 5].map((i) => <View key={i} style={adminStyles.skeleton} />)}</View>
              ) : filtered.length === 0 ? (
                <EmptyState icon="📅" title="No records found" message="No attendance records for this month." />
              ) : (
                filtered.map((item, i) => {
                  const d = item.date ? new Date(item.date) : null;
                  return (
                    <AdminListCard key={`${item.date}-${item.id || i}`} onPress={() => setSelectedItem(item)}>
                      <View style={{
                        width: 48,
                        height: 52,
                        borderRadius: 14,
                        backgroundColor: colors.primarySurface,
                        alignItems: 'center',
                        justifyContent: 'center' }}
                      >
                        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.primary }}>
                          {d ? d.getDate() : '—'}
                        </Text>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' }}>
                          {d ? d.toLocaleDateString('en-US', { month: 'short' }) : ''}
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={adminStyles.listTitle}>{formatShortDate(item.date)}</Text>
                        <Text style={adminStyles.listSub}>
                          {formatTime(item.checkIn)} → {formatTime(item.checkOut)}
                        </Text>
                        <Text style={adminStyles.listSub}>
                          {item.workHours != null ? `${Number(item.workHours).toFixed(1)} hours worked` : 'No hours logged'}
                        </Text>
                      </View>
                      <Badge
                        status={statusBadgeStatus(item.status)}
                        label={(item.status || 'N/A').replace(/_/g, ' ')}
                        size="sm"
                        style={{ alignSelf: 'center' }}
                      />
                    </AdminListCard>
                  );
                })
              )}
            </>
          )}
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      <AdminCrudSheet
        visible={isModalOpen}
        detailTitle="Attendance Detail"
        onClose={() => setSelectedItem(null)}
        showEdit={false}
        showDelete={false}
        viewContent={selectedItem && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 }}>
              <View style={{
                width: 48, height: 48, borderRadius: 14,
                backgroundColor: colors.primarySurface,
                alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="time-outline" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={adminStyles.listTitle}>{formatShortDate(selectedItem.date)}</Text>
                <Text style={adminStyles.listSub}>
                  {formatTime(selectedItem.checkIn)} → {formatTime(selectedItem.checkOut)}
                </Text>
              </View>
              <Badge
                status={statusBadgeStatus(selectedItem.status)}
                label={(selectedItem.status || 'N/A').replace(/_/g, ' ')}
                size="sm"
              />
            </View>
            <AdminDetailRows rows={detailRows(selectedItem)} />
          </>
        )}
      />
    </View>
  );
};

export default AttendanceHistoryScreen;
