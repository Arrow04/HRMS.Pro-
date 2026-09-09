import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import api from '../services/api';
import { spacing, radii, shadows } from '../theme';

export default function HomeScreen({ navigation }) {
  const { colors } = useTheme();
  const themed = useThemedStyles((c, d) => ({
    container: { flex: 1, backgroundColor: colors.bg },
    header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
    title: { fontSize: 28, fontWeight: '800', color: colors.text },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
    section: { marginTop: spacing.lg, paddingHorizontal: spacing.lg },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.xl,
      padding: spacing.lg,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.card,
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
    cardSub: { fontSize: 13, color: colors.textSecondary },
    ctaRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.md },
    ctaBtn: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.primary,
      alignItems: 'center',
    },
    ctaBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
    ctaBtnSecondary: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    ctaBtnSecondaryText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  }));

  const [loading, setLoading] = React.useState(true);
  const [featuredJobs, setFeaturedJobs] = React.useState([]);
  const [companies, setCompanies] = React.useState([]);

  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [jobsRes, companiesRes] = await Promise.all([
        api.get('/public/jobs?limit=5&is_featured=true'),
        api.get('/public/companies?limit=5'),
      ]);
      setFeaturedJobs(jobsRes.data?.jobs || []);
      setCompanies(companiesRes.data?.companies || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[themed.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={themed.container}>
      <FlatList
        data={[]}
        ListHeaderComponent={
          <>
            <View style={themed.header}>
              <Text style={themed.title}>Find your dream job</Text>
              <Text style={themed.subtitle}>Explore opportunities from top companies</Text>
            </View>

            <View style={themed.ctaRow}>
              <TouchableOpacity style={themed.ctaBtn} onPress={() => navigation.navigate('Jobs')}>
                <Text style={themed.ctaBtnText}>Browse Jobs</Text>
              </TouchableOpacity>
              <TouchableOpacity style={themed.ctaBtnSecondary} onPress={() => navigation.navigate('Companies')}>
                <Text style={themed.ctaBtnSecondaryText}>Companies</Text>
              </TouchableOpacity>
            </View>

            <View style={themed.section}>
              <Text style={themed.sectionTitle}>Featured Jobs</Text>
              {featuredJobs.map((job) => (
                <TouchableOpacity
                  key={job.id}
                  style={themed.card}
                  onPress={() => navigation.navigate('JobDetail', { jobId: job.id })}
                >
                  <Text style={themed.cardTitle}>{job.title}</Text>
                  <Text style={themed.cardSub}>
                    {job.company?.name} • {job.city} • {job.employment_type?.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
              {featuredJobs.length === 0 && (
                <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.lg }}>
                  No featured jobs yet
                </Text>
              )}
            </View>

            <View style={themed.section}>
              <Text style={themed.sectionTitle}>Top Companies</Text>
              {companies.map((company) => (
                <TouchableOpacity
                  key={company.id}
                  style={themed.card}
                  onPress={() => navigation.navigate('CompanyDetail', { companyId: company.id })}
                >
                  <Text style={themed.cardTitle}>{company.name}</Text>
                  <Text style={themed.cardSub}>
                    {company.industry} • {company.city} • {company.job_count || 0} jobs
                  </Text>
                </TouchableOpacity>
              ))}
              {companies.length === 0 && (
                <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.lg }}>
                  No companies registered yet
                </Text>
              )}
            </View>
          </>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({});