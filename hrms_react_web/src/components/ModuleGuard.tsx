import React from 'react';
import { useAuth } from '../context/AuthContext';

interface ModuleGuardProps {
  children: React.ReactNode;
  module: string;
  action?: 'read' | 'write' | 'delete';
  fallback?: React.ReactNode;
  hideInsteadOfDisable?: boolean;
}

/**
 * ModuleGuard - Element-level permission protection
 * 
 * Usage:
 * <ModuleGuard module="payroll" action="write">
 *   <button>Process Payroll</button>
 * </ModuleGuard>
 * 
 * <ModuleGuard module="employees" action="delete" hideInsteadOfDisable>
 *   <button>Delete Employee</button>
 * </ModuleGuard>
 */
const ModuleGuard: React.FC<ModuleGuardProps> = ({
  children,
  module,
  action = 'read',
  fallback,
  hideInsteadOfDisable = false,
}) => {
  const { hasPermission } = useAuth();

  const hasAccess = hasPermission(module, action);

  // If user has permission, render children normally
  if (hasAccess) {
    return <>{children}</>;
  }

  // If hideInsteadOfDisable is true, render nothing
  if (hideInsteadOfDisable) {
    return null;
  }

  // Otherwise, render children as disabled
  // We need to clone the element and add disabled prop
  const childrenArray = React.Children.toArray(children);
  
  if (childrenArray.length === 0) {
    return null;
  }

  const firstChild = childrenArray[0];
  
  // If it's a valid React element, clone it with disabled
  if (React.isValidElement(firstChild)) {
    const disabledElement = React.cloneElement<Record<string, unknown>>(
      firstChild as React.ReactElement<Record<string, unknown>>,
      {
        disabled: true,
        title: `You don't have ${action} permission for ${module}`,
        className: `${(firstChild.props as { className?: string }).className || ''} opacity-50 cursor-not-allowed`,
      }
    );

    return <>{disabledElement}{childrenArray.slice(1)}</>;
  }

  // If fallback is provided, render it
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default: render nothing
  return null;
};

export default ModuleGuard;
