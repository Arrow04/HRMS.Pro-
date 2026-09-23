import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import { useWebSocket } from './hooks/useWebSocket';

// Suppress React 19 dev warning about history.pushState({}, ...) used by React Router v7
if (import.meta.env.DEV) {
  const origPushState = window.history.pushState.bind(window.history);
  window.history.pushState = (state, title, url) =>
    origPushState(state && typeof state === 'object' && !Object.keys(state).length ? null : state, title, url);
}

// Layouts
import DashboardLayout from './layouts/DashboardLayout';
import DashboardLayoutSimple from './layouts/DashboardLayoutSimple';
import AuthLayout from './layouts/AuthLayout';

// Components
import RoleRouter from './components/RoleRouter';
import ErrorBoundary from './components/ErrorBoundary';
import CommandPalette from './components/CommandPalette';

// Lazy loaded pages
const Login = lazy(() => import('./pages/Login'));
const RegisterTenant = lazy(() => import('./pages/RegisterTenant'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Company = lazy(() => import('./pages/Company'));
const EmployeeManagement = lazy(() => import('./pages/EmployeeManagement'));
const LeaveManagement = lazy(() => import('./pages/LeaveManagement'));
const Payroll = lazy(() => import('./pages/Payroll'));
const PayrollSetup = lazy(() => import('./pages/PayrollSetup'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Recruitment = lazy(() => import('./pages/Recruitment'));
const Holidays = lazy(() => import('./pages/Holidays'));
const Settings = lazy(() => import('./pages/Settings'));
const Reports = lazy(() => import('./pages/Reports'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Performance = lazy(() => import('./pages/Performance'));
const Announcements = lazy(() => import('./pages/Announcements'));
const Grievances = lazy(() => import('./pages/Grievances'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Helpdesk = lazy(() => import('./pages/Helpdesk'));
const MasterData = lazy(() => import('./pages/MasterData'));
const MobileOnly = lazy(() => import('./pages/MobileOnly'));
const NotFound = lazy(() => import('./pages/NotFound'));


const AnomalyDetection = lazy(() => import('./pages/AnomalyDetection'));
const ExitManagement = lazy(() => import('./pages/ExitManagement'));
const AssetManagement = lazy(() => import('./pages/AssetManagement'));
const Letters = lazy(() => import('./pages/Letters'));

// Employee self-service portal (PWA)
const EmployeePortalLayout = lazy(() => import('./layouts/EmployeePortalLayout'));
const EmployeeHome = lazy(() => import('./pages/employee/EmployeeHome'));
const EmployeeAttendance = lazy(() => import('./pages/employee/EmployeeAttendance'));
const EmployeeLeaves = lazy(() => import('./pages/employee/EmployeeLeaves'));
const EmployeeExpenses = lazy(() => import('./pages/employee/EmployeeExpenses'));
const EmployeePayslips = lazy(() => import('./pages/employee/EmployeePayslips'));
const EmployeePerformance = lazy(() => import('./pages/employee/EmployeePerformance'));
const EmployeeProfile = lazy(() => import('./pages/employee/EmployeeProfile'));
const EmployeeTaxDeclarations = lazy(() => import('./pages/employee/EmployeeTaxDeclarations'));

// Loading component
const PageLoader = () => (
  <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#FAFBFE] z-[9999]">
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        <img src="/hrms_logo1.png" alt="HRMS.Pro!" className="w-20 h-20 object-contain" />
        <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 blur-xl" />
      </div>
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">HRMS<span className="text-[#6366F1]">.Pro!</span></h1>
        <p className="text-lg font-bold text-[#0F172A]">Setting your workspace in motion….</p>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#6366F1] animate-[bounce_1.2s_infinite]" />
          <span className="w-2 h-2 rounded-full bg-[#6366F1] animate-[bounce_1.2s_infinite_0.15s]" />
          <span className="w-2 h-2 rounded-full bg-[#6366F1] animate-[bounce_1.2s_infinite_0.3s]" />
        </div>
      </div>
    </div>
    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#6366F1]/20 to-transparent">
      <div className="h-full w-1/3 bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] rounded-full animate-[loadingBar_1.5s_ease-in-out_infinite]" />
    </div>
  </div>
);

function App() {
  const { user } = useAuth();
  useWebSocket(user?.id);
   return (
     <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <ErrorBoundary>
          <Routes>
           {/* Public Auth Routes */}
           <Route element={<AuthLayout />}>
             <Route path="/login" element={<Login />} />
             <Route path="/register-tenant" element={<RegisterTenant />} />
           </Route>

           {/* Standalone Pages (No Layout) */}
           <Route path="/mobile-only" element={<MobileOnly />} />

           {/* DashboardLayoutSimple - for employee/mobile web access */}
           <Route element={<DashboardLayoutSimple />}>
             <Route path="/simple/dashboard" element={<Dashboard />} />
             <Route path="/simple/attendance" element={<Attendance />} />
           </Route>

           {/* Employee Self-Service Portal (PWA) */}
           <Route element={<EmployeePortalLayout />}>
             <Route path="/me" element={<EmployeeHome />} />
             <Route path="/me/attendance" element={<EmployeeAttendance />} />
             <Route path="/me/leaves" element={<EmployeeLeaves />} />
             <Route path="/me/expenses" element={<EmployeeExpenses />} />
             <Route path="/me/payslips" element={<EmployeePayslips />} />
             <Route path="/me/performance" element={<EmployeePerformance />} />
             <Route path="/me/profile" element={<EmployeeProfile />} />
             <Route path="/me/tax-declarations" element={<EmployeeTaxDeclarations />} />
           </Route>

             {/* Protected Dashboard Routes */}
             <Route element={<DashboardLayout />}>
               <Route index element={<RoleRouter />} />
               <Route path="/dashboard" element={<Dashboard />} />
               <Route path="/company" element={<Company />} />
                <Route path="/employees" element={<EmployeeManagement />} />
                <Route path="/letters" element={<Letters />} />
               <Route path="/recruitment" element={<Recruitment />} />
               <Route path="/holidays" element={<Holidays />} />
               <Route path="/leaves" element={<LeaveManagement />} />
                <Route path="/payroll" element={<Payroll />} />
                <Route path="/payroll/config" element={<Payroll initialTab="config" />} />
                <Route path="/payroll/setup" element={<PayrollSetup />} />

                <Route path="/anomalies" element={<AnomalyDetection />} />
               <Route path="/exit-management" element={<ExitManagement />} />
               <Route path="/assets" element={<AssetManagement />} />

               {/* Protected Dashboard Pages */}
               <Route path="/attendance" element={<Attendance />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/performance" element={<Performance />} />
                <Route path="/announcements" element={<Announcements />} />
                <Route path="/grievances" element={<Grievances />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/helpdesk" element={<Helpdesk />} />
                <Route path="/settings" element={<Settings />} />
               <Route path="/master-data" element={<MasterData />} />
             </Route>

             {/* 404 Catch-all */}
             <Route path="*" element={<NotFound />} />
          </Routes>
          </ErrorBoundary>
        </Suspense>
       <Toaster position="top-right" toastOptions={{ duration: 3000, style: { background: '#333', color: '#fff' } }} />
       <CommandPalette />
      </BrowserRouter>
    );
  }

export default App;
