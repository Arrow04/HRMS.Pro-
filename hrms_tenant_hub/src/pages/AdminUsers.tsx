import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Shield, Plus, Loader2, Trash2, Copy, Search, Mail, Phone, Building2,
  Calendar, Clock, Monitor, Smartphone, Users, CheckCircle2, XCircle,
  ExternalLink, ChevronDown, ChevronUp, Filter
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

interface AdminUser {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  organization_id: number;
  organization_name: string | null;
  organization_status: string | null;
  date_joined: string | null;
  join_time: string | null;
  last_login: string | null;
  is_locked_to_device: boolean;
  device_id: string | null;
  allow_multi_device: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  token_version: number;
  modules: string[];
  modules_count: number;
  organization_employee_count: number;
  created_at: string | null;
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [showDetail, setShowDetail] = useState<AdminUser | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [form, setForm] = useState({ email: '', name: '', password: '' });

  const { data: admins = [], isLoading } = useQuery({
    queryKey: ['tenant-admins', search, orgFilter],
    queryFn: () => api.get('/superadmin/legacy/tenant-admins', {
      params: { search: search || undefined, organization_id: orgFilter ? parseInt(orgFilter) : undefined }
    }).then(r => r.data),
  });

  const { data: orgs = [] } = useQuery({
    queryKey: ['tenants-for-filter'],
    queryFn: () => api.get('/superadmin/legacy/tenants').then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => api.post('/superadmin/legacy/admins', data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-admins'] });
      setShowCreate(false);
      toast.success('Superadmin created');
      navigator.clipboard?.writeText(res.data?.email || '').catch(() => {});
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/superadmin/legacy/admins/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-admins'] });
      setDeleteTarget(null);
      toast.success('Superadmin deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed'),
  });

  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast.success('Copied'));

  const toggleExpand = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const statusBadge = (status: string) => {
    const styles: any = {
      active: 'bg-green-50 text-green-700 border-green-200',
      pending: 'bg-amber-50 text-amber-700 border-amber-200',
      suspended: 'bg-red-50 text-red-700 border-red-200',
      rejected: 'bg-gray-50 text-gray-500 border-gray-200',
      trial: 'bg-blue-50 text-blue-700 border-blue-200',
    };
    return `px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status] || 'bg-gray-50 text-gray-600'}`;
  };

  const moduleLabels: any = {
    dashboard: 'Dashboard', company: 'Company', employees: 'Employees',
    attendance: 'Attendance', holidays: 'Holidays', recruitment: 'Recruitment',
    leaves: 'Leaves', payroll: 'Payroll', expenses: 'Expenses',
    assets: 'Assets', performance: 'Performance', reports: 'Reports',
    master_data: 'Master Data', settings: 'Settings', exit: 'Exits',
    anomalies: 'Anomalies', superadmin_console: 'SuperAdmin Console'
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Users</h1>
          <p className="text-sm text-gray-500 mt-1">{admins.length} tenant admin accounts across all organizations</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Add Admin
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          </div>
          <select value={orgFilter} onChange={e => setOrgFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">All Organizations</option>
            {orgs.map((o: any) => (
              <option key={o.id} value={o.id}>{o.company_name || o.name}</option>
            ))}
          </select>
          {(search || orgFilter) && (
            <button onClick={() => { setSearch(''); setOrgFilter(''); }}
              className="px-3 py-2 text-sm text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg font-medium">
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Admin</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Organization</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Modules</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Last Login</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Joined</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {admins.map((a: AdminUser) => (
                  <>
                    <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                            <Shield className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <span className="text-sm font-medium text-gray-900">{a.full_name || a.email.split('@')[0]}</span>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-xs text-gray-500">{a.email}</span>
                              <button onClick={() => copy(a.email)} className="text-gray-400 hover:text-gray-600"><Copy className="w-3 h-3" /></button>
                            </div>
                            {a.phone && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3 text-gray-400" />
                                <span className="text-xs text-gray-500">{a.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Link to={`/superadmin/tenants/${a.organization_id}`} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                          {a.organization_name || `Org #${a.organization_id}`}
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                        <span className={`inline-block mt-1 ${statusBadge(a.organization_status || '')}`}>
                          {a.organization_status ? a.organization_status.charAt(0).toUpperCase() + a.organization_status.slice(1) : 'Unknown'}
                        </span>
                        <p className="text-xs text-gray-400 mt-1">{a.organization_employee_count} employees</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          a.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {a.is_active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {a.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button onClick={() => toggleExpand(a.id)} className="flex items-center gap-1 text-sm text-gray-700 hover:text-blue-600">
                          <span className="font-medium">{a.modules_count}</span> modules
                          {expandedRows.has(a.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {expandedRows.has(a.id) && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {a.modules.map(m => (
                              <span key={m} className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs border border-blue-100">
                                {moduleLabels[m] || m}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {a.last_login ? new Date(a.last_login).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {a.date_joined ? new Date(a.date_joined).toLocaleDateString() : '-'}
                        {a.join_time && <span className="text-xs text-gray-400 block">{a.join_time}</span>}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button onClick={() => setShowDetail(a)} className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100" title="View details">
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteTarget(a)} className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 ml-1" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {expandedRows.has(a.id) && (
                      <tr key={`${a.id}-modules`} className="bg-gray-50/50">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {a.modules.map(m => (
                              <span key={m} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700">
                                {moduleLabels[m] || m}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {(!admins || admins.length === 0) && (
                  <tr><td colSpan={7} className="text-center py-16 text-sm text-gray-400">No admin users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Admin User Details</h3>
              <button onClick={() => setShowDetail(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-500" /> Account Information
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Full Name</label>
                    <p className="text-sm text-gray-900">{showDetail.full_name || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Email</label>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <p className="text-sm text-gray-900">{showDetail.email}</p>
                      <button onClick={() => copy(showDetail.email)} className="text-gray-400 hover:text-gray-600"><Copy className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Phone</label>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <p className="text-sm text-gray-900">{showDetail.phone || '-'}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Status</label>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                      showDetail.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      {showDetail.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Email Verified</label>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                      showDetail.email_verified ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {showDetail.email_verified ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-500" /> Organization
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Organization</label>
                    <Link to={`/superadmin/tenants/${showDetail.organization_id}`} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      {showDetail.organization_name || `Org #${showDetail.organization_id}`}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Org Status</label>
                    <span className={statusBadge(showDetail.organization_status || '')}>
                      {showDetail.organization_status ? showDetail.organization_status.charAt(0).toUpperCase() + showDetail.organization_status.slice(1) : 'Unknown'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Org Employees</label>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-400" />
                      <p className="text-sm text-gray-900">{showDetail.organization_employee_count} employees</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-500" /> Permissions & Modules
                </h2>
                <div className="flex flex-wrap gap-2">
                  {showDetail.modules.map(m => (
                    <span key={m} className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">
                      {moduleLabels[m] || m}
                    </span>
                  ))}
                  {showDetail.modules.length === 0 && (
                    <span className="text-sm text-gray-400">No modules assigned</span>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-blue-500" /> Security & Device
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-400">Device Locked</p>
                      <p className="text-sm font-medium text-gray-900">{showDetail.is_locked_to_device ? 'Yes' : 'No'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-400">Multi Device</p>
                      <p className="text-sm font-medium text-gray-900">{showDetail.allow_multi_device ? 'Allowed' : 'Not Allowed'}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400">Device ID</label>
                    <p className="text-sm text-gray-900 font-mono">{showDetail.device_id || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400">Token Version</label>
                    <p className="text-sm text-gray-900">{showDetail.token_version}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" /> Activity
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-400">Joined</p>
                      <p className="text-sm font-medium text-gray-900">{showDetail.date_joined ? new Date(showDetail.date_joined).toLocaleDateString() : '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-400">Join Time</p>
                      <p className="text-sm font-medium text-gray-900">{showDetail.join_time || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-400">Last Login</p>
                      <p className="text-sm font-medium text-gray-900">{showDetail.last_login ? new Date(showDetail.last_login).toLocaleString() : '-'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Add Superadmin</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="admin@hrms.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Full name" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password</label>
                <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Min 8 chars" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => {
                  if (!form.email || !form.password) { toast.error('Email and password are required'); return; }
                  createMut.mutate(form);
                }} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
                  {createMut.isPending ? 'Saving...' : 'Create Admin'}
                </button>
                <button onClick={() => setShowCreate(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900">Delete Superadmin?</h3>
            <p className="text-sm text-gray-500 mt-2">
              This will remove <span className="font-semibold">{deleteTarget.email}</span> from superadmin access.
            </p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => deleteMut.mutate(deleteTarget.id)}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700">
                {deleteMut.isPending ? 'Deleting...' : 'Delete Admin'}
              </button>
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
