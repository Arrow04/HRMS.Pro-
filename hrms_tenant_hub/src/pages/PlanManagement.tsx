import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit3, Trash2, Save, XCircle, Loader2, CheckCircle2, Users, CreditCard, Calendar, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

interface Plan {
  id: number;
  name: string;
  display_name: string;
  price_monthly: number;
  price_yearly: number;
  max_employees: number;
  features: string[];
  is_active: boolean;
  created_at: string;
}

const emptyPlan: Omit<Plan, 'id' | 'created_at'> = {
  name: '',
  display_name: '',
  price_monthly: 0,
  price_yearly: 0,
  max_employees: 10,
  features: [],
  is_active: true,
};

const inputStyle = {
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  color: 'var(--text-primary)',
};

const labelCls = "block text-xs font-semibold mb-1.5 uppercase tracking-wider";
const inputCls = "w-full px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all";

export default function PlanManagement() {
  const queryClient = useQueryClient();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [newPlan, setNewPlan] = useState<any>({ ...emptyPlan });
  const [featureInput, setFeatureInput] = useState('');

  const { data: fetchedPlans, isLoading, refetch } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/superadmin/legacy/plans').then(r => r.data),
  });

  useEffect(() => {
    if (fetchedPlans) setPlans(fetchedPlans);
  }, [fetchedPlans]);

  const createMut = useMutation({
    mutationFn: (data: any) => api.post('/superadmin/legacy/plans', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      setNewPlan({ ...emptyPlan });
      setCreating(false);
      toast.success('Plan created');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create plan'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/superadmin/legacy/plans/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      setEditingId(null);
      setEditForm(null);
      toast.success('Plan updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update plan'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/superadmin/legacy/plans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      toast.success('Plan deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete plan'),
  });

  const startEdit = (plan: Plan) => {
    setEditingId(plan.id);
    setEditForm({ ...plan, features: [...(plan.features || [])] });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const addFeature = (list: string[], setList: (v: string[]) => void) => {
    const val = featureInput.trim();
    if (val && !list.includes(val)) {
      setList([...list, val]);
      setFeatureInput('');
    }
  };

  const PlanCard = ({ plan, isEditing, editData, onStartEdit, onCancelEdit, onSaveEdit, onDelete }: any) => (
    <div className="card card-body transition-all" style={{ opacity: plan.is_active ? 1 : 0.75 }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>{plan.display_name}</h3>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{plan.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`status-badge ${plan.is_active ? 'active' : 'inactive'}`}>
            {plan.is_active ? 'Active' : 'Inactive'}
          </span>
          {!isEditing && (
            <>
              <button onClick={() => onStartEdit(plan)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; e.currentTarget.style.color = '#3B82F6'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)'; }} title="Edit"><Edit3 className="w-4 h-4" /></button>
              <button onClick={() => onDelete(plan.id)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-bg)'; e.currentTarget.style.color = 'var(--danger-text)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)'; }} title="Delete"><Trash2 className="w-4 h-4" /></button>
            </>
          )}
        </div>
      </div>

      {isEditing && editData ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Name</label>
              <input value={editData.name} onChange={e => onSaveEdit({ ...editData, name: e.target.value })}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Display Name</label>
              <input value={editData.display_name} onChange={e => onSaveEdit({ ...editData, display_name: e.target.value })}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Monthly Price (Rs.)</label>
              <input type="number" value={editData.price_monthly} onChange={e => onSaveEdit({ ...editData, price_monthly: parseFloat(e.target.value) || 0 })}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Yearly Price (Rs.)</label>
              <input type="number" value={editData.price_yearly} onChange={e => onSaveEdit({ ...editData, price_yearly: parseFloat(e.target.value) || 0 })}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Max Employees</label>
              <input type="number" value={editData.max_employees} onChange={e => onSaveEdit({ ...editData, max_employees: parseInt(e.target.value) || 0 })}
                className={inputCls} style={inputStyle} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2.5 cursor-pointer">
                <input type="checkbox" checked={!!editData.is_active} onChange={e => onSaveEdit({ ...editData, is_active: e.target.checked })} className="w-4 h-4 accent-blue-600" />
                <span className="text-sm" style={{ color: 'var(--text-body)' }}>Active</span>
              </label>
            </div>
          </div>
          <div>
            <label className={labelCls} style={{ color: 'var(--text-label)' }}>Features</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {(editData.features || []).map((feat: string) => (
                <span key={feat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                  style={{ background: 'var(--active-blue-bg)', color: 'var(--primary-blue)', border: '1px solid rgba(59,130,246,0.15)' }}>
                  {feat}
                  <button onClick={() => onSaveEdit({ ...editData, features: editData.features.filter((f: string) => f !== feat) })}
                    className="transition-colors" style={{ color: 'var(--text-tertiary)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger-text)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}>
                    <XCircle className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={featureInput}
                onChange={e => setFeatureInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeature(editData.features, (v: string[]) => onSaveEdit({ ...editData, features: v })); }}}
                placeholder="Add feature..."
                className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                style={inputStyle}
              />
              <button onClick={() => addFeature(editData.features, (v: string[]) => onSaveEdit({ ...editData, features: v }))}
                className="btn-primary px-3 py-2 text-xs">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => updateMut.mutate({ id: plan.id, data: editData })} disabled={updateMut.isPending}
              className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {updateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
            <button onClick={onCancelEdit} className="btn-secondary">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Monthly</p>
                <p className="font-semibold" style={{ color: 'var(--text-heading)' }}>Rs.{plan.price_monthly.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Yearly</p>
                <p className="font-semibold" style={{ color: 'var(--text-heading)' }}>Rs.{plan.price_yearly.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <div>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Max Employees</p>
              <p className="font-semibold" style={{ color: 'var(--text-heading)' }}>{plan.max_employees.toLocaleString()}</p>
            </div>
          </div>
          <div>
            <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>Features</p>
            <div className="flex flex-wrap gap-1.5">
              {(plan.features || []).slice(0, 6).map((feat: string) => (
                <span key={feat} className="px-2 py-1 rounded-md text-xs"
                  style={{ background: 'var(--muted-bg)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>{feat}</span>
              ))}
              {(plan.features?.length || 0) > 6 && (
                <span className="px-2 py-1 rounded-md text-xs" style={{ background: 'var(--muted-bg)', color: 'var(--text-tertiary)' }}>+{(plan.features?.length || 0) - 6} more</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Plans</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Create and manage subscription plans</p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Plan
          </button>
        )}
      </div>

      {creating && (
        <div className="card card-body">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <Wand2 className="w-4 h-4 text-blue-500" /> Create New Plan
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Name *</label>
              <input value={newPlan.name} onChange={e => setNewPlan({ ...newPlan, name: e.target.value })}
                className={inputCls} style={inputStyle} placeholder="e.g. pro" />
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Display Name *</label>
              <input value={newPlan.display_name} onChange={e => setNewPlan({ ...newPlan, display_name: e.target.value })}
                className={inputCls} style={inputStyle} placeholder="e.g. Pro Plan" />
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Monthly Price</label>
              <input type="number" value={newPlan.price_monthly} onChange={e => setNewPlan({ ...newPlan, price_monthly: parseFloat(e.target.value) || 0 })}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Yearly Price</label>
              <input type="number" value={newPlan.price_yearly} onChange={e => setNewPlan({ ...newPlan, price_yearly: parseFloat(e.target.value) || 0 })}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: 'var(--text-label)' }}>Max Employees</label>
              <input type="number" value={newPlan.max_employees} onChange={e => setNewPlan({ ...newPlan, max_employees: parseInt(e.target.value) || 0 })}
                className={inputCls} style={inputStyle} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2.5 cursor-pointer">
                <input type="checkbox" checked={newPlan.is_active} onChange={e => setNewPlan({ ...newPlan, is_active: e.target.checked })} className="w-4 h-4 accent-blue-600" />
                <span className="text-sm" style={{ color: 'var(--text-body)' }}>Active</span>
              </label>
            </div>
          </div>
          <div className="mt-4">
            <label className={labelCls} style={{ color: 'var(--text-label)' }}>Features</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {(newPlan.features || []).map((feat: string) => (
                <span key={feat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                  style={{ background: 'var(--active-blue-bg)', color: 'var(--primary-blue)', border: '1px solid rgba(59,130,246,0.15)' }}>
                  {feat}
                  <button onClick={() => setNewPlan({ ...newPlan, features: newPlan.features.filter((f: string) => f !== feat) })}
                    className="transition-colors" style={{ color: 'var(--text-tertiary)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger-text)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}>
                    <XCircle className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={featureInput}
                onChange={e => setFeatureInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeature(newPlan.features, (v: string[]) => setNewPlan({ ...newPlan, features: v })); }}}
                placeholder="Add feature..."
                className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                style={inputStyle}
              />
              <button onClick={() => addFeature(newPlan.features, (v: string[]) => setNewPlan({ ...newPlan, features: v }))}
                className="btn-primary px-3 py-2 text-xs">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => createMut.mutate(newPlan)} disabled={createMut.isPending || !newPlan.name || !newPlan.display_name}
              className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Create Plan
            </button>
            <button onClick={() => { setCreating(false); setNewPlan({ ...emptyPlan }); }}
              className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {plans.map((plan: Plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isEditing={editingId === plan.id}
              editData={editingId === plan.id ? editForm : null}
              onStartEdit={startEdit}
              onCancelEdit={cancelEdit}
              onSaveEdit={setEditForm}
              onDelete={(id: number) => {
                if (window.confirm('Delete this plan? This cannot be undone.')) {
                  deleteMut.mutate(id);
                }
              }}
            />
          ))}
          {plans.length === 0 && (
            <div className="col-span-full text-center py-16 text-sm" style={{ color: 'var(--text-tertiary)' }}>
              No plans configured. Click "New Plan" to create one.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
