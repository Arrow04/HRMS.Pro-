import { useState, useEffect } from 'react';
import {
  Search, Users, Save, RotateCcw, Loader2,
  Shield, AlertCircle, CheckCircle, ChevronDown, ChevronUp,
  UserCheck, Building2
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  organization_id: number;
}

interface Permission {
  module: string;
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULES LIST
// ═══════════════════════════════════════════════════════════════════════════════

const MODULES_LIST = [
  { id: 'dashboard', name: 'Dashboard', category: 'Core' },
  { id: 'company', name: 'Company', category: 'Core' },
  { id: 'employees', name: 'Employees', category: 'HR' },
  { id: 'attendance', name: 'Attendance', category: 'HR' },
  { id: 'holidays', name: 'Holidays', category: 'HR' },
  { id: 'recruitment', name: 'Recruitment', category: 'HR' },
  { id: 'leaves', name: 'Leaves', category: 'HR' },
  { id: 'payroll', name: 'Payroll', category: 'HR' },
  { id: 'expenses', name: 'Expenses', category: 'HR' },
  { id: 'performance', name: 'Performance', category: 'HR' },
  { id: 'reports', name: 'Reports', category: 'Analytics' },
  { id: 'master_data', name: 'Master Data', category: 'Admin' },
  { id: 'settings', name: 'Settings', category: 'Admin' },
];

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  hr_admin: 'bg-green-100 text-green-800',
  hr_manager: 'bg-amber-100 text-amber-800',
  hr_executive: 'bg-orange-100 text-orange-800',
  employee: 'bg-gray-100 text-gray-800',
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const PermissionsManager = () => {
  const { user: currentUser } = useAuth();
  
  // State
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Core', 'HR', 'Analytics', 'Admin']));

  // Fetch users on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  // Fetch permissions when user selected
  useEffect(() => {
    if (selectedUser) {
      fetchUserPermissions(selectedUser.id);
    }
  }, [selectedUser]);

  // Toast auto-hide
  useEffect(() => {
    if (toast) {
      const timeout = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timeout);
    }
  }, [toast]);

  // ═══════════════════════════════════════════════════════════════════════════
  // API CALLS
  // ═══════════════════════════════════════════════════════════════════════════

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/permissions/users');
      setUsers(response.data || []);
    } catch (error) {
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserPermissions = async (userId: number) => {
    setLoading(true);
    try {
      const response = await api.get(`/permissions/${userId}`);
      setPermissions(response.data.permissions || []);
    } catch (error) {
      showToast('Failed to load permissions', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const handleSavePermissions = async () => {
    if (!selectedUser) return;
    
    setSaving(true);
    try {
      await api.post(`/permissions/${selectedUser.id}`, { permissions });
      showToast('Permissions saved successfully', 'success');
    } catch (error) {
      showToast('Failed to save permissions', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = async () => {
    if (!selectedUser) return;
    
    if (!confirm(`Reset permissions for ${selectedUser.email} to ${selectedUser.role} defaults?`)) {
      return;
    }
    
    setSaving(true);
    try {
      await api.post(`/permissions/${selectedUser.id}/reset`);
      await fetchUserPermissions(selectedUser.id);
      showToast('Permissions reset to defaults', 'success');
    } catch (error) {
      showToast('Failed to reset permissions', 'error');
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = (module: string, field: 'can_read' | 'can_write' | 'can_delete') => {
    setPermissions(prev => 
      prev.map(p => 
        p.module === module ? { ...p, [field]: !p[field] } : p
      )
    );
  };

  const toggleAllInCategory = (category: string, field: 'can_read' | 'can_write' | 'can_delete', value: boolean) => {
    const categoryModules = MODULES_LIST.filter(m => m.category === category).map(m => m.id);
    setPermissions(prev => 
      prev.map(p => 
        categoryModules.includes(p.module) ? { ...p, [field]: value } : p
      )
    );
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  const getPermissionForModule = (moduleId: string): Permission => {
    return permissions.find(p => p.module === moduleId) || {
      module: moduleId,
      can_read: false,
      can_write: false,
      can_delete: false
    };
  };

  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canManageUser = (targetUser: User): boolean => {
    if (!currentUser) return false;
    
    // Superadmin can manage anyone
    if (currentUser.role === 'superadmin') return true;
    
    // Admin can only manage users in their organization
    if (currentUser.role === 'admin') {
      if (targetUser.organization_id !== currentUser.organizationId) return false;
      // Admin cannot manage superadmin or other admins
      if (targetUser.role === 'superadmin' || targetUser.role === 'admin') return false;
      return true;
    }
    
    return false;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Permissions Manager</h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage user access to HRMS modules
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Shield className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* User List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
                {filteredUsers.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No users found</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {filteredUsers.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => setSelectedUser(user)}
                        disabled={!canManageUser(user)}
                        className={`w-full text-left p-4 transition ${
                          selectedUser?.id === user.id
                            ? 'bg-blue-50 border-l-4 border-blue-600'
                            : 'hover:bg-gray-50 border-l-4 border-transparent'
                        } ${!canManageUser(user) ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{user.full_name || user.email}</p>
                            <p className="text-sm text-gray-500">{user.email}</p>
                          </div>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${ROLE_COLORS[user.role] || 'bg-gray-100'}`}>
                            {user.role}
                          </span>
                        </div>
                        {!canManageUser(user) && (
                          <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Cannot manage this user
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Permissions Matrix */}
          <div className="lg:col-span-2">
            {selectedUser ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Selected User Header */}
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <UserCheck className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">
                          {selectedUser.full_name || selectedUser.email}
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${ROLE_COLORS[selectedUser.role]}`}>
                            {selectedUser.role}
                          </span>
                          <span className="text-sm text-gray-500 flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            Org ID: {selectedUser.organization_id}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleResetToDefaults}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset to Defaults
                      </button>
                      <button
                        onClick={handleSavePermissions}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        {saving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        Save Changes
                      </button>
                    </div>
                  </div>
                </div>

                {/* Permissions Table */}
                <div className="p-6">
                  {loading ? (
                    null
                  ) : (
                    <div className="space-y-4">
                      {['Core', 'HR', 'Analytics', 'Admin'].map((category) => {
                        const categoryModules = MODULES_LIST.filter(m => m.category === category);
                        const isExpanded = expandedCategories.has(category);
                        
                        return (
                          <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() => toggleCategory(category)}
                              className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition"
                            >
                              <div className="flex items-center gap-4">
                                <span className="font-semibold text-gray-900">{category}</span>
                                <span className="text-sm text-gray-500">({categoryModules.length} modules)</span>
                              </div>
                              <div className="flex items-center gap-4">
                                {/* Category bulk actions */}
                                <div className="flex items-center gap-2 text-sm">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleAllInCategory(category, 'can_read', true); }}
                                    className="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
                                  >
                                    All Read
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleAllInCategory(category, 'can_write', true); }}
                                    className="px-2 py-1 text-green-600 hover:bg-green-50 rounded"
                                  >
                                    All Write
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleAllInCategory(category, 'can_read', false); }}
                                    className="px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                                  >
                                    Clear
                                  </button>
                                </div>
                                {isExpanded ? (
                                  <ChevronUp className="w-5 h-5 text-gray-400" />
                                ) : (
                                  <ChevronDown className="w-5 h-5 text-gray-400" />
                                )}
                              </div>
                            </button>
                            
                            {isExpanded && (
                              <div className="divide-y divide-gray-200">
                                {categoryModules.map((module) => {
                                  const perm = getPermissionForModule(module.id);
                                  return (
                                    <div key={module.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                                      <div className="flex items-center gap-3">
                                        <span className="font-medium text-gray-900">{module.name}</span>
                                      </div>
                                      <div className="flex items-center gap-6">
                                        {/* Can Read */}
                                        <label className="flex items-center gap-2 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={perm.can_read}
                                            onChange={() => togglePermission(module.id, 'can_read')}
                                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                          />
                                          <span className={`text-sm ${perm.can_read ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
                                            Read
                                          </span>
                                        </label>
                                        
                                        {/* Can Write */}
                                        <label className="flex items-center gap-2 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={perm.can_write}
                                            onChange={() => togglePermission(module.id, 'can_write')}
                                            className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                                          />
                                          <span className={`text-sm ${perm.can_write ? 'text-green-600 font-medium' : 'text-gray-500'}`}>
                                            Write
                                          </span>
                                        </label>
                                        
                                        {/* Can Delete */}
                                        <label className="flex items-center gap-2 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={perm.can_delete}
                                            onChange={() => togglePermission(module.id, 'can_delete')}
                                            className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                                          />
                                          <span className={`text-sm ${perm.can_delete ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                                            Delete
                                          </span>
                                        </label>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select a User</h3>
                <p className="text-gray-500">
                  Choose a user from the list on the left to manage their permissions.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default PermissionsManager;
