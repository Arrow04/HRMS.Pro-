import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Building2, Mail, Globe, MapPin, Shield, Calendar,
  CheckCircle, XCircle, PauseCircle, PlayCircle, ArrowLeft, Loader2,
  LogIn, Pencil, Trash2, CreditCard
} from 'lucide-react';
import api from '../services/api';

const STATUS_MAP: Record<string, string> = {
  active: 'active',
  trial: 'processed',
  pending: 'pending',
  suspended: 'inactive',
  rejected: 'rejected',
};

const inputStyle = {
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  color: 'var(--text-primary)',
};

const inputCls = "w-full px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all";
const labelCls = "block text-xs font-semibold mb-1.5 uppercase tracking-wider";

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
      const code = res.data?.code;
      if (!code) { toast.error('No impersonation code returned'); return; }
      const hrmsUrl = import.meta.env.VITE_HRMS_URL || 'http://localhost:5173';
      toast.success('Opened HRMS as tenant admin');
      window.open(`${hrmsUrl}/login?impersonate_code=${code}`, '_blank');
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
      company_code: tenant.company_code || tenant.code || '',
      domain: tenant.domain || '',
      industry: tenant.industry || '',
      company_size: tenant.company_size || '',
      default_currency: tenant.default_currency || 'INR',
      timezone: tenant.timezone || 'UTC',
      country: tenant.country || 'India',
      pan_no: tenant.pan_no || '',
      tan_no: tenant.tan_no || '',
      gst_no: tenant.gst_no || '',
    });
    setEditOpen(true);
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  if (!tenant) return <div className="p-6 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>Tenant not found</div>;

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-page-enter">
      <Link to="/superadmin/tenants" className="inline-flex items-center gap-1 text-sm hover:text-blue-600 transition-colors" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Tenants
      </Link>

      <div className="card card-body">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>{tenant.company_name}</h1>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{tenant.industry || 'N/A'} &middot; {tenant.company_size || 'N/A'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={import.meta.env.VITE_HRMS_URL || 'http://localhost:5173'}
              className="btn-primary px-3 py-1.5 text-xs">
              Open HRMS
            </a>
            <button onClick={() => impersonateMut.mutate()} disabled={impersonateMut.isPending}
              className="btn-primary px-3 py-1.5 text-xs flex items-center gap-1">
              {impersonateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />} Login as Admin
            </button>
            <span className={`status-badge ${STATUS_MAP[tenant.status] || 'draft'}`}>{tenant.status}</span>
            {tenant.status === 'pending' && (
              <button onClick={() => approveMut.mutate()} className="btn-primary px-3 py-1.5 text-sm flex items-center gap-1" style={{ background: 'var(--success-bg)', color: 'var(--success-text)', boxShadow: 'none' }}>
                <CheckCircle className="w-4 h-4" /> Approve
              </button>
            )}
            {tenant.status === 'active' && (
              <button onClick={() => suspendMut.mutate()} className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors"
                style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)', border: '1px solid var(--warning-border)' }}>
                <PauseCircle className="w-4 h-4" /> Suspend
              </button>
            )}
            {tenant.status === 'suspended' && (
              <button onClick={() => activateMut.mutate()} className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors"
                style={{ background: 'var(--success-bg)', color: 'var(--success-text)', border: '1px solid var(--success-border)' }}>
                <PlayCircle className="w-4 h-4" /> Activate
              </button>
            )}
            <button onClick={openEdit} className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-1">
              <Pencil className="w-4 h-4" /> Edit
            </button>
            <button onClick={() => setDeleteOpen(true)} className="btn-danger px-3 py-1.5 text-sm flex items-center gap-1">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card card-body">
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>Organisation Details</h2>
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
                  <f.icon className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                  <div>
                    <p style={{ color: 'var(--text-tertiary)' }}>{f.label}</p>
                    <p className="font-medium" style={{ color: 'var(--text-heading)' }}>{f.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card card-body">
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>Usage & Activity</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Total Employees', value: `${tenant.total_employee_count || tenant.employee_count || 0}` },
                { label: 'Active Employees', value: `${tenant.employee_count || 0}` },
                { label: 'Plan Limit', value: `${tenant.max_employees || 10}` },
                { label: 'Last Login', value: tenant.last_login ? new Date(tenant.last_login).toLocaleString() : 'Never' },
                { label: 'Status', value: tenant.status || '-' },
                { label: 'Plan', value: tenant.plan_name || 'Free Trial' },
              ].map((stat) => (
                <div key={stat.label} className="p-3 rounded-lg" style={{ background: 'var(--surface-secondary)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{stat.label}</p>
                  <p className="text-sm font-semibold mt-1" style={{ color: 'var(--text-heading)' }}>{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card card-body">
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>Users ({users?.length || 0})</h2>
            <div className="overflow-x-auto table-container" style={{ border: 'none', boxShadow: 'none' }}>
              <table className="w-full">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users?.map((u: any) => (
                    <tr key={u.id}>
                      <td className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>{u.fullName || u.name || '-'}</td>
                      <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                      <td><span className="status-badge processed">{u.role}</span></td>
                      <td>{u.is_active ? <CheckCircle className="w-4 h-4" style={{ color: 'var(--success-text)' }} /> : <XCircle className="w-4 h-4" style={{ color: 'var(--danger-text)' }} />}</td>
                    </tr>
                  ))}
                  {(!users || users.length === 0) && (
                    <tr><td colSpan={4} className="text-center py-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>No users in this organisation</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card card-body">
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>Subscription & Billing</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-tertiary)' }}>Plan</span>
                <span className="font-medium" style={{ color: 'var(--text-heading)' }}>{tenant.plan_name || 'Free Trial'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-tertiary)' }}>Employees</span>
                <span className="font-medium" style={{ color: 'var(--text-heading)' }}>{tenant.employee_count || 0} / {tenant.max_employees || 10}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-tertiary)' }}>Usage</span>
                <span className="font-medium" style={{ color: 'var(--text-heading)' }}>{Math.round(((tenant.employee_count || 0) / (tenant.max_employees || 10)) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${Math.min(100, Math.round(((tenant.employee_count || 0) / (tenant.max_employees || 10)) * 100))}%` }} />
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-tertiary)' }}>Last Login</span>
                <span className="font-medium" style={{ color: 'var(--text-heading)' }}>{tenant.last_login ? new Date(tenant.last_login).toLocaleString() : 'Never'}</span>
              </div>
            </div>
            <button onClick={openPlans} className="mt-4 w-full flex items-center justify-center gap-1 text-center text-sm font-medium hover:text-blue-600 transition-colors" style={{ color: '#3B82F6' }}>
              <CreditCard className="w-4 h-4" /> Change Plan
            </button>
          </div>

          <div className="card card-body">
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>Modules</h2>
            <div className="space-y-2">
              {(tenant.modules || ['employees', 'attendance', 'leave', 'payroll']).map((m: string) => (
                <div key={m} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-body)' }}>
                  <CheckCircle className="w-3.5 h-3.5" style={{ color: 'var(--success-text)' }} />
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {editOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card card-body w-full max-w-3xl max-h-[90vh] overflow-y-auto" style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Edit Tenant</h3>
              <button onClick={() => setEditOpen(false)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls} style={{ color: 'var(--text-label)' }}>Company Name *</label>
                  <input value={editForm.company_name || ''} onChange={e => setEditForm({ ...editForm, company_name: e.target.value })} className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: 'var(--text-label)' }}>Company Code</label>
                  <input value={editForm.company_code || ''} onChange={e => setEditForm({ ...editForm, company_code: e.target.value })} className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: 'var(--text-label)' }}>Domain</label>
                  <input value={editForm.domain || ''} onChange={e => setEditForm({ ...editForm, domain: e.target.value })} className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: 'var(--text-label)' }}>Industry</label>
                  <input value={editForm.industry || ''} onChange={e => setEditForm({ ...editForm, industry: e.target.value })} className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: 'var(--text-label)' }}>Company Size</label>
                  <select value={editForm.company_size || ''} onChange={e => setEditForm({ ...editForm, company_size: e.target.value })}
                    className={inputCls} style={inputStyle}>
                    <option value="">Select</option>
                    <option>1-10</option><option>10-50</option><option>50-200</option>
                    <option>200-500</option><option>500-1000</option><option>1000+</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls} style={{ color: 'var(--text-label)' }}>Currency</label>
                  <select value={editForm.default_currency || 'INR'} onChange={e => setEditForm({ ...editForm, default_currency: e.target.value })}
                    className={inputCls} style={inputStyle}>
                    <option value="INR">INR</option><option value="USD">USD ($)</option>
                    <option value="EUR">EUR</option><option value="GBP">GBP</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls} style={{ color: 'var(--text-label)' }}>Timezone</label>
                  <select value={editForm.timezone || 'UTC'} onChange={e => setEditForm({ ...editForm, timezone: e.target.value })}
                    className={inputCls} style={inputStyle}>
                    <option value="Asia/Kolkata">Asia/Kolkata</option><option value="UTC">UTC</option>
                    <option value="Asia/Dubai">Asia/Dubai</option><option value="America/New_York">America/New_York</option>
                    <option value="Europe/London">Europe/London</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls} style={{ color: 'var(--text-label)' }}>Country</label>
                  <select value={editForm.country || 'India'} onChange={e => setEditForm({ ...editForm, country: e.target.value })}
                    className={inputCls} style={inputStyle}>
                    <option>India</option><option>United States</option><option>United Kingdom</option>
                    <option>United Arab Emirates</option><option>Singapore</option><option>Canada</option>
                    <option>Australia</option><option>Germany</option><option>Japan</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls} style={{ color: 'var(--text-label)' }}>PAN No.</label>
                  <input value={editForm.pan_no || ''} onChange={e => setEditForm({ ...editForm, pan_no: e.target.value })} className={inputCls} style={inputStyle} />
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>PAN of this organisation (required for Form 16)</p>
                </div>
                <div>
                  <label className={labelCls} style={{ color: 'var(--text-label)' }}>TAN No.</label>
                  <input value={editForm.tan_no || ''} onChange={e => setEditForm({ ...editForm, tan_no: e.target.value })} className={inputCls} style={inputStyle} />
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>Tax Deduction Account No. (required to file TDS &amp; issue Form 16)</p>
                </div>
                <div>
                  <label className={labelCls} style={{ color: 'var(--text-label)' }}>GST No.</label>
                  <input value={editForm.gst_no || ''} onChange={e => setEditForm({ ...editForm, gst_no: e.target.value })} className={inputCls} style={inputStyle} />
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>GST registration number of this organisation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateMut.mutate(editForm)}
                disabled={updateMut.isPending}
                className="w-full flex items-center justify-center gap-2 btn-primary disabled:opacity-50 disabled:cursor-not-allowed py-3.5"
              >
                {updateMut.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {planOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card card-body w-full max-w-lg" style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>Change Plan for {tenant.company_name}</h3>
            <div className="space-y-3">
              {plans.map((p: any) => (
                <button key={p.id}
                  onClick={() => changePlanMut.mutate({ subscriptionId: tenant.subscription_id, planId: p.id })}
                  disabled={changePlanMut.isPending}
                  className="w-full flex items-center justify-between p-3 rounded-xl transition-colors disabled:opacity-50"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border-color)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.background = 'var(--hover-bg)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--surface)'; }}>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>{p.display_name || p.name}</span>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Rs.{p.price_monthly}/mo</span>
                </button>
              ))}
              {plans.length === 0 && <p className="text-sm text-center py-4" style={{ color: 'var(--text-tertiary)' }}>No plans available.</p>}
              {tenant.subscription_id == null && (
                <p className="text-xs text-center" style={{ color: 'var(--warning-text)' }}>This tenant has no subscription yet. Assign a plan to create one.</p>
              )}
            </div>
            <button onClick={() => setPlanOpen(false)}
              className="w-full mt-4 btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card card-body w-full max-w-md" style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Delete Tenant?</h3>
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
              This will permanently delete <span className="font-semibold">{tenant.company_name}</span> and all its data. This cannot be undone.
            </p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => deleteMut.mutate()}
                className="flex-1 btn-danger">
                {deleteMut.isPending ? 'Deleting...' : 'Delete Tenant'}
              </button>
              <button onClick={() => setDeleteOpen(false)}
                className="flex-1 btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
