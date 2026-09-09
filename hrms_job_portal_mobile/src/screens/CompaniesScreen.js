import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import api from '../services/api';
import { spacing, radii, shadows } from '../theme';

export default function CompaniesScreen({ navigation }) {
  const { colors } = useTheme();
  const themed = useThemedStyles((c, d) => ({
    container: { flex: 1, backgroundColor: colors.bg },
    header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
    title: { fontSize: 24, fontWeight: '800', color: colors.text },
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
    name: { fontSize: 16, fontWeight: '700', color: colors.text },
    sub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  }));

  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/public/companies?limit=50');
        setCompanies(res.data?.companies || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <View style={[themed.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={themed.container}>
      <View style={themed.header}>
        <Text style={themed.title}>Companies</Text>
      </View>
      <FlatList
        data={companies}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 80 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={themed.card}
            onPress={() => navigation.navigate('CompanyDetail', { companyId: item.id })}
          >
            <Text style={themed.name}>{item.name}</Text>
            <Text style={themed.sub}>
              {item.industry} • {item.city} • {item.job_count || 0} jobs
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: spacing.xxl }}>
            No companies registered yet
          </Text>
        }
      />
    </View>
  );
}