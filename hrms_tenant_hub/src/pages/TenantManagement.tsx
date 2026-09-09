import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Building2, Search, CheckCircle, XCircle, PauseCircle, PlayCircle,
  Loader2, LogIn, Pencil, Trash2, MoreVertical, ExternalLink,
  Download, CheckSquare, Square
} from 'lucide-react';
import api from '../services/api';

const STATUS_MAP: Record<string, string> = {
  active: 'active',
  trial: 'processed',
  pending: 'pending',
  suspended: 'inactive',
  rejected: 'rejected',
};

export default function TenantManagement() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'active' | 'inactive' | 'all'>('active');
  const [actionMenu, setActionMenu] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editTenant, setEditTenant] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const { data: tenants, isLoading } = useQuery({
    queryKey: ['tenants', tab, search],
    queryFn: () => api.get('/superadmin/legacy/tenants', {
      params: { search: search || undefined }
    }).then(r => r.data),
  });

  const activeTenants = tenants?.filter((t: any) => t.status === 'active' || t.status === 'trial') || [];
  const inactiveTenants = tenants?.filter((t: any) => t.status !== 'active' && t.status !== 'trial') || [];
  const visibleTenants = tab === 'active' ? activeTenants : tab === 'inactive' ? inactiveTenants : tenants || [];

  const approveMut = useMutation({
    mutationFn: (id: number) => api.post(`/superadmin/legacy/approve-tenant/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); toast.success('Tenant approved'); },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to approve'),
  });

  const rejectMut = useMutation({
    mutationFn: (id: number) => api.post(`/superadmin/legacy/reject-tenant/${id}?reason=Rejected by admin`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); toast.success('Tenant rejected'); },
  });

  const suspendMut = useMutation({
    mutationFn: (id: number) => api.patch(`/superadmin/legacy/tenants/${id}/suspend`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); toast.success('Tenant suspended'); },
  });

  const activateMut = useMutation({
    mutationFn: (id: number) => api.patch(`/superadmin/legacy/tenants/${id}/activate`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); toast.success('Tenant activated'); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/superadmin/legacy/tenants/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setDeleteTarget(null);
      toast.success('Tenant deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete tenant'),
  });

  const impersonateMut = useMutation({
    mutationFn: (id: number) => api.post(`/superadmin/tenants/${id}/impersonate`),
    onSuccess: (res: any) => {
      const token = res.data?.token;
      if (!token) { toast.error('No impersonation token returned'); return; }
      const hrmsUrl = import.meta.env.VITE_HRMS_URL || 'http://localhost:5173';
      localStorage.setItem('impersonated_token', token);
      toast.success('Opened HRMS as tenant admin');
      window.open(`${hrmsUrl}?impersonate=1`, '_blank');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to impersonate'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/superadmin/legacy/tenants/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setEditTenant(null);
      toast.success('Tenant updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update tenant'),
  });

  const bulkSuspendMut = useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map(id => api.patch(`/superadmin/legacy/tenants/${id}/suspend`))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setSelectedIds(new Set());
      toast.success('Selected tenants suspended');
    },
    onError: () => toast.error('Bulk suspend failed'),
  });

  const bulkActivateMut = useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map(id => api.patch(`/superadmin/legacy/tenants/${id}/activate`))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setSelectedIds(new Set());
      toast.success('Selected tenants activated');
    },
    onError: () => toast.error('Bulk activate failed'),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map(id => api.delete(`/superadmin/legacy/tenants/${id}`))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setSelectedIds(new Set());
      toast.success('Selected tenants deleted');
    },
    onError: () => toast.error('Bulk delete failed'),
  });

  const openEdit = (t: any) => {
    setEditTenant(t);
    setEditForm({
      company_name: t.company_name || '',
      company_code: t.company_code || t.code || '',
      domain: t.domain || '',
      industry: t.industry || '',
      company_size: t.company_size || '',
      default_currency: t.default_currency || 'INR',
      timezone: t.timezone || 'UTC',
      country: t.country || 'India',
      pan_no: t.pan_no || '',
      tan_no: t.tan_no || '',
      gst_no: t.gst_no || '',
    });
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === visibleTenants.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleTenants.map((t: any) => t.id)));
    }
  };

  const exportCSV = () => {
    const headers = ['Company', 'Admin', 'Status', 'Plan', 'Employees', 'Created'];
    const rows = visibleTenants.map((t: any) => [
      t.company_name,
      t.admin_name || t.email,
      t.status,
      t.plan_name || 'Free Trial',
      `${t.employee_count || 0}/${t.max_employees || 10}`,
      t.created_at ? new Date(t.created_at).toLocaleDateString() : '-',
    ]);
    const csv = [headers, ...rows].map((r: string[]) => r.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tenants-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-page-enter">
      {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Tenant Management</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              {tab === 'all' ? `${tenants?.length || 0} organisations` : `${visibleTenants.length} ${tab}`}
              {selectedIds.size > 0 && <span className="ml-2 text-blue-600">• {selectedIds.size} selected</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 text-xs">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <Link to="/superadmin/tenants/new" className="btn-primary flex items-center gap-2">+ Create Tenant</Link>
          </div>
        </div>

      {/* Tabs + Search */}
      <div className="card card-body">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1">
            {(['active', 'inactive', 'all'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  background: tab === t ? 'var(--gradient-primary)' : 'transparent',
                  color: tab === t ? '#FFFFFF' : 'var(--text-secondary)',
                }}
              >
                {t === 'all' ? 'All' : t === 'active' ? 'Active' : 'Inactive'}{' '}
                <span className="ml-1 opacity-70">{t === 'active' ? activeTenants.length : t === 'inactive' ? inactiveTenants.length : tenants?.length || 0}</span>
              </button>
            ))}
          </div>
          <div className="relative">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="pl-9 pr-3 py-2 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              style={{
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                color: 'var(--text-primary)',
              }}
            />
            <Search className="absolute left-2.5 top-2.5 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 p-3 mb-4 rounded-lg" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <CheckSquare className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-700">{selectedIds.size} selected</span>
            <button onClick={() => bulkSuspendMut.mutate(Array.from(selectedIds))} disabled={bulkSuspendMut.isPending} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 hover:bg-gray-50 transition-colors">Suspend</button>
            <button onClick={() => bulkActivateMut.mutate(Array.from(selectedIds))} disabled={bulkActivateMut.isPending} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 hover:bg-gray-50 transition-colors">Activate</button>
            <button onClick={() => { if (confirm('Delete selected tenants?')) bulkDeleteMut.mutate(Array.from(selectedIds)); }} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors">Delete</button>
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="overflow-x-auto table-container">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="w-10">
                    <button onClick={toggleSelectAll} className="p-1 rounded hover:bg-gray-100 transition-colors">
                      {selectedIds.size === visibleTenants.length && visibleTenants.length > 0 ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-gray-400" />}
                    </button>
                  </th>
                  <th>Organisation</th>
                  <th>Admin</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>Employees</th>
                  <th>Last Login</th>
                  <th>Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleTenants.map((t: any) => (
                  <tr key={t.id} className={selectedIds.has(t.id) ? 'bg-blue-50/50' : ''}>
                    <td>
                      <button onClick={() => toggleSelect(t.id)} className="p-1 rounded hover:bg-gray-100 transition-colors">
                        {selectedIds.has(t.id) ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-gray-400" />}
                      </button>
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)' }}>
                          <Building2 className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <Link to={`/superadmin/tenants/${t.id}`} className="text-sm font-medium hover:text-blue-600 transition-colors" style={{ color: 'var(--text-heading)' }}>{t.company_name}</Link>
                          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t.industry || 'N/A'} &middot; {t.company_size || 'N/A'}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="text-sm" style={{ color: 'var(--text-body)' }}>{t.admin_name || t.email}</p>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t.admin_email || t.email}</p>
                    </td>
                    <td><span className={`status-badge ${STATUS_MAP[t.status] || 'draft'}`}>{t.status.charAt(0).toUpperCase() + t.status.slice(1)}</span></td>
                    <td>
                      <span className="text-sm" style={{ color: 'var(--text-body)' }}>{t.plan_name || 'Free Trial'}</span>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Max {t.max_employees || 10} emp</p>
                    </td>
                    <td>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>{t.total_employee_count || 0}</span>
                      <span className="text-xs block" style={{ color: 'var(--text-tertiary)' }}>total</span>
                    </td>
                    <td>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>{t.employee_count || 0}</span>
                      <span className="text-xs block" style={{ color: 'var(--success-text)' }}>active</span>
                    </td>
                    <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t.created_at ? new Date(t.created_at).toLocaleDateString() : '-'}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {t.status === 'pending' && (
                          <>
                            <button onClick={() => approveMut.mutate(t.id)} className="p-1.5 rounded-lg transition-colors" style={{ background: 'var(--success-bg)', color: 'var(--success-text)' }} title="Approve"><CheckCircle className="w-4 h-4" /></button>
                            <button onClick={() => rejectMut.mutate(t.id)} className="p-1.5 rounded-lg transition-colors" style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)' }} title="Reject"><XCircle className="w-4 h-4" /></button>
                          </>
                        )}
                        {t.status === 'active' && (
                          <button onClick={() => suspendMut.mutate(t.id)} className="p-1.5 rounded-lg transition-colors" style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)' }} title="Suspend"><PauseCircle className="w-4 h-4" /></button>
                        )}
                        {t.status === 'suspended' && (
                          <button onClick={() => activateMut.mutate(t.id)} className="p-1.5 rounded-lg transition-colors" style={{ background: 'var(--success-bg)', color: 'var(--success-text)' }} title="Activate"><PlayCircle className="w-4 h-4" /></button>
                        )}
                        <button onClick={() => impersonateMut.mutate(t.id)} disabled={impersonateMut.isPending}
                          className="p-1.5 rounded-lg transition-colors" style={{ background: 'rgba(59,130,246,0.08)', color: '#3B82F6' }} title="Open as tenant admin">
                          {impersonateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                        </button>
                        <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg transition-colors" style={{ background: 'rgba(59,130,246,0.08)', color: '#3B82F6' }} title="Edit"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteTarget(t)} className="p-1.5 rounded-lg transition-colors" style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)' }} title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleTenants.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-16 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    {tab === 'active' ? 'No active tenants found' : tab === 'inactive' ? 'No inactive tenants found' : 'No organisations found'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Tenant Modal */}
      {editTenant && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditTenant(null)}>
          <div className="card card-body w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Edit Tenant</h3>
              <button onClick={() => setEditTenant(null)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-tertiary)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Company Name *</label>
                  <input value={editForm.company_name || ''} onChange={e => setEditForm({ ...editForm, company_name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Company Code</label>
                  <input value={editForm.company_code || ''} onChange={e => setEditForm({ ...editForm, company_code: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Domain</label>
                  <input value={editForm.domain || ''} onChange={e => setEditForm({ ...editForm, domain: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Industry</label>
                  <input value={editForm.industry || ''} onChange={e => setEditForm({ ...editForm, industry: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Company Size</label>
                  <select value={editForm.company_size || ''} onChange={e => setEditForm({ ...editForm, company_size: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}>
                    <option value="">Select</option>
                    <option>1-10</option><option>10-50</option><option>50-200</option>
                    <option>200-500</option><option>500-1000</option><option>1000+</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Currency</label>
                  <select value={editForm.default_currency || 'INR'} onChange={e => setEditForm({ ...editForm, default_currency: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}>
                    <option value="INR">INR (₹)</option><option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option><option value="GBP">GBP (£)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Timezone</label>
                  <select value={editForm.timezone || 'UTC'} onChange={e => setEditForm({ ...editForm, timezone: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}>
                    <option value="Asia/Kolkata">Asia/Kolkata</option><option value="UTC">UTC</option>
                    <option value="Asia/Dubai">Asia/Dubai</option><option value="America/New_York">America/New_York</option>
                    <option value="Europe/London">Europe/London</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Country</label>
                  <select value={editForm.country || 'India'} onChange={e => setEditForm({ ...editForm, country: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}>
                    <option>India</option><option>United States</option><option>United Kingdom</option>
                    <option>United Arab Emirates</option><option>Singapore</option><option>Canada</option>
                    <option>Australia</option><option>Germany</option><option>Japan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>PAN No.</label>
                  <input value={editForm.pan_no || ''} onChange={e => setEditForm({ ...editForm, pan_no: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }} />
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>PAN of this organisation (required for Form 16)</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>TAN No.</label>
                  <input value={editForm.tan_no || ''} onChange={e => setEditForm({ ...editForm, tan_no: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }} />
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>Tax Deduction Account No. (required to file TDS &amp; issue Form 16)</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>GST No.</label>
                  <input value={editForm.gst_no || ''} onChange={e => setEditForm({ ...editForm, gst_no: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }} />
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>GST registration number of this organisation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateMut.mutate({ id: editTenant.id, data: editForm })}
                disabled={updateMut.isPending}
                className="w-full flex items-center justify-center gap-2 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateMut.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="card card-body w-full max-w-md" onClick={e => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Delete Tenant?</h3>
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
              This will permanently delete <span className="font-semibold">{deleteTarget.company_name}</span> and its organisation data. This action cannot be undone.
            </p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => deleteMut.mutate(deleteTarget.id)}
                className="flex-1 px-4 py-2.5 btn-danger disabled:opacity-50 disabled:cursor-not-allowed">
                {deleteMut.isPending ? 'Deleting...' : 'Delete Tenant'}
              </button>
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
