import React, { useMemo } from 'react';
import { View, Text, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { radii, spacing, shadows } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';

const SCREEN_W = Dimensions.get('window').width - spacing.xl * 2;

const createStyles = (colors) => ({
  card: {
    backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg,
    marginBottom: spacing.md, ...shadows.sm,
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  actionText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  chart: { borderRadius: radii.md, marginLeft: -spacing.lg },
  chartBare: { borderRadius: radii.md, marginLeft: -6 },
  bareWrap: { width: '100%', overflow: 'visible', paddingBottom: 2 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4, paddingHorizontal: 4 },
  monthLabel: { flex: 1, fontSize: 11, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
  totalBadge: {
    backgroundColor: colors.primarySurface, borderRadius: radii.sm,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  totalValue: { fontSize: 14, fontWeight: '700', color: colors.primary },
  ringContainer: { alignItems: 'center' },
  ringBg: { position: 'absolute', borderWidth: 5 },
  ringProgress: { position: 'absolute' },
  ringCenter: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  ringValue: { fontSize: 16, fontWeight: '800' },
  ringLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 4, fontWeight: '500', textAlign: 'center' },
  statBox: {
    backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md,
    width: '48%', alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight,
  },
  statIcon: {
    width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.sm,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, fontWeight: '500', color: colors.textSecondary, textAlign: 'center', marginTop: 2 },
  statTrend: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  tabPillRow: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: 3, marginBottom: spacing.lg },
  tabPill: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radii.md },
  tabPillActive: { backgroundColor: colors.primary, ...shadows.sm },
  tabPillText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabPillTextActive: { color: '#FFF' },
});

function useCharts() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const chartConfig = useMemo(() => ({
    backgroundGradientFrom: colors.surface,
    backgroundGradientTo: colors.surface,
    color: (opacity = 1) => `rgba(79, 70, 229, ${opacity})`,
    labelColor: () => colors.textSecondary,
    strokeWidth: 2.5,
    barPercentage: 0.6,
    decimalPlaces: 0,
    propsForBackgroundLines: {
      strokeDasharray: '4 4',
      stroke: colors.borderLight,
      strokeWidth: 1,
    },
    propsForLabels: {
      fontSize: 10,
      fontWeight: '500',
    },
  }), [colors]);
  return { colors, styles, chartConfig };
}

export function TrendLine({ data, labels, title, subtitle, color, height = 180, width, bare, showXLabels = true }) {
  const { colors, styles, chartConfig } = useCharts();
  const chartData = {
    labels: showXLabels ? (labels || []) : (labels || []).map(() => ''),
    datasets: [{ data: data?.length ? data : [0], color: () => color || colors.primary, strokeWidth: 2.5 }],
  };
  const chartWidth = width || SCREEN_W - spacing.lg * 2;

  const chart = (
    <LineChart
      data={chartData}
      width={chartWidth}
      height={height}
      chartConfig={{
        ...chartConfig,
        color: () => color || colors.primary,
        labelColor: () => colors.textSecondary,
        propsForLabels: { fontSize: 11, fontWeight: '600' },
      }}
      bezier
      style={bare ? styles.chartBare : styles.chart}
      withInnerLines={false}
      withOuterLines={!bare}
      withVerticalLines={false}
      withHorizontalLabels={showXLabels}
      fromZero
    />
  );

  if (bare) {
    return (
      <View style={styles.bareWrap}>
        {chart}
        {!showXLabels && labels?.length > 0 && (
          <View style={[styles.monthRow, { width: chartWidth }]}>
            {labels.map((lbl, i) => (
              <Text key={`${lbl}-${i}`} style={styles.monthLabel} numberOfLines={1}>{lbl}</Text>
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {title && (
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>
      )}
      {chart}
    </View>
  );
}

export function AreaBar({ data, labels, title, subtitle, height = 200, width, bare, showXLabels = true }) {
  const { colors, styles, chartConfig } = useCharts();
  const chartData = {
    labels: showXLabels ? (labels || []) : (labels || []).map(() => ''),
    datasets: [{ data: data?.length ? data : [0] }],
  };
  const chartWidth = width || SCREEN_W - spacing.lg * 2;

  const chart = (
    <BarChart
      data={chartData}
      width={chartWidth}
      height={height}
      chartConfig={{
        ...chartConfig,
        color: () => colors.primary,
        labelColor: () => colors.textSecondary,
        barPercentage: 0.55,
        propsForLabels: { fontSize: 11, fontWeight: '600' },
      }}
      style={bare ? styles.chartBare : styles.chart}
      withInnerLines={false}
      withVerticalLines={false}
      withHorizontalLabels={showXLabels}
      fromZero
      showBarTops={false}
      yAxisLabel=""
      yAxisSuffix=""
    />
  );

  if (bare) {
    return (
      <View style={styles.bareWrap}>
        {chart}
        {!showXLabels && labels?.length > 0 && (
          <View style={[styles.monthRow, { width: chartWidth }]}>
            {labels.map((lbl, i) => (
              <Text key={`${lbl}-${i}`} style={styles.monthLabel} numberOfLines={1}>{lbl}</Text>
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {title && (
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>
      )}
      {chart}
    </View>
  );
}

export function DonutChart({ data, title, subtitle, height = 200 }) {
  const { colors, styles, chartConfig } = useCharts();
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + (d.population || d.value || 0), 0);

  const pieData = data.map((d, i) => ({
    name: d.name || d.label || '',
    population: d.population || d.value || 0,
    color: d.color || colors.chart[i % colors.chart.length],
    legendFontColor: colors.textSecondary,
    legendFontSize: 11,
  }));

  return (
    <View style={styles.card}>
      {title && (
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
          <View style={styles.totalBadge}>
            <Text style={styles.totalValue}>{total}</Text>
          </View>
        </View>
      )}
      <PieChart
        data={pieData}
        width={SCREEN_W - spacing.lg * 2}
        height={height}
        chartConfig={chartConfig}
        accessor="population"
        backgroundColor="transparent"
        paddingLeft="15"
        absolute={false}
        style={styles.chart}
      />
    </View>
  );
}

export function MultiLine({ datasets, labels, title, subtitle, height = 200 }) {
  const { colors, styles, chartConfig } = useCharts();
  const chartData = {
    labels: labels || [],
    datasets: datasets.map((ds, i) => ({
      data: ds.data || [0],
      color: () => ds.color || colors.chart[i],
      strokeWidth: 2,
    })),
    legend: datasets.map((d) => d.label || ''),
  };

  return (
    <View style={styles.card}>
      {title && (
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>
      )}
      <LineChart
        data={chartData}
        width={SCREEN_W - spacing.lg * 2}
        height={height}
        chartConfig={chartConfig}
        bezier
        style={styles.chart}
        withInnerLines={false}
        withVerticalLines={false}
        fromZero
      />
    </View>
  );
}

export function ProgressRing({ value, max, label, color, size = 80 }) {
  const { colors, styles } = useCharts();
  const pct = max > 0 ? (value / max) * 100 : 0;

  return (
    <View style={[styles.ringContainer, { width: size, height: size }]}>
      <View style={[styles.ringBg, { width: size, height: size, borderRadius: size / 2, borderColor: colors.borderLight }]} />
      <View style={[
        styles.ringProgress,
        {
          width: size, height: size, borderRadius: size / 2,
          borderColor: color || colors.primary,
          borderWidth: 5,
          borderTopColor: 'transparent',
          borderRightColor: pct < 75 ? 'transparent' : color || colors.primary,
          transform: [{ rotate: '-90deg' }],
        },
      ]} />
      <View style={styles.ringCenter}>
        <Text style={[styles.ringValue, { color: color || colors.primary }]}>{Math.round(pct)}%</Text>
      </View>
      {label && <Text style={styles.ringLabel}>{label}</Text>}
    </View>
  );
}

export function StatBox({ icon, value, label, color, trend, trendUp }) {
  const { colors, styles } = useCharts();
  const baseColor = color || colors.primary;
  return (
    <View style={styles.statBox}>
      <LinearGradient colors={[baseColor + '18', baseColor + '08']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statIcon}>
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </LinearGradient>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {trend !== undefined && (
        <Text style={[styles.statTrend, { color: trendUp ? colors.success : colors.danger }]}>
          {trendUp ? '↑' : '↓'} {trend}
        </Text>
      )}
    </View>
  );
}

export function ChartCard({ children, title, subtitle, action, onAction, style }) {
  const { styles } = useCharts();
  return (
    <View style={[styles.card, style]}>
      {(title || action) && (
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            {title && <Text style={styles.title}>{title}</Text>}
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
          {action && (
            <Text style={styles.actionText} onPress={onAction}>{action}</Text>
          )}
        </View>
      )}
      {children}
    </View>
  );
}

export function TabPill({ tabs, active, onChange }) {
  const { styles } = useCharts();
  return (
    <View style={styles.tabPillRow}>
      {tabs.map((t) => (
        <View key={t.key} style={[styles.tabPill, active === t.key && styles.tabPillActive]}
          onTouchEnd={() => onChange(t.key)}>
          <Text style={[styles.tabPillText, active === t.key && styles.tabPillTextActive]}>
            {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}
