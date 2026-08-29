import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Building2, Mail, Globe, MapPin, Users, Calendar, DollarSign,
  Shield, CheckCircle, XCircle, PauseCircle, PlayCircle, ArrowLeft, Loader2,
  LogIn, Pencil, Trash2, CreditCard
} from 'lucide-react';
import api from '../services/api';

export default function TenantDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [planOpen, setPlanOpen] = useState(false);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant', id],
    queryFn: () => api.get('/superadmin/legacy/tenants').then((r: any) => r.data.find((t: any) => t.id === +id!)),
    enabled: !!id,
  });

  const { data: users } = useQuery({
    queryKey: ['tenant-users', id],
    queryFn: () => api.get('/settings/users', { params: { organizationId: id } }).then(r => r.data),
    enabled: !!id,
  });

  const approveMut = useMutation({
    mutationFn: () => api.post(`/superadmin/legacy/approve-tenant/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenant', id] }); toast.success('Approved'); },
  });

  const suspendMut = useMutation({
    mutationFn: () => api.patch(`/superadmin/legacy/tenants/${id}/suspend`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenant', id] }); toast.success('Suspended'); },
  });

  const activateMut = useMutation({
    mutationFn: () => api.patch(`/superadmin/legacy/tenants/${id}/activate`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenant', id] }); toast.success('Activated'); },
  });

  const impersonateMut = useMutation({
    mutationFn: () => api.post(`/superadmin/tenants/${id}/impersonate`),
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
    mutationFn: (data: any) => api.put(`/superadmin/legacy/tenants/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', id] });
      setEditOpen(false);
      toast.success('Tenant updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update'),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/superadmin/legacy/tenants/${id}`),
    onSuccess: () => { toast.success('Tenant deleted'); window.location.href = '/superadmin/tenants'; },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete'),
  });

  const changePlanMut = useMutation({
    mutationFn: ({ subscriptionId, planId }: { subscriptionId: number; planId: number }) =>
      api.patch(`/superadmin/legacy/subscriptions/${subscriptionId || 0}`, { plan_id: planId, organization_id: +id! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', id] });
      setPlanOpen(false);
      toast.success('Plan updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update plan'),
  });

  const openPlans = async () => {
    setPlanOpen(true);
    try {
      const res = await api.get('/superadmin/legacy/plans');
      setPlans(res.data || []);
    } catch { setPlans([]); }
  };

  const openEdit = () => {
    setEditForm({
      company_name: tenant.company_name || '',
      domain: tenant.domain || '',
      industry: tenant.industry || '',
      company_size: tenant.company_size || '',
      default_currency: tenant.default_currency || 'INR',
      timezone: tenant.timezone || 'UTC',
    });
    setEditOpen(true);
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  if (!tenant) return <div className="p-6 text-center text-gray-500">Tenant not found</div>;

  const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm";

  return (
    <div className="p-6 space-y-6">
      <Link to="/superadmin/tenants" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Back to Tenants
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{tenant.company_name}</h1>
              <p className="text-sm text-gray-500">{tenant.industry || 'N/A'} &middot; {tenant.company_size || 'N/A'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={import.meta.env.VITE_HRMS_URL || 'http://localhost:5173'}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
              Open HRMS
            </a>
            <button onClick={() => impersonateMut.mutate()} disabled={impersonateMut.isPending}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
              {impersonateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />} Login as Admin
            </button>
            <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              tenant.status === 'active' ? 'bg-green-50 text-green-700' :
              tenant.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
            }`}>{tenant.status}</span>
            {tenant.status === 'pending' && (
              <button onClick={() => approveMut.mutate()} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                <CheckCircle className="w-4 h-4" /> Approve
              </button>
            )}
            {tenant.status === 'active' && (
              <button onClick={() => suspendMut.mutate()} className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
                <PauseCircle className="w-4 h-4" /> Suspend
              </button>
            )}
            {tenant.status === 'suspended' && (
              <button onClick={() => activateMut.mutate()} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                <PlayCircle className="w-4 h-4" /> Activate
              </button>
            )}
            <button onClick={openEdit} className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">
              <Pencil className="w-4 h-4" /> Edit
            </button>
            <button onClick={() => setDeleteOpen(true)} className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Organisation Details</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Email', value: tenant.email, icon: Mail },
                { label: 'Domain', value: tenant.domain || '-', icon: Globe },
                { label: 'Code', value: tenant.company_code || tenant.code || '-', icon: Building2 },
                { label: 'State', value: tenant.registered_state || '-', icon: MapPin },
                { label: 'Legal Name', value: tenant.legal_name || '-', icon: Shield },
                { label: 'GST No', value: tenant.gst_no || '-', icon: Shield },
                { label: 'PAN', value: tenant.pan_no || '-', icon: Shield },
                { label: 'Created', value: tenant.created_at ? new Date(tenant.created_at).toLocaleDateString() : '-', icon: Calendar },
              ].map(f => (
                <div key={f.label} className="flex items-center gap-2 text-sm">
                  <f.icon className="w-4 h-4 text-gray-400" />
                  <div><p className="text-gray-500">{f.label}</p><p className="font-medium text-gray-900">{f.value}</p></div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Users ({users?.length || 0})</h2>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Name</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Email</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Role</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users?.map((u: any) => (
                  <tr key={u.id}>
                    <td className="px-3 py-3 text-sm font-medium text-gray-900">{u.fullName || u.name || '-'}</td>
                    <td className="px-3 py-3 text-sm text-gray-500">{u.email}</td>
                    <td className="px-3 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{u.role}</span></td>
                    <td className="px-3 py-3">{u.is_active ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}</td>
                  </tr>
                ))}
                {(!users || users.length === 0) && (
                  <tr><td colSpan={4} className="text-center py-8 text-sm text-gray-400">No users in this organisation</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Subscription</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Plan</span><span className="font-medium">{tenant.plan_name || 'Free Trial'}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Employees</span><span className="font-medium">{tenant.employee_count || 0} / {tenant.max_employees || 10}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Last Login</span><span className="font-medium">{tenant.last_login ? new Date(tenant.last_login).toLocaleDateString() : 'Never'}</span></div>
            </div>
            <button onClick={openPlans} className="mt-4 w-full flex items-center justify-center gap-1 text-center text-sm text-blue-600 font-medium hover:text-blue-700">
              <CreditCard className="w-4 h-4" /> Change Plan
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Modules</h2>
            <div className="space-y-2">
              {(tenant.modules || ['employees', 'attendance', 'leave', 'payroll']).map((m: string) => (
                <div key={m} className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Tenant Modal */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Edit Tenant</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                <input value={editForm.company_name || ''} onChange={e => setEditForm({ ...editForm, company_name: e.target.value })} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
                  <input value={editForm.domain || ''} onChange={e => setEditForm({ ...editForm, domain: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                  <input value={editForm.industry || ''} onChange={e => setEditForm({ ...editForm, industry: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Size</label>
                  <input value={editForm.company_size || ''} onChange={e => setEditForm({ ...editForm, company_size: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <input value={editForm.default_currency || ''} onChange={e => setEditForm({ ...editForm, default_currency: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                  <input value={editForm.timezone || ''} onChange={e => setEditForm({ ...editForm, timezone: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => updateMut.mutate(editForm)}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
                  {updateMut.isPending ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setEditOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Plan Modal */}
      {planOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Change Plan for {tenant.company_name}</h3>
            <div className="space-y-3">
              {plans.map((p: any) => (
                <button key={p.id}
                  onClick={() => changePlanMut.mutate({ subscriptionId: tenant.subscription_id, planId: p.id })}
                  disabled={changePlanMut.isPending}
                  className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50">
                  <span className="text-sm font-medium text-gray-900">{p.display_name || p.name}</span>
                  <span className="text-sm text-gray-500">Rs.{p.price_monthly}/mo</span>
                </button>
              ))}
              {plans.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No plans available.</p>}
              {tenant.subscription_id == null && (
                <p className="text-xs text-amber-600 text-center">This tenant has no subscription yet. Assign a plan to create one.</p>
              )}
            </div>
            <button onClick={() => setPlanOpen(false)}
              className="w-full mt-4 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">Cancel</button>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900">Delete Tenant?</h3>
            <p className="text-sm text-gray-500 mt-2">
              This will permanently delete <span className="font-semibold">{tenant.company_name}</span> and all its data. This cannot be undone.
            </p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => deleteMut.mutate()}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700">
                {deleteMut.isPending ? 'Deleting...' : 'Delete Tenant'}
              </button>
              <button onClick={() => setDeleteOpen(false)}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
