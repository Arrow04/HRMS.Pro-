import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Shield, Plus, Loader2, Trash2, Copy, Search, Mail, Phone, Building2,
  Calendar, Clock, Monitor, Smartphone, Users, CheckCircle2, XCircle,
  ExternalLink, ChevronDown, ChevronUp
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

const STATUS_MAP: Record<string, string> = {
  active: 'active',
  pending: 'pending',
  suspended: 'inactive',
  rejected: 'rejected',
  trial: 'processed',
};

const inputStyle = {
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  color: 'var(--text-primary)',
};

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

  const moduleLabels: any = {
    dashboard: 'Dashboard', company: 'Company', employees: 'Employees',
    attendance: 'Attendance', holidays: 'Holidays', recruitment: 'Recruitment',
    leaves: 'Leaves', payroll: 'Payroll', expenses: 'Expenses',
    assets: 'Assets', performance: 'Performance', reports: 'Reports',
    master_data: 'Master Data', settings: 'Settings', exit: 'Exits',
    anomalies: 'Anomalies', superadmin_console: 'SuperAdmin Console'
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Admin Users</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{admins.length} tenant admin accounts across all organizations</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Admin
        </button>
      </div>

      <div className="card card-body">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..."
              className="w-full pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              style={inputStyle} />
          </div>
          <select value={orgFilter} onChange={e => setOrgFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            style={inputStyle}>
            <option value="">All Organizations</option>
            {orgs.map((o: any) => (
              <option key={o.id} value={o.id}>{o.company_name || o.name}</option>
            ))}
          </select>
          {(search || orgFilter) && (
            <button onClick={() => { setSearch(''); setOrgFilter(''); }}
              className="btn-secondary text-sm">
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--primary-blue)' }} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th>Admin</th>
                  <th>Organization</th>
                  <th>Status</th>
                  <th>Modules</th>
                  <th>Last Login</th>
                  <th>Joined</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a: AdminUser) => (
                  <tr key={a.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
                          <Shield className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <span className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>{a.full_name || a.email.split('@')[0]}</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{a.email}</span>
                            <button onClick={() => copy(a.email)} className="transition-colors" style={{ color: 'var(--text-tertiary)' }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}><Copy className="w-3 h-3" /></button>
                          </div>
                          {a.phone && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{a.phone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <Link to={`/superadmin/tenants/${a.organization_id}`} className="text-sm font-medium hover:text-blue-600 transition-colors" style={{ color: 'var(--primary-blue)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {a.organization_name || `Org #${a.organization_id}`}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                      <span className={`status-badge ${STATUS_MAP[a.organization_status || ''] || 'draft'}`} style={{ marginTop: '0.25rem', display: 'inline-flex' }}>
                        {a.organization_status ? a.organization_status.charAt(0).toUpperCase() + a.organization_status.slice(1) : 'Unknown'}
                      </span>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{a.organization_employee_count} employees</p>
                    </td>
                    <td>
                      <span className={`status-badge ${a.is_active ? 'active' : 'inactive'}`}>
                        {a.is_active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {a.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => toggleExpand(a.id)} className="flex items-center gap-1 text-sm hover:text-blue-600 transition-colors" style={{ color: 'var(--text-body)' }}>
                        <span className="font-medium">{a.modules_count}</span> modules
                        {expandedRows.has(a.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      {expandedRows.has(a.id) && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {a.modules.map(m => (
                            <span key={m} className="px-2 py-1 rounded-md text-xs"
                              style={{ background: 'var(--active-blue-bg)', color: 'var(--primary-blue)', border: '1px solid var(--active-blue-border, rgba(59,130,246,0.15))' }}>
                              {moduleLabels[m] || m}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {a.last_login ? new Date(a.last_login).toLocaleString() : '-'}
                    </td>
                    <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {a.date_joined ? new Date(a.date_joined).toLocaleDateString() : '-'}
                      {a.join_time && <span className="text-xs block" style={{ color: 'var(--text-tertiary)' }}>{a.join_time}</span>}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setShowDetail(a)} className="p-2 rounded-lg transition-colors"
                          style={{ background: 'var(--active-blue-bg)', color: 'var(--primary-blue)' }} title="View details">
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteTarget(a)} className="p-2 rounded-lg transition-colors"
                          style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)' }} title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!admins || admins.length === 0) && (
                  <tr><td colSpan={7} className="text-center py-16 text-sm" style={{ color: 'var(--text-tertiary)' }}>No admin users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showDetail && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card card-body w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Admin User Details</h3>
              <button onClick={() => setShowDetail(null)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-6">
              <div className="card card-body">
                <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
                  <Shield className="w-4 h-4" style={{ color: 'var(--primary-blue)' }} /> Account Information
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Full Name</label>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{showDetail.full_name || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Email</label>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{showDetail.email}</p>
                      <button onClick={() => copy(showDetail.email)} className="transition-colors" style={{ color: 'var(--text-tertiary)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}><Copy className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Phone</label>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{showDetail.phone || '-'}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Status</label>
                    <span className={`status-badge ${showDetail.is_active ? 'active' : 'inactive'}`}>
                      {showDetail.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Email Verified</label>
                    <span className={`status-badge ${showDetail.email_verified ? 'active' : 'pending'}`}>
                      {showDetail.email_verified ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="card card-body">
                <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
                  <Building2 className="w-4 h-4" style={{ color: 'var(--primary-blue)' }} /> Organization
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Organization</label>
                    <Link to={`/superadmin/tenants/${showDetail.organization_id}`} className="text-sm font-medium hover:text-blue-600 transition-colors flex items-center gap-1" style={{ color: 'var(--primary-blue)' }}>
                      {showDetail.organization_name || `Org #${showDetail.organization_id}`}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Org Status</label>
                    <span className={`status-badge ${STATUS_MAP[showDetail.organization_status || ''] || 'draft'}`}>
                      {showDetail.organization_status ? showDetail.organization_status.charAt(0).toUpperCase() + showDetail.organization_status.slice(1) : 'Unknown'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Org Employees</label>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{showDetail.organization_employee_count} employees</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card card-body">
                <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
                  <Shield className="w-4 h-4" style={{ color: 'var(--primary-blue)' }} /> Permissions & Modules
                </h2>
                <div className="flex flex-wrap gap-2">
                  {showDetail.modules.map(m => (
                    <span key={m} className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'var(--active-blue-bg)', color: 'var(--primary-blue)', border: '1px solid var(--active-blue-border, rgba(59,130,246,0.15))' }}>
                      {moduleLabels[m] || m}
                    </span>
                  ))}
                  {showDetail.modules.length === 0 && (
                    <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No modules assigned</span>
                  )}
                </div>
              </div>

              <div className="card card-body">
                <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
                  <Monitor className="w-4 h-4" style={{ color: 'var(--primary-blue)' }} /> Security & Device
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Device Locked</p>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{showDetail.is_locked_to_device ? 'Yes' : 'No'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Multi Device</p>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{showDetail.allow_multi_device ? 'Allowed' : 'Not Allowed'}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>Device ID</label>
                    <p className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{showDetail.device_id || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>Token Version</label>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{showDetail.token_version}</p>
                  </div>
                </div>
              </div>

              <div className="card card-body">
                <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
                  <Clock className="w-4 h-4" style={{ color: 'var(--primary-blue)' }} /> Activity
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Joined</p>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{showDetail.date_joined ? new Date(showDetail.date_joined).toLocaleDateString() : '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Join Time</p>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{showDetail.join_time || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Last Login</p>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{showDetail.last_login ? new Date(showDetail.last_login).toLocaleString() : '-'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card card-body w-full max-w-md" style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>Add Superadmin</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="admin@hrms.com" className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Full name" className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Temporary Password</label>
                <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Min 8 chars" className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  style={inputStyle} />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => {
                  if (!form.email || !form.password) { toast.error('Email and password are required'); return; }
                  createMut.mutate(form);
                }} className="flex-1 btn-primary">
                  {createMut.isPending ? 'Saving...' : 'Create Admin'}
                </button>
                <button onClick={() => setShowCreate(false)}
                  className="flex-1 btn-secondary">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card card-body w-full max-w-md" style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Delete Superadmin?</h3>
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
              This will remove <span className="font-semibold">{deleteTarget.email}</span> from superadmin access.
            </p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => deleteMut.mutate(deleteTarget.id)}
                className="flex-1 btn-danger">
                {deleteMut.isPending ? 'Deleting...' : 'Delete Admin'}
              </button>
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
