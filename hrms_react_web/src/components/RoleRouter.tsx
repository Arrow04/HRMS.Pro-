import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Simple Role Router - decides where to go based on user role
 * This is the SINGLE source of truth for role-based routing
 */
const RoleRouter = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <img src="/hrms_logo1.png" alt="HRMS.Pro!" className="w-20 h-20 object-contain animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Simple role-based routing
  switch (user.role) {

    case 'employee':
      return <Navigate to="/me" replace />;
    case 'admin':
    case 'hr_admin':
    case 'hr_manager':
    case 'hr_executive':
    case 'superadmin':
    default:
      return <Navigate to="/dashboard" replace />;
  }
};

export default RoleRouter;
