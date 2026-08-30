import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, useNavigationContainerRef, useFocusEffect } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ErrorBoundary from './src/components/ErrorBoundary';
import AppTabBar from './src/components/AppTabBar';
import { PremiumSpinner } from './src/components/PremiumSpinner';

import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import AttendanceScreen from './src/screens/AttendanceScreen';
import AttendanceHistoryScreen from './src/screens/AttendanceHistoryScreen';
import EmployeeListScreen from './src/screens/EmployeeListScreen';
import EmployeeDetailScreen from './src/screens/EmployeeDetailScreen';
import LeaveRequestScreen from './src/screens/LeaveRequestScreen';
import ApprovalsScreen from './src/screens/ApprovalsScreen';
import LeaveApprovalScreen from './src/screens/LeaveApprovalScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ExpensesScreen from './src/screens/ExpensesScreen';
import PayslipScreen from './src/screens/PayslipScreen';
import ChatScreen from './src/screens/ChatScreen';
import MoreScreen from './src/screens/MoreScreen';
import CompanyScreen from './src/screens/CompanyScreen';
import HolidayScreen from './src/screens/HolidayScreen';
import PayrollScreen from './src/screens/PayrollScreen';
import RecruitmentScreen from './src/screens/RecruitmentScreen';
import PerformanceScreen from './src/screens/PerformanceScreen';
import MyPerformanceScreen from './src/screens/MyPerformanceScreen';
import AssetScreen from './src/screens/AssetScreen';
import ExitScreen from './src/screens/ExitScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PoliciesScreen from './src/screens/PoliciesScreen';
import DocumentsScreen from './src/screens/DocumentsScreen';
import AdminAttendanceScreen from './src/screens/AdminAttendanceScreen';
import AdminLeavesScreen from './src/screens/AdminLeavesScreen';
import AdminAnomalyScreen from './src/screens/AdminAnomalyScreen';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { TimezoneProvider } from './src/context/TimezoneContext';
import { ScrollTopBarHostProvider, useScrollTopBarHost } from './src/context/ScrollTopBarHost';
import GlobalScreenTopBar from './src/components/GlobalScreenTopBar';
import { colors as staticColors } from './src/theme';

const Stack = createStackNavigator();
const Tab = createMaterialTopTabNavigator();

const MainTabs = () => {
  const { colors } = useTheme();
  const host = useScrollTopBarHost();

  useFocusEffect(
    useCallback(() => {
      host?.setTopBarHidden(false);
    }, [host]),
  );

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        tabBarPosition="bottom"
        tabBar={(props) => <AppTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          lazy: true,
          swipeEnabled: true,
          animationEnabled: true,
          tabBarShowIcon: false,
          tabBarShowLabel: false,
          tabBarIndicatorStyle: { height: 0 },
          tabBarStyle: { display: 'none' },
        }}
        sceneContainerStyle={{ flex: 1, backgroundColor: colors.bg, overflow: 'visible' }}
      >
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Attendance" component={AttendanceScreen} />
        <Tab.Screen name="Menu" component={MoreScreen} />
      </Tab.Navigator>
    </View>
  );
};

const screenOptions = (bg) => ({ headerShown: false, cardStyle: { backgroundColor: bg } });

const AppNavigator = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { colors, isDark, navigationTheme } = useTheme();
  const host = useScrollTopBarHost();
  const navigationRef = useNavigationContainerRef();
  const [navEpoch, setNavEpoch] = useState(0);
  const bumpNavEpoch = useCallback(() => setNavEpoch((n) => n + 1), []);

  useEffect(() => {
    if (isLoading) {
      host?.setTopBarHidden(true);
      return;
    }
    host?.setTopBarHidden(!isAuthenticated);
    bumpNavEpoch();
  }, [isLoading, isAuthenticated, host, bumpNavEpoch]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingOrb1} /><View style={styles.loadingOrb2} />
        <View style={styles.loadingContent}>
          <PremiumSpinner size="lg" light />
          <Text style={styles.loadingSubtext}>Setting your workspace in motion…</Text>
        </View>
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      onReady={bumpNavEpoch}
      onStateChange={bumpNavEpoch}
    >
      <GlobalScreenTopBar navigationRef={navigationRef} navEpoch={navEpoch} />
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack.Navigator screenOptions={screenOptions(colors.bg)}>
        {!isAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} />
            <Stack.Screen name="EmployeeDetail" component={EmployeeDetailScreen} />
            <Stack.Screen name="LeaveApproval" component={LeaveApprovalScreen} />
            <Stack.Screen name="Leaves" component={LeaveRequestScreen} />
            <Stack.Screen name="Expenses" component={ExpensesScreen} />
            <Stack.Screen name="Payslips" component={PayslipScreen} />
            <Stack.Screen name="Employees" component={EmployeeListScreen} />
            <Stack.Screen name="Approvals" component={ApprovalsScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Company" component={CompanyScreen} />
            <Stack.Screen name="Holidays" component={HolidayScreen} />
            <Stack.Screen name="PayrollAdmin" component={PayrollScreen} />
            <Stack.Screen name="Recruitment" component={RecruitmentScreen} />
            <Stack.Screen name="Performance" component={PerformanceScreen} />
            <Stack.Screen name="MyPerformance" component={MyPerformanceScreen} />
            <Stack.Screen name="Assets" component={AssetScreen} />
            <Stack.Screen name="ExitMgmt" component={ExitScreen} />
            <Stack.Screen name="Reports" component={ReportsScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Policies" component={PoliciesScreen} />
            <Stack.Screen name="Documents" component={DocumentsScreen} />
            <Stack.Screen name="AdminAttendance" component={AdminAttendanceScreen} />
            <Stack.Screen name="AdminLeaves" component={AdminLeavesScreen} />
            <Stack.Screen name="AdminAnomalies" component={AdminAnomalyScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <TimezoneProvider>
            <AuthProvider>
            <ScrollTopBarHostProvider>
              <AppNavigator />
            </ScrollTopBarHostProvider>
          </AuthProvider>
          </TimezoneProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: staticColors.gradient.dark[0], overflow: 'hidden' },
  loadingOrb1: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(28,100,242,0.3)', top: -60, right: -80 },
  loadingOrb2: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(79,70,229,0.2)', bottom: 100, left: -60 },
  loadingContent: { zIndex: 1, alignItems: 'center' },
  loadingSubtext: { fontSize: 15, color: 'rgba(255,255,255,0.7)', marginTop: 18, fontWeight: '600' },
});
