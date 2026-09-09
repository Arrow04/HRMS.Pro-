import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import api from '../services/api';
import { spacing, radii, shadows } from '../theme';

export default function JobsScreen({ navigation }) {
  const { colors } = useTheme();
  const themed = useThemedStyles((c, d) => ({
    container: { flex: 1, backgroundColor: colors.bg },
    header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
    title: { fontSize: 24, fontWeight: '800', color: colors.text },
    searchBox: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.xl,
      padding: spacing.lg,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.card,
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    cardSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
    cardTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    tag: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radii.full,
      backgroundColor: colors.primarySurface,
      borderWidth: 1,
      borderColor: colors.primary + '33',
    },
    tagText: { fontSize: 11, fontWeight: '600', color: colors.primary },
  }));

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState('');

  const loadJobs = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/public/jobs?search=${encodeURIComponent(search)}&limit=50`);
      setJobs(res.data?.jobs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadJobs, 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <View style={themed.container}>
      <View style={themed.header}>
        <Text style={themed.title}>Jobs</Text>
      </View>
      <TextInput
        style={themed.searchBox}
        placeholder="Search jobs..."
        placeholderTextColor={colors.textTertiary}
        value={search}
        onChangeText={setSearch}
      />
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 80 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={themed.card}
              onPress={() => navigation.navigate('JobDetail', { jobId: item.id })}
            >
              <Text style={themed.cardTitle}>{item.title}</Text>
              <Text style={themed.cardSub}>
                {item.company?.name} • {item.city} • {item.employment_type?.replace('_', ' ')}
              </Text>
              <View style={themed.cardTags}>
                {item.skills_required?.slice(0, 4).map((skill, idx) => (
                  <View key={idx} style={themed.tag}>
                    <Text style={themed.tagText}>{skill}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: spacing.xxl }}>
              No jobs found
            </Text>
          }
        />
      )}
    </View>
  );
}