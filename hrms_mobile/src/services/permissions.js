export const ROLE_HIERARCHY = {
  superadmin: 100,
  admin: 80,
  hr_admin: 70,
  hr_manager: 60,
  hr: 60,
  manager: 50,
  employee: 10,
};

export function canAccess(role, level) {
  return (ROLE_HIERARCHY[role] || 0) >= level;
}

export function canApprove(role) {
  return ['superadmin', 'admin', 'hr_admin', 'hr_manager', 'manager'].includes(role);
}

export function canManageEmployees(role) {
  return ['superadmin', 'admin', 'hr_admin', 'hr_manager', 'hr'].includes(role);
}

export function canViewAll(role) {
  return ['superadmin', 'admin', 'hr_admin', 'hr_manager'].includes(role);
}

export function canWrite(role) {
  return ['superadmin', 'admin', 'hr_admin', 'hr_manager', 'hr', 'manager'].includes(role);
}
