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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Feature Flags</h1>
          <p className="text-sm text-gray-500 mt-1">Toggle features globally or per-tenant</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Add Flag
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Flag</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Description</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Scope</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {flags?.map((f: any) => (
                <tr key={f.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Flag className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-900">{f.flag}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">{f.description || '-'}</td>
                  <td className="px-4 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${f.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                      {f.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">{f.organization_id ? `Org #${f.organization_id}` : 'Global'}</td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => toggleMut.mutate({ id: f.id, enabled: f.enabled })}
                        className={`p-2 rounded-lg ${f.enabled ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>
                        {f.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button onClick={() => openEdit(f)} className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteTarget(f)} className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(!flags || flags.length === 0) && (
                <tr><td colSpan={5} className="text-center py-16 text-sm text-gray-400">No feature flags configured</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">{editFlag ? 'Edit Feature Flag' : 'Add Feature Flag'}</h3>
            <div className="space-y-4">
              <input value={form.flag} onChange={e => setForm(f => ({ ...f, flag: e.target.value }))} placeholder="Flag name"
                disabled={!!editFlag}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50" />
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
                <span className="text-sm">Enabled</span>
              </label>
              <div className="flex gap-3">
                <button onClick={save}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
                  {(createMut.isPending || updateMut.isPending) ? 'Saving...' : editFlag ? 'Update' : 'Create'}
                </button>
                <button onClick={() => { setShowForm(false); setEditFlag(null); }}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900">Delete Feature Flag?</h3>
            <p className="text-sm text-gray-500 mt-2">
              This will permanently delete the <span className="font-semibold">{deleteTarget.flag}</span> flag.
            </p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => deleteMut.mutate(deleteTarget.id)}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700">
                {deleteMut.isPending ? 'Deleting...' : 'Delete Flag'}
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
