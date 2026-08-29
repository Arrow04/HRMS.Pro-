import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Shield, Plus, Loader2, Trash2, Copy } from 'lucide-react';
import api from '../services/api';

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [form, setForm] = useState({ email: '', name: '', password: '' });

  const { data: admins, isLoading } = useQuery({
    queryKey: ['superadmins'],
    queryFn: () => api.get('/superadmin/legacy/admins').then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => api.post('/superadmin/legacy/admins', data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['superadmins'] });
      setShowForm(false);
      setForm({ email: '', name: '', password: '' });
      toast.success('Superadmin created');
      navigator.clipboard?.writeText(res.data?.email || '').catch(() => {});
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/superadmin/legacy/admins/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['superadmins'] }); setDeleteTarget(null); toast.success('Superadmin deleted'); },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed'),
  });

  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast.success('Copied'));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Users</h1>
          <p className="text-sm text-gray-500 mt-1">Manage superadmin accounts</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Add Admin
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Created</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {admins?.map((a: any) => (
                <tr key={a.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                        <Shield className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">{a.name || a.email.split('@')[0]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">{a.email}</span>
                      <button onClick={() => copy(a.email)} className="text-gray-400 hover:text-gray-600"><Copy className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">{a.created_at ? new Date(a.created_at).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-4 text-right">
                    <button onClick={() => setDeleteTarget(a)} className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {(!admins || admins.length === 0) && (
                <tr><td colSpan={4} className="text-center py-16 text-sm text-gray-400">No superadmin accounts</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Add Superadmin</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="admin@hrms.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Full name" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password</label>
                <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Min 8 chars" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => {
                  if (!form.email || !form.password) { toast.error('Email and password are required'); return; }
                  createMut.mutate(form);
                }} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
                  {createMut.isPending ? 'Saving...' : 'Create Admin'}
                </button>
                <button onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900">Delete Superadmin?</h3>
            <p className="text-sm text-gray-500 mt-2">
              This will remove <span className="font-semibold">{deleteTarget.email}</span> from superadmin access.
            </p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => deleteMut.mutate(deleteTarget.id)}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700">
                {deleteMut.isPending ? 'Deleting...' : 'Delete Admin'}
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
