import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import SuperAdminLayout from './layouts/SuperAdminLayout';
import AuthLayout from './layouts/AuthLayout';
import ErrorBoundary from './components/ErrorBoundary';

const Login = lazy(() => import('./pages/Login'));
const RegisterTenant = lazy(() => import('./pages/RegisterTenant'));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'));
const TenantManagement = lazy(() => import('./pages/TenantManagement'));
const TenantDetail = lazy(() => import('./pages/TenantDetail'));
const CreateTenant = lazy(() => import('./pages/CreateTenant'));
const BillingManagement = lazy(() => import('./pages/BillingManagement'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const SystemHealth = lazy(() => import('./pages/SystemHealth'));
const AuditLogViewer = lazy(() => import('./pages/AuditLogViewer'));
const FeatureFlags = lazy(() => import('./pages/FeatureFlags'));
const NotFound = lazy(() => import('./pages/NotFound'));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/superadmin" replace />} />
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
          </Route>
          <Route element={<SuperAdminLayout />}>
            <Route path="/superadmin" element={<SuperAdminDashboard />} />
            <Route path="/superadmin/tenants" element={<TenantManagement />} />
            <Route path="/superadmin/tenants/:id" element={<TenantDetail />} />
            <Route path="/superadmin/tenants/new" element={<CreateTenant />} />
            <Route path="/superadmin/billing" element={<BillingManagement />} />
            <Route path="/superadmin/admins" element={<AdminUsers />} />
            <Route path="/superadmin/health" element={<SystemHealth />} />
            <Route path="/superadmin/audit-logs" element={<AuditLogViewer />} />
            <Route path="/superadmin/feature-flags" element={<FeatureFlags />} />
          </Route>
          <Route path="/register-tenant" element={<RegisterTenant />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Toaster position="top-right" toastOptions={{ duration: 3000, style: { background: '#333', color: '#fff' } }} />
    </ErrorBoundary>
  );
}

export default App;
