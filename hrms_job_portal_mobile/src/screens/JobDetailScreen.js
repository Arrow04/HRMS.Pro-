import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Image, Alert } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import api from '../services/api';
import { spacing, radii, shadows } from '../theme';

export default function JobDetailScreen({ route, navigation }) {
  const { jobId } = route.params;
  const { colors } = useTheme();
  const themed = useThemedStyles((c, d) => ({
    container: { flex: 1, backgroundColor: colors.bg },
    scroll: { flex: 1 },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    backBtn: {
      marginHorizontal: spacing.lg,
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
    title: { fontSize: 22, fontWeight: '800', color: colors.text },
    company: { fontSize: 15, color: colors.textSecondary, marginTop: 4 },
    meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
    metaPill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radii.full,
      backgroundColor: colors.primarySurface,
      borderWidth: 1,
      borderColor: colors.primary + '33',
    },
    metaText: { fontSize: 12, fontWeight: '600', color: colors.primary },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
    body: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    applyBtn: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.xxl,
      paddingVertical: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.primary,
      alignItems: 'center',
    },
    applyText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  }));

  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/public/jobs/${jobId}`);
        setJob(res.data);
      } catch (e) {
        Alert.alert('Error', 'Failed to load job details');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [jobId]);

  if (loading) {
    return (
      <View style={[themed.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={[themed.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textSecondary }}>Job not found</Text>
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
          <Text style={themed.title}>{job.title}</Text>
          <Text style={themed.company}>{job.company?.name} • {job.company?.city}</Text>
          <View style={themed.meta}>
            {job.employment_type && (
              <View style={themed.metaPill}>
                <Text style={themed.metaText}>{job.employment_type?.replace('_', ' ')}</Text>
              </View>
            )}
            {job.work_mode && (
              <View style={themed.metaPill}>
                <Text style={themed.metaText}>{job.work_mode?.replace('_', ' ')}</Text>
              </View>
            )}
            {job.is_remote && (
              <View style={themed.metaPill}>
                <Text style={themed.metaText}>Remote</Text>
              </View>
            )}
            {job.experience_min != null && (
              <View style={themed.metaPill}>
                <Text style={themed.metaText}>{job.experience_min}+ yrs</Text>
              </View>
            )}
          </View>
        </View>

        {job.description && (
          <View style={themed.card}>
            <Text style={themed.sectionTitle}>Description</Text>
            <Text style={themed.body}>{job.description}</Text>
          </View>
        )}

        {job.skills_required?.length > 0 && (
          <View style={themed.card}>
            <Text style={themed.sectionTitle}>Skills</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {job.skills_required.map((skill, idx) => (
                <View key={idx} style={themed.metaPill}>
                  <Text style={themed.metaText}>{skill}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={themed.applyBtn}
          onPress={() => Alert.alert('Apply', 'Application flow coming soon!')}
        >
          <Text style={themed.applyText}>Apply Now</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}