import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ToggleLeft, ToggleRight, Plus, Loader2, Flag, Pencil, Trash2 } from 'lucide-react';
import api from '../services/api';

export default function FeatureFlags() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editFlag, setEditFlag] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [form, setForm] = useState({ flag: '', description: '', enabled: true });

  const { data: flags, isLoading } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: () => api.get('/superadmin/legacy/feature-flags').then(r => r.data),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: any) => api.patch(`/superadmin/legacy/feature-flags/${id}?enabled=${!enabled}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['feature-flags'] }); toast.success('Toggled'); },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed'),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => api.post('/superadmin/legacy/feature-flags', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['feature-flags'] }); setShowForm(false); setEditFlag(null); toast.success('Flag created'); },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/superadmin/legacy/feature-flags/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['feature-flags'] }); setShowForm(false); setEditFlag(null); toast.success('Flag updated'); },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/superadmin/legacy/feature-flags/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['feature-flags'] }); setDeleteTarget(null); toast.success('Flag deleted'); },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed'),
  });

  const openCreate = () => {
    setEditFlag(null);
    setForm({ flag: '', description: '', enabled: true });
    setShowForm(true);
  };

  const openEdit = (f: any) => {
    setEditFlag(f);
    setForm({ flag: f.flag || '', description: f.description || '', enabled: !!f.enabled });
    setShowForm(true);
  };

  const save = () => {
    if (editFlag) updateMut.mutate({ id: editFlag.id, data: form });
    else createMut.mutate(form);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Feature Flags</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Toggle features globally or per-tenant</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Flag
        </button>
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Scope</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {flags?.map((f: any) => (
                  <tr key={f.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Flag className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                        <span className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>{f.flag}</span>
                      </div>
                    </td>
                    <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>{f.description || '-'}</td>
                    <td>
                      <span className={`status-badge ${f.enabled ? 'active' : 'draft'}`}>
                        {f.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>{f.organization_id ? `Org #${f.organization_id}` : 'Global'}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => toggleMut.mutate({ id: f.id, enabled: f.enabled })}
                          className="p-2 rounded-lg transition-colors"
                          style={{
                            background: f.enabled ? 'var(--success-bg)' : 'var(--muted-bg)',
                            color: f.enabled ? 'var(--success-text)' : 'var(--text-tertiary)',
                          }}>
                          {f.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button onClick={() => openEdit(f)} className="p-2 rounded-lg transition-colors"
                          style={{ background: 'rgba(59,130,246,0.08)', color: '#3B82F6' }}>
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteTarget(f)} className="p-2 rounded-lg transition-colors"
                          style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)' }}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!flags || flags.length === 0) && (
                  <tr><td colSpan={5} className="text-center py-16 text-sm" style={{ color: 'var(--text-tertiary)' }}>No feature flags configured</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card card-body w-full max-w-md" style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>{editFlag ? 'Edit Feature Flag' : 'Add Feature Flag'}</h3>
            <div className="space-y-4">
              <input value={form.flag} onChange={e => setForm(f => ({ ...f, flag: e.target.value }))} placeholder="Flag name"
                disabled={!!editFlag}
                className="w-full px-3 py-2 rounded-lg text-sm disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }} />
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description"
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }} />
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
                <span className="text-sm" style={{ color: 'var(--text-body)' }}>Enabled</span>
              </label>
              <div className="flex gap-3">
                <button onClick={save} className="flex-1 btn-primary">
                  {(createMut.isPending || updateMut.isPending) ? 'Saving...' : editFlag ? 'Update' : 'Create'}
                </button>
                <button onClick={() => { setShowForm(false); setEditFlag(null); }}
                  className="flex-1 btn-secondary">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card card-body w-full max-w-md" style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Delete Feature Flag?</h3>
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
              This will permanently delete the <span className="font-semibold">{deleteTarget.flag}</span> flag.
            </p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => deleteMut.mutate(deleteTarget.id)}
                className="flex-1 btn-danger">
                {deleteMut.isPending ? 'Deleting...' : 'Delete Flag'}
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
