import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit3, Trash2, Save, XCircle, Loader2, CheckCircle2, Users, CreditCard, Calendar, Wand2, RotateCcw } from 'lucide-react';
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

  const removeFeature = (list: string[], setList: (v: string[]) => void, feat: string) => {
    setList(list.filter(f => f !== feat));
  };

  const PlanCard = ({ plan, isEditing, editData, onStartEdit, onCancelEdit, onSaveEdit, onDelete }: any) => (
    <div className={`bg-white rounded-xl border p-6 transition-all ${plan.is_active ? 'border-gray-200' : 'border-gray-100 opacity-75'}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{plan.display_name}</h3>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{plan.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {!plan.is_active && <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-500">Inactive</span>}
          {plan.is_active && <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-50 text-green-700">Active</span>}
          {!isEditing && (
            <>
              <button onClick={() => onStartEdit(plan)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-blue-600" title="Edit"><Edit3 className="w-4 h-4" /></button>
              <button onClick={() => onDelete(plan.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-red-600" title="Delete"><Trash2 className="w-4 h-4" /></button>
            </>
          )}
        </div>
      </div>

      {isEditing && editData ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Name</label>
              <input value={editData.name} onChange={e => onSaveEdit({ ...editData, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Display Name</label>
              <input value={editData.display_name} onChange={e => onSaveEdit({ ...editData, display_name: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Monthly Price (Rs.)</label>
              <input type="number" value={editData.price_monthly} onChange={e => onSaveEdit({ ...editData, price_monthly: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Yearly Price (Rs.)</label>
              <input type="number" value={editData.price_yearly} onChange={e => onSaveEdit({ ...editData, price_yearly: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Max Employees</label>
              <input type="number" value={editData.max_employees} onChange={e => onSaveEdit({ ...editData, max_employees: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2.5 cursor-pointer">
                <input type="checkbox" checked={!!editData.is_active} onChange={e => onSaveEdit({ ...editData, is_active: e.target.checked })} className="w-4 h-4 accent-blue-600" />
                <span className="text-sm text-gray-700">Active</span>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Features</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {(editData.features || []).map((feat: string) => (
                <span key={feat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">
                  {feat}
                  <button onClick={() => onSaveEdit({ ...editData, features: editData.features.filter((f: string) => f !== feat) })} className="text-blue-400 hover:text-red-500">
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
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              <button onClick={() => addFeature(editData.features, (v: string[]) => onSaveEdit({ ...editData, features: v }))}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => updateMut.mutate({ id: plan.id, data: editData })} disabled={updateMut.isPending}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {updateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
            <button onClick={onCancelEdit} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CreditCard className="w-4 h-4 text-gray-400" />
              <div><p className="text-xs text-gray-400">Monthly</p><p className="font-semibold text-gray-900">Rs.{plan.price_monthly.toLocaleString()}</p></div>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="w-4 h-4 text-gray-400" />
              <div><p className="text-xs text-gray-400">Yearly</p><p className="font-semibold text-gray-900">Rs.{plan.price_yearly.toLocaleString()}</p></div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Users className="w-4 h-4 text-gray-400" />
            <div><p className="text-xs text-gray-400">Max Employees</p><p className="font-semibold text-gray-900">{plan.max_employees.toLocaleString()}</p></div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-2">Features</p>
            <div className="flex flex-wrap gap-1.5">
              {(plan.features || []).slice(0, 6).map((feat: string) => (
                <span key={feat} className="px-2 py-1 rounded-md bg-gray-50 text-gray-600 text-xs border border-gray-100">{feat}</span>
              ))}
              {(plan.features?.length || 0) > 6 && (
                <span className="px-2 py-1 rounded-md bg-gray-50 text-gray-500 text-xs">+{(plan.features?.length || 0) - 6} more</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plans</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage subscription plans</p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Plan
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-blue-500" /> Create New Plan
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Name *</label>
              <input value={newPlan.name} onChange={e => setNewPlan({ ...newPlan, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" placeholder="e.g. pro" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Display Name *</label>
              <input value={newPlan.display_name} onChange={e => setNewPlan({ ...newPlan, display_name: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" placeholder="e.g. Pro Plan" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Monthly Price</label>
              <input type="number" value={newPlan.price_monthly} onChange={e => setNewPlan({ ...newPlan, price_monthly: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Yearly Price</label>
              <input type="number" value={newPlan.price_yearly} onChange={e => setNewPlan({ ...newPlan, price_yearly: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Max Employees</label>
              <input type="number" value={newPlan.max_employees} onChange={e => setNewPlan({ ...newPlan, max_employees: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2.5 cursor-pointer">
                <input type="checkbox" checked={newPlan.is_active} onChange={e => setNewPlan({ ...newPlan, is_active: e.target.checked })} className="w-4 h-4 accent-blue-600" />
                <span className="text-sm text-gray-700">Active</span>
              </label>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">Features</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {(newPlan.features || []).map((feat: string) => (
                <span key={feat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">
                  {feat}
                  <button onClick={() => setNewPlan({ ...newPlan, features: newPlan.features.filter((f: string) => f !== feat) })} className="text-blue-400 hover:text-red-500">
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
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              <button onClick={() => addFeature(newPlan.features, (v: string[]) => setNewPlan({ ...newPlan, features: v }))}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => createMut.mutate(newPlan)} disabled={createMut.isPending || !newPlan.name || !newPlan.display_name}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Create Plan
            </button>
            <button onClick={() => { setCreating(false); setNewPlan({ ...emptyPlan }); }}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">Cancel</button>
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
            <div className="col-span-full text-center py-16 text-sm text-gray-400">
              No plans configured. Click "New Plan" to create one.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
