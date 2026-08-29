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
  const [filter, setFilter] = useState('all');
  const [actionMenu, setActionMenu] = useState<number | null>(null);
  const [editTenant, setEditTenant] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const { data: tenants, isLoading } = useQuery({
    queryKey: ['tenants', filter, search],
    queryFn: () => api.get('/superadmin/legacy/tenants', {
      params: { status: filter !== 'all' ? filter : undefined, search: search || undefined }
    }).then(r => r.data),
  });

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
      domain: t.domain || '',
      industry: t.industry || '',
      company_size: t.company_size || '',
      default_currency: t.default_currency || 'INR',
      timezone: t.timezone || 'UTC',
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
          <p className="text-sm text-gray-500 mt-1">{tenants?.length || 0} organisations</p>
        </div>
        <Link to="/superadmin/tenants/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ Create Tenant</Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
        </select>
        {(filter !== 'all' || search) && (
          <button onClick={() => { setFilter('all'); setSearch(''); }}
            className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors text-sm font-medium"
            title="Clear Filters">
            Clear Filters
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Employees</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Created</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tenants?.map((t: any) => (
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
                  <td className="px-4 py-4"><span className={getStatusBadge(t.status)}>{t.status}</span></td>
                  <td className="px-4 py-4">
                    <span className="text-sm text-gray-700">{t.plan_name || 'Free Trial'}</span>
                    <p className="text-xs text-gray-400">Max {t.max_employees || 10} emp</p>
                  </td>
                  <td className="px-4 py-4"><span className="text-sm font-medium text-gray-900">{t.employee_count || 0}</span></td>
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
              {(!tenants || tenants.length === 0) && (
                <tr><td colSpan={7} className="text-center py-16 text-sm text-gray-400">No organisations found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Tenant Modal */}
      {editTenant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Edit Tenant</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                <input value={editForm.company_name || ''} onChange={e => setEditForm({ ...editForm, company_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
                  <input value={editForm.domain || ''} onChange={e => setEditForm({ ...editForm, domain: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                  <input value={editForm.industry || ''} onChange={e => setEditForm({ ...editForm, industry: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Size</label>
                  <input value={editForm.company_size || ''} onChange={e => setEditForm({ ...editForm, company_size: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <input value={editForm.default_currency || ''} onChange={e => setEditForm({ ...editForm, default_currency: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                  <input value={editForm.timezone || ''} onChange={e => setEditForm({ ...editForm, timezone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => updateMut.mutate({ id: editTenant.id, data: editForm })}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
                  {updateMut.isPending ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setEditTenant(null)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">Cancel</button>
              </div>
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
