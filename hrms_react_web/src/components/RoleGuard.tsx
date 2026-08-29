import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, AlertCircle } from 'lucide-react';

interface RoleGuardProps {
  children: React.ReactNode;
  roles: string[];
  module?: string;
  action?: 'read' | 'write' | 'delete';
  fallback?: React.ReactNode;
  redirectTo?: string;
}

/**
 * RoleGuard - Component-level role and permission protection
 * 
 * Usage:
 * <RoleGuard roles={['admin', 'superadmin']}>
 *   <AdminPage />
 * </RoleGuard>
 * 
 * <RoleGuard roles={['admin', 'hr_admin']} module="employees" action="read">
 *   <EmployeeList />
 * </RoleGuard>
 */
const RoleGuard: React.FC<RoleGuardProps> = ({
  children,
  roles,
  module,
  action = 'read',
  fallback,
  redirectTo = '/unauthorized',
}) => {
  const { user, isAuthenticated, hasRole, hasPermission } = useAuth();

  // Check if user is authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check if user has role
  const hasRequiredRole = hasRole(roles);

  // Check module permission if specified
  const hasRequiredPermission = module ? hasPermission(module, action) : true;

  // If both checks pass, render children
  if (hasRequiredRole && hasRequiredPermission) {
    return <>{children}</>;
  }

  // If redirect is specified, use it
  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  // Otherwise render fallback or default access denied UI
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default access denied UI
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-6">
            You don't have permission to access this page.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
            <AlertCircle className="w-4 h-4" />
            <span>Required: {roles.join(', ')}</span>
          </div>
          <button
            onClick={() => window.history.back()}
            className="mt-6 w-full py-2 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoleGuard;
