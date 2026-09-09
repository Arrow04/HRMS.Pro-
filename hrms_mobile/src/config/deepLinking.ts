import * as Linking from 'expo-linking';
export const prefix = Linking.createURL('/');
export const linking = {
  prefixes: [prefix],
  config: {
    screens: {
      MainTabs: { path: '', screens: { Dashboard: 'dashboard', Attendance: 'attendance', Menu: 'menu' } },
      AttendanceHistory: 'attendance/history', DocumentUpload: 'documents/upload', WFHRequest: 'wfh/request',
      AttendanceCorrection: 'attendance/correction', Reimbursement: 'reimburse', TeamDirectory: 'team',
      Grievance: 'grievance', ShiftRoster: 'shifts', RelievingLetter: 'exit/documents',
      Announcements: 'announcements', GoalSetting: 'goals', Onboarding: 'onboarding',
      EmployeeDetail: 'employee/:id', Profile: 'profile', Chat: 'chat',
    },
  },
};
