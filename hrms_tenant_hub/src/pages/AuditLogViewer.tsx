import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Download, Loader2 } from 'lucide-react';
import api from '../services/api';

export default function AuditLogViewer() {
  const [filters, setFilters] = useState({ userId: '', module: '', action: '', limit: 100 });

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => api.get('/superadmin/legacy/audit-logs', { params: filters }).then(r => r.data),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-1">Track all system activities</p>
        </div>
        <button className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input placeholder="User ID" value={filters.userId} onChange={e => setFilters(f => ({ ...f, userId: e.target.value }))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        <select value={filters.module} onChange={e => setFilters(f => ({ ...f, module: e.target.value }))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">All Modules</option>
          <option value="billing">Billing</option>
          <option value="superadmin">SuperAdmin</option>
          <option value="employees">Employees</option>
          <option value="payroll">Payroll</option>
          <option value="attendance">Attendance</option>
          <option value="leave">Leave</option>
        </select>
        <select value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">All Actions</option>
          <option value="CREATE_TENANT">Create Tenant</option>
          <option value="APPROVE_TENANT">Approve Tenant</option>
          <option value="REJECT_TENANT">Reject Tenant</option>
          <option value="UPDATE_ORGANIZATION">Update Org</option>
          <option value="IMPERSONATE_USER">Impersonate</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Module</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Entity</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs?.map((log: any) => (
                <tr key={log.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3"><span className="text-sm text-gray-700">{log.user_name || `User #${log.user_id}`}</span></td>
                  <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{log.action}</span></td>
                  <td className="px-4 py-3 text-sm text-gray-600">{log.module}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{log.entity_type} #{log.entity_id}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-xs truncate">
                    {log.new_values ? Object.entries(log.new_values).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(', ') : '-'}
                  </td>
                </tr>
              ))}
              {(!logs || logs.length === 0) && (
                <tr><td colSpan={6} className="text-center py-16 text-sm text-gray-400">No audit logs found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
