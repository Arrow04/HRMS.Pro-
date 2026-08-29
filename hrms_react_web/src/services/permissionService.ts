import api from './api';

export interface ModulePermissions {
  [module: string]: {
    read: boolean;
    write: boolean;
    id?: number;
  };
}

export const getMyPermissions = async (): Promise<ModulePermissions> => {
  const response = await api.get('/settings/permissions/my');
  return response.data;
};

export const getUserPermissions = async (userId: number): Promise<ModulePermissions> => {
  const response = await api.get(`/settings/permissions/${userId}`);
  return response.data;
};

export const setUserPermission = async (
  userId: number,
  module: string,
  canRead: boolean,
  canWrite: boolean
): Promise<void> => {
  await api.post(`/settings/permissions/${userId}?module=${module}&can_read=${canRead}&can_write=${canWrite}`);
};

export const deletePermission = async (permissionId: number): Promise<void> => {
  await api.delete(`/settings/permissions/${permissionId}`);
};

// Default permissions by role
export const getDefaultPermissionsByRole = (role: string): ModulePermissions => {
  const modules = [
    'dashboard', 'employees', 'attendance', 'leave', 'payroll', 
    'expenses', 'holidays', 'performance', 'recruitment', 'company', 'settings'
  ];
  
  switch (role) {
    case 'hr_admin':
      // HR Admin: All modules except Settings (granted by SuperAdmin)
      return modules.reduce((acc, m) => {
        if (m !== 'settings') {
          acc[m] = { read: true, write: true };
        }
        return acc;
      }, {} as ModulePermissions);
      
    case 'hr_manager':
      // HR Manager: All except Settings and Company Management
      return modules.reduce((acc, m) => {
        if (m !== 'settings' && m !== 'company') {
          acc[m] = { read: true, write: true };
        }
        return acc;
      }, {} as ModulePermissions);
      
    case 'manager':
      // Manager: Employee(R), Attendance(R), Leave(R), Holiday(R), Expenses(RW), Performance(R)
      return {
        employees: { read: true, write: false },
        attendance: { read: true, write: false },
        leave: { read: true, write: false },
        holidays: { read: true, write: false },
        expenses: { read: true, write: true },
        performance: { read: true, write: false }
      };
      
    case 'employee':
      // Employee: Attendance(RW), Leave(W), Holiday(R), Performance(R), Expenses(W)
      // Note: Employee only uses mobile app
      return {
        attendance: { read: true, write: true },
        leave: { read: false, write: true },
        holidays: { read: true, write: false },
        performance: { read: true, write: false },
        expenses: { read: false, write: true }
      };
      
    default:
      return {};
  }
};

// Check if user has permission for a module
export const hasPermission = (
  permissions: ModulePermissions,
  module: string,
  action: 'read' | 'write'
): boolean => {
  const perm = permissions[module];
  if (!perm) return false;
  return action === 'read' ? perm.read : perm.write;
};
