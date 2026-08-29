import { useAuth } from '../context/AuthContext';

/**
 * Action-level permission helper for the HRMS app.
 *
 * `can(module, action)` returns true only when the current user's backend
 * permissions allow that action on that module. For admins/superadmins it is
 * always true (they receive full access from the backend). For HR roles and
 * employees it reflects exactly what an admin assigned in the Permissions
 * manager — so an HR Executive without write access to "employees" cannot
 * create or edit employees.
 */
export const usePermission = () => {
  const { user, hasPermission, canAccessModule } = useAuth();

  // Admins & superadmins have full access to every module.
  const isElevated = user?.role === 'admin' || user?.role === 'superadmin';

  const can = (module: string, action: 'read' | 'write' | 'delete' = 'read'): boolean => {
    if (!user) return false;
    if (isElevated) return true;
    return hasPermission(module, action);
  };

  const canView = (module: string) => can(module, 'read');
  const canEdit = (module: string) => can(module, 'write');
  const canDelete = (module: string) => can(module, 'delete');

  return { can, canView, canEdit, canDelete, canAccessModule };
};

export default usePermission;
