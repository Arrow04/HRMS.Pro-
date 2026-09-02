import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Building2, Search, CheckCircle, XCircle, PauseCircle, PlayCircle,
  Loader2, LogIn, Pencil, Trash2, MoreVertical, ExternalLink
} from 'lucide-react';
import api from '../services/api';

export default function TenantManagement() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'active' | 'inactive' | 'all'>('active');
  const [actionMenu, setActionMenu] = useState<number | null>(null);
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

  const getStatusBadge = (status: string) => {
    const styles: any = {
      active: 'bg-green-50 text-green-700 border-green-200',
      pending: 'bg-amber-50 text-amber-700 border-amber-200',
      suspended: 'bg-red-50 text-red-700 border-red-200',
      rejected: 'bg-gray-50 text-gray-500 border-gray-200',
      trial: 'bg-blue-50 text-blue-700 border-blue-200',
    };
    return `px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status] || 'bg-gray-50 text-gray-600'}`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenant Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            {tab === 'all' ? `${tenants?.length || 0} organisations` : `${visibleTenants.length} ${tab}`}
          </p>
        </div>
        <Link to="/superadmin/tenants/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ Create Tenant</Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <div className="flex items-center bg-gray-100 rounded-lg p-1">
          {(['active', 'inactive', 'all'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'all' ? 'All' : t === 'active' ? 'Active' : 'Inactive'}
            </button>
          ))}
        </div>
        {(search) && (
          <button onClick={() => setSearch('')}
            className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors text-sm font-medium"
            title="Clear search">
            Clear
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Organisation</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Admin</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total Emp</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Active Emp</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Created</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibleTenants.map((t: any) => (
                <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <Link to={`/superadmin/tenants/${t.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">{t.company_name}</Link>
                        <p className="text-xs text-gray-400">{t.industry || 'N/A'} &middot; {t.company_size || 'N/A'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-gray-700">{t.admin_name || t.email}</p>
                    <p className="text-xs text-gray-400">{t.admin_email || t.email}</p>
                  </td>
                   <td className="px-4 py-4"><span className={getStatusBadge(t.status)}>{t.status.charAt(0).toUpperCase() + t.status.slice(1)}</span></td>
                  <td className="px-4 py-4">
                    <span className="text-sm text-gray-700">{t.plan_name || 'Free Trial'}</span>
                    <p className="text-xs text-gray-400">Max {t.max_employees || 10} emp</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm font-medium text-gray-900">{t.total_employee_count || 0}</span>
                    <span className="text-xs text-gray-400 block">total</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm font-medium text-gray-900">{t.employee_count || 0}</span>
                    <span className="text-xs text-green-600 block">active</span>
                  </td>
                  <td className="px-4 py-4"><span className="text-sm text-gray-500">{t.created_at ? new Date(t.created_at).toLocaleDateString() : '-'}</span></td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {t.status === 'pending' && (
                        <>
                          <button onClick={() => approveMut.mutate(t.id)} className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100" title="Approve"><CheckCircle className="w-4 h-4" /></button>
                          <button onClick={() => rejectMut.mutate(t.id)} className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100" title="Reject"><XCircle className="w-4 h-4" /></button>
                        </>
                      )}
                      {t.status === 'active' && (
                        <button onClick={() => suspendMut.mutate(t.id)} className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100" title="Suspend"><PauseCircle className="w-4 h-4" /></button>
                      )}
                      {t.status === 'suspended' && (
                        <button onClick={() => activateMut.mutate(t.id)} className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100" title="Activate"><PlayCircle className="w-4 h-4" /></button>
                      )}
                      <button onClick={() => impersonateMut.mutate(t.id)} disabled={impersonateMut.isPending}
                        className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100" title="Open as tenant admin">
                        {impersonateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                      </button>
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100" title="Edit"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteTarget(t)} className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100" title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleTenants.length === 0 && (
                <tr><td colSpan={7} className="text-center py-16 text-sm text-gray-400">
                  {tab === 'active' ? 'No active tenants found' : tab === 'inactive' ? 'No inactive tenants found' : 'No organisations found'}
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Tenant Modal */}
      {editTenant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit Tenant</h3>
              <button onClick={() => setEditTenant(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-500" /> Organisation Details
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Company Name *</label>
                    <input value={editForm.company_name || ''} onChange={e => setEditForm({ ...editForm, company_name: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Company Code</label>
                    <input value={editForm.company_code || ''} onChange={e => setEditForm({ ...editForm, company_code: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Domain</label>
                    <input value={editForm.domain || ''} onChange={e => setEditForm({ ...editForm, domain: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Industry</label>
                    <input value={editForm.industry || ''} onChange={e => setEditForm({ ...editForm, industry: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Company Size</label>
                    <select value={editForm.company_size || ''} onChange={e => setEditForm({ ...editForm, company_size: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all">
                      <option value="">Select</option>
                      <option>1-10</option><option>10-50</option><option>50-200</option>
                      <option>200-500</option><option>500-1000</option><option>1000+</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Currency</label>
                    <select value={editForm.default_currency || 'INR'} onChange={e => setEditForm({ ...editForm, default_currency: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all">
                      <option value="INR">INR (₹)</option><option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option><option value="GBP">GBP (£)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Timezone</label>
                    <select value={editForm.timezone || 'UTC'} onChange={e => setEditForm({ ...editForm, timezone: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all">
                      <option value="Asia/Kolkata">Asia/Kolkata</option><option value="UTC">UTC</option>
                      <option value="Asia/Dubai">Asia/Dubai</option><option value="America/New_York">America/New_York</option>
                      <option value="Europe/London">Europe/London</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Country</label>
                    <select value={editForm.country || 'India'} onChange={e => setEditForm({ ...editForm, country: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all">
                      <option>India</option><option>United States</option><option>United Kingdom</option>
                      <option>United Arab Emirates</option><option>Singapore</option><option>Canada</option>
                      <option>Australia</option><option>Germany</option><option>Japan</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">PAN No.</label>
                    <input value={editForm.pan_no || ''} onChange={e => setEditForm({ ...editForm, pan_no: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" />
                    <p className="text-[11px] text-gray-400 mt-1">PAN of this organisation (required for Form 16)</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">TAN No.</label>
                    <input value={editForm.tan_no || ''} onChange={e => setEditForm({ ...editForm, tan_no: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" />
                    <p className="text-[11px] text-gray-400 mt-1">Tax Deduction Account No. (required to file TDS &amp; issue Form 16)</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">GST No.</label>
                    <input value={editForm.gst_no || ''} onChange={e => setEditForm({ ...editForm, gst_no: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" />
                    <p className="text-[11px] text-gray-400 mt-1">GST registration number of this organisation</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateMut.mutate({ id: editTenant.id, data: editForm })}
                disabled={updateMut.isPending}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-blue-900/20"
              >
                {updateMut.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900">Delete Tenant?</h3>
            <p className="text-sm text-gray-500 mt-2">
              This will permanently delete <span className="font-semibold">{deleteTarget.company_name}</span> and its organisation data. This action cannot be undone.
            </p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => deleteMut.mutate(deleteTarget.id)}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700">
                {deleteMut.isPending ? 'Deleting...' : 'Delete Tenant'}
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
