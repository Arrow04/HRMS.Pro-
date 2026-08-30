import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useScrollTopBar } from '../hooks/useScrollTopBar';
import { scrollViewTopBarProps, bannerShellStyle } from '../components/AdminScreenKit';
import { TAB_BAR_CLEARANCE } from '../components/AppTabBar';
import { radii, spacing, shadows } from '../theme';

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { backgroundColor: colors.dark, paddingTop: spacing.xl, paddingBottom: spacing.xxl, borderRadius: 32, overflow: 'hidden' },
  heroOrb1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)', top: -40, right: -40 },
  heroOrb2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.08)', bottom: -10, left: 30 },
  heroContent: { paddingHorizontal: spacing.xl },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  body: { padding: spacing.xl, gap: 16 },
  section: {
    backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sectionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  sectionText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginTop: 4 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
});

const POLICY_SECTIONS = [
  {
    key: 'attendance',
    icon: 'finger-print-outline',
    color: '#3B82F6',
    title: 'Attendance Policy',
    text: 'All employees are expected to clock in and out daily using the HRMS mobile app or web portal. Standard working hours are Monday to Friday.',
    bullets: [
      'Check-in time: 09:00 AM. Check-out time: 06:00 PM.',
      'A grace period of 15 minutes is allowed after check-in time.',
      'Late arrivals beyond the grace period will be marked as "Late".',
      'Absence without prior approval will be marked as "Absent".',
      'Geo-fencing and selfie verification may be enabled by your administrator.',
      'Overtime must be pre-approved by your reporting manager.',
    ],
  },
  {
    key: 'leave',
    icon: 'calendar-outline',
    color: '#4F46E5',
    title: 'Leave Policy',
    text: 'Employees are entitled to paid time off as per company policy. Leave requests must be submitted through the HRMS app and approved by the reporting manager.',
    bullets: [
      'Casual Leave: 12 days per year.',
      'Sick Leave: 6 days per year (medical certificate required for 3+ consecutive days).',
      'Earned/Privilege Leave: 15 days per year (accrual after 1 year of service).',
      'Maternity Leave: As per the Maternity Benefit Act.',
      'Paternity Leave: 5 days.',
      'Leave must be applied at least 1 day in advance (except sick leave).',
      'Clubbing of holidays with leave is not permitted without approval.',
      'Leave encashment is available for unused earned leave at year-end.',
    ],
  },
  {
    key: 'payroll',
    icon: 'wallet-outline',
    color: '#059669',
    title: 'Payroll & Compensation',
    text: 'Salaries are processed monthly and credited by the 7th of each month. Salary slips are available on the HRMS portal.',
    bullets: [
      'Salary cycle: Monthly (1st to last day of the month).',
      'Deductions include PF, ESI, Professional Tax, and TDS as applicable.',
      'Payslips are available in the Payslips section of the app.',
      'Form 16 is issued annually after TDS reconciliation.',
      'Salary revisions are effective from the date approved by management.',
      'Final settlement for exiting employees is processed within 30 days.',
    ],
  },
  {
    key: 'performance',
    icon: 'star-outline',
    color: '#8B5CF6',
    title: 'Performance Policy',
    text: 'Performance reviews are conducted to evaluate and support employee growth. Reviews are conducted semi-annually.',
    bullets: [
      'Performance reviews occur every 6 months (January and July).',
      'Goals are set at the beginning of each review cycle.',
      'Self-appraisal must be submitted before the review meeting.',
      '360-degree feedback may be collected from peers and stakeholders.',
      'Low performers will be placed on a Performance Improvement Plan (PIP).',
      'Top performers are eligible for spot awards and accelerated promotion.',
    ],
  },
  {
    key: 'conduct',
    icon: 'shield-checkmark-outline',
    color: '#DC2626',
    title: 'Code of Conduct',
    text: 'All employees are expected to maintain professional conduct and adhere to company values at all times.',
    bullets: [
      'Respect and dignity must be maintained in all interactions.',
      'Discrimination and harassment of any form is strictly prohibited.',
      'Confidential information must not be shared outside the organization.',
      'Personal devices must not be used for unauthorized data transfer.',
      'Violation of the code of conduct may lead to disciplinary action.',
    ],
  },
  {
    key: 'assets',
    icon: 'laptop-outline',
    color: '#0D9488',
    title: 'Asset Policy',
    text: 'Company assets assigned to employees must be used responsibly and returned upon separation.',
    bullets: [
      'Assets (laptop, phone, ID card, etc.) are issued based on role requirements.',
      'Employees must sign an asset acknowledgment form upon receipt.',
      'Any damage or loss must be reported to IT/HR immediately.',
      'Assets must be returned within 7 days of last working day.',
      'Unreturned assets will be deducted from the final settlement.',
    ],
  },
];

const PoliciesScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scrollTopBar = useScrollTopBar();

  return (
    <View style={styles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar, { paddingBottom: TAB_BAR_CLEARANCE + 20 })}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, bannerShellStyle(scrollTopBar)]}>
          <View style={styles.heroOrb1} /><View style={styles.heroOrb2} />
          <View style={[styles.heroContent, { flexDirection: 'row', alignItems: 'center' }]}>
            {navigation?.canGoBack?.() && (
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                <Ionicons name="chevron-back" size={22} color="#FFF" />
              </TouchableOpacity>
            )}
            <View>
              <Text style={styles.heroTitle}>HR Policies</Text>
              <Text style={styles.heroSub}>Company policies and guidelines</Text>
            </View>
          </View>
        </View>
        <View style={styles.body}>
          {POLICY_SECTIONS.map((s) => (
            <View style={styles.section} key={s.key}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: s.color + '18' }]}>
                  <Ionicons name={s.icon} size={18} color={s.color} />
                </View>
                <Text style={styles.sectionTitle}>{s.title}</Text>
              </View>
              <Text style={styles.sectionText}>{s.text}</Text>
              {s.bullets.map((b, i) => (
                <View style={styles.bulletRow} key={i}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

export default PoliciesScreen;
