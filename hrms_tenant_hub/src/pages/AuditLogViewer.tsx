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
    <div className="p-6 space-y-6 animate-page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Audit Logs</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Track all system activities</p>
        </div>
        <button className="btn-secondary flex items-center gap-2">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="flex flex-wrap gap-3">
            <input placeholder="User ID" value={filters.userId} onChange={e => setFilters(f => ({ ...f, userId: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }} />
            <select value={filters.module} onChange={e => setFilters(f => ({ ...f, module: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}>
              <option value="">All Modules</option>
              <option value="billing">Billing</option>
              <option value="superadmin">SuperAdmin</option>
              <option value="employees">Employees</option>
              <option value="payroll">Payroll</option>
              <option value="attendance">Attendance</option>
              <option value="leave">Leave</option>
            </select>
            <select value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}>
              <option value="">All Actions</option>
              <option value="CREATE_TENANT">Create Tenant</option>
              <option value="APPROVE_TENANT">Approve Tenant</option>
              <option value="REJECT_TENANT">Reject Tenant</option>
              <option value="UPDATE_ORGANIZATION">Update Org</option>
              <option value="IMPERSONATE_USER">Impersonate</option>
            </select>
          </div>
        </div>
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--primary-blue)' }} /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Module</th>
                <th>Entity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs?.map((log: any) => (
                <tr key={log.id}>
                  <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>{new Date(log.created_at).toLocaleString()}</td>
                  <td><span className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>{log.user_name || `User #${log.user_id}`}</span></td>
                  <td><span className="px-2 py-1 rounded-full text-xs font-medium" style={{ background: 'var(--active-blue-bg)', color: 'var(--primary-blue)' }}>{log.action}</span></td>
                  <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>{log.module}</td>
                  <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>{log.entity_type} #{log.entity_id}</td>
                  <td className="text-xs max-w-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {log.new_values ? Object.entries(log.new_values).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(', ') : '-'}
                  </td>
                </tr>
              ))}
              {(!logs || logs.length === 0) && (
                <tr><td colSpan={6} className="text-center py-16 text-sm" style={{ color: 'var(--text-tertiary)' }}>No audit logs found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
