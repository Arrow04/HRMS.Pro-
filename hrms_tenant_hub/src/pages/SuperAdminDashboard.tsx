import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Building2, Activity, CreditCard, AlertCircle, CheckCircle,
  Clock, TrendingUp, RefreshCw, Server, HardDrive,
  Zap, Search, Loader2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import api from '../services/api';

const STAT_GRADIENTS: Record<string, string> = {
  blue:    'linear-gradient(135deg, #3B82F6, #2563EB)',
  green:   'linear-gradient(135deg, #10B981, #059669)',
  red:     'linear-gradient(135deg, #EF4444, #DC2626)',
  amber:   'linear-gradient(135deg, #F59E0B, #D97706)',
  purple:  'linear-gradient(135deg, #8B5CF6, #7C3AED)',
  emerald: 'linear-gradient(135deg, #10B981, #047857)',
};

export default function SuperAdminDashboard() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [tenantSearch, setTenantSearch] = useState('');

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['superadmin-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['pending-tenants-count'] }),
        queryClient.invalidateQueries({ queryKey: ['system-health'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant-activity'] }),
      ]);
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  const { data: stats } = useQuery({
    queryKey: ['superadmin-dashboard'],
    queryFn: () => api.get('/superadmin/legacy/dashboard/stats').then(r => r.data),
  });

  const { data: pendingTenants } = useQuery({
    queryKey: ['pending-tenants-count'],
    queryFn: () => api.get('/superadmin/legacy/pending-tenants').then(r => r.data),
  });

  const { data: health } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => api.get('/superadmin/legacy/health').then(r => r.data),
    refetchInterval: 30000,
  });

  const { data: tenantActivity, isLoading: tenantActivityLoading, error: tenantActivityError } = useQuery({
    queryKey: ['tenant-activity'],
    queryFn: () => api.get('/superadmin/legacy/dashboard/tenant-activity').then(r => r.data),
    refetchInterval: 30000,
  });

  const StatCard = ({ icon: Icon, label, value, sub, accent, to }: any) => {
    const gradient = STAT_GRADIENTS[accent] || STAT_GRADIENTS.blue;
    return (
      <Link
        to={to || '#'}
        className="group block rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5"
        style={{
          background: 'var(--card)',
          borderColor: 'var(--border-color)',
          boxShadow: 'var(--shadow-card)',
        }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-hover)')}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--shadow-card)')}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-heading)' }}>{value ?? '...'}</p>
            {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
          </div>
          <div className="p-2 rounded-xl shadow-sm" style={{ background: gradient }}>
            <Icon className="w-4 h-4 text-white" />
          </div>
        </div>
      </Link>
    );
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: 'active',
      pending: 'pending',
      suspended: 'inactive',
      rejected: 'rejected',
      trial: 'processed',
    };
    return `status-badge ${map[status] || 'draft'}`;
  };

  const filteredTenants = (tenantActivity?.tenants || []).filter((t: any) =>
    t.name.toLowerCase().includes(tenantSearch.toLowerCase())
  );

  const chartTooltipStyle = {
    borderRadius: '12px',
    border: '1px solid var(--border-color)',
    background: 'var(--card)',
    color: 'var(--text-primary)',
    fontSize: '12px',
    boxShadow: 'var(--shadow-card)',
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>HRMS.Pro! Control Hub</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>System-wide management and monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          {health && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{
                background: health.database?.status === 'connected' ? 'var(--success-bg)' : 'var(--danger-bg)',
                color: health.database?.status === 'connected' ? 'var(--success-text)' : 'var(--danger-text)',
              }}
            >
              {health.database?.status === 'connected' ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              DB {health.database?.latency_ms ? `${health.database.latency_ms}ms` : health.database?.status}
            </div>
          )}
          <button
            onClick={refreshAll}
            disabled={refreshing}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            title="Refresh dashboard"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={Building2} label="Total Tenants" value={stats?.total_tenants} accent="blue" sub={`${stats?.active_tenants ?? 0} active`} to="/superadmin/tenants" />
        <StatCard icon={CheckCircle} label="Active" value={stats?.active_tenants} accent="green" sub={`${stats?.total_tenants ?? 0} total`} to="/superadmin/tenants" />
        <StatCard icon={Activity} label="Suspended" value={stats?.suspended_tenants} accent="red" sub={`${stats?.trial_tenants ?? 0} on trial`} to="/superadmin/tenants" />
        <StatCard icon={Clock} label="Trial" value={stats?.trial_tenants} accent="amber" sub="On trial plan" to="/superadmin/tenants" />
        <StatCard icon={Zap} label="API Calls (24h)" value={stats?.api_calls_24h} accent="purple" sub="System-wide" to="/superadmin/audit-logs" />
        <StatCard icon={CreditCard} label="Revenue" value={stats?.revenue_this_month ? `Rs.${(stats.revenue_this_month).toLocaleString()}` : 'Rs.0'} accent="emerald" sub="This month" to="/superadmin/billing" />
      </div>

      {/* Tenant Activity + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card card-body lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Live Tenant Activity</h2>
            <div className="relative">
              <input
                placeholder="Search tenants..."
                value={tenantSearch}
                onChange={e => setTenantSearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  color: 'var(--text-primary)',
                }}
              />
              <Search className="absolute left-2.5 top-2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            </div>
          </div>
          <div className="overflow-x-auto table-container">
            {tenantActivityError ? (
              <div className="text-center py-8 text-sm" style={{ color: 'var(--danger-text)' }}>
                Failed to load tenant activity. {(tenantActivityError as any)?.response?.data?.detail || (tenantActivityError as any)?.message || 'Unknown error'}
              </div>
            ) : tenantActivityLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <table className="w-full">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Status</th>
                  <th>Employees</th>
                  <th>Last Login</th>
                  <th>API Calls (24h)</th>
                  <th>Recent Activity</th>
                </tr>
              </thead>
              <tbody>
                {filteredTenants.length > 0 ? (
                  filteredTenants.map((t: any) => (
                    <tr key={t.id}>
                      <td>
                        <Link to={`/superadmin/tenants/${t.id}`} className="text-sm font-medium hover:text-blue-600 transition-colors" style={{ color: 'var(--text-heading)' }}>{t.name}</Link>
                      </td>
                      <td><span className={statusBadge(t.status)}>{t.status.charAt(0).toUpperCase() + t.status.slice(1)}</span></td>
                      <td className="text-sm" style={{ color: 'var(--text-body)' }}>{t.employee_count ?? 0}</td>
                      <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {t.last_admin_login ? new Date(t.last_admin_login).toLocaleString() : '-'}
                      </td>
                      <td className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>{t.api_calls_24h ?? 0}</td>
                      <td>
                        <div className="space-y-1">
                          {t.recent_activity?.slice(0, 2).map((act: any, i: number) => (
                            <div key={i} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              <span className="font-medium" style={{ color: 'var(--text-body)' }}>{act.action}</span>
                              <span style={{ color: 'var(--text-tertiary)' }}> · {act.module}</span>
                              {act.timestamp && (
                                <span style={{ color: 'var(--text-tertiary)' }} className="ml-1">
                                  · {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>No tenants found</td></tr>
                )}
              </tbody>
            </table>
          )}
          </div>
        </div>

        <div className="card card-body">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>API Calls by Tenant (24h)</h2>
          <div className="overflow-x-auto pb-2">
            <div style={{ minWidth: Math.max(800, (tenantActivity?.tenant_chart?.length || 0) * 90) }}>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tenantActivity?.tenant_chart || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                    <XAxis
                      dataKey="tenant"
                      tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Bar dataKey="api_calls" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* API Trend */}
      <div className="card card-body">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>API Call Trend (Last 7 Days)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={tenantActivity?.trend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Line type="monotone" dataKey="api_calls" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pending Approvals + System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card card-body lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Pending Approvals</h2>
            <Link to="/superadmin/tenants" className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">View all</Link>
          </div>
          {pendingTenants?.length > 0 ? (
            <div className="space-y-3">
              {pendingTenants.slice(0, 5).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-xl border transition-colors"
                  style={{
                    background: 'var(--warning-bg)',
                    borderColor: 'var(--warning-border)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ background: 'var(--warning-icon-bg)' }}>
                      <Building2 className="w-4 h-4" style={{ color: 'var(--warning-text)' }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>{t.company_name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.admin_email} &middot; {t.industry || 'N/A'}</p>
                    </div>
                  </div>
                  <Link to="/superadmin/tenants" className="text-xs font-medium transition-colors"
                    style={{ color: 'var(--warning-text)' }}>Review &rarr;</Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-tertiary)' }}>No pending approvals</p>
          )}
        </div>

        <div className="card card-body">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>System Health</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <span className="text-sm" style={{ color: 'var(--text-body)' }}>Database</span>
              </div>
              <span className="status-badge" style={{
                background: health?.database?.status === 'connected' ? 'var(--success-bg)' : 'var(--danger-bg)',
                color: health?.database?.status === 'connected' ? 'var(--success-text)' : 'var(--danger-text)',
                borderColor: health?.database?.status === 'connected' ? 'var(--success-border)' : 'var(--danger-border)',
              }}>
                {health?.database?.status ?? 'checking...'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <span className="text-sm" style={{ color: 'var(--text-body)' }}>Redis</span>
              </div>
              <span className="status-badge" style={{
                background: health?.redis?.status === 'healthy' ? 'var(--success-bg)' : 'var(--muted-bg)',
                color: health?.redis?.status === 'healthy' ? 'var(--success-text)' : 'var(--text-tertiary)',
                borderColor: health?.redis?.status === 'healthy' ? 'var(--success-border)' : 'var(--border-color)',
              }}>{health?.redis?.status ?? 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <span className="text-sm" style={{ color: 'var(--text-body)' }}>API Calls (24h)</span>
              </div>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{health?.api_calls_today ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <span className="text-sm" style={{ color: 'var(--text-body)' }}>Active Users (24h)</span>
              </div>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{health?.active_users ?? 0}</span>
            </div>
          </div>
          <Link to="/superadmin/health" className="mt-4 block text-center text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">Full health dashboard &rarr;</Link>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card card-body">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { to: '/superadmin/tenants', icon: Building2, label: 'Manage Tenants', color: '#3B82F6', bg: 'rgba(59,130,246,0.08)' },
            { to: '/superadmin/billing', icon: CreditCard, label: 'Billing & Plans', color: '#10B981', bg: 'rgba(16,185,129,0.08)' },
            { to: '/superadmin/audit-logs', icon: Activity, label: 'Audit Logs', color: '#3B82F6', bg: 'rgba(59,130,246,0.08)' },
            { to: '/superadmin/feature-flags', icon: TrendingUp, label: 'Feature Flags', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
          ].map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="flex items-center gap-3 p-3 rounded-xl transition-all duration-200 hover:-translate-y-0.5"
              style={{ background: 'var(--surface)' }}
              onMouseEnter={e => { e.currentTarget.style.background = action.bg; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; }}
            >
              <action.icon className="w-5 h-5" style={{ color: action.color }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-body)' }}>{action.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
