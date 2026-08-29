import { useAuth } from '../context/AuthContext';

const ADMIN_ROLES = ['admin', 'superadmin', 'hr_admin', 'hr_manager'];

export function useIsAdmin() {
  const { user } = useAuth();
  return ADMIN_ROLES.includes(user?.role);
}

export function canApprove(role) {
  return ADMIN_ROLES.includes(role);
}

export function canManageEmployees(role) {
  return ['admin', 'superadmin', 'hr_admin', 'hr_manager', 'hr_executive'].includes(role);
}

export function canViewPayroll(role) {
  return ['admin', 'superadmin', 'hr_admin', 'hr_manager'].includes(role);
}
