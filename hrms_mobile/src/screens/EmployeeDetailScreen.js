import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { radii, spacing, shadows } from '../theme';
import { Card, Avatar, Badge, GradientButton } from '../components/UI';

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { backgroundColor: colors.primary, paddingTop: 56, paddingBottom: spacing.xxl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  heroOrb1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.07)', top: -40, right: -40 },
  heroOrb2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(167,139,250,0.12)', bottom: -10, left: 30 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  editToggle: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  profileSection: { alignItems: 'center', paddingHorizontal: spacing.xl, zIndex: 1, marginTop: 8 },
  profileName: { fontSize: 22, fontWeight: '800', color: '#FFF', marginTop: spacing.md },
  profileCode: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 2, marginBottom: 8 },
  body: { padding: spacing.xl },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
  fieldLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500', width: 100 },
  fieldValue: { fontSize: 13, color: colors.text, fontWeight: '600', flex: 1, textAlign: 'right' },
  fieldInput: { flex: 1, textAlign: 'right', fontSize: 13, color: colors.text, fontWeight: '600', backgroundColor: colors.surfaceSecondary, borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 10 } });
const EmployeeDetailScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { employee } = route.params || {};
  const [data, setData] = useState(employee || {});
  const [editData, setEditData] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try { const res = await api.get(`/employees/${employee.id}`); setData(res.data); setEditData(res.data); }
    catch (e) {
      // Employee detail fetch failed
    }
    finally { setRefreshing(false); }
  };

  useEffect(() => { setEditData(data); }, [data]);

  const updateField = (key, val) => setEditData(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/employees/${employee.id}`, {
        firstName: editData.firstName,
        lastName: editData.lastName,
        email: editData.email,
        phone: editData.phone,
        gender: editData.gender,
        dateOfBirth: editData.dateOfBirth,
        bloodGroup: editData.bloodGroup,
        currentAddress: editData.currentAddress || editData.address,
        designation: editData.designation,
        employmentType: editData.employmentType });
      setData(editData);
      setIsEditing(false);
      Alert.alert('Success', 'Employee updated.');
    } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
    finally { setSaving(false); }
  };

  const Field = ({ label, fieldKey, placeholder }) => (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {isEditing ? (
        <TextInput style={styles.fieldInput} value={editData[fieldKey] || ''} onChangeText={v => updateField(fieldKey, v)}
          placeholder={placeholder || label} placeholderTextColor={colors.textTertiary} />
      ) : (
        <Text style={styles.fieldValue}>{data[fieldKey] || '—'}</Text>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container} refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={fetchData} />} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.heroOrb1} /><View style={styles.heroOrb2} />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => { setIsEditing(!isEditing); if (isEditing) setEditData(data); }} style={styles.editToggle}>
            <Ionicons name={isEditing ? 'close' : 'create-outline'} size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.profileSection}>
          <Avatar firstName={data.firstName} lastName={data.lastName} size={80} premium />
          <Text style={styles.profileName}>{data.firstName} {data.lastName}</Text>
          <Text style={styles.profileCode}>{data.employeeCode || ''}</Text>
          <Badge status={data.status || 'active'} size="md" />
        </View>
      </View>
      <View style={styles.body}>
        <Card>
          <Text style={styles.sectionTitle}>👤 Personal Information</Text>
          <Field label="First Name" fieldKey="firstName" />
          <Field label="Last Name" fieldKey="lastName" />
          <Field label="Email" fieldKey="email" />
          <Field label="Phone" fieldKey="phone" />
          <Field label="Gender" fieldKey="gender" />
          <Field label="Date of Birth" fieldKey="dateOfBirth" />
          <Field label="Blood Group" fieldKey="bloodGroup" />
          <Field label="Address" fieldKey="currentAddress" />
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>💼 Work Information</Text>
          <Field label="Designation" fieldKey="designation" />
          <Field label="Employment Type" fieldKey="employmentType" />
          <Field label="Department" fieldKey="departmentName" />
          <Field label="Join Date" fieldKey="joinDate" />
        </Card>
        {isEditing && (
          <View style={{ marginTop: 16 }}>
            <GradientButton title="Save Changes" onPress={handleSave} loading={saving} />
          </View>
        )}
        <View style={{ height: 40 }} />
      </View>
    </ScrollView>
  );
};


export default EmployeeDetailScreen;
