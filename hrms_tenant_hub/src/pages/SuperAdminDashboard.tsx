import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Building2, Users, Activity, CreditCard, AlertCircle, CheckCircle,
  Clock, TrendingUp, ArrowUpRight, RefreshCw, Server, Database, HardDrive,
  UserCheck, Globe, Zap, BarChart3, Search, Loader2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import api from '../services/api';

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

  const StatCard = ({ icon: Icon, label, value, sub, color, to }: any) => (
    <Link to={to || '#'} className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value ?? '...'}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`p-1 rounded-lg ${color}`}>
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
      </div>
    </Link>
  );

  const statusBadge = (status: string) => {
    const styles: any = {
      active: 'bg-green-50 text-green-700 border-green-200',
      pending: 'bg-amber-50 text-amber-700 border-amber-200',
      suspended: 'bg-red-50 text-red-700 border-red-200',
      rejected: 'bg-gray-50 text-gray-500 border-gray-200',
      trial: 'bg-blue-50 text-blue-700 border-blue-200',
    };
    return `px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status] || 'bg-gray-50 text-gray-600'}`;
  };

  const filteredTenants = (tenantActivity?.tenants || []).filter((t: any) =>
    t.name.toLowerCase().includes(tenantSearch.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HRMS.Pro! Control Hub</h1>
          <p className="text-sm text-gray-500 mt-1">System-wide management and monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          {health && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
              health.database?.status === 'connected' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {health.database?.status === 'connected' ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              DB {health.database?.latency_ms ? `${health.database.latency_ms}ms` : health.database?.status}
            </div>
          )}
          <button
            onClick={refreshAll}
            disabled={refreshing}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="Refresh dashboard"
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 hover:text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={Building2} label="Total Tenants" value={stats?.total_tenants} color="bg-blue-600" sub={`${stats?.active_tenants ?? 0} active`} to="/superadmin/tenants" />
        <StatCard icon={CheckCircle} label="Active" value={stats?.active_tenants} color="bg-green-600" sub={`${stats?.total_tenants ?? 0} total`} to="/superadmin/tenants" />
        <StatCard icon={Activity} label="Suspended" value={stats?.suspended_tenants} color="bg-red-600" sub={`${stats?.trial_tenants ?? 0} on trial`} to="/superadmin/tenants" />
        <StatCard icon={Clock} label="Trial" value={stats?.trial_tenants} color="bg-amber-600" sub="On trial plan" to="/superadmin/tenants" />
        <StatCard icon={Zap} label="API Calls (24h)" value={stats?.api_calls_24h} color="bg-purple-600" sub="System-wide" to="/superadmin/audit-logs" />
        <StatCard icon={CreditCard} label="Revenue" value={stats?.revenue_this_month ? `Rs.${(stats.revenue_this_month).toLocaleString()}` : 'Rs.0'} color="bg-emerald-600" sub="This month" to="/superadmin/billing" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Live Tenant Activity</h2>
            <div className="relative">
              <input
                placeholder="Search tenants..."
                value={tenantSearch}
                onChange={e => setTenantSearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 w-64"
              />
              <Search className="absolute left-2.5 top-2 w-4 h-4 text-gray-400" />
            </div>
          </div>
          <div className="overflow-x-auto">
            {tenantActivityError ? (
              <div className="text-center py-8 text-sm text-red-500">
                Failed to load tenant activity. {(tenantActivityError as any)?.response?.data?.detail || (tenantActivityError as any)?.message || 'Unknown error'}
              </div>
            ) : tenantActivityLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Tenant</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Employees</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Last Login</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">API Calls (24h)</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Recent Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTenants.length > 0 ? (
                  filteredTenants.map((t: any) => (
                    <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-3 py-3">
                        <Link to={`/superadmin/tenants/${t.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">{t.name}</Link>
                      </td>
                      <td className="px-3 py-3"><span className={statusBadge(t.status)}>{t.status.charAt(0).toUpperCase() + t.status.slice(1)}</span></td>
                      <td className="px-3 py-3 text-sm text-gray-700">{t.employee_count ?? 0}</td>
                      <td className="px-3 py-3 text-sm text-gray-500">
                        {t.last_admin_login ? new Date(t.last_admin_login).toLocaleString() : '-'}
                      </td>
                      <td className="px-3 py-3 text-sm font-medium text-gray-900">{t.api_calls_24h ?? 0}</td>
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          {t.recent_activity?.slice(0, 2).map((act: any, i: number) => (
                            <div key={i} className="text-xs text-gray-500">
                              <span className="font-medium text-gray-700">{act.action}</span>
                              <span className="text-gray-400"> · {act.module}</span>
                              {act.timestamp && (
                                <span className="text-gray-400 ml-1">
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
                  <tr><td colSpan={6} className="text-center py-8 text-sm text-gray-400">No tenants found</td></tr>
                )}
              </tbody>
            </table>
          )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">API Calls by Tenant (24h)</h2>
          <div className="overflow-x-auto pb-2">
            <div style={{ minWidth: Math.max(800, (tenantActivity?.tenant_chart?.length || 0) * 90) }}>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tenantActivity?.tenant_chart || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="tenant"
                      tick={{ fontSize: 10 }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                    />
                    <Bar dataKey="api_calls" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">API Call Trend (Last 7 Days)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={tenantActivity?.trend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
              />
              <Line type="monotone" dataKey="api_calls" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Pending Approvals</h2>
            <Link to="/superadmin/tenants" className="text-sm text-blue-600 hover:text-blue-700 font-medium">View all</Link>
          </div>
          {pendingTenants?.length > 0 ? (
            <div className="space-y-3">
              {pendingTenants.slice(0, 5).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t.company_name}</p>
                      <p className="text-xs text-gray-500">{t.admin_email} &middot; {t.industry || 'N/A'}</p>
                    </div>
                  </div>
                  <Link to={`/superadmin/tenants`} className="text-xs text-amber-600 font-medium hover:text-amber-700">Review &rarr;</Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No pending approvals</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">System Health</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Server className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-600">Database</span></div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${health?.database?.status === 'connected' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {health?.database?.status ?? 'checking...'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><HardDrive className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-600">Redis</span></div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${health?.redis?.status === 'healthy' ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>{health?.redis?.status ?? 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-600">API Calls (24h)</span></div>
              <span className="text-sm font-semibold text-gray-900">{health?.api_calls_today ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-600">Active Users (24h)</span></div>
              <span className="text-sm font-semibold text-gray-900">{health?.active_users ?? 0}</span>
            </div>
          </div>
          <Link to="/superadmin/health" className="mt-4 block text-center text-sm text-blue-600 hover:text-blue-700 font-medium">Full health dashboard &rarr;</Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/superadmin/tenants" className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors"><Building2 className="w-5 h-5 text-blue-600" /><span className="text-sm font-medium text-gray-700">Manage Tenants</span></Link>
          <Link to="/superadmin/billing" className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors"><CreditCard className="w-5 h-5 text-green-600" /><span className="text-sm font-medium text-gray-700">Billing & Plans</span></Link>
          <Link to="/superadmin/audit-logs" className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors"><Activity className="w-5 h-5 text-blue-600" /><span className="text-sm font-medium text-gray-700">Audit Logs</span></Link>
          <Link to="/superadmin/feature-flags" className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors"><TrendingUp className="w-5 h-5 text-amber-600" /><span className="text-sm font-medium text-gray-700">Feature Flags</span></Link>
        </div>
      </div>
    </div>
  );
}
