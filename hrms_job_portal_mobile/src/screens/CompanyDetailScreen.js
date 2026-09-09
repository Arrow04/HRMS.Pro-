import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Image, Alert, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import api from '../services/api';
import { spacing, radii, shadows } from '../theme';

export default function CompanyDetailScreen({ route, navigation }) {
  const { companyId } = route.params;
  const { colors } = useTheme();
  const themed = useThemedStyles((c, d) => ({
    container: { flex: 1, backgroundColor: colors.bg },
    scroll: { flex: 1 },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    backBtn: {
      marginTop: spacing.lg,
      marginBottom: spacing.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignSelf: 'flex-start',
    },
    backText: { color: colors.text, fontWeight: '600' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.xl,
      padding: spacing.lg,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.card,
    },
    name: { fontSize: 22, fontWeight: '800', color: colors.text },
    sub: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
    body: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    jobRow: {
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    jobTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
    jobSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  }));

  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/public/companies/${companyId}`);
        setCompany(res.data);
      } catch (e) {
        Alert.alert('Error', 'Failed to load company');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [companyId]);

  if (loading) {
    return (
      <View style={[themed.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!company) {
    return (
      <View style={[themed.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textSecondary }}>Company not found</Text>
      </View>
    );
  }

  return (
    <View style={themed.container}>
      <ScrollView style={themed.scroll} contentContainerStyle={themed.content}>
        <TouchableOpacity style={themed.backBtn} onPress={() => navigation.goBack()}>
          <Text style={themed.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={themed.card}>
          <Text style={themed.name}>{company.name}</Text>
          <Text style={themed.sub}>
            {company.industry} • {company.city} • {company.is_verified ? '✓ Verified' : 'Unverified'}
          </Text>
          {company.description && <Text style={[themed.body, { marginTop: spacing.md }]}>{company.description}</Text>}
        </View>

        {company.jobs?.length > 0 && (
          <View style={themed.card}>
            <Text style={themed.sectionTitle}>Open Positions</Text>
            {company.jobs.map((job) => (
              <TouchableOpacity
                key={job.id}
                style={themed.jobRow}
                onPress={() => navigation.navigate('JobDetail', { jobId: job.id })}
              >
                <Text style={themed.jobTitle}>{job.title}</Text>
                <Text style={themed.jobSub}>
                  {job.employment_type?.replace('_', ' ')} • {job.location}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}